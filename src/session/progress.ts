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
  /**
   * Which Session this Take was in: the Session's start, in ms. Older rows have
   * none, and are grouped by the day they were played on (`sessionKeyOf`).
   */
  session?: number;
  /** The plan's role for the step it was played in (`PlanStep.role`). */
  role?: string;
  /** The planner's reason code for that step, kept for the export. */
  reason?: string;
  /** This Take raised the Exercise's clean tempo. What parking counts. */
  newClean?: boolean;
  /** A benchmark Take: the same Exercise at the same tempo on days 1, 7, 14, 21. */
  benchmark?: { day: number; exerciseId: string; bpm: number };
  /** The player's answer to "Was this grade fair?". Absent: not asked or not answered. */
  fair?: "yes" | "no";
};

export type PlayerProgress = {
  /** Paths this player has started. */
  states: PathStateRow[];
  /** Newest first. */
  takes: PathTakeRow[];
  ceilings: ExerciseCeilingRow[];
  /**
   * Paths the player has unsubscribed from. Their `path_state` row and every
   * Take stay, so subscribing again picks up where they were. Kept in the
   * settings store (`session.unsubscribed`), not in SQLite.
   */
  unsubscribed?: string[];
};

export const NO_PROGRESS: PlayerProgress = { states: [], takes: [], ceilings: [] };

/**
 * The share of a Step's graded Exercises that finishes it: about three of four
 * (`plans/tasks/mvp/CONTENT.md`, progression). The rest go to reviews.
 */
export const STEP_DONE_SHARE = 0.75;

/** How many of `count` graded Exercises finish a Step: 4 → 3, 3 → 2, 2 → 2, 1 → 1. */
export function passesNeeded(count: number): number {
  if (count <= 0) return 0;
  return Math.max(1, Math.min(count, Math.round(count * STEP_DONE_SHARE)));
}

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

/**
 * Is this Step done: about three quarters of what the app can grade in it
 * passed (`passesNeeded`)? The Exercises left over go to reviews.
 */
export function isStepPassed(progress: PlayerProgress, pathId: string, step: Step): boolean {
  const gradable = step.exercises.filter(isGradable);
  if (gradable.length === 0) return false;
  const done = gradable.filter((ex) => isExercisePassed(progress, pathId, ex)).length;
  return done >= passesNeeded(gradable.length);
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

/** Which Session a Take was played in: its tag, or the day for an older row. */
export function sessionKeyOf(take: PathTakeRow): string {
  const session = factsOf(take).session;
  return typeof session === "number" ? `s${session}` : `d${Math.floor(take.startedAt / 86_400_000)}`;
}

/** Is this Path subscribed: started, and not unsubscribed since? */
export function isSubscribed(progress: PlayerProgress, pathId: string): boolean {
  return (
    progress.states.some((s) => s.pathId === pathId) &&
    !(progress.unsubscribed ?? []).includes(pathId)
  );
}
