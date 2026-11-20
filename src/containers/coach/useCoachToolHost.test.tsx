/**
 * The real host: built once, read through a ref (so the window's per-beat
 * render rebuilds nothing), registered for whoever runs a tool, and wired to
 * the window's own doors for the `go` tools.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCoachToolHost, HOST_MEMBERS, STILL_NOT_WIRED, WIRED_IN_T1A1 } from "../../coach/tools/host";
import { confirmCoachTool, runCoachTool, runCoachUndo } from "../../coach/tools/run";
import type { Preset } from "../../types";
import { toolCtx } from "../../coach/tools/fakeHost";
import { TEST_PATHS } from "../../coach/tools/testPaths";
import type { Jam } from "../../jam/types";
import type { MainView } from "../main-window/MainHeader";
import type { PathsAt, PathsPlace } from "../main-window/hooks/usePathsPlace";
import type { SessionRun } from "../session/hooks/useSessionRun";
import { useCoachToolHost, type CoachToolHostInput } from "./useCoachToolHost";

/** What the Session's doors were called with, in order. */
const sessionCalls: Array<[string, unknown[]]> = [];
const recordAs = (name: string) => (...args: unknown[]) => {
  sessionCalls.push([name, args]);
  return null;
};

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
      practiceView: "neck",
      bandVolume: 1,
      previewPlan: (change: { minutes?: number }) => ({ minutes: change.minutes ?? 15, steps: [] }),
      setMinutes: recordAs("setMinutes"),
      setTodayFocus: recordAs("setTodayFocus"),
      setPracticeView: recordAs("setPracticeView"),
      setBandVolume: recordAs("setBandVolume"),
      actions: {
        startToday: recordAs("startToday"),
        startTodayAt: recordAs("startTodayAt"),
        playExercise: recordAs("playExercise"),
        testOut: recordAs("testOut"),
        startPath: recordAs("startPath"),
      },
    } as unknown as SessionRun,
    instrument: "electric-guitar",
    jams: [{ id: "j1", name: "Slow blues" } as Jam],
    loadJam: recordAs("loadJam"),
    isPlaying: false,
    tempo: 100,
    setTempo: recordAs("setTempo"),
    subdivision: 1,
    setSubdivision: recordAs("setSubdivision"),
    loadPreset: recordAs("loadPreset"),
    listPresets: () => Promise.resolve([{ id: "p1", name: "Warm up 80" } as Preset]),
    settings: {
      theme: "ember",
      setTheme: recordAs("setTheme"),
      countIn: false,
      toggleCountIn: recordAs("toggleCountIn"),
      coachVoice: "silent",
      setCoachVoice: recordAs("setCoachVoice"),
      voiceAvailable: false,
    },
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

  it("only the Notebook's goal and a loop of named bars are still stubs", () => {
    const { result } = renderHook(() => useCoachToolHost(input()));
    const host = result.current as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const member of STILL_NOT_WIRED) expect(host[member](), member).toBe("notWiredYet");
    expect(HOST_MEMBERS.filter((m) => !WIRED_IN_T1A1.includes(m) && !STILL_NOT_WIRED.includes(m)).length).toBeGreaterThan(20);
    expect(result.current.safeSetting("coachSuggestions")).toBe("notWiredYet");
    expect(result.current.jams()).toEqual([{ id: "j1", name: "Slow blues" }]);
  });

  it("says what sounds: nothing in a Session, the band on the jam, a song on Songs, else the click", () => {
    const cases: Array<[Partial<CoachToolHostInput>, string | null]> = [
      [{ isPlaying: false, view: "beat" }, null],
      [{ isPlaying: true, view: "beat" }, "click"],
      [{ isPlaying: true, view: "jam" }, "band"],
      [{ isPlaying: true, view: "songs" }, "song"],
      [{ isPlaying: true, view: "session" }, null],
    ];
    for (const [over, sounding] of cases) {
      const { result } = renderHook(() => useCoachToolHost(input(over)));
      expect(result.current.sounding(), JSON.stringify(over)).toBe(sounding);
    }
  });

  it("goes through the window's and the Session's own doors, only on the press", () => {
    sessionCalls.length = 0;
    const props = input();
    const { result } = renderHook(() => useCoachToolHost(props));
    const host = result.current;
    const out = runCoachTool({ tool: "set_minutes", args: { minutes: 20 } }, host, toolCtx());
    if (!out.ok || !("proposal" in out)) throw new Error("no proposal");
    expect(out.proposal.plan?.minutes).toBe(20);
    expect(sessionCalls).toEqual([]);
    confirmCoachTool(out.proposal, host, toolCtx());
    expect(host.startToday(null)).toBe("done");
    expect(host.startToday(2)).toBe("done");
    expect(host.loadJam("j1")).toBe("done");
    expect(host.setTempo(120)).toBe("done");
    expect(host.setClickSubdivision(3)).toBe("done");
    expect(host.followPath("legato", null)).toBe("done");
    expect(sessionCalls.map(([name, args]) => [name, name === "startPath" ? (args[0] as { id: string }).id : args])).toEqual([
      ["setMinutes", [20]],
      ["startToday", []],
      ["startTodayAt", [2]],
      ["loadJam", [{ id: "j1", name: "Slow blues" }]],
      ["setTempo", [120]],
      ["setSubdivision", [3]],
      ["startPath", "legato"],
    ]);
    expect(() => host.playExercise("nowhere", "x", null)).toThrow();
  });

  it("the safe settings: their values now, what each may be, and their own setters", () => {
    sessionCalls.length = 0;
    const { result } = renderHook(() => useCoachToolHost(input()));
    const host = result.current;
    expect(host.safeSetting("theme")).toBe("ember");
    expect(host.safeSetting("coachVoice")).toBe(false);
    expect(host.safeSetting("bandVolume")).toBe(1);
    const themes = host.safeSettingOptions("theme");
    expect(themes !== "notWiredYet" && themes.map((o) => o.value)).toContain("velvet");
    const languages = host.safeSettingOptions("language");
    expect(languages !== "notWiredYet" && languages.map((o) => o.value)).toContain("en");
    // No voice installed: Voice cannot be turned on, as in Settings.
    expect(host.safeSettingOptions("coachVoice")).toEqual([{ value: false, names: ["off"] }]);
    host.setSafeSetting("theme", "velvet");
    host.setSafeSetting("practiceView", "tab");
    host.setSafeSetting("bandVolume", 0.7);
    host.setSafeSetting("countIn", false);
    host.setSafeSetting("countIn", true);
    expect(sessionCalls).toEqual([
      ["setTheme", ["velvet"]],
      ["setPracticeView", ["tab"]],
      ["setBandVolume", [0.7]],
      ["toggleCountIn", []],
    ]);
  });

  it("reads the presets from the store, and loads one by its id", async () => {
    sessionCalls.length = 0;
    const { result } = renderHook(() => useCoachToolHost(input()));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.presets()).toEqual([{ id: "p1", name: "Warm up 80" }]);
    expect(result.current.loadPreset("p1")).toBe("done");
    expect(sessionCalls).toEqual([["loadPreset", [{ id: "p1", name: "Warm up 80" }]]]);
  });
});
