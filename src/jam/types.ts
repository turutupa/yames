/**
 * Jam — the shared contract between the UI and the engine.
 *
 * This file is the boundary two workers build against at the same time, so
 * it changes only by agreement (see plans/tasks/jam/BRIEF.md). The Rust side
 * mirrors `JamEngineConfig` field for field in `src-tauri/src/jam.rs`, with
 * serde camelCase names.
 *
 * The one idea to keep in mind: the band is a table on the tick grid the
 * metronome already runs. Columns are the ticks of one bar (beats per bar ×
 * ticks per beat), rows are drums, a cell is how loud. Nothing about timing
 * changes; the engine looks the table up on every tick it was going to play
 * anyway. See plans/JAM_MODE.md §6.
 */

/** How loud a cell is. 0 off, 1 hit, 2 accent, 3 ghost. */
export type JamLevel = 0 | 1 | 2 | 3;

export type JamLane = "kick" | "snare" | "hat" | "ride" | "crash";

export const JAM_LANES: readonly JamLane[] = ["kick", "snare", "hat", "ride", "crash"];

/**
 * One bar, one row per drum. Every array has exactly
 * `beatsPerBar × ticksPerBeat` entries, tick 0 first.
 */
export type JamPattern = Record<JamLane, JamLevel[]>;

/**
 * What the engine receives. The UI is responsible for having ALREADY set the
 * engine's subdivision to `ticksPerBeat` and its beat groups to
 * `[beatsPerBar]` before sending this; the engine checks the product against
 * its own bar length and plays the plain click if they disagree, rather than
 * guessing.
 */
export type JamEngineConfig = {
  ticksPerBeat: 1 | 2 | 3 | 4 | 6;
  beatsPerBar: number;
  /** The groove. */
  bar: JamPattern;
  /** Played instead of `bar` on the last bar of every chorus, when set. */
  fill: JamPattern | null;
  /** Bars in one chorus of the form, 1..64. */
  formBars: number;
  /** A crash on tick 0 of bar 0 of every chorus. */
  crashOnOne: boolean;
  /** Gain multiplier on every hit, 0.5..1.5. Soft 0.7, normal 1.0, loud 1.25. */
  intensity: number;
  /** Which kit plays the lanes: "room" | "tight" | "brushes" | "electronic". */
  kit: string;
  /**
   * The bass, when the band has one. One MIDI note number per tick, 0 for a
   * rest, same length as the drum lanes. Absent or null: no bass.
   */
  bass?: JamBassLine | null;
  /**
   * Practice windows the engine applies per bar from its own form counter,
   * so they land exactly on bar lines. Absent or null: the band plays every
   * bar.
   */
  practice?: JamPracticeConfig | null;
  /**
   * Also play the fill on every bar whose 1-based number within the chorus
   * is a multiple of this (4 or 8), not only on the last bar of the chorus.
   * Absent or 0: the last bar only.
   */
  fillEvery?: number;
  /**
   * The keys, comping. One voicing per tick: up to four MIDI notes, an
   * empty array for a rest. Same length as the drum lanes. Absent or null:
   * no keys.
   */
  keys?: JamKeysLine | null;
  /** Per-lane gain multipliers, 0..1.5. Absent: 1.0 each. */
  mix?: JamMix;
  /** What the count-in plays: the beep the drill uses, or the kit's sticks. */
  countInSound?: JamCountInSound;
};

export type JamKeysLine = {
  voicings: number[][];
  /** Gain multiplier on the keys voice, 0.5..1.5. */
  gain: number;
};

export type JamMix = { drums: number; bass: number; keys: number };
export type JamCountInSound = "beep" | "sticks";

/**
 * Where the form goes next. The engine applies both at the next bar line,
 * never mid-bar, and reports the result on the next BeatEvent's `formBar`.
 * `jumpTo` is consumed once; `loop` stays until replaced with null.
 */
export type JamPositionCommand = {
  /** 0-based bar of the chorus to land on at the next bar line. */
  jumpTo: number | null;
  /** Loop bars start..end inclusive, 0-based within the chorus. */
  loop: { start: number; end: number } | null;
};

export type JamBassLine = {
  pitches: number[];
  /** Gain multiplier on the bass voice, 0.5..1.5. */
  gain: number;
};

/**
 * What the band does on each bar of the form, decided by the engine from
 * `formBar` and `chorus` so the change lands on the bar line.
 *
 * Phase-locked to the chorus: both windows are computed from the bar within
 * the chorus and restart at bar 0 of every chorus, so a silence lands on
 * the same chord every time round (see src/jam/practice.ts).
 * dropOut: within each chorus, every `everyBars` bars (never bar 0 itself)
 * the whole band goes silent for `bars` bars, then returns. trade: from bar
 * 0 of each chorus the band plays `bandBars` bars, then for `youBars` bars
 * the drums play hats only and the bass rests; repeats. Both may be set;
 * drop-out wins on a bar where both apply.
 */
export type JamPracticeConfig = {
  dropOut: { everyBars: number; bars: number } | null;
  trade: { bandBars: number; youBars: number } | null;
};

/** What the band is doing on a bar. Mirrored on every BeatEvent as `bandState`. */
export type JamBandState = "full" | "hatsOnly" | "silent";

// ---------------------------------------------------------------------------
// The library item
// ---------------------------------------------------------------------------

export type JamFeel = "straight" | "shuffle" | "swing";
export type JamIntensity = "soft" | "normal" | "loud";

/**
 * Concert pitch, or the part a Bb or Eb instrument reads. This is the union
 * `TranspositionOption` in `./harmony` is; it lives here because the record
 * carries it and `harmony.ts` already imports this file.
 */
export type JamTransposition = "concert" | "bb" | "eb";

/**
 * The shapes on the setup board. `custom` carries its own bar count; the
 * others are fixed: blues12 = 12, loop8 = 8, bars16 = 16, aaba32 = 32,
 * one = 4.
 */
export type JamFormKind = "blues12" | "loop8" | "bars16" | "aaba32" | "one" | "custom";

export type JamForm = { kind: JamFormKind; bars: number };

/** A saved jam. Lives in the store under the `jams` key, like setlists. */
export type Jam = {
  id: string;
  name: string;
  createdAt: number;
  bpm: number;
  /** One of the ids in `src/jam/grooves.ts`. */
  grooveId: string;
  feel: JamFeel;
  intensity: JamIntensity;
  /** Only "room" today. Kept on the record so saved jams survive more kits. */
  kit: string;
  form: JamForm;
  /** Beats counted in before bar 1. 0..8, the engine's own limit. */
  countIn: number;
  /** A fill on the last bar of every chorus and a crash on the one. */
  fills: boolean;
  /**
   * The key, written the way `keyName` in `./harmony` writes it: "A", "Dm",
   * "A blues". The MODE lives in this string — that is what the trailing "m"
   * and " blues" are — so there is no second field to disagree with it, and
   * `parseKey` reads it back. Optional, so a record from before keys still
   * loads; a jam without one is read as C major.
   */
  key?: string;
  /**
   * What the player reads: concert pitch, or a Bb or Eb instrument's part.
   * Display only — the band always plays in concert. Absent: concert.
   */
  transposition?: JamTransposition;
  /** A groove made in the editor, used instead of `grooveId` when present. */
  customGroove?: JamCustomGroove;
  /**
   * Who is in the band. Absent means nobody has touched the toggles, and the
   * band is then the lineup for the instrument you play — the band never
   * plays your instrument (JAM_MODE §3.1). Touch a toggle and the answer
   * becomes the record's, and stays the record's.
   */
  band?: { drums: boolean; bass: boolean };
  /** Chords on the timeline and the NOW block. Absent: off. */
  chords?: boolean;
  /** The practice tools. Absent: none. */
  practice?: JamPracticeSettings;
  /** Fills every N bars within the chorus as well as at its end. Absent or 0: end only. */
  fillEvery?: number;
  /**
   * The changes, typed in: one chord name per bar of the chorus ("A7",
   * "Dm7", "Bb"), exactly `form.bars` long. Absent: the form's own
   * progression for the key.
   */
  progression?: string[];
  /**
   * The meter, when it is not the groove's own: the beat groups the
   * metronome's meter editor uses ([2, 2, 3] for 7/8) and the ticks per
   * beat. A groove that does not fit the meter is replaced by the rule
   * groove (kick on group starts, snare late in the group, hats on the
   * subdivision). Absent: the groove's meter.
   */
  meter?: { beatGroups: number[]; ticksPerBeat: 1 | 2 | 3 | 4 | 6 };
  /** Per-lane volume. Absent: 1.0 each. */
  mix?: JamMix;
  /** Absent: "beep". */
  countInSound?: JamCountInSound;
  /** Spoken cues (count-in, sections, "your four") where a voice is set up. Absent: off. */
  cues?: boolean;
  /** Record takes, opt-in. Absent: off. */
  takes?: boolean;
};

/** A recorded take: your playing with the band mixed in, kept locally. */
export type JamTake = {
  id: string;
  jamId: string;
  createdAt: number;
  durationSec: number;
  /** Absolute path of the WAV in the app's data directory. */
  path: string;
};

export type JamCustomGroove = {
  name: string;
  beatsPerBar: number;
  ticksPerBeat: 1 | 2 | 3 | 4 | 6;
  bar: JamPattern;
  fill: JamPattern | null;
};

export type JamPracticeSettings = {
  /** 0 = off; else every N bars the band drops out for `dropOutBars`. */
  dropOutEvery: number;
  dropOutBars: number;
  /** 0 = off; else trade this many bars: band plays N, you play N. */
  tradeBars: number;
  /** 0 = off; else the tempo rises by `tempoStep` every `tempoEveryChoruses` choruses. */
  tempoStep: number;
  tempoEveryChoruses: number;
};

export const JAM_INTENSITY_GAIN: Record<JamIntensity, number> = {
  soft: 0.7,
  normal: 1.0,
  loud: 1.25,
};

export const JAM_FORM_BARS: Record<Exclude<JamFormKind, "custom">, number> = {
  blues12: 12,
  loop8: 8,
  bars16: 16,
  aaba32: 32,
  one: 4,
};

export const JAM_MAX_FORM_BARS = 64;
export const JAM_MAX_COUNT_IN = 8;
