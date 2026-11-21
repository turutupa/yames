/**
 * The weekly look-back (`weekly.ts`) and the plateau question (`nudges.ts`):
 * one fixture week, read in full, and the rules around it. Every Take marked
 * not fair is in the fixtures on purpose (owner decision 3): it must move no
 * number.
 */
import { describe, expect, it } from "vitest";
import type { CleanTempoSpanRow, PathTakeRow } from "../ipc";
import type { TakeFacts } from "../session/progress";
import { ALT, DAY, NOW, progress, take } from "../session/testKit";
import { weekTotals, type Weekday } from "../session/totals";
import { MY_EXERCISES_PATH_ID } from "../session/myExercises";
import { bpmMilestones, lookBack, LOOK_BACK_MIN_SESSIONS, MILESTONE_BPM_UP } from "./weekly";
import { plateausNow } from "./nudges";

const MON = 1 as Weekday;
const [A, B, C] = ALT.steps.flatMap((s) => s.exercises);
const { lastWeek } = weekTotals([], [ALT], NOW, MON);
/** Noon on day `d` of last week (0 = its first day). */
const day = (d: number) => lastWeek.start + d * DAY + 12 * 3_600_000;

let session = 0;
function clean(ex: string, bpm: number, at: number, facts: TakeFacts = {}): PathTakeRow {
  return take(ex, { bpm, startedAt: at, passed: true, facts: { verdict: "passed", newClean: true, session: ++session, ...facts } });
}
function below(ex: string, bpm: number, at: number, facts: TakeFacts = {}): PathTakeRow {
  return take(ex, { bpm, startedAt: at, facts: { verdict: "belowBar", newClean: false, session: ++session, ...facts } });
}
const bench = (dayN: number, even: number, at: number, facts: TakeFacts = {}) =>
  below(B.id, 60, at, { benchmark: { day: dayN, exerciseId: B.id, bpm: 60 }, measures: { evenness: even }, ...facts });

/** The fixture week: A moves 80 → 90 (from 70 before the week), the benchmark on B goes 74 → 86. */
function week(): PathTakeRow[] {
  return [
    clean(A.id, 70, day(-5)), // before the week
    // One Session: A, then the day-1 benchmark.
    clean(A.id, 80, day(0), { session: 9_001 }),
    bench(1, 0.74, day(0) + 60_000, { session: 9_001 }),
    clean(A.id, 90, day(2)),
    bench(7, 0.86, day(6)),
    // Marked not fair: would move A to 100, add a Session and a better benchmark.
    clean(A.id, 100, day(5), { fair: "no" }),
    bench(7, 0.99, day(6) + 60_000, { fair: "no" }),
  ];
}

const input = (takes: PathTakeRow[], extra: Partial<Parameters<typeof lookBack>[0]> = {}) => ({
  progress: progress({ takes }),
  paths: [ALT],
  spans: null,
  now: NOW,
  weekStart: MON,
  graded: true,
  goal: null,
  ...extra,
});

describe("lookBack", () => {
  it("reads the fixture week in full, leaving the Takes marked not fair out of every number", () => {
    const look = lookBack(input(week()))!;
    expect(look.start).toBe(lastWeek.start);
    expect(look.end).toBe(lastWeek.end);
    expect(look.graded).toBe(true);
    expect(look.sentence).toEqual({ key: "companion.weekly.say.oneAndBench", values: { count: 1, fromDay: 1 } });
    expect(look.benchmark).toMatchObject({ exercise: { id: B.id }, bpm: 60, fromDay: 1, toDay: 7, fromEven: 74, toEven: 86 });
    expect(look.moved.map((m) => [m.exercise.id, m.from, m.to])).toEqual([[A.id, 70, 90]]);
    // Three Sessions: the fourth holds only the Take marked not fair.
    expect(look.counts.sessions).toBe(3);
    expect(look.counts.takes).toBe(4);
    expect(look.canHearBoth).toBe(false);
  });

  it("says nothing at all with fewer than three Sessions in the week", () => {
    const takes = [clean(A.id, 80, day(0)), clean(A.id, 90, day(2))];
    expect(LOOK_BACK_MIN_SESSIONS).toBe(3);
    expect(lookBack(input(takes))).toBeNull();
    // A third Session marked not fair does not make it three.
    expect(lookBack(input([...takes, clean(A.id, 95, day(4), { fair: "no" })]))).toBeNull();
  });

  it("reads only last week: this week's Takes and the week before move nothing", () => {
    const takes = [...week(), clean(A.id, 120, NOW - 60_000)];
    expect(lookBack(input(takes))!.moved.map((m) => m.to)).toEqual([90]);
  });

  it("speaks of minutes and tempos only with grading off", () => {
    const look = lookBack(input(week(), { graded: false }))!;
    expect(look.graded).toBe(false);
    expect(look.sentence.key).toBe("companion.weekly.say.ungraded");
    expect(look.benchmark).toBeNull();
    expect(look.stuck).toBeNull();
    expect(look.milestones).toEqual([]);
    expect(look.moved.every((m) => m.kind === "played")).toBe(true);
    // A on the first and on the last day it was played that week: 80 → 90 (the 100 was marked not fair).
    expect(look.moved.find((m) => m.exercise.id === A.id)).toMatchObject({ from: 80, to: 90 });
  });

  it("leaves out the player's own exercises and Exercises that no longer exist", () => {
    const mine = take("mine-1", { pathId: MY_EXERCISES_PATH_ID, bpm: 90, startedAt: day(1), passed: true, facts: { newClean: true, session: ++session } });
    const gone = clean("no-such-exercise", 120, day(3));
    const look = lookBack(input([...week(), mine, gone]))!;
    expect(look.moved.map((m) => m.exercise.id)).toEqual([A.id]);
    expect(look.counts.takes).toBe(5); // the Take on a deleted Exercise is still a Take played; mine is not
  });

  it("does not call a clean tempo new when the long view has one from before the week", () => {
    const takes = [clean(A.id, 80, day(0)), clean(A.id, 90, day(2)), below(B.id, 60, day(4))];
    const spans: CleanTempoSpanRow[] = [{ pathId: ALT.id, exerciseId: A.id, firstBpm: 60, firstAt: day(-200), bestBpm: 90, bestAt: day(2) }];
    expect(lookBack(input(takes))!.moved).toMatchObject([{ from: null, to: 90 }]);
    expect(lookBack(input(takes, { spans }))!.moved).toEqual([]);
  });

  it("quotes the goal when one is set", () => {
    const goal = { text: "Play Blackbird", at: NOW - 9 * DAY };
    expect(lookBack(input(week(), { goal }))!.goal).toEqual(goal);
  });
});

describe("bpmMilestones (DESIGN 6.5: clean tempo up 20 BPM)", () => {
  const span = (fields: Partial<CleanTempoSpanRow>): CleanTempoSpanRow => ({
    pathId: ALT.id,
    exerciseId: A.id,
    firstBpm: 70,
    firstAt: day(-11),
    bestBpm: 90,
    bestAt: day(2),
    ...fields,
  });

  it("names a best reached inside the week at least 20 BPM over the first", () => {
    expect(MILESTONE_BPM_UP).toBe(20);
    const out = bpmMilestones([span({})], [ALT], lastWeek.start, lastWeek.end);
    expect(out).toMatchObject([{ exercise: { id: A.id }, firstBpm: 70, bestBpm: 90 }]);
  });

  it("says each once: a best from another week, or under 20 up, is not one", () => {
    expect(bpmMilestones([span({ bestAt: day(-2) })], [ALT], lastWeek.start, lastWeek.end)).toEqual([]);
    expect(bpmMilestones([span({ bestBpm: 89 })], [ALT], lastWeek.start, lastWeek.end)).toEqual([]);
  });

  it("joins every span to an Exercise that still exists, and skips my exercises", () => {
    const spans = [span({ exerciseId: "deleted" }), span({ pathId: MY_EXERCISES_PATH_ID }), span({ pathId: "gone-path" })];
    expect(bpmMilestones(spans, [ALT], lastWeek.start, lastWeek.end)).toEqual([]);
  });

  it("reaches the card through lookBack when the long view has answered (graded only)", () => {
    const look = lookBack(input(week(), { spans: [span({ exerciseId: C.id })] }))!;
    expect(look.milestones.map((m) => m.exercise.id)).toEqual([C.id]);
    expect(lookBack(input(week(), { spans: [span({ exerciseId: C.id })], graded: false }))!.milestones).toEqual([]);
  });
});

describe("plateausNow", () => {
  /** Three Sessions on C, one a day, ending yesterday: the planner parks it until tomorrow. */
  const stuck = (bpms = [90, 90, 90], facts: TakeFacts[] = [{}, {}, {}]) =>
    bpms.map((bpm, i) => below(C.id, bpm, NOW - (3 - i) * DAY, facts[i]));

  it("asks after three Sessions without a new clean tempo, while the planner rests it", () => {
    const [p] = plateausNow(progress({ takes: stuck() }), [ALT], NOW, true);
    expect(p).toMatchObject({ exercise: { id: C.id }, sessions: 3, low: 90, high: 90 });
    expect(p.restsUntil).toBeGreaterThan(NOW);
    expect(plateausNow(progress({ takes: stuck([85, 90, 90]) }), [ALT], NOW, true)[0]).toMatchObject({ low: 85, high: 90 });
  });

  it("is not asked once the rest is over, with two Sessions, or with grading off", () => {
    expect(plateausNow(progress({ takes: stuck() }), [ALT], NOW + 3 * DAY, true)).toEqual([]);
    expect(plateausNow(progress({ takes: stuck().slice(1) }), [ALT], NOW, true)).toEqual([]);
    expect(plateausNow(progress({ takes: stuck() }), [ALT], NOW, false)).toEqual([]);
  });

  it("counts no Take marked not fair: a Session that holds only one is not one of the three", () => {
    const takes = stuck([90, 90, 90], [{}, { fair: "no" }, {}]);
    // The planner counts three and parks it; the coach counts two and does not ask.
    expect(plateausNow(progress({ takes }), [ALT], NOW, true)).toEqual([]);
  });

  it("never reads my exercises", () => {
    const takes = [0, 1, 2].map((i) =>
      take(C.id, { pathId: MY_EXERCISES_PATH_ID, bpm: 90, startedAt: NOW - (3 - i) * DAY, facts: { newClean: false, session: ++session } }),
    );
    expect(plateausNow(progress({ takes }), [ALT], NOW, true)).toEqual([]);
  });
});
