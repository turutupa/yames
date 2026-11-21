/**
 * The bar's blocks, Previous, Today's "start here", and a Session played
 * without grading (owner, 2026-11-18).
 */
import { describe, expect, it } from "vitest";
import { planSession, tempoFor } from "./planner";
import type { SessionPlan } from "./planner";
import {
  IDLE,
  bigAction,
  blockState,
  canJump,
  hasPrevious,
  jumpNeedsAsking,
  minutesLeft,
  runReducer,
} from "./runner";
import type { RunEvent, RunState, TakeOutcome } from "./runner";
import { isExercisePassed, isUngradedTake } from "./progress";
import { ALT, NOW, missed, progress, take } from "./testKit";

const EX = ALT.steps[0].exercises[0];

function plan(): SessionPlan {
  return planSession({ minutes: 15, now: NOW, paths: [ALT], progress: progress({ takes: [missed(EX.id, 60, 0.8)] }) });
}

function run(state: RunState, ...events: RunEvent[]): RunState {
  return events.reduce(runReducer, state);
}

const start = (at?: number, ungraded: RunState["ungraded"] = null): RunState =>
  run(IDLE, { type: "start", plan: plan(), now: NOW, at, ungraded });

function ungradedOutcome(stepId: string): TakeOutcome {
  return {
    stepId,
    exerciseId: EX.id,
    title: EX.title,
    bpm: 60,
    takeNumber: 1,
    measures: {
      expected: 0,
      heard: 0,
      extras: 0,
      evenness: null,
      accent: null,
      noteIdentity: null,
      barsPlayed: 8,
      barEvenness: null,
      caught: false,
    },
    grade: { verdict: "ungraded", checks: [], headline: null, unmeasured: [], cleanBpm: null, passesExercise: false },
    previousValue: null,
    cleanBefore: null,
    ungraded: "inputOff",
  };
}

describe("starting at block N (Today's rows)", () => {
  it("runs block N, the blocks before it neither done nor skipped", () => {
    const p = plan();
    expect(p.steps.length).toBeGreaterThan(2);
    const s = start(2);
    expect(s.stepIndex).toBe(2);
    expect(blockState(s, 2)).toBe("on");
    expect(blockState(s, 0)).toBe("todo");
    expect(blockState(s, 1)).toBe("todo");
    expect(s.skipped).toEqual([]);
    expect(s.done).toEqual([]);
  });

  it("Previous from N goes to N-1, on its ready screen", () => {
    const s = start(2);
    expect(hasPrevious(s)).toBe(true);
    const back = run(s, { type: "jump", index: 1, now: NOW + 1000 });
    expect(back.stepIndex).toBe(1);
    expect(["ready", "timedReady"]).toContain(back.phase);
    // Gone back from before it was played: still ahead, not skipped
    // (acceptance 5, P2-5: its tooltip said "· skipped").
    expect(blockState(back, 2)).toBe("todo");
    expect(back.skipped).toEqual([]);
    // Passed by with Next, it is skipped then.
    const passed = run(back, { type: "next", now: NOW + 2000 }, { type: "next", now: NOW + 3000 });
    expect(blockState(passed, 2)).toBe("skipped");
  });

  it("the main Start still begins at block 1", () => {
    expect(start().stepIndex).toBe(0);
    expect(hasPrevious(start())).toBe(false);
  });

  it("an index past the end starts at the last block", () => {
    const s = start(99);
    expect(s.stepIndex).toBe(plan().steps.length - 1);
  });
});

describe("jumping between blocks", () => {
  it("forward from a ready screen; the block left is skipped", () => {
    const s = start();
    const ahead = run(s, { type: "jump", index: 2, now: NOW });
    expect(ahead.stepIndex).toBe(2);
    expect(blockState(ahead, 0)).toBe("skipped");
    expect(blockState(ahead, 1)).toBe("todo");
  });

  it("back from a block that was played out keeps it done", () => {
    let s = run(start(), { type: "next", now: NOW });
    const focus = s.stepIndex;
    const stepId = s.plan!.steps[focus].id;
    s = run(
      s,
      { type: "takeStarted", now: NOW },
      { type: "takeStopped", now: NOW + 10_000 },
      { type: "takeResult", outcome: ungradedOutcome(stepId), now: NOW + 11_000 },
      { type: "jump", index: 0, now: NOW + 12_000 },
    );
    expect(blockState(s, focus)).toBe("done");
  });

  it("back to a block that was played keeps its Takes, and it is on again", () => {
    let s = run(start(), { type: "next", now: NOW }); // the warm-up, skipped
    const focus = s.stepIndex;
    const stepId = s.plan!.steps[focus].id;
    s = run(
      s,
      { type: "takeStarted", now: NOW },
      { type: "takeStopped", now: NOW + 10_000 },
      { type: "takeResult", outcome: ungradedOutcome(stepId), now: NOW + 11_000 },
      { type: "jump", index: focus + 1, now: NOW + 12_000 },
    );
    expect(blockState(s, focus)).toBe("done");
    s = run(s, { type: "jump", index: focus, now: NOW + 13_000 });
    expect(s.stepIndex).toBe(focus);
    expect(s.phase).toBe("ready");
    expect(s.outcomes).toHaveLength(1);
  });

  it("never while a Take runs or is being scored: that asks first", () => {
    const s = run(start(), { type: "next", now: NOW }, { type: "takeStarted", now: NOW });
    expect(canJump(s)).toBe(false);
    expect(jumpNeedsAsking(s)).toBe(true);
    expect(run(s, { type: "jump", index: 0, now: NOW })).toBe(s);
  });

  it("a running warm-up asks too; a ready screen does not", () => {
    const ready = start();
    expect(jumpNeedsAsking(ready)).toBe(false);
    const warm = run(ready, { type: "timedStart", now: NOW });
    expect(warm.phase).toBe("timed");
    expect(jumpNeedsAsking(warm)).toBe(true);
  });

  it("the clock keeps real time: jumping back to a played block gives back none of the plan", () => {
    const s = start();
    const minutes = minutesLeft(s);
    const there = run(s, { type: "jump", index: 2, now: NOW + 60_000 }, { type: "jump", index: 1, now: NOW + 60_000 });
    // Block 0 was skipped and stays out of what is left.
    expect(minutesLeft(there)).toBeLessThan(minutes);
  });
});

describe("played without grading", () => {
  it("is the rest of the Session once chosen, and can be turned back", () => {
    const s = run(start(), { type: "next", now: NOW }, { type: "setUngraded", why: "inputOff" });
    expect(s.ungraded).toBe("inputOff");
    const stepId = s.plan!.steps[s.stepIndex].id;
    const after = run(
      s,
      { type: "takeStarted", now: NOW },
      { type: "takeStopped", now: NOW + 1 },
      { type: "takeResult", outcome: ungradedOutcome(stepId), now: NOW + 2 },
      { type: "next", now: NOW + 3 },
    );
    expect(after.ungraded).toBe("inputOff");
    expect(run(after, { type: "setUngraded", why: null }).ungraded).toBeNull();
  });

  it("Grade my playing off starts every Session ungraded", () => {
    expect(start(undefined, "gradingOff").ungraded).toBe("gradingOff");
  });

  it("an ungraded result offers what comes next, never 'again' as a verdict", () => {
    const s = run(start(), { type: "next", now: NOW });
    const stepId = s.plan!.steps[s.stepIndex].id;
    const result = run(
      s,
      { type: "takeStarted", now: NOW },
      { type: "takeStopped", now: NOW + 1 },
      { type: "takeResult", outcome: ungradedOutcome(stepId), now: NOW + 2 },
    );
    expect(["next", "finish"]).toContain(bigAction(result, EX).kind);
  });

  it("the planner ignores an ungraded Take, and nothing passes on one", () => {
    const quiet = take(EX.id, {
      bpm: 90,
      startedAt: NOW - 1000,
      caught: false,
      facts: { verdict: "ungraded", ungraded: "inputOff" },
    });
    expect(isUngradedTake(quiet)).toBe(true);
    const graded = progress({ takes: [missed(EX.id, 60, 0.8)] });
    const withQuiet = progress({ takes: [quiet, missed(EX.id, 60, 0.8)] });
    // Not read as "the last Take was not heard": the tempo is the one the graded history gives.
    expect(tempoFor(ALT, EX, withQuiet)).toEqual(tempoFor(ALT, EX, graded));
    expect(isExercisePassed(withQuiet, ALT.id, EX)).toBe(false);
  });

  // "Counts toward minutes and the streak" lives in `totals.test.ts`, with `totalsFrom`.
});
