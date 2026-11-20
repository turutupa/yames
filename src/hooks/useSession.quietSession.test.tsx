/**
 * The coach's feed is the coach's: only a session the player started from
 * the coach writes to it, and a session with nothing in it writes nothing.
 *
 * Owner report, 2026-11-18: "I haven't even started it and these are the
 * comments." A learning Session opens a coach session to listen and to save
 * the history (`useSessionRun`), and that session greeted the player and,
 * having heard nothing, posted "Session ended — no data recorded." twice over
 * in one card.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession, __resetHistoryNoticeForTests } from "./useSession";
import { __resetCoachLoaderForTests } from "./coachLoader";
import { __resetAskStoreForTests, getAskState } from "../containers/coach/askStore";
import { mockInvoke, setInvokeResponse } from "../test/mocks";
import type { SessionReport } from "../types";

type Evaluation = Parameters<typeof useSession>[0]["evaluation"];

const evaluation = {
  enabled: true,
  toggle: vi.fn(),
  setListening: vi.fn(async () => {}),
  selectedDevice: null,
} as unknown as Evaluation;

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

type Props = { bpm: number; isPlaying: boolean };

function renderSession(initial: Props = { bpm: 120, isPlaying: false }) {
  return renderHook(
    ({ bpm, isPlaying }: Props) =>
      useSession({
        evaluation,
        isPlaying,
        bpm,
        timeSignature: 4,
        presetId: "metronome-preset",
        presetName: "Alt picking",
        brainTier: "off",
        setBpm: vi.fn(),
      }),
    { initialProps: initial },
  );
}

const savedSessions = () =>
  mockInvoke.mock.calls
    .filter(([cmd]) => cmd === "save_session")
    .map(([, args]) => (args as { session: { bpm: number; presetId?: string } }).session);

describe("whose feed it is", () => {
  beforeEach(() => {
    __resetCoachLoaderForTests();
    __resetHistoryNoticeForTests();
    __resetAskStoreForTests();
    setInvokeResponse("save_session", () => "stored");
  });
  afterEach(() => {
    __resetCoachLoaderForTests();
    __resetHistoryNoticeForTests();
    __resetAskStoreForTests();
  });

  it("a session that heard nothing posts no end card", async () => {
    setInvokeResponse("get_final_session_report", () => null);
    const { result } = renderSession();
    await act(async () => {
      await result.current.startSession();
    });
    await act(async () => {
      await result.current.endSession();
    });
    expect(result.current.messages.some((m) => m.type === "session-end")).toBe(false);
    expect(result.current.messages.some((m) => /no data recorded/i.test(m.content))).toBe(false);
  });

  it("a quiet session greets nobody, opens nothing and leaves the feed as it was", async () => {
    setInvokeResponse("get_final_session_report", () => null);
    const { result } = renderSession();
    await act(async () => {
      await result.current.startSession({ quiet: true });
    });
    expect(result.current.active).toBe(true);
    expect(getAskState().open).toBe(false);
    expect(result.current.messages).toEqual([]);
    await act(async () => {
      await result.current.endSession();
    });
    expect(result.current.active).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  it("a quiet session with a report still writes the history, at the tempo it was played at, without the metronome's preset", async () => {
    setInvokeResponse("get_final_session_report", () => REPORT);
    const { result, rerender } = renderSession();
    await act(async () => {
      await result.current.startSession({ quiet: true });
    });
    // The Session plays its step at 80, then hands the metronome back to 120.
    rerender({ bpm: 80, isPlaying: true });
    rerender({ bpm: 80, isPlaying: false });
    rerender({ bpm: 120, isPlaying: false });
    await act(async () => {
      await result.current.endSession();
    });
    await waitFor(() => expect(savedSessions()).toHaveLength(1));
    expect(savedSessions()[0].bpm).toBe(80);
    expect(savedSessions()[0].presetId).toBeUndefined();
    expect(result.current.messages.some((m) => m.type === "session-end")).toBe(false);
    expect(result.current.messages.some((m) => m.type === "session-start")).toBe(false);
  });

  it("the player's own session (Listen) opens no panel, greets nobody and still ends with its report", async () => {
    setInvokeResponse("get_final_session_report", () => REPORT);
    const { result } = renderSession();
    await act(async () => {
      await result.current.startSession();
    });
    // Listen turned on (DESIGN 7, leg c2a2): no panel, no feed, no greeting;
    // the line and the note under the stage read the messages.
    expect(getAskState().open).toBe(false);
    expect(result.current.messages.some((m) => m.type === "session-start")).toBe(false);
    await act(async () => {
      await result.current.endSession();
    });
    const end = result.current.messages.find((m) => m.type === "session-end");
    expect(end?.report).toBeDefined();
    await waitFor(() => expect(savedSessions()).toHaveLength(1));
    expect(savedSessions()[0].presetId).toBe("metronome-preset");
  });
});
