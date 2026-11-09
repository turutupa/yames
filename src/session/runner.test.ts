import { describe, expect, it } from "vitest";
import type { TakeGrade } from "./grade";
import { planSession } from "./planner";
import type { PlanStep, SessionPlan } from "./planner";
import {
  IDLE,
  bigAction,
  currentStep,
  eventForBigAction,
  minutesLeft,
  runReducer,
  stepRemainingMs,
  tempoNudges,
} from "./runner";
import type { RunEvent, RunState, TakeOutcome } from "./runner";
import { NO_PROGRESS } from "./progress";
import { ALT, NOW } from "./testKit";

const EX = ALT.steps[0].exercises[0];
const MIN = 60_000;

function plan(minutes: 5 | 10 | 15 | 20 = 15): SessionPlan {
  return planSession({ minutes, now: NOW, paths: [ALT], progress: NO_PROGRESS });
}

function run(state: RunState, ...events: RunEvent[]): RunState {
  return events.reduce(runReducer, state);
}

function grade(verdict: TakeGrade["verdict"], passesExercise = false): TakeGrade {
  return {
    verdict,
    checks: [],
    headline: null,
    unmeasured: [],
    cleanBpm: null,
    passesExercise,
  };
}

function outcome(verdict: TakeGrade["verdict"], passesExercise = false): TakeOutcome {
  return {
    stepId: "focus",
    exerciseId: EX.id,
    title: EX.title,
    bpm: 60,
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
    },
    grade: grade(verdict, passesExercise),
    previousValue: null,
    cleanBefore: null,
  };
}

/** Into the first Exercise of a Session with a warm-up, the warm-up skipped. */
function atFocus(minutes: 10 | 15 | 20 = 15): RunState {
  return run(IDLE, { type: "start", plan: plan(minutes), now: NOW }, { type: "next", now: NOW });
}

function afterTake(state: RunState, verdict: TakeGrade["verdict"], passes = false, at = NOW): RunState {
  return run(
    state,
    { type: "takeStarted", now: at },
    { type: "takeStopped", now: at },
    { type: "takeResult", outcome: outcome(verdict, passes), now: at },
  );
}

describe("the walk through a Session", () => {
  it("begins on the first step", () => {
    const s = run(IDLE, { type: "start", plan: plan(), now: NOW });
    expect(s.phase).toBe("timed");
    expect(currentStep(s)?.kind).toBe("metronome");
  });

  it("does not begin with nothing to do", () => {
    const empty: SessionPlan = { ...plan(), steps: [] };
    expect(run(IDLE, { type: "start", plan: empty, now: NOW })).toBe(IDLE);
  });

  it("an Exercise waits for the player, for as long as they like", () => {
    const s = run(atFocus(), { type: "tick", now: NOW + 60 * MIN });
    expect(s.phase).toBe("ready");
    expect(currentStep(s)?.id).toBe("focus");
  });

  it("a Take goes ready, playing, listening, result", () => {
    let s = atFocus();
    s = run(s, { type: "takeStarted", now: NOW });
    expect(s.phase).toBe("playing");
    s = run(s, { type: "takeStopped", now: NOW });
    expect(s.phase).toBe("listening");
    s = run(s, { type: "takeResult", outcome: outcome("passed"), now: NOW });
    expect(s.phase).toBe("result");
    expect(s.outcomes).toHaveLength(1);
    expect(s.takes).toBe(1);
  });

  it("a result waits too, past its minutes", () => {
    const s = run(afterTake(atFocus(), "belowBar"), { type: "tick", now: NOW + 60 * MIN });
    expect(s.phase).toBe("result");
  });

  it("a timed step moves on by itself", () => {
    const start = run(IDLE, { type: "start", plan: plan(), now: NOW });
    const during = run(start, { type: "tick", now: NOW + MIN });
    expect(during.phase).toBe("timed");
    const after = run(start, { type: "tick", now: NOW + 2 * MIN });
    expect(after.phase).toBe("ready");
    expect(currentStep(after)?.id).toBe("focus");
  });

  it("ends in a recap after the last step, and closes to idle", () => {
    let s = atFocus(10);
    s = afterTake(s, "passed", true);
    s = run(s, { type: "next", now: NOW });
    expect(s.phase).toBe("recap");
    expect(bigAction(s, EX)).toEqual({ kind: "close" });
    expect(run(s, { type: "close" })).toEqual(IDLE);
  });

  it("a jam at the end is left by the clock and reaches the recap", () => {
    const twenty = plan(20);
    const jamAt = twenty.steps.findIndex((x) => x.kind === "jam");
    let s = run(IDLE, { type: "start", plan: twenty, now: NOW });
    for (let i = 0; i < jamAt; i += 1) s = run(s, { type: "next", now: NOW });
    expect(s.phase).toBe("timed");
    s = run(s, { type: "tick", now: NOW + 3 * MIN });
    expect(s.phase).toBe("recap");
  });
});

describe("leaving", () => {
  const places: Array<[string, () => RunState]> = [
    ["ready", () => atFocus()],
    ["playing", () => run(atFocus(), { type: "takeStarted", now: NOW })],
    [
      "listening",
      () => run(atFocus(), { type: "takeStarted", now: NOW }, { type: "takeStopped", now: NOW }),
    ],
    ["result", () => afterTake(atFocus(), "passed")],
    ["timed", () => run(IDLE, { type: "start", plan: plan(), now: NOW })],
  ];
  it.each(places)("can cancel from %s", (_name, make) => {
    expect(run(make(), { type: "cancel" })).toEqual(IDLE);
  });

  it("idle ignores everything but a start", () => {
    for (const e of [
      { type: "takeStarted", now: NOW },
      { type: "next", now: NOW },
      { type: "tick", now: NOW },
    ] as RunEvent[]) {
      expect(run(IDLE, e)).toBe(IDLE);
    }
  });

  it("a stray next during a Take does nothing", () => {
    const s = run(atFocus(), { type: "takeStarted", now: NOW });
    expect(run(s, { type: "next", now: NOW }).phase).toBe("playing");
  });

  it("a stale result after leaving does nothing", () => {
    expect(run(IDLE, { type: "takeResult", outcome: outcome("passed"), now: NOW })).toBe(IDLE);
  });
});

describe("the one big next action", () => {
  it("starts a Take from ready, stops it while playing", () => {
    const s = atFocus();
    expect(bigAction(s, EX)).toEqual({ kind: "startTake", bpm: s.bpm });
    expect(bigAction(run(s, { type: "takeStarted", now: NOW }), EX)).toEqual({ kind: "stopTake" });
  });

  it("offers nothing while listening", () => {
    const s = run(atFocus(), { type: "takeStarted", now: NOW }, { type: "takeStopped", now: NOW });
    expect(bigAction(s, EX)).toEqual({ kind: "none" });
  });

  it("not heard: play it again, however late it is", () => {
    const s = afterTake(atFocus(), "notCaught");
    expect(bigAction(run(s, { type: "tick", now: NOW + 60 * MIN }), EX).kind).toBe("again");
  });

  it("below the bar: again while there is time, then on", () => {
    const s = afterTake(atFocus(), "belowBar");
    expect(bigAction(s, EX).kind).toBe("again");
    expect(bigAction(run(s, { type: "tick", now: NOW + 60 * MIN }), EX).kind).toBe("next");
  });

  it("bar met under the pass rung: up a rung", () => {
    const s = afterTake(atFocus(), "passed");
    expect(bigAction(s, EX)).toEqual({ kind: "again", bpm: 70 });
  });

  it("Exercise passed: straight on, whatever time is left", () => {
    const s = afterTake(atFocus(), "passed", true);
    const action = bigAction(s, EX);
    expect(action.kind).toBe("next");
  });

  it("the last step's big action finishes", () => {
    const s = afterTake(atFocus(10), "passed", true);
    expect(bigAction(s, EX)).toEqual({ kind: "finish" });
  });

  it("is performed through one event", () => {
    const s = afterTake(atFocus(), "passed");
    const e = eventForBigAction(bigAction(s, EX), NOW);
    expect(e).toEqual({ type: "again", bpm: 70, now: NOW });
    const again = run(s, e as RunEvent);
    expect(again.phase).toBe("ready");
    expect(again.bpm).toBe(70);
  });

  it("starting and stopping are left to the engine", () => {
    expect(eventForBigAction({ kind: "startTake", bpm: 60 }, NOW)).toBeNull();
    expect(eventForBigAction({ kind: "stopTake" }, NOW)).toBeNull();
  });
});

describe("tempo between Takes", () => {
  it("moves one rung, and only when there is one", () => {
    let s = afterTake(atFocus(), "belowBar");
    s = run(s, { type: "faster", exercise: EX, now: NOW });
    expect(s).toMatchObject({ phase: "ready", bpm: 70 });
    s = run(s, { type: "slower", exercise: EX, now: NOW });
    expect(s.bpm).toBe(60);
    expect(tempoNudges(s, EX)).toEqual({ slower: false, faster: true });
    expect(run(s, { type: "slower", exercise: EX, now: NOW }).bpm).toBe(60);
  });

  it("cannot change while a Take runs", () => {
    const s = run(atFocus(), { type: "takeStarted", now: NOW });
    expect(tempoNudges(s, EX)).toEqual({ slower: false, faster: false });
    expect(run(s, { type: "faster", exercise: EX, now: NOW }).bpm).toBe(s.bpm);
  });
});

describe("the clock", () => {
  it("counts down the step and the Session", () => {
    const s = atFocus(15);
    const focus = currentStep(s) as PlanStep;
    expect(stepRemainingMs(s)).toBe(focus.minutes * MIN);
    const later = run(s, { type: "tick", now: NOW + 3 * MIN + 1 });
    expect(minutesLeft(later)).toBe(focus.minutes - 3 + 5);
  });

  it("never goes negative", () => {
    const s = run(atFocus(15), { type: "tick", now: NOW + 600 * MIN });
    expect(stepRemainingMs(s)).toBe(0);
  });
});

describe("the seam for Ramp up", () => {
  const drill: Extract<PlanStep, { kind: "drill" }> = {
    kind: "drill",
    id: "edge",
    title: "Ramp up",
    startBpm: 80,
    targetBpm: 120,
    minutes: 2,
    why: { code: "edge", values: { bpm: 80 } },
  };

  it("goes in after the Exercise and comes back to the plan", () => {
    const s = afterTake(atFocus(), "passed");
    const during = run(s, { type: "insertDrill", step: drill, now: NOW });
    expect(during.phase).toBe("timed");
    expect(currentStep(during)?.id).toBe("edge");
    const after = run(during, { type: "tick", now: NOW + 2 * MIN });
    expect(currentStep(after)?.id).toBe("next");
    expect(after.phase).toBe("ready");
  });
});
