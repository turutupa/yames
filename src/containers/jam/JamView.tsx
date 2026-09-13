import { useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { getTempoMarking } from "../../constants/metronome";
import { formBars } from "../../jam/forms";
import type { BarRange } from "../../jam/forms";
import {
  jamBand,
  jamGroove,
  jamGrooveFitsMeter,
  jamBassLine,
  jamKeysStyle,
  jamMix,
} from "../../jam/compile";
import { progressionEdit, withChordAt } from "../../jam/progression";
import { jamHarmony, nextChange } from "../../jam/display";
import { JAM_KEYS_STYLES } from "../../jam/keysline";
import { ChordPicker } from "./ChordPicker";
import { bandStatesForChorus, practiceConfigFrom } from "../../jam/practice";
import {
  chordName,
  displayTransposition,
  midiToName,
  noteName,
  parseChordName,
  spellingForKey,
  transposeChord,
} from "../../jam/harmony";
import { SCALE_NAMES_EN, scalesForChord, scalesForKey } from "../../jam/scales";
import { bassStyleForGroove } from "../../jam/bassline";
import type { Jam, JamFeel, JamIntensity, JamPracticeSettings } from "../../jam/types";
import type { Chord } from "../../jam/harmony";
import type { JamTakesState } from "../main-window/hooks/useJamTakes";
import type { Instrument } from "../../jam/chordShapes";
import type { BeatEvent } from "../../types";
import { FormTimeline } from "./FormTimeline";
import { NowBlock } from "./NowBlock";
import { BandLanes } from "./BandLanes";
import { PracticeRow, NO_PRACTICE } from "./PracticeRow";
import { TradeCue } from "./TradeCue";
import { Segmented } from "./Segmented";
import { PinnedShape } from "./PinnedShape";
import { ChordSheet, pinnedShapeOf } from "./ChordSheet";
import { JamSetupSheet } from "./JamSetupSheet";
import { GrooveEditorDrawer } from "./GrooveEditorDrawer";
import "../../styles/jam.css";

const FEELS: JamFeel[] = ["straight", "shuffle", "swing"];
const INTENSITIES: JamIntensity[] = ["soft", "normal", "loud"];

/** Which neck a player has, if any. Horns and voices get the chords only. */
function neckFor(instrument: string): Instrument | null {
  if (instrument === "bass") return "bass";
  if (instrument === "electric-guitar" || instrument === "acoustic-guitar") return "guitar";
  return null;
}

/** Everything the jam screen keeps that the record does not. */
export interface JamScreenState {
  fretboardOpen: boolean;
  toggleFretboard: () => void;
  sevenths: boolean;
  setSevenths: (next: boolean) => void;
  shapeIndex: number;
  setShapeIndex: (index: number) => void;
  /** The chord the chord sheet has expanded, or null. */
  pinnedChord: Chord | null;
  setPinnedChord: (chord: Chord | null) => void;
  editorOpen: boolean;
  setEditorOpen: (open: boolean) => void;
  editorPage: "bar" | "fill";
  setEditorPage: (page: "bar" | "fill") => void;
  /** "Edit changes" is on: a tap on the timeline picks a chord. */
  editingChords: boolean;
  setEditingChords: (on: boolean) => void;
  /** Which bar the chord picker is open on, or null. */
  editingBar: number | null;
  setEditingBar: (bar: number | null) => void;
  /** The setup sheet, docked to the right (A1). */
  setupOpen: boolean;
  setSetupOpen: (open: boolean) => void;
  /** The chord sheet, docked to the right (A8). */
  chordsOpen: boolean;
  setChordsOpen: (open: boolean) => void;
}

/** Moving through the form — the half of the screen that is not an edit. */
export interface JamPositionState {
  loop: BarRange | null;
  pendingJump: number | null;
  /**
   * The bar the form is on, or — while stopped — the one the next press of
   * play will start on: the pending jump, else the loop's first bar, else the
   * top. The section actions count from it and the timeline lights it.
   */
  currentBar: number;
  jumpTo: (bar: number) => void;
  toggleSectionLoop: (range: BarRange) => void;
}

interface JamViewProps {
  jam: Jam;
  /** Every jam in the library, so a vibe can start from one of yours (A9). */
  jams?: readonly Jam[];
  /** Every edit lands on the working copy, which recompiles and re-sends. */
  onEdit: (patch: Partial<Omit<Jam, "id" | "createdAt">>) => void;
  /** Load another jam — "one of yours" on a vibe's variation row. */
  onLoadJam?: (jam: Jam) => void;
  currentBeat: BeatEvent | null;
  isPlaying: boolean;
  /** What you play, so the band knows what not to be. */
  instrument: string;
  /** The band when the record has not been asked. */
  lineup: { drums: boolean; bass: boolean };
  /** Where the tempo trainer has got to, or null while it has not moved. */
  trainedBpm: number | null;
  /** Whether the mic is on, so the "you" lane says something true. */
  listening: boolean;
  /**
   * The jam's takes: the shelf, whether the build can record at all, and what
   * is playing back (JAM_MODE §4.4). They live in the setup sheet's MORE now.
   */
  takes: JamTakesState;
  onToggleTakes: (next: boolean) => void;
  /** Two bars of the current groove on a kit, through the engine (B7). */
  onPreviewKit?: (kit: string) => void;
  previewingKit?: string | null;
  screen: JamScreenState;
  /**
   * Where the form is being sent: the loop, the jump waiting for a bar line,
   * and the two ways to change them.
   */
  position: JamPositionState;
  /** The metronome's tempo controls, shared rather than built again. */
  tapActive: boolean;
  tapCount: number;
  tapPulse: boolean;
  editingBpm: boolean;
  bpmEditValue: string;
  setBpmEditValue: (v: string) => void;
  setEditingBpm: (v: boolean) => void;
  bpmInputRef: Ref<HTMLInputElement>;
  onTap: () => void;
  onBpmChange: (v: number) => void;
  onStartBpmEdit: () => void;
  onCommitBpmEdit: () => void;
}

/**
 * The Jam stage — the PLAYING screen (plans/JAM_UX_DECISIONS.md A1, A5).
 *
 * Five blocks and nothing else: the chord you are on with the next change and
 * two scales; the timeline; the tempo with feel and intensity beside it; the
 * band as one row with a mute each; the practice switches. Everything you set
 * once an hour is behind the Set up button in the context bar, and every
 * chord shape is behind Chords.
 *
 * This screen used to be twenty-three blocks in one scroll, with the groove
 * cards — a browsing tool — sitting in the middle of it and the timeline, the
 * headline of the whole mode, below the fold. The rule now is short enough to
 * hold: **on the playing screen, only the timeline and the current chord ever
 * change on their own.** A shape you pinned stays pinned; the neck is on the
 * chord sheet; nothing else moves while you play.
 */
export function JamView({
  jam,
  jams = [],
  onEdit,
  onLoadJam,
  currentBeat,
  isPlaying,
  instrument,
  lineup,
  trainedBpm,
  listening,
  takes,
  onToggleTakes,
  onPreviewKit,
  previewingKit = null,
  screen,
  position,
  tapActive,
  tapCount,
  tapPulse,
  editingBpm,
  bpmEditValue,
  setBpmEditValue,
  setEditingBpm,
  bpmInputRef,
  onTap,
  onBpmChange,
  onStartBpmEdit,
  onCommitBpmEdit,
}: JamViewProps) {
  const { t } = useTranslation();
  const shownBpm = trainedBpm ?? jam.bpm;
  const marking = getTempoMarking(shownBpm);

  /** The meter the jam actually runs in, feel and custom groove included. */
  const meter = useMemo(() => jamGroove(jam), [jam]);

  const bars = formBars(jam.form);
  const chorus = currentBeat?.chorus ?? 1;
  const formBar = currentBeat?.formBar ?? 0;
  const bandState = isPlaying ? (currentBeat?.bandState ?? "full") : "full";
  const band = jamBand(jam, lineup);
  const neck = neckFor(instrument);
  const practice = jam.practice ?? NO_PRACTICE;

  /**
   * The harmony, once, in the key the player READS.
   *
   * `jamHarmony` rather than a copy of it here: Zen draws the same chord from
   * the same function, and two answers to "what chord are we on" is two
   * chances for the stage and Zen to disagree.
   */
  const harmony = useMemo(() => jamHarmony(jam), [jam]);

  /** Which bar's chord is under your hands: the one playing, or bar one. */
  const at = isPlaying ? Math.min(Math.max(formBar, 0), bars - 1) : 0;
  const chord = harmony.chords[at] ?? null;

  /**
   * The next chord that is DIFFERENT, and how far off it is.
   *
   * Over a twelve-bar blues bars 1 to 4 are all the I, and "A7 in 1 bar" four
   * times running tells you nothing. "D7 in 4 bars" is the sentence a player
   * holds in their head.
   */
  const next = useMemo(
    () => nextChange(harmony.chords, at, harmony.key),
    [harmony, at],
  );

  const scales = useMemo(
    () => (chord ? scalesForChord(chord, harmony.key) : []),
    [chord, harmony.key],
  );

  /**
   * Two, not three.
   *
   * `scalesForChord` offers up to three and they are all defensible, but this
   * line sits beside the chord at the busiest moment there is. Two is what the
   * design board asks for and what a player reads without stopping.
   */
  const scaleLabels = useMemo(
    () =>
      scales.slice(0, 2).map((suggestion) => {
        // `noteName`, not `midiToName`: a suggestion's root is a PITCH CLASS,
        // and putting one through the MIDI speller names the note in the
        // octave below the piano ("A-1 mixolydian").
        const root = noteName(suggestion.root, spellingForKey(harmony.key));
        const name = t(suggestion.labelKey, { defaultValue: SCALE_NAMES_EN[suggestion.scale] });
        return `${root} ${name}`;
      }),
    [scales, harmony.key, t],
  );

  /**
   * The scale the chord SHEET draws on the neck: the key's, not the chord's.
   *
   * One box, chosen once from the key, so the fretboard stops swapping under
   * your hands every four bars (A8).
   */
  const keyScale = useMemo(() => scalesForKey(harmony.key)[0] ?? null, [harmony.key]);

  /** The chord names the timeline draws, or null when chords are off. */
  const timelineChords = useMemo(
    () => (jam.chords ? harmony.chords.map((c) => chordName(c, harmony.key)) : null),
    [jam.chords, harmony],
  );

  /** What the band will do on each bar of this chorus — drawn before it happens. */
  const bandStates = useMemo(
    () =>
      jam.practice
        ? bandStatesForChorus({
            chorus,
            formBars: bars,
            practice: practiceConfigFrom(jam.practice),
          })
        : null,
    [jam.practice, chorus, bars],
  );

  /** The bass's notes for the bar being played, for the band lane. */
  const bassNotes = useMemo(() => {
    if (!band.bass) return [];
    const line = jamBassLine(jam, at, lineup);
    if (!line) return [];
    const spelling = spellingForKey(harmony.key);
    // A rest is an empty cell, not a gap: the row is the bar, and eight cells
    // with three names in them reads as a rhythm.
    return line.pitches.map((midi) => (midi === 0 ? "" : midiToName(midi, spelling).slice(0, -1)));
  }, [jam, at, band.bass, lineup, harmony.key]);

  const grooveName = jam.customGroove
    ? jam.customGroove.name
    : t(`jam.groove.${jam.grooveId}`, { defaultValue: jam.grooveId });

  /**
   * Which bars carry a chord of the user's own.
   *
   * Drawn on the cell so "edit changes" shows what you have already changed
   * rather than making you tap thirty-two bars to find out.
   */
  const ownChords = useMemo(
    () => Array.from({ length: bars }, (_unused, i) => !!jam.progression?.[i]?.trim()),
    [jam.progression, bars],
  );

  /**
   * One bar's chord written down, or cleared.
   *
   * The picker speaks in the pitch the player READS, because that is what the
   * timeline beside it shows. The record is CONCERT, so the name is transposed
   * back on the way in and re-spelled from the concert key.
   */
  const setChordAt = (bar: number, name: string) => {
    const semitones = displayTransposition(jam.transposition ?? "concert");
    let stored = name;
    if (name) {
      const read = parseChordName(name);
      if (!read) return;
      stored = chordName(transposeChord(read, -semitones), harmony.concert);
    }
    onEdit({ progression: progressionEdit(withChordAt(jam.progression, bars, bar, stored), bars) });
  };

  const editingBar =
    screen.editingBar !== null && screen.editingBar >= 0 && screen.editingBar < bars
      ? screen.editingBar
      : null;

  /** The mix as the sliders show it, defaults filled in. */
  const mix = jamMix(jam);
  const grooveFits = jamGrooveFitsMeter(jam);
  const keysStyle = jamKeysStyle(jam);

  /** The grip pinned to the corner, matched back to a real shape. */
  const pinned = useMemo(() => pinnedShapeOf(jam, neck), [jam, neck]);

  /** What the drums row says it is playing — the kit, or your own folder. */
  const kitName = jam.customKit
    ? jam.customKit.name
    : t(`jam.kit.${jam.kit}`, { defaultValue: jam.kit });

  return (
    <div className="jam-view" data-sheet={screen.setupOpen ? "setup" : undefined}>
      <TradeCue bandState={bandState} isPlaying={isPlaying} />

      {/* ── 1 and 3. The chord, and the tempo beside it ─────────────────── */}
      <section className="jam-top">
        {jam.chords && chord ? (
          <NowBlock
            chord={chordName(chord, harmony.key)}
            next={next}
            scales={scaleLabels}
            fretboardOpen={screen.chordsOpen}
            onToggleFretboard={neck ? () => screen.setChordsOpen(!screen.chordsOpen) : null}
          />
        ) : (
          <div className="jam-now jam-now-quiet">
            <span className="stage-label">{t("jam.now.label")}</span>
            <span className="jam-now-name">{grooveName}</span>
          </div>
        )}

        <div className="jam-head-controls">
          <Segmented
            label={t("jam.feel.label")}
            value={jam.feel}
            options={FEELS.map((id) => ({ id, label: t(`jam.feel.${id}`) }))}
            onChange={(feel) => onEdit({ feel })}
          />
          <Segmented
            label={t("jam.intensity.label")}
            value={jam.intensity}
            options={INTENSITIES.map((id) => ({ id, label: t(`jam.intensity.${id}`) }))}
            onChange={(intensity) => onEdit({ intensity })}
            hint={t("jam.intensity.hint")}
          />
          <div className="tempo-block">
            <span className="stage-label">{t("metronome.tempo")}</span>
            <div className="bpm-display">
              {editingBpm ? (
                <input
                  ref={bpmInputRef}
                  type="text"
                  inputMode="numeric"
                  className="bpm-input"
                  value={bpmEditValue}
                  onChange={(e) => setBpmEditValue(e.target.value.replace(/\D/g, ""))}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={onCommitBpmEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCommitBpmEdit();
                    if (e.key === "Escape") setEditingBpm(false);
                  }}
                  autoFocus
                />
              ) : (
                /* `role` and `tabIndex` are load-bearing: the window-drag
                   handler asks whether a mousedown landed on a control, and a
                   bare span with an onClick answers no. See MetronomeView. */
                <span
                  className="bpm-input bpm-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={onStartBpmEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onStartBpmEdit();
                    }
                  }}
                >
                  {shownBpm}
                </span>
              )}
              <div className="tempo-units">
                <span className="tempo-unit">BPM</span>
                <span className="tempo-marking">
                  {trainedBpm === null ? marking : t("jam.practice.climbing", { from: jam.bpm })}
                </span>
              </div>
              <div className="tempo-controls">
                <button
                  className="bpm-btn"
                  aria-label={t("metronome.tempoDown")}
                  onClick={() => onBpmChange(jam.bpm - 5)}
                >
                  −
                </button>
                <button
                  className="bpm-btn"
                  aria-label={t("metronome.tempoUp")}
                  onClick={() => onBpmChange(jam.bpm + 5)}
                >
                  +
                </button>
                <button
                  className={`tap-btn ${tapActive ? "active" : ""} ${tapPulse ? "pulse" : ""}`}
                  onClick={onTap}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 13V4.5a1.5 1.5 0 0 1 3 0V12" />
                    <path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v8" />
                    <path d="M14 12V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5.5-4l-1.4-3.2a1.6 1.6 0 0 1 2.7-1.7L8 14" />
                  </svg>
                  {t("metronome.tap")}
                  {tapActive && tapCount >= 2 && (
                    <span className="tap-count">{t("metronome.tapCount", { count: tapCount })}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* The pinned grip. Top-right of the playing screen, and it stays
            there until it is unpinned — which is the whole point (A8). */}
        {pinned && (
          <PinnedShape
            shape={pinned.shape}
            name={chordName(pinned.chord, harmony.key)}
            onUnpin={() => onEdit({ pinnedShape: null })}
          />
        )}
      </section>

      {/* ── 2. The timeline ─────────────────────────────────────────────── */}
      <FormTimeline
        form={jam.form}
        fills={jam.fills}
        fillEvery={jam.fillEvery ?? 0}
        formBar={formBar}
        chorus={chorus}
        beat={currentBeat?.measureBeat ?? 0}
        beatsPerBar={meter.beatsPerBar}
        isPlaying={isPlaying}
        chords={timelineChords}
        bandStates={bandStates}
        loop={position.loop}
        pendingJump={position.pendingJump}
        startBar={position.currentBar}
        onJumpTo={position.jumpTo}
        onToggleSectionLoop={position.toggleSectionLoop}
        editingChords={screen.editingChords}
        editingBar={editingBar}
        // The changes are only editable when the timeline is showing them. A
        // chord picker on a timeline of bare bar numbers would write music
        // nothing on the screen displays.
        onEditChord={jam.chords ? (bar: number) => screen.setEditingBar(bar) : null}
        ownChords={ownChords}
      />

      {jam.chords && editingBar !== null && (
        <ChordPicker
          bar={editingBar}
          current={harmony.chords[editingBar] ?? null}
          followsForm={!ownChords[editingBar]}
          playedKey={harmony.key}
          onPick={(name) => setChordAt(editingBar, name)}
          onClose={() => screen.setEditingBar(null)}
        />
      )}

      {/* ── 4. The band, one row ────────────────────────────────────────── */}
      <BandLanes
        lanes={[
          {
            id: "drums",
            on: band.drums,
            detail: grooveFits
              ? `${grooveName} · ${kitName}`
              : // The card in the sheet still says Shuffle, and it is still
                // selected; this row says what is actually being played.
                `${t("jam.groove.rule")} · ${kitName}`,
            volume: mix.drums,
          },
          {
            id: "bass",
            on: band.bass,
            detail: t(`jam.bassStyle.${bassStyleForGroove(jam.customGroove ? "" : jam.grooveId)}`),
            notes: bassNotes,
            volume: mix.bass,
          },
          {
            id: "keys",
            on: !!band.keys,
            detail: t(`jam.keysStyle.${keysStyle}`),
            volume: mix.keys,
            // The comping style belongs to this player and to nobody else, so
            // it lives on their row — you change it while listening to it,
            // which is the only way to choose between a pad and a stab.
            extra: (
              <span className="jam-keys-style" role="group" aria-label={t("jam.keysStyle.label")}>
                {JAM_KEYS_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    className={`jam-keys-style-btn${keysStyle === style ? " active" : ""}`}
                    aria-pressed={keysStyle === style}
                    disabled={!band.keys}
                    onClick={() => onEdit({ keysStyle: style })}
                  >
                    {t(`jam.keysStyle.${style}Short`)}
                  </button>
                ))}
              </span>
            ),
          },
        ]}
        onToggle={(id) =>
          onEdit({
            band: {
              drums: band.drums,
              bass: band.bass,
              keys: !!band.keys,
              [id]: id === "keys" ? !band.keys : !band[id],
            },
          })
        }
        onVolume={(id, volume) => onEdit({ mix: { ...mix, [id]: volume } })}
        bandState={bandState}
        isPlaying={isPlaying}
        youLabel={t("jam.band.youPlay", {
          instrument: t(`instrument.${instrument}`, { defaultValue: instrument }),
        })}
        listening={listening}
      />

      {/* ── 5. The practice switches ────────────────────────────────────── */}
      <PracticeRow
        value={practice}
        onChange={(nextPractice: JamPracticeSettings) => onEdit({ practice: nextPractice })}
        takes={!!jam.takes}
        // Withheld on a build whose engine has no take commands, so the row
        // does not offer a switch with nothing behind it.
        onTakes={takes.available === false ? undefined : onToggleTakes}
      />

      {/* ── The two sheets ──────────────────────────────────────────────── */}
      {screen.setupOpen && (
        <JamSetupSheet
          jam={jam}
          jams={jams}
          onEdit={onEdit}
          onLoadJam={(next) => onLoadJam?.(next)}
          onClose={() => screen.setSetupOpen(false)}
          instrument={instrument}
          lineup={lineup}
          onPreviewKit={(kit) => onPreviewKit?.(kit)}
          previewingKit={previewingKit}
          onOpenEditor={() => screen.setEditorOpen(true)}
          editingChords={screen.editingChords}
          onEditingChords={(on) => {
            screen.setEditingChords(on);
            // Leaving the mode closes the picker: a panel left open over a
            // timeline that has gone back to jumping points at the wrong thing.
            if (!on) screen.setEditingBar(null);
          }}
          takes={takes}
          onToggleTakes={onToggleTakes}
        />
      )}

      {screen.chordsOpen && (
        <ChordSheet
          jam={jam}
          onEdit={onEdit}
          onClose={() => screen.setChordsOpen(false)}
          playedKey={harmony.key}
          current={chord}
          scale={keyScale}
          instrument={neck}
          expanded={screen.pinnedChord}
          onExpand={screen.setPinnedChord}
          shapeIndex={screen.shapeIndex}
          onShapeIndex={screen.setShapeIndex}
          sevenths={screen.sevenths}
          onSevenths={screen.setSevenths}
          fretboardOpen={screen.fretboardOpen}
          onFretboard={() => screen.toggleFretboard()}
        />
      )}

      <GrooveEditorDrawer
        jam={jam}
        onEdit={onEdit}
        open={screen.editorOpen}
        onClose={() => screen.setEditorOpen(false)}
        page={screen.editorPage}
        onPageChange={screen.setEditorPage}
        currentBeat={currentBeat}
        isPlaying={isPlaying}
      />
    </div>
  );
}
