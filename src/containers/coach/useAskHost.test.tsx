/**
 * The model's context in Ask is `askModelContext`, the one without the last
 * Take's raw review (review c2b1a F5): this checks the wiring, not only the
 * function, so going back to `contextForModel(buildCoachContext(sources))`
 * in `useAskHost` fails here (review c2b1c L4).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import "../../i18n";
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

vi.mock("./useCoachPanel", () => ({
  useCoachPanel: (opts: { contextText: () => string }) => {
    seen.contextText = opts.contextText;
    return { open: false, deferred: false };
  },
  useAskSessionRules: () => {},
}));

import { useAskHost } from "./useAskHost";

afterEach(() => {
  seen.contextText = null;
  seen.sources = [];
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
