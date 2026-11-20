/**
 * Recording session mode (card #109, `src-tauri/src/capture.rs`,
 * `plans/capture/FORMAT.md`). Practise for half an hour with it on and every
 * Take of the session is kept, raw input audio and what it was, for
 * `npm run corpus:ingest` on the DGX. Off by default, local only, and it does
 * not survive a restart: recording the microphone is something the player
 * turns on each time, never something an old setting does on its own.
 *
 * The cap (GB) is remembered on this machine.
 */
import {
  captureEnd,
  captureFreeBegin,
  captureFreeEnd,
  captureMark,
  captureReveal,
  captureSetContext,
  captureStart,
  captureStatus,
  captureZip,
  getCalibrationOffset,
  getState,
  listAudioInputDevices,
  listAudioOutputDevices,
  listCalibrationCache,
} from "../ipc";
import type { CaptureStatus } from "../ipc";

export const CAPTURE_CAP_KEY = "yames.recordingSession.capGb";
export const DEFAULT_CAP_GB = 10;
export const MIN_CAP_GB = 1;
export const MAX_CAP_GB = 200;
/** The key that flags the current or last Take as "felt off". */
export const MARK_KEY = "m";

export const IDLE_STATUS: CaptureStatus = {
  active: false,
  session: null,
  dir: null,
  takes: 0,
  bytes: 0,
  warnBytes: 5 * 1024 ** 3,
  capBytes: DEFAULT_CAP_GB * 1024 ** 3,
  warn: false,
  stopped: false,
};

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function clampCapGb(gb: number): number {
  if (!Number.isFinite(gb)) return DEFAULT_CAP_GB;
  return Math.min(MAX_CAP_GB, Math.max(MIN_CAP_GB, Math.round(gb)));
}

export function storedCapGb(): number {
  const raw = storage()?.getItem(CAPTURE_CAP_KEY);
  return raw ? clampCapGb(Number(raw)) : DEFAULT_CAP_GB;
}

export function storeCapGb(gb: number): number {
  const v = clampCapGb(gb);
  try {
    storage()?.setItem(CAPTURE_CAP_KEY, String(v));
  } catch {
    /* private mode */
  }
  return v;
}

// --- status, shared by the Settings row and the on-screen pill -------------

let current: CaptureStatus = IDLE_STATUS;
const listeners = new Set<(s: CaptureStatus) => void>();
let poll: ReturnType<typeof setInterval> | null = null;

export function captureNow(): CaptureStatus {
  return current;
}

function publish(s: CaptureStatus) {
  current = s;
  for (const l of listeners) l(s);
  if (s.active && !poll) poll = setInterval(() => void refreshCapture(), 5000);
  if (!s.active && poll) {
    clearInterval(poll);
    poll = null;
  }
}

export function onCapture(listener: (s: CaptureStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isStatus(s: unknown): s is CaptureStatus {
  return typeof s === "object" && s !== null && typeof (s as CaptureStatus).active === "boolean";
}

/** Ask the engine. Never throws: an engine that cannot say leaves things as they were. */
export async function refreshCapture(): Promise<CaptureStatus> {
  let s: unknown = current;
  try {
    s = await captureStatus();
  } catch {
    /* no engine (a test, the web build) */
  }
  if (isStatus(s)) publish(s);
  return current;
}

/** The app's own settings on this machine, for session.json: `yames.*` keys, long values cut. */
export function settingsSnapshot(store: Storage | null = storage()): Record<string, string> {
  const out: Record<string, string> = {};
  if (!store) return out;
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (!k || !k.startsWith("yames.")) continue;
    const v = store.getItem(k) ?? "";
    out[k] = v.length > 2000 ? `${v.slice(0, 2000)}…` : v;
  }
  return out;
}

async function rigMeta(): Promise<Record<string, unknown>> {
  const [state, inputs, outputs, offset, cache] = await Promise.all([
    getState().catch(() => null),
    listAudioInputDevices().catch(() => []),
    listAudioOutputDevices().catch(() => []),
    getCalibrationOffset().catch(() => null),
    listCalibrationCache().catch(() => []),
  ]);
  return {
    device: { state, inputs, outputs, userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "" },
    latency: { offsetMs: offset, cache },
    settings: settingsSnapshot(),
  };
}

/** Start a session (the start chirp plays) or end it (the end chirp). */
export async function setRecordingSession(on: boolean): Promise<CaptureStatus> {
  if (on) {
    const meta = await rigMeta();
    const r = await captureStart(meta, storedCapGb());
    if (isStatus(r?.status)) publish(r.status);
    return current;
  }
  await captureEnd();
  return refreshCapture();
}

/** "That one felt off". Resolves to whether it was noted. */
export async function markFeltOff(): Promise<boolean> {
  if (!current.active) return false;
  try {
    await captureMark();
    return true;
  } catch {
    return false;
  }
}

// --- what the Take is -------------------------------------------------------

export type TakeContext = {
  kind: "take" | "jam" | "freeplay";
  mode: "graded" | "ungraded";
  pathId?: string;
  stepId?: string;
  exerciseId?: string;
  variantSeed?: number | null;
  stepKind?: string;
  takeNumber?: string;
  bpm?: number;
  bars?: number;
  countInBars?: number;
  [k: string]: unknown;
};

/** Tell the engine what the next Take is; nothing when no session is on. */
export function setTakeContext(context: TakeContext | null): void {
  if (!current.active) return;
  void captureSetContext(context).catch(() => {});
}

export function beginFreeCapture(context: TakeContext): void {
  if (!current.active) return;
  void captureFreeBegin(context).catch(() => {});
}

export function endFreeCapture(heard: unknown): void {
  if (!current.active) return;
  void captureFreeEnd(heard).catch(() => {});
}

export function revealSession(): Promise<string> {
  return captureReveal();
}

export function zipSession(): Promise<string> {
  return captureZip();
}

/** "1.2 GB", "340 MB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
