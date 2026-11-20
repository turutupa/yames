/**
 * The coach model's one owner (ms1): the player's choice, and the model's
 * life that follows it. Every transition of the state machine, the Take
 * that defers a load, a pick or Off during a load, a failure that never
 * loops, and the download rows of the selector.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetCoachLoaderForTests,
  coachLoadPending,
  coachResident,
  getCoachModelSnapshot,
  openCoachStartupGate,
  pauseCoachModelDownload,
  registerCoachDownloadPort,
  restoreCoachModelChoice,
  retryCoachModel,
  setCoachModelChoice,
  setCoachModelDisk,
  setCoachModelDownload,
  setCoachTakeRunning,
  startCoachModelDownload,
} from "./coachLoader";
import { setCoachSessionBusy } from "./coachLoadGate";
import type { ModelStatus } from "../ipc.desktop";
import type { ModelTier } from "../types";
import { mockInvoke, setInvokeResponse } from "../test/mocks";

const calls = (command: string) => mockInvoke.mock.calls.filter(([cmd]) => cmd === command).length;

function disk(over: Partial<ModelStatus> = {}): ModelStatus {
  return {
    brainReady: true,
    brainTier: "standard",
    brainFamily: "qwen3",
    brainSizeBytes: 2_497_280_256,
    voiceReady: true,
    voiceSizeBytes: 0,
    studioRecommended: true,
    standardRecommended: true,
    brainUpdateRecommended: false,
    ...over,
  } as ModelStatus;
}

const NOTHING_ON_DISK = disk({ brainReady: false, brainTier: null, brainFamily: null, brainSizeBytes: 0 });

function caps(over: Record<string, unknown> = {}) {
  return () => ({
    llmCompiled: true,
    modelResident: false,
    loading: false,
    backend: "vulkan",
    modelName: "Qwen3 4B",
    loadError: null,
    brainDownloaded: true,
    studioRecommended: true,
    standardRecommended: true,
    brainUpdateRecommended: false,
    ...over,
  });
}

/** A `load_coach_model` the test finishes by hand. */
function heldLoad() {
  let finish: (ok: boolean) => void = () => {};
  setInvokeResponse(
    "load_coach_model",
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  return (ok: boolean) => finish(ok);
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

const state = () => getCoachModelSnapshot().state;
const row = (tier: ModelTier) => getCoachModelSnapshot().rows.find((r) => r.tier === tier)!;

beforeEach(() => {
  __resetCoachLoaderForTests();
  setInvokeResponse("get_coach_capabilities", caps());
  setInvokeResponse("load_coach_model", () => true);
});

afterEach(() => {
  __resetCoachLoaderForTests();
});

describe("the choice and the model's life", () => {
  it("is off by default and loads nothing", async () => {
    setCoachModelDisk(disk(), 32_768);
    await openCoachStartupGate();
    await flush();
    expect(state()).toBe("off");
    expect(calls("load_coach_model")).toBe(0);
  });

  it("waits for the startup gate, then loads the chosen model once and keeps it", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    await flush();
    // Before first paint: chosen, on disk, not loading.
    expect(state()).toBe("waiting");
    expect(calls("load_coach_model")).toBe(0);

    const finish = heldLoad();
    await openCoachStartupGate();
    await flush();
    expect(state()).toBe("loading");
    expect(coachLoadPending()).toBe(true);
    finish(true);
    await flush();
    expect(state()).toBe("ready");
    expect(coachResident()).toBe(true);
    expect(calls("load_coach_model")).toBe(1);

    // Anything else that reconciles leaves it alone.
    setCoachModelDisk(disk(), 32_768);
    setCoachTakeRunning(true);
    setCoachTakeRunning(false);
    await flush();
    expect(calls("load_coach_model")).toBe(1);
    expect(calls("unload_coach_model")).toBe(0);
  });

  it("never starts a load while a Take runs: it waits for the Take to end", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    setCoachTakeRunning(true);
    await openCoachStartupGate();
    await flush();
    expect(state()).toBe("waiting");
    expect(calls("load_coach_model")).toBe(0);

    setCoachTakeRunning(false);
    await flush();
    expect(calls("load_coach_model")).toBe(1);
    expect(state()).toBe("ready");
  });

  it("lets a load already in flight run on when a Take starts", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    const finish = heldLoad();
    await openCoachStartupGate();
    await flush();
    setCoachTakeRunning(true);
    finish(true);
    await flush();
    expect(state()).toBe("ready");
    expect(calls("unload_coach_model")).toBe(0);
  });

  it("Off during a load unloads once the load returns, and deletes nothing", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    const finish = heldLoad();
    await openCoachStartupGate();
    await flush();
    setCoachModelChoice("off");
    await flush();
    // One call at a time: nothing is sent to Rust until the load answers.
    expect(calls("unload_coach_model")).toBe(0);
    finish(true);
    await flush();
    expect(calls("unload_coach_model")).toBe(1);
    expect(calls("delete_models")).toBe(0);
    expect(state()).toBe("off");
    expect(coachResident()).toBe(false);
  });

  it("a pick during a load is settled when the load returns", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    const finish = heldLoad();
    await openCoachStartupGate();
    await flush();
    // Off and back again while Rust is still loading: nothing to undo.
    setCoachModelChoice("off");
    setCoachModelChoice("standard");
    finish(true);
    await flush();
    expect(state()).toBe("ready");
    expect(calls("load_coach_model")).toBe(1);
    expect(calls("unload_coach_model")).toBe(0);
  });

  it("picking a model that is not on disk unloads the resident one rather than keep the wrong one", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(state()).toBe("ready");
    setCoachModelChoice("full");
    await flush();
    expect(calls("unload_coach_model")).toBe(1);
    expect(state()).toBe("notDownloaded");
  });

  it("a failed load says so and never loops; Retry tries once more", async () => {
    setInvokeResponse("load_coach_model", () => false);
    setInvokeResponse("get_coach_capabilities", caps({ loadError: "legacy weights" }));
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(state()).toBe("failed");
    expect(getCoachModelSnapshot().failure).toBe("legacy weights");
    expect(calls("load_coach_model")).toBe(1);

    // Every other input reconciles; none of them tries again.
    setCoachTakeRunning(true);
    setCoachTakeRunning(false);
    setCoachModelDisk(disk(), 32_768);
    await flush();
    expect(calls("load_coach_model")).toBe(1);

    setInvokeResponse("load_coach_model", () => true);
    retryCoachModel();
    await flush();
    expect(calls("load_coach_model")).toBe(2);
    expect(state()).toBe("ready");
  });

  it("a rejected load is a failure, not a crash", async () => {
    setInvokeResponse("load_coach_model", () => Promise.reject(new Error("boom")));
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(state()).toBe("failed");
    expect(coachLoadPending()).toBe(false);
  });

  it("adopts a model Rust already holds (a reloaded webview) without loading it again", async () => {
    setInvokeResponse("is_coach_loaded", () => true);
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(state()).toBe("ready");
    expect(calls("load_coach_model")).toBe(0);
  });

  it("does not drop a resident model before the disk has been read", async () => {
    setInvokeResponse("is_coach_loaded", () => true);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(calls("unload_coach_model")).toBe(0);
    expect(coachResident()).toBe(true);
  });
});

describe("what each row says", () => {
  it("too little memory is a warning, never a lock: the saved choice still loads (review 1)", async () => {
    // Before the selector a saved tier loaded whatever the RAM; it still must.
    setCoachModelDisk(disk({ standardRecommended: false, studioRecommended: false }), 4_096);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(row("standard").lowMemory).toBe(true);
    expect(row("standard").state).toBe("ready");
    expect(calls("load_coach_model")).toBe(1);
    // The other tier stays offered as what it is, not "not on this device".
    expect(row("full").state).toBe("notDownloaded");
    expect(row("full").lowMemory).toBe(true);
  });

  it("too little memory still lets a model download into an empty disk (review 1)", async () => {
    setCoachModelDisk(disk({ brainReady: false, brainTier: null, studioRecommended: false }), 8_192);
    await openCoachStartupGate();
    await flush();
    expect(row("full").canDownload).toBe(true);
    expect(row("full").lowMemory).toBe(true);
  });

  it("not on this device: only a build with no model support", async () => {
    setInvokeResponse("get_coach_capabilities", caps({ llmCompiled: false }));
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(row("standard").state).toBe("notOnThisDevice");
    expect(row("standard").why).toBe("noLlm");
    expect(calls("load_coach_model")).toBe(0);
  });

  it("names each model and its size", () => {
    setCoachModelDisk(NOTHING_ON_DISK, 32_768);
    expect(row("standard").name).toBe("Qwen3 4B");
    expect(row("standard").sizeBytes).toBe(2_497_280_256);
    expect(row("full").name).toBe("Qwen3 8B");
  });

  it("offers no Download for the tier the one place on disk is not holding", async () => {
    setCoachModelDisk(disk(), 32_768);
    await openCoachStartupGate();
    await flush();
    expect(row("standard").state).toBe("onDisk");
    expect(row("full").state).toBe("notDownloaded");
    expect(row("full").why).toBe("otherOnDisk");
    expect(row("full").canDownload).toBe(false);
  });

  it("legacy weights on disk are not overwritten from the selector (review 2)", async () => {
    setCoachModelDisk(disk({ brainFamily: null, brainUpdateRecommended: true }), 32_768);
    await openCoachStartupGate();
    await flush();
    // The same tier: the update is Settings' "Update brain", not a row button.
    expect(row("standard").why).toBe("update");
    expect(row("standard").canDownload).toBe(false);
    // The other tier would replace them: no Download.
    expect(row("full").why).toBe("otherOnDisk");
    expect(row("full").canDownload).toBe(false);
    const started: ModelTier[] = [];
    registerCoachDownloadPort({ start: (t) => started.push(t), pause: () => {} });
    expect(startCoachModelDownload("full")).toBe(false);
    expect(startCoachModelDownload("standard")).toBe(false);
    expect(started).toEqual([]);
  });

  it("a brain file whose tier is unreadable blocks both rows (review 2)", async () => {
    setCoachModelDisk(disk({ brainTier: null }), 32_768);
    await openCoachStartupGate();
    await flush();
    expect(row("standard").canDownload).toBe(false);
    expect(row("full").canDownload).toBe(false);
  });

  it("reports what the resident model takes beside the machine's memory", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    const snap = getCoachModelSnapshot();
    expect(snap.residentBytes).toBe(2_497_280_256);
    expect(snap.systemMemoryMb).toBe(32_768);
  });
});

describe("downloads in the selector", () => {
  function port() {
    const started: ModelTier[] = [];
    let paused = 0;
    registerCoachDownloadPort({
      start: (tier) => started.push(tier),
      pause: () => {
        paused++;
      },
    });
    return { started, paused: () => paused };
  }

  it("nothing downloads without a press: not at startup, not on a pick", async () => {
    const p = port();
    setCoachModelDisk(NOTHING_ON_DISK, 32_768);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(state()).toBe("notDownloaded");
    expect(p.started).toEqual([]);
    expect(calls("start_model_download")).toBe(0);
  });

  it("idle → running with progress → paused → resumed → finished and selectable", async () => {
    const p = port();
    setCoachModelDisk(NOTHING_ON_DISK, 32_768);
    await openCoachStartupGate();
    await flush();
    expect(row("standard").canDownload).toBe(true);

    expect(startCoachModelDownload("standard")).toBe(true);
    expect(p.started).toEqual(["standard"]);
    setCoachModelDownload({ tier: "standard", phase: "running", stage: "brain", fraction: 0.42, error: null });
    expect(row("standard").download?.fraction).toBe(0.42);
    expect(getCoachModelSnapshot().download?.phase).toBe("running");
    // One download at a time: the other row may not start one.
    expect(row("full").canDownload).toBe(false);
    expect(startCoachModelDownload("full")).toBe(false);

    pauseCoachModelDownload();
    expect(p.paused()).toBe(1);
    setCoachModelDownload({ tier: "standard", phase: "paused", stage: "brain", fraction: 0.42, error: null });
    expect(row("standard").canDownload).toBe(true);
    expect(startCoachModelDownload("standard")).toBe(true);
    expect(p.started).toEqual(["standard", "standard"]);

    // Finished: on disk, the download gone, the choice untouched.
    setCoachModelDownload(null);
    setCoachModelDisk(disk(), 32_768);
    await flush();
    expect(row("standard").state).toBe("onDisk");
    expect(getCoachModelSnapshot().choice).toBe("off");
    expect(calls("load_coach_model")).toBe(0);

    // Selecting it loads it as usual.
    setCoachModelChoice("standard");
    await flush();
    expect(state()).toBe("ready");
  });

  it("a failed download stays on its row and the same press tries again", async () => {
    const p = port();
    setCoachModelDisk(NOTHING_ON_DISK, 32_768);
    await openCoachStartupGate();
    await flush();
    setCoachModelDownload({ tier: "full", phase: "failed", stage: "brain", fraction: null, error: "curl exited" });
    expect(row("full").download?.error).toBe("curl exited");
    expect(row("full").canDownload).toBe(true);
    expect(startCoachModelDownload("full")).toBe(true);
    expect(p.started).toEqual(["full"]);
  });

  it("refuses a download where the row offers none", async () => {
    const p = port();
    setCoachModelDisk(disk({ studioRecommended: false }), 8_192);
    await openCoachStartupGate();
    await flush();
    expect(startCoachModelDownload("full")).toBe(false);
    expect(p.started).toEqual([]);
  });
});

describe("the reviewer's cases", () => {
  it("a failed startup probe reads as failed, and Retry asks again (review 3)", async () => {
    setInvokeResponse("get_coach_capabilities", () => Promise.reject(new Error("ipc down")));
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(state()).toBe("failed");
    expect(calls("load_coach_model")).toBe(0);

    setInvokeResponse("get_coach_capabilities", caps());
    retryCoachModel();
    await flush();
    expect(state()).toBe("ready");
    expect(calls("load_coach_model")).toBe(1);
  });

  it("a failed probe is asked again when the click stops, never in a loop (review 3)", async () => {
    let probes = 0;
    setInvokeResponse("get_coach_capabilities", () => {
      probes++;
      return Promise.reject(new Error("ipc down"));
    });
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(probes).toBe(1);
    await flush();
    expect(probes).toBe(1);

    setInvokeResponse("get_coach_capabilities", caps());
    setCoachTakeRunning(true);
    setCoachTakeRunning(false);
    await flush();
    expect(state()).toBe("ready");
  });

  it("nothing is unloaded before the saved choice is read (review 4)", async () => {
    // Rust already holds a model (a reloaded webview); the probes come back
    // before the store does.
    setInvokeResponse("is_coach_loaded", () => true);
    setCoachModelDisk(disk(), 32_768);
    await openCoachStartupGate();
    await flush();
    expect(coachResident()).toBe(true);
    expect(calls("unload_coach_model")).toBe(0);

    restoreCoachModelChoice("standard");
    await flush();
    expect(calls("unload_coach_model")).toBe(0);
    expect(coachResident()).toBe(true);
  });

  it("a saved Off read late still unloads, once it is known (review 4)", async () => {
    setInvokeResponse("is_coach_loaded", () => true);
    setCoachModelDisk(disk(), 32_768);
    await openCoachStartupGate();
    await flush();
    restoreCoachModelChoice("off");
    await flush();
    expect(calls("unload_coach_model")).toBe(1);
  });

  it("a failed load and a failed question: residency is asked again before Off decides (review 5)", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    await openCoachStartupGate();
    await flush();
    expect(state()).toBe("ready");

    // New weights land; their load fails and so does the question after it.
    setInvokeResponse("load_coach_model", () => false);
    setInvokeResponse("get_coach_capabilities", () => Promise.reject(new Error("ipc down")));
    setInvokeResponse("is_coach_loaded", () => Promise.reject(new Error("ipc down")));
    setCoachModelDisk(disk({ brainSizeBytes: 2_500_000_000 }), 32_768);
    await flush();
    expect(calls("load_coach_model")).toBe(2);

    // Rust still holds the old model. Off must reach it.
    setInvokeResponse("is_coach_loaded", () => true);
    setCoachModelChoice("off");
    await flush();
    expect(calls("unload_coach_model")).toBe(1);
    expect(coachResident()).toBe(false);
  });

  it("after a double failure, the next input asks Rust whether a model is there (review 5)", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    setInvokeResponse("load_coach_model", () => false);
    setInvokeResponse("get_coach_capabilities", caps());
    await openCoachStartupGate();
    await flush();
    setInvokeResponse("get_coach_capabilities", () => Promise.reject(new Error("ipc down")));
    setInvokeResponse("is_coach_loaded", () => true);
    retryCoachModel();
    await flush();
    // The retry failed and the question after it threw: Rust was asked
    // directly, and says a model is resident.
    expect(coachResident()).toBe(true);
  });

  it("no load starts while a Path Session is in progress, between Takes included (review 6)", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    setCoachSessionBusy(true);
    await openCoachStartupGate();
    await flush();
    expect(calls("load_coach_model")).toBe(0);
    expect(state()).toBe("waiting");
    // The click is stopped between Takes: still no load.
    setCoachTakeRunning(true);
    setCoachTakeRunning(false);
    await flush();
    expect(calls("load_coach_model")).toBe(0);

    setCoachSessionBusy(false);
    await flush();
    expect(calls("load_coach_model")).toBe(1);
  });

  it("a load already in flight runs on when a Session starts (review 6)", async () => {
    setCoachModelDisk(disk(), 32_768);
    setCoachModelChoice("standard");
    const finish = heldLoad();
    await openCoachStartupGate();
    await flush();
    setCoachSessionBusy(true);
    finish(true);
    await flush();
    expect(state()).toBe("ready");
  });
});
