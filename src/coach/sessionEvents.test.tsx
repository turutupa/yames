/**
 * A Session, as the coach hears it (DESIGN 9.2, first row): the run's real
 * reducer behind the wrapped dispatch `useSessionRun.ts` uses, driven through
 * a warm-up and two Takes to the recap. Each transition is heard once, in
 * order, and a Take's `takeResult` carries the whole review, findings
 * included: today's Session reads only `review.segment` and drops the rest.
 */
import { act, renderHook } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { SongAttemptReview } from "../containers/songs/review/useSongAttempt";
import type { TakeGrade } from "../session/grade";
import type { PlanMinutes, PlanStep, Reason, SessionPlan } from "../session/planner";
import { IDLE, runReducer, type RunEvent, type TakeOutcome } from "../session/runner";
import type { TakeMeasures } from "../session/takeMeasures";
import type { Finding } from "../songs/types";
import { resetCoachBus, subscribe, type Delivered } from "./bus";
import { useCoachPublishingDispatch } from "./sessionEvents";

const WHY = { code: "focus", values: {} } as unknown as Reason;

const WARM_UP: PlanStep = { kind: "metronome", id: "warm", title: "Warm-up", bpm: 70, subdivision: 1, minutes: 1, why: WHY };
const EXERCISE: PlanStep = {
  kind: "exercise",
  id: "ex",
  role: "focus",
  pathId: "alternate-picking",
  stepId: "step-1",
  exerciseId: "ex-1",
  title: "Two strings",
  bpm: 80,
  minutes: 5,
  variantSeed: null,
  why: WHY,
};
const PLAN: SessionPlan = { minutes: 15 as PlanMinutes, mood: "first", daysAway: null, steps: [WARM_UP, EXERCISE] };

const FINDINGS: Finding[] = [
  {
    kind: "rushing",
    bars: [8, 8],
    noteIds: [41, 42],
    severity: 0.7,
    evidence: {
      onsets: 8,
      hits: 7,
      hitRate: 0.875,
      meanDeviationMs: -34,
      deviationBeats: -0.12,
      spreadMs: 11,
      passes: 3,
      passesAffected: 2,
      printedBars: [9, 9],
    },
  } as Finding,
];
const REVIEW = { attemptId: "att-1", findings: FINDINGS, segment: {} } as unknown as SongAttemptReview;

function outcome(takeNumber: number, ungraded?: TakeOutcome["ungraded"]): TakeOutcome {
  return {
    stepId: EXERCISE.id,
    exerciseId: "ex-1",
    title: "Two strings",
    bpm: 80,
    takeNumber,
    measures: { caught: true } as TakeMeasures,
    grade: { verdict: ungraded ? "ungraded" : "belowBar" } as TakeGrade,
    previousValue: null,
    cleanBefore: null,
    ...(ungraded ? { ungraded } : {}),
  };
}

function mount() {
  const heard: Delivered[] = [];
  subscribe((event) => heard.push(event));
  const hook = renderHook(() => {
    const [run, dispatchRun] = useReducer(runReducer, IDLE);
    const dispatch = useCoachPublishingDispatch(dispatchRun);
    return { run, dispatch };
  });
  const send = (event: RunEvent, review?: SongAttemptReview | null) =>
    act(() => hook.result.current.dispatch(event, review));
  return { heard, hook, send, types: () => heard.map((e) => e.type) };
}

afterEach(() => resetCoachBus());

describe("a Session, heard by the coach", () => {
  it("hears each transition once, in order, from the warm-up to the recap", () => {
    const { heard, hook, send, types } = mount();
    const dispatchBefore = hook.result.current.dispatch;

    send({ type: "start", plan: PLAN, now: 0 });
    send({ type: "timedStart", now: 1_000 });
    send({ type: "tick", now: 30_000 });
    send({ type: "tick", now: 61_000 }); // the minute is up
    send({ type: "tick", now: 62_000 }); // and stays up: not heard twice
    send({ type: "next", now: 63_000 });
    send({ type: "takeStarted", now: 64_000 });
    send({ type: "takeStopped", now: 70_000 });
    send({ type: "takeResult", outcome: outcome(1), now: 71_000 }, REVIEW);
    send({ type: "again", now: 72_000 });
    send({ type: "takeStarted", now: 73_000 });
    send({ type: "takeStopped", now: 79_000 });
    send({ type: "takeResult", outcome: outcome(2), now: 80_000 }, REVIEW);
    send({ type: "next", now: 81_000 });

    expect(types()).toEqual([
      "stepReady",
      "timedEnded",
      "stepReady",
      "takeStarted",
      "takeResult",
      "stepReady",
      "takeStarted",
      "takeResult",
      "sessionRecap",
    ]);
    expect(heard.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const [warm, ended, ready, started, , again] = heard;
    expect(warm).toMatchObject({ type: "stepReady", stepIndex: 0, timed: true, takes: 0, at: 0 });
    expect(ended).toMatchObject({ type: "timedEnded", stepIndex: 0, at: 61_000 });
    expect(ready).toMatchObject({ type: "stepReady", stepIndex: 1, timed: false, bpm: 80, takes: 0 });
    expect(started).toMatchObject({ type: "takeStarted", stepIndex: 1, takeNumber: 1, at: 64_000 });
    expect(again).toMatchObject({ type: "stepReady", stepIndex: 1, takes: 1 });

    const recap = heard[8];
    expect(recap.type === "sessionRecap" && recap.outcomes.map((o) => o.takeNumber)).toEqual([1, 2]);

    // The wrapper changes nothing about the run itself, and stays one function.
    expect(hook.result.current.run.phase).toBe("recap");
    expect(hook.result.current.run.outcomes).toHaveLength(2);
    expect(hook.result.current.dispatch).toBe(dispatchBefore);
  });

  it("a Take's result carries the whole review, findings included", () => {
    const { heard, send } = mount();
    send({ type: "start", plan: PLAN, now: 0, at: 1 });
    send({ type: "takeStarted", now: 1 });
    send({ type: "takeStopped", now: 2 });
    send({ type: "takeResult", outcome: outcome(1), now: 3 }, REVIEW);

    const result = heard.find((e) => e.type === "takeResult");
    expect(result?.type).toBe("takeResult");
    if (result?.type !== "takeResult") return;
    expect(result.outcome.takeNumber).toBe(1);
    expect(result.review).toBe(REVIEW);
    expect(result.review?.findings).toEqual(FINDINGS);
    expect(result.review?.findings[0].evidence.printedBars).toEqual([9, 9]);
  });

  it("an ungraded Take's result carries no review, whatever was lying about", () => {
    const { heard, send } = mount();
    send({ type: "start", plan: PLAN, now: 0, at: 1, ungraded: "chosen" });
    send({ type: "takeStarted", now: 1 });
    send({ type: "takeStopped", now: 2 });
    send({ type: "takeResult", outcome: outcome(1, "chosen"), now: 3 }, REVIEW);
    const result = heard.find((e) => e.type === "takeResult");
    expect(result?.type === "takeResult" && result.review).toBeNull();
  });

  it("a dispatch the run ignores is not heard", () => {
    const { send, types } = mount();
    send({ type: "takeResult", outcome: outcome(1), now: 0 }, REVIEW); // no Session
    send({ type: "start", plan: PLAN, now: 0, at: 1 });
    send({ type: "takeResult", outcome: outcome(1), now: 1 }, REVIEW); // no Take running
    const rungs = [80, 90].map((bpm) => ({ bpm, grading: "graded" }));
    send({ type: "faster", exercise: { tempo: { rungs } } as never, now: 2 }); // a tempo, not a new step
    expect(types()).toEqual(["stepReady"]);
  });
});
