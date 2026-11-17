/**
 * Play now across every subscribed Path: who leads, what is due, what rests.
 *
 * The product reviewer's algorithm (`plans/tasks/mvp/CONTENT.md`, "Play now across
 * all subscribed Paths"), as the questions the planner asks of the history. Every
 * answer is derived from rows the store already keeps (`path_state`, `path_takes`
 * and their `facts`, `exercise_ceilings`) and nothing here writes: a Take tagged
 * with its Session, its role and whether it raised the clean tempo is enough to
 * know when a Path last led, whether an Exercise is parked, and when a review is
 * due. Pure and deterministic, like the planner (`BRIEF.md` rule 3).
 */
import type { Exercise, PathDoc, Step } from "../paths/format";
import type { PathTakeRow } from "../ipc";
import { firstRung, rungBelow } from "./ladder";
import {
  calendarDaysBetween,
  cleanTempoOf,
  currentStepOf,
  daysBetween,
  factsOf,
  isExercisePassed,
  isGradable,
  isStepPassed,
  sessionKeyOf,
  takesOf,
} from "./progress";
import type { PlayerProgress } from "./progress";

export const DAY_MS = 86_400_000;

/** At most this many subscribed Paths in the test. */
export const SUBSCRIPTION_CAP = 4;
/** A Path unplayed this long jumps the queue to lead. */
export const JUMP_QUEUE_DAYS = 4;
/** Spaced reviews, in days: a pass moves to the next, a slip back one. */
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30] as const;
/** Sessions in a row without a new clean rung before an Exercise is parked. */
export const PARK_AFTER_SESSIONS = 3;
/** How long it stays parked. */
export const PARK_DAYS = 2;
/** The benchmark days, counted from the day the Path was subscribed (day 1). */
export const BENCHMARK_DAYS = [1, 7, 14, 21] as const;
/** How long after its day a benchmark can still be taken. */
export const BENCHMARK_WINDOW_DAYS = 7;
/** How many early Steps placement tries, one Exercise each. */
export const PLACEMENT_STEPS = 3;

/** One Exercise, with where it lives. */
export type ExercisePick = { path: PathDoc; step: Step; exercise: Exercise };

/** Plan roles that make a Path the one that led its Session. */
const LEADING_ROLES = new Set(["focus", "placement"]);

function stateOf(progress: PlayerProgress, pathId: string) {
  return progress.states.find((s) => s.pathId === pathId);
}

/** When the player last played anything on this Path, or null. */
export function lastPlayedAt(progress: PlayerProgress, pathId: string): number | null {
  return progress.takes.find((t) => t.pathId === pathId)?.startedAt ?? null;
}

/** When this Path last led a Session, or null. */
export function lastFocusAt(progress: PlayerProgress, pathId: string): number | null {
  const take = progress.takes.find(
    (t) => t.pathId === pathId && LEADING_ROLES.has(String(factsOf(t).role)),
  );
  return take?.startedAt ?? null;
}

/** A Path the player has never played: its first Session offers placement. */
export function isNewPath(progress: PlayerProgress, pathId: string): boolean {
  return !progress.takes.some((t) => t.pathId === pathId);
}

/** How many Sessions there have been, from the tags (or the days, for old rows). */
export function sessionCount(progress: PlayerProgress): number {
  return new Set(progress.takes.map(sessionKeyOf)).size;
}

export type FocusChoice = {
  path: PathDoc;
  /** It jumped the queue: unplayed this many days. */
  awayDays: number | null;
};

/**
 * Which Path leads today: the one that has waited longest to lead, the player's
 * order breaking ties; a Path unplayed for four days or more jumps the queue.
 *
 * `paths` is in the player's order. A Path never led has waited since it was
 * subscribed.
 */
export function pickFocus(
  paths: readonly PathDoc[],
  progress: PlayerProgress,
  now: number,
): FocusChoice | null {
  if (paths.length === 0) return null;
  if (paths.length === 1) return { path: paths[0], awayDays: null };
  const rows = paths.map((path, order) => {
    const played = lastPlayedAt(progress, path.id) ?? stateOf(progress, path.id)?.startedAt ?? null;
    const waited = lastFocusAt(progress, path.id) ?? stateOf(progress, path.id)?.startedAt ?? 0;
    return { path, order, played, waited };
  });
  const away = rows
    .filter((r) => r.played !== null && calendarDaysBetween(r.played, now) >= JUMP_QUEUE_DAYS)
    .sort((a, b) => (a.played ?? 0) - (b.played ?? 0) || a.order - b.order);
  if (away.length > 0) {
    return { path: away[0].path, awayDays: calendarDaysBetween(away[0].played ?? now, now) };
  }
  const longest = [...rows].sort((a, b) => a.waited - b.waited || a.order - b.order)[0];
  return { path: longest.path, awayDays: null };
}

/** The other Paths, the one played longest ago first (never played before that). */
export function othersByLastPlayed(
  paths: readonly PathDoc[],
  focus: PathDoc,
  progress: PlayerProgress,
): PathDoc[] {
  return paths
    .map((path, order) => ({ path, order, played: lastPlayedAt(progress, path.id) ?? -1 }))
    .filter((r) => r.path.id !== focus.id)
    .sort((a, b) => a.played - b.played || a.order - b.order)
    .map((r) => r.path);
}

/** Takes on one Exercise, oldest first, grouped by the Session they were in. */
function sessionsOf(takes: readonly PathTakeRow[]): PathTakeRow[][] {
  const groups = new Map<string, PathTakeRow[]>();
  for (const take of [...takes].sort((a, b) => a.startedAt - b.startedAt)) {
    const key = sessionKeyOf(take);
    const group = groups.get(key);
    if (group) group.push(take);
    else groups.set(key, [take]);
  }
  return [...groups.values()];
}

/**
 * Until when this Exercise is parked, or null: three Sessions in a row with no
 * new clean rung park it for two days ("coming back fresh"). The count starts
 * again after a park, so it gets three more Sessions when it comes back.
 */
export function parkedUntil(
  progress: PlayerProgress,
  pathId: string,
  exercise: Exercise,
): number | null {
  if (isExercisePassed(progress, pathId, exercise)) return null;
  const sessions = sessionsOf(takesOf(progress, pathId, exercise.id).filter((t) => t.caught));
  let best = 0;
  let streak = 0;
  let until: number | null = null;
  for (const group of sessions) {
    let raised = false;
    for (const take of group) {
      const flag = factsOf(take).newClean;
      const rose = flag ?? (take.passed && take.bpm > best);
      if (take.passed) best = Math.max(best, take.bpm);
      if (rose) raised = true;
    }
    streak = raised ? 0 : streak + 1;
    if (streak >= PARK_AFTER_SESSIONS) {
      until = group[group.length - 1].startedAt + PARK_DAYS * DAY_MS;
      streak = 0;
    }
  }
  return until;
}

export function isParked(
  progress: PlayerProgress,
  pathId: string,
  exercise: Exercise,
  now: number,
): boolean {
  const until = parkedUntil(progress, pathId, exercise);
  return until !== null && now < until;
}

export type ReviewState = ExercisePick & {
  /** When the next review is due. */
  dueAt: number;
  /** The interval it is on, in days. */
  intervalDays: number;
  /** Reviews failed in a row; each takes the review a rung lower. */
  slips: number;
  /** The tempo the review is at: the clean tempo, a rung lower per slip. */
  bpm: number;
  /** When it was passed or last reviewed. */
  since: number;
};

/**
 * Where a passed Exercise stands on the review ladder (1, 3, 7, 14, 30 days).
 *
 * Read from the Takes played as reviews since it was passed, a Session at a time:
 * a Session with a passing review moves it to the next interval; one without
 * marks it slipped, takes it back one interval and a rung of tempo below.
 */
export function reviewStateOf(progress: PlayerProgress, pick: ExercisePick): ReviewState | null {
  const { path, exercise } = pick;
  if (!isGradable(exercise) || !isExercisePassed(progress, path.id, exercise)) return null;
  const clean = cleanTempoOf(progress, path.id, exercise.id) ?? firstRung(exercise);
  const passAt = exercise.tempo.passAtBpm ?? clean;
  const takes = takesOf(progress, path.id, exercise.id);
  const ascending = [...takes].sort((a, b) => a.startedAt - b.startedAt);
  const passTake = ascending.find((t) => t.passed && t.bpm >= passAt);
  const ceiling = progress.ceilings.find((c) => c.exerciseKey === `${path.id}/${exercise.id}`);
  let since = passTake?.startedAt ?? ceiling?.lastPracticed ?? 0;
  let at = 0;
  let slips = 0;
  const reviews = ascending.filter(
    (t) => t.caught && t.startedAt > since && factsOf(t).role === "review",
  );
  for (const group of sessionsOf(reviews)) {
    if (group.some((t) => t.passed)) {
      at = Math.min(at + 1, REVIEW_INTERVALS.length - 1);
      slips = 0;
    } else {
      at = Math.max(0, at - 1);
      slips += 1;
    }
    since = group[group.length - 1].startedAt;
  }
  const intervalDays = REVIEW_INTERVALS[at];
  return {
    ...pick,
    dueAt: since + intervalDays * DAY_MS,
    intervalDays,
    slips,
    bpm: slips > 0 ? rungBelow(exercise, clean, slips) : clean,
    since,
  };
}

/** Every gradable Exercise of a Path, with its Step. */
function everyExercise(path: PathDoc): ExercisePick[] {
  return path.steps.flatMap((step) =>
    step.exercises.filter(isGradable).map((exercise) => ({ path, step, exercise })),
  );
}

export type DueItem =
  | ({ kind: "review" } & ReviewState)
  | (ExercisePick & { kind: "leftover"; dueAt: number });

/**
 * What is due for review across these Paths, the most overdue first: passed
 * Exercises whose interval has come, then the Exercises a done Step left behind
 * (a Step is done at about three of four; the rest are reviewed, a day apart).
 */
export function dueReviews(
  paths: readonly PathDoc[],
  progress: PlayerProgress,
  now: number,
): DueItem[] {
  const reviews: DueItem[] = [];
  const leftovers: DueItem[] = [];
  for (const path of paths) {
    const current = currentStepOf(progress, path);
    const at = path.steps.findIndex((s) => s.id === current.id);
    for (const pick of everyExercise(path)) {
      const state = reviewStateOf(progress, pick);
      if (state) {
        if (state.dueAt <= now) reviews.push({ kind: "review", ...state });
        continue;
      }
      const stepAt = path.steps.findIndex((s) => s.id === pick.step.id);
      const stepDone = stepAt < at || isStepPassed(progress, path.id, pick.step);
      if (!stepDone || stepAt === at) continue;
      const last = takesOf(progress, path.id, pick.exercise.id)[0]?.startedAt ?? 0;
      const dueAt = last + DAY_MS;
      if (dueAt <= now) leftovers.push({ kind: "leftover", ...pick, dueAt });
    }
  }
  reviews.sort((a, b) => a.dueAt - b.dueAt);
  leftovers.sort((a, b) => a.dueAt - b.dueAt);
  return [...reviews, ...leftovers];
}

export type BenchmarkDue = ExercisePick & { day: number; bpm: number };

/**
 * The benchmark Take due on this Path today, or null.
 *
 * Days 1, 7, 14 and 21 since it was subscribed: the same Exercise at the same
 * tempo every time, fixed by the first one (the Exercise its first Session was
 * on, at its clean tempo then or its first rung), so the four can be compared.
 * A missed day is skipped rather than made up late: the latest day reached is
 * the one due, unless it or a later one is already on record.
 */
export function benchmarkDue(
  path: PathDoc,
  progress: PlayerProgress,
  now: number,
): BenchmarkDue | null {
  const state = stateOf(progress, path.id);
  // Subscribed, and past its first Session: that one is placement's.
  if (!state || isNewPath(progress, path.id)) return null;
  const startedAt = state.startedAt;
  const dayIndex = Math.max(0, daysBetween(startedAt, now));
  let k = -1;
  for (let i = 0; i < BENCHMARK_DAYS.length; i += 1) if (dayIndex >= BENCHMARK_DAYS[i] - 1) k = i;
  if (k < 0) return null;
  const day = BENCHMARK_DAYS[k];
  // A week late is too late: that benchmark is skipped, not made up.
  if (dayIndex >= day - 1 + BENCHMARK_WINDOW_DAYS) return null;
  const marked = progress.takes.filter((t) => t.pathId === path.id && factsOf(t).benchmark);
  if (marked.some((t) => (factsOf(t).benchmark?.day ?? 0) >= day)) return null;
  const first = [...marked].sort((a, b) => a.startedAt - b.startedAt)[0];
  const spec = first ? factsOf(first).benchmark : undefined;
  if (spec) {
    const found = everyExercise(path).find((p) => p.exercise.id === spec.exerciseId);
    return found ? { ...found, day, bpm: spec.bpm } : null;
  }
  const step = currentStepOf(progress, path);
  const pick =
    everyExercise(path).find((p) => p.step.id === step.id) ?? everyExercise(path)[0] ?? null;
  if (!pick) return null;
  const bpm = cleanTempoOf(progress, path.id, pick.exercise.id) ?? firstRung(pick.exercise);
  return { ...pick, day, bpm };
}

/**
 * What placement tries on a new Path: the first gradable Exercise of each of
 * the early Steps, from the one the player is on.
 */
export function placementPicks(path: PathDoc, progress: PlayerProgress): ExercisePick[] {
  const current = currentStepOf(progress, path);
  const from = Math.max(0, path.steps.findIndex((s) => s.id === current.id));
  const out: ExercisePick[] = [];
  for (const step of path.steps.slice(from)) {
    const exercise = step.exercises.find(isGradable);
    if (exercise) out.push({ path, step, exercise });
    if (out.length >= PLACEMENT_STEPS) break;
  }
  return out;
}

/** A self-checked "your turn" item worth a short block: not graded, with notes to show. */
export function yourTurnPicks(path: PathDoc, progress: PlayerProgress): ExercisePick[] {
  const step = currentStepOf(progress, path);
  const at = Math.max(0, path.steps.findIndex((s) => s.id === step.id));
  const out: ExercisePick[] = [];
  for (const s of path.steps.slice(0, at + 1).reverse()) {
    for (const exercise of s.exercises) {
      if (exercise.grading !== "graded" && exercise.notes.length > 0) out.push({ path, step: s, exercise });
    }
  }
  return out;
}

/**
 * A fun finisher: a riff, lick or etude written to be played with the band,
 * that the player already has a clean tempo for. The one played longest ago.
 */
export function finisherPick(
  paths: readonly PathDoc[],
  progress: PlayerProgress,
): (ExercisePick & { bpm: number }) | null {
  const out: Array<ExercisePick & { bpm: number; last: number }> = [];
  for (const path of paths) {
    for (const pick of everyExercise(path)) {
      if (pick.exercise.backing.kind !== "jam") continue;
      const clean = cleanTempoOf(progress, path.id, pick.exercise.id);
      if (clean === null) continue;
      const last = takesOf(progress, path.id, pick.exercise.id)[0]?.startedAt ?? 0;
      out.push({ ...pick, bpm: clean, last });
    }
  }
  out.sort((a, b) => a.last - b.last);
  const best = out[0];
  return best ? { path: best.path, step: best.step, exercise: best.exercise, bpm: best.bpm } : null;
}
