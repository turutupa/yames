/**
 * Play now across every subscribed Path: the adopted algorithm, played out.
 *
 * 1 to 4 Paths at every length, the lead rotating across days, reviews,
 * parking, placement, benchmarks, "your turn" and the finisher.
 */
import { describe, expect, it } from "vitest";
import type { PathTakeRow } from "../ipc";
import type { Exercise, PathDoc } from "../paths/format";
import { MAX_GRADED, MIN_BLOCK_MINUTES, PLAN_MINUTES, planSession } from "./planner";
import type { PlanMinutes, PlanStep, SessionPlan } from "./planner";
import { IDLE, bigAction, eventForBigAction, runReducer } from "./runner";
import type { RunState, TakeOutcome } from "./runner";
import { gradedRungs, rungBelow } from "./ladder";
import {
  NO_PROGRESS,
  cleanTempoOf,
  isStepPassed,
  nextStepAfterPass,
  passesNeeded,
} from "./progress";
import type { PlayerProgress, TakeFacts } from "./progress";
import {
  PARK_DAYS,
  REVIEW_INTERVALS,
  benchmarkDue,
  dueReviews,
  isParked,
  parkedUntil,
  pickFocus,
  reviewStateOf,
} from "./rotation";
import { ALT, DAY, NOW, SWEEP } from "./testKit";

const BLUES_PACK = import.meta.glob("../paths/packs/blues-pentatonics.json", { eager: true });
const BLUES = (Object.values(BLUES_PACK)[0] as { default: unknown }).default as PathDoc;
/** A fourth Path: Alternate Picking under another name, for the cap. */
const ALT2: PathDoc = { ...ALT, id: "alt-two", title: "Alternate Picking II" };
const ALL = [ALT, SWEEP, BLUES, ALT2];

type ExStep = Extract<PlanStep, { kind: "exercise" }>;
const exerciseSteps = (p: SessionPlan) => p.steps.filter((s): s is ExStep => s.kind === "exercise");

function find(path: PathDoc, id: string): Exercise {
  for (const s of path.steps) {
    const e = s.exercises.find((x) => x.id === id);
    if (e) return e;
  }
  throw new Error(id);
}

let n = 0;
function row(path: PathDoc, exerciseId: string, at: number, fields: Partial<PathTakeRow> & { facts?: TakeFacts } = {}): PathTakeRow {
  n += 1;
  return {
    id: `r${n}`,
    pathId: path.id,
    stepId: path.steps.find((s) => s.exercises.some((e) => e.id === exerciseId))!.id,
    exerciseId,
    startedAt: at,
    bpm: 60,
    bars: 8,
    caught: true,
    passed: false,
    facts: {},
    ...fields,
  };
}

function subscribed(paths: PathDoc[], since = NOW - 30 * DAY): PlayerProgress {
  return {
    ...NO_PROGRESS,
    states: paths.map((p, i) => ({ pathId: p.id, startedAt: since + i, updatedAt: since })),
  };
}

/** Every Path played once, a day ago, below the bar: a returning player on all of them. */
function returning(paths: PathDoc[]): PlayerProgress {
  const p = subscribed(paths);
  const takes = paths.map((path, i) =>
    row(path, path.steps[0].exercises[0].id, NOW - DAY - i * 60_000, {
      facts: { session: NOW - DAY, role: i === 0 ? "focus" : "next", verdict: "belowBar" },
    }),
  );
  return { ...p, takes: takes.sort((a, b) => b.startedAt - a.startedAt) };
}

/**
 * Play a plan the way a player would: every graded step gets one Take, which
 * passes when `pass` says so; clean tempos and the Step move as the hook does.
 */
function play(p: PlayerProgress, plan: SessionPlan, at: number, pass: (s: ExStep) => boolean): PlayerProgress {
  let progress = p;
  exerciseSteps(plan).forEach((step, i) => {
    const path = ALL.find((x) => x.id === step.pathId)!;
    const ok = pass(step);
    const before = cleanTempoOf(progress, path.id, step.exerciseId);
    const raised = ok && (before === null || step.bpm > before);
    const take = row(path, step.exerciseId, at + i * 60_000, {
      bpm: step.bpm,
      passed: ok,
      facts: {
        session: at,
        role: step.role,
        reason: step.why.code,
        verdict: ok ? "passed" : "belowBar",
        newClean: raised,
        ...(step.benchmark ? { benchmark: { day: step.benchmark.day, exerciseId: step.exerciseId, bpm: step.bpm } } : {}),
      },
    });
    const key = `${path.id}/${step.exerciseId}`;
    progress = {
      ...progress,
      takes: [take, ...progress.takes],
      ceilings: raised
        ? [...progress.ceilings.filter((c) => c.exerciseKey !== key), { exerciseKey: key, cleanBpm: step.bpm, lastPracticed: at }]
        : progress.ceilings,
    };
    const moved = nextStepAfterPass(progress, path);
    if (moved) {
      progress = {
        ...progress,
        states: progress.states.map((s) => (s.pathId === path.id ? { ...s, currentStepId: moved.id } : s)),
      };
    }
  });
  return progress;
}

const plan = (minutes: PlanMinutes, progress: PlayerProgress, paths: PathDoc[], now = NOW) =>
  planSession({ minutes, now, paths, progress });

describe("the shape, for 1 to 4 Paths at every length", () => {
  for (let count = 1; count <= 4; count += 1) {
    const paths = ALL.slice(0, count);
    for (const minutes of PLAN_MINUTES) {
      it(`${count} Path(s), ${minutes} minutes`, () => {
        const s = plan(minutes, returning(paths), paths);
        expect(s.steps.reduce((sum, x) => sum + x.minutes, 0)).toBe(minutes);
        expect(exerciseSteps(s).length).toBeLessThanOrEqual(MAX_GRADED);
        // Blocks of three minutes or more: only the warm-up slot and a
        // "your turn" are shorter.
        for (const step of s.steps.slice(minutes === 5 ? 0 : 1)) {
          if (step.id === "your-turn") continue;
          expect(step.minutes, step.id).toBeGreaterThanOrEqual(MIN_BLOCK_MINUTES);
        }
        // One Exercise per Path: no Path has two new-work blocks while another
        // subscribed Path has none.
        const heads = exerciseSteps(s).filter((x) => x.role === "focus" || x.role === "next");
        const perPath = new Map<string, number>();
        for (const h of heads) perPath.set(h.pathId, (perPath.get(h.pathId) ?? 0) + 1);
        if ((s.skipped ?? []).length > 0) {
          for (const [, c] of perPath) expect(c).toBe(1);
        }
        // Every subscribed Path is either in the Session or says why not.
        const here = new Set(s.steps.flatMap((x) => ("pathId" in x && x.pathId ? [x.pathId] : [])));
        for (const path of paths) {
          expect(here.has(path.id) || s.skipped?.some((k) => k.pathId === path.id), path.id).toBe(true);
        }
        expect(s.focusPathId).toBeTruthy();
      });
    }
  }

  it("ten minutes on three Paths is the lead and one other; the third rests and says when it was played", () => {
    const paths = [ALT, SWEEP, BLUES];
    const s = plan(10, returning(paths), paths);
    expect(s.steps.map((x) => x.minutes)).toEqual([2, 4, 4]);
    expect(s.skipped).toHaveLength(1);
    expect(s.skipped![0].why.code).toBe("skippedToday");
    expect(s.skipped![0].why.values.days).toBe(1);
  });

  it("twenty minutes on three Paths: warm-up, lead, the other two, and the last block", () => {
    const paths = [ALT, SWEEP, BLUES];
    const s = plan(20, returning(paths), paths);
    expect(s.steps.map((x) => x.minutes)).toEqual([2, 6, 4, 4, 4]);
    const pathsIn = exerciseSteps(s).slice(0, 3).map((x) => x.pathId);
    expect(new Set(pathsIn).size).toBe(3);
    expect(s.skipped).toEqual([]);
  });

  it("the lead says whose turn it is, the others that they are kept warm", () => {
    const paths = [ALT, SWEEP, BLUES];
    const s = plan(15, returning(paths), paths);
    const [lead, ...others] = exerciseSteps(s);
    expect(lead.context?.code).toBe("focusTurn");
    for (const o of others.filter((x) => x.role === "next")) expect(o.context?.code).toBe("keepWarm");
  });
});

describe("the lead rotates across days", () => {
  it("three Paths, ten minutes a day: each leads in turn, in the player's order", () => {
    const paths = [ALT, SWEEP, BLUES];
    let p = returning(paths);
    const leads: string[] = [];
    for (let day = 0; day < 6; day += 1) {
      const at = NOW + day * DAY;
      const s = plan(10, p, paths, at);
      leads.push(s.focusPathId!);
      p = play(p, s, at, () => false);
    }
    // ALT led yesterday (returning()), so the two that never led go first.
    expect(leads).toEqual([SWEEP.id, BLUES.id, ALT.id, SWEEP.id, BLUES.id, ALT.id]);
  });

  it("a Path unplayed for four days jumps the queue, and says so", () => {
    const paths = [ALT, SWEEP, BLUES];
    const p = returning(paths);
    // ALT and SWEEP played every day since; BLUES last five days ago.
    const blues = p.takes.find((t) => t.pathId === BLUES.id)!;
    const moved = { ...p, takes: p.takes.map((t) => (t.id === blues.id ? { ...t, startedAt: NOW - 5 * DAY } : t)) };
    // ALT led most recently... and SWEEP would be next by waiting time.
    const choice = pickFocus(paths, moved, NOW);
    expect(choice?.path.id).toBe(BLUES.id);
    expect(choice?.awayDays).toBe(5);
    const s = plan(10, moved, paths);
    expect(exerciseSteps(s)[0].context).toEqual({ code: "focusTurn", values: { path: BLUES.title, days: 5 } });
  });

  it("the Paths skipped today come first tomorrow", () => {
    const paths = [ALT, SWEEP, BLUES, ALT2];
    let p = returning(paths);
    const s1 = plan(10, p, paths);
    p = play(p, s1, NOW, () => false);
    const skipped = s1.skipped!.map((k) => k.pathId);
    expect(skipped).toHaveLength(2);
    const s2 = plan(10, p, paths, NOW + DAY);
    const tomorrow = new Set(exerciseSteps(s2).map((x) => x.pathId));
    for (const id of skipped) expect(tomorrow.has(id)).toBe(true);
  });
});

describe("spaced reviews", () => {
  const OPEN = ALT.steps[0].exercises[0];
  /** Passed at the pass tempo, `ago` days ago. */
  function passedOpen(ago: number): PlayerProgress {
    const at = NOW - ago * DAY;
    return {
      ...subscribed([ALT]),
      takes: [row(ALT, OPEN.id, at, { bpm: 100, passed: true, facts: { session: at, verdict: "passed" } })],
      ceilings: [{ exerciseKey: `${ALT.id}/${OPEN.id}`, cleanBpm: 100, lastPracticed: at }],
    };
  }

  it("is due a day after the pass, at the clean tempo, as two Takes", () => {
    expect(dueReviews([ALT], passedOpen(0), NOW)).toEqual([]);
    const due = dueReviews([ALT], passedOpen(1), NOW);
    expect(due[0]).toMatchObject({ kind: "review", bpm: 100, intervalDays: 1 });
    // Fifteen minutes: with one Path, ten is a single long lead and no review.
    const s = plan(15, passedOpen(1), [ALT]);
    const review = exerciseSteps(s).find((x) => x.role === "review")!;
    expect(review).toMatchObject({ exerciseId: OPEN.id, bpm: 100 });
    expect(review.why.code).toBe("reviewDue");
  });

  it("a pass moves to the next interval: 1, 3, 7, 14, 30 days", () => {
    let p = passedOpen(1);
    let at = NOW;
    for (const interval of REVIEW_INTERVALS.slice(1)) {
      p = {
        ...p,
        takes: [row(ALT, OPEN.id, at, { bpm: 100, passed: true, facts: { session: at, role: "review" } }), ...p.takes],
      };
      const state = reviewStateOf(p, { path: ALT, step: ALT.steps[0], exercise: OPEN })!;
      expect(state.intervalDays).toBe(interval);
      expect(state.dueAt).toBe(at + interval * DAY);
      at += interval * DAY;
    }
  });

  it("a fail marks it slipped: back one interval, a rung lower", () => {
    let p = passedOpen(4);
    const at = NOW - 3 * DAY;
    p = { ...p, takes: [row(ALT, OPEN.id, at, { bpm: 100, passed: true, facts: { session: at, role: "review" } }), ...p.takes] };
    // Now on the 3-day interval. Two Takes in one review, both below the bar.
    const slip = NOW;
    p = {
      ...p,
      takes: [
        row(ALT, OPEN.id, slip + 1, { bpm: 100, facts: { session: slip, role: "review" } }),
        row(ALT, OPEN.id, slip, { bpm: 100, facts: { session: slip, role: "review" } }),
        ...p.takes,
      ],
    };
    const state = reviewStateOf(p, { path: ALT, step: ALT.steps[0], exercise: OPEN })!;
    expect(state.slips).toBe(1);
    expect(state.intervalDays).toBe(1);
    expect(state.bpm).toBe(rungBelow(OPEN, 100));
    // Due a day after the slipped review.
    const s = plan(15, p, [ALT], NOW + DAY + 60_000);
    const review = exerciseSteps(s).find((x) => x.role === "review")!;
    expect(review.bpm).toBe(rungBelow(OPEN, 100));
    expect(review.why.values.slipped).toBe(1);
  });

  it("the runner gives a review two Takes, and a pass on either ends it", () => {
    const step: ExStep = {
      kind: "exercise",
      id: "r",
      role: "review",
      pathId: ALT.id,
      stepId: ALT.steps[0].id,
      exerciseId: OPEN.id,
      title: OPEN.title,
      bpm: 100,
      minutes: 4,
      variantSeed: null,
      why: { code: "reviewDue", values: {} },
    };
    const start = runReducer(IDLE, {
      type: "start",
      plan: { minutes: 5, mood: "returning", daysAway: 1, steps: [step] },
      now: NOW,
    });
    const after = (s: RunState, verdict: TakeOutcome["grade"]["verdict"]) =>
      [
        { type: "takeStarted", now: NOW } as const,
        { type: "takeStopped", now: NOW } as const,
        { type: "takeResult", now: NOW, outcome: outcome(verdict) } as const,
      ].reduce(runReducer, s);
    const one = after(start, "belowBar");
    expect(bigAction(one, OPEN)).toEqual({ kind: "again", bpm: 100 });
    const two = after(runReducer(one, { type: "again", now: NOW }), "belowBar");
    expect(bigAction(two, OPEN).kind).toBe("finish");
    expect(bigAction(after(start, "passed"), OPEN).kind).toBe("finish");
  });

  it("a Step done at three of four leaves the fourth to reviews", () => {
    const step = ALT.steps[0];
    expect(passesNeeded(4)).toBe(3);
    expect(passesNeeded(3)).toBe(2);
    expect(passesNeeded(1)).toBe(1);
    const ids = step.exercises.map((e) => e.id);
    const at = NOW - 2 * DAY;
    const p: PlayerProgress = {
      ...subscribed([ALT]),
      states: [{ pathId: ALT.id, currentStepId: ALT.steps[1].id, startedAt: NOW - 30 * DAY, updatedAt: at }],
      takes: [
        ...ids.slice(0, 3).map((id) => row(ALT, id, at, { bpm: 110, passed: true })),
        row(ALT, ids[3], at, { bpm: 80 }),
      ],
      ceilings: ids.slice(0, 3).map((id) => ({ exerciseKey: `${ALT.id}/${id}`, cleanBpm: 110, lastPracticed: at })),
    };
    expect(isStepPassed(p, ALT.id, step)).toBe(true);
    const due = dueReviews([ALT], p, NOW);
    expect(due.some((d) => d.kind === "leftover" && d.exercise.id === ids[3])).toBe(true);
  });
});

function outcome(verdict: TakeOutcome["grade"]["verdict"], bpm = 100): TakeOutcome {
  return {
    stepId: "x",
    exerciseId: "x",
    title: "x",
    bpm,
    takeNumber: 1,
    measures: {
      expected: 16,
      heard: 16,
      extras: 0,
      evenness: 0.9,
      accent: null,
      noteIdentity: null,
      barsPlayed: 8,
      barEvenness: null,
      caught: true,
    } as TakeOutcome["measures"],
    grade: {
      verdict,
      checks: [],
      headline: null,
      unmeasured: [],
      cleanBpm: verdict === "passed" ? bpm : null,
      passesExercise: verdict === "passed",
    },
    previousValue: null,
    cleanBefore: null,
  };
}

describe("parking", () => {
  const OPEN = ALT.steps[0].exercises[0];
  const FOUR = ALT.steps[0].exercises[1];
  /** `sessions` Sessions on OPEN, a day apart, ending yesterday, none raising the clean tempo. */
  function stuck(sessions: number): PlayerProgress {
    const takes = Array.from({ length: sessions }, (_, i) => {
      const at = NOW - (sessions - i) * DAY;
      return row(ALT, OPEN.id, at, { bpm: 80, facts: { session: at, role: "focus", newClean: false } });
    });
    return { ...subscribed([ALT]), takes: takes.sort((a, b) => b.startedAt - a.startedAt) };
  }

  it("three Sessions without a new clean rung park it for two days", () => {
    expect(isParked(stuck(2), ALT.id, OPEN, NOW)).toBe(false);
    expect(isParked(stuck(3), ALT.id, OPEN, NOW)).toBe(true);
    expect(parkedUntil(stuck(3), ALT.id, OPEN)).toBe(NOW - DAY + PARK_DAYS * DAY);
    expect(isParked(stuck(3), ALT.id, OPEN, NOW + DAY)).toBe(false);
  });

  it("the next open one leads meanwhile, and the plan says why", () => {
    const s = plan(5, stuck(3), [ALT]);
    const [lead] = exerciseSteps(s);
    expect(lead.exerciseId).toBe(FOUR.id);
    expect(lead.context).toMatchObject({ code: "parked", values: { exercise: OPEN.title, days: PARK_DAYS } });
  });

  it("comes back fresh after two days", () => {
    const s = plan(5, stuck(3), [ALT], NOW + DAY);
    expect(exerciseSteps(s)[0].exerciseId).toBe(OPEN.id);
  });

  it("a new clean rung resets the count", () => {
    const p = stuck(3);
    const mid = p.takes[1];
    const raised = { ...p, takes: p.takes.map((t) => (t.id === mid.id ? { ...t, passed: true, facts: { ...t.facts as object, newClean: true } } : t)) };
    expect(isParked(raised, ALT.id, OPEN, NOW)).toBe(false);
  });
});

describe("placement on a new Path", () => {
  it("the first Session tries the early Steps' first Exercises: a climb from about 75% of the pass tempo", () => {
    const s = plan(10, subscribed([ALT]), [ALT]);
    const lead = exerciseSteps(s).find((x) => x.role === "placement")!;
    expect(lead.exerciseId).toBe(ALT.steps[0].exercises[0].id);
    expect(lead.bpm).toBe(Math.max(...gradedRungs(ALT.steps[0].exercises[0]).filter((r) => r <= 75)));
    expect(lead.placement?.passAtBpm).toBe(100);
    expect(lead.placement?.then).toMatchObject({ exerciseId: ALT.steps[1].exercises[0].id, role: "placement" });
    expect(lead.why.code).toBe("placement");
  });

  it("a Path added to the others gets placement in its own block", () => {
    const paths = [ALT, SWEEP];
    const p = returning([ALT]);
    const both = { ...p, states: [...p.states, { pathId: SWEEP.id, startedAt: NOW - DAY, updatedAt: NOW - DAY }] };
    const s = plan(10, both, paths);
    const sweep = exerciseSteps(s).find((x) => x.pathId === SWEEP.id)!;
    expect(sweep.role).toBe("placement");
  });

  it("the runner climbs to the pass tempo, then moves on to the next Step's try", () => {
    const s = plan(5, subscribed([ALT]), [ALT]);
    const lead = exerciseSteps(s)[0];
    const ex = ALT.steps[0].exercises[0];
    let r = runReducer(IDLE, { type: "start", plan: s, now: NOW });
    const take = (state: RunState, verdict: TakeOutcome["grade"]["verdict"]) =>
      [
        { type: "takeStarted", now: NOW } as const,
        { type: "takeStopped", now: NOW } as const,
        { type: "takeResult", now: NOW, outcome: outcome(verdict, state.bpm) } as const,
      ].reduce(runReducer, state);
    r = take(r, "passed");
    expect(bigAction(r, ex)).toEqual({ kind: "again", bpm: 100, up: true });
    r = runReducer(r, eventForBigAction(bigAction(r, ex), NOW)!);
    r = take(r, "passed");
    // Past the pass tempo: one more, at about 120% (UX audit TODAY-3).
    expect(bigAction(r, ex)).toEqual({ kind: "again", bpm: 120, up: true });
    r = runReducer(r, eventForBigAction(bigAction(r, ex), NOW)!);
    r = take(r, "passed");
    const next = bigAction(r, ex);
    expect(next).toMatchObject({ kind: "next", insert: true, step: { exerciseId: lead.placement!.then!.exerciseId } });
    r = runReducer(r, eventForBigAction(next, NOW)!);
    expect(r.phase).toBe("ready");
    expect(r.plan!.steps[r.stepIndex]).toMatchObject({ exerciseId: ALT.steps[1].exercises[0].id });
  });

  it("a slip at either Take ends placement: the plan carries on", () => {
    const s = plan(5, subscribed([ALT]), [ALT]);
    const ex = ALT.steps[0].exercises[0];
    let r = runReducer(IDLE, { type: "start", plan: s, now: NOW });
    r = [
      { type: "takeStarted", now: NOW } as const,
      { type: "takeStopped", now: NOW } as const,
      { type: "takeResult", now: NOW, outcome: outcome("belowBar", 60) } as const,
    ].reduce(runReducer, r);
    expect(bigAction(r, ex).kind).toBe("finish");
  });
});

describe("benchmarks on days 1, 7, 14, 21", () => {
  const OPEN = ALT.steps[0].exercises[0];
  /** Subscribed `ago` days ago, with one placement Session that day. */
  function since(ago: number): PlayerProgress {
    const at = NOW - ago * DAY;
    return {
      ...subscribed([ALT], at),
      takes: [row(ALT, OPEN.id, at, { bpm: 60, facts: { session: at, role: "placement" } })],
    };
  }

  it("not on the very first Session: that one is placement", () => {
    expect(benchmarkDue(ALT, subscribed([ALT], NOW), NOW)).toBeNull();
  });

  it("day 1: the next Session's warm-up slot is the benchmark, tagged", () => {
    const s = plan(10, since(0), [ALT], NOW + 60_000);
    const first = s.steps[0];
    expect(first).toMatchObject({ kind: "exercise", role: "benchmark", exerciseId: OPEN.id, benchmark: { day: 1 } });
    expect(first.why.code).toBe("benchmark");
  });

  it("then not again until day 7, at the same Exercise and tempo", () => {
    let p = since(0);
    const s = plan(10, p, [ALT], NOW + 60_000);
    p = play(p, s, NOW + 60_000, () => true);
    const bench = s.steps[0] as ExStep;
    expect(benchmarkDue(ALT, p, NOW + 3 * DAY)).toBeNull();
    const day7 = benchmarkDue(ALT, p, NOW + 6 * DAY);
    expect(day7).toMatchObject({ day: 7, bpm: bench.bpm });
    expect(day7?.exercise.id).toBe(bench.exerciseId);
  });

  it("a week late is skipped, not made up", () => {
    expect(benchmarkDue(ALT, since(12), NOW)).toMatchObject({ day: 7 });
    expect(benchmarkDue(ALT, since(13), NOW)).toMatchObject({ day: 14 });
    expect(benchmarkDue(ALT, since(40), NOW)).toBeNull();
  });
});

describe("one Exercise once per Session (QA 2026-11-17 #9)", () => {
  /** Every Exercise a plan plays, Find my edge aside: that one is the lead's, climbing on. */
  const playedIn = (s: SessionPlan) =>
    s.steps.flatMap((x) => {
      if (x.kind === "exercise" && x.role !== "edge") return [`${x.pathId}/${x.exerciseId}`];
      if (x.kind === "jam" && x.pathId && x.exerciseId) return [`${x.pathId}/${x.exerciseId}`];
      return [];
    });

  it("the day-1 benchmark on the lead's head moves the lead block to the next Exercise", () => {
    const OPEN = ALT.steps[0].exercises[0];
    const at = NOW;
    const p: PlayerProgress = {
      ...subscribed([ALT], at),
      takes: [row(ALT, OPEN.id, at, { bpm: 60, facts: { session: at, role: "placement" } })],
    };
    for (const minutes of [10, 15, 20] as const) {
      const s = plan(minutes, p, [ALT], NOW + 60_000);
      const [bench, focus] = exerciseSteps(s);
      expect(bench.role).toBe("benchmark");
      expect(focus.role).toBe("focus");
      expect(focus.exerciseId).not.toBe(bench.exerciseId);
      const keys = playedIn(s);
      expect(new Set(keys).size, keys.join(", ")).toBe(keys.length);
    }
  });

  it("a month of daily Sessions on 1 to 4 Paths never plays an Exercise twice in one", () => {
    for (let count = 1; count <= 4; count += 1) {
      const paths = ALL.slice(0, count);
      for (const minutes of PLAN_MINUTES) {
        let p = subscribed(paths, NOW);
        for (let day = 0; day < 30; day += 1) {
          const at = NOW + day * DAY + 60_000;
          const s = plan(minutes, p, paths, at);
          const keys = playedIn(s);
          expect(new Set(keys).size, `${count} Paths, ${minutes} min, day ${day}: ${keys.join(", ")}`).toBe(keys.length);
          p = play(p, s, at, (x) => (day + x.bpm) % 3 !== 0);
        }
      }
    }
  });
});

describe("your turn, and the finisher", () => {
  it("one Session in three, from fifteen minutes, has a two-minute self-checked block", () => {
    // Blues' first Step has no self-checked item; its second does.
    const p: PlayerProgress = {
      ...subscribed([BLUES]),
      states: [{ pathId: BLUES.id, currentStepId: BLUES.steps[1].id, startedAt: NOW - 30 * DAY, updatedAt: NOW }],
      takes: [0, 1].map((d) =>
        row(BLUES, BLUES.steps[0].exercises[0].id, NOW - (d + 1) * DAY, { facts: { session: NOW - (d + 1) * DAY } }),
      ),
    };
    const s = plan(15, p, [BLUES]);
    const turn = s.steps.find((x) => x.id === "your-turn");
    expect(turn).toMatchObject({ kind: "metronome", minutes: 2 });
    expect(turn?.why.code).toBe("yourTurn");
    expect(s.steps.reduce((sum, x) => sum + x.minutes, 0)).toBe(15);
    // Not at ten minutes, and not every Session.
    expect(plan(10, p, [BLUES]).steps.some((x) => x.id === "your-turn")).toBe(false);
    const fewer = { ...p, takes: p.takes.slice(0, 1) };
    expect(plan(15, fewer, [BLUES]).steps.some((x) => x.id === "your-turn")).toBe(false);
  });

  it("twenty minutes ends on a riff with the band, at a tempo already passed", () => {
    const etude = find(ALT, "over-the-band.etude-eighths");
    const p = returning([ALT]);
    const withClean = {
      ...p,
      ceilings: [{ exerciseKey: `${ALT.id}/${etude.id}`, cleanBpm: 90, lastPracticed: NOW - 3 * DAY }],
    };
    const s = plan(20, withClean, [ALT]);
    const last = s.steps[s.steps.length - 1];
    expect(last).toMatchObject({ kind: "jam", id: "finisher", exerciseId: etude.id, bpm: 90 });
    expect(last.why.code).toBe("finisher");
  });

  it("without one, a review; without that, Find my edge; without that, the band", () => {
    const s = plan(20, returning([ALT]), [ALT]);
    const last = s.steps[s.steps.length - 1];
    expect(last.kind).toBe("jam");
    expect(last.why.code).toBe("jam");
  });
});

describe("one Take decides: Test out and a benchmark", () => {
  const ex = ALT.steps[0].exercises[0];
  for (const role of ["test", "benchmark"] as const) {
    it(`${role}: on after one graded Take, again only when it was not heard`, () => {
      const step: ExStep = {
        kind: "exercise",
        id: role,
        role,
        pathId: ALT.id,
        stepId: ALT.steps[0].id,
        exerciseId: ex.id,
        title: ex.title,
        bpm: 100,
        minutes: 2,
        variantSeed: null,
        why: { code: role === "test" ? "testOut" : "benchmark", values: {} },
      };
      const start = runReducer(IDLE, {
        type: "start",
        plan: { minutes: 5, mood: "returning", daysAway: 0, steps: [step] },
        now: NOW,
      });
      const after = (verdict: TakeOutcome["grade"]["verdict"]) =>
        [
          { type: "takeStarted", now: NOW } as const,
          { type: "takeStopped", now: NOW } as const,
          { type: "takeResult", now: NOW, outcome: { ...outcome(verdict), grade: { ...outcome(verdict).grade, verdict } } } as const,
        ].reduce(runReducer, start);
      expect(bigAction(after("belowBar"), ex).kind).toBe("finish");
      expect(bigAction(after("passed"), ex).kind).toBe("finish");
      expect(bigAction(after("notCaught"), ex)).toEqual({ kind: "again", bpm: 100 });
    });
  }
});
