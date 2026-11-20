/**
 * The real host: built once, read through a ref (so the window's per-beat
 * render rebuilds nothing), registered for whoever runs a tool, and wired to
 * the window's own doors for the `go` tools.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCoachToolHost, HOST_MEMBERS, WIRED_IN_T1A1 } from "../../coach/tools/host";
import { runCoachTool, runCoachUndo } from "../../coach/tools/run";
import { toolCtx } from "../../coach/tools/fakeHost";
import { TEST_PATHS } from "../../coach/tools/testPaths";
import type { Jam } from "../../jam/types";
import type { MainView } from "../main-window/MainHeader";
import type { PathsAt, PathsPlace } from "../main-window/hooks/usePathsPlace";
import type { SessionRun } from "../session/hooks/useSessionRun";
import { useCoachToolHost, type CoachToolHostInput } from "./useCoachToolHost";

function input(over: Partial<CoachToolHostInput> = {}): CoachToolHostInput & { moves: PathsAt[]; views: MainView[] } {
  const moves: PathsAt[] = [];
  const views: MainView[] = [];
  const pathsPlace: PathsPlace = {
    at: { pathId: null, stepId: null },
    move: (at) => moves.push(at),
    back: () => false,
    reset: () => {},
  };
  return {
    view: "today",
    setView: (v) => views.push(v),
    pathsPlace,
    session: {
      paths: TEST_PATHS,
      run: { phase: "idle" },
      plan: null,
      minutes: 15,
      todayFocus: "mix",
      progress: { states: [], takes: [], ceilings: [] },
    } as unknown as SessionRun,
    instrument: "electric-guitar",
    jams: [{ id: "j1", name: "Slow blues" } as Jam],
    loadJam: () => {},
    moves,
    views,
    ...over,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useCoachToolHost", () => {
  it("is built once: the same object through a run of beats, reading the latest values", () => {
    const first = input();
    const { result, rerender } = renderHook((props: CoachToolHostInput) => useCoachToolHost(props), { initialProps: first });
    const host = result.current;
    // The window re-renders on every beat with fresh objects for everything.
    for (let beat = 0; beat < 8; beat += 1) rerender(input({ view: beat % 2 ? "beat" : "drill" }));
    expect(result.current).toBe(host);
    rerender(input({ view: "progress", instrument: "bass" }));
    expect(host.view()).toBe("progress");
    expect(host.instrument()).toBe("bass");
  });

  it("is registered while mounted, and gone after", () => {
    const { result, unmount } = renderHook(() => useCoachToolHost(input()));
    expect(getCoachToolHost()).toBe(result.current);
    unmount();
    expect(getCoachToolHost()).toBeNull();
  });

  it("opens a Path through the window's own doors, and the undo comes back", () => {
    const props = input();
    const { result } = renderHook(() => useCoachToolHost(props));
    const out = runCoachTool({ tool: "open_path", args: { path: "ligado" } }, result.current, toolCtx());
    expect(out.ok).toBe(true);
    expect(props.moves).toEqual([{ pathId: "legato", stepId: null }]);
    expect(props.views).toEqual(["paths"]);
    if (!out.ok || "proposal" in out) return;
    runCoachUndo(out.undo, result.current, toolCtx());
    expect(props.views).toEqual(["paths", "today"]);
  });

  it("opens Settings and scrolls the section into view", () => {
    vi.useFakeTimers();
    const section = document.createElement("section");
    section.id = "settings-grading";
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);
    const props = input();
    const { result } = renderHook(() => useCoachToolHost(props));
    runCoachTool({ tool: "open_settings", args: { section: "grading" } }, result.current, toolCtx());
    expect(props.views).toEqual(["settings"]);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(section.scrollIntoView).toHaveBeenCalledTimes(3);
    section.remove();
  });

  it("a Session open refuses the screen-changing tools, from the host's own reading", () => {
    const props = input({ view: "settings", session: { ...input().session, run: { phase: "ready" } } as unknown as SessionRun });
    const { result } = renderHook(() => useCoachToolHost(props));
    expect(result.current.sessionActive()).toBe(true);
    expect(runCoachTool({ tool: "go_to", args: { screen: "today" } }, result.current, toolCtx()).ok).toBe(false);
    expect(props.views).toEqual([]);
  });

  it("every member t1a1 does not wire answers notWiredYet when it acts", () => {
    const { result } = renderHook(() => useCoachToolHost(input()));
    const host = result.current as unknown as Record<string, (...args: unknown[]) => unknown>;
    const ACTIONS = ["startToday", "playExercise", "setTempo", "nudgeTempo", "findEdge", "testOut", "confirmSwap", "undoSwap", "setMinutes", "setTodayFocus", "followPath", "loadJam", "loadPreset", "setClickSubdivision", "setSafeSetting", "setGoal", "loopBars", "previewPlan", "swapOptions", "tempo", "presets", "clickSubdivision", "safeSetting", "goal"];
    for (const member of HOST_MEMBERS) {
      if (WIRED_IN_T1A1.includes(member)) continue;
      expect(ACTIONS, member).toContain(member);
      expect(host[member](), member).toBe("notWiredYet");
    }
    expect(result.current.jams()).toEqual([{ id: "j1", name: "Slow blues" }]);
  });
});
