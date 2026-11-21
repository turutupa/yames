/**
 * The coach's three keys, in English as the player would read them: what each
 * says before any Take, after a Take that slipped and after a pass, and that
 * none of them does anything while a Take runs (DESIGN 3.4, 5.1).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import { noteFinding, resetCoachSlot } from "../../coach/coachSlot";
import type { TakeGrade } from "../../session/grade";
import type { PlanStep, Reason } from "../../session/planner";
import type { BigAction, RunState, TakeOutcome } from "../../session/runner";
import type { TakeMeasures } from "../../session/takeMeasures";
import { installCoachVoice, resetCoachVoice, setVoiceSounding } from "../../coach/voice";
import { soundStarting } from "../../soundGate";
import { acceptSuggestion, explainLastText, suggestionsOnScreen, whatNextText } from "./coachKeys";

const t = i18n.t.bind(i18n) as unknown as Parameters<typeof whatNextText>[0];

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
  why: { code: "newExercise", values: {} } as unknown as Reason,
};
const WARM_DOWN: PlanStep = {
  kind: "metronome",
  id: "warm",
  title: "Warm-up",
  bpm: 70,
  subdivision: 1,
  minutes: 1,
  why: { code: "warmUp", values: { bpm: 70 } } as unknown as Reason,
};

function outcome(verdict: TakeGrade["verdict"], extra: Partial<TakeOutcome> = {}): TakeOutcome {
  return {
    stepId: EXERCISE.id,
    exerciseId: "ex-1",
    title: "Two strings",
    bpm: 80,
    takeNumber: 1,
    measures: { caught: true } as TakeMeasures,
    grade: {
      verdict,
      checks: verdict === "belowBar" ? [{ metric: "timingEvenness", value: 0.79, met: false }] : [],
    } as unknown as TakeGrade,
    previousValue: null,
    cleanBefore: null,
    ...extra,
  };
}

function session(phase: RunState["phase"], outcomes: TakeOutcome[], big: BigAction, more: { loop?: boolean; eyes?: boolean } = {}) {
  const actions = { startLoop: vi.fn(), upTo: vi.fn(), eyesTake: vi.fn() };
  return {
    run: {
      phase,
      plan: { steps: [EXERCISE, WARM_DOWN] },
      stepIndex: 0,
      bpm: 80,
      takes: outcomes.length,
      outcomes,
    } as unknown as RunState,
    big,
    loop: more.loop ? ({ loop: {}, front: false } as never) : null,
    eyes: !!more.eyes,
    actions: actions as never,
    spies: actions,
  };
}

afterEach(() => resetCoachSlot());

describe("ask-explain-last", () => {
  it("before any Take, says there is nothing to go on", () => {
    expect(explainLastText(t, session("ready", [], { kind: "playTake", bpm: 80 }))).toBe(
      "No Take yet, so I have nothing to go on.",
    );
  });

  it("after a Take, says the finding the result note drew, word for word", () => {
    const slipped = outcome("belowBar");
    noteFinding(slipped, "The tune's first bar slipped on two rounds of three. Its notes landed late.", null);
    const s = session("result", [slipped], { kind: "again", bpm: 80 });
    expect(explainLastText(t, s)).toBe("The tune's first bar slipped on two rounds of three. Its notes landed late.");
    // From the ready screen after Slower, the same Take, the same sentence.
    expect(explainLastText(t, { run: { ...s.run, phase: "ready" } })).toBe(
      "The tune's first bar slipped on two rounds of three. Its notes landed late.",
    );
    const passed = outcome("passed", { bpm: 90 });
    noteFinding(passed, "Passed at 90. The first bar caught you once in three rounds.", null);
    expect(explainLastText(t, session("result", [slipped, passed], { kind: "again", bpm: 95, up: true }))).toBe(
      "Passed at 90. The first bar caught you once in three rounds.",
    );
  });

  it("never reads one Take's finding out for another", () => {
    noteFinding(outcome("belowBar"), "Not this one.", null);
    expect(explainLastText(t, session("result", [outcome("belowBar")], { kind: "again", bpm: 80 }))).toBe(
      "Last Take: 79% even.",
    );
  });

  it("an ungraded Take: nothing measured, nothing claimed", () => {
    const played = outcome("ungraded" as TakeGrade["verdict"], { ungraded: "chosen" });
    expect(explainLastText(t, session("result", [played], { kind: "again", bpm: 80 }))).toBe(
      "Your last Take wasn't graded, so I measured nothing in it.",
    );
  });
});

describe("ask-what-next", () => {
  it("before the first Take: the big button and the planner's reason", () => {
    expect(whatNextText(t, session("ready", [], { kind: "playTake", bpm: 80 }))).toBe(
      "Start take, 80 BPM. You haven't played this one yet, so it starts at its first tempo.",
    );
  });

  it("after a slipped Take: go again, because it didn't meet the pass mark", () => {
    expect(whatNextText(t, session("result", [outcome("belowBar")], { kind: "again", bpm: 80 }))).toBe(
      "Go again, 80 BPM. Because the last Take at 80 BPM didn't meet the pass mark.",
    );
    // P1: once more at this tempo, with the rule's own sentence.
    expect(
      whatNextText(t, session("result", [outcome("passed")], { kind: "again", bpm: 80, onceMore: { up: 85 } })),
    ).toBe("Go again, 80 BPM. Once more at 80 before 85, since that bar slipped last Take.");
    // Back on the ready screen after Slower, the Take before is the reason.
    expect(whatNextText(t, session("ready", [outcome("belowBar")], { kind: "playTake", bpm: 75 }))).toBe(
      "Start take, 75 BPM. Last Take: 79% even.",
    );
  });

  it("after a pass: up a rung, or on to the next block with its own reason", () => {
    expect(whatNextText(t, session("result", [outcome("passed")], { kind: "again", bpm: 85, up: true }))).toBe(
      "Go again, up to 85 BPM. Because you met the pass mark at 80 BPM. Next rung: 85.",
    );
    expect(whatNextText(t, session("result", [outcome("passed")], { kind: "next", step: WARM_DOWN }))).toMatch(
      /^Next: .+\. Just you and the click at 70 BPM, before anything counts\.$/,
    );
    expect(whatNextText(t, session("result", [outcome("passed")], { kind: "finish" }))).toBe("Finish the Session.");
  });
});

describe("accept-suggestion", () => {
  it("presses the one suggestion on screen", () => {
    const s = session("result", [outcome("passed")], { kind: "again", bpm: 80, onceMore: { up: 85 } });
    expect(suggestionsOnScreen(s).map((x) => x.id)).toEqual(["upTo"]);
    expect(acceptSuggestion(s)).toBe(true);
    expect(s.spies.upTo).toHaveBeenCalledTimes(1);
  });

  it("does nothing with none, or with two", () => {
    const none = session("result", [outcome("belowBar")], { kind: "again", bpm: 80 });
    expect(acceptSuggestion(none)).toBe(false);
    const two = session("result", [outcome("belowBar")], { kind: "again", bpm: 80 }, { loop: true, eyes: true });
    expect(acceptSuggestion(two)).toBe(false);
    expect(two.spies.startLoop).not.toHaveBeenCalled();
    expect(two.spies.eyesTake).not.toHaveBeenCalled();
  });

  it("the loop on a ready screen; nothing on a Take not caught", () => {
    const ready = session("ready", [outcome("belowBar")], { kind: "playTake", bpm: 80 }, { loop: true });
    expect(acceptSuggestion(ready)).toBe(true);
    expect(ready.spies.startLoop).toHaveBeenCalledTimes(1);
    const missed = session("result", [outcome("notCaught")], { kind: "again", bpm: 80 }, { loop: true });
    expect(acceptSuggestion(missed)).toBe(false);
  });
});

describe("while a Take runs", () => {
  it("all three do nothing: count-in, Take, listening, a loop, a warm-up", () => {
    for (const phase of ["playing", "listening", "looping", "timed", "timedReady", "recap", "idle"] as const) {
      const s = session(phase, [outcome("belowBar")], { kind: "endTake" }, { loop: true });
      expect(explainLastText(t, s), phase).toBeNull();
      expect(whatNextText(t, s), phase).toBeNull();
      expect(acceptSuggestion(s), phase).toBe(false);
      expect(s.spies.startLoop).not.toHaveBeenCalled();
    }
  });
});

describe("between a Start and the engine reporting sound", () => {
  it("all three do nothing on the ready screen, and the loop is not started over the count-in", () => {
    const uninstall = installCoachVoice({ speak: () => Promise.resolve(), stop: () => Promise.resolve() });
    try {
      const ready = session("ready", [outcome("belowBar")], { kind: "playTake", bpm: 80 }, { loop: true });
      // What ipc.setPlaying(true) does right after it asks the engine to play.
      soundStarting();
      expect(explainLastText(t, ready)).toBeNull();
      expect(whatNextText(t, ready)).toBeNull();
      expect(acceptSuggestion(ready)).toBe(false);
      expect(ready.spies.startLoop).not.toHaveBeenCalled();
      // The engine reports sound and then stops: the keys answer again.
      setVoiceSounding(true);
      setVoiceSounding(false);
      expect(whatNextText(t, ready)).not.toBeNull();
      expect(acceptSuggestion(ready)).toBe(true);
      expect(ready.spies.startLoop).toHaveBeenCalledTimes(1);
    } finally {
      uninstall();
      resetCoachVoice();
    }
  });
});
