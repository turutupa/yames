/**
 * The one place the app asks "may I animate?".
 *
 * Two independent switches say no (ONBOARDING_PLAN §6, "Motion"):
 *
 *   1. the OS setting, `prefers-reduced-motion: reduce` — a accessibility
 *      preference we never override;
 *   2. the app's own `viewTransitions` preference (Settings → Appearance),
 *      whose "off" level already gates the view/zen transitions.
 *
 * Before O8 each animated surface re-implemented (1) with a one-shot
 * `window.matchMedia(...).matches` read at render or inside an effect, and
 * several of the onboarding surfaces (hint card, tour offer toast, finish-setup
 * chip) honoured neither switch from JS at all — they relied on a CSS media
 * query that covers (1) but not (2). This hook is the shared answer, and it is
 * *live*: flipping the OS setting while the app is open re-renders the
 * subscribers instead of waiting for a reload.
 */
import { useEffect, useState } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** A `matchMedia` result, or null in an environment without it (SSR, tests). */
function query(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY);
  } catch {
    return null;
  }
}

/** Snapshot read — for the rare caller that cannot use a hook. */
export function prefersReducedMotion(): boolean {
  return query()?.matches ?? false;
}

/**
 * True when animation should be suppressed.
 *
 * @param viewTransitions the app preference, when the caller has it. Only the
 *   literal `"off"` disables motion; every other level ("subtle", "expressive",
 *   undefined) leaves the decision to the OS setting.
 */
export function useReducedMotion(viewTransitions?: string): boolean {
  const [osReduced, setOsReduced] = useState<boolean>(() => prefersReducedMotion());

  useEffect(() => {
    const mql = query();
    if (!mql) return;
    // Re-read on mount: the initial state was computed before the subscription
    // existed, and tests swap the matchMedia stub between renders.
    setOsReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setOsReduced(e.matches);
    };
    // Safari < 14 only has the deprecated addListener/removeListener pair.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange as (e: MediaQueryListEvent) => void);
      return () =>
        mql.removeEventListener("change", onChange as (e: MediaQueryListEvent) => void);
    }
    if (typeof mql.addListener === "function") {
      mql.addListener(onChange as (e: MediaQueryListEvent) => void);
      return () => mql.removeListener(onChange as (e: MediaQueryListEvent) => void);
    }
    return;
  }, []);

  return osReduced || viewTransitions === "off";
}
