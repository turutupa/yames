/**
 * Settings → Coach with both tiers on disk (ms2): each model is listed with
 * its own Remove, and removing one never touches the other. Deleting stays
 * here, the player's own press.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CoachSettingsSection } from "./CoachSettingsSection";
import type { ModelStatus } from "../../ipc.desktop";
import type { BrainTier } from "../../types";
import { mockInvoke, setInvokeResponse } from "../../test/mocks";

function status(onDisk: ("standard" | "full")[]): ModelStatus {
  const sizes = { standard: 2_497_280_256, full: 5_027_783_488 };
  return {
    brainReady: onDisk.length > 0,
    brainTier: onDisk[0] ?? null,
    brainFamily: onDisk.length ? "qwen3" : null,
    brainSizeBytes: onDisk.reduce((n, t) => n + sizes[t], 0),
    voiceReady: true,
    voiceSizeBytes: 0,
    studioRecommended: true,
    standardRecommended: true,
    brainUpdateRecommended: false,
    tiers: (["standard", "full"] as const).map((tier) => ({
      tier,
      onDisk: onDisk.includes(tier),
      sizeBytes: onDisk.includes(tier) ? sizes[tier] : 0,
      family: onDisk.includes(tier) ? "qwen3" : null,
      updateRecommended: false,
      partialBytes: 0,
      downloadBytes: sizes[tier],
      checksumPinned: true,
    })),
    freeBytes: 100e9,
  };
}

function renderSection(choice: BrainTier, disk: ModelStatus) {
  const setCoachBrainTier = vi.fn();
  const setModelStatus = vi.fn();
  render(
    <CoachSettingsSection
      coachBrainTier={choice}
      setCoachBrainTier={setCoachBrainTier}
      coachVoiceMode="silent"
      setCoachVoiceMode={vi.fn()}
      coachVoiceName="lessac"
      setCoachVoiceName={vi.fn()}
      coachVerbosity="default"
      setCoachVerbosity={vi.fn()}
      coachMode="default"
      setCoachMode={vi.fn()}
      coachStance="strict"
      setCoachStance={vi.fn()}
      modelStatus={disk}
      setModelStatus={setModelStatus}
      modelDownloading={false}
      studioAvailable
      standardAvailable
      brainUpdateAvailable={false}
      availableVoices={[]}
      voiceDiagnostics={[]}
      jamCues={false}
      setJamCues={vi.fn()}
      onStartDownload={vi.fn()}
      onRequestDownload={vi.fn()}
    />,
  );
  return { setCoachBrainTier, setModelStatus };
}

afterEach(() => cleanup());

describe("Settings → Coach, each model on disk on its own (ms2)", () => {
  it("lists both models with their own Remove, in the selector's units", () => {
    renderSection("standard", status(["standard", "full"]));
    const list = screen.getByTestId("coach-tier-list");
    expect(list.textContent).toContain("Standard · Qwen3 4B · 2.5 GB");
    expect(list.textContent).toContain("Studio · Qwen3 8B · 5.0 GB");
    expect(screen.getAllByRole("button", { name: /^Remove (Standard|Studio)/ })).toHaveLength(2);
  });

  it("removing the model not chosen removes only it, and the choice stays", async () => {
    setInvokeResponse("get_model_status", () => status(["standard"]));
    const { setCoachBrainTier, setModelStatus } = renderSection("standard", status(["standard", "full"]));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Remove Studio/ }));
    });
    await waitFor(() => expect(setModelStatus).toHaveBeenCalled());
    const deletes = mockInvoke.mock.calls.filter(([c]) => c === "delete_models");
    expect(deletes).toHaveLength(1);
    expect(deletes[0][1]).toEqual({ tier: "full" });
    expect(setCoachBrainTier).not.toHaveBeenCalled();
  });

  it("removing the chosen model turns the coach model Off", async () => {
    setInvokeResponse("get_model_status", () => status(["full"]));
    const { setCoachBrainTier } = renderSection("standard", status(["standard", "full"]));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Remove Standard/ }));
    });
    await waitFor(() => expect(setCoachBrainTier).toHaveBeenCalledWith("off"));
    const deletes = mockInvoke.mock.calls.filter(([c]) => c === "delete_models");
    expect(deletes[0][1]).toEqual({ tier: "standard" });
  });
});
