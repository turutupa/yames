/**
 * A finished session is never thrown away without a word.
 *
 * When the practice store cannot take a session (it would not open, or is
 * still opening), Rust keeps it in settings.json the way v1.2.1 did and
 * answers `keptInSettings`. This pins the other half: the player is told,
 * once per launch, in the feed — and not at all when the store took it.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession, __resetHistoryNoticeForTests } from "./useSession";
import { __resetCoachLoaderForTests } from "./coachLoader";
import { mockInvoke, setInvokeResponse } from "../test/mocks";
import i18n from "../i18n";
import type { SessionReport } from "../types";

type Evaluation = Parameters<typeof useSession>[0]["evaluation"];

const evaluation = {
  enabled: true,
  toggle: vi.fn(),
  selectedDevice: null,
} as unknown as Evaluation;

/** A session worth keeping: past every gate `isSegmentReportable` sets. */
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

const NOTICE = () => i18n.t("coachCard.historyKeptInSettings");

function renderSession() {
  return renderHook(() =>
    useSession({
      evaluation,
      isPlaying: false,
      bpm: 120,
      timeSignature: 4,
      brainTier: "off",
      setBpm: vi.fn(),
    }),
  );
}

const saves = () => mockInvoke.mock.calls.filter(([cmd]) => cmd === "save_session").length;

async function playOneSession(result: ReturnType<typeof renderSession>["result"]) {
  await act(async () => {
    await result.current.startSession();
  });
  await act(async () => {
    await result.current.endSession();
  });
}

function notices(result: ReturnType<typeof renderSession>["result"]) {
  return result.current.messages.filter((m) => m.type === "system" && m.content === NOTICE());
}

describe("a session the store could not take", () => {
  beforeEach(() => {
    __resetCoachLoaderForTests();
    __resetHistoryNoticeForTests();
    setInvokeResponse("get_final_session_report", () => REPORT);
  });
  afterEach(() => {
    __resetCoachLoaderForTests();
    __resetHistoryNoticeForTests();
  });

  it("the notice is a real sentence in English", () => {
    expect(NOTICE()).not.toBe("coachCard.historyKeptInSettings");
    expect(NOTICE().length).toBeGreaterThan(20);
  });

  it("tells the player once, however many sessions follow", async () => {
    setInvokeResponse("save_session", () => "keptInSettings");
    const { result } = renderSession();

    await playOneSession(result);
    await waitFor(() => expect(saves()).toBe(1));
    await waitFor(() => expect(notices(result)).toHaveLength(1));

    // The next session starts with a fresh feed, and its save is kept the
    // old way too: the player has been told, and is not told again.
    await playOneSession(result);
    await waitFor(() => expect(saves()).toBe(2));
    // Let the second save's answer land before counting.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.messages.some((m) => m.type === "session-end")).toBe(true);
    expect(notices(result)).toHaveLength(0);
  });

  it("says nothing when the store took the session", async () => {
    setInvokeResponse("save_session", () => "stored");
    const { result } = renderSession();
    await playOneSession(result);
    await waitFor(() => expect(saves()).toBe(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(notices(result)).toHaveLength(0);
  });
});
