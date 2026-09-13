import { useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { getTempoMarking } from "../../constants/metronome";
import { GROOVES } from "../../jam/grooves";
import { carryCountIn } from "../../jam/jams";
import { JAM_FORM_KINDS, clampFormBars, formBars } from "../../jam/forms";
import type { BarRange } from "../../jam/forms";
import {
  jamBand,
  jamGroove,
  jamGrooveFitsMeter,
  jamKey,
  jamBassLine,
  jamKeysStyle,
  jamMix,
  jamWrittenGroove,
} from "../../jam/compile";
import { progressionEdit, withChordAt } from "../../jam/progression";
import { jamHarmony, nextChange } from "../../jam/display";
import { JAM_KEYS_STYLES } from "../../jam/keysline";
import { ChordPicker } from "./ChordPicker";
import { bandStatesForChorus, practiceConfigFrom } from "../../jam/practice";
import {
  chordName,
  displayTransposition,
  keyName,
  midiToName,
  noteName,
  parseChordName,
  spellingForKey,
  transposeChord,
} from "../../jam/harmony";
import { SCALE_NAMES_EN, scalesForChord } from "../../jam/scales";
import { bassStyleForGroove } from "../../jam/bassline";
import { JAM_MAX_COUNT_IN, JAM_MAX_FORM_BARS } from "../../jam/types";
import type {
  Jam,
  JamFeel,
  JamFormKind,
  JamIntensity,
  JamPracticeSettings,
} from "../../jam/types";
import type { Chord, TranspositionOption } from "../../jam/harmony";
import type { JamTakesState } from "../main-window/hooks/useJamTakes";
import type { Instrument } from "../../jam/chordShapes";
import type { BeatEvent } from "../../types";
import { GrooveGlyph } from "./GrooveGlyph";
import { FormTimeline } from "./FormTimeline";
import { NowBlock } from "./NowBlock";
import { ChordsPanel } from "./ChordsPanel";
import { BandLanes } from "./BandLanes";
import { PracticeRow, NO_PRACTICE } from "./PracticeRow";
import { TakesSection } from "./TakesSection";
import { TradeCue } from "./TradeCue";
import { JamSetup } from "./JamSetup";
import { GrooveEditorDrawer } from "./GrooveEditorDrawer";
import "../../styles/jam.css";

const FEELS: JamFeel[] = ["straight", "shuffle", "swing"];
const INTENSITIES: JamIntensity[] = ["soft", "normal", "loud"];

/**
 * The Fills control, as the four things a player would say out loud.
 *
 * They are two fields on the record — `fills` and `fillEvery` — because the
 * engine needs them apart: `fills` is what the crash on the one hangs off as
 * well, and `fillEvery` is a count. On screen they are one control, because
 * "off, or every eight bars" is one decision.
 */
const FILL_CHOICES = ["off", "chorus", "every4", "every8"] as const;
type FillChoice = (typeof FILL_CHOICES)[number];

/** Which of the four a record is showing. */
export function fillsChoiceOf(jam: Pick<Jam, "fills" | "fillEvery">): FillChoice {
  if (!jam.fills) return "off";
  const every = Math.trunc(jam.fillEvery ?? 0);
  if (every === 4) return "every4";
  if (every === 8) return "every8";
  return "chorus";
}

/** What picking one writes back. */
export function fillsEditFor(choice: FillChoice): { fills: boolean; fillEvery: number } {
  switch (choice) {
    case "off":
      // `fillEvery` is zeroed rather than left where it was: a record that
      // says "no fills, every four bars" is a record two readers can disagree
      // about, and one of them is the engine.
      return { fills: false, fillEvery: 0 };
    case "every4":
      return { fills: true, fillEvery: 4 };
    case "every8":
      return { fills: true, fillEvery: 8 };
    case "chorus":
      return { fills: true, fillEvery: 0 };
  }
}

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
  /** Every edit lands on the working copy, which recompiles and re-sends. */
  onEdit: (patch: Partial<Omit<Jam, "id" | "createdAt">>) => void;
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
  /** Whether a voice is installed, so the cues toggle can say something true. */
  voiceReady: boolean;
  /**
   * The jam's takes: the shelf, whether the build can record at all, and what
   * is playing back (JAM_MODE §4.4).
   *
   * Passed in whole rather than assembled here because recording outlives the
   * screen — a take runs while you are on the metronome tab looking something
   * up, and a hook that lived inside this component would stop the moment the
   * component unmounted.
   */
  takes: JamTakesState;
  /**
   * Recording turned on or off for this jam. Not an `onEdit` of `takes`
   * directly: the first time it is turned on there is a dialog to show, and
   * the answer to it belongs to the window rather than to this screen.
   */
  onToggleTakes: (next: boolean) => void;
  screen: JamScreenState;
  /**
   * Where the form is being sent: the loop, the jump waiting for a bar line,
   * and the two ways to change them. From `useJamSession`, which owns the
   * traffic — the timeline asks, it does not send.
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
 * A segmented control, in the stage's existing vocabulary.
 *
 * The same three-in-a-trough shape as the metronome's accent control, which is
 * what the setup board draws for feel and intensity too — so it is that
 * component's stylesheet rather than a second one that looks nearly like it.
 */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  /** A sentence on hover, for a control whose four words are not the whole story. */
  hint?: string;
}) {
  return (
    <div className="accent-control jam-segmented" role="group" aria-label={label} title={hint}>
      <span className="stage-label accent-label">{label}</span>
      <div className="accent-options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`accent-option${value === option.id ? " active" : ""}`}
            aria-pressed={value === option.id}
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The Jam stage: what the band plays, where you are in it, and what to play.
 *
 * Top to bottom it is the order you read it in while playing, not the order
 * you set it up in: the chord you are on, the chords of the key under it, the
 * form, the band, the practice tools, and the setup — grooves, kit, key — last,
 * because you touch that once and then leave it alone for an hour.
 *
 * Two rules hold this screen together. **One chord at a time**: the NOW block
 * is the largest thing here, and everything harmonic below it is about that
 * one chord, never a sheet of every chord there is (JAM_MODE §4.3). And
 * **every control writes to the jam record, nothing writes to the engine**:
 * `useJamSession` owns the traffic, because the meter and the table have to
 * leave together and in order.
 */
export function JamView({
  jam,
  onEdit,
  currentBeat,
  isPlaying,
  instrument,
  lineup,
  trainedBpm,
  listening,
  voiceReady,
  takes,
  onToggleTakes,
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

  /**
   * Count-in, in bars of the jam's own meter.
   *
   * Beats are what the engine takes and bars are what a player counts, so the
   * options are bars and the values are beats. Two bars of 6/8 is twelve
   * beats, which is past `arm_count_in`'s limit of eight — so that option is
   * not offered there rather than offered and quietly clamped to something
   * that is not two bars.
   */
  const countInOptions = useMemo(() => {
    const options = [{ id: "0", label: t("jam.countIn.none") }];
    for (const bars of [1, 2]) {
      const beats = bars * meter.beatsPerBar;
      if (beats > JAM_MAX_COUNT_IN) continue;
      options.push({ id: String(beats), label: t("jam.countIn.bars", { count: bars }) });
    }
    return options;
  }, [t, meter.beatsPerBar]);

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
   * Transposition is a shift of the whole picture: shift the key and every
   * chord in it and the scales come out shifted too, with no second code path
   * and nothing left in concert pitch to contradict it. A Bb player sees a Bb
   * player's chart, including the grips — which is what they asked for by
   * choosing Bb.
   */
  // `jamHarmony` rather than a copy of it here: Zen draws the same chord from
  // the same function, and two answers to "what chord are we on" is two
  // chances for the stage and Zen to disagree.
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
   * design board asks for and what a player reads without stopping; the third
   * is a tap away in the strip and on the neck below.
   */
  const scaleLabels = useMemo(
    () =>
      scales.slice(0, 2).map((suggestion) => {
        // `noteName`, not `midiToName`: a suggestion's root is a PITCH CLASS,
        // and putting one through the MIDI speller names the note in the
        // octave below the piano ("A-1 mixolydian").
        const root = noteName(suggestion.root, spellingForKey(harmony.key));
        // Not lower-cased on the way out: the locale files already write each
        // scale the way that language writes it, and German capitalises its
        // nouns whether or not English happens to.
        const name = t(suggestion.labelKey, { defaultValue: SCALE_NAMES_EN[suggestion.scale] });
        return `${root} ${name}`;
      }),
    [scales, harmony.key, t],
  );

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

  const fillsChoice = fillsChoiceOf(jam);

  const grooveName = jam.customGroove
    ? jam.customGroove.name
    : t(`jam.groove.${jam.grooveId}`, { defaultValue: jam.grooveId });

  /**
   * Which bars carry a chord of the user's own.
   *
   * Drawn on the cell so "edit changes" shows what you have already changed
   * rather than making you tap thirty-two bars to find out. A bar that is
   * still the form's looks like every other bar, which is right: most of them
   * are, and marking those would mark everything.
   */
  const ownChords = useMemo(
    () => Array.from({ length: bars }, (_unused, i) => !!jam.progression?.[i]?.trim()),
    [jam.progression, bars],
  );

  /**
   * One bar's chord written down, or cleared.
   *
   * The picker speaks in the pitch the player READS, because that is what the
   * timeline beside it shows — a Bb player picking "D7" means the D7 on their
   * part. The record is CONCERT, so the name is transposed back on the way in
   * and re-spelled from the concert key. Without this a Bb jam would move up
   * a tone every time you edited a bar and looked at it again.
   */
  const setChordAt = (bar: number, name: string) => {
    const semitones = displayTransposition(jam.transposition ?? "concert");
    let stored = name;
    if (name) {
      const read = parseChordName(name);
      // Unreadable is impossible from the picker's own buttons, but the guard
      // is what keeps a bad name out of the record rather than into it.
      if (!read) return;
      stored = chordName(transposeChord(read, -semitones), harmony.concert);
    }
    onEdit({ progression: progressionEdit(withChordAt(jam.progression, bars, bar, stored), bars) });
  };

  const editingBar =
    screen.editingBar !== null && screen.editingBar >= 0 && screen.editingBar < bars
      ? screen.editingBar
      : null;

  /**
   * A change to the form, with the changes brought along.
   *
   * The progression is exactly `form.bars` long or it is wrong, and the form
   * is the thing that changes its length — so the one goes with the other
   * through here rather than being refitted by whoever remembers to. The rule
   * itself (new bars are "as the form", the tail is dropped) lives in
   * `progression.ts` and is documented there.
   */
  const editForm = (next: { kind: JamFormKind; bars: number }) => {
    const total = formBars(next);
    onEdit({
      form: next,
      progression: progressionEdit(jam.progression, total),
    });
    // A picker open on a bar the form no longer has has nothing to edit.
    if (screen.editingBar !== null && screen.editingBar >= total) screen.setEditingBar(null);
  };

  /** The mix as the sliders show it, defaults filled in. */
  const mix = jamMix(jam);
  const written = jamWrittenGroove(jam);
  const grooveFits = jamGrooveFitsMeter(jam);
  const keysStyle = jamKeysStyle(jam);

  return (
    <div className="jam-view">
      <TradeCue bandState={bandState} isPlaying={isPlaying} />

      {/* Its own row, above the tempo. The chord is the largest thing on the
          screen and the one a player reads mid-chorus; sharing a line with the
          tempo and the feel controls had all three fighting for the width at
          every window size, and the chord is the one that must not lose. */}
      {jam.chords && chord ? (
        <NowBlock
          chord={chordName(chord, harmony.key)}
          next={next}
          scales={scaleLabels}
          fretboardOpen={screen.fretboardOpen}
          onToggleFretboard={neck ? screen.toggleFretboard : null}
        />
      ) : null}

      <section className="bpm-section jam-head">
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
          />
        </div>
      </section>

      {jam.chords && (
        <ChordsPanel
          playedKey={harmony.key}
          current={chord}
          scale={scales[0] ?? null}
          instrument={neck}
          fretboardOpen={screen.fretboardOpen}
          pinned={screen.pinnedChord}
          onPin={screen.setPinnedChord}
          shapeIndex={screen.shapeIndex}
          onShapeIndex={screen.setShapeIndex}
          sevenths={screen.sevenths}
          onSevenths={screen.setSevenths}
        />
      )}

      <div className="stage-divider" aria-hidden="true" />

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
        // The changes are only editable when the timeline is showing them.
        // A chord picker on a timeline of bare bar numbers would write
        // music nothing on the screen displays.
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

      <BandLanes
        lanes={[
          {
            id: "drums",
            on: band.drums,
            detail: grooveFits
              ? `${grooveName} · ${t(`jam.kit.${jam.kit}`, { defaultValue: jam.kit })}`
              : // The card above still says Shuffle, and it is still selected;
                // this row says what is actually being played.
                `${t("jam.groove.rule")} · ${t(`jam.kit.${jam.kit}`, { defaultValue: jam.kit })}`,
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
            // it lives on their row rather than in the setup block — you
            // change it while listening to it, which is the only way to
            // choose between a pad and a stab.
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

      <PracticeRow
        value={practice}
        onChange={(next: JamPracticeSettings) => onEdit({ practice: next })}
        takes={!!jam.takes}
        // Withheld on a build whose engine has no take commands, so the row
        // does not offer a switch with nothing behind it. `null` is "we have
        // not asked yet" and the switch stays, because it almost always will.
        onTakes={takes.available === false ? undefined : onToggleTakes}
      />

      {/* Below the band, which is where listening back belongs: it is what
          you do between choruses, not while playing. */}
      <TakesSection
        available={takes.available}
        takes={takes.takes}
        recording={takes.recording}
        dirBytes={takes.dirBytes}
        playingId={takes.playingId}
        onPlay={takes.play}
        onStop={takes.stopPlayback}
        onDelete={takes.remove}
      />

      <div className="stage-divider" aria-hidden="true" />

      <section className="jam-section">
        <div className="jam-section-head">
          <span className="stage-label">{t("jam.groove.label")}</span>
          {/* Only once the groove IS yours. Before that the ninth card below
              is the door, and two controls a hand's width apart both saying
              "make this one yours" is one control too many. */}
          {jam.customGroove && (
            <button
              type="button"
              className="jam-link"
              onClick={() => screen.setEditorOpen(true)}
            >
              {t("jam.editor.edit")}
            </button>
          )}
        </div>
        <div className="jam-cards jam-cards-groove">
          {GROOVES.map((groove) => (
            <button
              key={groove.id}
              type="button"
              className={`sub-row-btn jam-card${
                !jam.customGroove && jam.grooveId === groove.id ? " active" : ""
              }`}
              aria-pressed={!jam.customGroove && jam.grooveId === groove.id}
              onClick={() =>
                onEdit({
                  grooveId: groove.id,
                  // A groove carries its own meter, so the count-in has to
                  // follow it. The setting is BARS and the engine takes beats:
                  // one bar of a waltz is three beats, not four, and a
                  // count-in left in the old meter lands you on beat two of
                  // the first bar. Two bars stay two bars where they fit.
                  countIn: carryCountIn(jam.countIn, meter.beatsPerBar, groove.beatsPerBar),
                  // Picking a preset is picking a preset. The groove you drew
                  // is still on the record until you pick one.
                  customGroove: undefined,
                })
              }
            >
              <GrooveGlyph groove={groove} />
              <span className="sub-row-label">{t(`jam.groove.${groove.id}`)}</span>
            </button>
          ))}

          {/* The ninth card. A groove of your own is one of the choices, not a
              mode you have to find — which is the difference between an editor
              people use and one they read about in a changelog. */}
          <button
            type="button"
            className={`sub-row-btn jam-card jam-card-mine${jam.customGroove ? " active" : ""}`}
            aria-pressed={!!jam.customGroove}
            onClick={() => screen.setEditorOpen(true)}
          >
            <GrooveGlyph groove={meter} />
            <span className="sub-row-label">
              {jam.customGroove ? jam.customGroove.name : t("jam.editor.makeYourOwn")}
            </span>
          </button>
        </div>
      </section>

      <div className="stage-divider" aria-hidden="true" />

      <section className="jam-section">
        <div className="jam-section-head">
          <span className="stage-label">{t("jam.form.label")}</span>
          {/* The way in to your own changes. Only where the timeline is
              showing chords, because the mode's whole affordance is tapping
              the chord on the cell — with chords off there is nothing on the
              cell to tap. A long press on a cell does the same thing without
              the mode, for the one bar you want to fix mid-tune. */}
          {jam.chords && (
            <button
              type="button"
              className={`jam-link${screen.editingChords ? " active" : ""}`}
              aria-pressed={screen.editingChords}
              title={t("jam.changes.hint")}
              onClick={() => {
                const next = !screen.editingChords;
                screen.setEditingChords(next);
                // Leaving the mode closes the panel: a picker left open over
                // a timeline that has gone back to jumping is a control
                // pointing at the wrong thing.
                if (!next) screen.setEditingBar(null);
              }}
            >
              {screen.editingChords ? t("jam.changes.done") : t("jam.changes.edit")}
            </button>
          )}
        </div>
        <div className="jam-cards jam-cards-form">
          {JAM_FORM_KINDS.map((kind: JamFormKind) => (
            <button
              key={kind}
              type="button"
              className={`sub-row-btn jam-card jam-card-form${jam.form.kind === kind ? " active" : ""}`}
              aria-pressed={jam.form.kind === kind}
              onClick={() =>
                editForm({
                  kind,
                  // Switching to "your own" starts from the length you were
                  // already looking at, so the timeline does not jump.
                  bars: kind === "custom" ? bars : formBars({ kind, bars }),
                })
              }
            >
              <span className="jam-card-title">{t(`jam.form.${kind}`)}</span>
              <span className="jam-card-hint">{t(`jam.form.${kind}Hint`)}</span>
            </button>
          ))}
        </div>

        <div className="jam-form-row">
          {jam.form.kind === "custom" && (
            <div className="jam-bars">
              <span className="stage-label">{t("jam.form.barsLabel")}</span>
              <div className="beat-stepper" role="group" aria-label={t("jam.form.barsLabel")}>
                <button
                  className="beat-stepper-btn"
                  aria-label={t("jam.form.fewerBars")}
                  disabled={bars <= 1}
                  onClick={() => editForm({ kind: "custom", bars: clampFormBars(bars - 1) })}
                >
                  −
                </button>
                <span className="beat-stepper-value">{bars}</span>
                <button
                  className="beat-stepper-btn"
                  aria-label={t("jam.form.moreBars")}
                  disabled={bars >= JAM_MAX_FORM_BARS}
                  onClick={() => editForm({ kind: "custom", bars: clampFormBars(bars + 1) })}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <Segmented
            label={t("jam.countIn.label")}
            value={String(jam.countIn)}
            options={countInOptions}
            onChange={(beats) => onEdit({ countIn: Number(beats) })}
          />

          {/* Fills used to be a switch. It is a choice now because "off" and
              "at the end of the chorus" are two different musics and the
              switch could only say one of them — and because a fill every
              four bars is what a drummer does over an eight-bar loop, which
              was unreachable while the only fill was the last bar of the
              form. Two fields on the record, one control: `fills` is whether
              there are any, `fillEvery` is how often on top of the end. */}
          <Segmented
            label={t("jam.fills.label")}
            value={fillsChoice}
            options={FILL_CHOICES.map((id) => ({ id, label: t(`jam.fills.${id}`) }))}
            onChange={(choice) => onEdit(fillsEditFor(choice))}
            hint={t("jam.fills.hint")}
          />
        </div>
      </section>

      <div className="stage-divider" aria-hidden="true" />

      <JamSetup
        jamKey={jamKey(jam)}
        onKey={(key) => onEdit({ key: keyName(key) })}
        kit={jam.kit}
        onKit={(kit) => onEdit({ kit })}
        transposition={jam.transposition ?? "concert"}
        onTransposition={(transposition: TranspositionOption) => onEdit({ transposition })}
        chords={!!jam.chords}
        onChords={(on) => onEdit({ chords: on })}
        meter={jam.meter ?? null}
        grooveMeter={{ beatsPerBar: written.beatsPerBar, ticksPerBeat: written.ticksPerBeat }}
        grooveName={grooveName}
        grooveFits={grooveFits}
        onMeter={(next) =>
          onEdit({
            meter: next ?? undefined,
            // The count-in is a number of BARS wearing a number of beats, so
            // a new meter has to carry it exactly as a new groove does — a
            // four-beat count into a bar of seven lands you nowhere.
            countIn: carryCountIn(
              jam.countIn,
              meter.beatsPerBar,
              next ? next.beatGroups.reduce((sum, n) => sum + n, 0) : written.beatsPerBar,
            ),
          })
        }
        countInSound={jam.countInSound ?? "beep"}
        onCountInSound={(countInSound) => onEdit({ countInSound })}
        cues={!!jam.cues}
        onCues={(on) => onEdit({ cues: on })}
        voiceReady={voiceReady}
      />

      {/* JAM_MODE §3, principle 5. A band is louder than a click, and through
          speakers its hits land on the grid and the mic scores them as your
          notes. The screen says so rather than letting a flattered score go
          unexplained. */}
      <p className="jam-honest">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <rect x="2.5" y="13.5" width="4.5" height="7" rx="2" />
          <rect x="17" y="13.5" width="4.5" height="7" rx="2" />
        </svg>
        {t("jam.headphones")}
      </p>

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
