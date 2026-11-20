import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CoachModelSelector } from "./CoachModelSelector";
import {
  __resetCoachLoaderForTests,
  openCoachStartupGate,
  registerCoachDownloadPort,
  setCoachModelChoice,
  setCoachModelDisk,
  setCoachModelDownload,
} from "../../hooks/coachLoader";
import type { ModelStatus } from "../../ipc.desktop";
import type { ModelTier } from "../../types";
import { setInvokeResponse } from "../../test/mocks";

const NOTHING_ON_DISK = {
  brainReady: false,
  brainTier: null,
  brainFamily: null,
  brainSizeBytes: 0,
  voiceReady: false,
  voiceSizeBytes: 0,
  studioRecommended: true,
  standardRecommended: true,
  brainUpdateRecommended: false,
} as ModelStatus;

const STANDARD_ON_DISK = {
  ...NOTHING_ON_DISK,
  brainReady: true,
  brainTier: "standard",
  brainFamily: "qwen3",
  brainSizeBytes: 2_497_280_256,
} as ModelStatus;

/** What an ms2 backend reports: each tier on its own, and the free space. */
function tiered(onDisk: ModelTier[], partial: Partial<Record<ModelTier, number>> = {}, freeBytes = 100e9): ModelStatus {
  const sizes: Record<ModelTier, number> = { standard: 2_497_280_256, full: 5_027_783_488 };
  return {
    ...NOTHING_ON_DISK,
    brainReady: onDisk.length > 0,
    brainTier: onDisk[0] ?? null,
    brainFamily: onDisk.length ? "qwen3" : null,
    tiers: (["standard", "full"] as const).map((tier) => ({
      tier,
      onDisk: onDisk.includes(tier),
      sizeBytes: onDisk.includes(tier) ? sizes[tier] : 0,
      family: onDisk.includes(tier) ? "qwen3" : null,
      updateRecommended: false,
      partialBytes: partial[tier] ?? 0,
      downloadBytes: sizes[tier],
      checksumPinned: true,
    })),
    freeBytes,
  };
}

let started: ModelTier[] = [];
let cancelled: ModelTier[] = [];
let paused = 0;

async function setup(disk: ModelStatus, choice: "off" | "standard" | "full" = "off") {
  setInvokeResponse("get_coach_capabilities", () => ({ llmCompiled: true, modelResident: false, modelName: null, loadError: null }));
  setInvokeResponse("load_coach_model", () => true);
  registerCoachDownloadPort({
    start: (tier) => started.push(tier),
    pause: () => {
      paused++;
    },
    cancel: (tier) => cancelled.push(tier),
  });
  setCoachModelDisk(disk, 32_768);
  setCoachModelChoice(choice);
  await act(async () => {
    await openCoachStartupGate();
  });
  render(<CoachModelSelector />);
  return screen.getByRole("button", { name: /Coach model:/ });
}

const items = () => Array.from(document.querySelectorAll<HTMLElement>("[data-mi]"));

beforeEach(() => {
  __resetCoachLoaderForTests();
  started = [];
  cancelled = [];
  paused = 0;
});
afterEach(() => {
  cleanup();
  __resetCoachLoaderForTests();
  delete (navigator as unknown as { connection?: unknown }).connection;
});

describe("CoachModelSelector", () => {
  it("names the choice and its state, and opens a menu of Off and the two models by name and size", async () => {
    const button = await setup(NOTHING_ON_DISK);
    expect(button.getAttribute("aria-label")).toBe("Coach model: Off, off");
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(button);
    const menu = screen.getByRole("menu");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(menu.id);
    expect(menu.textContent).toContain("Standard · Qwen3 4B · 2.5 GB");
    expect(menu.textContent).toContain("Studio · Qwen3 8B · 5.0 GB");
    expect(screen.getByRole("menuitemradio", { name: /Off/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("a model that is not downloaded has a Download button in its row, and the press is the only start", async () => {
    const button = await setup(NOTHING_ON_DISK);
    fireEvent.click(button);
    expect(started).toEqual([]);
    const download = screen.getByRole("menuitem", { name: /^Download: Standard/ });
    fireEvent.click(download);
    expect(started).toEqual(["standard"]);
  });

  it("shows a running download's progress and offers Pause, then Resume", async () => {
    const button = await setup(NOTHING_ON_DISK);
    act(() => {
      setCoachModelDownload({ tier: "standard", phase: "running", stage: "brain", fraction: 0.42, error: null });
    });
    // The button says so while the menu is closed.
    expect(button.getAttribute("aria-label")).toBe("Coach model: Off, downloading 42%");
    fireEvent.click(button);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
    // One download at a time: Studio offers none while Standard runs.
    expect(screen.queryByRole("menuitem", { name: /^Download: Studio/ })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: /^Pause: Standard/ }));
    expect(paused).toBe(1);
    act(() => {
      setCoachModelDownload({ tier: "standard", phase: "paused", stage: "brain", fraction: 0.42, error: null });
    });
    expect(screen.getByRole("menu").textContent).toContain("Paused at 42%");
    fireEvent.click(screen.getByRole("menuitem", { name: /^Resume: Standard/ }));
    expect(started).toEqual(["standard"]);
  });

  it("asks first on a metered connection", async () => {
    (navigator as unknown as { connection?: unknown }).connection = { type: "cellular" };
    const button = await setup(NOTHING_ON_DISK);
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Download: Standard/ }));
    expect(started).toEqual([]);
    expect(screen.getByRole("menu").textContent).toContain("mobile data");
    fireEvent.click(screen.getByRole("menuitem", { name: /^Download anyway: Standard/ }));
    expect(started).toEqual(["standard"]);
  });

  it("with one model on disk the other still offers its own Download: both can be there (ms2)", async () => {
    const button = await setup(STANDARD_ON_DISK);
    fireEvent.click(button);
    expect(screen.queryByRole("menuitem", { name: /^Download: Standard/ })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: /^Download: Studio/ }));
    expect(started).toEqual(["full"]);
  });

  it("with both on disk both are picked from the menu (ms2)", async () => {
    const button = await setup(tiered(["standard", "full"]));
    fireEvent.click(button);
    expect(screen.queryByRole("menuitem", { name: /^Download/ })).toBeNull();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Studio/ }));
    expect(button.getAttribute("aria-label")).toMatch(/^Coach model: Studio, /);
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Standard/ }));
    expect(button.getAttribute("aria-label")).toMatch(/^Coach model: Standard, /);
  });

  it("progress in bytes, Cancel beside Pause, then the check (ms2)", async () => {
    const button = await setup(tiered([]));
    act(() => {
      setCoachModelDownload({
        tier: "full", phase: "running", stage: "brain", fraction: 0.24,
        downloadedBytes: 1_234_000_000, totalBytes: 5_027_783_488, error: null,
      });
    });
    fireEvent.click(button);
    expect(screen.getByRole("menu").textContent).toContain("1.2 of 5.0 GB");
    fireEvent.click(screen.getByRole("menuitem", { name: /^Cancel: Studio/ }));
    expect(cancelled).toEqual(["full"]);
    act(() => {
      setCoachModelDownload({ tier: "full", phase: "running", stage: "checking", fraction: 0.5, error: null });
    });
    expect(button.getAttribute("aria-label")).toBe("Coach model: Off, checking the download");
    expect(screen.getByRole("menu").textContent).toContain("published checksum");
  });

  it("a paused download offers Resume and Cancel; a cancelled one says what was removed (ms2)", async () => {
    const button = await setup(tiered([], { full: 1_200_000_000 }));
    fireEvent.click(button);
    expect(screen.getByRole("menu").textContent).toContain("Paused at 1.2 of 5.0 GB");
    fireEvent.click(screen.getByRole("menuitem", { name: /^Cancel: Studio/ }));
    expect(cancelled).toEqual(["full"]);
    act(() => {
      setCoachModelDisk(tiered([]), 32_768);
      setCoachModelDownload({ tier: "full", phase: "cancelled", stage: "brain", fraction: null, error: null });
    });
    expect(screen.getByRole("menu").textContent).toContain("What had downloaded was removed");
    expect(screen.queryByRole("menuitem", { name: /^Cancel: Studio/ })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: /^Download: Studio/ }));
    expect(started).toEqual(["full"]);
  });

  it("a download that does not fit is not offered and says by how much; a tight one asks first (ms2)", async () => {
    const button = await setup(tiered([], {}, 3_100_000_000));
    fireEvent.click(button);
    expect(screen.queryByRole("menuitem", { name: /^Download: Studio/ })).toBeNull();
    expect(screen.getByRole("menu").textContent).toContain("Needs 5.3 GB, 3.1 GB free");
    fireEvent.click(screen.getByRole("menuitem", { name: /^Download: Standard/ }));
    expect(started).toEqual([]);
    expect(screen.getByRole("menu").textContent).toContain("Only 3.1 GB is free");
    fireEvent.click(screen.getByRole("menuitem", { name: /^Download anyway: Standard/ }));
    expect(started).toEqual(["standard"]);
  });

  it("a checksum mismatch says the file was removed and offers Try again (ms2)", async () => {
    const button = await setup(tiered([]));
    act(() => {
      setCoachModelDownload({ tier: "standard", phase: "failed", stage: "brain", fraction: null, error: "x", code: "checksum" });
    });
    fireEvent.click(button);
    expect(screen.getByRole("menu").textContent).toContain("didn't match its published checksum");
    fireEvent.click(screen.getByRole("menuitem", { name: /^Try again: Standard/ }));
    expect(started).toEqual(["standard"]);
  });

  it("arrow keys move, Enter picks, Esc closes and gives focus back", async () => {
    const button = await setup(STANDARD_ON_DISK);
    fireEvent.keyDown(button, { key: "ArrowDown" });
    const menu = screen.getByRole("menu");
    expect(document.activeElement).toBe(items()[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("data-tier")).toBe("standard");
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    // Wraps to the last item.
    expect(document.activeElement).toBe(items()[items().length - 1]);
    fireEvent.keyDown(menu, { key: "Home" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });
    // Picked: closed, focus back on the button, the choice is Standard.
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-label")).toMatch(/^Coach model: Standard, /);

    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("a build with no model support lists the models disabled, and says why", async () => {
    setInvokeResponse("get_coach_capabilities", () => ({ llmCompiled: false, modelResident: false, modelName: null, loadError: null }));
    setCoachModelDisk(STANDARD_ON_DISK, 32_768);
    setCoachModelChoice("off");
    await act(async () => {
      await openCoachStartupGate();
    });
    render(<CoachModelSelector />);
    const button = screen.getByRole("button", { name: /Coach model:/ });
    fireEvent.click(button);
    const standard = screen.getByRole("menuitemradio", { name: /Standard/ });
    expect(standard.getAttribute("aria-disabled")).toBe("true");
    expect(standard.textContent).toContain("this build can't run a model");
    fireEvent.click(standard);
    expect(button.getAttribute("aria-label")).toBe("Coach model: Off, off");
  });

  it("too little memory is a warning in the row; the model can still be picked (review 1)", async () => {
    const button = await setup({ ...STANDARD_ON_DISK, standardRecommended: false });
    fireEvent.click(button);
    const standard = screen.getByRole("menuitemradio", { name: /Standard/ });
    expect(standard.getAttribute("aria-disabled")).toBeNull();
    expect(standard.textContent).toContain("less memory than this model wants");
    fireEvent.click(standard);
    expect(button.getAttribute("aria-label")).toMatch(/^Coach model: Standard, /);
  });

  it("a row that is downloading says so, not \"Not downloaded\"", async () => {
    const button = await setup(NOTHING_ON_DISK);
    act(() => {
      setCoachModelDownload({ tier: "standard", phase: "running", stage: "brain", fraction: 0.42, error: null });
    });
    fireEvent.click(button);
    const row = document.querySelector('.coach-model-row[data-state="notDownloaded"]')!;
    expect(row.textContent).toContain("Downloading");
    expect(row.textContent).not.toContain("Not downloaded");
  });
});
