/**
 * useCoachDownload — the brain tier is the model selector's choice (ms1).
 *
 * One state: Settings' tier buttons, the wizard and the selector write the
 * loader's choice, and the loader loads or unloads to match. Off unloads
 * and never deletes. The selector's Download runs this hook's download
 * through the loader's port, and only on a press.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MODEL_URLS, useCoachDownload } from "./useCoachDownload";
import {
  __resetCoachLoaderForTests,
  cancelCoachModelDownload,
  coachResident,
  getCoachModelSnapshot,
  openCoachStartupGate,
  startCoachModelDownload,
} from "./coachLoader";
import { mockInvoke, mockListen, setInvokeResponse } from "../test/mocks";

const calls = (command: string) =>
  mockInvoke.mock.calls.filter(([cmd]) => cmd === command).length;

const STANDARD_ON_DISK = {
  brainReady: true,
  brainTier: "standard",
  brainFamily: "qwen3",
  brainSizeBytes: 2_497_280_256,
  voiceReady: true,
  voiceSizeBytes: 60_000_000,
  studioRecommended: true,
  standardRecommended: true,
  brainUpdateRecommended: false,
};

const NOTHING_ON_DISK = {
  ...STANDARD_ON_DISK,
  brainReady: false,
  brainTier: null,
  brainFamily: null,
  brainSizeBytes: 0,
  voiceReady: false,
};

function fire(event: string, payload: unknown) {
  for (const [name, cb] of mockListen.mock.calls) {
    if (name === event) (cb as (e: { payload: unknown }) => void)({ payload });
  }
}

describe("useCoachDownload — brain tier", () => {
  beforeEach(() => {
    __resetCoachLoaderForTests();
    setInvokeResponse("load_coach_model", () => true);
    setInvokeResponse("get_coach_capabilities", () => ({ llmCompiled: true, modelResident: false, modelName: null, loadError: null }));
  });
  afterEach(() => {
    __resetCoachLoaderForTests();
  });

  it("unloads the model when the player switches it off, and deletes nothing", async () => {
    setInvokeResponse("get_model_status", () => STANDARD_ON_DISK);
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());
    await act(async () => {
      result.current.setCoachBrainTier("standard");
      await openCoachStartupGate();
    });
    await waitFor(() => expect(coachResident()).toBe(true));

    await act(async () => {
      result.current.setCoachBrainTier("off");
    });
    await waitFor(() => expect(calls("unload_coach_model")).toBe(1));
    expect(calls("delete_models")).toBe(0);
    expect(result.current.coachBrainTier).toBe("off");
  });

  it("does not load a model before the startup gate, whatever the toggle says", async () => {
    setInvokeResponse("get_model_status", () => STANDARD_ON_DISK);
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());

    await act(async () => {
      result.current.setCoachBrainTier("standard");
    });
    expect(calls("load_coach_model")).toBe(0);
    expect(result.current.coachBrainTier).toBe("standard");
    expect(getCoachModelSnapshot().state).toBe("waiting");
  });

  it("starts no download at mount, and none until the selector's press", async () => {
    setInvokeResponse("get_model_status", () => NOTHING_ON_DISK);
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());
    await act(async () => {
      await openCoachStartupGate();
    });
    expect(calls("start_model_download")).toBe(0);

    await act(async () => {
      expect(startCoachModelDownload("standard")).toBe(true);
    });
    await waitFor(() => expect(calls("start_model_download")).toBe(1));
    expect(getCoachModelSnapshot().download?.phase).toBe("running");
    expect(getCoachModelSnapshot().download?.tier).toBe("standard");
  });

  it("the selector's download, once finished, is there to pick: the choice stays", async () => {
    setInvokeResponse("get_model_status", () => NOTHING_ON_DISK);
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());
    await act(async () => {
      await openCoachStartupGate();
      startCoachModelDownload("standard");
    });
    await act(async () => {
      fire("model-download-progress", { component: "brain", downloadedBytes: 0, totalBytes: 0, fraction: 0.5, done: false });
    });
    expect(getCoachModelSnapshot().download?.fraction).toBe(0.5);

    setInvokeResponse("get_model_status", () => STANDARD_ON_DISK);
    await act(async () => {
      fire("model-download-complete", { success: true, tier: "standard" });
    });
    await waitFor(() => expect(getCoachModelSnapshot().rows[0].state).toBe("onDisk"));
    expect(getCoachModelSnapshot().download).toBeNull();
    expect(result.current.coachBrainTier).toBe("off");
    expect(calls("load_coach_model")).toBe(0);
  });

  it("a download from Settings' tier buttons still makes that tier the choice", async () => {
    setInvokeResponse("get_model_status", () => NOTHING_ON_DISK);
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());
    await act(async () => {
      await result.current.handleStartDownload("standard");
    });
    setInvokeResponse("get_model_status", () => STANDARD_ON_DISK);
    await act(async () => {
      fire("model-download-complete", { success: true, tier: "standard" });
    });
    await waitFor(() => expect(result.current.coachBrainTier).toBe("standard"));
  });

  it("a cancelled download reads as paused where it stopped; a failed one keeps its reason", async () => {
    setInvokeResponse("get_model_status", () => NOTHING_ON_DISK);
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());
    await act(async () => {
      await openCoachStartupGate();
      startCoachModelDownload("full");
    });
    await act(async () => {
      fire("model-download-progress", { component: "brain", downloadedBytes: 0, totalBytes: 0, fraction: 0.3, done: false });
    });
    await act(async () => {
      fire("model-download-complete", { success: false, cancelled: true });
    });
    expect(getCoachModelSnapshot().download).toMatchObject({ tier: "full", phase: "paused", fraction: 0.3 });

    await act(async () => {
      startCoachModelDownload("full");
    });
    await act(async () => {
      fire("model-download-complete", { success: false, error: "curl exited with status 6" });
    });
    expect(getCoachModelSnapshot().download).toMatchObject({
      tier: "full",
      phase: "failed",
      error: "curl exited with status 6",
    });
  });

  it("Cancel asks Rust to discard this tier's bytes; the row then says they were removed (ms2)", async () => {
    setInvokeResponse("get_model_status", () => NOTHING_ON_DISK);
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());
    await act(async () => {
      await openCoachStartupGate();
      startCoachModelDownload("full");
    });
    await act(async () => {
      fire("model-download-progress", {
        component: "brain", downloadedBytes: 1_000_000_000, totalBytes: 5_027_783_488, fraction: 0.2, done: false, stage: "transfer",
      });
    });
    expect(getCoachModelSnapshot().download).toMatchObject({ phase: "running", downloadedBytes: 1_000_000_000 });
    await act(async () => {
      cancelCoachModelDownload("full");
    });
    const call = mockInvoke.mock.calls.find(([c]) => c === "cancel_model_download");
    expect(call?.[1]).toEqual({ discard: true, tier: "full", url: MODEL_URLS.full });
    await act(async () => {
      fire("model-download-complete", { success: false, cancelled: true, discarded: true });
    });
    expect(getCoachModelSnapshot().download).toMatchObject({ tier: "full", phase: "cancelled" });
  });

  it("a paused download kept from before is cancelled at once, by tier and URL (ms2)", async () => {
    const tiers = (partial: number) => [
      { tier: "standard", onDisk: false, sizeBytes: 0, family: null, updateRecommended: false, partialBytes: partial, downloadBytes: 2_497_280_256, checksumPinned: true },
      { tier: "full", onDisk: false, sizeBytes: 0, family: null, updateRecommended: false, partialBytes: 0, downloadBytes: 5_027_783_488, checksumPinned: true },
    ];
    let partial = 900_000_000;
    setInvokeResponse("get_model_status", () => ({ ...NOTHING_ON_DISK, tiers: tiers(partial), freeBytes: 100e9 }));
    const { result } = renderHook(() => useCoachDownload());
    await waitFor(() => expect(result.current.modelStatus).not.toBeNull());
    await act(async () => {
      await openCoachStartupGate();
    });
    expect(getCoachModelSnapshot().rows[0].download).toMatchObject({ phase: "paused", downloadedBytes: 900_000_000 });
    setInvokeResponse("cancel_model_download", () => {
      partial = 0;
      return undefined;
    });
    await act(async () => {
      cancelCoachModelDownload("standard");
    });
    await waitFor(() => expect(getCoachModelSnapshot().rows[0].download?.phase).toBe("cancelled"));
    const call = mockInvoke.mock.calls.find(([c]) => c === "cancel_model_download");
    expect(call?.[1]).toEqual({ discard: true, tier: "standard", url: MODEL_URLS.standard });
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
