/**
 * Totals over a player's Takes: the top row of Progress, and the same three
 * numbers for one calendar week (the weekly look-back, DESIGN 6 and 9.1).
 *
 * Pure. Minutes are the Takes' own length, from their bars and tempo, so a
 * warm-up or a pause is not counted: played, not "spent in the app".
 */
import type { PathTakeRow } from "../ipc";
import type { PathDoc } from "../paths/format";
import { barLengthTicks } from "../paths/format";
import { calendarDaysBetween, sessionKeyOf } from "./progress";
import { findExercise } from "./packs";

/**
 * The top row. Minutes are the Takes' own length, from their bars and tempo,
 * so a warm-up or a pause is not counted: played, not "spent in the app".
 */
export function totalsFrom(takes: readonly PathTakeRow[], paths: readonly PathDoc[], now = Date.now()) {
  let seconds = 0;
  for (const take of takes) {
    const path = paths.find((p) => p.id === take.pathId);
    const meter = (path && findExercise(path, take.exerciseId)?.exercise.meter) ?? { numerator: 4, denominator: 4 };
    if (take.bpm > 0) seconds += (take.bars * (barLengthTicks(meter) / 960) * 60) / take.bpm;
  }
  const sessions = new Set(takes.map(sessionKeyOf)).size;
  // Days back from today with a Take on them; a streak still counts until a
  // whole day has gone by without one.
  const days = new Set(takes.map((t) => calendarDaysBetween(t.startedAt, now)));
  const start = days.has(0) ? 0 : days.has(1) ? 1 : -1;
  let streak = 0;
  if (start >= 0) while (days.has(start + streak)) streak += 1;
  return { minutes: Math.round(seconds / 60), seconds, sessions, streak };
}

/** A day of the week as `Date.getDay()` numbers it: 0 is Sunday, 6 is Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Regions whose week starts on Sunday or Saturday, for a webview without
 * `Intl.Locale` week data (CLDR's `firstDay`). Everyone else starts on Monday.
 */
const SUNDAY_REGIONS = new Set([
  "AG", "AS", "BD", "BR", "BS", "BT", "BW", "BZ", "CA", "CN", "CO", "DM", "DO", "ET", "GT", "GU",
  "HK", "HN", "ID", "IL", "IN", "JM", "JP", "KE", "KH", "KR", "LA", "MH", "MM", "MO", "MT", "MX",
  "MZ", "NI", "NP", "PA", "PE", "PH", "PK", "PR", "PT", "PY", "SA", "SG", "SV", "TH", "TT", "TW",
  "UM", "US", "VE", "VI", "WS", "YE", "ZA", "ZW",
]);
const SATURDAY_REGIONS = new Set(["AE", "AF", "BH", "DJ", "DZ", "EG", "IQ", "IR", "JO", "KW", "LY", "OM", "QA", "SD", "SY"]);

/**
 * The first day of the week in a locale (`"en-US"` → Sunday, `"de"` →
 * Monday). Reads the browser's week data where it has it; otherwise the
 * locale's region (most likely one when the tag names none) against CLDR's
 * table, Monday when nothing is known.
 */
export function weekStartOf(locale: string): Weekday {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    // CLDR's numbering: 1 is Monday, 7 is Sunday.
    const firstDay = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay;
    if (typeof firstDay === "number" && firstDay >= 1 && firstDay <= 7) return (firstDay % 7) as Weekday;
    const region = loc.region ?? loc.maximize().region;
    if (region && SUNDAY_REGIONS.has(region)) return 0;
    if (region && SATURDAY_REGIONS.has(region)) return 6;
  } catch {
    // A tag Intl does not accept: Monday, as for an unknown region.
  }
  return 1;
}

/** Sessions, minutes and Takes in one calendar week. */
export type WeekTotals = {
  /** Local midnight on the week's first day, in ms. */
  start: number;
  /** Local midnight on the next week's first day: the week is `[start, end)`. */
  end: number;
  sessions: number;
  minutes: number;
  seconds: number;
  takes: number;
};

/** The local midnight that starts the week holding `at`, and the one after it. */
function weekAround(at: number, weekStart: Weekday): { start: number; end: number } {
  const d = new Date(at);
  const back = (d.getDay() - weekStart + 7) % 7;
  // Built from calendar fields, so a week with a clock change in it is still
  // seven days long, whether that is 167 or 169 hours.
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back + 7);
  return { start: start.getTime(), end: end.getTime() };
}

function totalsIn(
  takes: readonly PathTakeRow[],
  paths: readonly PathDoc[],
  span: { start: number; end: number },
): WeekTotals {
  const inside = takes.filter((t) => t.startedAt >= span.start && t.startedAt < span.end);
  const { minutes, seconds, sessions } = totalsFrom(inside, paths, span.end);
  return { ...span, sessions, minutes, seconds, takes: inside.length };
}

/**
 * This calendar week (the one `now` falls in, so far) and the whole week
 * before it, in the player's local time. `weekStart` is the locale's first
 * day (`weekStartOf(i18n.language)`). Takes of a Session that ran across
 * midnight between the two weeks count in the week each was played in.
 */
export function weekTotals(
  takes: readonly PathTakeRow[],
  paths: readonly PathDoc[],
  now: number,
  weekStart: Weekday,
): { thisWeek: WeekTotals; lastWeek: WeekTotals } {
  const span = weekAround(now, weekStart);
  const d = new Date(span.start);
  const before = {
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7).getTime(),
    end: span.start,
  };
  return { thisWeek: totalsIn(takes, paths, span), lastWeek: totalsIn(takes, paths, before) };
}
