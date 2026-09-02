/**
 * useCoachDownload — switching the brain off frees its RAM.
 *
 * The tier flag used to gate only *future* prompts, so a user who turned
 * the coach off after a session kept paying ~4 GB for a model that would
 * never be asked anything again. Loading is deliberately NOT the mirror
 * image: weights become resident when a session starts, never when a
 * toggle is pressed.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCoachDownload } from "./useCoachDownload";
import { __resetCoachLoaderForTests, ensureCoachLoaded } from "./coachLoader";
import { mockInvoke, setInvokeResponse } from "../test/mocks";

const calls = (command: string) =>
  mockInvoke.mock.calls.filter(([cmd]) => cmd === command).length;

describe("useCoachDownload — brain tier", () => {
  beforeEach(() => {
    __resetCoachLoaderForTests();
    setInvokeResponse("load_coach_model", () => true);
  });
  afterEach(() => {
    __resetCoachLoaderForTests();
  });

  it("unloads the model when the user switches the brain off", async () => {
    await ensureCoachLoaded();
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());

    await act(async () => {
      result.current.setCoachBrainTier("off");
    });
    await waitFor(() => expect(calls("unload_coach_model")).toBe(1));
  });

  it("does not load a model when the user switches a tier on", async () => {
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());

    await act(async () => {
      result.current.setCoachBrainTier("standard");
    });
    // Residency is a session's business, not a toggle's.
    expect(calls("load_coach_model")).toBe(0);
    expect(result.current.coachBrainTier).toBe("standard");
  });

  it("passes the backend's tier gates straight through", async () => {
    setInvokeResponse("get_model_status", () => ({
      brainReady: true,
      brainTier: "standard",
      brainFamily: "legacy",
      brainSizeBytes: 2_497_280_256,
      voiceReady: true,
      voiceSizeBytes: 60_000_000,
      studioRecommended: false,
      standardRecommended: true,
      brainUpdateRecommended: true,
    }));
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());

    expect(result.current.studioAvailable).toBe(false);
    expect(result.current.standardAvailable).toBe(true);
    expect(result.current.brainUpdateAvailable).toBe(true);
  });
});
