import { useEffect, useSyncExternalStore } from "react";
import { storeSave } from "../ipc";
import type { BrainTier } from "../types";
import { IS_MOBILE } from "../platform";
import {
  getCoachModelSnapshot,
  openCoachStartupGate,
  retryCoachModel,
  setCoachModelChoice,
  setCoachTakeRunning,
  subscribeCoachModel,
} from "./coachLoader";
import type { CoachModelSnapshot } from "./coachLoader";

/**
 * The coach model, for the UI: the player's choice, its state and every
 * local model's own truth (`hooks/coachLoader.ts` owns all of it).
 *
 * On a phone there is no local model: the snapshot's rows all read "not on
 * this device", and nothing is shown for it.
 */
export function useCoachModel(): CoachModelSnapshot {
  return useSyncExternalStore(subscribeCoachModel, getCoachModelSnapshot, getCoachModelSnapshot);
}

/**
 * The player's pick, from the selector: the choice and its setting in one
 * step, the same pair Settings' tier buttons write.
 */
export function chooseCoachModel(tier: BrainTier): void {
  setCoachModelChoice(tier);
  void storeSave("coachBrainTier", tier);
}

export { retryCoachModel };

/** How long the startup gate waits for an idle moment, at most. */
export const COACH_GATE_IDLE_TIMEOUT_MS = 5_000;
/** Where the webview has no `requestIdleCallback` (WebKit): after first paint, this long. */
export const COACH_GATE_FALLBACK_MS = 1_500;

/**
 * Drives the loader from the app shell: opens its startup gate after the
 * first paint, when the app is idle, and tells it whether the click is
 * running. `playing` is the metronome's own flag: every Take plays the
 * click, so "never start a load while a Take runs" is kept by never starting
 * one while anything plays. Mounted once, in `MainWindow`.
 */
export function useCoachModelDriver(playing: boolean): void {
  useEffect(() => {
    setCoachTakeRunning(playing);
  }, [playing]);

  useEffect(() => {
    if (IS_MOBILE) return;
    let idle: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // An effect runs after the commit; the frame after it is the first one
    // painted. Only then is the idle moment looked for.
    const frame = requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(() => void openCoachStartupGate(), {
          timeout: COACH_GATE_IDLE_TIMEOUT_MS,
        });
      } else {
        timer = setTimeout(() => void openCoachStartupGate(), COACH_GATE_FALLBACK_MS);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      if (idle !== null) window.cancelIdleCallback(idle);
      if (timer !== null) clearTimeout(timer);
    };
  }, []);
}
