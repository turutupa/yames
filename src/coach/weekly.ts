/**
 * The weekly look-back (DESIGN 6.2, mock 10). Pure: Takes in, a card's
 * content out, every number with the window it covers.
 *
 * Which week: the last whole calendar week (the one before the week `now` is
 * in), in the player's region's week (`playerWeekStart`). With fewer than
 * `LOOK_BACK_MIN_SESSIONS` Sessions in it there is no look-back, and nothing
 * is said about that.
 *
 * In order: one sentence; the benchmark when the week holds one (graded);
 * what moved, from → to; anything stuck, as the plateau question
 * (`nudges.ts`); the counts as one line at the foot. With grading off it
 * speaks of minutes and tempos only: no clean tempo, no benchmark, no plateau.
 *
 * "Hear day 1 and day 7" is not offered: a Path Take keeps no recording. The
 * only audio the app holds is the last heard Take's, in memory, until the
 * input stops (`hearTake` in `ipc.ts`), so day 1's is never there on day 7.
 *
 * What is never read (owner decision 3, t2b): a Take the player marked not
 * fair counts in no number here (no tempo moved by it, no benchmark from it,
 * not in the counts at the foot); Takes on the player's own exercises
 * (`my-exercises`) are not a Path's progress and are left out; an Exercise
 * that no longer exists is not named (every span is joined to one that does).
 */
import type { CleanTempoSpanRow, PathTakeRow } from "../ipc";
import type { Exercise, PathDoc } from "../paths/format";
import { findExercise } from "../session/packs";
import { countsTowardCleanTempo, factsOf, isMarkedNotFair, isUngradedTake, type PlayerProgress } from "../session/progress";
import { weekStartOf, weekTotals, type Weekday } from "../session/totals";
import { MY_EXERCISES_PATH_ID } from "../session/myExercises";
import type { CoachGoal } from "./store";
import { plateausNow, type Plateau } from "./nudges";

/** DESIGN 6.2: a week with fewer Sessions has no look-back. */
export const LOOK_BACK_MIN_SESSIONS = 3;
/** DESIGN 6.5: a clean tempo up this much on one Exercise is a milestone. */
export const MILESTONE_BPM_UP = 20;

/** One line of the card: an i18n key and its values. */
export type WeeklyLine = { key: string; values: Record<string, string | number> };

/** One Exercise whose tempo moved inside the week. */
export type Moved = {
  path: PathDoc;
  exercise: Exercise;
  /** Graded: its clean tempo before the week (null: none yet) and at its end. Ungraded: the tempo played on its first and last day in the week. */
  from: number | null;
  to: number;
  /** "clean": a clean tempo (graded); "played": the tempo played (ungraded). */
  kind: "clean" | "played";
};

/** DESIGN 6.5's "clean tempo up 20 BPM on one Exercise", from the long view (c4b1). */
export type BpmMilestone = {
  path: PathDoc;
  exercise: Exercise;
  firstBpm: number;
  firstAt: number;
  bestBpm: number;
  bestAt: number;
};

export type Benchmark = {
  path: PathDoc;
  exercise: Exercise;
  bpm: number;
  /** The benchmark days, as the plan numbers them (1, 7, 14, 21). */
  fromDay: number;
  toDay: number;
  /** Evenness, as whole percents. */
  fromEven: number;
  toEven: number;
};

export type LookBack = {
  /** The week: local midnight on its first day, and on the next week's. */
  start: number;
  end: number;
  graded: boolean;
  sentence: WeeklyLine;
  benchmark: Benchmark | null;
  moved: Moved[];
  milestones: BpmMilestone[];
  /** The plateau question, when one is open now (graded only). */
  stuck: Plateau | null;
  counts: { sessions: number; minutes: number; takes: number };
  /** The player's goal, quoted when set (`coach.goal`). */
  goal: CoachGoal | null;
  /** Always false today: no Path Take keeps a recording (see the file's head). */
  canHearBoth: false;
};

export type LookBackInput = {
  progress: PlayerProgress;
  paths: readonly PathDoc[];
  /** The long view (`listCleanTempoSpans`); null while it has not answered. */
  spans: readonly CleanTempoSpanRow[] | null;
  now: number;
  weekStart: Weekday;
  /** The player grades their playing (grading not "off"). */
  graded: boolean;
  goal: CoachGoal | null;
};

/**
 * The player's region's first day of the week (c4b1's review): the region of
 * the system's locale, not the app's language. `navigator.language`, else
 * `Intl`'s resolved locale, else the app's language.
 */
export function playerWeekStart(appLanguage: string): Weekday {
  const candidates: Array<string | undefined> = [
    typeof navigator !== "undefined" ? navigator.language : undefined,
    (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().locale;
      } catch {
        return undefined;
      }
    })(),
    appLanguage,
  ];
  const locale = candidates.find((c) => typeof c === "string" && c.length > 0);
  return weekStartOf(locale ?? appLanguage);
}

type Found = { path: PathDoc; exercise: Exercise };

function exerciseOf(paths: readonly PathDoc[], pathId: string, exerciseId: string): Found | null {
  if (pathId === MY_EXERCISES_PATH_ID) return null;
  const path = paths.find((p) => p.id === pathId);
  const found = path ? findExercise(path, exerciseId) : null;
  return path && found ? { path, exercise: found.exercise } : null;
}

const evenOf = (take: PathTakeRow): number | null => {
  const v = factsOf(take).measures?.evenness;
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : null;
};

/** Graded: the clean tempo before the week and at its end, per Exercise, where it rose. */
function cleanMoved(
  takes: readonly PathTakeRow[],
  paths: readonly PathDoc[],
  end: number,
  start: number,
  spans: readonly CleanTempoSpanRow[] | null,
): Moved[] {
  const before = new Map<string, number>();
  const after = new Map<string, number>();
  for (const take of takes) {
    if (take.startedAt >= end || !countsTowardCleanTempo(take)) continue;
    const id = `${take.pathId}/${take.exerciseId}`;
    const into = take.startedAt < start ? before : after;
    into.set(id, Math.max(into.get(id) ?? 0, take.bpm));
  }
  const out: Moved[] = [];
  for (const [id, best] of after) {
    const was = before.get(id) ?? null;
    if (was !== null && best <= was) continue;
    const [pathId, ...rest] = id.split("/");
    // No clean tempo before the week in the Takes read, but the long view has
    // one from before it (past the 500-Take window): the "from" is not known
    // here, so the row is not said rather than said as new.
    const span = spans?.find((s) => s.pathId === pathId && s.exerciseId === rest.join("/"));
    if (was === null && span && span.firstAt < start) continue;
    const found = exerciseOf(paths, pathId, rest.join("/"));
    if (found) out.push({ ...found, from: was, to: best, kind: "clean" });
  }
  return out.sort((a, b) => b.to - (b.from ?? 0) - (a.to - (a.from ?? 0)) || a.exercise.title.localeCompare(b.exercise.title));
}

/** Ungraded: the tempo played on the first and on the last day in the week, where they differ. */
function playedMoved(inWeek: readonly PathTakeRow[], paths: readonly PathDoc[]): Moved[] {
  const byEx = new Map<string, PathTakeRow[]>();
  for (const take of inWeek) {
    const id = `${take.pathId}/${take.exerciseId}`;
    byEx.set(id, [...(byEx.get(id) ?? []), take]);
  }
  const out: Moved[] = [];
  for (const list of byEx.values()) {
    const sorted = [...list].sort((a, b) => a.startedAt - b.startedAt);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first.bpm === last.bpm) continue;
    const found = exerciseOf(paths, first.pathId, first.exerciseId);
    if (found) out.push({ ...found, from: first.bpm, to: last.bpm, kind: "played" });
  }
  return out.sort((a, b) => a.exercise.title.localeCompare(b.exercise.title));
}

/** The newest benchmark Take in the week, beside the benchmark before it on the same Exercise and tempo. */
function benchmarkOf(takes: readonly PathTakeRow[], paths: readonly PathDoc[], start: number, end: number): Benchmark | null {
  const marked = takes
    .filter((t) => t.caught && !isMarkedNotFair(t) && factsOf(t).benchmark && evenOf(t) !== null)
    .sort((a, b) => b.startedAt - a.startedAt);
  for (const latest of marked) {
    if (latest.startedAt < start || latest.startedAt >= end) continue;
    const spec = factsOf(latest).benchmark!;
    const earlier = marked.find(
      (t) =>
        t.startedAt < latest.startedAt &&
        t.pathId === latest.pathId &&
        factsOf(t).benchmark?.exerciseId === spec.exerciseId &&
        factsOf(t).benchmark?.bpm === spec.bpm &&
        (factsOf(t).benchmark?.day ?? 0) < spec.day,
    );
    if (!earlier) continue;
    const found = exerciseOf(paths, latest.pathId, latest.exerciseId);
    if (!found) continue;
    return {
      ...found,
      bpm: spec.bpm,
      fromDay: factsOf(earlier).benchmark!.day,
      toDay: spec.day,
      fromEven: evenOf(earlier)!,
      toEven: evenOf(latest)!,
    };
  }
  return null;
}

/**
 * DESIGN 6.5's "clean tempo up 20 BPM on one Exercise": from the long view,
 * whose first and best already leave Takes marked not fair out (nf1). Only a
 * best reached inside the week, so each is said in one look-back only.
 */
export function bpmMilestones(
  spans: readonly CleanTempoSpanRow[],
  paths: readonly PathDoc[],
  start: number,
  end: number,
): BpmMilestone[] {
  const out: BpmMilestone[] = [];
  for (const span of spans) {
    if (span.bestAt < start || span.bestAt >= end) continue;
    if (span.bestBpm - span.firstBpm < MILESTONE_BPM_UP) continue;
    const found = exerciseOf(paths, span.pathId, span.exerciseId);
    if (!found) continue;
    out.push({ ...found, firstBpm: span.firstBpm, firstAt: span.firstAt, bestBpm: span.bestBpm, bestAt: span.bestAt });
  }
  return out.sort((a, b) => b.bestBpm - b.firstBpm - (a.bestBpm - a.firstBpm));
}

function sentenceOf(graded: boolean, moved: Moved[], benchmark: Benchmark | null, counts: LookBack["counts"], exercises: number): WeeklyLine {
  if (!graded) {
    return { key: "companion.weekly.say.ungraded", values: { minutes: counts.minutes, sessions: counts.sessions, exercises } };
  }
  const better = benchmark !== null && benchmark.toEven > benchmark.fromEven;
  if (moved.length === 0) {
    return better
      ? { key: "companion.weekly.say.benchOnly", values: { fromDay: benchmark!.fromDay } }
      : { key: "companion.weekly.say.held", values: { sessions: counts.sessions, exercises } };
  }
  const values = { count: moved.length, ...(better ? { fromDay: benchmark!.fromDay } : {}) };
  if (moved.length === 1) return { key: better ? "companion.weekly.say.oneAndBench" : "companion.weekly.say.one", values };
  return { key: better ? "companion.weekly.say.manyAndBench" : "companion.weekly.say.many", values };
}

/**
 * The look-back for the last whole calendar week, or null when that week
 * holds fewer than three Sessions (counted over the Takes that count here).
 */
export function lookBack(input: LookBackInput): LookBack | null {
  const { progress, paths, now, weekStart, graded } = input;
  // Owner decision 3 and t2b: a Take marked not fair, or on the player's own
  // exercises, is in no number of the card.
  const takes = progress.takes.filter((t) => !isMarkedNotFair(t) && t.pathId !== MY_EXERCISES_PATH_ID);
  const { lastWeek } = weekTotals(takes, paths, now, weekStart);
  if (lastWeek.sessions < LOOK_BACK_MIN_SESSIONS) return null;
  const { start, end } = lastWeek;
  const inWeek = takes.filter((t) => t.startedAt >= start && t.startedAt < end);
  const counts = { sessions: lastWeek.sessions, minutes: lastWeek.minutes, takes: lastWeek.takes };
  const exercises = new Set(inWeek.map((t) => `${t.pathId}/${t.exerciseId}`)).size;
  // A graded player whose whole week went ungraded is spoken to as ungraded.
  const gradedWeek = graded && inWeek.some((t) => !isUngradedTake(t));
  const moved = gradedWeek ? cleanMoved(takes, paths, end, start, input.spans) : playedMoved(inWeek, paths);
  const benchmark = gradedWeek ? benchmarkOf(takes, paths, start, end) : null;
  const milestones = gradedWeek && input.spans ? bpmMilestones(input.spans, paths, start, end) : [];
  const stuck = gradedWeek ? (plateausNow(progress, paths, now, true)[0] ?? null) : null;
  return {
    start,
    end,
    graded: gradedWeek,
    sentence: sentenceOf(gradedWeek, moved, benchmark, counts, exercises),
    benchmark,
    moved,
    milestones,
    stuck,
    counts,
    goal: input.goal,
    canHearBoth: false,
  };
}
