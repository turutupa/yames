/**
 * The weekly look-back (`weekly.ts`) and the plateau question (`nudges.ts`):
 * one fixture week, read in full, and the rules around it. Every Take marked
 * not fair is in the fixtures on purpose (owner decision 3): it must move no
 * number.
 */
import { describe, expect, it } from "vitest";
import type { CleanTempoSpanRow, PathTakeRow } from "../ipc";
import { countsTowardCleanTempo, type TakeFacts } from "../session/progress";
import type { Exercise, PathDoc } from "../paths/format";
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

/**
 * The long view over these Takes, as `clean_tempo_spans_sql` reads it: per
 * Exercise, over the clean Takes not marked not fair, the first (earliest, the
 * lower tempo on a tie) and the best (the highest, the earliest on a tie).
 */
function spansOf(takes: readonly PathTakeRow[]): CleanTempoSpanRow[] {
  const out = new Map<string, CleanTempoSpanRow>();
  for (const t of takes) {
    if (!countsTowardCleanTempo(t)) continue;
    const id = `${t.pathId}/${t.exerciseId}`;
    const s = out.get(id);
    if (!s) {
      out.set(id, { pathId: t.pathId, exerciseId: t.exerciseId, firstBpm: t.bpm, firstAt: t.startedAt, bestBpm: t.bpm, bestAt: t.startedAt });
      continue;
    }
    if (t.startedAt < s.firstAt || (t.startedAt === s.firstAt && t.bpm < s.firstBpm)) Object.assign(s, { firstBpm: t.bpm, firstAt: t.startedAt });
    if (t.bpm > s.bestBpm || (t.bpm === s.bestBpm && t.startedAt < s.bestAt)) Object.assign(s, { bestBpm: t.bpm, bestAt: t.startedAt });
  }
  return [...out.values()];
}

const input = (takes: PathTakeRow[], extra: Partial<Parameters<typeof lookBack>[0]> = {}) => ({
  progress: progress({ takes }),
  paths: [ALT],
  spans: spansOf(takes),
  now: NOW,
  weekStart: MON,
  graded: true,
  goal: null,
  ...extra,
});

describe("lookBack", () => {
  it("reads the fixture week in full, leaving the Takes marked not fair out of every number", () => {
    const look = lookBack(input(week()))!;
    expect(look.needsSpans).toBe(false);
    expect(look.leftOut).toBe(true); // the week holds Takes marked not fair: the foot says it leaves them out
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
    // The week holds Takes marked not fair: the sentence says it leaves them out (L10).
    expect(look.sentence.key).toBe("companion.weekly.say.ungradedLeftOut");
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
    // From the Takes alone it would be new; the long view says it is not, and
    // the clean tempo before the week is past the Takes read: no "from".
    expect(lookBack(input(takes))!.moved).toMatchObject([{ from: null, to: 90, isNew: true }]);
    expect(lookBack(input(takes, { spans }))!.moved).toMatchObject([{ from: null, to: 90, isNew: false }]);
  });

  it("says nothing moved until the long view has answered, and says it waits for it (M4)", () => {
    const look = lookBack(input(week(), { spans: null }))!;
    expect(look.needsSpans).toBe(true);
    expect(look.moved).toEqual([]);
    // Ungraded rows need no long view.
    expect(lookBack(input(week(), { spans: null, graded: false }))!.needsSpans).toBe(false);
  });

  it("measures 'moved' against the long view, never the 500 Takes in memory alone (M4)", () => {
    // Clean at 100 two months ago, outside the Takes read; since then 90 before the week and 95 in it.
    const takes = [clean(A.id, 90, day(-3)), clean(A.id, 95, day(2)), below(B.id, 60, day(3)), below(B.id, 60, day(4))];
    const spans: CleanTempoSpanRow[] = [{ pathId: ALT.id, exerciseId: A.id, firstBpm: 100, firstAt: day(-60), bestBpm: 100, bestAt: day(-60) }];
    const look = lookBack(input(takes, { spans }))!;
    expect(look.moved).toEqual([]);
    expect(look.sentence.key).toBe("companion.weekly.say.held");
  });

  it("keeps a week's move when the best rose again after it, only with the Takes back to the first", () => {
    const takes = [...week(), clean(A.id, 120, NOW - 60_000)];
    expect(lookBack(input(takes))!.moved).toMatchObject([{ from: 70, to: 90 }]);
    // The same, with the first clean Take past the Takes read: not known, not said.
    const spans = spansOf(takes).map((s) => (s.exerciseId === A.id ? { ...s, firstAt: day(-90) } : s));
    expect(lookBack(input(takes, { spans }))!.moved).toEqual([]);
  });

  it("a long view that could not be read: nothing said of what moved, and the sentence quotes the counts (LOW 2)", () => {
    const look = lookBack(input(week(), { spans: "unread" }))!;
    expect(look.needsSpans).toBe(false);
    expect(look.graded).toBe(true);
    expect(look.moved).toEqual([]);
    expect(look.milestones).toEqual([]);
    // Never "held" ("No clean tempo moved"), which is not known.
    expect(look.sentence).toEqual({ key: "companion.weekly.say.ungradedLeftOut", values: { sessions: 3, minutes: look.counts.minutes, exercises: 2 } });
    expect(look.benchmark).not.toBeNull();
  });

  it("says no first clean tempo of the week when the Takes read do not reach back to it (LOW 8)", () => {
    // First clean at 70 on day 1, past the Takes read (the oldest is day 3); best after the week.
    const takes = [clean(A.id, 80, day(3)), below(B.id, 60, day(4)), below(B.id, 60, day(5)), clean(A.id, 100, NOW - 60_000)];
    const spans: CleanTempoSpanRow[] = [{ pathId: ALT.id, exerciseId: A.id, firstBpm: 70, firstAt: day(1), bestBpm: 100, bestAt: NOW - 60_000 }];
    expect(lookBack(input(takes, { spans }))!.moved).toEqual([]);
    // With the Takes back to the first: the week's top is its first clean tempo's row.
    const all = [clean(A.id, 70, day(1)), ...takes];
    expect(lookBack(input(all, { spans }))!.moved).toMatchObject([{ isNew: true, to: 80 }]);
  });

  it("does not count a first clean tempo as one that moved (L7)", () => {
    const takes = [clean(A.id, 80, day(0)), below(B.id, 60, day(2)), below(B.id, 60, day(4))];
    const look = lookBack(input(takes))!;
    expect(look.moved).toMatchObject([{ isNew: true, from: null, to: 80 }]);
    expect(look.sentence.key).toBe("companion.weekly.say.held");
  });

  it("says the foot leaves Takes out only when the week held some (L10)", () => {
    const plain = [clean(A.id, 80, day(0)), below(B.id, 60, day(2)), below(B.id, 60, day(4))];
    expect(lookBack(input(plain))!.leftOut).toBe(false);
    const mine = take("mine-1", { pathId: MY_EXERCISES_PATH_ID, bpm: 90, startedAt: day(1), facts: { session: ++session } });
    expect(lookBack(input([...plain, mine]))!.leftOut).toBe(true);
    expect(lookBack(input([...plain, mine], { graded: false }))!.sentence.key).toBe("companion.weekly.say.ungradedLeftOut");
  });

  it("compares the benchmark on the same version of the Exercise only (M3)", () => {
    const VB = {
      ...B,
      variation: { variants: [{ id: "a" }, { id: "b" }, { id: "c" }] },
    } as unknown as Exercise;
    const VALT: PathDoc = { ...ALT, steps: ALT.steps.map((s) => ({ ...s, exercises: s.exercises.map((e) => (e.id === B.id ? VB : e)) })) };
    const seeded = (row: PathTakeRow, variantSeed: number) => ({ ...row, variantSeed });
    const takes = (lastSeed: number) => [
      clean(A.id, 70, day(-5)),
      clean(A.id, 80, day(0)),
      seeded(bench(1, 0.74, day(1)), 0),
      clean(A.id, 90, day(3)),
      seeded(bench(7, 0.86, day(6)), lastSeed),
    ];
    // Seed 3 plays variant 0 (3 mod 3), as `withVariant` picks it: the same notes.
    expect(lookBack(input(takes(3), { paths: [VALT] }))!.benchmark).toMatchObject({ fromEven: 74, toEven: 86 });
    // Seed 2 is another variant: no benchmark line, and the sentence claims no "more even".
    const other = lookBack(input(takes(2), { paths: [VALT] }))!;
    expect(other.benchmark).toBeNull();
    expect(other.sentence.key).toBe("companion.weekly.say.one");
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

  /** The Takes in memory reach back to the span's first clean Take, and none before the week crossed +20. */
  const read = [clean(A.id, 70, day(-11))];
  const mile = (spans: CleanTempoSpanRow[], takes: PathTakeRow[] = read, oldest: number | null = day(-11)) =>
    bpmMilestones(spans, [ALT], lastWeek.start, lastWeek.end, takes, oldest);

  it("names a best reached inside the week at least 20 BPM over the first", () => {
    expect(MILESTONE_BPM_UP).toBe(20);
    expect(mile([span({})])).toMatchObject([{ exercise: { id: A.id }, firstBpm: 70, bestBpm: 90 }]);
  });

  it("says each once: a best from another week, or under 20 up, is not one", () => {
    expect(mile([span({ bestAt: day(-2) })])).toEqual([]);
    expect(mile([span({ bestBpm: 89 })])).toEqual([]);
  });

  it("is not said again in a later week whose best rose further (L6)", () => {
    // +20 crossed the week before (90 on day -4); this week's 95 is not a new milestone.
    expect(mile([span({ bestBpm: 95 })], [...read, clean(A.id, 90, day(-4))])).toEqual([]);
    // Crossed in this week: said, with this week's best.
    expect(mile([span({ bestBpm: 95 })], [...read, clean(A.id, 85, day(-4))])).toMatchObject([{ bestBpm: 95 }]);
    // The Takes read do not reach back to the first clean Take: not known, not said.
    expect(mile([span({})], [], day(-5))).toEqual([]);
    // A first clean Take inside the week needs nothing before it.
    expect(mile([span({ firstAt: day(0), bestAt: day(3) })], [], day(0))).toHaveLength(1);
  });

  it("says a crossing in the week whose best was passed after it, as the week's own top (LOW 3)", () => {
    const after = NOW - 60_000;
    const takes = [...read, clean(A.id, 90, day(2)), clean(A.id, 95, after)];
    expect(mile([span({ bestBpm: 95, bestAt: after })], takes)).toMatchObject([{ firstBpm: 70, bestBpm: 90, bestAt: day(2) }]);
    // And not again in the week that set the 95: the 90 crossed before it.
    const thisWeek = weekTotals([], [ALT], NOW, MON).thisWeek;
    expect(bpmMilestones([span({ bestBpm: 95, bestAt: after })], [ALT], thisWeek.start, thisWeek.end, takes, day(-11))).toEqual([]);
    // The week's top under +20, or the Takes read short of the first: not said.
    expect(mile([span({ bestBpm: 95, bestAt: after })], [...read, clean(A.id, 85, day(2)), clean(A.id, 95, after)])).toEqual([]);
    expect(mile([span({ bestBpm: 95, bestAt: after })], takes.slice(1), day(2))).toEqual([]);
  });

  it("joins every span to an Exercise that still exists, and skips my exercises", () => {
    const spans = [span({ exerciseId: "deleted" }), span({ pathId: MY_EXERCISES_PATH_ID }), span({ pathId: "gone-path" })];
    expect(mile(spans)).toEqual([]);
  });

  it("reaches the card through lookBack when the long view has answered (graded only)", () => {
    const spans = [span({ exerciseId: C.id, firstAt: day(-5) })];
    const look = lookBack(input(week(), { spans }))!;
    expect(look.milestones.map((m) => m.exercise.id)).toEqual([C.id]);
    expect(lookBack(input(week(), { spans, graded: false }))!.milestones).toEqual([]);
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
