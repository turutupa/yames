import { useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { getTempoMarking } from "../../constants/metronome";
import { formBars } from "../../jam/forms";
import type { BarRange } from "../../jam/forms";
import {
  jamBand,
  jamGroove,
  jamGrooveFitsMeter,
  jamBassFigure,
  jamBassLine,
  jamKeysStyle,
  jamMix,
  percussionVoices,
} from "../../jam/compile";
import { grooveById, groovesInFamily } from "../../jam/grooves";
import { carryCountIn } from "../../jam/jams";
import { progressionEdit, withChordAt } from "../../jam/progression";
import { jamHarmony, nextChange } from "../../jam/display";
import { JAM_KEYS_STYLES_ALL } from "../../jam/keysFigures";
import { JAM_BASS_STYLES } from "../../jam/bassFigures";
import { JamSelect } from "./JamSelect";
import { KeyPicker } from "./KeyPicker";
import { ChordPicker } from "./ChordPicker";
import { bandStatesForChorus, practiceConfigFrom } from "../../jam/practice";
import { momentsForChorus } from "../../jam/arrangement";
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
import { ChordSheet, cheatSheetTitle, pinnedShapeOf } from "./ChordSheet";
import type { CheatTab, ChordPage } from "./ChordSheet";
import type { ChordFlavour } from "../../jam/cheatSheet";
import { JamSetupSheet, setupSheetSubtitle } from "./JamSetupSheet";
import type { VibePreviewMark } from "./VibePicker";
import { JamSheet } from "./JamSheet";
import { GrooveEditorDrawer } from "./GrooveEditorDrawer";
import { MotionProvider, Presence, useLastPresent } from "../../components/Presence";
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
  /**
   * Which half of the cheat sheet is up: its chords or its scales.
   *
   * It was a `fretboardOpen` boolean, because the neck was a thing you
   * switched on at the foot of the chords page rather than a half of the
   * sheet in its own right.
   */
  cheatTab: CheatTab;
  setCheatTab: (tab: CheatTab) => void;
  /**
   * The chord sheet's two pages and the four readings of the first of them
   * (JAM_UX_DECISIONS A10).
   *
   * `chordFlavour` replaced a plain `sevenths` boolean: Triads and 7ths were
   * two of four once Colours and Power joined them. It opens on whatever the
   * jam's vibe suggests and then stays where you put it for the rest of the
   * screen session — a rock player who went to Triads meant it.
   */
  chordPage: ChordPage;
  setChordPage: (page: ChordPage) => void;
  chordFlavour: ChordFlavour;
  setChordFlavour: (flavour: ChordFlavour) => void;
  /** Hide the chords that do not fit the key. Off by default. */
  onlyInKey: boolean;
  setOnlyInKey: (on: boolean) => void;
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
  /** Two bars of a whole vibe, through the same door (JAM_KILLER A4). */
  onPreviewVibe?: ((vibeId: string, variationId?: string) => void) | null;
  onStopPreview?: (() => void) | null;
  previewingVibe?: VibePreviewMark | null;
  /** True while the engine is refusing a folder of your own samples (B3). */
  customKitRefused?: boolean;
  screen: JamScreenState;
  /**
   * Where the form is being sent: the loop, the jump waiting for a bar line,
   * and the two ways to change them.
   */
  position: JamPositionState;
  /**
   * Whether the app may animate, and how (JAM_UX_DECISIONS A11).
   *
   * The same three answers `ViewTransition` is given, threaded down from the
   * window for the same reason: the sheets, the drawer and the shapes section
   * all arrive, and a jam whose sheets slid while the rest of the app popped
   * would read as a different app. `viewTransitions` is the preference from
   * Settings → Appearance, whose literal "off" turns motion off here too.
   */
  themeId?: string;
  viewTransitions?: string;
  animationStyle?: string;
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
/**
 * "shaker and congas" — a list joined the way this language joins lists.
 *
 * `Intl.ListFormat` is in every browser this app ships to, and it is not in
 * the ES2020 lib the project compiles against, so it is reached through a
 * narrow declaration here rather than by widening `lib` for the whole repo for
 * the sake of one line of one row. A runtime without it gets commas, which is
 * wrong in a few of the fifteen and readable in all of them.
 */
type ListFormatCtor = new (
  locale?: string,
  options?: { type?: "conjunction" | "disjunction" },
) => { format(list: string[]): string };

function joinNames(names: string[], language: string): string {
  const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;
  if (!ListFormat) return names.join(", ");
  try {
    return new ListFormat(language, { type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

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
  onPreviewVibe = null,
  onStopPreview = null,
  previewingVibe = null,
  customKitRefused = false,
  screen,
  position,
  themeId,
  viewTransitions,
  animationStyle,
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
  // `i18n` for the band row's list formatter: "shaker and congas" is a
  // sentence, and which language it is in decides where the "and" goes.
  const { t, i18n } = useTranslation();
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
   * The scales the chord SHEET can draw on the neck: the key's, not the
   * chord's.
   *
   * Chosen from the key and not from the bar, so the fretboard stops swapping
   * under your hands every four bars (A8). All of them rather than the first
   * (2026-09-17): a blues key suggests the minor pentatonic, the blues scale
   * and mixolydian, and the owner asked to "show the other 'main' scales too
   * and show them like cheatsheet style" — which is the same argument the
   * chord cheat sheet already won. Which one is drawn is a choice the sheet
   * owns; this hands over the list.
   */
  const keyScales = useMemo(() => scalesForKey(harmony.key), [harmony.key]);

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

  /**
   * What the ARRANGEMENT will do with each bar of this chorus (A1).
   *
   * Null while the jam loops: there is no build to see coming, and a row of
   * identical marks under twelve bars would be twelve marks saying nothing.
   * The same `bandMoment` the compiler calls, so the picture and the sound
   * cannot disagree.
   */
  const moments = useMemo(
    () =>
      jam.arrangement && jam.arrangement.mode !== "loop"
        ? momentsForChorus(jam, chorus)
        : null,
    [jam, chorus],
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

  /**
   * The grooves the drums row offers (2026-09-17).
   *
   * The bass row picks its figure and the keys row its comping, both while
   * you listen to them; the drummer — the player with a hundred and fifteen
   * of these — was the one row you could only read. So the drums row picks
   * too, from the shelf its current groove is on: swapping a shuffle for a
   * boogie mid-chorus is the same size of gesture as swapping a bass figure,
   * and the other hundred are still a tap away in Set up, where choosing
   * between shelves is what the card wall is for.
   *
   * A groove of your own is drawn as its own option when there is one, so
   * the control reads what is actually playing rather than the preset
   * underneath it.
   */
  /* The id the drums row's dropdown gives a groove of your own. No preset
     answers to it, so a pick of it is a no-op rather than a lookup miss. */
  const CUSTOM_GROOVE = "__mine__";
  const shelf = useMemo(() => {
    const current = grooveById(jam.grooveId);
    return groovesInFamily(current.family);
  }, [jam.grooveId]);

  /**
   * What the percussionist is playing, and whether there is a row for them.
   *
   * The row appears when the GROOVE has percussion written for it or when the
   * jam has turned one on. Two conditions rather than one, and each answers a
   * different complaint: a Percussion row over a thrash bar is a player with
   * nothing to play, and a row that vanished the moment you switched to that
   * bar would take a switch you had set away with it.
   */
  const percVoices = useMemo(() => percussionVoices(meter.bar), [meter]);
  const showPerc = percVoices.length > 0 || !!band.perc;
  /**
   * "shaker and congas". `Intl.ListFormat` rather than a joined string,
   * because "and" is a word and the fifteen do not agree on where it goes;
   * the comma is the fallback where a runtime has no list formatter.
   */
  const percDetail = useMemo(() => {
    const names = percVoices.map((voice) => t(`jam.perc.${voice}`));
    if (names.length === 0) return t("jam.perc.silent");
    return joinNames(names, i18n.language);
  }, [percVoices, t, i18n.language]);

  /** The grip pinned to the corner, matched back to a real shape. */
  const pinned = useMemo(() => pinnedShapeOf(jam, neck), [jam, neck]);
  /** What the corner draws while a just-unpinned grip folds away (A11). */
  const shownPin = useLastPresent(pinned);

  /**
   * Which of the two the docked frame is showing, and what it is called.
   *
   * Setup wins when both flags are somehow up — the same order Escape uses —
   * and `useLastPresent` keeps the answer through the slide out, so the frame
   * leaves showing what it was showing rather than emptying first.
   */
  const sheetKind = screen.setupOpen ? "setup" : screen.chordsOpen ? "chords" : null;
  const shownSheet = useLastPresent(sheetKind);
  const chordTitle = cheatSheetTitle(harmony.key, screen.cheatTab, screen.chordPage, t);

  /** Whether the app may animate, once, for every surface below (A11). */
  const motionInputs = useMemo(
    () => ({
      themeId,
      disabled: viewTransitions === "off",
      level: viewTransitions,
      animStyle: animationStyle,
    }),
    [themeId, viewTransitions, animationStyle],
  );

  /** What the drums row says it is playing — the kit, or your own folder. */
  const kitName = jam.customKit
    ? jam.customKit.name
    : t(`jam.kit.${jam.kit}`, { defaultValue: jam.kit });

  return (
    <MotionProvider value={motionInputs}>
    <div className="jam-view" data-sheet={screen.setupOpen ? "setup" : undefined}>
      <TradeCue bandState={bandState} isPlaying={isPlaying} />

      {/* ── 1 and 3. The chord, and the tempo beside it ─────────────────── */}
      <section className="jam-top">
        {/* The chord you are on, whenever there is one to name — and not
            behind the timeline's switch (2026-09-18).

            It used to be `jam.chords && chord`, so the control labelled "show
            the chords on the timeline" also governed the headline readout of
            the whole mode: the chord, the scales that fit it and the way to
            the fretboard. The owner found that out the hard way, looking at
            two machines and seeing a gap on one of them — "i think this
            switch shouldn't affect that area, only the timeline". A control
            has to do what it says it does, and thirty-two chord names down a
            timeline is a matter of taste in a way that one chord is not. */}
        {chord ? (
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
          {/* The three you reach for while playing, side by side. They used
              to stack down the right-hand edge, and because each is a
              different width that read as a staircase; they are their own
              row now so the tempo block below keeps a line to itself — four
              things across never fit, which is what made the cluster
              rearrange itself every time the setup drawer opened. */}
          <div className="jam-head-row">
          {/* The key, here as well as in the sheet (2026-09-17). Changing key
              is something you do while playing — "I change keys often for
              improv purposes" — and three gestures behind a drawer is not
              where that lives. `harmony.concert` and not `harmony.key`: the
              record holds the key the BAND plays, and a transposing player
              reads their own. */}
          <KeyPicker
            value={harmony.concert}
            onPick={(key) => onEdit({ key, pinnedShape: null })}
          />
          <Segmented
            label={t("jam.feel.bandLabel")}
            value={jam.feel}
            options={FEELS.map((id) => ({ id, label: t(`jam.feel.${id}`) }))}
            onChange={(feel) => onEdit({ feel })}
          />
          <Segmented
            label={t("jam.intensity.drumsLabel")}
            value={jam.intensity}
            options={INTENSITIES.map((id) => ({ id, label: t(`jam.intensity.${id}`) }))}
            onChange={(intensity) => onEdit({ intensity })}
            hint={t("jam.intensity.hint")}
          />
          </div>

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
            there until it is unpinned — which is the whole point (A8). It
            unfolds when it is pinned and folds away when it is not: the one
            thing on this screen that appears, so the one thing that arrives. */}
        <Presence open={!!pinned}>
          {(_state, motion) =>
            shownPin && (
              <PinnedShape
                shape={shownPin.shape}
                name={chordName(shownPin.chord, harmony.key)}
                onUnpin={() => onEdit({ pinnedShape: null })}
                motion={motion}
              />
            )
          }
        </Presence>
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
        moments={moments}
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
            // The kit alone now: the groove is a control on this row, and a
            // name printed beside the control that sets it is the same word
            // twice.
            detail: grooveFits ? kitName : `${t("jam.groove.rule")} · ${kitName}`,
            volume: mix.drums,
            extra: (
              <JamSelect
                label={t("jam.groove.label")}
                value={jam.customGroove ? CUSTOM_GROOVE : jam.grooveId}
                compact
                disabled={!band.drums}
                options={[
                  ...(jam.customGroove
                    ? [{ id: CUSTOM_GROOVE, label: jam.customGroove.name }]
                    : []),
                  ...shelf.map((groove) => ({
                    id: groove.id,
                    label: t(`jam.groove.${groove.id}`),
                  })),
                ]}
                onChange={(id) => {
                  if (id === CUSTOM_GROOVE) return;
                  onEdit({
                    grooveId: id,
                    // A groove carries its own meter, so the count-in follows
                    // it: one bar of a waltz is three beats, not four.
                    countIn: carryCountIn(
                      jam.countIn,
                      meter.beatsPerBar,
                      grooveById(id).beatsPerBar,
                    ),
                    // Picking a preset is picking a preset. The groove you
                    // drew is still on the record until you pick one.
                    customGroove: undefined,
                  });
                }}
              />
            ),
          },
          {
            id: "bass",
            on: band.bass,
            detail: "",
            notes: bassNotes,
            volume: mix.bass,
            // The bass's style belongs to the bass, so it is picked on the
            // bass's row, while you listen to it — the keys row's rule.
            extra: (
              <JamSelect
                label={t("jam.bassFigure.label")}
                value={jam.bassStyle ?? "auto"}
                compact
                disabled={!band.bass}
                options={[
                  {
                    id: "auto" as const,
                    label: t("jam.bassFigure.autoNamed", {
                      style: t(`jam.bassFigure.${jamBassFigure({ ...jam, bassStyle: undefined })}`),
                    }),
                  },
                  ...JAM_BASS_STYLES.map((id) => ({ id, label: t(`jam.bassFigure.${id}`) })),
                ]}
                onChange={(id) => onEdit({ bassStyle: id === "auto" ? undefined : id })}
              />
            ),
          },
          {
            id: "keys",
            on: !!band.keys,
            detail: "",
            volume: mix.keys,
            // The comping style belongs to this player and to nobody else, so
            // it lives on their row — you change it while listening to it.
            // Nine styles now, so a dropdown rather than a button each.
            extra: (
              <JamSelect
                label={t("jam.keysComp.label")}
                value={jam.keysStyle ?? "auto"}
                compact
                disabled={!band.keys}
                options={[
                  {
                    id: "auto" as const,
                    label: t("jam.keysComp.autoNamed", {
                      style: t(`jam.keysComp.${jamKeysStyle({ ...jam, keysStyle: undefined })}`),
                    }),
                  },
                  ...JAM_KEYS_STYLES_ALL.map((id) => ({ id, label: t(`jam.keysComp.${id}`) })),
                ]}
                onChange={(id) => onEdit({ keysStyle: id === "auto" ? undefined : id })}
              />
            ),
          },
          // The percussionist, after Keys. Withheld entirely where there is
          // nobody to be: see `showPerc` above for the two ways there is.
          ...(showPerc
            ? [
                {
                  id: "perc" as const,
                  on: !!band.perc,
                  detail: percDetail,
                  volume: mix.perc,
                },
              ]
            : []),
        ]}
        onToggle={(id) =>
          onEdit({
            band: {
              drums: band.drums,
              bass: band.bass,
              keys: !!band.keys,
              perc: !!band.perc,
              // The two optional flags are read through `!`, so an absent one
              // toggles to true rather than to `!undefined` twice over.
              [id]: !band[id],
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
        chords={!!jam.chords}
        onChords={(next: boolean) => onEdit({ chords: next })}
      />

      {/* ── The docked sheet ──────────────────────────────────────────────
          ONE frame, two contents (JAM_UX_DECISIONS A11). The owner:
          "switching between Set up and Chords makes the right drawer do weird
          flickering." It did, because they were two sheets in the same place:
          pressing Chords unmounted one aside and mounted another, and with a
          slide on each that would have been an exit followed by an entry.

          Now the frame slides in once when the first of them opens, stays
          exactly where it is while you switch between them — only the header
          and the body change — and slides out once when you close. */}
      <Presence open={screen.setupOpen || screen.chordsOpen}>
        {(_state, motion) =>
          shownSheet && (
            <JamSheet
              kind={shownSheet}
              // The cheat sheet can fill the region; the setup sheet cannot.
              // Setup is a column of controls beside the thing they change,
              // and widening it would cover the band it is being used on.
              canMaximize={shownSheet === "chords"}
              openMaximized={shownSheet === "chords"}
              dim={shownSheet === "setup"}
              closeOnOutside={shownSheet === "setup"}
              title={shownSheet === "setup" ? jam.name : chordTitle.title}
              subtitle={
                shownSheet === "setup"
                  ? setupSheetSubtitle(jam, t)
                  : chordTitle.subtitle
              }
              onClose={() =>
                shownSheet === "setup"
                  ? screen.setSetupOpen(false)
                  : screen.setChordsOpen(false)
              }
              motion={motion}
            >
              {shownSheet === "setup" ? (
                <JamSetupSheet
                  jam={jam}
                  jams={jams}
                  onEdit={onEdit}
                  onLoadJam={(next) => onLoadJam?.(next)}
                  instrument={instrument}
                  lineup={lineup}
                  onPreviewKit={(kit) => onPreviewKit?.(kit)}
                  previewingKit={previewingKit}
                  onPreviewVibe={onPreviewVibe}
                  onStopPreview={onStopPreview}
                  previewingVibe={previewingVibe}
                  customKitRefused={customKitRefused}
                  onOpenEditor={() => screen.setEditorOpen(true)}
                  editingChords={screen.editingChords}
                  onEditingChords={(on) => {
                    screen.setEditingChords(on);
                    // Leaving the mode closes the picker: a panel left open
                    // over a timeline that has gone back to jumping points at
                    // the wrong thing.
                    if (!on) screen.setEditingBar(null);
                  }}
                  takes={takes}
                  onToggleTakes={onToggleTakes}
                />
              ) : (
                <ChordSheet
                  jam={jam}
                  onEdit={onEdit}
                  playedKey={harmony.key}
                  current={chord}
                  scales={keyScales}
                  instrument={neck}
                  expanded={screen.pinnedChord}
                  onExpand={screen.setPinnedChord}
                  shapeIndex={screen.shapeIndex}
                  onShapeIndex={screen.setShapeIndex}
                  page={screen.chordPage}
                  onPage={screen.setChordPage}
                  tab={screen.cheatTab}
                  onTab={screen.setCheatTab}
                />
              )}
            </JamSheet>
          )
        }
      </Presence>

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
    </MotionProvider>
  );
}
