import { describe, expect, it } from "vitest";
import type { TakeGrade } from "./grade";
import { EDGE_MINUTES, edgeStep, planSession } from "./planner";
import { gradedRungs } from "./ladder";
import type { PlanStep, SessionPlan } from "./planner";
import {
  IDLE,
  bigAction,
  currentStep,
  edgeOf,
  eventForBigAction,
  isEdgeStep,
  leaveNeedsAsking,
  minutesLeft,
  runReducer,
  stepRemainingMs,
  tempoNudges,
  canGoBack,
  timedBpm,
  timedTempoAdjustable,
  timedTempoLive,
  TIMED_BPM_STEP,
} from "./runner";
import type { RunEvent, RunState, TakeOutcome } from "./runner";
import { NO_PROGRESS } from "./progress";
import { ALT, NOW, missed, progress } from "./testKit";

const EX = ALT.steps[0].exercises[0];
const MIN = 60_000;

/** A returning player one Take in, so the focus is a plain Exercise (a new Path's is placement). */
function plan(minutes: 5 | 10 | 15 | 20 = 15): SessionPlan {
  return planSession({ minutes, now: NOW, paths: [ALT], progress: progress({ takes: [missed(EX.id, 60, 0.8)] }) });
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
    expect(s.phase).toBe("timedReady");
    expect(currentStep(s)?.kind).toBe("metronome");
  });

  it("a timed step waits for Start, its clock held at full", () => {
    const s = run(IDLE, { type: "start", plan: plan(), now: NOW });
    const step = currentStep(s) as PlanStep;
    expect(bigAction(s, EX)).toEqual({ kind: "startTimed", step });
    const later = run(s, { type: "tick", now: NOW + 10 * MIN });
    expect(later.phase).toBe("timedReady");
    expect(stepRemainingMs(later)).toBe(step.minutes * MIN);
    const going = run(later, { type: "timedStart", now: NOW + 10 * MIN });
    expect(going.phase).toBe("timed");
    expect(stepRemainingMs(going)).toBe(step.minutes * MIN);
    expect(eventForBigAction(bigAction(s, EX), NOW)).toEqual({ type: "timedStart", now: NOW });
  });

  it("a timed step can be skipped before it starts", () => {
    const s = run(IDLE, { type: "start", plan: plan(), now: NOW }, { type: "next", now: NOW });
    expect(s.phase).toBe("ready");
    expect(s.timedSteps).toHaveLength(1);
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

  it("a timed step ends by its clock and holds for Again or Next (SES-1)", () => {
    const start = run(IDLE, { type: "start", plan: plan(), now: NOW }, { type: "timedStart", now: NOW });
    const during = run(start, { type: "tick", now: NOW + MIN });
    expect(during.phase).toBe("timed");
    const ended = run(start, { type: "tick", now: NOW + 2 * MIN });
    expect(ended.phase).toBe("timed");
    expect(ended.ended).toBe(true);
    expect(eventForBigAction(bigAction(ended, EX), NOW)).toEqual({ type: "next", now: NOW });
    const after = run(ended, { type: "next", now: NOW + 2 * MIN });
    expect(after.phase).toBe("ready");
    expect(currentStep(after)?.id).toBe("focus");
  });

  it("ends in a recap after the last step, and closes to idle", () => {
    let s = run(IDLE, { type: "start", plan: plan(5), now: NOW });
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
    expect(s.phase).toBe("timedReady");
    s = run(s, { type: "timedStart", now: NOW });
    s = run(s, { type: "tick", now: NOW + twenty.steps[jamAt].minutes * MIN });
    expect(s.ended).toBe(true);
    s = run(s, { type: "next", now: NOW + twenty.steps[jamAt].minutes * MIN });
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
    ["timedReady", () => run(IDLE, { type: "start", plan: plan(), now: NOW })],
    [
      "timed",
      () => run(IDLE, { type: "start", plan: plan(), now: NOW }, { type: "timedStart", now: NOW }),
    ],
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
    expect(bigAction(s, EX)).toEqual({ kind: "playTake", bpm: s.bpm });
    expect(bigAction(run(s, { type: "takeStarted", now: NOW }), EX)).toEqual({ kind: "endTake" });
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
    expect(bigAction(s, EX)).toEqual({ kind: "again", bpm: 70, up: true });
  });

  it("Exercise passed: straight on, whatever time is left", () => {
    const s = afterTake(atFocus(), "passed", true);
    const action = bigAction(s, EX);
    expect(action.kind).toBe("next");
  });

  it("the last step's big action finishes", () => {
    const s = afterTake(run(IDLE, { type: "start", plan: plan(5), now: NOW }), "passed", true);
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
    expect(eventForBigAction({ kind: "playTake", bpm: 60 }, NOW)).toBeNull();
    expect(eventForBigAction({ kind: "endTake" }, NOW)).toBeNull();
  });
});

describe("tempo between Takes", () => {
  it("moves one rung, and only when there is one", () => {
    let s = afterTake(atFocus(), "belowBar");
    s = run(s, { type: "faster", exercise: EX, now: NOW });
    expect(s).toMatchObject({ phase: "ready", bpm: 70 });
    s = run(s, { type: "slower", exercise: EX, now: NOW });
    expect(s.bpm).toBe(60);
    expect(tempoNudges(s, EX)).toMatchObject({ slower: false, faster: true });
    // At the floor, Slower says why it is off (UX audit SES-13).
    expect(tempoNudges(s, EX)).toMatchObject({ slowerWhy: "floor", fasterWhy: null });
    expect(run(s, { type: "slower", exercise: EX, now: NOW }).bpm).toBe(60);
  });

  it("cannot change while a Take runs", () => {
    const s = run(atFocus(), { type: "takeStarted", now: NOW });
    expect(tempoNudges(s, EX)).toEqual({ slower: false, faster: false, slowerWhy: null, fasterWhy: null });
    expect(run(s, { type: "faster", exercise: EX, now: NOW }).bpm).toBe(s.bpm);
  });
});

describe("the clock", () => {
  it("counts down the step and the Session", () => {
    const s = atFocus(15);
    const focus = currentStep(s) as PlanStep;
    expect(stepRemainingMs(s)).toBe(focus.minutes * MIN);
    const later = run(s, { type: "tick", now: NOW + 3 * MIN + 1 });
    // One Path at fifteen: the lead, then one four-minute block (UX audit TODAY-4).
    expect(minutesLeft(later)).toBe(focus.minutes - 3 + 4);
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
    const during = run(
      s,
      { type: "insertStep", step: drill, now: NOW },
      { type: "timedStart", now: NOW },
    );
    expect(during.phase).toBe("timed");
    expect(currentStep(during)?.id).toBe("edge");
    // It takes what was left of the focus block, plus its own two minutes.
    const focusMinutes = (currentStep(s) as PlanStep).minutes;
    const ended = run(during, { type: "tick", now: NOW + (2 + focusMinutes) * MIN });
    expect(ended.ended).toBe(true);
    const after = run(ended, { type: "next", now: NOW + (2 + focusMinutes) * MIN });
    expect(currentStep(after)?.id).toBe("block-1");
    expect(after.phase).toBe("ready");
  });
});

describe("Find my edge", () => {
  const pick = { path: ALT, step: ALT.steps[0], exercise: EX };
  const rungs = gradedRungs(EX);
  const start = rungs[0];

  function edgeRun(): RunState {
    const step = edgeStep(pick, NO_PROGRESS, { bpm: start });
    const edgePlan: SessionPlan = { minutes: 5, mood: "returning", daysAway: null, steps: [step] };
    return run(IDLE, { type: "start", plan: edgePlan, now: NOW });
  }

  /** A Take on the edge at the runner's tempo, clean over eight bars when it passes. */
  function edgeTake(state: RunState, verdict: TakeGrade["verdict"]): RunState {
    const o = outcome(verdict);
    return run(
      state,
      { type: "takeStarted", now: NOW },
      { type: "takeStopped", now: NOW },
      {
        type: "takeResult",
        outcome: {
          ...o,
          stepId: "edge",
          bpm: state.bpm,
          grade: { ...o.grade, cleanBpm: verdict === "passed" ? state.bpm : null },
        },
        now: NOW,
      },
    );
  }

  function goBig(state: RunState): RunState {
    const event = eventForBigAction(bigAction(state, EX), NOW);
    return event ? run(state, event) : state;
  }

  it("is an Exercise step that starts where it is told", () => {
    const s = edgeRun();
    expect(s.phase).toBe("ready");
    expect(isEdgeStep(currentStep(s))).toBe(true);
    expect(s.bpm).toBe(start);
  });

  it("climbs a rung after every pass, past the Exercise's own pass rung", () => {
    let s = edgeTake(edgeRun(), "passed");
    expect(bigAction(s, EX)).toEqual({ kind: "again", bpm: rungs[1], up: true });
    s = edgeTake(goBig(s), "passed");
    expect(s.bpm).toBe(rungs[1]);
    expect(edgeOf(s, EX).reached).toBe(rungs[1]);
  });

  it("holds after one miss, and is done at the second on the same rung", () => {
    let s = edgeTake(edgeRun(), "passed");
    s = edgeTake(goBig(s), "belowBar");
    expect(bigAction(s, EX)).toEqual({ kind: "again", bpm: rungs[1] });
    expect(edgeOf(s, EX).done).toBe(false);
    s = edgeTake(goBig(s), "belowBar");
    const edge = edgeOf(s, EX);
    expect(edge).toMatchObject({ reached: start, slippedAt: rungs[1], done: true });
    expect(bigAction(s, EX).kind).toBe("finish");
  });

  it("a Take it could not hear neither climbs nor counts as a miss", () => {
    const s = edgeTake(edgeRun(), "notCaught");
    expect(bigAction(s, EX)).toEqual({ kind: "again", bpm: start });
    expect(edgeOf(s, EX)).toMatchObject({ reached: null, slippedAt: null, done: false });
  });

  it("adds exactly its minutes to the Session clock, as the offer says (QA 2026-11-17 #17)", () => {
    const s0 = afterTake(atFocus(), "passed");
    for (const elapsed of [0, 1.5, 3]) {
      const s = run(s0, { type: "tick", now: NOW + elapsed * MIN });
      const before = minutesLeft(s);
      const step = edgeStep(pick, NO_PROGRESS, { id: "edge", bpm: 60 });
      const during = run(s, { type: "insertStep", step, now: NOW + elapsed * MIN });
      expect(minutesLeft(during), `after ${elapsed} min`).toBe(before + EDGE_MINUTES);
    }
  });

  it("can be put in after a result, and the plan carries on after it", () => {
    const s = afterTake(atFocus(), "passed");
    const step = edgeStep(pick, NO_PROGRESS, { id: "edge", bpm: 60 });
    const during = run(s, { type: "insertStep", step, now: NOW });
    expect(during.phase).toBe("ready");
    expect(isEdgeStep(currentStep(during))).toBe(true);
    const after = run(during, { type: "next", now: NOW });
    expect(currentStep(after)?.id).toBe("block-1");
  });
});

describe("a timed step: pause, resume, restart, tempo, back (owner, beta 5)", () => {
  const started = () => run(IDLE, { type: "start", plan: plan(), now: NOW }, { type: "timedStart", now: NOW });

  it("pausing holds the clock; resuming carries on from where it was", () => {
    let s = run(started(), { type: "tick", now: NOW + 30_000 });
    const left = stepRemainingMs(s);
    s = run(s, { type: "pause", now: NOW + 30_000 });
    expect(s.paused).toBe(true);
    s = run(s, { type: "tick", now: NOW + 90_000 }, { type: "tick", now: NOW + 5 * MIN });
    expect(stepRemainingMs(s)).toBe(left);
    expect(s.phase).toBe("timed");
    const runs = s.runs;
    s = run(s, { type: "resume", now: NOW + 5 * MIN });
    expect(s.paused).toBe(false);
    expect(s.runs).toBe(runs + 1);
    expect(stepRemainingMs(s)).toBe(left);
  });

  it("a restart fills the clock again and starts a new run, paused or not", () => {
    let s = run(started(), { type: "tick", now: NOW + MIN }, { type: "pause", now: NOW + MIN });
    const runs = s.runs;
    s = run(s, { type: "restart", now: NOW + MIN });
    expect(s.paused).toBe(false);
    expect(s.runs).toBe(runs + 1);
    expect(stepRemainingMs(s)).toBe((currentStep(s)?.minutes ?? 0) * MIN);
  });

  it("a warm-up's tempo moves before the start, while paused, and while it plays (acceptance pass 2)", () => {
    let s = run(IDLE, { type: "start", plan: plan(), now: NOW });
    expect(currentStep(s)?.kind).toBe("metronome");
    expect(timedTempoAdjustable(currentStep(s))).toBe(true);
    const bpm = s.bpm;
    s = run(s, { type: "setBpm", bpm: timedBpm(bpm, -TIMED_BPM_STEP), now: NOW });
    expect(s.bpm).toBe(timedBpm(bpm, -TIMED_BPM_STEP));
    // Ungraded: slowing down to learn the pattern mid-run is the point of it.
    s = run(s, { type: "timedStart", now: NOW }, { type: "setBpm", bpm: 70, now: NOW });
    expect(s.bpm).toBe(70);
    expect(s.paused).toBe(false);
    s = run(s, { type: "pause", now: NOW }, { type: "setBpm", bpm: 200, now: NOW });
    expect(s.bpm).toBe(200);
    expect(timedBpm(31, -5)).toBe(30);
    expect(timedBpm(30, -5)).toBe(30);
  });

  it("a jam's tempo moves only between runs: mid-run would move the band under the player", () => {
    const jam = { id: "j", kind: "jam", minutes: 3, bpm: 90, title: "Jam", why: { code: "jam" } } as unknown as PlanStep;
    const s0 = run(IDLE, { type: "start", plan: plan(), now: NOW });
    let s: RunState = { ...s0, phase: "timed", paused: false, ended: false, bpm: 90, plan: { ...s0.plan!, steps: [jam] }, stepIndex: 0 };
    expect(timedTempoLive(currentStep(s))).toBe(false);
    s = run(s, { type: "setBpm", bpm: 60, now: NOW });
    expect(s.bpm).toBe(90);
    s = run(s, { type: "pause", now: NOW }, { type: "setBpm", bpm: 60, now: NOW });
    expect(s.bpm).toBe(60);
  });

  it("the step after a warm-up can go back to it, until something is played there", () => {
    let s = run(IDLE, { type: "start", plan: plan(), now: NOW }, { type: "next", now: NOW });
    expect(currentStep(s)?.kind).not.toBe("metronome");
    expect(canGoBack(s)).toBe(true);
    s = run(s, { type: "back", now: NOW });
    expect(s.phase).toBe("timedReady");
    expect(s.stepIndex).toBe(0);
    expect(canGoBack(s)).toBe(false);
  });

  it("played out, it holds for Again or Next rather than moving on (SES-1)", () => {
    let s = run(started(), { type: "tick", now: NOW + 60 * MIN });
    expect(s.stepIndex).toBe(0);
    expect(s.ended).toBe(true);
    expect(s.phase).toBe("timed");
    s = run(s, { type: "restart", now: NOW + 61 * MIN });
    expect(s.ended).toBe(false);
    expect(stepRemainingMs(s)).toBe((currentStep(s)?.minutes ?? 0) * MIN);
    s = run(s, { type: "tick", now: NOW + 200 * MIN }, { type: "next", now: NOW + 200 * MIN });
    expect(s.stepIndex).toBe(1);
    expect(s.skipped).toEqual([]);
  });

  it("a block left before it was played out shows as skipped", () => {
    const s = run(started(), { type: "next", now: NOW + MIN });
    expect(s.skipped).toEqual([plan().steps[0].id]);
    const t = run(IDLE, { type: "start", plan: plan(), now: NOW }, { type: "next", now: NOW });
    expect(t.skipped).toEqual([plan().steps[0].id]);
  });
});

describe("a Session started from a Step has no countdown (UX audit SES-11)", () => {
  it("still offers Go again after the step's minutes are gone", () => {
    const step = plan(5).steps.find((x) => x.kind === "exercise")!;
    const one: SessionPlan = { minutes: 5, mood: "returning", daysAway: null, steps: [{ ...step, minutes: 5 }] };
    let s = runReducer(IDLE, { type: "start", plan: one, now: NOW, untimed: true });
    expect(s.untimed).toBe(true);
    s = run(
      s,
      { type: "takeStarted", now: NOW },
      { type: "takeStopped", now: NOW + MIN },
      { type: "takeResult", outcome: { ...outcome("belowBar"), stepId: step.id }, now: NOW + 30 * MIN },
    );
    expect(bigAction(s, EX).kind).toBe("again");
    // The same Session with a countdown moves on once its time is up.
    const timed = { ...s, untimed: false };
    expect(bigAction(timed, EX).kind).not.toBe("again");
  });
});

describe("leaving asks once there is anything to lose (acceptance P2-1, P2-2)", () => {
  const base = { ...IDLE, plan: { minutes: 10, mood: "returning" as const, daysAway: null, steps: [] } };
  it("asks with a Take in the Session, a Take running, or a timed block running", () => {
    expect(leaveNeedsAsking({ ...base, phase: "ready" })).toBe(false);
    expect(leaveNeedsAsking({ ...base, phase: "timedReady" })).toBe(false);
    expect(leaveNeedsAsking({ ...base, phase: "timed", ended: false })).toBe(true);
    expect(leaveNeedsAsking({ ...base, phase: "timed", ended: true })).toBe(false);
    expect(leaveNeedsAsking({ ...base, phase: "playing" })).toBe(true);
    expect(leaveNeedsAsking({ ...base, phase: "ready", outcomes: [{} as never] })).toBe(true);
  });
  it("never on the recap", () => {
    expect(leaveNeedsAsking({ ...base, phase: "recap", outcomes: [{} as never] })).toBe(false);
  });
});

describe("the ready screen's key chooser (card #93)", () => {
  const chosen: SessionPlan = {
    minutes: 5,
    mood: "returning",
    daysAway: null,
    steps: [
      {
        kind: "exercise",
        id: "chosen",
        role: "focus",
        pathId: ALT.id,
        stepId: ALT.steps[0].id,
        exerciseId: EX.id,
        title: EX.title,
        bpm: 60,
        minutes: 5,
        variantSeed: 0,
        why: { code: "chosen", values: {} },
      } as PlanStep,
    ],
  } as SessionPlan;

  it("plays the key chosen, on the ready screen only", () => {
    const ready = run(IDLE, { type: "start", plan: chosen, now: NOW, untimed: true });
    expect(ready.phase).toBe("ready");
    const moved = run(ready, { type: "setVariant", seed: 2 });
    const step = currentStep(moved);
    expect(step?.kind === "exercise" && step.variantSeed).toBe(2);
    // The same key again changes nothing; a running Take is not touched.
    expect(run(moved, { type: "setVariant", seed: 2 })).toBe(moved);
    const playing = run(moved, { type: "takeStarted", now: NOW });
    expect(run(playing, { type: "setVariant", seed: 1 })).toBe(playing);
  });
});
