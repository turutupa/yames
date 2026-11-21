/**
 * The real host: built once, read through a ref (so the window's per-beat
 * render rebuilds nothing), registered for whoever runs a tool, and wired to
 * the window's own doors for the `go` tools.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCoachToolHost, HOST_MEMBERS, STILL_NOT_WIRED, WIRED_IN_T1A1 } from "../../coach/tools/host";
import { confirmCoachTool, runCoachTool, runCoachUndo } from "../../coach/tools/run";
import type { Proposal, RunOutcome } from "../../coach/tools/types";
import { coachStored, coachStoredLoaded, loadCoachStored, resetCoachStored } from "../../coach/store";
import type { Preset } from "../../types";
import { toolCtx } from "../../coach/tools/fakeHost";
import { TEST_PATHS } from "../../coach/tools/testPaths";
import type { Jam } from "../../jam/types";
import { bandVolumeFor } from "../../session/takeBand";
import { rungBelow } from "../../session/ladder";
import { planSession } from "../../session/planner";
import { IDLE, runReducer } from "../../session/runner";
import { ALT, NOW, missed, progress } from "../../session/testKit";
import type { MainView } from "../main-window/MainHeader";
import type { PathsAt, PathsPlace } from "../main-window/hooks/usePathsPlace";
import type { SessionRun } from "../session/hooks/useSessionRun";
import { useCoachToolHost, type CoachToolHostInput } from "./useCoachToolHost";

/**
 * The settings store, in memory, with a hand on the read: while `hold` is set a
 * `storeLoad` waits for `release()`, so the pre-load case is always seen (c4a1b, L6).
 */
const store = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  hold: false,
  waiting: [] as Array<() => void>,
  failRead: null as string | null,
}));
vi.mock("../../ipc", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../ipc")>();
  return {
    ...real,
    storeLoad: vi.fn((key: string) => {
      const read = () => (key === store.failRead ? Promise.reject(new Error("unreadable")) : Promise.resolve(store.disk.get(key)));
      if (!store.hold) return read();
      return new Promise((resolve, reject) => store.waiting.push(() => read().then(resolve, reject)));
    }),
    storeSave: vi.fn(async (key: string, value: unknown) => {
      store.disk.set(key, value);
    }),
  };
});
const releaseReads = () => {
  store.hold = false;
  for (const go of store.waiting.splice(0)) go();
};

/** What the Session's doors were called with, in order. */
const sessionCalls: Array<[string, unknown[]]> = [];
const recordAs = (name: string) => (...args: unknown[]) => {
  sessionCalls.push([name, args]);
  return "done" as const;
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
      bandChoice: 1,
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
  resetCoachStored();
  releaseReads();
  store.disk.clear();
  store.failRead = null;
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

  it("the loop of named bars reads the Session's run through the runner, and the press is startLoop(bars) (leg lb1)", () => {
    const EX = ALT.steps[0].exercises[0];
    const plan = planSession({ minutes: 15, now: NOW, paths: [ALT], progress: progress({ takes: [missed(EX.id, 60, 0.8)] }) });
    const ready = [{ type: "start", plan, now: NOW }, { type: "next", now: NOW }].reduce(
      (s, e) => runReducer(s, e as Parameters<typeof runReducer>[1]),
      IDLE,
    );
    const base = input().session;
    const props = input({
      view: "session",
      session: { ...base, run: ready, exercise: EX, actions: { ...base.actions, startLoop: (bars: unknown) => (sessionCalls.push(["startLoop", [bars]]), null) } } as unknown as SessionRun,
    });
    const { result } = renderHook(() => useCoachToolHost(props));
    sessionCalls.length = 0;
    const at = ready.plan!.steps[ready.stepIndex] as { id: string; variantSeed?: number | null };
    expect(result.current.loopAsk(1, 1)).toEqual({
      fromBar: 1,
      toBar: 1,
      bpm: rungBelow(EX, rungBelow(EX, ready.bpm)),
      loopId: `${at.id}#loop`,
      variantSeed: at.variantSeed ?? null,
    });
    expect(result.current.loopAsk(2, 1)).toEqual({ refused: "backwards" });
    expect(sessionCalls).toEqual([]);
    expect(result.current.loopBars(1, 1)).toBe("done");
    expect(sessionCalls).toEqual([["startLoop", [{ fromBar: 1, toBar: 1 }]]]);
    // A loop the Session did not start is not "done": the receipt is never "Looping…" then (lb1b L4).
    const refusing = input({
      view: "session",
      session: { ...base, run: ready, exercise: EX, actions: { ...base.actions, startLoop: () => "notHere" } } as unknown as SessionRun,
    });
    const { result: noLoop } = renderHook(() => useCoachToolHost(refusing));
    expect(noLoop.current.loopBars(1, 1)).toBe("notHere");
    const idle = input();
    const { result: away } = renderHook(() => useCoachToolHost(idle));
    expect(away.current.loopAsk(1, 1)).toEqual({ refused: "notHere" });
  });

  it("no member is a stub any more (c4a1's goal, lb1's loop of bars)", () => {
    const { result } = renderHook(() => useCoachToolHost(input()));
    const host = result.current as unknown as Record<string, (...args: unknown[]) => unknown>;
    expect(STILL_NOT_WIRED).toEqual([]);
    for (const member of STILL_NOT_WIRED) expect(host[member](), member).toBe("notWiredYet");
    expect(HOST_MEMBERS.filter((m) => !WIRED_IN_T1A1.includes(m) && !STILL_NOT_WIRED.includes(m)).length).toBeGreaterThan(20);
    expect(result.current.jams()).toEqual([{ id: "j1", name: "Slow blues" }]);
  });

  it("the goal and Suggestions wait for the coach's keys to be read, then read and write them (c4a1)", async () => {
    store.hold = true;
    const { result } = renderHook(() => useCoachToolHost(input()));
    const host = result.current;
    // Read on mount; a proposal before that would be over a goal nobody has seen.
    expect(coachStoredLoaded()).toBe(false);
    expect(host.goal()).toBe("notWiredYet");
    expect(host.safeSetting("coachSuggestions")).toBe("notWiredYet");
    expect(runCoachTool({ tool: "set_goal", args: { text: "Play the solo at 120" } }, host, toolCtx())).toMatchObject({ why: "notWiredYet" });
    await act(async () => {
      releaseReads();
      await loadCoachStored();
    });
    // A player who never chose: no goal, Suggestions on.
    expect(host.goal()).toBeNull();
    expect(host.safeSetting("coachSuggestions")).toBe(true);

    const proposalOf = (out: RunOutcome): Proposal => {
      if (!out.ok || !("proposal" in out)) throw new Error(`no proposal: ${JSON.stringify(out)}`);
      return out.proposal;
    };
    const off = proposalOf(runCoachTool({ tool: "set_setting", args: { key: "coachSuggestions", value: "off" } }, host, toolCtx()));
    expect(off.line).toEqual({ key: "coachTools.propose.setSetting", values: { key: "coachSuggestions", from: "on", to: "off" } });
    expect(coachStored().suggestions).toBe("on");
    const kept = confirmCoachTool(off, host, toolCtx());
    if (!kept.ok || !kept.undo) throw new Error("not kept");
    expect(coachStored().suggestions).toBe("asked");
    expect(host.safeSetting("coachSuggestions")).toBe(false);
    expect(runCoachUndo(kept.undo, host, toolCtx()).ok).toBe(true);
    expect(coachStored().suggestions).toBe("on");

    const goal = proposalOf(runCoachTool({ tool: "set_goal", args: { text: "Play the solo at 120" } }, host, toolCtx()));
    expect(goal.line.key).toBe("coachTools.propose.setGoal");
    expect(coachStored().goal).toBeNull();
    const set = confirmCoachTool(goal, host, toolCtx());
    expect(set).toMatchObject({ ok: true, receipt: { key: "coachTools.receipt.setGoal" } });
    expect(coachStored().goal?.text).toBe("Play the solo at 120");
    expect(host.goal()).toBe("Play the solo at 120");
    // No goal before: no undo (clearing a goal is the player's own).
    expect(set.ok && "undo" in set ? set.undo : undefined).toBeUndefined();
    // A second goal: its undo puts the first back, in the store.
    const firstAt = coachStored().goal?.at;
    expect(typeof firstAt).toBe("number");
    // The clock moves on, so the undo's own moment is not the first goal's (c4a1c, F7: this can fail).
    const later = vi.spyOn(Date, "now").mockReturnValue((firstAt as number) + 60_000);
    try {
      const second = confirmCoachTool(proposalOf(runCoachTool({ tool: "set_goal", args: { text: "Join a band" } }, host, toolCtx())), host, toolCtx());
      if (!second.ok || !second.undo) throw new Error("no undo");
      expect(coachStored().goal).toEqual({ text: "Join a band", at: (firstAt as number) + 60_000 });
      later.mockReturnValue((firstAt as number) + 120_000);
      expect(runCoachUndo(second.undo, host, toolCtx()).ok).toBe(true);
      expect(coachStored().goal?.text).toBe("Play the solo at 120");
      // With its own date, not the undo's (c4a1b, L4).
      expect(store.disk.get("coach.goal")).toEqual({ text: "Play the solo at 120", at: firstAt });
    } finally {
      later.mockRestore();
    }
  });

  // c4a1c, F2 and F7: two receipts' Undos, newest first, each through set_goal's own undo.
  it("undo, undo: each goal comes back with the date it was set", async () => {
    const host = renderHook(() => useCoachToolHost(input())).result.current;
    await act(async () => {
      await loadCoachStored();
    });
    const t0 = Date.UTC(2026, 9, 1);
    const clock = vi.spyOn(Date, "now");
    try {
      const setGoal = (text: string, at: number) => {
        clock.mockReturnValue(at);
        const run = runCoachTool({ tool: "set_goal", args: { text } }, host, toolCtx());
        if (!run.ok || !("proposal" in run)) throw new Error(`no proposal: ${JSON.stringify(run)}`);
        return confirmCoachTool(run.proposal, host, toolCtx());
      };
      setGoal("A", t0 + 1);
      const b = setGoal("B", t0 + 2);
      const c = setGoal("C", t0 + 3);
      if (!b.ok || !b.undo || !c.ok || !c.undo) throw new Error("no undo");
      clock.mockReturnValue(t0 + 10);
      expect(runCoachUndo(c.undo, host, toolCtx()).ok).toBe(true);
      expect(store.disk.get("coach.goal")).toEqual({ text: "B", at: t0 + 2 });
      clock.mockReturnValue(t0 + 20);
      expect(runCoachUndo(b.undo, host, toolCtx()).ok).toBe(true);
      expect(store.disk.get("coach.goal")).toEqual({ text: "A", at: t0 + 1 });
      expect(coachStored().goal).toEqual({ text: "A", at: t0 + 1 });
    } finally {
      clock.mockRestore();
    }
  });

  // c4a2b, L3: only an Undo restores an old date; the same words typed again are dated today.
  it("a goal typed again (not an Undo) is dated the day it was typed", async () => {
    const host = renderHook(() => useCoachToolHost(input())).result.current;
    await act(async () => {
      await loadCoachStored();
    });
    const t0 = Date.UTC(2026, 10, 3);
    const clock = vi.spyOn(Date, "now");
    try {
      const setGoal = (text: string, at: number) => {
        clock.mockReturnValue(at);
        const run = runCoachTool({ tool: "set_goal", args: { text } }, host, toolCtx());
        if (!run.ok || !("proposal" in run)) throw new Error(`no proposal: ${JSON.stringify(run)}`);
        return confirmCoachTool(run.proposal, host, toolCtx());
      };
      setGoal("Blues in A", t0);
      setGoal("Sweep at 90", t0 + 17 * 86_400_000);
      setGoal("Blues in A", t0 + 17 * 86_400_000 + 60_000);
      expect(store.disk.get("coach.goal")).toEqual({ text: "Blues in A", at: t0 + 17 * 86_400_000 + 60_000 });
      expect(coachStored().goal?.at).toBe(t0 + 17 * 86_400_000 + 60_000);
    } finally {
      clock.mockRestore();
    }
  });

  it("the undo of a second goal puts the first back with the date it was set (c4a1b, L4)", async () => {
    const setAt = Date.UTC(2026, 9, 1);
    store.disk.set("coach.goal", { text: "Play the solo at 120", at: setAt });
    const { result } = renderHook(() => useCoachToolHost(input()));
    const host = result.current;
    await act(async () => {
      await loadCoachStored();
    });
    const run = runCoachTool({ tool: "set_goal", args: { text: "Join a band" } }, host, toolCtx());
    if (!run.ok || !("proposal" in run)) throw new Error("no proposal");
    const kept = confirmCoachTool(run.proposal, host, toolCtx());
    if (!kept.ok || !kept.undo) throw new Error("no undo");
    expect(runCoachUndo(kept.undo, host, toolCtx()).ok).toBe(true);
    expect(coachStored().goal).toEqual({ text: "Play the solo at 120", at: setAt });
    expect(store.disk.get("coach.goal")).toEqual({ text: "Play the solo at 120", at: setAt });
  });

  it("a goal whose read failed is unknown: set_goal says not yet and nothing is written (c4a1b, L5)", async () => {
    store.disk.set("coach.goal", { text: "Play the solo at 120", at: 1 });
    store.failRead = "coach.goal";
    const { result } = renderHook(() => useCoachToolHost(input()));
    const host = result.current;
    await act(async () => {
      await loadCoachStored();
    });
    expect(coachStoredLoaded()).toBe(true);
    expect(host.goal()).toBe("notWiredYet");
    expect(runCoachTool({ tool: "set_goal", args: { text: "Join a band" } }, host, toolCtx())).toMatchObject({ why: "notWiredYet" });
    expect(store.disk.get("coach.goal")).toEqual({ text: "Play the solo at 120", at: 1 });
    // The other keys still read: Suggestions answers.
    expect(host.safeSetting("coachSuggestions")).toBe(true);
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

  it("knows Settings is an overlay: it names the mode under it, and says what a target would stop (review 7)", () => {
    const cases: Array<[Partial<CoachToolHostInput>, MainView | undefined, string | null]> = [
      [{ isPlaying: true, view: "settings", mode: "jam" }, undefined, "band"],
      [{ isPlaying: true, view: "settings", mode: "jam" }, "jam", null],
      [{ isPlaying: true, view: "settings", mode: "jam" }, "today", "band"],
      [{ isPlaying: true, view: "beat", mode: "beat" }, "settings", null],
      [{ isPlaying: true, view: "beat", mode: "beat" }, "drill", "click"],
      [{ isPlaying: true, view: "settings", mode: "session" }, "today", null],
      [{ isPlaying: false, view: "beat", mode: "beat" }, "today", null],
    ];
    for (const [over, target, sounding] of cases) {
      const { result } = renderHook(() => useCoachToolHost(input(over)));
      expect(result.current.sounding(target), `${JSON.stringify(over)} → ${target}`).toBe(sounding);
    }
  });

  it("band volume never chosen: set then undo gives the choice back, and a graded mic Take starts silent again (review 1)", () => {
    // The Session's own band choice and its store, as `useSessionRun` keeps them.
    let choice: number | null = null;
    const stored = new Map<string, unknown>();
    const session = {
      ...input().session,
      get bandChoice() {
        return choice;
      },
      // On Today, outside an Exercise: the level heard here is the default, not 0.
      get bandVolume() {
        return bandVolumeFor(choice, false, false);
      },
      setBandVolume: (next: number | null) => {
        choice = next;
        stored.set("session.bandVolume", next);
      },
    } as unknown as SessionRun;
    const props = input({ session });
    const { result } = renderHook(() => useCoachToolHost(props));
    const host = result.current;
    expect(host.safeSetting("bandVolume")).toBe("auto");
    const proposal = runCoachTool({ tool: "set_setting", args: { key: "bandVolume", value: "50" } }, host, toolCtx());
    if (!proposal.ok || !("proposal" in proposal)) throw new Error(JSON.stringify(proposal));
    expect(proposal.proposal.line.values).toEqual({ key: "bandVolume", from: "auto", to: 50 });
    const done = confirmCoachTool(proposal.proposal, host, toolCtx());
    if (!done.ok) throw new Error(JSON.stringify(done));
    expect(choice).toBe(0.5);
    expect(runCoachUndo(done.undo, host, toolCtx()).ok).toBe(true);
    expect(choice).toBeNull();
    expect(typeof stored.get("session.bandVolume")).not.toBe("number");
    // A graded Take on a microphone: the band is off again, as before the tool ran.
    expect(bandVolumeFor(choice, false, true)).toBe(0);
  });

  it("a load the unsaved-work question holds says \"asked\"; the presets carry their screen (review 9)", async () => {
    const { result } = renderHook(() =>
      useCoachToolHost(
        input({
          loadJam: () => "asked",
          loadPreset: () => "asked",
          listPresets: () => Promise.resolve([{ id: "p1", name: "Warm up 80", view: "drill" } as Preset]),
        }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.loadJam("j1")).toBe("asked");
    expect(result.current.presets()).toEqual([{ id: "p1", name: "Warm up 80", view: "drill" }]);
    expect(result.current.loadPreset("p1")).toBe("asked");
  });

  it("passes the window's re-read result on to the tool (leg t1b1, review t1a2b B)", async () => {
    const heard: boolean[] = [];
    const { result } = renderHook(() =>
      useCoachToolHost(
        input({
          loadPreset: (_preset, applied) => {
            applied?.(false);
            return "done";
          },
          listPresets: () => Promise.resolve([{ id: "p1", name: "Warm up 80", view: "drill" } as Preset]),
        }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.loadPreset("p1", (ok) => heard.push(ok))).toBe("done");
    expect(heard).toEqual([false]);
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
    // The second argument is the tool's ear for the re-read (none from a plain call).
    expect(sessionCalls).toEqual([["loadPreset", [{ id: "p1", name: "Warm up 80" }, undefined]]]);
  });
});
