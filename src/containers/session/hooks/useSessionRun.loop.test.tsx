/**
 * `actions.startLoop(bars?)` (leg lb1): with no argument, the Session's own
 * offer exactly as before (nothing on a fresh ready screen, where no Take
 * named a place); with bars as printed, the loop the runner builds for them
 * (`loopAsked`), or the runner's reason and nothing moved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../../../test/mocks";
import { useSessionRun } from "./useSessionRun";
import type { SessionRunInput } from "./useSessionRun";
import { rungBelow } from "../../../session/ladder";
import { isLoopBars } from "../../../session/runner";
import type { LoopRefusal, RunState } from "../../../session/runner";
import type { Exercise } from "../../../paths/format";
import type { MainView } from "../../main-window/MainHeader";
import { installCoachVoice, resetCoachVoice } from "../../../coach/voice";
import { soundStarting } from "../../../soundGate";

/**
 * The Session's own offer, when a test asks for one: reaching a graded result
 * that names a spot takes a whole Take through the engine, and what is under
 * test here is only what `startLoop` does with an offer (lb1b M2).
 */
const offer = vi.hoisted(() => ({ bars: null as { fromBar: number; toBar: number } | null }));
vi.mock("../../../session/runner", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../session/runner")>();
  return {
    ...real,
    loopOffer: (state: RunState, exercise: Exercise | null, options?: { notYetTwice?: boolean }) => {
      if (!offer.bars) return real.loopOffer(state, exercise, options);
      const at = real.loopAt(state, exercise, offer.bars.fromBar, offer.bars.toBar);
      return "loop" in at ? { loop: at.loop, front: false } : null;
    },
  };
});

function mount() {
  setInvokeResponse("list_path_states", []);
  setInvokeResponse("list_path_takes", []);
  setInvokeResponse("list_exercise_ceilings", []);
  setInvokeResponse("plugin:store|get", () => [null, false]);
  const base = (): SessionRunInput => ({
    view: "session" as MainView,
    setView: vi.fn(),
    isPlaying: false,
    beat: null,
    state: DEFAULT_TEST_STATE,
    coach: {
      active: false,
      cardOpen: false,
      startSession: async () => {},
      endSession: async () => {},
      toggleCard: vi.fn(),
    },
    listening: false,
    startInput: vi.fn(async () => ({ device: "Scarlett 2i2 USB", fellBack: false })),
    stopInput: async () => {},
    jams: [],
  });
  return renderHook((p: SessionRunInput) => useSessionRun(p), { initialProps: base() });
}

async function readyOn(h: ReturnType<typeof mount>) {
  await waitFor(() => expect(h.result.current.paths.length).toBeGreaterThan(0));
  const path = h.result.current.paths.find((p) => p.id === "alternate-picking")!;
  const step = path.steps[0];
  act(() => h.result.current.actions.playExercise(path, step, step.exercises[0]));
  await waitFor(() => expect(h.result.current.run.phase).toBe("ready"));
  return step.exercises[0];
}

describe("useSessionRun — startLoop(bars?)", () => {
  beforeEach(() => mockInvoke.mockClear());
  afterEach(() => {
    offer.bars = null;
    resetCoachVoice();
  });

  it("with no argument it is today's: no offer on a fresh ready screen, nothing moves", async () => {
    const h = mount();
    await readyOn(h);
    expect(h.result.current.loop).toBeNull();
    const before = h.result.current.run;
    let out: LoopRefusal | null = null;
    act(() => {
      out = h.result.current.actions.startLoop();
    });
    expect(out).toBe("notHere");
    expect(h.result.current.run).toBe(before);
  });

  it("with no argument and an offer on screen, it loops the offer's own bars (lb1b M2)", async () => {
    offer.bars = { fromBar: 1, toBar: 1 };
    const h = mount();
    await readyOn(h);
    const offered = h.result.current.loop;
    expect(offered).not.toBeNull();
    let out: LoopRefusal | null = "notHere";
    act(() => {
      out = h.result.current.actions.startLoop();
    });
    expect(out).toBeNull();
    expect(h.result.current.run.phase).toBe("looping");
    expect(h.result.current.run.loop).toEqual(offered!.loop);
  });

  it("a click's event is not bars: the button's onClick loops the offer (lb1b M2)", async () => {
    offer.bars = { fromBar: 1, toBar: 1 };
    const h = mount();
    await readyOn(h);
    const offered = h.result.current.loop;
    expect(offered).not.toBeNull();
    // What React hands `onClick={startLoop}`: a synthetic mouse event (a key's Enter or Space fires `click` too).
    const click = { nativeEvent: new MouseEvent("click"), type: "click", target: null, currentTarget: null, detail: 1, clientX: 3, clientY: 4 };
    let out: LoopRefusal | null = "notHere";
    act(() => {
      out = h.result.current.actions.startLoop(click);
    });
    expect(out).toBeNull();
    expect(h.result.current.run.loop).toEqual(offered!.loop);
  });

  it("isLoopBars: bars are two numbers, and nothing an event carries is", () => {
    const cases: Array<[string, unknown, boolean]> = [
      ["a mouse event", { nativeEvent: new MouseEvent("click"), type: "click", detail: 1, clientX: 3, clientY: 4 }, false],
      ["a key event", { nativeEvent: new KeyboardEvent("keydown", { key: "Enter" }), type: "keydown", key: "Enter", code: "Enter" }, false],
      ["from / to", { from: 3, to: 4 }, false],
      ["a string bar", { fromBar: "3", toBar: 4 }, false],
      ["null", null, false],
      ["undefined", undefined, false],
      ["bars", { fromBar: 3, toBar: 4 }, true],
      // A number, so bars: refused later by `Number.isInteger`, never read as the offer.
      ["NaN", { fromBar: Number.NaN, toBar: 1 }, true],
    ];
    for (const [name, value, bars] of cases) expect(isLoopBars(value), name).toBe(bars);
  });

  it("no loop while sound is starting, by either door: the count-in is part of a Take (lb1b M1)", async () => {
    offer.bars = { fromBar: 1, toBar: 1 };
    const uninstall = installCoachVoice({ speak: () => Promise.resolve(), stop: () => Promise.resolve() });
    try {
      const h = mount();
      await readyOn(h);
      expect(h.result.current.loop).not.toBeNull();
      const before = h.result.current.run;
      // What `setPlaying(true)` does after its invoke: the runner is still `ready` until the engine reports.
      soundStarting();
      let bars: LoopRefusal | null = null;
      let button: LoopRefusal | null = null;
      act(() => {
        bars = h.result.current.actions.startLoop({ fromBar: 1, toBar: 1 });
        button = h.result.current.actions.startLoop();
      });
      expect(bars).toBe("notHere");
      expect(button).toBe("notHere");
      expect(h.result.current.run).toBe(before);
    } finally {
      uninstall();
    }
  });

  it("reads the run at the press, not the last render: a Session the reducer has left loops nothing (lb1b L4)", async () => {
    const h = mount();
    await readyOn(h);
    const startLoop = h.result.current.actions.startLoop;
    const ran = h.result.current.run;
    act(() => h.result.current.actions.slower());
    // Stable: the run moved, the door did not.
    expect(h.result.current.run).not.toBe(ran);
    expect(h.result.current.actions.startLoop).toBe(startLoop);
    let out: LoopRefusal | null = null;
    act(() => {
      // One handler, before React renders the cancel: the actions are this render's.
      const { actions } = h.result.current;
      actions.exit();
      out = actions.startLoop({ fromBar: 1, toBar: 1 });
    });
    expect(out).toBe("notHere");
    expect(h.result.current.run.phase).toBe("idle");
  });
  it("with bars it loops them, two rungs under, back to the same ready screen with the same tempo", async () => {
    const h = mount();
    const exercise = await readyOn(h);
    const bpm = h.result.current.run.bpm;
    let out: LoopRefusal | null = "notHere";
    act(() => {
      out = h.result.current.actions.startLoop({ fromBar: 1, toBar: 1 });
    });
    expect(out).toBeNull();
    expect(h.result.current.run.phase).toBe("looping");
    expect(h.result.current.run.loop).toMatchObject({ fromBar: 1, toBar: 1, minutes: 0, bpm: rungBelow(exercise, rungBelow(exercise, bpm)) });
    expect(h.result.current.run.takes).toBe(0);
    act(() => h.result.current.actions.endLoop());
    expect(h.result.current.run.phase).toBe("ready");
    expect(h.result.current.run.bpm).toBe(bpm);
    expect(h.result.current.run.outcomes).toEqual([]);
  });

  it("refuses with the runner's reason and moves nothing", async () => {
    const h = mount();
    await readyOn(h);
    const before = h.result.current.run;
    let out: LoopRefusal | null = null;
    act(() => {
      out = h.result.current.actions.startLoop({ fromBar: 2, toBar: 1 });
    });
    expect(out).toBe("backwards");
    act(() => {
      out = h.result.current.actions.startLoop({ fromBar: 999, toBar: 999 });
    });
    expect(out).toBe("outsideTune");
    expect(h.result.current.run).toBe(before);
  });
});
