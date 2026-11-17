import { useCallback, useEffect, useRef, useState } from "react";
import { storeLoad, storeSave } from "../ipc";
import { BETA_PROMPTED_AT_KEY, dayIsUp } from "./feed";

export interface BetaPrompt {
  /** Show the "test build X is ready" notice now. */
  show: boolean;
  dismiss: () => void;
}

export const NO_BETA_PROMPT: BetaPrompt = Object.freeze({ show: false, dismiss: () => {} });

/**
 * At most once a day, the test build says a newer one is ready — a pill under
 * the header, never a dialog, and never while the click runs (it waits for
 * the stop). Dismissed or not, the next one is tomorrow; About and the
 * Settings banner still offer the update all day.
 *
 * `available` is the channel's own answer: the desktop updater's status, or
 * the Android feed's.
 */
export function useBetaPrompt({
  available,
  isPlaying,
}: {
  available: boolean;
  isPlaying: boolean;
}): BetaPrompt {
  const [show, setShow] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (!available || isPlaying || decided.current) return;
    decided.current = true;
    let live = true;
    (async () => {
      const at = await storeLoad<number>(BETA_PROMPTED_AT_KEY);
      if (!live || !dayIsUp(at, Date.now())) return;
      await storeSave(BETA_PROMPTED_AT_KEY, Date.now());
      if (live) setShow(true);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [available, isPlaying]);

  // Gone the moment there is nothing to offer (installed, or the playing
  // started — the pill is not for the middle of a Take).
  useEffect(() => {
    if (!available || isPlaying) setShow(false);
  }, [available, isPlaying]);

  const dismiss = useCallback(() => setShow(false), []);
  return { show, dismiss };
}
