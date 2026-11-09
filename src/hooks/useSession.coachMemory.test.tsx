/**
 * What the coach is allowed to remember about the preset in front of it.
 *
 * `presetAwareness` gates everything it says on a minimum of data — three
 * sessions at the preset before any recurring pattern, three inside a BPM
 * band before that band can be called a ceiling, four before the pace line
 * suggests dropping back. Those numbers were chosen against a store that
 * keeps everything (ROADMAP 1.1, W2).
 *
 * They were being fed `getSessionHistory()`, which is the last THIRTY
 * sessions across every preset in the app. A player who alternates three
 * exercises leaves about ten rows of each in that slice, and one who has
 * been practising for a month leaves fewer; the gates then almost never
 * fire, and the coach that was built to notice a wall never mentions it.
 *
 * So the feed is `queryHistory({ presetId })` — the store's own answer to
 * the question the coach is asking. These tests pin the wiring: which call
 * is made, and that the gate fires on the rows the old call would have
 * thrown away.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession } from "./useSession";
import { __resetCoachLoaderForTests } from "./coachLoader";
import { mockInvoke, setInvokeResponse } from "../test/mocks";
import * as presetAwareness from "../coach/presetAwareness";
import {
  detectRecurringIssues,
  detectStaminaPattern,
  summarizePreset,
} from "../coach/presetAwareness";
import type { SavedSession, SessionReport } from "../types";

type Evaluation = Parameters<typeof useSession>[0]["evaluation"];

const evaluation = {
  enabled: true,
  toggle: vi.fn(),
  selectedDevice: null,
} as unknown as Evaluation;

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_715_000_000_000;
const WALL = "the-wall";

function report(score: number): SessionReport {
  return {
    totalBeats: 480,
    hitsCount: 400,
    missCount: 80,
    skippedBeats: 0,
    perfectCount: 360,
    goodCount: 40,
    okCount: 0,
    meanDeviationMs: 0,
    stdDeviationMs: 5,
    meanAbsDeviationMs: 4,
    meanIntervalErrorMs: 3,
    grade: "C",
    score,
    deviations: [],
    dynamicsStd: 0.1,
    meanAmplitude: 0.5,
    tempoStabilityMs: 3,
    longestStreak: 16,
    comment: "",
    insights: [],
    gridCorrelation: 0.9,
  };
}

function session(id: string, presetId: string, bpm: number, score: number, daysAgo: number): SavedSession {
  return {
    id,
    timestamp: T0 - daysAgo * DAY,
    bpm,
    timeSignature: 4,
    report: report(score),
    presetId,
    presetName: presetId,
  };
}

/**
 * Six evenings on the same wall, all of them in the 130s and all of them
 * under the 70 that `presetAwareness` calls a ceiling.
 */
const AT_THE_WALL: SavedSession[] = [132, 135, 138, 131, 134, 137].map((bpm, i) =>
  session(`wall-${i}`, WALL, bpm, 58 + (i % 5), 30 - i),
);

/**
 * …and what `getSessionHistory` would hand back on the same store: thirty
 * rows, newest first, mostly the other two exercises this player rotates
 * through. Two of the six evenings survive the cut.
 */
const LAST_THIRTY: SavedSession[] = [
  ...Array.from({ length: 28 }, (_, i) =>
    session(`other-${i}`, i % 2 === 0 ? "scales" : "chords", 90 + i, 88, i),
  ),
  ...AT_THE_WALL.slice(-2),
];

function renderSession() {
  return renderHook(() =>
    useSession({
      evaluation,
      isPlaying: false,
      bpm: 134,
      timeSignature: 4,
      presetId: WALL,
      presetName: "The Wall",
      setBpm: vi.fn(),
    }),
  );
}

/** Every `query_history` call's filter, in order. */
function historyFilters(): unknown[] {
  return mockInvoke.mock.calls
    .filter(([cmd]) => cmd === "query_history")
    .map(([, args]) => (args as { filter?: unknown })?.filter);
}

beforeEach(() => {
  __resetCoachLoaderForTests();
  setInvokeResponse("get_session_history", () => LAST_THIRTY);
  setInvokeResponse("query_history", (args) => {
    const filter = (args?.filter ?? {}) as { presetId?: string };
    const all = [...LAST_THIRTY, ...AT_THE_WALL];
    const rows = filter.presetId ? all.filter((s) => s.presetId === filter.presetId) : all;
    // Newest first, and de-duplicated the way one store row would be.
    const seen = new Set<string>();
    return rows
      .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
      .sort((a, b) => b.timestamp - a.timestamp);
  });
});

afterEach(() => {
  __resetCoachLoaderForTests();
});

describe("the coach's memory of one preset", () => {
  it("asks the store for this preset, not for the last thirty of everything", async () => {
    const { result } = renderSession();
    await act(async () => {
      await result.current.startSession();
    });
    await waitFor(() => expect(historyFilters().length).toBeGreaterThan(0));
    expect(historyFilters()).toContainEqual({ presetId: WALL });
  });

  it("still reads the wide slice, because the greeting is about the last thing played", async () => {
    // Two different questions, two different reads. "Welcome back — you were
    // on chords yesterday" comes from the slice; "this wall is at 130" comes
    // from the preset. Collapsing them into one call would break one of them.
    const { result } = renderSession();
    await act(async () => {
      await result.current.startSession();
    });
    await waitFor(() =>
      expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === "get_session_history").length)
        .toBeGreaterThan(0),
    );
  });

  it("hands those rows to the gates, and not the slice the greeting reads", async () => {
    // The seam the two tests above leave open: `query_history` being called
    // is not the same fact as its answer being what `presetAwareness` is
    // given. Six rows go in, and the slice's two do not.
    const summarize = vi.spyOn(presetAwareness, "summarizePreset");
    const stamina = vi.spyOn(presetAwareness, "detectStaminaPattern");
    const { result } = renderSession();
    await act(async () => {
      await result.current.startSession();
    });
    await waitFor(() => expect(summarize).toHaveBeenCalled());
    for (const call of summarize.mock.calls) {
      expect(call[0]).toBe(WALL);
      expect(call[2].map((s) => s.presetId)).toEqual(Array(6).fill(WALL));
    }
    expect(stamina).toHaveBeenCalled();
    for (const call of stamina.mock.calls) {
      expect(call[0].map((s) => s.presetId)).toEqual(Array(6).fill(WALL));
    }
    summarize.mockRestore();
    stamina.mockRestore();
  });

  it("asks with no filter for nothing — a free-play session makes no preset read", async () => {
    const { result } = renderHook(() =>
      useSession({
        evaluation,
        isPlaying: false,
        bpm: 134,
        timeSignature: 4,
        setBpm: vi.fn(),
      }),
    );
    await act(async () => {
      await result.current.startSession();
    });
    expect(historyFilters()).toEqual([]);
  });
});

/**
 * The gates themselves, on the two histories, so the reason for the change
 * is a test rather than a paragraph.
 *
 * `presetAwareness` is pure and stays pure — it is handed rows and told
 * which preset they are about. The bug was never in here; it was in what it
 * was handed.
 */
describe("what the gates make of each history", () => {
  it("finds the wall in the preset's own history", () => {
    const summary = summarizePreset(WALL, "The Wall", AT_THE_WALL);
    expect(summary.sessionCount).toBe(6);
    const { bpmCeiling } = detectRecurringIssues(summary);
    expect(bpmCeiling).not.toBeNull();
    expect(bpmCeiling?.bpmLow).toBe(130);
    // And enough of them for the pace line, which waits for a fourth.
    expect(bpmCeiling?.sessions).toBeGreaterThan(3);
  });

  it("finds nothing at all in the thirty-session slice", () => {
    const summary = summarizePreset(WALL, "The Wall", LAST_THIRTY);
    // Two rows survived the cut — one short of the three the gate needs.
    expect(summary.sessionCount).toBe(2);
    const { bpmCeiling, timingTendency, stamina } = detectRecurringIssues(summary);
    expect(bpmCeiling).toBeNull();
    expect(timingTendency).toBeNull();
    expect(stamina).toBeNull();
    // Stamina needs five sessions at the preset, and the slice has two.
    expect(detectStaminaPattern(LAST_THIRTY, WALL)).toBeNull();
  });
});
