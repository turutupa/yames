/**
 * Learning paths — the format of a Path, a Step and an Exercise.
 *
 * `plans/PATHS_PIPELINE.md` is the human description of this file; this file
 * is the contract. Three decisions shape it:
 *
 * - **Content is authored ahead of time** (`LEARNING_PATHS_DECISIONS.md`
 *   D0.3, D0.4). A pack is plain JSON produced by `generate.ts` from a spec in
 *   `specs/` and checked in. The app's model never writes one.
 * - **Notes are the score's notes.** `tick` and `dur` are ticks at the same
 *   960 per quarter as `src/songs/types.ts` (so triplets and sextuplets stay
 *   integers), strings count from the highest, and `toScore.ts` turns an
 *   Exercise into a real `SongScore` for the scoring path that already exists.
 *   `beat = tick / 960`.
 * - **A pass bar names only what the app can measure.** `metrics.ts` is the
 *   controlled list; anything else is said to be self-checked or practice-only
 *   and `validate.ts` refuses anything in between.
 */

/** Bump on any breaking change; a reader refuses a version it does not know. */
export const PATH_SCHEMA_VERSION = 1;

/** Standard tuning, string 1 (highest) first, the way `SongScore.tuning` is. */
export const STANDARD_TUNING: readonly number[] = [64, 59, 55, 50, 45, 40];

/** Mechanics is how hands play; Theory is what you choose to play. */
export type PathKind = "mechanics" | "theory";

/**
 * How far a Path's content has got. A status is a claim about who has looked
 * at it: nothing moves past `draft` without an entry in `review.history`, and
 * no text may claim more than this says.
 */
export const REVIEW_STATUSES = ["draft", "agent-reviewed", "teacher-reviewed", "played"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Drives the reachability limits in `reach.ts`. */
export const PATH_LEVELS = ["beginner", "early-intermediate", "intermediate", "advanced"] as const;
export type PathLevel = (typeof PATH_LEVELS)[number];

export const TECHNIQUES = [
  "hammer",
  "pull",
  "slide",
  "bend",
  "vibrato",
  "palmMute",
  "letRing",
] as const;
export type PathTechnique = (typeof TECHNIQUES)[number];

/** A stroke, printed as guidance. Nothing in the app can check it. */
export type PickMark = "d" | "u";

export type PathNote = {
  /** 1 is the highest string, as in `SongNote`. */
  string: number;
  fret: number;
  /** The pitch of the fretted note. A bend's target is `midi + bend`. */
  midi: number;
  /** Ticks from the start of the Exercise; beat = tick / 960. */
  tick: number;
  dur: number;
  /**
   * `hammer` and `pull` go on the note they arrive at, `slide` on the note it
   * leaves, because that is what `src/songs/import.ts` produces.
   */
  tech: PathTechnique[];
  pick?: PickMark;
  accent?: true;
  /** Semitones. Only with the `bend` technique. */
  bend?: number;
};

export type PathRest = { tick: number; dur: number };

/**
 * - `graded`: the notes are the target, and the pass bars are measurable.
 * - `landings`: free playing, graded only at the landing moments.
 * - `selfChecked`: the player judges it against stated questions. No metric.
 * - `practiceOnly`: nothing to pass; playing it is the point.
 */
export const GRADING_MODES = ["graded", "landings", "selfChecked", "practiceOnly"] as const;
export type GradingMode = (typeof GRADING_MODES)[number];

/**
 * When the player hears the verdict. `afterTake` needs no new runtime thread;
 * `livePerBar` is the mock's per-bar strip, which is new work (audit §3).
 */
export const FEEDBACK_TIMINGS = ["afterTake", "livePerNote", "livePerBar", "none"] as const;
export type FeedbackTiming = (typeof FEEDBACK_TIMINGS)[number];

/** What the printed pick marks are claiming about the hand. */
export const PICK_PLANS = ["alternate", "sweep", "free"] as const;
export type PickPlan = (typeof PICK_PLANS)[number];

/** Which string crossings an alternate-picked Exercise is meant to contain. */
export const CROSSINGS = ["inside", "outside", "both", "none"] as const;
export type Crossing = (typeof CROSSINGS)[number];

export type TempoRung = {
  bpm: number;
  /** `graded` rungs use the pass bars; `selfChecked` rungs do not. */
  grading: "graded" | "selfChecked";
};

export type TempoLadder = {
  rungs: TempoRung[];
  /** The rung at which the pass bars decide the Exercise. Null: nothing does. */
  passAtBpm: number | null;
};

export type PassBar = {
  /** An id from `METRICS`. Nothing else. */
  metric: string;
  min?: number;
  max?: number;
  /** Consecutive bars this must hold over. */
  overBars: number;
};

export type LandingAccept = "chordTone" | "root" | "guideTone" | "third" | "seventh";

/** A moment in free playing that is graded, and the only thing that is. */
export type Landing = {
  bar: number;
  /** Quarter notes into the bar. */
  beat: number;
  chord: string;
  accept: LandingAccept;
  /** The accepted notes, spelled. */
  notes: string[];
};

export type ScaleHarmony = {
  kind: "scale";
  root: string;
  /** An id in `src/jam/scales.ts`. */
  scale: string;
  spelled: string[];
  /** When true, the tab must play every note of the scale. */
  cover: boolean;
};

export type ArpeggioHarmony = {
  kind: "arpeggio";
  chord: string;
  spelled: string[];
  cover: boolean;
};

/** Per-bar arpeggios: each bar plays only the tones of its chord in `chords`. */
export type ChordsHarmony = {
  kind: "chordTones";
  cover: boolean;
};

/** Written notes that sit in a scale over chords, downbeats on chord tones. */
export type ScaleOverChords = {
  kind: "scaleOverChords";
  root: string;
  scale: string;
  spelled: string[];
  cover: false;
  /** Pitch-class extras the line is allowed outside the scale, spelled. */
  allowed: string[];
};

export type Harmony = ScaleHarmony | ArpeggioHarmony | ChordsHarmony | ScaleOverChords;

export type Backing =
  | {
      kind: "click";
      /** Clicks per quarter note. */
      subdivision: 1 | 2 | 3 | 4;
    }
  | {
      kind: "jam";
      /** An id in `src/jam/grooves.ts`. */
      grooveId: string;
      feel: "straight" | "shuffle" | "swing";
      /** Key as `parseKey` reads it, e.g. "A blues". */
      key: string;
      /** A chart `parseChordChart` reads; one chord to a bar, as Jam is. */
      chart: string;
    };

export type HandPosition = {
  /** The fret under the index finger where the Exercise starts. */
  fret: number;
  shifts: "none" | "allowed";
};

export type ExerciseComputed = {
  /** Picked and legato notes the player plays. */
  noteCount: number;
  /** The tightest gap between two onsets, at the top rung. */
  minGapMsAtTop: number | null;
  /** Hand position changes in the cheapest fingering `reach.ts` found. */
  handShifts: number;
  /** The fastest tempo `reach.ts` found a fingering for, capped at 400. */
  maxPlayableBpm: number;
  difficulty: number;
};

/**
 * The ways an Exercise may change from Take to Take. Added 2026-11, additive: a
 * reader that only knows `notes` still gets a valid Exercise, the first variant.
 */
export const VARIATION_DIMENSIONS = ["key", "position", "stringSet", "shapeOrder", "progression"] as const;
export type VariationDimension = (typeof VARIATION_DIMENSIONS)[number];

/** One concrete set of known notes. Everything a Take needs to be graded. */
export type ExerciseVariant = {
  /** Stable. Store this on a Take: it is what makes the graded notes known. */
  id: string;
  label: string;
  params: Partial<Record<VariationDimension, string>>;
  /**
   * Variants with the same pool are the same difficulty, so they share progress
   * and clean tempo. Built from the values of the `notPooled` dimensions.
   */
  pool: string;
  tab: string;
  position: HandPosition;
  crossing: Crossing;
  notes: PathNote[];
  rests: PathRest[];
  guide?: PathNote[];
  chords?: string[];
  harmony?: Harmony;
  landings?: Landing[];
  backing: Backing;
  /** Only when this variant's bars differ from the Exercise's: slides lower them. */
  passBars?: PassBar[];
  computed: ExerciseComputed;
};

export type Variation = {
  /** Everything that changes between variants. */
  dimensions: VariationDimension[];
  /** Dimensions that do not change difficulty. Progress pools across them. */
  pooled: VariationDimension[];
  /** Dimensions that do, and why. Each value starts its own pool. */
  notPooled: Array<{ dimension: VariationDimension; reason: string }>;
  variants: ExerciseVariant[];
};

/** Set on a warm-up Exercise; such an Exercise lives in `Level.warmups`. */
export type WarmupPlan = {
  /** Start at this share of the reference Exercise's recent clean tempo. */
  startAtCleanRatio: number;
  /** Never go above this share of it. */
  topAtCleanRatio: number;
  /** Id of the Exercise whose clean tempo this reads. Same note grid. */
  referenceExercise: string;
  /** The tempo with no history yet. A rung on the ladder. */
  fallbackBpm: number;
  /** A warm-up reports and never decides anything about a Path. */
  advancesProgress: false;
};

/** Set on a chained-arpeggio Exercise: the sweep keeps going across the changes. */
export type ChainPlan = {
  /** The most the first note of a shape may sit from the last note, in frets. */
  maxJointFrets: number;
};

export type Exercise = {
  id: string;
  title: string;
  /** Why this Exercise exists: its musical or mechanical purpose. */
  purpose: string;
  howTo: string[];
  /** What the Coach may say about it. Never claims more than `graded`. */
  coachLine: string;
  grading: GradingMode;
  feedback: FeedbackTiming;
  /** Why this feedback timing, for the ones that need something built. */
  feedbackNote?: string;
  meter: { numerator: number; denominator: number };
  bars: number;
  loops: boolean;
  /** Stamina-style Exercises: keep it going this long. */
  holdSeconds?: number;
  position: HandPosition;
  pickPlan: PickPlan;
  /** Set when the first stroke flips on the next pass, on purpose. */
  pickFlipsOnLoop?: true;
  crossing: Crossing;
  /** `target`: scored against. `example`: one way to do it, never scored. */
  notesRole: "target" | "example";
  notes: PathNote[];
  rests: PathRest[];
  /** Played by the app, not the player: the call in a call and response. */
  guide?: PathNote[];
  /** One chord symbol per bar, when the Exercise has changes. */
  chords?: string[];
  harmony?: Harmony;
  landings?: Landing[];
  tempo: TempoLadder;
  passBars: PassBar[];
  /** Questions the player answers themselves. Required when self-checked. */
  selfCheck?: string[];
  /** Ids from `METRICS`. What the app measures here. */
  graded: string[];
  /** Ids from `NOT_GRADED`. What it does not, said out loud. */
  notGraded: string[];
  detection: {
    /** Ids from `DETECTION_FLAGS`. */
    flags: string[];
    /** One sentence per flag, shown to the player and on the review page. */
    notes: string[];
  };
  backing: Backing;
  estimatedMinutes: number;
  /** The source tab in the compact notation of `tabDsl.ts`. */
  tab: string;
  computed: ExerciseComputed;
  /** Present when notes change between Takes. `notes` above is variant 0. */
  variation?: Variation;
  warmup?: WarmupPlan;
  chain?: ChainPlan;
};

export type Step = {
  id: string;
  order: number;
  title: string;
  goal: string;
  why: string;
  howTo: string[];
  /** What the player can hear they have gained at the end of it. */
  payoff: string;
  prerequisites: string[];
  /** Median Exercise difficulty; see `difficulty.ts`. */
  difficulty: number;
  /** Required when this Step's difficulty is below the previous Step's. */
  difficultyException?: string;
  exercises: Exercise[];
};

export const LEVEL_IDS = ["beginner", "intermediate", "advanced"] as const;
export type LevelId = (typeof LEVEL_IDS)[number];

/**
 * An ordered group of Steps. A player may start at any Level: there is no gate,
 * and `Step.prerequisites` is guidance for the planner, never a lock.
 */
export type Level = {
  id: LevelId;
  title: string;
  summary: string;
  /** Always "open". Written down so no reader invents a gate. */
  entry: "open";
  /** The hand the reach check assumes on these Steps. Default: `PathDoc.level`. */
  reachLevel?: PathLevel;
  /** One screen: things a player can check on their own guitar. */
  placement: { startHereIf: string[] };
  /** Consecutive ids from `PathDoc.steps`, in order. */
  stepIds: string[];
  warmups: Exercise[];
};

export type ReviewEvent = {
  status: ReviewStatus;
  by: string;
  date: string;
  note: string;
};

export type PathDoc = {
  schemaVersion: typeof PATH_SCHEMA_VERSION;
  id: string;
  title: string;
  kind: PathKind;
  goal: string;
  level: PathLevel;
  assumes: string;
  prerequisites: { paths: string[]; skills: string[] };
  /** MIDI per string, string 1 first. */
  tuning: number[];
  review: { status: ReviewStatus; history: ReviewEvent[] };
  /** Why the Steps are in this order, and where it departs from the brief. */
  orderRationale: string;
  /** Where the grading can and cannot be trusted, for this Path. */
  gradingLimits: string;
  estimatedMinutes: number;
  /** Every Step, in order, whatever Level it belongs to. */
  steps: Step[];
  /** Absent only in packs written before Levels existed. */
  levels?: Level[];
};

/** Quarter-note ticks, the same constant `src/songs/types.ts` fixes. */
export const TICKS = 960;

export function barLengthTicks(meter: { numerator: number; denominator: number }): number {
  return (meter.numerator * TICKS * 4) / meter.denominator;
}
