/**
 * What an author writes. A spec is the short description of a Path; everything
 * mechanical (strokes, flags, the not-graded list, difficulty) is derived from
 * it by `generate.ts`, so the author cannot forget it and the validator can
 * still check it.
 */
import type {
  Crossing,
  FeedbackTiming,
  LevelId,
  LandingAccept,
  PassBar,
  PathKind,
  PathLevel,
  PickMark,
  PickPlan,
  ReviewEvent,
  ReviewStatus,
  VariationDimension,
} from "./format";

/**
 * - `timing`: evenness, notes heard, extras. The default for mechanics.
 * - `timingNotes`: the same, plus right notes after the take.
 * - `accents`: timing plus rough accent placement.
 * - `sweep`: slow-rung bars for swept notes.
 * - `sweepTiming`: swept notes graded on timing only (evenness, notes heard,
 *   extras): right notes on a sweep mostly read "not checked", so they are not
 *   promised. Extras are what catch a note left ringing into the next.
 * - `stamina`: evenness over a long take and at its end.
 * - `written`: right notes after the take, for Theory lines.
 * - `attacksOnly`: only that each note was attacked when written; for bends.
 * - `writtenRhythm`: the rhythm is written, the notes are the player's, in scale.
 * - `inScale`: free playing, notes in the scale.
 * - `rests`: phrases and silence: rests kept, notes in the scale.
 * - `landing`: free playing, graded at the landing moments only.
 * - `warmup`: a light bar that reports and decides nothing.
 * - `selfChecked`, `practiceOnly`: no metric at all.
 */
export type GradeProfile =
  | "timing"
  | "timingNotes"
  | "accents"
  | "sweep"
  | "sweepTiming"
  | "stamina"
  | "written"
  | "attacksOnly"
  | "writtenRhythm"
  | "inScale"
  | "rests"
  | "landing"
  | "warmup"
  | "selfChecked"
  | "practiceOnly";

export type HarmonySpec =
  | { scale: [root: string, scale: string]; cover?: boolean }
  | { arpeggio: string; cover?: boolean }
  | { chordTones: true; cover?: boolean }
  | { scaleOverChords: [root: string, scale: string]; allowed?: string[] };

/** What one combination of a variation's values plays. */
export type VariantBuild = {
  tab: string;
  guide?: string;
  position?: number;
  shifts?: boolean;
  chords?: string;
  harmony?: HarmonySpec;
  jam?: ExerciseSpec["jam"];
};

export type VariantParams = Record<string, string>;

/**
 * The dimensions an Exercise may vary along. Every combination of the values
 * becomes a variant, in order, each with known notes and the same validation.
 * Say of each dimension whether it changes difficulty: `pooled` means progress
 * and clean tempo carry across it; `notPooled` needs a reason and splits them.
 */
export type VarySpec = {
  values: Partial<Record<VariationDimension, readonly string[]>>;
  pooled?: readonly VariationDimension[];
  notPooled?: Partial<Record<VariationDimension, string>>;
  label?: (params: VariantParams) => string;
  build: (params: VariantParams) => VariantBuild;
};

export type ExerciseSpec = {
  id: string;
  title: string;
  purpose: string;
  howTo: string[];
  coach: string;
  /** The tab, written or from a template. See `tabDsl.ts`. Optional with `vary`. */
  tab?: string;
  vary?: VarySpec;
  /** Marks a warm-up. Listed under a Level, not under a Step. */
  warmup?: { start: number; top: number; reference: string; fallback: number };
  /** Marks a chained-arpeggio Exercise, held to the chain rules. */
  chain?: { maxJointFrets: number };
  /** Notes the app plays and the player does not. */
  guide?: string;
  /** The index-finger fret where it starts. Optional with `vary`. */
  position?: number;
  /** Set when the hand moves. Default: it stays put. */
  shifts?: boolean;
  pick?: PickPlan;
  pickStart?: PickMark;
  pickFlipsOnLoop?: true;
  /** Declared, then checked against the strokes. Omitted: read from them. */
  crossing?: Crossing;
  loops?: boolean;
  holdSeconds?: number;
  harmony?: HarmonySpec;
  /** One symbol a bar, `A7 | D7 | ...`. */
  chords?: string;
  /** Band behind it. Otherwise a click. */
  jam?: { groove: string; key: string; feel?: "straight" | "shuffle" | "swing" };
  click?: 1 | 2 | 3 | 4;
  rungs: readonly number[];
  /** Default: the highest rung that may be graded. */
  passAt?: number;
  grade: GradeProfile;
  /** Replaces the profile's pass bars when the Exercise needs its own. */
  pass?: PassBar[];
  /** Metrics to add to or remove from the profile's list. */
  alsoGraded?: string[];
  landings?: {
    at: "bar" | "change" | readonly number[];
    accept: LandingAccept;
  };
  /** Notes are an example, not a target. Implied by `landing`, `inScale`. */
  example?: boolean;
  selfCheck?: string[];
  feedback?: FeedbackTiming;
  feedbackNote?: string;
  minutes: number;
};

export type StepSpec = {
  id: string;
  title: string;
  goal: string;
  why: string;
  howTo: string[];
  payoff: string;
  /** Step ids. Default: the Step before it. */
  prerequisites?: string[];
  difficultyException?: string;
  exercises: ExerciseSpec[];
};

export type LevelSpec = {
  id: LevelId;
  title: string;
  summary: string;
  reachLevel?: PathLevel;
  startHereIf: string[];
  /** Step ids, in the order they appear in `PathSpec.steps`. */
  steps: string[];
  warmups: ExerciseSpec[];
};

export type PathSpec = {
  id: string;
  title: string;
  kind: PathKind;
  goal: string;
  level: PathLevel;
  assumes: string;
  prerequisites?: { paths?: string[]; skills?: string[] };
  review?: { status: ReviewStatus; history: ReviewEvent[] };
  orderRationale: string;
  gradingLimits: string;
  steps: StepSpec[];
  levels?: LevelSpec[];
  /**
   * Write each Exercise's `subdivision` into the pack, from its notes. Opt-in so
   * Paths written before it generate the same bytes.
   *
   * `true` labels every Exercise with the tightest grid its notes move in, and
   * fails on one with no nameable grid. `"mostly"` labels an Exercise only when
   * that grid is what most of its notes actually move in, and leaves the rest
   * unlabelled: a swung line (quarter-note triplet, eighth-note triplet) is not
   * "triplets", and an etude of eighths with a sixteenth run is not "16ths"
   * (QA 2 #14). The music and the grading are the same either way.
   */
  labelSubdivisions?: boolean | "mostly";
  /**
   * Re-space every Exercise's ladder from its pass tempo (UX audit TODAY-4,
   * 2026-11-17): the first rung at about 0.6 of the pass, the top kept, six to
   * eight rungs, no jump over 25%. A ladder that starts at 50 whatever the note
   * grid leaves a four-minute block no way to reach a pass. The pass tempo and
   * the top rung stay as written; warm-ups and self-checked Exercises keep theirs. Opt-in, so a Path
   * written without it generates the same bytes. See `paceLadder` in `pace.ts`.
   */
  paceLadders?: boolean;
};

export function definePath(spec: PathSpec): PathSpec {
  return spec;
}
