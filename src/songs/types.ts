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

// ---------------------------------------------------------------------------
// What the ENGINE is told — the mirror of `src-tauri/src/song.rs`
//
// A `SongScore` is what is written; a `SongTransport` is what is PLAYED, and
// they are different shapes for a reason. The score carries the page (string,
// fret, technique, the bar it was printed on); the transport carries only what
// the click needs to walk the piece in time — the tempo map, the meter of
// every played bar, the range, the speed, and a count-in. The engine never
// sees a fret.
//
// Fixed by `plans/tasks/songs/W9-ENGINE-SONG.md` and pinned on the Rust side
// by the `Deserialize` impls in `song.rs`, `camelCase` on the wire. A change
// here is a change there.
// ---------------------------------------------------------------------------

/** One played bar, as the engine counts it. `bars` is already unrolled. */
export type SongTransportBar = {
  startTick: number;
  lengthTicks: number;
  numerator: number;
  denominator: number;
};

export type SongTransport = {
  ticksPerQuarter: typeof TICKS_PER_QUARTER;
  /** Step changes, on bar lines, the first at or before the first bar. */
  tempoMap: SongTempo[];
  bars: SongTransportBar[];
  /** Inclusive, in played-bar indices. */
  range: { startBar: number; endBar: number };
  loops: boolean;
  tempoPercent: number;
  /** 0, 1 or 2 bars, at the range's first tempo and meter. */
  countInBars: number;
};

/** Which of the band's three rows a backing track is played on. */
/**
 * Who plays a track.
 *
 * The first three are Jam's recorded band. The fourth is everything else the
 * file has — every guitar, and so the reason Songs exists — through the
 * General MIDI synthesiser in `src-tauri/src/synth.rs`. Before W28 there was
 * no fourth, and a two-guitar file played as a metronome.
 */
export type SongRole = "drums" | "bass" | "keys" | "synth";

/**
 * One note of the file's own rhythm section.
 *
 * `midi` is a General MIDI PERCUSSION number on a `drums` track — what Guitar
 * Pro writes, and what the engine maps onto the kit's voices — and the
 * sounding pitch on a `bass` or `keys` one. `velocity` is 0..1.
 */
export type SongBackingNote = {
  tick: number;
  durTicks: number;
  midi: number;
  velocity: number;
};

/** A bend or a slide, as MIDI writes one: 0..16383, 8192 at rest. */
export type SongBackingBend = { tick: number; value: number };

export type SongBackingTrack = {
  role: SongRole;
  name: string;
  /**
   * The General MIDI instrument the file asks for, 0..127. Read only for a
   * `synth` track; the recorded kit, bass and keys are what they are.
   */
  program: number;
  /**
   * The part the player opened the file to learn, played as the guide every
   * tab player has. Exactly one track of a song is.
   */
  guide: boolean;
  notes: SongBackingNote[];
  /** Empty for everything the recorded band plays: a sample cannot bend. */
  bends: SongBackingBend[];
};

/** The file's own band. `null` is a song the engine only clicks to. */
export type SongBacking = { tracks: SongBackingTrack[] };

/**
 * How loud the click is, and each track of the file.
 *
 * **Per track since W28.** It was a click and Jam's three rows, because those
 * were the only three things a song could play. Now every track sounds, so
 * every track has a fader: `tracks[n]` is the `n`th entry of
 * `SongBacking.tracks`, which is the order the band strip draws them in.
 */
export type SongMix = {
  click: number;
  tracks: number[];
};

/**
 * The click at 0.45, and that is the engine's number, not a guess.
 *
 * `song.rs`'s `DEFAULT_CLICK_MIX`: a metronome at full scale is the loudest
 * thing the engine makes, and over a piece you are reading it does not want to
 * be — the band is the reference and the click is the ruler beside it.
 */
export const DEFAULT_SONG_MIX: SongMix = {
  click: 0.45,
  tracks: [],
};

/**
 * How loud the player's own part comes back at.
 *
 * On, and a few dB under the rest, which is what every tab player does with
 * the part you are learning: loud enough to follow, quiet enough that you are
 * the one playing it. A player who wants it gone has the mute, and a player
 * who wants to be led has the fader.
 */
export const GUIDE_TRACK_MIX = 0.7;

/** A fader nobody has touched. The arrangement's own level. */
export const DEFAULT_TRACK_MIX = 1;

/** The loudest a lane goes, and the quietest. `song.rs`'s `MIX_MIN`/`MIX_MAX`. */
export const SONG_MIX_MAX = 1.5;
export const SONG_MIX_MIN = 0;

/** The most bars of count-in the engine will play. `song.rs`'s own ceiling. */
export const MAX_COUNT_IN_BARS = 2;

/** The speeds the engine accepts, as a percentage of what is written. */
export const MIN_TEMPO_PERCENT = 25;
export const MAX_TEMPO_PERCENT = 100;

/** What scoring says back, per expected onset. `pass` counts loops, from 0. */
export type OnsetResult = {
  id: number;
  state: "hit" | "miss" | "softAbsent";
  deviationMs: number | null;
  pass: number;
  /**
   * Whether a note written with an accent actually came out louder than
   * the notes beside it. Reported, never scored — what an accent should
   * cost is still open (`plans/LEARNING_PATHS_DECISIONS.md` C3).
   *
   * Absent when there is nothing to say: no accent written, the note
   * was not played, or the amplitudes around it were unusable.
   */
  accentHeard?: boolean;
};

export type ExtraOnset = { beat: number; pass: number };

// ---------------------------------------------------------------------------
// What the coach found — the mirror of `src-tauri/src/findings.rs`
//
// Rules decide and the model narrates (`ROADMAP.md` principle 3), so this is
// the shape of a decision rather than of a sentence: the numbers a sentence
// can be built from, and a fix the app can set up in one tap. Every field is
// pinned on the Rust side by `a_finding_goes_over_the_wire_in_camel_case` and
// `every_fix_is_a_tagged_object`.
// ---------------------------------------------------------------------------

/**
 * What the coach found. The order here is the order of the ranking
 * (`COACH_UX.md` A4): a passage you consistently miss, then a tendency, then
 * the tempo ceiling, then praise.
 */
export type FindingKind =
  | "consistentMiss"
  | "rushing"
  | "dragging"
  | "afterShift"
  | "fallsApart"
  | "extras"
  | "uneven"
  | "beatPositionBias"
  | "subdivisionWeak"
  | "drift"
  | "tempoCeiling"
  | "improved"
  | "clean";

/**
 * Something the app can set up in one tap (`COACH_UX.md` A5).
 *
 * Bars are played-bar indices — `SongScore.bars[i].index`, not the number on
 * the page; the page number rides along in `Evidence.printedBars` for the
 * sentence to quote. They are optional only because the free-play half of the
 * rules has no bars to name.
 */
export type Fix =
  | { type: "loopBars"; start: number; end: number; tempoPercent: number }
  | {
      type: "ramp";
      start: number | null;
      end: number | null;
      fromPercent: number;
      toPercent: number;
    }
  | {
      type: "clickSubdivision";
      start: number | null;
      end: number | null;
      subdivision: number;
    }
  | { type: "comeBack"; days: number };

/**
 * The numbers a sentence is built from.
 *
 * Everything optional is ABSENT rather than zero, so a narrator never quotes
 * a number nobody measured — the Rust side skips the field rather than
 * writing a null, and `undefined` is how TypeScript says the same thing.
 */
export type Evidence = {
  /** Expected onsets this finding is drawn from, counting every pass. */
  onsets: number;
  hits: number;
  hitRate: number;
  /** Signed, in ms. Negative is early. */
  meanDeviationMs: number;
  /** The same number as a fraction of a beat — "about a sixteenth early". */
  deviationBeats: number;
  /** Median absolute deviation, ms. */
  spreadMs: number;
  passes: number;
  passesAffected: number;
  /** The BPM that 100 % means for this finding's fix. */
  referenceBpm?: number;
  /** The same bars as `Finding.bars`, as they are numbered on the page. */
  printedBars?: [number, number];
  /** 1 quarters, 2 eighths, 3 triplets, 4 sixteenths, 6 sextuplets. */
  subdivision?: number;
  /** Free play: which beat of the bar, 1-based. */
  beatPosition?: number;
  /** Free play: which position inside the beat, 0-based, out of how many. */
  subdivisionPosition?: [number, number];
  /** (the tempo it holds, the tempo it collapses at), in BPM. */
  bpmBand?: [number, number];
  /** Notes played that are not written, inside this finding's bars. */
  extras?: number;
  hitRateDelta?: number;
  spreadDeltaMs?: number;
};

/** One thing the coach found. `findings[0]` is the headline. */
export type Finding = {
  kind: FindingKind;
  /** Played bars, inclusive. Absent for free play, which has no score. */
  bars?: [number, number];
  /** The notes it is about, by `SongNote.id`, so the tab can colour them. */
  noteIds: number[];
  /** 0..1. Only ever compared inside one tier of the ranking. */
  severity: number;
  evidence: Evidence;
  fix?: Fix;
};

// ---------------------------------------------------------------------------
// Which note was that — the mirror of `src-tauri/src/pitch.rs`
// ---------------------------------------------------------------------------

/**
 * What the tracker says about one note of the score.
 *
 * `notAssessed` is the honest one (`SONGS.md` S0.5): a chord, or a soft
 * onset the contract says must not be scored. A monophonic tracker asked
 * about three notes at one tick answers about whichever of them won, and
 * reporting that as two wrong notes would be worse than saying nothing.
 */
export type NoteState = "right" | "wrong" | "octave" | "unheard" | "notAssessed";

export type NoteVerdict = {
  noteId: number;
  onsetId: number;
  expectedMidi: number;
  /** What was heard, as a float MIDI number. `null` when nothing was. */
  heardMidi: number | null;
  /**
   * How far off, in cents, signed, sharp positive. For an octave error this
   * is the WHOLE distance including the octave: the fact is that a note
   * twelve semitones out was played.
   */
  centsOff: number | null;
  state: NoteState;
  /** The tracker's own confidence in the note it heard. */
  confidence: number;
};
