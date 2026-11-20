/**
 * The one owner of the coach model's life (the model selector, owner
 * decision 2026-11-20).
 *
 * The player picks Off, a local model, or (later) Cloud. The choice is the
 * `coachBrainTier` setting, held here and nowhere else; a chosen local model
 * is loaded once after startup, in the background, and stays loaded across
 * the whole app until the player picks Off or another model. Sessions do not
 * load, unload or arm anything any more, and there is no idle unload.
 *
 * The rules this module keeps:
 *
 *   - **Never before the gate.** Nothing loads until `openCoachStartupGate()`
 *     has run, which `useCoachModelDriver` calls after the first paint, when
 *     the browser says it is idle. First paint never waits for a model.
 *   - **Never starting while a Take runs.** `setCoachTakeRunning(true)` holds
 *     every new load until the click stops. A load already in flight when a
 *     Take starts runs on: llama.cpp cannot be interrupted mid-load (PLAN,
 *     "Things the orchestrator decided" 4).
 *   - **One load at a time.** `load_coach_model` is idempotent in Rust (same
 *     path + size + mtime → no reload; a changed file → the worker swaps
 *     the weights on its own thread), and this side never has two calls in
 *     flight: a pick during a load is reconciled when the load returns.
 *   - **A failure never loops.** A load that fails is remembered against the
 *     tier and the weights it tried; it is tried again only on Retry, on a
 *     new pick, or when different weights land on disk.
 *   - **Off unloads, never deletes.** The weights stay in `models/brain/`.
 *   - **Downloads are the player's press.** The selector's Download button
 *     runs the same download Settings runs, through the port
 *     `useCoachDownload` registers here; nothing in this module starts one,
 *     and a download never changes the choice from the selector.
 *   - **One brain on disk.** Both tiers download to the same
 *     `models/brain/model.bin` (`models.rs`), so while one tier is on disk
 *     the other's row offers no Download: it would replace the first
 *     without a word. Settings → Coach still switches (it asks first);
 *     two side by side is leg ms2.
 *
 * Module-level state rather than a hook: residency is a property of the
 * process, not of a React tree, and two mounted components must not each
 * own their own idea of it. `useCoachModel` reads it.
 */
import { getCoachCapabilities, isCoachLoaded, loadCoachModel, unloadCoachModel } from "../ipc.desktop";
import type { ModelStatus } from "../ipc.desktop";
import type { BrainTier, ModelTier } from "../types";
import { IS_MOBILE } from "../platform";

/** What the selector says about the player's choice. */
export type CoachModelState =
  | "off"
  | "notDownloaded"
  | "notOnThisDevice"
  | "waiting"
  | "loading"
  | "ready"
  | "failed";

/**
 * One local model's own truth, for its row in the menu. `onDisk` is a model
 * that is downloaded and could be loaded but is not the one chosen.
 */
export type CoachModelRowState = Exclude<CoachModelState, "off"> | "onDisk";

/**
 * Why a row reads "not on this device" or "not downloaded". `otherOnDisk`:
 * the other tier holds the one place on disk (see the header).
 */
export type CoachModelWhy = "phone" | "noLlm" | "ram" | "update" | "otherOnDisk";

/**
 * The model download, as the selector shows it. `paused` is Rust's cancel,
 * which keeps the bytes fetched so far; the next start resumes from them.
 * `stage` is "voices" once the weights are down and the voice files follow.
 * `fraction` is null until Rust has reported any.
 */
export type CoachModelDownload = {
  tier: ModelTier;
  phase: "running" | "paused" | "failed";
  stage: "brain" | "voices";
  fraction: number | null;
  error: string | null;
};

export type CoachModelRow = {
  tier: ModelTier;
  /** What it is: the model's own name, never translated. */
  name: string;
  state: CoachModelRowState;
  why: CoachModelWhy | null;
  /** On disk when it is there; otherwise what the download weighs. */
  sizeBytes: number;
  /** This tier's download, running, paused or failed; else null. */
  download: CoachModelDownload | null;
  /** Whether its row may offer Download (or Resume) now. */
  canDownload: boolean;
};

/**
 * Where Cloud will go. Hidden until it exists (PLAN, "Not in this plan"):
 * the type has room for it and nothing ever sets it.
 */
export type CoachCloudEntry = null;

export type CoachModelSnapshot = {
  choice: BrainTier;
  state: CoachModelState;
  rows: readonly CoachModelRow[];
  cloud: CoachCloudEntry;
  /** Rust's reason for the last failed load of the chosen model. */
  failure: string | null;
  /**
   * What the loaded model takes, as an honest lower bound: its size on disk.
   * Rust reports nothing finer. Null when nothing is resident.
   */
  residentBytes: number | null;
  /** The machine's memory, or null when unknown. */
  systemMemoryMb: number | null;
  /** The resident model's name from its GGUF metadata. */
  modelName: string | null;
  /** The model download, whichever tier it is for, or null. */
  download: CoachModelDownload | null;
};

/**
 * The two local tiers, named by what they are. The sizes are the published
 * GGUF files (`useCoachDownload.ts` MODEL_URLS; `models.rs` floors), shown
 * until a tier is on disk and its real size is known.
 */
export const COACH_MODEL_TIERS: readonly { tier: ModelTier; name: string; downloadBytes: number }[] = [
  { tier: "standard", name: "Qwen3 4B", downloadBytes: 2_497_280_256 },
  { tier: "full", name: "Qwen3 8B", downloadBytes: 5_027_783_488 },
];

// ── State ────────────────────────────────────────────────────────────

let choice: BrainTier = "off";
let disk: ModelStatus | null = null;
let systemMemoryMb: number | null = null;
/** From `get_coach_capabilities`; null until the gate has asked. */
let llmCompiled: boolean | null = null;
let gateOpen = false;
let takeRunning = false;

/** The in-flight `load_coach_model` call, if one is running. */
let inFlight: Promise<boolean> | null = null;
let inFlightTier: ModelTier | null = null;
/** Whether a model is resident, as far as this side knows. */
let resident = false;
let residentTier: ModelTier | null = null;
/** The weights the resident model was loaded from (`diskStamp()`). */
let residentStamp: string | null = null;
let modelName: string | null = null;
let failure: { tier: ModelTier; stamp: string; reason: string | null } | null = null;
/** An unload on its way: nothing new loads until Rust has answered it. */
let unloading = false;
let download: CoachModelDownload | null = null;
type DownloadPort = { start: (tier: ModelTier) => void; pause: () => void };
let downloadPort: DownloadPort | null = null;

const listeners = new Set<() => void>();
let snapshot: CoachModelSnapshot = buildSnapshot();

// ── Reading ──────────────────────────────────────────────────────────

/** True while a load is running. */
export function coachLoadPending(): boolean {
  return inFlight !== null;
}

/** True when a model is resident and nothing has unloaded it since. */
export function coachResident(): boolean {
  return resident;
}

export function getCoachModelSnapshot(): CoachModelSnapshot {
  return snapshot;
}

export function subscribeCoachModel(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── Inputs ───────────────────────────────────────────────────────────

/**
 * The player's choice: the restored `coachBrainTier`, a pick in the
 * selector, or Settings' tier buttons. A new pick clears a remembered
 * failure: picking is a press, and a press may try again.
 */
export function setCoachModelChoice(next: BrainTier): void {
  if (next === choice) return;
  choice = next;
  failure = null;
  reconcile();
}

/** What is on disk and how big the machine is (`useCoachDownload`). */
export function setCoachModelDisk(status: ModelStatus | null, memoryMb: number | null): void {
  disk = status;
  systemMemoryMb = memoryMb && memoryMb > 0 ? memoryMb : null;
  reconcile();
}

/** The click is running: no load starts until it stops. */
export function setCoachTakeRunning(running: boolean): void {
  if (running === takeRunning) return;
  takeRunning = running;
  reconcile();
}

/**
 * After first paint, once the app is idle: ask Rust what this build can do
 * and whether a model is already resident (a reloaded webview keeps the
 * Rust side's), then load the chosen model if it may be.
 */
export async function openCoachStartupGate(): Promise<void> {
  if (gateOpen || IS_MOBILE) return;
  gateOpen = true;
  try {
    const [caps, loaded] = await Promise.all([getCoachCapabilities(), isCoachLoaded()]);
    llmCompiled = caps.llmCompiled;
    if (loaded && !resident && !inFlight) {
      resident = true;
      residentTier = diskTier();
      residentStamp = diskStamp();
      modelName = caps.modelName;
    }
  } catch {
    // Unknown stays unknown: nothing is claimed and nothing loads.
  }
  reconcile();
}

/** Retry after a failure: the player's press. Still waits for a Take. */
export function retryCoachModel(): void {
  failure = null;
  reconcile();
}

// ── Downloads (the player's press only) ──────────────────────────────

/** Where the download stands (`useCoachDownload`, which runs it). */
export function setCoachModelDownload(next: CoachModelDownload | null): void {
  download = next;
  emit();
}

/** `useCoachDownload` hands over its start and pause; returns the undo. */
export function registerCoachDownloadPort(port: DownloadPort): () => void {
  downloadPort = port;
  return () => {
    if (downloadPort === port) downloadPort = null;
  };
}

/**
 * The selector's Download (or Resume) press. Refused, returning false, when
 * the row may not offer one: a download already running, the other tier on
 * disk, a machine or build that cannot run the model.
 */
export function startCoachModelDownload(tier: ModelTier): boolean {
  const row = snapshot.rows.find((r) => r.tier === tier);
  if (!downloadPort || !row?.canDownload) return false;
  downloadPort.start(tier);
  return true;
}

/** Pause: Rust stops curl and keeps the bytes; Resume picks them up. */
export function pauseCoachModelDownload(): void {
  if (download?.phase === "running") downloadPort?.pause();
}

// ── The machine ──────────────────────────────────────────────────────

function diskTier(): ModelTier | null {
  if (!disk?.brainReady) return null;
  const t = disk.brainTier?.trim();
  return t === "standard" || t === "full" ? t : null;
}

/** Which weights are on disk; a download that replaces them changes it. */
function diskStamp(): string {
  return disk?.brainReady
    ? `${diskTier()}:${disk.brainSizeBytes}:${disk.brainFamily ?? ""}`
    : "none";
}

function recommended(tier: ModelTier): boolean {
  // Unknown is not "too small" (Rust's own rule, `models::recommendations`).
  if (!disk) return true;
  return tier === "full" ? disk.studioRecommended : disk.standardRecommended;
}

/**
 * The other tier holds the one place on disk, with weights that load: a
 * download of this one would replace them without a word. Legacy weights
 * (an update is recommended) load nothing, so they block nothing.
 */
function otherOnDisk(tier: ModelTier): boolean {
  return !!disk?.brainReady && diskTier() !== tier && !disk.brainUpdateRecommended;
}

function rowFor(tier: ModelTier, name: string, downloadBytes: number): CoachModelRow {
  const onDisk = diskTier() === tier;
  const sizeBytes = onDisk && disk ? disk.brainSizeBytes || downloadBytes : downloadBytes;
  const own = download?.tier === tier ? download : null;
  const row = (state: CoachModelRowState, why: CoachModelWhy | null = null): CoachModelRow => ({
    tier,
    name,
    state,
    why,
    sizeBytes,
    download: own,
    // Rust runs one download at a time; a paused or failed one of this
    // tier is resumed by the same press.
    canDownload:
      state === "notDownloaded" &&
      why !== "otherOnDisk" &&
      disk !== null &&
      (download === null || (own !== null && own.phase !== "running")),
  });
  if (IS_MOBILE) return row("notOnThisDevice", "phone");
  if (llmCompiled === false) return row("notOnThisDevice", "noLlm");
  if (!recommended(tier)) return row("notOnThisDevice", "ram");
  if (!onDisk) return row("notDownloaded", otherOnDisk(tier) ? "otherOnDisk" : null);
  if (disk?.brainUpdateRecommended) return row("notDownloaded", "update");
  if (resident && residentTier === tier && inFlightTier === null) return row("ready");
  if (inFlightTier === tier) return row("loading");
  if (failure?.tier === tier && failure.stamp === diskStamp()) return row("failed");
  return row(choice === tier ? "waiting" : "onDisk");
}

function buildSnapshot(): CoachModelSnapshot {
  const rows = COACH_MODEL_TIERS.map((t) => rowFor(t.tier, t.name, t.downloadBytes));
  const chosen = rows.find((r) => r.tier === choice);
  const state: CoachModelState = !chosen
    ? "off"
    : chosen.state === "onDisk"
      ? "waiting"
      : chosen.state;
  const residentRow = resident ? rows.find((r) => r.tier === residentTier) : undefined;
  return {
    choice,
    state,
    rows,
    cloud: null,
    failure: state === "failed" ? (failure?.reason ?? null) : null,
    residentBytes: residentRow ? residentRow.sizeBytes : null,
    systemMemoryMb,
    modelName: resident ? modelName : null,
    download,
  };
}

function emit(): void {
  snapshot = buildSnapshot();
  for (const listener of [...listeners]) listener();
}

/** May `tier` be loaded at all (not: may it be loaded now)? */
function loadable(tier: ModelTier): boolean {
  return (
    !IS_MOBILE &&
    llmCompiled === true &&
    recommended(tier) &&
    diskTier() === tier &&
    !disk?.brainUpdateRecommended
  );
}

/**
 * Bring residency in line with the choice. Every input ends here, and so
 * does every load and unload when it returns, so a pick during a load, Off
 * during a load or a download landing mid-load is settled by the same code.
 */
function reconcile(): void {
  if (IS_MOBILE || inFlight || unloading) {
    emit();
    return;
  }
  const want = choice === "off" ? null : choice;
  const stamp = diskStamp();
  const failedHere = want !== null && failure?.tier === want && failure.stamp === stamp;

  if (resident) {
    const current = want !== null && residentTier === want && residentStamp === stamp;
    if (!current) {
      // Until the disk has been read, only Off unloads: an unknown is not
      // a reason to drop a model that is answering.
      if (want === null || (disk !== null && !loadable(want))) {
        void unload();
        return;
      }
      // Another model, or new weights for this one: Rust swaps them on its
      // own thread. Not while a Take runs, and not twice after a failure.
      if (gateOpen && !takeRunning && !failedHere) {
        void load(want, stamp);
        return;
      }
    }
    emit();
    return;
  }

  if (want !== null && gateOpen && !takeRunning && !failedHere && loadable(want)) {
    void load(want, stamp);
    return;
  }
  emit();
}

async function load(tier: ModelTier, stamp: string): Promise<void> {
  inFlightTier = tier;
  inFlight = loadCoachModel().catch(() => false);
  emit();
  const ok = await inFlight;
  let reason: string | null = null;
  let stillResident = ok;
  try {
    const caps = await getCoachCapabilities();
    stillResident = caps.modelResident;
    modelName = caps.modelName;
    reason = caps.loadError;
  } catch {
    // Keep what the load itself said.
  }
  inFlight = null;
  inFlightTier = null;
  if (ok) {
    resident = true;
    residentTier = tier;
    residentStamp = stamp;
    failure = null;
  } else {
    // A refusal may leave the previous model in place, or none at all; Rust
    // knows which.
    resident = stillResident;
    if (!resident) {
      residentTier = null;
      residentStamp = null;
    }
    failure = { tier, stamp, reason };
  }
  reconcile();
}

async function unload(): Promise<void> {
  resident = false;
  residentTier = null;
  residentStamp = null;
  modelName = null;
  unloading = true;
  emit();
  try {
    await unloadCoachModel();
  } catch {
    // Nothing to unload, or the backend is already gone. Either way the
    // frontend's view is "not resident", which is what matters here.
  }
  unloading = false;
  // A pick made while Rust was unloading is settled now, in order.
  reconcile();
}

/** Test seam — drops all module state without touching the backend. */
export function __resetCoachLoaderForTests(): void {
  choice = "off";
  disk = null;
  systemMemoryMb = null;
  llmCompiled = null;
  gateOpen = false;
  takeRunning = false;
  inFlight = null;
  inFlightTier = null;
  resident = false;
  residentTier = null;
  residentStamp = null;
  modelName = null;
  failure = null;
  unloading = false;
  download = null;
  downloadPort = null;
  listeners.clear();
  snapshot = buildSnapshot();
}
