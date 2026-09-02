/**
 * Tour lifecycle: which stop is showing, which tab has to be visible for it,
 * and the `tour.seenVersion` bookkeeping.
 *
 * Deliberately DOM-free — measuring the target and drawing the cut-out is
 * `Tour.tsx`'s job. What lives here is the part with rules worth testing:
 *
 *   - a stop can require a tab (stop 4 is the drill tab); the tour switches to
 *     it and puts the user back where they started when it ends, however it
 *     ends (Done, Skip, Esc);
 *   - `tour.seenVersion` is written exactly once per run, on finish *or*
 *     dismiss, so a tour that was walked away from is not offered forever;
 *   - existing users (O1's `migratedExistingUser`) are offered the tour once
 *     via a toast, and declining also counts as "seen".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { storeLoad, storeSave } from "../../../ipc";
import { TOUR_SEEN_KEY, TOUR_STOPS, TOUR_VERSION, type TourStop, type TourView } from "./stops";

export type UseTourArgs = {
  /** Overridable for tests; defaults to the six stops. */
  stops?: TourStop[];
  /** The tab showing right now ("settings" is never a tour stop's home). */
  view: TourView | "settings";
  setView: (view: TourView) => void;
  /**
   * O1's `migratedExistingUser`. When true and the tour has never been seen,
   * `offerVisible` turns on once.
   */
  offerWhen?: boolean;
};

export type UseTourResult = {
  isOpen: boolean;
  /** 0-based index of the current stop; -1 while closed. */
  index: number;
  stop: TourStop | null;
  stops: TourStop[];
  total: number;
  /**
   * Start at stop 1. `restoreView` overrides the tab the tour returns to —
   * needed when the caller is leaving Settings in the same tick and the hook
   * would otherwise capture "settings".
   */
  open: (restoreView?: TourView) => void;
  /** End the tour and record `tour.seenVersion`. */
  close: () => void;
  next: () => void;
  prev: () => void;
  /** Toast offering the tour to a migrated existing user. */
  offerVisible: boolean;
  acceptOffer: () => void;
  dismissOffer: () => void;
  /** Undefined until the store has been read. */
  seenVersion: number | undefined;
  hydrated: boolean;
};

export function useTour({
  stops = TOUR_STOPS,
  view,
  setView,
  offerWhen = false,
}: UseTourArgs): UseTourResult {
  const [index, setIndex] = useState(-1);
  const [seenVersion, setSeenVersion] = useState<number | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const [offerDismissed, setOfferDismissed] = useState(false);

  // `setView`'s identity changes whenever playback state does; keeping it in a
  // ref stops the tab-sync effect from re-running for unrelated reasons.
  const setViewRef = useRef(setView);
  setViewRef.current = setView;
  const viewRef = useRef(view);
  viewRef.current = view;
  /** Tab to return to when the tour ends. */
  const restoreRef = useRef<TourView | null>(null);

  const isOpen = index >= 0 && index < stops.length;
  const stop = isOpen ? stops[index] : null;
  const indexRef = useRef(index);
  indexRef.current = index;

  // --- seenVersion ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    storeLoad<number>(TOUR_SEEN_KEY)
      .then((v) => {
        if (cancelled) return;
        setSeenVersion(v);
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markSeen = useCallback(() => {
    setSeenVersion(TOUR_VERSION);
    storeSave(TOUR_SEEN_KEY, TOUR_VERSION).catch(() => {});
  }, []);

  // --- Lifecycle -----------------------------------------------------------
  const open = useCallback((restoreView?: TourView) => {
    const current = viewRef.current;
    restoreRef.current =
      restoreView ?? (current === "settings" ? "beat" : current);
    setOfferDismissed(true);
    indexRef.current = 0;
    setIndex(0);
  }, []);

  const close = useCallback(() => {
    if (indexRef.current < 0) return;
    indexRef.current = -1;
    setIndex(-1);
    // Put the user back on the tab they came from — the drill stop moved them,
    // and finishing a tour should never leave the app somewhere else.
    const back = restoreRef.current;
    restoreRef.current = null;
    if (back && viewRef.current !== back) setViewRef.current(back);
    markSeen();
  }, [markSeen]);

  const next = useCallback(() => {
    if (indexRef.current < 0) return;
    // Walking past the last stop is "Done".
    if (indexRef.current >= stops.length - 1) {
      close();
      return;
    }
    indexRef.current += 1;
    setIndex(indexRef.current);
  }, [stops.length, close]);

  const prev = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    setIndex(indexRef.current);
  }, []);

  // --- Tab sync ------------------------------------------------------------
  useEffect(() => {
    if (!stop) return;
    if (viewRef.current !== stop.view) setViewRef.current(stop.view);
  }, [stop]);

  // --- One-time offer for existing users -----------------------------------
  const offerVisible =
    offerWhen && hydrated && !offerDismissed && seenVersion !== TOUR_VERSION && !isOpen;

  const acceptOffer = useCallback(() => {
    setOfferDismissed(true);
    open();
  }, [open]);

  const dismissOffer = useCallback(() => {
    setOfferDismissed(true);
    // Declining counts as seen: the offer is one-time by design.
    markSeen();
  }, [markSeen]);

  return {
    isOpen,
    index,
    stop,
    stops,
    total: stops.length,
    open,
    close,
    next,
    prev,
    offerVisible,
    acceptOffer,
    dismissOffer,
    seenVersion,
    hydrated,
  };
}
