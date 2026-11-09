/**
 * Where a player stands, derived from what the store keeps.
 *
 * Pure, and the only reader of the store's rows: the planner, the Paths list and
 * Progress all ask here, so "is this Step done" has one definition.
 */
import type { Exercise, PathDoc, Step } from "../paths/format";
import type { ExerciseCeilingRow, PathStateRow, PathTakeRow } from "../ipc";
import type { TakeMeasures } from "./takeMeasures";
import type { TakeVerdict } from "./grade";

/** What `PathTakeRow.facts` holds. Everything optional: old rows stay readable. */
export type TakeFacts = {
  measures?: Partial<TakeMeasures>;
  verdict?: TakeVerdict;
  /** The metric the result was about, and its value. */
  headlineMetric?: string;
  headlineValue?: number | null;
  headlineMin?: number;
  headlineMax?: number;
};

export type PlayerProgress = {
  /** Paths this player has started. */
  states: PathStateRow[];
  /** Newest first. */
  takes: PathTakeRow[];
  ceilings: ExerciseCeilingRow[];
};

export const NO_PROGRESS: PlayerProgress = { states: [], takes: [], ceilings: [] };

export function ceilingKey(pathId: string, exerciseId: string): string {
  return `${pathId}/${exerciseId}`;
}

/** The clean tempo for one Exercise, or null. */
export function cleanTempoOf(
  progress: PlayerProgress,
  pathId: string,
  exerciseId: string,
): number | null {
  const key = ceilingKey(pathId, exerciseId);
  return progress.ceilings.find((c) => c.exerciseKey === key)?.cleanBpm ?? null;
}

/** Takes on one Exercise, newest first. Ungraded ones included. */
export function takesOf(
  progress: PlayerProgress,
  pathId: string,
  exerciseId: string,
): PathTakeRow[] {
  return progress.takes.filter((t) => t.pathId === pathId && t.exerciseId === exerciseId);
}

/** Can this Exercise be passed by the app at all? */
export function isGradable(exercise: Exercise): boolean {
  return exercise.grading === "graded" && exercise.tempo.passAtBpm !== null;
}

/** Has the player passed this Exercise: its clean tempo reached the pass rung? */
export function isExercisePassed(progress: PlayerProgress, pathId: string, ex: Exercise): boolean {
  const clean = cleanTempoOf(progress, pathId, ex.id);
  const passAt = ex.tempo.passAtBpm;
  return clean !== null && passAt !== null && clean >= passAt;
}

/** Is everything the app can grade in this Step passed? */
export function isStepPassed(progress: PlayerProgress, pathId: string, step: Step): boolean {
  const gradable = step.exercises.filter(isGradable);
  return gradable.length > 0 && gradable.every((ex) => isExercisePassed(progress, pathId, ex));
}

/** The Step this player is on: the stored one, or the Path's first. */
export function currentStepOf(progress: PlayerProgress, path: PathDoc): Step {
  const state = progress.states.find((s) => s.pathId === path.id);
  const stored = path.steps.find((s) => s.id === state?.currentStepId);
  return stored ?? path.steps[0];
}

/**
 * The Step a player should be on once this one is passed, or null to stay.
 *
 * Only ever forward, and only one Step at a time: a player who chose a later
 * Step keeps it. Nothing here locks anything; a Step can always be picked by hand.
 */
export function nextStepAfterPass(
  progress: PlayerProgress,
  path: PathDoc,
): Step | null {
  const current = currentStepOf(progress, path);
  if (!isStepPassed(progress, path.id, current)) return null;
  const at = path.steps.findIndex((s) => s.id === current.id);
  return path.steps[at + 1] ?? null;
}

/** Whole days between two instants. */
export function daysBetween(earlier: number, later: number): number {
  return Math.floor((later - earlier) / 86_400_000);
}

/** The most recent Take that was actually heard, at any tempo. */
export function lastCaughtTake(takes: readonly PathTakeRow[]): PathTakeRow | null {
  return takes.find((t) => t.caught) ?? null;
}

/** Read a row's facts, tolerating anything an older build wrote. */
export function factsOf(take: PathTakeRow): TakeFacts {
  return take.facts && typeof take.facts === "object" ? (take.facts as TakeFacts) : {};
}
