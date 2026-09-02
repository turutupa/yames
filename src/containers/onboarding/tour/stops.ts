/**
 * The six tour stops (ONBOARDING_PLAN §4).
 *
 * A stop is data, not UI: a `data-tour` id to spotlight, the tab that has to
 * be showing for that element to exist, i18n keys for the title and the one
 * sentence, and the *hotkey action ids* whose keys the card prints. The keys
 * themselves are never written here — they come from `hotkeys.ts` (or, better,
 * the user's own keymap), so a rebind is reflected in the tour for free.
 */
import type { HotkeyAction } from "../../../hotkeys";

/** Bumped when the tour changes enough that returning users should see it. */
export const TOUR_VERSION = 1;
/** Store key holding the last tour version completed or dismissed. */
export const TOUR_SEEN_KEY = "tour.seenVersion";

/** The tabs a stop can require. Mirrors `MainView` minus "settings". */
export type TourView = "beat" | "drill" | "track";

export type TourStop = {
  /** Matches the `data-tour="…"` attribute on the target element(s). */
  id: string;
  /** Tab that must be active for the target to be in the DOM. */
  view: TourView;
  /** `onboarding.tour.stops.<i18nKey>.title` / `.body`. */
  i18nKey: string;
  /** Hotkeys to print on the card, in order. */
  keys: HotkeyAction[];
};

export const TOUR_STOPS: TourStop[] = [
  // Plan §4 lists "↑/↓, T" for tap tempo, but T is bound to `sig-next` and tap
  // tempo has no key binding at all — the card prints what actually works.
  { id: "bpm", view: "beat", i18nKey: "bpm", keys: ["bpm-up", "bpm-down"] },
  {
    id: "subdivision",
    view: "beat",
    i18nKey: "subdivision",
    keys: ["sub-prev", "sub-next"],
  },
  // Plan §4 says P; the sidebar is bound to B.
  { id: "presets", view: "beat", i18nKey: "presets", keys: ["toggle-sidebar"] },
  { id: "drill-tab", view: "drill", i18nKey: "drill", keys: ["tab-2"] },
  { id: "coach", view: "beat", i18nKey: "coach", keys: ["toggle-coach"] },
  // Plan §4 says F for zen; F is native fullscreen, zen is Z.
  {
    id: "zen-widget",
    view: "beat",
    i18nKey: "zenWidget",
    keys: ["fullscreen", "toggle-widget"],
  },
];
