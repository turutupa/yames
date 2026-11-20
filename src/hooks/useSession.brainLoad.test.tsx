/**
 * useSession and the coach model, since the model selector (ms1).
 *
 * Sessions no longer own the model: `hooks/coachLoader.ts` loads the
 * player's choice once after startup and keeps it until they pick Off or
 * another model. So a session start loads nothing, a session end unloads
 * nothing and arms no idle unload, and a quiet session (a Path Session's
 * history writer) asks the model for nothing even when one is resident.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession } from "./useSession";
import {
  __resetCoachLoaderForTests,
  coachResident,
  openCoachStartupGate,
  setCoachModelChoice,
  setCoachModelDisk,
} from "./coachLoader";
import { mockInvoke, mockListen, setInvokeResponse } from "../test/mocks";
import type { ModelStatus } from "../ipc.desktop";
import type { AdaptiveEvalRequest } from "../ipc";

type Evaluation = Parameters<typeof useSession>[0]["evaluation"];

const evaluation = {
  enabled: true,
  toggle: vi.fn(),
  setListening: vi.fn(async () => {}),
  selectedDevice: null,
} as unknown as Evaluation;

const calls = (command: string) =>
  mockInvoke.mock.calls.filter(([cmd]) => cmd === command).length;

const generated = (kind: string) =>
  mockInvoke.mock.calls.filter(
    ([cmd, args]) => cmd === "coach_generate" && (args as { kind?: string } | undefined)?.kind === kind,
  ).length;

const STANDARD_ON_DISK: ModelStatus = {
  brainReady: true,
  brainTier: "standard",
  brainFamily: "qwen3",
  brainSizeBytes: 2_497_280_256,
  voiceReady: true,
  voiceSizeBytes: 0,
  studioRecommended: true,
  standardRecommended: true,
  brainUpdateRecommended: false,
} as ModelStatus;

function renderSession() {
  return renderHook(() =>
    useSession({
      evaluation,
      isPlaying: false,
      bpm: 120,
      timeSignature: 4,
      setBpm: vi.fn(),
    }),
  );
}

/** A Standard model resident, as the loader leaves it after startup. */
async function residentStandard() {
  setInvokeResponse("get_coach_capabilities", () => ({
    llmCompiled: true,
    modelResident: true,
    loading: false,
    backend: "vulkan",
    modelName: "Qwen3 4B",
    loadError: null,
    brainDownloaded: true,
    studioRecommended: true,
    standardRecommended: true,
    brainUpdateRecommended: false,
    tipsUseModel: true,
    rephraseP50Ms: 400,
  }));
  setInvokeResponse("load_coach_model", () => true);
  setCoachModelDisk(STANDARD_ON_DISK, 32_768);
  setCoachModelChoice("standard");
  await openCoachStartupGate();
  await waitFor(() => expect(coachResident()).toBe(true));
}

/** The latest `adaptive-eval` listener useSession registered. */
function adaptiveEval(): (e: { payload: AdaptiveEvalRequest }) => void {
  const subs = mockListen.mock.calls.filter(([event]) => event === "adaptive-eval");
  return subs[subs.length - 1][1] as (e: { payload: AdaptiveEvalRequest }) => void;
}

const STEP_UP: AdaptiveEvalRequest = {
  currentBpm: 100,
  newBpm: 104,
  startBpm: 90,
  targetBpm: 120,
  accuracyPct: 92,
  aggressiveness: "normal",
  currentStep: 2,
  decision: "up",
};

describe("useSession — the model is not the session's", () => {
  beforeEach(() => {
    __resetCoachLoaderForTests();
    setInvokeResponse("load_coach_model", () => true);
    setInvokeResponse("coach_generate", () => "Nice and steady, keep it there.");
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    __resetCoachLoaderForTests();
    vi.useRealTimers();
  });

  it("loads nothing at mount, at a session's start or at its end", async () => {
    const { result } = renderSession();
    await act(async () => {
      await result.current.startSession();
    });
    await waitFor(() => expect(result.current.active).toBe(true));
    await act(async () => {
      await result.current.endSession();
    });
    expect(calls("load_coach_model")).toBe(0);
    expect(calls("unload_coach_model")).toBe(0);
  });

  it("leaves a resident model loaded after a session ends, however long the app idles", async () => {
    await residentStandard();
    const loadsBefore = calls("load_coach_model");
    const { result } = renderSession();
    await act(async () => {
      await result.current.startSession();
    });
    await act(async () => {
      await result.current.endSession();
    });
    // The old ten-minute idle unload is gone: an hour later it is still there.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    });
    expect(calls("unload_coach_model")).toBe(0);
    expect(calls("load_coach_model")).toBe(loadsBefore);
    expect(coachResident()).toBe(true);
  });

  it("the player's own session asks a resident model to phrase a drill step", async () => {
    await residentStandard();
    const { result } = renderSession();
    await act(async () => {
      await result.current.startSession();
    });
    await act(async () => {
      adaptiveEval()({ payload: STEP_UP });
    });
    await waitFor(() => expect(generated("drill")).toBe(1));
  });

  it("a quiet session asks the model for nothing, though one is resident", async () => {
    await residentStandard();
    const { result } = renderSession();
    await act(async () => {
      await result.current.startSession({ quiet: true });
    });
    await act(async () => {
      adaptiveEval()({ payload: STEP_UP });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await result.current.endSession();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(calls("coach_generate")).toBe(0);
    expect(calls("load_coach_model")).toBe(1);
    expect(calls("unload_coach_model")).toBe(0);
  });
});
