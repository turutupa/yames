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
 *   - **Both tiers on disk, side by side** (leg ms2). Each tier has its own
 *     folder (`models/brain/<tier>/`, `models.rs`), so a download of one
 *     never touches the other, and the loader asks Rust for the chosen
 *     tier's file. A row on disk never offers Download: updating legacy
 *     weights stays Settings' "Update brain", deleting stays Settings'.
 *   - **Room on disk, and a cancel that discards.** A row whose download
 *     would not fit says so and offers none; one that would only just fit
 *     asks first. Pause keeps the bytes; Cancel removes them.
 *
 * Module-level state rather than a hook: residency is a property of the
 * process, not of a React tree, and two mounted components must not each
 * own their own idea of it. `useCoachModel` reads it.
 */
import { getCoachCapabilities, isCoachLoaded, loadCoachModel, unloadCoachModel } from "../ipc.desktop";
import type { ModelStatus } from "../ipc.desktop";
import type { BrainTier, ModelTier } from "../types";
import { IS_MOBILE } from "../platform";
import { partialBytes, tierOnDisk, tiersOnDisk, unplacedBrain } from "../coach/brainDisk";
import { coachSessionBusy, setCoachSessionBusy, subscribeCoachSessionBusy } from "./coachLoadGate";

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
 * Why a row reads "not on this device" or "not downloaded". `unplaced`: an
 * older backend reports a brain whose tier it cannot read, so where a new
 * download would land beside it is unknown and none is offered.
 */
export type CoachModelWhy = "phone" | "noLlm" | "update" | "unplaced";

/**
 * The model download, as the selector shows it. `paused` keeps the bytes
 * fetched so far (the next start resumes from them, after a restart too);
 * `cancelled` is a download the player stopped and whose bytes were removed.
 * `stage` is "checking" while the checksum is computed and "voices" once the
 * weights are adopted and the voice files follow. `fraction` and the bytes
 * are null until Rust has reported any.
 */
export type CoachModelDownload = {
  tier: ModelTier;
  phase: "running" | "paused" | "failed" | "cancelled";
  stage: "brain" | "checking" | "voices";
  fraction: number | null;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
  error: string | null;
  /** Why it failed, when Rust named it: no room, or a checksum mismatch. */
  code?: "space" | "checksum" | null;
};

/**
 * Room for a row's download on the models' volume. `short`: it does not fit
 * (with a margin for the voices), so no Download; `tight`: it fits with less
 * than half its size to spare, so Download asks first.
 */
export type CoachModelSpace = {
  state: "ok" | "tight" | "short";
  /** What the download still needs, the margin included. */
  needBytes: number;
  freeBytes: number;
};

export type CoachModelRow = {
  tier: ModelTier;
  /** What it is: the model's own name, never translated. */
  name: string;
  state: CoachModelRowState;
  why: CoachModelWhy | null;
  /** On disk when it is there; otherwise what the download weighs. */
  sizeBytes: number;
  /** This tier's download, running, paused, failed or cancelled; else null. */
  download: CoachModelDownload | null;
  /** Whether its row may offer Download (or Resume) now. */
  canDownload: boolean;
  /** Room for its download; null when on disk or when the volume cannot say. */
  space: CoachModelSpace | null;
  /**
   * Rust's RAM recommendation says no. Only a warning: the model stays
   * selectable, loadable and downloadable (a saved choice on a small machine
   * loaded before the selector, and still does). It decides no default here.
   */
  lowMemory: boolean;
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

/**
 * Room kept beyond the weights: the speech engine and the voices that follow
 * them (about 200 MB together) and a little air.
 */
export const COACH_DOWNLOAD_MARGIN_BYTES = 300_000_000;

/** Room for a download of `remaining` bytes, given `free` on the volume. */
export function downloadSpace(remaining: number, free: number | null | undefined): CoachModelSpace | null {
  if (free === null || free === undefined || !(free >= 0)) return null;
  const needBytes = remaining + COACH_DOWNLOAD_MARGIN_BYTES;
  const state = free < needBytes ? "short" : free < remaining * 1.5 ? "tight" : "ok";
  return { state, needBytes, freeBytes: free };
}

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
/** The weights the resident model was loaded from (`stampFor()`). */
let residentStamp: string | null = null;
let modelName: string | null = null;
let failure: { tier: ModelTier; stamp: string; reason: string | null } | null = null;
/** An unload on its way: nothing new loads until Rust has answered it. */
let unloading = false;
let download: CoachModelDownload | null = null;
type DownloadPort = {
  start: (tier: ModelTier) => void;
  pause: () => void;
  /** Stop `tier`'s download (running or paused) and remove its bytes. */
  cancel: (tier: ModelTier) => void;
};
let downloadPort: DownloadPort | null = null;
/**
 * Whether the saved choice has been read (or the player has picked). Until
 * then "off" is only the default, and nothing is unloaded for it.
 */
let choiceKnown = false;
/** The startup probe threw: what the build can do is unknown until it is asked again. */
let probeFailed = false;
let probing = false;
/**
 * A failed load whose follow-up question failed too: Rust may still hold
 * the previous model. Asked again (`isCoachLoaded`) before anything is decided.
 */
let residentUnknown = false;
let asking = false;
let inputWhileAsking = false;

/** The click sounding, or a Path Session in progress: no load starts. */
function holding(): boolean {
  return takeRunning || coachSessionBusy();
}

const listeners = new Set<() => void>();
let snapshot: CoachModelSnapshot = buildSnapshot();
// A Session ending (back to idle or at its recap) may let a held load start.
subscribeCoachSessionBusy(() => reconcile());

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
  const wasKnown = choiceKnown;
  choiceKnown = true;
  if (next === choice && wasKnown) return;
  choice = next;
  failure = null;
  // A pick is a press: a startup probe that failed is asked again.
  if (probeFailed) void probe();
  reconcile();
}

/**
 * The saved choice, read at startup (`useCoachDownload`); `undefined` when
 * nothing was saved or it could not be read. Either way the choice is now
 * known, and only from here may a reconcile unload anything.
 */
export function restoreCoachModelChoice(saved: BrainTier | undefined): void {
  choiceKnown = true;
  if ((saved === "off" || saved === "standard" || saved === "full") && saved !== choice) {
    choice = saved;
    failure = null;
  }
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
  // The click stopping is a moment to ask again after a failed probe.
  if (!running && probeFailed) void probe();
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
  await probe();
}

/**
 * The startup probe. A throw leaves the build's abilities unknown and the
 * chosen row "failed" with Retry; Retry, a pick or the click stopping asks
 * again. Never in a loop: only those presses and moments call it.
 */
async function probe(): Promise<void> {
  if (probing) return;
  probing = true;
  try {
    const [caps, loaded] = await Promise.all([getCoachCapabilities(), isCoachLoaded()]);
    llmCompiled = caps.llmCompiled;
    probeFailed = false;
    if (loaded && !resident && !inFlight) {
      resident = true;
      // With one tier on disk, that is what Rust holds. With both, which
      // one is not known: left unknown, the next reconcile asks for the
      // chosen one, which Rust does nothing for when it already holds it.
      const onDisk = tiersOnDisk(disk);
      residentTier = onDisk.length === 1 ? onDisk[0] : null;
      residentStamp = residentTier ? stampFor(residentTier) : null;
      modelName = caps.modelName;
    }
  } catch {
    probeFailed = true;
  }
  probing = false;
  reconcile();
}

/** Retry after a failure: the player's press. Still waits for a Take. */
export function retryCoachModel(): void {
  failure = null;
  if (probeFailed) {
    void probe();
    return;
  }
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
 * the row may not offer one: a download already running, the tier on disk,
 * not enough room, a machine or build that cannot run the model.
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

/**
 * Cancel: stop `tier`'s download, running or paused, and remove the bytes
 * fetched so far. Refused (false) when the row has nothing to cancel.
 */
export function cancelCoachModelDownload(tier: ModelTier): boolean {
  const own = snapshot.rows.find((r) => r.tier === tier)?.download;
  if (!downloadPort || !own || (own.phase !== "running" && own.phase !== "paused")) return false;
  downloadPort.cancel(tier);
  return true;
}

// ── The machine ──────────────────────────────────────────────────────

/** Which weights `tier` has on disk; new weights for it change this. */
function stampFor(tier: ModelTier): string {
  const t = tierOnDisk(disk, tier);
  return t ? `${tier}:${t.sizeBytes}:${t.family ?? ""}` : "none";
}

function recommended(tier: ModelTier): boolean {
  // Unknown is not "too small" (Rust's own rule, `models::recommendations`).
  if (!disk) return true;
  return tier === "full" ? disk.studioRecommended : disk.standardRecommended;
}

/**
 * This tier's download as the row shows it: the one running (or stopped)
 * in this session, else a paused one Rust kept on disk from before (a pause
 * survives a restart, so its bytes and Resume do too).
 */
function downloadOf(tier: ModelTier, onDisk: boolean, downloadBytes: number): CoachModelDownload | null {
  if (download?.tier === tier) return download;
  const kept = onDisk ? 0 : partialBytes(disk, tier);
  if (kept <= 0) return null;
  return {
    tier,
    phase: "paused",
    stage: "brain",
    fraction: Math.min(1, kept / downloadBytes),
    downloadedBytes: kept,
    totalBytes: downloadBytes,
    error: null,
    code: null,
  };
}

function rowFor(tier: ModelTier, name: string, downloadBytes: number): CoachModelRow {
  const t = tierOnDisk(disk, tier);
  const onDisk = t !== null;
  const sizeBytes = t ? t.sizeBytes || downloadBytes : downloadBytes;
  const own = downloadOf(tier, onDisk, downloadBytes);
  const space = onDisk
    ? null
    : downloadSpace(Math.max(0, downloadBytes - partialBytes(disk, tier)), disk?.freeBytes);
  const row = (state: CoachModelRowState, why: CoachModelWhy | null = null): CoachModelRow => ({
    tier,
    name,
    state,
    why,
    sizeBytes,
    download: own,
    // Rust runs one download at a time, so nothing is offered while one
    // runs; a paused, failed or cancelled one of this tier is taken up by
    // the same press. Only into this tier's own empty place on disk, and
    // only when it fits.
    canDownload:
      state === "notDownloaded" &&
      why === null &&
      disk !== null &&
      download?.phase !== "running" &&
      space?.state !== "short",
    space,
    lowMemory: !recommended(tier),
  });
  if (IS_MOBILE) return row("notOnThisDevice", "phone");
  if (llmCompiled === false) return row("notOnThisDevice", "noLlm");
  if (!t) return row("notDownloaded", unplacedBrain(disk) ? "unplaced" : null);
  if (t.updateRecommended) return row("notDownloaded", "update");
  if (resident && residentTier === tier && inFlightTier === null) return row("ready");
  if (inFlightTier === tier) return row("loading");
  if (failure?.tier === tier && failure.stamp === stampFor(tier)) return row("failed");
  // The startup probe failed: this build's abilities are unknown, so the
  // chosen model cannot be waiting for anything. It says so, with Retry.
  if (probeFailed && llmCompiled === null && choice === tier) return row("failed");
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
  const t = tierOnDisk(disk, tier);
  return !IS_MOBILE && llmCompiled === true && t !== null && !t.updateRecommended;
}

/**
 * Bring residency in line with the choice. Every input ends here, and so
 * does every load and unload when it returns, so a pick during a load, Off
 * during a load or a download landing mid-load is settled by the same code.
 */
function reconcile(): void {
  if (asking) {
    // An input while Rust is being asked is settled when the answer comes,
    // even if the answer is another throw.
    inputWhileAsking = true;
    emit();
    return;
  }
  if (IS_MOBILE || inFlight || unloading || probing) {
    emit();
    return;
  }
  const want = choice === "off" ? null : choice;
  const stamp = want ? stampFor(want) : "none";
  const failedHere = want !== null && failure?.tier === want && failure.stamp === stamp;

  if (residentUnknown) {
    // Rust may or may not hold a model. Off unloads either way (harmless if
    // nothing is there); anything else asks first.
    if (want === null && choiceKnown) {
      void unload();
      return;
    }
    void askResident();
    return;
  }

  if (resident) {
    const current = want !== null && residentTier === want && residentStamp === stamp;
    // Until the saved choice is read, "off" is only the default: nothing is
    // unloaded for it. Until the disk is read, only Off unloads.
    if (!current && choiceKnown) {
      if (want === null || (disk !== null && !loadable(want))) {
        void unload();
        return;
      }
      // Another model, or new weights for this one: Rust swaps them on its
      // own thread. Not while a Take or a Session runs, and not twice after a failure.
      if (gateOpen && !holding() && !failedHere) {
        void load(want, stamp);
        return;
      }
    }
    emit();
    return;
  }

  if (want !== null && gateOpen && !holding() && !failedHere && loadable(want)) {
    void load(want, stamp);
    return;
  }
  emit();
}

async function load(tier: ModelTier, stamp: string): Promise<void> {
  inFlightTier = tier;
  inFlight = loadCoachModel(tier).catch(() => false);
  emit();
  const ok = await inFlight;
  let reason: string | null = null;
  let stillResident: boolean | null = ok ? true : null;
  try {
    const caps = await getCoachCapabilities();
    stillResident = caps.modelResident;
    modelName = caps.modelName;
    reason = caps.loadError;
  } catch {
    // Keep what the load itself said; after a failure that is nothing.
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
    // knows which. If it could not be asked, nobody knows: the next
    // reconcile asks again before it decides anything.
    if (stillResident === null) {
      residentUnknown = true;
    } else {
      resident = stillResident;
      if (!resident) {
        residentTier = null;
        residentStamp = null;
      }
    }
    failure = { tier, stamp, reason };
  }
  reconcile();
}

/**
 * Residency was lost track of (a failed load, then a failed question):
 * ask Rust. If that throws too, it stays unknown until the next input,
 * never in a loop.
 */
async function askResident(): Promise<void> {
  asking = true;
  inputWhileAsking = false;
  emit();
  let answer: boolean | null = null;
  try {
    answer = await isCoachLoaded();
  } catch {
    // Still unknown.
  }
  asking = false;
  if (answer === null) {
    // No loop: only an input that arrived meanwhile is settled now (Off
    // unloads regardless; anything else asks once more).
    if (inputWhileAsking) {
      inputWhileAsking = false;
      reconcile();
    } else {
      emit();
    }
    return;
  }
  residentUnknown = false;
  resident = answer;
  // Which weights it holds is not known: not "current" for any choice, so
  // the next decision reloads (a no-op in Rust for the same file) or unloads.
  residentTier = null;
  residentStamp = null;
  reconcile();
}

async function unload(): Promise<void> {
  residentUnknown = false;
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
  choiceKnown = false;
  probeFailed = false;
  probing = false;
  residentUnknown = false;
  asking = false;
  inputWhileAsking = false;
  setCoachSessionBusy(false);
  listeners.clear();
  snapshot = buildSnapshot();
}
