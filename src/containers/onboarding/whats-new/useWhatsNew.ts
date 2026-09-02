/**
 * Wires `whatsNew.ts`'s rules to the store: hydrate once, decide once, and
 * stamp `whatsNew.seenVersion` the moment the modal goes up — not when it is
 * dismissed, so a crash mid-read cannot resurrect it on the next launch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { storeLoad, storeSave } from "../../../ipc";
import {
  WHATS_NEW_NOTES_KEY,
  WHATS_NEW_SEEN_KEY,
  decideWhatsNew,
  notesForVersion,
  type PendingNotes,
} from "./whatsNew";

export type UseWhatsNewArgs = {
  /** From `useAppUpdates`; "0.0.0" until Tauri answers. */
  appVersion: string;
  /** O1's first-run case — the wizard is the introduction, not a changelog. */
  firstRun: boolean;
  /**
   * Hold the decision until the caller knows whether this is a first run.
   * `useOnboarding.hydrated` is the flag to pass.
   */
  ready: boolean;
};

export type UseWhatsNewResult = {
  /** The modal is on screen. */
  isOpen: boolean;
  /** Release body for `appVersion`, or null → the modal shows fallback copy. */
  notes: string | null;
  dismiss: () => void;
  /** Store has been read (tests and callers that gate rendering on it). */
  hydrated: boolean;
};

export function useWhatsNew({
  appVersion,
  firstRun,
  ready,
}: UseWhatsNewArgs): UseWhatsNewResult {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  /** The decision is one-shot per app run, whatever re-renders happen. */
  const decidedRef = useRef(false);

  useEffect(() => {
    if (!ready || decidedRef.current) return;
    if (!appVersion || appVersion === "0.0.0") return;
    decidedRef.current = true;

    let cancelled = false;
    (async () => {
      const [seen, pending] = await Promise.all([
        storeLoad<string>(WHATS_NEW_SEEN_KEY),
        storeLoad<PendingNotes>(WHATS_NEW_NOTES_KEY),
      ]);
      if (cancelled) return;

      const decision = decideWhatsNew({ appVersion, seenVersion: seen, firstRun });
      if (decision !== "skip") {
        // Stamp before showing: whether the user reads it, closes the window,
        // or the app dies, this version's notes are done.
        await storeSave(WHATS_NEW_SEEN_KEY, appVersion);
      }
      if (cancelled) return;
      if (decision === "show") {
        setNotes(notesForVersion(pending, appVersion));
        setIsOpen(true);
      }
      setHydrated(true);
    })().catch(() => {
      if (!cancelled) setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [ready, appVersion, firstRun]);

  const dismiss = useCallback(() => setIsOpen(false), []);

  return { isOpen, notes, dismiss, hydrated };
}
