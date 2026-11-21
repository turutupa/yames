/**
 * Where a player stands, derived from what the store keeps.
 *
 * Pure, and the only reader of the store's rows: the planner, the Paths list and
 * Progress all ask here, so "is this Step done" has one definition.
 */
import type { Exercise, Level, PathDoc, Step } from "../paths/format";
import type { ExerciseCeilingRow, PathStateRow, PathTakeRow } from "../ipc";
import type { TakeMeasures } from "./takeMeasures";
import type { TakeVerdict } from "./grade";
import { CLEAN_TEMPO_MIN_BARS } from "./grade";

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
  /**
   * Played without grading (owner, 2026-11-18): the input was off and the
   * player chose to play anyway, or Settings has grading off. Practice, so it
   * counts toward minutes and the streak; never an attempt at the bar.
   */
  ungraded?: "inputOff" | "gradingOff" | "chosen" | "eyes";
  /**
   * Where the Take sat in time, per bar of the pattern (DESIGN 9.3): the signed
   * mean deviation of each pattern bar's heard notes, in ms, relative to the
   * Take's median (positive is late). Relative because the scorer's lag
   * correction absorbs a lean the whole Take shares. `null` for a pattern bar
   * with no heard note. Absent: nothing heard, or an older row.
   */
  lean?: Array<number | null>;
  /**
   * The player's answer after an ungraded Take to "Did they?" (DESIGN 4.4).
   * Moves no tempo. Absent: not asked or not answered.
   */
  heardIt?: "yes" | "notYet";
  /**
   * "This one is for your eyes" (DESIGN 4.2, "Watch your pick"): the player's
   * own answer to "Did any beat start on an upstroke?" after a Take played
   * ungraded to watch the pick. Kept like `heardIt`; moves nothing.
   */
  upstroke?: "yes" | "no";
};

/** A row's answer to "Did any beat start on an upstroke?", when it has one. */
export function upstrokeOf(take: PathTakeRow): "yes" | "no" | null {
  const answer = factsOf(take).upstroke;
  return answer === "yes" || answer === "no" ? answer : null;
}

/** The same row with that answer kept on it. */
export function withUpstroke(take: PathTakeRow, upstroke: "yes" | "no"): PathTakeRow {
  return { ...take, facts: { ...factsOf(take), upstroke } };
}

/** A row's `lean`, when it holds one a reader can trust. */
export function leanOf(take: PathTakeRow): Array<number | null> | null {
  const lean = factsOf(take).lean;
  if (!Array.isArray(lean) || lean.length === 0) return null;
  return lean.every((v) => v === null || (typeof v === "number" && Number.isFinite(v))) ? lean : null;
}

/** A row's answer to "Did they?", when it has one. */
export function heardItOf(take: PathTakeRow): "yes" | "notYet" | null {
  const answer = factsOf(take).heardIt;
  return answer === "yes" || answer === "notYet" ? answer : null;
}

/** The same row with the player's answer to "Did they?" kept on it. */
export function withHeardIt(take: PathTakeRow, heardIt: "yes" | "notYet"): PathTakeRow {
  return { ...take, facts: { ...factsOf(take), heardIt } };
}

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

/** The player answered "no" to "Was this grade fair?" for this Take. */
export function isMarkedNotFair(take: PathTakeRow): boolean {
  return factsOf(take).fair === "no";
}

/**
 * Did this Take hold a clean tempo, whatever the player said about it after:
 * caught, passed, and eight bars in a row that held. The same reading as
 * `clean_tempo_spans_sql` in `src-tauri/src/db.rs`, in the same order: a Take
 * that raised the ceiling (`newClean`) counts; else the scorer's own answer
 * (`measures.pass.countsForCleanTempo`); else a row that says it did not raise
 * it holds no record and does not count; else (a row from before `newClean`)
 * eight bars or more.
 */
export function heldCleanTempo(take: PathTakeRow): boolean {
  if (!take.caught || !take.passed) return false;
  const facts = factsOf(take);
  if (facts.newClean === true) return true;
  const scorer = facts.measures?.pass?.countsForCleanTempo;
  if (typeof scorer === "boolean") return scorer;
  if (facts.newClean !== undefined && facts.newClean !== null) return false;
  return take.bars >= CLEAN_TEMPO_MIN_BARS;
}

/**
 * Does this Take count toward a clean tempo the app shows or quotes: it held
 * one, and the player did not mark its grade not fair (owner, 1k questions,
 * item 3). Unmarking it (answering "yes") counts it again.
 */
export function countsTowardCleanTempo(take: PathTakeRow): boolean {
  return heldCleanTempo(take) && !isMarkedNotFair(take);
}

/**
 * The clean tempo the app shows and quotes for one Exercise, or null.
 *
 * The stored ceiling (`cleanTempoOf`) keeps only the highest clean tempo ever
 * saved, Takes marked not fair included, and it stays what the planner, the
 * Step's pass and the standing read. This is the number a player sees: the
 * ceiling, unless a Take marked not fair is what holds it; then the fastest
 * clean Take not marked so, from the Takes in memory (the store's newest 500),
 * and null when there is none. Not zero: no clean tempo.
 */
export function shownCleanTempoOf(
  progress: PlayerProgress,
  pathId: string,
  exerciseId: string,
): number | null {
  return shownCleanTempo(progress, pathId, exerciseId).bpm;
}

/** `shownCleanTempoOf`, and whether it is the ceiling as stored (no Take marked not fair holds it). */
function shownCleanTempo(
  progress: PlayerProgress,
  pathId: string,
  exerciseId: string,
): { bpm: number | null; stored: boolean } {
  const ceiling = cleanTempoOf(progress, pathId, exerciseId);
  if (ceiling === null) return { bpm: null, stored: true };
  const takes = takesOf(progress, pathId, exerciseId);
  const notFair = takes.some((t) => t.bpm >= ceiling && isMarkedNotFair(t) && heldCleanTempo(t));
  if (!notFair) return { bpm: ceiling, stored: true };
  const fair = takes.filter(countsTowardCleanTempo);
  return { bpm: fair.length > 0 ? Math.max(...fair.map((t) => t.bpm)) : null, stored: false };
}

/**
 * The Take that set the shown clean tempo (`shownCleanTempoOf`), when the
 * Takes in memory hold it: the earliest Take not marked not fair that counts
 * at that tempo. When the shown tempo is the stored ceiling, only the Take
 * that raised it (`newClean`) is that Take: a later one at the same tempo
 * moved nothing.
 */
export function shownCleanTempoTakeOf(
  progress: PlayerProgress,
  pathId: string,
  exerciseId: string,
): PathTakeRow | null {
  const shown = shownCleanTempo(progress, pathId, exerciseId);
  if (shown.bpm === null) return null;
  const at = takesOf(progress, pathId, exerciseId).filter(
    (t) => t.bpm === shown.bpm && countsTowardCleanTempo(t) && (!shown.stored || factsOf(t).newClean === true),
  );
  return at.length > 0 ? at[at.length - 1] : null;
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

/**
 * The Level this player chose on this Path, or null: none chosen, the Path has
 * no Levels, or the stored id is one the Path no longer offers.
 */
export function chosenLevelOf(progress: PlayerProgress, path: PathDoc): Level | null {
  const id = progress.states.find((s) => s.pathId === path.id)?.level;
  if (!id) return null;
  return (path.levels ?? []).find((l) => l.id === id) ?? null;
}

/** Where a Level starts in `path.steps`: the index of its first Step, 0 if it has none. */
export function levelStartIndex(path: PathDoc, level: Level | null): number {
  if (!level) return 0;
  const at = path.steps.findIndex((s) => s.id === level.stepIds[0]);
  return Math.max(0, at);
}

/**
 * A Step below the Level the player chose, and not passed: skipped, the way a
 * Test out or a placement skips a Step (owner, 2026-11-17: "Levels must
 * actually do something"). The planner starts past it and does not send its
 * Exercises back as leftovers; the Path page marks it skipped. It is never
 * locked: Play this still plays it, and choosing a lower Level, or this Step,
 * brings it back.
 */
export function isStepSkipped(progress: PlayerProgress, path: PathDoc, step: Step): boolean {
  const level = chosenLevelOf(progress, path);
  if (!level) return false;
  const at = path.steps.findIndex((s) => s.id === step.id);
  return at >= 0 && at < levelStartIndex(path, level) && !isStepPassed(progress, path.id, step);
}

/**
 * The Step a Level puts the player on: its first Step not passed yet, or its
 * first if every one is. What choosing a Level sets as the current Step.
 */
export function levelEntryStep(progress: PlayerProgress, path: PathDoc, level: Level): Step {
  const start = levelStartIndex(path, level);
  const own = path.steps.slice(start).filter((s) => level.stepIds.includes(s.id));
  return own.find((s) => !isStepPassed(progress, path.id, s)) ?? own[0] ?? path.steps[start] ?? path.steps[0];
}

/** The Level a Step belongs to, or null for a Path without Levels. */
export function levelOfStep(path: PathDoc, stepId: string): Level | null {
  return (path.levels ?? []).find((l) => l.stepIds.includes(stepId)) ?? null;
}

/**
 * The Step this player is on: the stored one, or the Path's first, and never
 * below the Level they chose. A row written before Levels did anything can say
 * Intermediate and Step 1; it means Intermediate.
 */
export function currentStepOf(progress: PlayerProgress, path: PathDoc): Step {
  const state = progress.states.find((s) => s.pathId === path.id);
  const storedAt = path.steps.findIndex((s) => s.id === state?.currentStepId);
  const floor = levelStartIndex(path, chosenLevelOf(progress, path));
  return path.steps[Math.max(storedAt, floor)] ?? path.steps[0];
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

/**
 * Calendar days between two instants, in local time: "yesterday" is the day
 * before, whatever the hour. What a sentence about days means.
 */
export function calendarDaysBetween(earlier: number, later: number): number {
  const day = (at: number) => {
    const d = new Date(at);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return Math.round((day(later) - day(earlier)) / 86_400_000);
}

/** A Take played without grading, on purpose: practice, never an attempt at the bar. */
export function isUngradedTake(take: PathTakeRow): boolean {
  return factsOf(take).ungraded !== undefined;
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
