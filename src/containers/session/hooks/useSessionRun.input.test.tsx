/**
 * The Take's Start with the input off (owner, beta 6: "I hit start take but
 * nothing happens"). The Session turns the input on by itself, a press of
 * Start waits for it and then starts the Take, and a refusal is said.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../../../test/mocks";
import { useSessionRun } from "./useSessionRun";
import type { SessionRunInput } from "./useSessionRun";

type Started = { device: string | null; fellBack: boolean };

function deferred() {
  let resolve!: (v: Started) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Started>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mount(startInput: () => Promise<Started>) {
  setInvokeResponse("list_path_states", []);
  setInvokeResponse("list_path_takes", []);
  setInvokeResponse("list_exercise_ceilings", []);
  setInvokeResponse("plugin:store|get", () => [null, false]);
  let listening = false;
  const base = (): SessionRunInput => ({
    view: "session",
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
    listening,
    startInput,
    stopInput: async () => {},
    jams: [],
  });
  const hook = renderHook((props: SessionRunInput) => useSessionRun(props), { initialProps: base() });
  return {
    ...hook,
    setListening(on: boolean) {
      listening = on;
      hook.rerender({ ...base(), view: "session" });
    },
    toSession() {
      hook.rerender({ ...base(), view: "session" });
    },
  };
}

/** One Exercise, straight onto its ready screen, the way Play this does it. */
async function playOne(h: ReturnType<typeof mount>) {
  await waitFor(() => expect(h.result.current.paths.length).toBeGreaterThan(0));
  const path = h.result.current.paths.find((p) => p.id === "alternate-picking")!;
  const step = path.steps[0];
  act(() => h.result.current.actions.playExercise(path, step, step.exercises[0]));
  h.toSession();
  await waitFor(() => expect(h.result.current.run.phase).toBe("ready"));
}

const playingCalls = () =>
  mockInvoke.mock.calls.filter(([cmd, a]) => cmd === "set_playing" && (a as { playing: boolean }).playing);

describe("useSessionRun — the input at a Take's ready screen", () => {
  it("turns the input on by itself, and Start then starts the Take once it is on", async () => {
    mockInvoke.mockClear();
    const ask = deferred();
    const startInput = vi.fn(() => ask.promise);
    const h = mount(startInput);
    await playOne(h);
    await waitFor(() => expect(startInput).toHaveBeenCalledTimes(1));
    expect(h.result.current.inputStart.status).toBe("starting");
    await waitFor(() => expect(h.result.current.prepared).toBe(true));

    // Start pressed while it comes on: nothing plays yet, and nothing is asked twice.
    act(() => h.result.current.actions.go());
    expect(startInput).toHaveBeenCalledTimes(1);
    expect(playingCalls()).toHaveLength(0);

    await act(async () => ask.resolve({ device: "Scarlett 2i2 USB", fellBack: false }));
    h.setListening(true);
    await waitFor(() => expect(playingCalls()).toHaveLength(1));
    expect(h.result.current.inputStart.device).toBe("Scarlett 2i2 USB");
  });

  it("a refusal is said, and no Take starts", async () => {
    mockInvoke.mockClear();
    const startInput = vi.fn(() => Promise.reject(new Error("No default input device found")));
    const h = mount(startInput);
    await playOne(h);
    await waitFor(() => expect(h.result.current.inputStart.status).toBe("failed"));
    expect(h.result.current.inputStart.failure).toBe("noDevice");
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    // The press asks again (it is not a dead button), and is refused again.
    act(() => h.result.current.actions.go());
    await waitFor(() => expect(startInput).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(h.result.current.inputStart.status).toBe("failed"));
    expect(playingCalls()).toHaveLength(0);
  });

  it("refused once, it does not ask again by itself on the next screen", async () => {
    const startInput = vi.fn(() => Promise.reject(new Error("permission denied")));
    const h = mount(startInput);
    await playOne(h);
    await waitFor(() => expect(h.result.current.inputStart.failure).toBe("permission"));
    h.toSession();
    expect(startInput).toHaveBeenCalledTimes(1);
  });

  it("Play without grading starts the Take with the input off, and asks for nothing", async () => {
    mockInvoke.mockClear();
    const startInput = vi.fn(() => Promise.reject(new Error("permission denied")));
    const h = mount(startInput);
    await playOne(h);
    await waitFor(() => expect(h.result.current.inputStart.status).toBe("failed"));
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    act(() => h.result.current.actions.playUngraded());
    await waitFor(() => expect(playingCalls()).toHaveLength(1));
    expect(h.result.current.run.ungraded).toBe("inputOff");
    expect(h.result.current.inputStart.status).toBe("idle");
    expect(startInput).toHaveBeenCalledTimes(1);
  });
});
