/**
 * The race between Listen's queued end and a Session's Start (review of leg
 * c2a2, finding 3; pol2 item 9). A test only: the order `begin` reads.
 *
 * Listen on, the player leaves the tools (Listen's end is queued behind its
 * start) and presses Start at once. The last render still says the coach is
 * active; `isActive()` says what the calls already made will leave. `begin`
 * must read the second: an end queued is not a session to ride, so the
 * Session starts its own quiet one after it; a start queued (Listen just
 * pressed) is one, so the Session rides it and starts nothing.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_TEST_STATE, setInvokeResponse } from "../../../test/mocks";
import { useSessionRun } from "./useSessionRun";
import type { SessionRunInput } from "./useSessionRun";
import type { MainView } from "../../main-window/MainHeader";

function mount(coachAt: { active: boolean; isActive: boolean }) {
  setInvokeResponse("list_path_states", []);
  setInvokeResponse("list_path_takes", []);
  setInvokeResponse("list_exercise_ceilings", []);
  setInvokeResponse("plugin:store|get", () => [null, false]);
  const startSession = vi.fn(async (_options?: unknown) => {});
  const endSession = vi.fn(async () => {});
  const base = (): SessionRunInput => ({
    view: "paths" as MainView,
    setView: vi.fn(),
    isPlaying: false,
    beat: null,
    state: DEFAULT_TEST_STATE,
    coach: {
      // What the last render said.
      active: coachAt.active,
      // What the calls already made will leave.
      isActive: () => coachAt.isActive,
      startSession,
      endSession,
    },
    listening: true,
    startInput: vi.fn(async () => ({ device: "Scarlett 2i2 USB", fellBack: false })),
    stopInput: async () => {},
    jams: [],
  });
  const hook = renderHook((p: SessionRunInput) => useSessionRun(p), { initialProps: base() });
  return { hook, startSession, endSession };
}

async function play(hook: ReturnType<typeof mount>["hook"]) {
  await waitFor(() => expect(hook.result.current.paths.length).toBeGreaterThan(0));
  const path = hook.result.current.paths.find((p) => p.id === "alternate-picking")!;
  const step = path.steps[0];
  act(() => hook.result.current.actions.playExercise(path, step, step.exercises[0]));
}

describe("a Session's Start against Listen's queued end", () => {
  it("an end queued (the render still says active): the Session starts its own quiet coach session", async () => {
    const { hook, startSession } = mount({ active: true, isActive: false });
    await play(hook);
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(startSession.mock.calls[0][0]).toMatchObject({ quiet: true });
  });

  it("a start queued (the render still says not active): the Session rides it and starts nothing", async () => {
    const { hook, startSession, endSession } = mount({ active: false, isActive: true });
    await play(hook);
    expect(startSession).not.toHaveBeenCalled();
    expect(endSession).not.toHaveBeenCalled();
  });
});
