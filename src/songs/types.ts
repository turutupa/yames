/**
 * Songs — the score, and what scoring is told about it.
 *
 * This file is the boundary between the importer, the Songs mode and the Rust
 * analyzer, fixed in `plans/tasks/songs/BRIEF.md` before any of the three were
 * written. It is mirrored field for field by serde structs in
 * `src-tauri/src/score.rs` with `camelCase` on the wire, so a change here is a
 * change in two repositories' worth of code and is made by agreement, never
 * by whoever needed a field first.
 *
 * The one idea to keep in mind: **`bars` is what is played, in order.**
 * Repeats and alternate endings are unrolled by the importer, so a bar the
 * player goes round twice appears twice, and `printedBar` is how a played bar
 * finds its way back to the bar on the page. Nothing downstream — the cursor,
 * the schedule, the review — ever has to know what a repeat is.
 */

/** Ticks per quarter note, everywhere in a score. alphaTab's own resolution. */
export const TICKS_PER_QUARTER = 960;

/** What the importer read the file as. */
export type SongFormat = "gp" | "musicxml" | "alphatex";

/**
 * The extensions we say we take, for the file input and the drop target.
 *
 * Here rather than in `import.ts` on purpose: that module pulls alphaTab in
 * with it, and the file input has to exist on a screen that has not loaded
 * the renderer yet (`SongsView` imports the tab lazily).
 */
export const SONG_FILE_EXTENSIONS = [
  ".gp",
  ".gp3",
  ".gp4",
  ".gp5",
  ".gpx",
  ".musicxml",
  ".xml",
  ".mxl",
  ".alphatex",
  ".tex",
] as const;

export type SongSource = {
  fileName: string;
  format: SongFormat;
  trackIndex: number;
  trackName: string;
};

export type SongBar = {
  index: number;
  startTick: number;
  lengthTicks: number;
  /** The bar on the page this played bar came from. Repeats share one. */
  printedBar: number;
  section?: string;
};

export type SongTechnique =
  | "hammer"
  | "pull"
  | "slide"
  | "bend"
  | "vibrato"
  | "palmMute"
  | "harmonic"
  | "tap"
  | "letRing";

export type SongNote = {
  /** Index in `notes`, stable for a given score. */
  id: number;
  tick: number;
  durTicks: number;
  /**
   * String 1 is the highest, the way Guitar Pro numbers them — which is the
   * opposite of alphaTab's own numbering. `import.ts` converts.
   */
  string: number;
  fret: number;
  /** The sounding pitch, capo already added. */
  midi: number;
  /** A tied continuation makes no onset. */
  tieFromPrevious: boolean;
  ghost: boolean;
  dead: boolean;
  accent: boolean;
  techniques: SongTechnique[];
};

export type SongTempo = { tick: number; bpm: number };
export type SongMeter = { bar: number; numerator: number; denominator: number };
export type SongSection = { name: string; startBar: number; endBar: number };

export type SongScore = {
  schema: 1;
  /** Stable: a hash of the source bytes and the track index. */
  id: string;
  title: string;
  artist: string;
  source: SongSource;
  /** MIDI note per string, string 1 (highest) first. Open, without the capo. */
  tuning: number[];
  capo: number;
  ticksPerQuarter: typeof TICKS_PER_QUARTER;
  /** Step changes, first at tick 0. Bar lines only (`SONGS.md` A4). */
  tempoMap: SongTempo[];
  meterMap: SongMeter[];
  bars: SongBar[];
  /** Sorted by tick, then string. */
  notes: SongNote[];
  sections: SongSection[];
};

/**
 * What scoring is told — the onsets it should expect to hear.
 *
 * `beat` is quarter notes from the start of the played range, as a float,
 * because the analyzer thinks in beats and the range may start anywhere.
 */
export type ExpectedOnset = {
  id: number;
  beat: number;
  noteIds: number[];
  /**
   * A hammer-on or pull-off: it may be too quiet to detect, and must not be
   * scored as a miss when it is absent.
   */
  soft: boolean;
  accent: boolean;
};

export type ScoreSchedule = {
  onsets: ExpectedOnset[];
  lengthBeats: number;
  loops: boolean;
};

/** What scoring says back, per expected onset. `pass` counts loops, from 0. */
export type OnsetResult = {
  id: number;
  state: "hit" | "miss" | "softAbsent";
  deviationMs: number | null;
  pass: number;
};

export type ExtraOnset = { beat: number; pass: number };
