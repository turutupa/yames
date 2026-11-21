/**
 * Milestones (DESIGN 6.5), pure: the stored Takes in, the milestones the
 * player's last Session earned out. The "up 20 BPM" one lives in the weekly
 * look-back (`weekly.ts`, `bpmMilestones`); this file has the rest:
 *
 * - the first Exercise passed;
 * - a Step finished (enough of its Exercises passed: `passesNeeded`), and the
 *   Step it opens;
 * - a Level finished, or a whole Path, quoting the Path's own words (the
 *   `payoff` of its last Step);
 * - the benchmark improved (the same Take, same tempo and version, more even
 *   than on its earlier day: `benchmarkOf`).
 *
 * Each is said once, in this sense: it is on offer only while the Take that
 * earned it is in the player's last Session (`lastSessionOf`) and no more than
 * `MILESTONE_FRESH_DAYS` old. The next Session ends it. Whether a card was
 * shown is memory only (c4a1b: nothing is stored without a press); "Hide"
 * quiets the kind through `coach.cards`, as every proactive card.
 *
 * What is never read (owner decision 3): a Take the player marked not fair
 * counts for no milestone. "Passed" here is the clean tempo the app shows
 * (`shownCleanTempoOf`, what Progress shows) at or over the pass mark, and the
 * Take that passed it is one that counts (`countsTowardCleanTempo`). Every
 * number a sentence quotes is one the app measured and shows. Takes on the
 * player's own exercises (`my-exercises`) are not a Path's progress and earn
 * nothing. With grading off nothing is passed, so there is nothing to say.
 */
import type { PathTakeRow } from "../ipc";
import type { Exercise, PathDoc, Step } from "../paths/format";
import {
  chosenLevelOf,
  countsTowardCleanTempo,
  isGradable,
  levelStartIndex,
  passesNeeded,
  shownCleanTempoOf,
  takesOf,
  type PlayerProgress,
} from "../session/progress";
import { MY_EXERCISES_PATH_ID } from "../session/myExercises";
import { lastSessionOf } from "./todayLine";
import { benchmarkOf, type WeeklyLine } from "./weekly";

/** A milestone older than this is not offered, even with no Session since. */
export const MILESTONE_FRESH_DAYS = 7;

export type MilestoneKind = "firstPassed" | "stepDone" | "levelDone" | "pathDone" | "benchmark";

export type Milestone = {
  kind: MilestoneKind;
  /** What it is about, stable across renders: the budget's offer key. */
  key: string;
  /** When the Take that earned it started. */
  at: number;
  /** The card's sentence: an i18n key under `companion.milestone` and its values. */
  line: WeeklyLine;
  /** The Path's own words, quoted as they are (Level and Path done), else null. */
  payoff: string | null;
};

const DAY_MS = 86_400_000;

/** When an Exercise was passed, as far as the Takes in memory tell. */
type Passed = {
  exercise: Exercise;
  /** The earliest Take that counts at or over the pass mark; null when the Takes in memory do not reach it. */
  take: PathTakeRow | null;
  /** The clean tempo the app shows. */
  bpm: number;
};

/** Passed, not counting a Take marked not fair: the shown clean tempo at or over the pass mark. */
function passedOf(progress: PlayerProgress, pathId: string, exercise: Exercise): Passed | null {
  if (!isGradable(exercise)) return null;
  const passAt = exercise.tempo.passAtBpm!;
  const bpm = shownCleanTempoOf(progress, pathId, exercise.id);
  if (bpm === null || bpm < passAt) return null;
  // Newest first: the last one found is the earliest.
  const counting = takesOf(progress, pathId, exercise.id).filter((t) => t.bpm >= passAt && countsTowardCleanTempo(t));
  return { exercise, take: counting.length > 0 ? counting[counting.length - 1] : null, bpm };
}

/** When a Step was finished: the Take that made enough of its Exercises passed. Null: not finished, or not known. */
function stepFinish(progress: PlayerProgress, pathId: string, step: Step): { take: PathTakeRow | null; passed: number; count: number } | null {
  const gradable = step.exercises.filter(isGradable);
  if (gradable.length === 0) return null;
  const passed = gradable.map((ex) => passedOf(progress, pathId, ex)).filter((p): p is Passed => p !== null);
  const needed = passesNeeded(gradable.length);
  if (passed.length < needed) return null;
  // An Exercise passed before the Takes in memory begin counts as earliest.
  const times = passed.map((p) => p.take).sort((a, b) => (a?.startedAt ?? -Infinity) - (b?.startedAt ?? -Infinity));
  return { take: times[needed - 1], passed: passed.length, count: gradable.length };
}

/** The latest finishing Take over these Steps, or null when one is not finished or not known. */
function allFinished(progress: PlayerProgress, pathId: string, steps: readonly Step[]): PathTakeRow | null {
  if (steps.length === 0) return null;
  let last: PathTakeRow | null = null;
  for (const step of steps) {
    const done = stepFinish(progress, pathId, step);
    if (!done) return null;
    if (done.take && (last === null || done.take.startedAt > last.startedAt)) last = done.take;
  }
  return last;
}

/** The Steps a player is held to on this Path: from the chosen Level's start on (a Step below it is skipped, not owed). */
function owedSteps(progress: PlayerProgress, path: PathDoc): Step[] {
  return path.steps.slice(levelStartIndex(path, chosenLevelOf(progress, path)));
}

/**
 * The milestones the last Session earned, newest first. Empty with grading
 * off, with no Takes, or when the last Session is older than
 * `MILESTONE_FRESH_DAYS`. At most one per Path for its Steps, Level and the
 * Path itself (the largest: a Take that finishes the Path finishes its last
 * Level and Step too).
 */
export function milestonesNow(progress: PlayerProgress, paths: readonly PathDoc[], now: number, graded: boolean): Milestone[] {
  if (!graded) return [];
  const session = lastSessionOf(progress.takes);
  if (session.length === 0) return [];
  const ids = new Set(session.map((t) => t.id));
  const inSession = (take: PathTakeRow | null): take is PathTakeRow =>
    take !== null && ids.has(take.id) && now - take.startedAt < MILESTONE_FRESH_DAYS * DAY_MS;
  const own = paths.filter((p) => p.id !== MY_EXERCISES_PATH_ID);
  const out: Milestone[] = [];

  // The first Exercise passed: the earliest pass anywhere is in this Session.
  let first: { path: PathDoc; passed: Passed } | null = null;
  let unknownEarlier = false;
  for (const path of own) {
    for (const step of path.steps) {
      for (const ex of step.exercises) {
        const passed = passedOf(progress, path.id, ex);
        if (!passed) continue;
        if (passed.take === null) unknownEarlier = true;
        else if (first === null || passed.take.startedAt < first.passed.take!.startedAt) first = { path, passed };
      }
    }
  }
  if (first && !unknownEarlier && inSession(first.passed.take)) {
    const { exercise, take, bpm } = first.passed;
    out.push({
      kind: "firstPassed",
      key: `firstPassed:${first.path.id}/${exercise.id}`,
      at: take!.startedAt,
      line: { key: "firstPassed", values: { exercise: exercise.title, bpm, passAt: exercise.tempo.passAtBpm! } },
      payoff: null,
    });
  }

  for (const path of own) {
    const owed = owedSteps(progress, path);
    const pathDone = allFinished(progress, path.id, owed);
    if (inSession(pathDone)) {
      const last = path.steps[path.steps.length - 1];
      out.push({
        kind: "pathDone",
        key: `pathDone:${path.id}`,
        at: pathDone.startedAt,
        line: { key: "pathDone", values: { path: path.title } },
        payoff: last?.payoff || null,
      });
      continue;
    }
    let said = false;
    for (const level of path.levels ?? []) {
      const steps = owed.filter((s) => level.stepIds.includes(s.id));
      // A Level the chosen one starts above is not owed, and not finished by skipping it.
      if (steps.length !== level.stepIds.length) continue;
      const done = allFinished(progress, path.id, steps);
      if (!inSession(done)) continue;
      const last = steps[steps.length - 1];
      out.push({
        kind: "levelDone",
        key: `levelDone:${path.id}/${level.id}`,
        at: done.startedAt,
        line: { key: "levelDone", values: { level: level.title, path: path.title } },
        payoff: last.payoff || null,
      });
      said = true;
      break;
    }
    if (said) continue;
    for (const step of owed) {
      const done = stepFinish(progress, path.id, step);
      if (!done || !inSession(done.take)) continue;
      const at = path.steps.findIndex((s) => s.id === step.id);
      const next = path.steps[at + 1] ?? null;
      const values: Record<string, string | number> = { step: step.title, passed: done.passed, count: done.count };
      if (next) values.next = next.title;
      out.push({
        kind: "stepDone",
        key: `stepDone:${path.id}/${step.id}`,
        at: done.take.startedAt,
        line: { key: next ? (done.passed < done.count ? "stepDoneRest" : "stepDone") : "stepDoneLast", values },
        payoff: null,
      });
      break;
    }
  }

  // The benchmark improved, in the last Session.
  const start = Math.min(...session.map((t) => t.startedAt));
  const end = Math.max(...session.map((t) => t.startedAt)) + 1;
  const bench = benchmarkOf(progress.takes, own, start, end);
  if (bench && bench.toEven > bench.fromEven && now - start < MILESTONE_FRESH_DAYS * DAY_MS) {
    out.push({
      kind: "benchmark",
      key: `benchmark:${bench.path.id}/${bench.exercise.id}/${bench.toDay}`,
      at: start,
      line: {
        key: "benchmark",
        values: { exercise: bench.exercise.title, bpm: bench.bpm, fromDay: bench.fromDay, toDay: bench.toDay, from: bench.fromEven, to: bench.toEven },
      },
      payoff: null,
    });
  }

  return out.sort((a, b) => b.at - a.at);
}
