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
 * dropOut: every `everyBars` bars, the whole band goes silent for `bars`
 * bars, then returns. trade: the band plays `bandBars` bars, then for
 * `youBars` bars the drums play hats only and the bass rests; repeats.
 * Both may be set; drop-out wins on a bar where both apply.
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
   * Display only until Jam 2 brings chords: "A", "Dm". Optional so an old
   * record without it still loads.
   */
  key?: string;
  /** A groove made in the editor, used instead of `grooveId` when present. */
  customGroove?: JamCustomGroove;
  /** Who is in the band. Absent: drums only. */
  band?: { drums: boolean; bass: boolean };
  /** Chords on the timeline and the NOW block. Absent: off. */
  chords?: boolean;
  /** The practice tools. Absent: none. */
  practice?: JamPracticeSettings;
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
