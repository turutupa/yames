/**
 * The coach's voice in a Session (DESIGN section 8, Voice; 3.4): the run's real
 * reducer behind the publishing dispatch `useSessionRun.ts` uses, a fake
 * speech engine, and a "screen" that hands the voice its headline after every
 * dispatch the way the notes' effects do (whether or not a boundary is open,
 * and also while a Take runs, to show the voice ignores it then).
 */
import { act, renderHook } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TakeGrade } from "../session/grade";
import type { LoopStep, PlanMinutes, PlanStep, Reason, SessionPlan } from "../session/planner";
import { IDLE, runReducer, type RunEvent, type RunState, type TakeOutcome } from "../session/runner";
import type { TakeMeasures } from "../session/takeMeasures";
import { soundStarting } from "../soundGate";
import { resetCoachBus } from "./bus";
import { useCoachPublishingDispatch } from "./sessionEvents";
import {
  installCoachVoice,
  resetCoachVoice,
  sayAtBoundary,
  sayNow,
  setVoiceEnabled,
  setVoiceInSession,
  setVoiceSounding,
  soundIsStarting,
} from "./voice";

/** Let settled speak calls run their `then`. */
async function flush(): Promise<void> {
  for (let i = 0; i < 3; i += 1) await Promise.resolve();
}

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
const JAM: PlanStep = { kind: "jam", id: "jam", title: "Jam", bpm: 90, minutes: 2, why: WHY } as unknown as PlanStep;
const PLAN: SessionPlan = { minutes: 15 as PlanMinutes, mood: "first", daysAway: null, steps: [WARM_UP, EXERCISE, JAM] };
const LOOP: LoopStep = {
  kind: "loop",
  id: "ex#loop",
  title: "Two strings",
  pathId: "alternate-picking",
  exerciseId: "ex-1",
  variantSeed: null,
  fromBar: 1,
  toBar: 1,
  bpm: 70,
  minutes: 0,
  why: WHY,
};
const EXERCISE_TEMPO = { tempo: { rungs: [70, 80, 90].map((bpm) => ({ bpm, grading: "graded" })) } } as never;

function outcome(takeNumber: number): TakeOutcome {
  return {
    stepId: EXERCISE.id,
    exerciseId: "ex-1",
    title: "Two strings",
    bpm: 80,
    takeNumber,
    measures: { caught: true } as TakeMeasures,
    grade: { verdict: "belowBar" } as TakeGrade,
    previousValue: null,
    cleanBefore: null,
  };
}

const ORDER = "Keep the pick close as you cross.";
const FINDING = "The first bar slipped on two rounds of three.";

/** What the screen hands the voice for a state: the ready note's order, the result note's finding, or nothing. */
function screen(run: RunState): void {
  // Every phase reports, as a note left mounted by mistake would: only an open boundary may speak.
  sayAtBoundary("ready", ORDER);
  if (run.phase === "result") sayAtBoundary("result", FINDING);
}

type Out = { said: string[]; stops: number; pending: Array<() => void> };

function mount(options: { voice?: boolean; lostStops?: number } = {}) {
  const out: Out = { said: [], stops: 0, pending: [] };
  let lost = options.lostStops ?? 0;
  const uninstall = installCoachVoice({
    // Speech lasts until the test ends it, or a stop that arrives in time does
    // (Rust settles the speak once the cancel is seen). A lost stop is one
    // Rust received before the line had begun: it cancels nothing.
    speak: (text) =>
      new Promise<void>((resolve) => {
        out.said.push(text);
        out.pending.push(resolve);
      }),
    stop: () => {
      out.stops += 1;
      if (lost > 0) {
        lost -= 1;
      } else {
        out.pending.splice(0).forEach((resolve) => resolve());
      }
      return Promise.resolve();
    },
  });
  setVoiceEnabled(options.voice ?? true);
  const hook = renderHook(() => {
    const [run, dispatchRun] = useReducer(runReducer, IDLE);
    const dispatch = useCoachPublishingDispatch(dispatchRun);
    return { run, dispatch };
  });
  const send = (event: RunEvent) => {
    act(() => hook.result.current.dispatch(event));
    screen(hook.result.current.run);
  };
  /** The engine starts: the gate `ipc.setPlaying(true)` runs right after asking, then the state it reports. */
  const play = () => {
    soundStarting();
    setVoiceSounding(true);
  };
  const stop = () => setVoiceSounding(false);
  /** A Take from Start to its result, the engine and the run as useSessionRun drives them. */
  const take = (n: number, at: number) => {
    play();
    send({ type: "takeStarted", now: at });
    screen(hook.result.current.run);
    expect(sayNow("anything")).toBe(false);
    stop();
    send({ type: "takeStopped", now: at + 5_000 });
    expect(sayNow("anything")).toBe(false);
    send({ type: "takeResult", outcome: outcome(n), now: at + 6_000 });
  };
  return { out, send, play, stop, take, uninstall, run: () => hook.result.current.run };
}

let cleanup: (() => void) | null = null;
beforeEach(() => {
  resetCoachVoice();
});
afterEach(() => {
  cleanup?.();
  cleanup = null;
  resetCoachBus();
  resetCoachVoice();
});

describe("the coach's voice", () => {
  it("with Voice off says nothing, anywhere", () => {
    const s = mount({ voice: false });
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    s.take(1, 10);
    s.send({ type: "slower", exercise: EXERCISE_TEMPO, now: 20 });
    expect(sayNow("Next: Jam.")).toBe(false);
    expect(s.out.said).toEqual([]);
    expect(s.out.stops).toBe(0);
  });

  it("says the order on a ready screen and the finding on a result, once each", () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    // A warm-up's ready screen has no order: nothing.
    expect(s.out.said).toEqual([]);
    s.send({ type: "next", now: 1 });
    expect(s.out.said).toEqual([ORDER]);
    // The note renders again: not said twice.
    s.send({ type: "tick", now: 2 });
    screen(s.run());
    expect(s.out.said).toEqual([ORDER]);
    s.take(1, 10);
    expect(s.out.said).toEqual([ORDER, FINDING]);
    // Slower: a ready screen of its own, so its order.
    s.send({ type: "slower", exercise: EXERCISE_TEMPO, now: 20 });
    expect(s.run().phase).toBe("ready");
    expect(s.out.said).toEqual([ORDER, FINDING, ORDER]);
  });

  it("nothing is spoken between takeStarted and the result", () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    const before = s.out.said.length;
    s.play();
    s.send({ type: "takeStarted", now: 10 });
    // Whatever reports a line while the Take runs, and whatever a key asks for.
    sayAtBoundary("ready", ORDER);
    sayAtBoundary("result", FINDING);
    expect(sayNow("What's next")).toBe(false);
    s.stop();
    s.send({ type: "takeStopped", now: 15 });
    // Listening, engine stopped: still the Take.
    sayAtBoundary("ready", ORDER);
    expect(sayNow("What's next")).toBe(false);
    expect(s.out.said).toHaveLength(before);
    s.send({ type: "takeResult", outcome: outcome(1), now: 16 });
    expect(s.out.said.slice(before)).toEqual([FINDING]);
  });

  it("a Start pressed during speech cuts it at once, before the engine reports playing", async () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    expect(s.out.said).toEqual([ORDER]);
    expect(s.out.stops).toBe(0);
    // ipc.setPlaying(true) runs the sound gate right after it asks the engine.
    soundStarting();
    expect(s.out.stops).toBe(1);
    // The speak settles on the cut; then the engine's own report changes nothing more.
    await flush();
    setVoiceSounding(true);
    s.send({ type: "takeStarted", now: 5 });
    expect(s.out.stops).toBe(1);
  });

  it("a lost stop is sent again when sound is reported and at takeStarted", async () => {
    // The first stop reaches Rust before the line had begun: it cancels nothing.
    const s = mount({ lostStops: 1 });
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    soundStarting();
    expect(s.out.stops).toBe(1);
    await flush();
    // Still speaking (the speak has not settled): the engine's report cuts it again.
    setVoiceSounding(true);
    expect(s.out.stops).toBe(2);
    await flush();
    // That one took: the speak settled, so takeStarted has nothing left to stop.
    s.send({ type: "takeStarted", now: 5 });
    expect(s.out.stops).toBe(2);
  });

  it("a lost stop is sent again at takeStarted when sound came by another road", async () => {
    const s = mount({ lostStops: 2 });
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    soundStarting();
    await flush();
    setVoiceSounding(true);
    await flush();
    expect(s.out.stops).toBe(2);
    s.send({ type: "takeStarted", now: 5 });
    expect(s.out.stops).toBe(3);
  });

  it("a coach key pressed while the order is being said speaks the key's line, with no stop before it", async () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    expect(s.out.said).toEqual([ORDER]);
    // The speak replaces the order itself (`tts_speak` cancels what is speaking):
    // a stop of ours first could land after the new line began and cut it.
    expect(sayNow("Next: Jam.")).toBe(true);
    expect(s.out.said).toEqual([ORDER, "Next: Jam."]);
    expect(s.out.stops).toBe(0);
  });

  it("leaving the Session drops a waiting line and cuts one being said", async () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.play();
    s.send({ type: "timedStart", now: 1 });
    s.send({ type: "next", now: 2 }); // deferred: the warm-up's last bar still sounds
    setVoiceInSession(false); // Escape to Today
    s.stop();
    expect(s.out.said).toEqual([]);
    // Nor does a key or a late note speak outside the Session.
    expect(sayNow("Next: Jam.")).toBe(false);
    setVoiceInSession(true);
    // A line in flight is cut when the Session is left.
    expect(sayNow("Next: Jam.")).toBe(true);
    setVoiceInSession(false);
    expect(s.out.stops).toBe(1);
  });

  it("nothing is spoken between a Start and the engine reporting sound", () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    soundStarting();
    expect(soundIsStarting()).toBe(true);
    expect(sayNow("Next: Jam.")).toBe(false);
    setVoiceSounding(true);
    expect(soundIsStarting()).toBe(false);
  });

  it("a Start the engine never reports stops holding the voice after a moment", () => {
    vi.useFakeTimers();
    try {
      const s = mount();
      cleanup = s.uninstall;
      soundStarting();
      expect(sayNow("Next: Jam.")).toBe(false);
      vi.advanceTimersByTime(2_500);
      expect(soundIsStarting()).toBe(false);
      expect(sayNow("Next: Jam.")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("takeStarted alone cuts speech too (a Start that came by another road)", () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    s.send({ type: "takeStarted", now: 5 });
    expect(s.out.stops).toBe(1);
  });

  it("Go again does not say the order over the count-in", () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    s.take(1, 10);
    const said = s.out.said.length;
    // Go again: a ready screen for a moment, then straight into the count-in.
    s.send({ type: "again", now: 20 });
    expect(s.run().phase).toBe("ready");
    expect(s.out.said).toHaveLength(said);
    // The note there may draw late, with the engine already starting: still nothing.
    s.play();
    screen(s.run());
    s.send({ type: "takeStarted", now: 21 });
    expect(s.out.said).toHaveLength(said);
  });

  it("a loop says nothing over it, and coming back from it is not a new ready screen", () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    s.take(1, 10);
    const said = s.out.said.length;
    s.play();
    s.send({ type: "loop", loop: LOOP, now: 20 });
    expect(s.run().phase).toBe("looping");
    expect(sayNow("What's next")).toBe(false);
    s.stop();
    s.send({ type: "loopStopped", heard: null, now: 30 } as RunEvent);
    expect(s.run().phase).toBe("ready");
    expect(s.out.said).toHaveLength(said);
  });

  it("a warm-up and a jam: nothing said over them, nothing on their ready screens", () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.play();
    s.send({ type: "timedStart", now: 1 });
    expect(sayNow("What's next")).toBe(false);
    s.send({ type: "tick", now: 61_000 });
    s.stop();
    s.send({ type: "next", now: 62_000 });
    expect(s.out.said).toEqual([ORDER]);
    s.take(1, 63_000);
    s.send({ type: "next", now: 70_000 });
    expect(s.run().phase).toBe("timedReady");
    const said = s.out.said.length;
    s.play();
    s.send({ type: "timedStart", now: 71_000 });
    expect(sayNow("What's next")).toBe(false);
    expect(s.out.said).toHaveLength(said);
  });

  it("a ready screen that comes up while the engine winds down waits for it, and a Start forgets it", () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.play();
    s.send({ type: "timedStart", now: 1 });
    s.send({ type: "next", now: 2 }); // the warm-up's last bar is still sounding
    expect(s.out.said).toEqual([]);
    s.stop();
    expect(s.out.said).toEqual([ORDER]);
  });

  it("a waiting line is never said once a Start has been pressed", () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.play();
    s.send({ type: "timedStart", now: 1 });
    s.send({ type: "next", now: 2 });
    soundStarting();
    s.stop();
    expect(s.out.said).toEqual([]);
  });

  it("turning Voice off stops our speech, and stops nothing it did not start", () => {
    const s = mount();
    cleanup = s.uninstall;
    setVoiceEnabled(false);
    expect(s.out.stops).toBe(0);
    setVoiceEnabled(true);
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    setVoiceEnabled(false);
    expect(s.out.stops).toBe(1);
  });

  it("a speech that ended is not stopped again", () => {
    const s = mount();
    cleanup = s.uninstall;
    s.send({ type: "start", plan: PLAN, now: 0 });
    s.send({ type: "next", now: 1 });
    return Promise.resolve().then(async () => {
      s.out.pending.forEach((resolve) => resolve());
      await Promise.resolve();
      await Promise.resolve();
      soundStarting();
      expect(s.out.stops).toBe(0);
    });
  });
});
