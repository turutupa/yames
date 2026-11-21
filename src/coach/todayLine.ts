/**
 * Today's line (DESIGN 6.1, 3.1; mock 01): the coach's one sentence above the
 * plan. It says what the plan's rows cannot ("where", not the number), from
 * stored rows only, and nothing at all when it would only repeat them.
 *
 * Pure: the plan, the stored Takes and clean tempos, the Paths and the clock
 * in; at most two `Line`s out (a measured fact about the last Session, then
 * what today's plan does with it). The rules every sentence is held to:
 *
 * - a measured fact from a stored row, or a statement of what today's plan
 *   does; never a streak, never "you missed a day", never praise for showing
 *   up, nothing about the microphone;
 * - a sentence about history names its window (earlier today, yesterday, last
 *   Session): every one of them is about the player's last Session;
 * - "Today starts there" only when the plan's first Exercise is that Exercise,
 *   on the same notes (variant);
 * - a Take the player marked not fair is not evidence of anything;
 * - with grading off, or a last Session played without grading, minutes and
 *   tempo only, no claim about the playing.
 *
 * It replaces "Where you left off" (the back-from-a-break card) and the old
 * tools greeting (`greeting.ts`, deleted in c2a2).
 */
import type { Exercise, PathDoc } from "../paths/format";
import { countRounds } from "./rounds";
import type { Line } from "../session/coachWords";
import { barStrip, metricKey } from "../session/coachWords";
import type { GradingChoice } from "../session/grading";
import { findExercise } from "../session/packs";
import type { PlanStep, SessionPlan } from "../session/planner";
import { rungsToDrop } from "../session/planner";
import type { PlayerProgress } from "../session/progress";
import { calendarDaysBetween, factsOf, isUngradedTake, sessionKeyOf, shownCleanTempoTakeOf } from "../session/progress";
import type { PathTakeRow } from "../ipc";

/**
 * Which sentence it is. `songDue` ("Bars 17 to 24 of your song are due
 * today", `listDue`) belongs to leg c5a: typed here, never chosen yet.
 */
export type TodayLineCase = "first" | "slipped" | "earned" | "back" | "ungraded" | "songDue";

export type TodayLine = { kind: TodayLineCase; lines: Line[] };

export type TodayLineInput = {
  plan: SessionPlan;
  progress: PlayerProgress;
  paths: readonly PathDoc[];
  now: number;
  /** Settings → Practice → "Grade my playing". */
  grading: GradingChoice;
  /**
   * How many Takes the app reads from the store (`listPathTakes(limit)`). A
   * list that long may have been cut inside the last Session, so a total over
   * that Session (its minutes) is not said.
   */
  takesRead: number;
};

/** When the last Session was, as a sentence names it. */
export type Window = "today" | "yesterday" | "lastSession";

const K = "session.today.line";

/** A Take that was heard and graded. */
function isGraded(take: PathTakeRow): boolean {
  if (!take.caught || isUngradedTake(take)) return false;
  const verdict = factsOf(take).verdict;
  return verdict === "passed" || verdict === "belowBar";
}

/** The player said this grade was not fair: it proves nothing. */
function markedUnfair(take: PathTakeRow): boolean {
  return factsOf(take).fair === "no";
}

function exerciseOf(paths: readonly PathDoc[], pathId: string, exerciseId: string): Exercise | null {
  const path = paths.find((p) => p.id === pathId);
  return path ? (findExercise(path, exerciseId)?.exercise ?? null) : null;
}

/** The Takes of the player's last Session, newest first. */
export function lastSessionOf(takes: readonly PathTakeRow[]): PathTakeRow[] {
  const newest = takes[0];
  if (!newest) return [];
  const key = sessionKeyOf(newest);
  return takes.filter((t) => sessionKeyOf(t) === key);
}

export function windowOf(take: PathTakeRow, now: number): Window {
  const days = calendarDaysBetween(take.startedAt, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return "lastSession";
}

/** The first Exercise the plan has the player play: where today "starts". */
function firstExerciseStep(plan: SessionPlan): Extract<PlanStep, { kind: "exercise" }> | null {
  return (plan.steps.find((s) => s.kind === "exercise") as Extract<PlanStep, { kind: "exercise" }> | undefined) ?? null;
}

/** Where a stored Take slipped, from its own per-bar figures. */
export type StoredPlace =
  | { shape: "bar"; bar: number; count: number; of: number }
  | { shape: "bars"; from: number; to: number; count: number; of: number }
  | { shape: "all"; count: number; of: number };

/**
 * The bar of the tune that slipped on the most rounds (the lowest on a tie),
 * with its neighbours that slipped on exactly the same rounds. Null without
 * per-bar figures, or when nothing slipped.
 */
export function storedPlace(take: PathTakeRow, exercise: Exercise): StoredPlace | null {
  const measures = factsOf(take).measures;
  if (!measures?.perBar || measures.perBar.length === 0) return null;
  const strip = barStrip(exercise, { perBar: measures.perBar, pass: measures.pass });
  if (!strip) return null;
  const length = Math.max(1, Math.floor(exercise.bars));
  const counts = countRounds(strip.cells, length);
  const slipped = counts.slice(1).filter((c) => c.slippedIn.length > 0 && c.of > 0);
  if (slipped.length === 0) return null;
  const first = [...slipped].sort((a, b) => b.slippedIn.length - a.slippedIn.length || a.patternBar - b.patternBar)[0];
  const same = (i: number) =>
    counts[i] !== undefined && counts[i].of === first.of && counts[i].slippedIn.join(",") === first.slippedIn.join(",");
  let from = first.patternBar;
  let to = first.patternBar;
  while (from > 1 && same(from - 1)) from -= 1;
  while (to < length && same(to + 1)) to += 1;
  const count = first.slippedIn.length;
  const of = first.of;
  if (to - from + 1 >= length) return { shape: "all", count, of };
  if (from === to) return { shape: "bar", bar: from, count, of };
  return { shape: "bars", from, to, count, of };
}

/** "<Exercise>: bar 1 of the tune slipped on 2 of 3 rounds yesterday." */
export function slippedLine(place: StoredPlace, exercise: string, when: Window): Line {
  const values: Record<string, string | number> = { exercise, count: place.count, of: place.of };
  if (place.shape === "bar") values.bar = place.bar;
  if (place.shape === "bars") {
    values.from = place.from;
    values.to = place.to;
  }
  return { key: `${K}.slipped.${when}.${place.shape}`, values };
}

/** Played on the same notes: a variant's bar 1 is not another variant's. */
function sameNotes(take: PathTakeRow, step: { variantSeed: number | null }): boolean {
  return (take.variantSeed ?? null) === (step.variantSeed ?? null);
}

/** The last Session's last graded Take on an Exercise, if it slipped somewhere the player can be told. */
function slipIn(
  session: readonly PathTakeRow[],
  pathId: string,
  exerciseId: string,
  paths: readonly PathDoc[],
): { take: PathTakeRow; exercise: Exercise; place: StoredPlace } | null {
  const take = session.find((t) => t.pathId === pathId && t.exerciseId === exerciseId && isGraded(t));
  if (!take || markedUnfair(take)) return null;
  const exercise = exerciseOf(paths, pathId, exerciseId);
  if (!exercise) return null;
  const place = storedPlace(take, exercise);
  return place ? { take, exercise, place } : null;
}

/** What today does with a clean tempo that just moved, said only for these. */
function earnedThen(step: Extract<PlanStep, { kind: "exercise" }>): "review" | "climb" | "keep" | null {
  if (step.role === "review" || step.why.code === "reviewDue") return "review";
  if (step.why.code === "climb" || step.why.code === "climbFast") return "climb";
  if (step.why.code === "passedKeepGoing") return "keep";
  return null;
}

/** Seconds a stored Take lasted: its bars at its tempo, in the Exercise's metre. */
function takeSeconds(take: PathTakeRow, exercise: Exercise): number {
  const quarters = exercise.meter.numerator * (4 / exercise.meter.denominator);
  return take.bpm > 0 ? (take.bars * quarters * 60) / take.bpm : 0;
}

function ungradedLine(input: TodayLineInput, session: readonly PathTakeRow[]): TodayLine | null {
  const { plan, paths, now, progress, takesRead } = input;
  const newest = session[0];
  // The store's read may have stopped inside this Session: its total is unknown.
  const cut = progress.takes.length >= takesRead && sessionKeyOf(progress.takes[progress.takes.length - 1]) === sessionKeyOf(newest);
  if (cut) return null;
  let seconds = 0;
  for (const take of session) {
    const exercise = exerciseOf(paths, take.pathId, take.exerciseId);
    if (!exercise) return null;
    seconds += takeSeconds(take, exercise);
  }
  const minutes = Math.floor(seconds / 60);
  const exercise = exerciseOf(paths, newest.pathId, newest.exerciseId);
  if (minutes < 1 || !exercise) return null;
  const lines: Line[] = [
    {
      key: `${K}.ungraded.${windowOf(newest, now)}`,
      values: { count: minutes, exercise: exercise.title, bpm: newest.bpm },
    },
  ];
  const first = firstExerciseStep(plan);
  if (first && first.pathId === newest.pathId && first.exerciseId === newest.exerciseId && first.bpm === newest.bpm) {
    lines.push({ key: `${K}.samePlace`, values: {} });
  }
  return { kind: "ungraded", lines };
}

function backLine(input: TodayLineInput, session: readonly PathTakeRow[]): TodayLine | null {
  const { plan, paths } = input;
  const lines: Line[] = [];
  const last = session.find(isGraded);
  const exercise = last ? exerciseOf(paths, last.pathId, last.exerciseId) : null;
  if (last && exercise && !markedUnfair(last)) {
    const facts = factsOf(last);
    const metric = metricKey(facts.headlineMetric ?? "timingEvenness");
    lines.push(
      typeof facts.headlineValue === "number" && metric !== "extras"
        ? {
            key: `${K}.back.${metric}`,
            values: { exercise: exercise.title, bpm: last.bpm, value: Math.round(facts.headlineValue * 100) },
          }
        : { key: `${K}.back.plain`, values: { exercise: exercise.title, bpm: last.bpm } },
    );
  }
  // Then the tempo today starts at: no "rungs lower than it would have", which
  // named neither. The days away are said once, by Today's header ("Last
  // Session: 12 days ago", hd1) and the plan's reason; after the last number
  // they are not said again (nf1b: "That was 12 days ago." removed). With no
  // last number to say, the line still opens with them.
  const said = lines.length > 0;
  const days = plan.daysAway ?? 0;
  if (days > 0 && !said) lines.push({ key: `${K}.backAway`, values: { count: days } });
  const first = firstExerciseStep(plan);
  if (first && first.why.code === "backEased" && rungsToDrop(days) > 0) {
    // The Exercise is named only when it is not the one the sentence before named.
    const sameExercise = said && !!last && first.pathId === last.pathId && first.exerciseId === last.exerciseId;
    const firstExercise = exerciseOf(paths, first.pathId, first.exerciseId);
    if (sameExercise || !firstExercise) {
      lines.push({ key: `${K}.backStartsAt`, values: { bpm: first.bpm } });
    } else {
      lines.push({ key: `${K}.backStartsAtOther`, values: { exercise: firstExercise.title, bpm: first.bpm } });
    }
  }
  return lines.length > 0 ? { kind: "back", lines } : null;
}

/**
 * Today's line, or null: nothing measured to add, and the slot is absent.
 */
export function todayLine(input: TodayLineInput): TodayLine | null {
  const { plan, progress, paths, now, grading } = input;
  if (plan.steps.length === 0) return null;
  const takes = progress.takes;

  if (plan.mood === "first" || takes.length === 0) {
    // Only a plan that really finds where the player starts says so: a
    // placement climb, which an ungraded first Session does not have.
    const places = plan.steps.some((s) => s.kind === "exercise" && s.role === "placement");
    return places && takes.length === 0 ? { kind: "first", lines: [{ key: `${K}.first`, values: {} }] } : null;
  }

  const session = lastSessionOf(takes);
  // No claim about the playing: grading off, or a last Session that had none.
  if (grading === "off" || !session.some(isGraded)) {
    return session.every((t) => isUngradedTake(t)) || grading === "off" ? ungradedLine(input, session) : null;
  }

  if (plan.mood === "back") return backLine(input, session);

  // Where it slipped, when today starts on that Exercise, on those notes.
  const first = firstExerciseStep(plan);
  if (first && first.role !== "placement") {
    const slip = slipIn(session, first.pathId, first.exerciseId, paths);
    if (slip && sameNotes(slip.take, first)) {
      return {
        kind: "slipped",
        lines: [
          slippedLine(slip.place, slip.exercise.title, windowOf(slip.take, now)),
          { key: `${K}.startsThere`, values: {} },
        ],
      };
    }
  }

  // A clean tempo that moved last Session, and what today does with it.
  for (const step of plan.steps) {
    if (step.kind !== "exercise") continue;
    const then = earnedThen(step);
    if (!then) continue;
    // The Take that set the clean tempo the app shows: never one marked not
    // fair, so a clean tempo that only such a Take raised was not earned.
    const setter = shownCleanTempoTakeOf(progress, step.pathId, step.exerciseId);
    const raised = setter && session.includes(setter) && isGraded(setter) ? setter : null;
    if (!raised || markedUnfair(raised)) continue;
    const exercise = exerciseOf(paths, step.pathId, step.exerciseId);
    if (!exercise) continue;
    return {
      kind: "earned",
      lines: [
        { key: `${K}.earned.${windowOf(raised, now)}`, values: { exercise: exercise.title, bpm: raised.bpm } },
        { key: `${K}.earnedThen.${then}`, values: {} },
      ],
    };
  }
  return null;
}

/**
 * The Step page's line (DESIGN 3.1): only something measured the page does not
 * show, which is where the last Session's last graded Take on one of this
 * Step's Exercises slipped. No plan statement: the Step page plans nothing.
 */
export function stepLine(input: {
  progress: PlayerProgress;
  paths: readonly PathDoc[];
  pathId: string;
  exerciseIds: readonly string[];
  now: number;
  grading: GradingChoice;
}): Line | null {
  const { progress, paths, pathId, exerciseIds, now, grading } = input;
  if (grading === "off") return null;
  const session = lastSessionOf(progress.takes);
  const latest = session.find((t) => t.pathId === pathId && exerciseIds.includes(t.exerciseId) && isGraded(t));
  if (!latest) return null;
  const slip = slipIn(session, pathId, latest.exerciseId, paths);
  return slip ? slippedLine(slip.place, slip.exercise.title, windowOf(slip.take, now)) : null;
}

/** The line as one string: its sentences, in order. */
export function todayLineText(
  t: (key: string, values?: Record<string, string | number>) => string,
  line: TodayLine,
): string {
  return line.lines.map((l) => t(l.key, l.values)).join(" ");
}
