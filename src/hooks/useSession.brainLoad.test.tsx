/**
 * useSession — when the brain is loaded and unloaded.
 *
 * The policy: the model is resident only while somebody is practising.
 * Before T04c this hook loaded it from its mount effect *and* from
 * `startSession` while the first call was still in flight, and the Rust
 * side dropped the resident worker before spawning its replacement — so
 * the second call tore down a working brain, and a failure at that point
 * left none at all. It also meant every launch paid several seconds and
 * ~4 GB for a model the user might never ask a question of.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession } from "./useSession";
import { COACH_IDLE_UNLOAD_MS, __resetCoachLoaderForTests } from "./coachLoader";
import { mockInvoke, setInvokeResponse } from "../test/mocks";
import type { BrainTier } from "../types";

type Evaluation = Parameters<typeof useSession>[0]["evaluation"];

const evaluation = {
  enabled: true,
  toggle: vi.fn(),
  selectedDevice: null,
} as unknown as Evaluation;

const calls = (command: string) =>
  mockInvoke.mock.calls.filter(([cmd]) => cmd === command).length;

function renderSession(brainTier: BrainTier) {
  return renderHook(() =>
    useSession({
      evaluation,
      isPlaying: false,
      bpm: 120,
      timeSignature: 4,
      brainTier,
      setBpm: vi.fn(),
    }),
  );
}

describe("useSession — brain residency", () => {
  beforeEach(() => {
    __resetCoachLoaderForTests();
    setInvokeResponse("load_coach_model", () => true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    __resetCoachLoaderForTests();
    vi.useRealTimers();
  });

  it("loads nothing at mount", async () => {
    const { result } = renderSession("standard");
    // Let every mount effect settle — including the residency query.
    await waitFor(() => expect(calls("is_coach_loaded")).toBeGreaterThan(0));
    expect(calls("load_coach_model")).toBe(0);
    expect(result.current.active).toBe(false);
  });

  it("loads once when a session starts", async () => {
    const { result } = renderSession("standard");
    await act(async () => {
      await result.current.startSession();
    });
    await waitFor(() => expect(calls("load_coach_model")).toBe(1));

    // A second session must not reload weights that are already resident:
    // that is the call that used to destroy the working worker.
    await act(async () => {
      await result.current.endSession();
    });
    await act(async () => {
      await result.current.startSession();
    });
    expect(calls("load_coach_model")).toBe(1);
  });

  it("loads nothing when the user has the brain switched off", async () => {
    const { result } = renderSession("off");
    await act(async () => {
      await result.current.startSession();
    });
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(calls("load_coach_model")).toBe(0);
  });

  it("drops the worker after the idle window and reloads for the next session", async () => {
    const { result } = renderSession("standard");
    await act(async () => {
      await result.current.startSession();
    });
    await waitFor(() => expect(calls("load_coach_model")).toBe(1));

    await act(async () => {
      await result.current.endSession();
    });
    expect(calls("unload_coach_model")).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COACH_IDLE_UNLOAD_MS);
    });
    expect(calls("unload_coach_model")).toBe(1);

    await act(async () => {
      await result.current.startSession();
    });
    await waitFor(() => expect(calls("load_coach_model")).toBe(2));
  });
});
