/**
 * Plateaus (DESIGN 6.3): an Exercise played in `PARK_AFTER_SESSIONS`
 * Sessions in a row without a new clean tempo. Pure.
 *
 * The planner already parks such an Exercise for `PARK_DAYS` on its own
 * (`parkedUntil` in `session/rotation.ts`), at the moment the third Session
 * ends, before anyone could ask. That is kept as it is (c4b2: no change to
 * `planner.ts` or `rotation.ts`): the coach's question is asked only while the
 * planner has the Exercise parked, so "rest it till Saturday" names the day
 * the plan really brings it back, and the other two answers are proposals the
 * player confirms in Ask (play it anyway; swap the part that stands in for
 * it). Nothing here changes the plan.
 *
 * The count is the coach's own, over the Takes the player did not mark not
 * fair (owner decision 3): a Take marked not fair neither breaks the streak
 * nor is one of its Sessions, and its tempo is never quoted. When that count
 * and the planner's disagree (a marked Take raised the ceiling), there is no
 * question: the sentence would quote a streak the plan did not act on.
 *
 * Takes on the player's own exercises (`my-exercises`) are never read.
 */
import type { PathTakeRow } from "../ipc";
import type { Exercise, PathDoc } from "../paths/format";
import { findExercise } from "../session/packs";
import {
  countsTowardCleanTempo,
  isExercisePassed,
  isMarkedNotFair,
  sessionKeyOf,
  type PlayerProgress,
} from "../session/progress";
import { PARK_AFTER_SESSIONS, parkedUntil } from "../session/rotation";
import { MY_EXERCISES_PATH_ID } from "../session/myExercises";

export type Plateau = {
  path: PathDoc;
  exercise: Exercise;
  /** Sessions in a row without a new clean tempo (at least `PARK_AFTER_SESSIONS`). */
  sessions: number;
  /** The fastest tempo played in each of those Sessions: the lowest and the highest. */
  low: number;
  high: number;
  /** When the plan brings it back (the planner's own `parkedUntil`). */
  restsUntil: number;
  /** The newest Take of the streak: the question is about this episode. */
  lastAt: number;
  /** An id for this episode, for "answered this run". */
  key: string;
};

/** Takes of one Exercise that the coach may count: caught, not marked not fair; oldest first. */
function countable(takes: readonly PathTakeRow[], pathId: string, exerciseId: string): PathTakeRow[] {
  return takes
    .filter((t) => t.pathId === pathId && t.exerciseId === exerciseId && t.caught && !isMarkedNotFair(t))
    .sort((a, b) => a.startedAt - b.startedAt);
}

/** The trailing Sessions without a new clean tempo, by the coach's count, oldest first. */
function trailingStreak(takes: readonly PathTakeRow[]): PathTakeRow[][] {
  const groups: PathTakeRow[][] = [];
  const index = new Map<string, number>();
  for (const take of takes) {
    const key = sessionKeyOf(take);
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, groups.length);
      groups.push([take]);
    } else groups[at].push(take);
  }
  let best = 0;
  let streak: PathTakeRow[][] = [];
  for (const group of groups) {
    let raised = false;
    for (const take of group) {
      if (countsTowardCleanTempo(take) && take.bpm > best) {
        best = take.bpm;
        raised = true;
      }
    }
    streak = raised ? [] : [...streak, group];
  }
  return streak;
}

/**
 * The plateaus now, newest first: Exercises the planner has parked at `now`
 * and whose last `PARK_AFTER_SESSIONS` Sessions or more, by the coach's own
 * count, earned no new clean tempo. Graded play only: an ungraded player has
 * no clean tempo to be stuck at (`graded` false: none).
 */
export function plateausNow(
  progress: PlayerProgress,
  paths: readonly PathDoc[],
  now: number,
  graded: boolean,
): Plateau[] {
  if (!graded) return [];
  const seen = new Set<string>();
  const out: Plateau[] = [];
  for (const take of progress.takes) {
    if (take.pathId === MY_EXERCISES_PATH_ID) continue;
    const id = `${take.pathId}/${take.exerciseId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const path = paths.find((p) => p.id === take.pathId);
    const found = path ? findExercise(path, take.exerciseId) : null;
    if (!path || !found) continue; // an Exercise that no longer exists is not named
    const exercise = found.exercise;
    if (isExercisePassed(progress, path.id, exercise)) continue;
    const until = parkedUntil(progress, path.id, exercise);
    if (until === null || now >= until) continue;
    const streak = trailingStreak(countable(progress.takes, path.id, exercise.id));
    if (streak.length < PARK_AFTER_SESSIONS) continue;
    const tops = streak.map((group) => Math.max(...group.map((t) => t.bpm)));
    const last = streak[streak.length - 1];
    const lastAt = Math.max(...last.map((t) => t.startedAt));
    out.push({
      path,
      exercise,
      sessions: streak.length,
      low: Math.min(...tops),
      high: Math.max(...tops),
      restsUntil: until,
      lastAt,
      key: `${id}@${lastAt}`,
    });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}
