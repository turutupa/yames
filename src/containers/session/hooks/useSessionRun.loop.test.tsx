/**
 * `actions.startLoop(bars?)` (leg lb1): with no argument, the Session's own
 * offer exactly as before (nothing on a fresh ready screen, where no Take
 * named a place); with bars as printed, the loop the runner builds for them
 * (`loopAsked`), or the runner's reason and nothing moved.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../../../test/mocks";
import { useSessionRun } from "./useSessionRun";
import type { SessionRunInput } from "./useSessionRun";
import { rungBelow } from "../../../session/ladder";
import type { LoopRefusal } from "../../../session/runner";
import type { MainView } from "../../main-window/MainHeader";

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

  it("a click's event is not bars: the button's onClick behaves as no argument", async () => {
    const h = mount();
    await readyOn(h);
    const before = h.result.current.run;
    act(() => {
      h.result.current.actions.startLoop({ nativeEvent: {} });
    });
    expect(h.result.current.run).toBe(before);
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
