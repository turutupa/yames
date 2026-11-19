/**
 * "Keep my last Takes for troubleshooting" (detection roadmap, M3/M4
 * reproducibility; `plans/detection/MEASURE.md`). Off by default. With it on,
 * the engine writes each graded Take's input audio and what was expected of
 * it under the app's data folder (the last 20), for `detect-bench replay`.
 * Nothing is sent anywhere.
 *
 * The engine keeps the switch in memory only, so the choice lives here, on
 * this machine, and is handed to it at start-up (`main.tsx`).
 */
import { setTakeDiagnostics } from "../ipc";

export const KEEP_TAKES_KEY = "yames.keepTakesForTroubleshooting";

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function keepTakesStored(): boolean {
  return storage()?.getItem(KEEP_TAKES_KEY) === "1";
}

/** Store the choice and tell the engine. Resolves to the folder when on. */
export async function setKeepTakes(on: boolean): Promise<string | null> {
  const s = storage();
  try {
    if (on) s?.setItem(KEEP_TAKES_KEY, "1");
    else s?.removeItem(KEEP_TAKES_KEY);
  } catch {
    /* private mode: the engine still gets it for this run */
  }
  return setTakeDiagnostics(on);
}

/** At start-up: hand a stored "on" to the engine. Never throws. */
export async function applyStoredKeepTakes(): Promise<void> {
  if (!keepTakesStored()) return;
  await setTakeDiagnostics(true).catch(() => null);
}
