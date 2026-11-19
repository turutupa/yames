/**
 * Tour lifecycle: which tour, which stop is showing, which screen has to be
 * visible for it, and the `tour.seenVersion` bookkeeping.
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
import { TOUR_SEEN_KEY, TOUR_VERSION, TOURS, type TourKind, type TourStop, type TourView } from "./stops";

/** Anywhere a tour can be opened from, and so has to put you back. */
type TourHome =
  | TourView
  | "setlist"
  | "jam"
  | "songs"
  | "today"
  | "paths"
  | "progress"
  | "session"
  | "tools";

export type UseTourArgs = {
  /**
   * Overridable per tour; defaults to `TOURS`. The shell passes the learning
   * tour without its Session stops when there is no plan to open one from.
   */
  tours?: Partial<Record<TourKind, TourStop[]>>;
  /** The tab showing right now ("settings" is never a tour stop's home). */
  /**
   * `setlist` and `jam` are here because the app has those tabs, not because
   * the tour visits them — there is no stop on either. They are accepted and
   * ignored, which is honest; coercing them to "beat" would make the tour
   * think it was on a screen it is not.
   */
  view: TourHome | "settings";
  /**
   * Wider than `TourView` on purpose. The tour's STOPS are only ever beat or
   * drill — there is no setlist or jam stop — but it has to be able to put you
   * back on the tab you opened it from, and that can be either.
   */
  setView: (view: TourHome) => void;
  /**
   * Whether this launch may offer the tour: anything but a first run with
   * the wizard still to come (O1's `migratedExistingUser` included). When
   * true and the learning tour's version has not been seen, `offerVisible`
   * turns on once.
   */
  offerWhen?: boolean;
};

export type UseTourResult = {
  isOpen: boolean;
  /** Which tour is running ("learn" while closed). */
  kind: TourKind;
  /** 0-based index of the current stop; -1 while closed. */
  index: number;
  stop: TourStop | null;
  stops: TourStop[];
  total: number;
  /**
   * Start `kind` (the learning tour unless asked) at stop 1. `restoreView`
   * overrides the tab the tour returns to — needed when the caller is leaving
   * Settings in the same tick and the hook would otherwise capture "settings".
   */
  open: (restoreView?: TourHome, kind?: TourKind) => void;
  /** End the tour; the learning tour records `tour.seenVersion`. */
  close: () => void;
  next: () => void;
  prev: () => void;
  /** Toast offering the learning tour, once, to a returning user. */
  offerVisible: boolean;
  acceptOffer: () => void;
  dismissOffer: () => void;
  /** Undefined until the store has been read. */
  seenVersion: number | undefined;
  hydrated: boolean;
};

export function useTour({
  tours,
  view,
  setView,
  offerWhen = false,
}: UseTourArgs): UseTourResult {
  const [index, setIndex] = useState(-1);
  const [kind, setKind] = useState<TourKind>("learn");
  const stops = tours?.[kind] ?? TOURS[kind];
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
  const restoreRef = useRef<TourHome | null>(null);

  const kindRef = useRef(kind);
  kindRef.current = kind;
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
  const open = useCallback((restoreView?: TourHome, which: TourKind = "learn") => {
    const current = viewRef.current;
    restoreRef.current =
      restoreView ?? (current === "settings" ? (which === "learn" ? "today" : "beat") : current);
    setOfferDismissed(true);
    kindRef.current = which;
    setKind(which);
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
    // Only the learning tour is versioned: walking the tools says nothing
    // about whether the player has seen Today, Paths and a Session.
    if (kindRef.current === "learn") markSeen();
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
  // `<`, not `!==`: a store written by a newer build (or the screenshots'
  // 99) is not a reason to offer an older tour.
  const offerVisible =
    offerWhen && hydrated && !offerDismissed && (seenVersion ?? 0) < TOUR_VERSION && !isOpen;

  const acceptOffer = useCallback(() => {
    setOfferDismissed(true);
    open(undefined, "learn");
  }, [open]);

  const dismissOffer = useCallback(() => {
    setOfferDismissed(true);
    // Declining counts as seen: the offer is one-time by design.
    markSeen();
  }, [markSeen]);

  return {
    isOpen,
    kind,
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
