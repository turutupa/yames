/**
 * The two tours (ONBOARDING_PLAN §4, and card #50, 2026-11-18).
 *
 * A stop is data, not UI: what to spotlight, the screen that has to be showing
 * for it to exist, i18n keys for the title and the one sentence, and the
 * *hotkey action ids* whose keys the card prints. The keys themselves are
 * never written here — they come from `hotkeys.ts` (or, better, the user's own
 * keymap), so a rebind is reflected in the tour for free.
 *
 * - The LEARNING tour is "Show me around": Today, Paths, a Session and
 *   Progress, the side of the app a player meets first. It is the default.
 * - The TOOLS tour is the original six stops over the Metronome and the
 *   Drill, kept as "Tour the tools" for whoever came for those.
 */
import type { HotkeyAction } from "../../../hotkeys";

/**
 * The version of the LEARNING tour. Bumped when it changes enough that
 * returning users should be offered it again, once, by a toast.
 *
 * 1: the six tool stops (the only tour there was).
 * 2: the learning tour (2026-11-18). Everybody who saw version 1 saw the
 *    tools, not the side of the app they now land on, so they are offered it.
 */
export const TOUR_VERSION = 2;
/** Store key holding the last learning-tour version completed or dismissed. */
export const TOUR_SEEN_KEY = "tour.seenVersion";

export type TourKind = "learn" | "tools";

/** The screens a stop can require. `MainView` minus the ones no stop lives on. */
export type TourView = "beat" | "drill" | "today" | "paths" | "session" | "progress";

export type TourStop = {
  /** Stable id; also the `data-tour="…"` attribute when `target` is absent. */
  id: string;
  /** Screen that must be active for the target to be in the DOM. */
  view: TourView;
  /**
   * `onboarding.tour.<i18nKey>.title` / `.body`. Relative to the tour's
   * namespace so the two tours keep their own groups ("stops.bpm",
   * "learn.plan").
   */
  i18nKey: string;
  /** Hotkeys to print on the card, in order. Not shown on a phone. */
  keys: HotkeyAction[];
  /**
   * A CSS selector for the element(s) to spotlight, when the stop points at
   * something that already has a test id rather than a `data-tour` of its own.
   * Every visible match is in the cut-out.
   */
  target?: string;
};

/** The selector a stop spotlights. */
export function targetOf(stop: TourStop): string {
  return stop.target ?? `[data-tour="${stop.id}"]`;
}

/**
 * "Show me around" (card #50). Eight stops, in the order a player meets them:
 * the plan and why, the minutes and Start, Paths, then one Session's ready
 * screen (the tour opens one without listening or saving anything), then
 * Progress.
 */
export const LEARN_STOPS: TourStop[] = [
  {
    id: "today-plan",
    view: "today",
    i18nKey: "learn.plan",
    keys: ["tab-today"],
    target: '[data-testid="today-plan"], [data-testid="today-nothing"]',
  },
  {
    id: "today-start",
    view: "today",
    i18nKey: "learn.start",
    keys: [],
  },
  {
    id: "paths",
    view: "paths",
    i18nKey: "learn.paths",
    keys: ["tab-paths"],
  },
  {
    id: "session-neck",
    view: "session",
    i18nKey: "learn.neck",
    keys: [],
    target: '[data-testid="practice-neck"] .practice-neck-slot, .practice-legend [data-k="fingers"]',
  },
  {
    id: "session-watch",
    view: "session",
    i18nKey: "learn.watch",
    keys: ["session-watch"],
    target: '[data-testid="practice-watch"]',
  },
  {
    id: "session-take",
    view: "session",
    i18nKey: "learn.take",
    keys: ["session-go", "session-slower", "session-faster"],
    target: '[data-testid="session-big"], .session-nudges',
  },
  {
    id: "session-blocks",
    view: "session",
    i18nKey: "learn.blocks",
    keys: ["session-prev", "session-next"],
    target:
      '[data-testid="session-pips"], [data-testid="session-previous"], [data-testid="session-skip-this"]',
  },
  {
    id: "progress",
    view: "progress",
    i18nKey: "learn.progress",
    keys: ["tab-progress"],
    target: '.session-prog-paths > :first-child, [data-testid="progress-empty"]',
  },
];

/** "Tour the tools": the original six stops, unchanged. */
export const TOUR_STOPS: TourStop[] = [
  // Plan §4 lists "↑/↓, T" for tap tempo, but T is bound to `sig-next` and tap
  // tempo has no key binding at all — the card prints what actually works.
  { id: "bpm", view: "beat", i18nKey: "stops.bpm", keys: ["bpm-up", "bpm-down"] },
  {
    id: "subdivision",
    view: "beat",
    i18nKey: "stops.subdivision",
    keys: ["sub-prev", "sub-next"],
  },
  // Plan §4 says P; the sidebar is bound to B.
  { id: "presets", view: "beat", i18nKey: "stops.presets", keys: ["toggle-sidebar"] },
  { id: "drill-tab", view: "drill", i18nKey: "stops.drill", keys: ["tab-3"] },
  { id: "coach", view: "beat", i18nKey: "stops.coach", keys: ["toggle-coach"] },
  // Plan §4 says F for zen; F is native fullscreen, zen is Z.
  {
    id: "zen-widget",
    view: "beat",
    i18nKey: "stops.zenWidget",
    keys: ["fullscreen", "toggle-widget"],
  },
];

export const TOOLS_STOPS = TOUR_STOPS;

export const TOURS: Record<TourKind, TourStop[]> = { learn: LEARN_STOPS, tools: TOOLS_STOPS };
