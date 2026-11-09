/**
 * What an author writes. A spec is the short description of a Path; everything
 * mechanical (strokes, flags, the not-graded list, difficulty) is derived from
 * it by `generate.ts`, so the author cannot forget it and the validator can
 * still check it.
 */
import type {
  Crossing,
  FeedbackTiming,
  LandingAccept,
  PassBar,
  PathKind,
  PathLevel,
  PickMark,
  PickPlan,
  ReviewEvent,
  ReviewStatus,
} from "./format";

/**
 * - `timing`: evenness, notes heard, extras. The default for mechanics.
 * - `timingNotes`: the same, plus right notes after the take.
 * - `accents`: timing plus rough accent placement.
 * - `sweep`: slow-rung bars for swept notes.
 * - `stamina`: evenness over a long take and at its end.
 * - `written`: right notes after the take, for Theory lines.
 * - `attacksOnly`: only that each note was attacked when written; for bends.
 * - `writtenRhythm`: the rhythm is written, the notes are the player's, in scale.
 * - `inScale`: free playing, notes in the scale.
 * - `rests`: phrases and silence: rests kept, notes in the scale.
 * - `landing`: free playing, graded at the landing moments only.
 * - `selfChecked`, `practiceOnly`: no metric at all.
 */
export type GradeProfile =
  | "timing"
  | "timingNotes"
  | "accents"
  | "sweep"
  | "stamina"
  | "written"
  | "attacksOnly"
  | "writtenRhythm"
  | "inScale"
  | "rests"
  | "landing"
  | "selfChecked"
  | "practiceOnly";

export type HarmonySpec =
  | { scale: [root: string, scale: string]; cover?: boolean }
  | { arpeggio: string; cover?: boolean }
  | { chordTones: true; cover?: boolean }
  | { scaleOverChords: [root: string, scale: string]; allowed?: string[] };

export type ExerciseSpec = {
  id: string;
  title: string;
  purpose: string;
  howTo: string[];
  coach: string;
  /** The tab, written or from a template. See `tabDsl.ts`. */
  tab: string;
  /** Notes the app plays and the player does not. */
  guide?: string;
  /** The index-finger fret where it starts. */
  position: number;
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
};

export function definePath(spec: PathSpec): PathSpec {
  return spec;
}
