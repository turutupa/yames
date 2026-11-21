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
import { variantIndexOf } from "../session/take";
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
  /**
   * Graded: its clean tempo before the week, null when it had none (`isNew`)
   * or when the Takes in memory do not reach back far enough to know it; and
   * at the week's end. Ungraded: the tempo played on its first and last day in
   * the week.
   */
  from: number | null;
  to: number;
  /** Graded: the week set this Exercise's first clean tempo ever (the long view says so). */
  isNew: boolean;
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
  /**
   * Graded, and the long view has not answered: what moved is not known yet
   * (M4), so this look-back is not shown; Progress shows the one computed
   * with the spans.
   */
  needsSpans: boolean;
  /** The week held Takes the counts leave out (marked not fair, or on the player's own exercises): the foot says so. */
  leftOut: boolean;
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
  /**
   * The long view (`listCleanTempoSpans`); null while it has not answered;
   * "unread" when the call failed (the look-back then says nothing of what moved).
   */
  spans: readonly CleanTempoSpanRow[] | null | "unread";
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

/**
 * The oldest Take in memory, or null: the store hands over its newest 500, so
 * a span whose first clean Take is older than this has Takes the card cannot
 * read.
 */
function oldestRead(progress: PlayerProgress): number | null {
  let oldest: number | null = null;
  for (const t of progress.takes) if (oldest === null || t.startedAt < oldest) oldest = t.startedAt;
  return oldest;
}

/**
 * Graded: the Exercises whose clean tempo moved in the week, measured against
 * the long view (c4b2's review, M4), never the newest 500 Takes alone:
 * - a span whose best (the clean tempo Progress shows, every Take read) was
 *   set before the week: the week moved nothing, whatever the Takes in memory
 *   say;
 * - a best set inside the week is above every clean tempo before it (the best
 *   is the earliest on a tie): it moved, to that best;
 * - a span whose first clean Take is in the week: the week set its first;
 * - a best set after the week: it moved that week only if the week's best
 *   clean Take beat the one before it, which needs the Takes in memory to
 *   reach back to the span's first clean Take; else nothing is said.
 * "From" is the clean tempo before the week, said only when the Takes in
 * memory reach back that far. Null spans (not answered yet): nothing is said.
 */
function cleanMoved(
  takes: readonly PathTakeRow[],
  paths: readonly PathDoc[],
  start: number,
  end: number,
  spans: readonly CleanTempoSpanRow[] | null,
  oldest: number | null,
): Moved[] {
  if (!spans) return [];
  const out: Moved[] = [];
  for (const span of spans) {
    if (span.bestAt < start || span.firstAt >= end) continue;
    const found = exerciseOf(paths, span.pathId, span.exerciseId);
    if (!found) continue;
    let was: number | null = null;
    let inWeek: number | null = null;
    for (const t of takes) {
      if (t.pathId !== span.pathId || t.exerciseId !== span.exerciseId) continue;
      if (t.startedAt >= end || !countsTowardCleanTempo(t)) continue;
      if (t.startedAt < start) was = Math.max(was ?? 0, t.bpm);
      else inWeek = Math.max(inWeek ?? 0, t.bpm);
    }
    const isNew = span.firstAt >= start;
    const complete = oldest !== null && oldest <= span.firstAt;
    const bestInWeek = span.bestAt < end;
    const to = bestInWeek ? span.bestBpm : inWeek;
    if (to === null) continue;
    // First in the week and best after it: `to` is the week's top in memory,
    // which is the week's top only when no Take of the week is older than the
    // oldest one read (c4b2b's re-read, LOW 8).
    if (isNew && !bestInWeek && !complete) continue;
    // Before the week: none (new), known (the Takes reach back), or not known.
    const from = isNew ? null : complete && was !== null && was < to ? was : null;
    if (!bestInWeek && !isNew && from === null) continue;
    out.push({ ...found, from, to, isNew, kind: "clean" });
  }
  return out.sort((a, b) => b.to - (b.from ?? b.to) - (a.to - (a.from ?? a.to)) || a.exercise.title.localeCompare(b.exercise.title));
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
    if (found) out.push({ ...found, from: first.bpm, to: last.bpm, isNew: false, kind: "played" });
  }
  return out.sort((a, b) => a.exercise.title.localeCompare(b.exercise.title));
}

/**
 * The newest benchmark Take in the week, beside the benchmark before it on the
 * same Exercise, the same version of it (`variantIndexOf`, `withVariant`'s
 * rule: the planner rotates a benchmark's variant like any step's) and the
 * same tempo; else nothing (c4b2's review, M3). Also the benchmark milestone's
 * reading (`milestones.ts`), over the last Session's span.
 */
export function benchmarkOf(takes: readonly PathTakeRow[], paths: readonly PathDoc[], start: number, end: number): Benchmark | null {
  const marked = takes
    .filter((t) => t.caught && !isMarkedNotFair(t) && factsOf(t).benchmark && evenOf(t) !== null)
    .sort((a, b) => b.startedAt - a.startedAt);
  for (const latest of marked) {
    if (latest.startedAt < start || latest.startedAt >= end) continue;
    const spec = factsOf(latest).benchmark!;
    const found = exerciseOf(paths, latest.pathId, latest.exerciseId);
    if (!found) continue;
    const version = variantIndexOf(found.exercise, latest.variantSeed);
    const earlier = marked.find(
      (t) =>
        t.startedAt < latest.startedAt &&
        t.pathId === latest.pathId &&
        t.exerciseId === latest.exerciseId &&
        t.bpm === latest.bpm &&
        variantIndexOf(found.exercise, t.variantSeed) === version &&
        factsOf(t).benchmark?.exerciseId === spec.exerciseId &&
        factsOf(t).benchmark?.bpm === spec.bpm &&
        (factsOf(t).benchmark?.day ?? 0) < spec.day,
    );
    if (!earlier) continue;
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
 * whose first and best already leave Takes marked not fair out (nf1). Said in
 * one look-back only (c4b2's review, L6): the week whose best first crossed
 * +20, not every later week in which the best rose again. That needs the
 * Takes before the week back to the span's first clean Take; when the Takes
 * in memory (`takes`, from `oldest` on) do not reach that far, it is not said.
 * A best set after the week does not hide a crossing inside it: the week's own
 * top clean Take is said, as the clean tempo it was then (LOW 3).
 */
export function bpmMilestones(
  spans: readonly CleanTempoSpanRow[],
  paths: readonly PathDoc[],
  start: number,
  end: number,
  takes: readonly PathTakeRow[],
  oldest: number | null,
): BpmMilestone[] {
  const out: BpmMilestone[] = [];
  for (const span of spans) {
    if (span.bestAt < start || span.firstAt >= end) continue;
    const mark = span.firstBpm + MILESTONE_BPM_UP;
    let best = { bpm: span.bestBpm, at: span.bestAt };
    if (span.bestAt >= end) {
      // The best came after the week, but the week may still be the one that
      // first crossed +20 (c4b2b's re-read, LOW 3): its own top clean Take,
      // read only when the Takes in memory hold the whole span up to it.
      if (oldest === null || oldest > span.firstAt) continue;
      let top: PathTakeRow | null = null;
      for (const t of takes) {
        if (t.pathId !== span.pathId || t.exerciseId !== span.exerciseId) continue;
        if (t.startedAt < start || t.startedAt >= end || !countsTowardCleanTempo(t)) continue;
        if (!top || t.bpm > top.bpm || (t.bpm === top.bpm && t.startedAt < top.startedAt)) top = t;
      }
      if (!top) continue;
      best = { bpm: top.bpm, at: top.startedAt };
    }
    if (best.bpm < mark) continue;
    if (span.firstAt < start) {
      if (oldest === null || oldest > span.firstAt) continue;
      const crossedBefore = takes.some(
        (t) =>
          t.pathId === span.pathId &&
          t.exerciseId === span.exerciseId &&
          t.startedAt < start &&
          t.bpm >= mark &&
          countsTowardCleanTempo(t),
      );
      if (crossedBefore) continue;
    }
    const found = exerciseOf(paths, span.pathId, span.exerciseId);
    if (!found) continue;
    out.push({ ...found, firstBpm: span.firstBpm, firstAt: span.firstAt, bestBpm: best.bpm, bestAt: best.at });
  }
  return out.sort((a, b) => b.bestBpm - b.firstBpm - (a.bestBpm - a.firstBpm));
}

function sentenceOf(
  graded: boolean,
  rows: Moved[],
  benchmark: Benchmark | null,
  counts: LookBack["counts"],
  exercises: number,
  leftOut: boolean,
): WeeklyLine {
  if (!graded) {
    return {
      key: leftOut ? "companion.weekly.say.ungradedLeftOut" : "companion.weekly.say.ungraded",
      values: { minutes: counts.minutes, sessions: counts.sessions, exercises },
    };
  }
  // A first clean tempo is its own row ("first clean tempo: 90"), not one that moved (L7).
  const moved = rows.filter((m) => !m.isNew);
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
  // L10: the counts leave Takes out, so the lines that quote them say so when
  // the week held any (without a number: a Take marked not fair is in none).
  const leftOut = progress.takes.some((t) => t.startedAt >= start && t.startedAt < end && (isMarkedNotFair(t) || t.pathId === MY_EXERCISES_PATH_ID));
  const exercises = new Set(inWeek.map((t) => `${t.pathId}/${t.exerciseId}`)).size;
  // A graded player whose whole week went ungraded is spoken to as ungraded.
  const gradedWeek = graded && inWeek.some((t) => !isUngradedTake(t));
  const oldest = oldestRead(progress);
  // The long view could not be read (c4b2b's re-read, LOW 2): what moved is not
  // known, so no moved rows, no milestone, and the sentence quotes the counts.
  const unread = input.spans === "unread";
  const spans = input.spans === "unread" ? null : input.spans;
  const moved = gradedWeek ? cleanMoved(takes, paths, start, end, spans, oldest) : playedMoved(inWeek, paths);
  const benchmark = gradedWeek ? benchmarkOf(takes, paths, start, end) : null;
  const milestones = gradedWeek && spans ? bpmMilestones(spans, paths, start, end, takes, oldest) : [];
  const stuck = gradedWeek ? (plateausNow(progress, paths, now, true)[0] ?? null) : null;
  return {
    start,
    end,
    graded: gradedWeek,
    needsSpans: gradedWeek && input.spans === null,
    leftOut,
    sentence: sentenceOf(gradedWeek && !unread, moved, benchmark, counts, exercises, leftOut),
    benchmark,
    moved,
    milestones,
    stuck,
    counts,
    goal: input.goal,
    canHearBoth: false,
  };
}
