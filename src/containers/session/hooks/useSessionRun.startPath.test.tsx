/**
 * `startPath`: the first-run wizard's "Where do you start?" write, and
 * `preload`, which loads the Paths while the wizard is open over a tool.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../../../test/mocks";
import type { PathStateRow } from "../../../ipc";
import { useSessionRun } from "./useSessionRun";

function mount(states: PathStateRow[] = [], unsubscribed: string[] = [], takes: unknown = []) {
  setInvokeResponse("list_path_states", states);
  setInvokeResponse("list_path_takes", takes);
  setInvokeResponse("list_exercise_ceilings", []);
  setInvokeResponse("plugin:store|get", (args?: Record<string, unknown>) =>
    args?.key === "session.unsubscribed" ? [unsubscribed, true] : [null, false],
  );
  return renderHook(() =>
    useSessionRun({
      view: "beat",
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
      jams: [],
      preload: true,
    }),
  );
}

const saved = () =>
  mockInvoke.mock.calls.filter(([cmd]) => cmd === "save_path_state").map(([, a]) => (a as { state: PathStateRow }).state);

describe("useSessionRun — startPath", () => {
  it("loads the Paths off the learning side while asked to (the wizard over a tool)", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.paths.length).toBeGreaterThan(0));
  });

  it("subscribes and sets the Level in one row, at the Level's first Step", async () => {
    mockInvoke.mockClear();
    const { result } = mount();
    await waitFor(() => expect(result.current.paths.length).toBeGreaterThan(0));
    const blues = result.current.paths.find((p) => p.id === "blues-pentatonics")!;
    act(() => {
      expect(result.current.actions.startPath(blues, "intermediate")).toBeNull();
    });
    const rows = saved();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pathId: "blues-pentatonics", level: "intermediate", currentStepId: "blues-scale" });
    expect(result.current.myPaths.map((p) => p.id)).toEqual(["blues-pentatonics"]);
    expect(result.current.plan.steps.length).toBeGreaterThan(0);
  });

  it("is refused at the cap, as subscribe is, and writes nothing", async () => {
    const ids = ["shred", "alternate-picking", "sweep-picking", "classic-rock"];
    const { result } = mount(ids.map((pathId) => ({ pathId, startedAt: 1, updatedAt: 1 })));
    await waitFor(() => expect(result.current.progress.states).toHaveLength(4));
    await waitFor(() => expect(result.current.paths.length).toBeGreaterThan(0));
    mockInvoke.mockClear();
    const blues = result.current.paths.find((p) => p.id === "blues-pentatonics")!;
    act(() => {
      expect(result.current.actions.startPath(blues, "beginner")).toBe("cap");
    });
    expect(saved()).toHaveLength(0);
  });
});

describe("useSessionRun — takesKnown (rem2c)", () => {
  it("is false until the Takes read answers, then true", async () => {
    const { result } = mount();
    expect(result.current.takesKnown).toBe(false);
    await waitFor(() => expect(result.current.takesKnown).toBe(true));
  });

  it("stays false when the Takes read fails, though the Takes read as []", async () => {
    let asked = 0;
    const { result } = mount([], [], () => {
      asked += 1;
      throw new Error("practice store unreadable");
    });
    await waitFor(() => expect(asked).toBe(1));
    await waitFor(() => expect(result.current.paths.length).toBeGreaterThan(0));
    await act(async () => {});
    expect(result.current.progress.takes).toEqual([]);
    expect(result.current.takesKnown).toBe(false);
  });
});
