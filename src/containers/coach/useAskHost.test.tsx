/**
 * The model's context in Ask is `askModelContext`, the one without the last
 * Take's raw review (review c2b1a F5): this checks the wiring, not only the
 * function, so going back to `contextForModel(buildCoachContext(sources))`
 * in `useAskHost` fails here (review c2b1c L4).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import i18n from "../../i18n";
import type { SessionRun } from "../session/hooks/useSessionRun";
import type { CoachSources } from "../../coach/context";

const seen = vi.hoisted(() => ({ contextText: null as null | (() => string), sources: [] as unknown[] }));

vi.mock("./askContext", async (importOriginal) => {
  const real = await importOriginal<typeof import("./askContext")>();
  return {
    ...real,
    askModelContext: (sources: CoachSources) => {
      seen.sources.push(sources);
      return "THE MODEL'S CONTEXT";
    },
  };
});

// The coach's keys read as nothing stored: the goal question would be asked out of a Session.
vi.mock("../../ipc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ipc")>()),
  storeLoad: vi.fn(async () => undefined),
  storeSave: vi.fn(async () => {}),
}));

vi.mock("./useCoachPanel", () => ({
  useCoachPanel: (opts: { contextText: () => string }) => {
    seen.contextText = opts.contextText;
    return { open: false, deferred: false };
  },
  useAskSessionRules: () => {},
}));

import { useAskHost } from "./useAskHost";
import { readNotebookSource } from "./askStore";
import { Notebook } from "./Notebook";
import { loadCoachStored, resetCoachStored } from "../../coach/store";

afterEach(() => {
  seen.contextText = null;
  seen.sources = [];
  resetCoachStored();
});

const session = {
  grading: "on",
  directInput: false,
  inputStart: { failure: null },
  progress: { states: [], takes: [], ceilings: [] },
  plan: null,
  run: { phase: "idle", outcomes: [], stepIndex: 0, paused: false, ended: false },
  paths: [],
  exercise: null,
  take: null,
  actions: { togglePause: () => {} },
} as unknown as SessionRun;

describe("the Notebook's source (c4a2b, M1)", () => {
  const DAY = 86_400_000;
  const started = Date.now() - 2 * 3_600_000;
  const take = (id: string, ago: number) => ({
    id,
    pathId: "fx",
    stepId: "s1",
    exerciseId: "a",
    startedAt: Date.now() - ago,
    bpm: 100,
    bars: 8,
    caught: true,
    passed: false,
    facts: {},
  });
  // The first Take is ten days old (the goal question's age), two were played in this Session.
  const rows = [take("old", 10 * DAY), take("in1", 3_600_000), take("in2", 1_800_000)];
  const running = (phase: string) =>
    ({
      ...session,
      progress: { states: [], takes: rows, ceilings: [] },
      run: { ...(session.run as object), phase, startedAt: started },
    }) as unknown as SessionRun;

  it("a Session that runs while Today shows is still a Session: its start is passed on", () => {
    renderHook(() => useAskHost({ view: "today", session: running("ready"), listening: false, isPlaying: false, jam: null, song: null }));
    expect(readNotebookSource()?.sessionStartedAt).toBe(started);
  });

  it("no Session running: no start, whatever the view", () => {
    renderHook(() => useAskHost({ view: "session", session: running("idle"), listening: false, isPlaying: false, jam: null, song: null }));
    expect(readNotebookSource()?.sessionStartedAt).toBeNull();
  });

  it("on screen: the Notebook says it shows what was stored before, reads none of the Session's Takes, and never asks the goal", async () => {
    renderHook(() => useAskHost({ view: "progress", session: running("result"), listening: false, isPlaying: false, jam: null, song: null }));
    render(<Notebook />);
    await act(async () => {
      await loadCoachStored();
    });
    expect(screen.getByTestId("nb-session-note")).toBeInTheDocument();
    // One Take before the Session: "Takes so far: 1", not 3.
    expect(screen.getByTestId("nb-too-few")).toHaveTextContent(i18n.t("notebook.ui.tooFewTakes", { count: 1 }));
    expect(screen.queryByTestId("nb-goal-offer")).toBeNull();
  });
});

describe("the plan the cards read (review c2b2a H1)", () => {
  const part = (title: string, bpm: number) => ({ kind: "exercise", id: title, title, bpm, minutes: 4, why: { code: "climb", values: {} } });
  const today = { minutes: 10, steps: [part("Warm-up", 70), part("Today's second", 80)] };
  const testOut = { minutes: 5, steps: [part("Test out", 120)] };
  const host = (view: "session" | "today", phase: string) => {
    const s = { ...session, plan: today, run: { ...(session.run as object), phase, plan: phase === "idle" ? null : testOut } } as unknown as SessionRun;
    renderHook(() => useAskHost({ view, session: s, listening: false, isPlaying: false, jam: null, song: null }));
    seen.contextText!();
    return seen.sources[seen.sources.length - 1] as CoachSources;
  };

  it("in a running Session: the plan it runs, not Today's", () => {
    expect(host("session", "ready").plan?.()).toBe(testOut);
  });

  it("on Today: Today's plan", () => {
    expect(host("today", "idle").plan?.()).toBe(today);
  });
});

describe("useAskHost", () => {
  it("hands the panel askModelContext over its own sources, nothing built beside it", () => {
    renderHook(() => useAskHost({ view: "today", session, listening: false, isPlaying: false, jam: null, song: null }));
    expect(seen.contextText).not.toBeNull();
    expect(seen.contextText!()).toBe("THE MODEL'S CONTEXT");
    expect(seen.sources).toHaveLength(1);
    // The sources it passes are the host's getters (the screen among them).
    expect((seen.sources[0] as CoachSources).screen()).toBe("today");
  });
});
