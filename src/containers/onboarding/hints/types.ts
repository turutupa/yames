/**
 * Progressive first-time hints (ONBOARDING_PLAN §5, brief O7).
 *
 * Nine contextual cards, each shown exactly once, at most one per app session.
 *
 * Store keys (onboarding README + this task):
 *   hints.<id>              boolean  the hint has been shown
 *   hints.lastShownSession  number   app session that used the one-hint slot
 *   appSessionCount         number   app sessions so far; +1 on every start
 *   widgetOpened            boolean  the floating widget was opened at least once
 *   hintSetupHistory        object[] BPM/subdivision/groups seen per session
 *
 * Only the two `hints.*` keys are hint *state*; "Reset hints" in
 * Settings → General clears exactly those. `appSessionCount`,
 * `widgetOpened` and `hintSetupHistory` are observations about how the app
 * has been used — resetting them would make `widget-discover` and
 * `preset-suggest` lie about their own preconditions.
 */

export type HintId =
  | "drill-first-open"
  | "preset-suggest"
  | "coach-ask"
  | "zen-first"
  | "widget-discover"
  | "midi-plugged"
  /**
   * The three Jam hints (plans/JAM_KILLER.md §2 A4).
   *
   * They were the three captions of JAM_UX_DECISIONS A7 — everything is
   * synthesised, the band never plays your instrument, takes stay on this
   * machine — and all three were answers to questions a player was not
   * asking. Half the band is recorded now, the band row says who is in it,
   * and nobody has ever been surprised that a recording they made is on their
   * own disk.
   *
   * These three are what a player actually has to be told, in the order they
   * first need it: where the two doors go, that a sheet is live while the
   * band plays, and that the band is arranging itself.
   */
  | "jam-sheets"
  | "jam-live"
  | "jam-arrangement";

/** Every hint id, in the order §5 lists them. */
export const HINT_IDS: readonly HintId[] = [
  "drill-first-open",
  "preset-suggest",
  "coach-ask",
  "zen-first",
  "widget-discover",
  "midi-plugged",
  "jam-sheets",
  "jam-live",
  "jam-arrangement",
] as const;

/** `hints.<id>` — the "already shown" flag for one hint. */
export const hintShownKey = (id: HintId): string => `hints.${id}`;

/** `hints.lastShownSession` — the rate limit (one hint per app session). */
export const HINT_LAST_SHOWN_SESSION_KEY = "hints.lastShownSession";

/** Every store key "Reset hints" clears. */
export const HINT_STATE_KEYS: readonly string[] = [
  ...HINT_IDS.map(hintShownKey),
  HINT_LAST_SHOWN_SESSION_KEY,
];

/** App session counter, incremented once per app start. */
export const APP_SESSION_COUNT_KEY = "appSessionCount";

/** Set the first time the floating widget is opened (widget-discover). */
export const WIDGET_OPENED_KEY = "widgetOpened";

/** Rolling record of the setups the user actually practised (preset-suggest). */
export const HINT_SETUP_HISTORY_KEY = "hintSetupHistory";

/**
 * i18n leaf under `onboarding.hints.` for each id. The store keys stay
 * kebab-case (they are part of the O1 store contract); locale keys follow the
 * repo's camelCase convention.
 */
export const HINT_I18N_KEY: Record<HintId, string> = {
  "drill-first-open": "drillFirstOpen",
  "preset-suggest": "presetSuggest",
  "coach-ask": "coachAsk",
  "zen-first": "zenFirst",
  "widget-discover": "widgetDiscover",
  "midi-plugged": "midiPlugged",
  "jam-sheets": "jamSheets",
  "jam-live": "jamLive",
  "jam-arrangement": "jamArrangement",
};
