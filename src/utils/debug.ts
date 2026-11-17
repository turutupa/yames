/**
 * Coach-pipeline diagnostic logger.
 *
 * Flip on at runtime by running this in DevTools and reloading:
 *   localStorage.setItem("coach.debug", "1")
 * (Disable: `localStorage.removeItem("coach.debug")`.)
 *
 * Off by default so logs don't ship in production builds. Useful when
 * diagnosing "the coach isn't saying anything" — every gate in the
 * pipeline (beat arrival, gatekeeper decision, mini-report
 * reportability, stale-guard discard, …) logs a one-liner here when
 * enabled.
 *
 * Lives in `src/utils/` rather than `src/coach/`: two of its callers are
 * not the coach at all (the drill ramp reconfigure and the preset loader
 * log their own step failures here), and `src/coach/*` is cut from the
 * mobile bundle, which a shared logger has no business being cut with.
 */
export function coachDebug(...args: unknown[]): void {
  try {
    if (
      typeof window !== "undefined" &&
      window.localStorage?.getItem("coach.debug") === "1"
    ) {
      // eslint-disable-next-line no-console
      console.log("[coach]", ...args);
    }
  } catch {
    // SSR / private mode / storage disabled — silently no-op.
  }
}
