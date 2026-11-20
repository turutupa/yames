/**
 * `previewToday`: the tour's look at a Session's ready screen (card #50).
 * Nothing is played, saved or listened to, the neck is shown, and walking
 * away (the tour moving on) ends it like any Session walked away from.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../../../test/mocks";
import type { MainView } from "../../main-window/MainHeader";
import { useSessionRun } from "./useSessionRun";
import { startButton } from "../parts";
import i18n from "../../../i18n";

function mount() {
  setInvokeResponse("list_path_states", [{ pathId: "alternate-picking", startedAt: 1, updatedAt: 1 }]);
  setInvokeResponse("list_path_takes", []);
  setInvokeResponse("list_exercise_ceilings", []);
  const startSession = vi.fn(async () => {});
  const startInput = vi.fn(async () => ({ device: "mic", fellBack: false }));
  let view: MainView = "today";
  const setView = vi.fn((v: MainView) => {
    view = v;
  });
  const hook = renderHook(() =>
    useSessionRun({
      view,
      setView,
      isPlaying: false,
      beat: null,
      state: DEFAULT_TEST_STATE,
      coach: { active: false, cardOpen: false, startSession, endSession: async () => {}, toggleCard: vi.fn() },
      listening: false,
      startInput,
      jams: [],
      preload: true,
    }),
  );
  return {
    ...hook,
    startSession,
    startInput,
    setView,
    go: (v: MainView) => {
      view = v;
      hook.rerender();
    },
  };
}

describe("useSessionRun — the tour's preview", () => {
  it("opens a graded Take's ready screen on the neck, starting nothing", async () => {
    const h = mount();
    await waitFor(() => expect(h.result.current.plan.steps.length).toBeGreaterThan(0));
    act(() => h.result.current.setPracticeView("tab"));
    expect(h.result.current.practiceView).toBe("tab");
    mockInvoke.mockClear();
    act(() => h.result.current.actions.previewToday());
    h.go("session");
    expect(h.setView).toHaveBeenCalledWith("session");
    expect(h.result.current.run.phase).toBe("ready");
    expect(h.result.current.preview).toBe(true);
    expect(h.result.current.practiceView).toBe("neck");
    await new Promise((r) => setTimeout(r, 20));
    expect(h.startSession).not.toHaveBeenCalled();
    expect(h.startInput).not.toHaveBeenCalled();
    expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === "save_path_state")).toHaveLength(0);
    // The calm ready screen: the ordinary Start, nothing to go back to.
    const start = startButton(h.result.current, false, i18n.t.bind(i18n));
    expect(start.needsInput).toBe(false);
    expect(start.label).toMatch(/^Start take, \d+ BPM$/);
    expect(h.result.current.canGoBack).toBe(false);
    // The player's own view is not overwritten by the look.
    expect(
      mockInvoke.mock.calls.some(
        ([cmd, a]) => cmd === "plugin:store|set" && (a as { key?: string })?.key === "practiceView",
      ),
    ).toBe(false);
  });

  it("ends when the tour walks away, and the next real Session is a real one", async () => {
    const h = mount();
    await waitFor(() => expect(h.result.current.plan.steps.length).toBeGreaterThan(0));
    act(() => h.result.current.actions.previewToday());
    h.go("session");
    h.go("progress");
    await waitFor(() => expect(h.result.current.run.phase).toBe("idle"));
    expect(h.result.current.preview).toBe(false);
    act(() => h.result.current.actions.startToday());
    h.go("session");
    expect(h.result.current.preview).toBe(false);
    await waitFor(() => expect(h.startSession).toHaveBeenCalled());
  });
});

describe("useSessionRun and Ask (review of leg c2a1)", () => {
  it("a Session's teardown leaves Ask as it is: the recap offers it, and Ask's own rules close it", async () => {
    setInvokeResponse("list_path_states", [{ pathId: "alternate-picking", startedAt: 1, updatedAt: 1 }]);
    setInvokeResponse("list_path_takes", []);
    setInvokeResponse("list_exercise_ceilings", []);
    let view: MainView = "today";
    // Ask opened during the Session (on a result, say): the old card's rule
    // closed "the card it opened" here, which closed Ask on the way to the recap.
    let cardOpen = false;
    const toggleCard = vi.fn();
    const hook = renderHook(() =>
      useSessionRun({
        view,
        setView: (v: MainView) => {
          view = v;
        },
        isPlaying: false,
        beat: null,
        state: DEFAULT_TEST_STATE,
        coach: { active: false, cardOpen, startSession: async () => {}, endSession: async () => {}, toggleCard },
        listening: false,
        startInput: async () => ({ device: "mic", fellBack: false }),
        jams: [],
        preload: true,
      }),
    );
    await waitFor(() => expect(hook.result.current.plan.steps.length).toBeGreaterThan(0));
    act(() => hook.result.current.actions.previewToday());
    view = "session";
    hook.rerender();
    cardOpen = true;
    hook.rerender();
    view = "progress";
    hook.rerender();
    await waitFor(() => expect(hook.result.current.run.phase).toBe("idle"));
    expect(toggleCard).not.toHaveBeenCalled();
  });
});
