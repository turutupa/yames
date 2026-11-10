/**
 * The order of calls that makes a session (COA-07, COA-61; the brief's rule 5).
 *
 * A session is recorded only through `start_evaluation`, then `stop_evaluation`
 * BEFORE `get_final_session_report`, then `save_session`. A one-tap start that skips
 * any of it produces no segment and no history, and looks fine until somebody opens
 * the History tab a week later. So this drives the real `useSession` with the real
 * `useEvaluation`, the way the window does, and reads back the commands in order.
 * Today's Session has to go through the same two hooks, and `doors.test.ts` makes
 * sure there is no other way to save one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { mockInvoke, setInvokeResponse } from "../test/mocks";
import type { SessionReport } from "../types";
import { __resetCoachLoaderForTests } from "./coachLoader";
import { useEvaluation } from "./useEvaluation";
import { __resetHistoryNoticeForTests, useSession } from "./useSession";

const REPORT: SessionReport = {
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
  score: 70,
  deviations: [],
  dynamicsStd: 0.1,
  meanAmplitude: 0.5,
  tempoStabilityMs: 3,
  longestStreak: 16,
  comment: "",
  insights: [],
  gridCorrelation: 0.9,
};

const ORDERED = ["start_evaluation", "stop_evaluation", "get_final_session_report", "save_session"];

function order(): string[] {
  return mockInvoke.mock.calls.map(([c]) => c).filter((c) => ORDERED.includes(c));
}

function mount(preset: { presetId?: string; presetName?: string } = {}) {
  return renderHook(() => {
    const evaluation = useEvaluation({ coachMode: "default" });
    const session = useSession({
      evaluation,
      isPlaying: false,
      bpm: 96,
      timeSignature: 4,
      beatGroups: [4],
      brainTier: "off",
      setBpm: vi.fn(),
      ...preset,
    });
    return { evaluation, session };
  });
}

type Hook = ReturnType<typeof mount>;

async function start(hook: Hook) {
  await act(async () => {
    await hook.result.current.session.startSession();
  });
  await waitFor(() => expect(hook.result.current.evaluation.enabled).toBe(true));
}

async function end(hook: Hook) {
  await act(async () => {
    await hook.result.current.session.endSession();
  });
  await waitFor(() => expect(hook.result.current.session.active).toBe(false));
}

describe("a practice session", () => {
  beforeEach(() => {
    __resetCoachLoaderForTests();
    __resetHistoryNoticeForTests();
    setInvokeResponse("get_final_session_report", () => REPORT);
  });
  afterEach(() => {
    __resetCoachLoaderForTests();
    __resetHistoryNoticeForTests();
  });

  it("starts listening when it starts", async () => {
    const hook = mount();
    await start(hook);
    expect(order()).toEqual(["start_evaluation"]);
    expect(hook.result.current.session.active).toBe(true);
  });

  it("stops listening, reads the final report, and only then saves", async () => {
    const hook = mount();
    await start(hook);
    await end(hook);
    const seen = order();
    const first = (c: string) => seen.indexOf(c);
    expect(first("start_evaluation")).toBe(0);
    expect(first("stop_evaluation")).toBeGreaterThan(first("start_evaluation"));
    expect(first("get_final_session_report")).toBeGreaterThan(first("stop_evaluation"));
    expect(first("save_session")).toBeGreaterThan(first("get_final_session_report"));
    expect(seen.filter((c) => c === "save_session")).toHaveLength(1);
  });

  it("saves the record the history is built from", async () => {
    const hook = mount({ presetId: "preset-beat", presetName: "Warm up" });
    await start(hook);
    await end(hook);
    const call = mockInvoke.mock.calls.find(([c]) => c === "save_session");
    const saved = (call?.[1] as { session: Record<string, unknown> }).session;
    expect(saved).toMatchObject({
      bpm: 96,
      timeSignature: 4,
      presetId: "preset-beat",
      presetName: "Warm up",
    });
    expect(typeof saved.id).toBe("string");
    expect(typeof saved.timestamp).toBe("number");
    expect((saved.report as SessionReport).hitsCount).toBe(400);
  });

  it("saves nothing when nothing was played: noise stays out of the history", async () => {
    setInvokeResponse("get_final_session_report", () => ({
      ...REPORT,
      hitsCount: 0,
      perfectCount: 0,
      goodCount: 0,
      totalBeats: 0,
    }));
    const hook = mount();
    await start(hook);
    await end(hook);
    expect(order()).not.toContain("save_session");
  });

  it("does not start twice", async () => {
    const hook = mount();
    await start(hook);
    await act(async () => {
      await hook.result.current.session.startSession();
    });
    expect(order().filter((c) => c === "start_evaluation")).toHaveLength(1);
  });

  it("ending one that never started saves nothing", async () => {
    const hook = mount();
    await act(async () => {
      await hook.result.current.session.endSession();
    });
    expect(order()).toEqual([]);
  });
});
