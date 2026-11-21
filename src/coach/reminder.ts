/**
 * The practice reminder's line on Today (leg rem2; OWNER-UPDATES 2026-11-20:
 * in the app only, no notification). Pure: the stored reminder, the clock and
 * the days the player practised in; one `Line` or null out.
 *
 * Today says "Your reminder: guitar at 18:00." when, and only when:
 * - the reminder is on (only the player's press in Settings → Coach does that);
 * - today, in local time, is one of its days;
 * - `now` is at or past its time today;
 * - there is no Session today (a stored Path Take, or a saved tool run, dated
 *   today: judgement call 21);
 * - the quiet rule does not hold (`reminderQuiet`).
 *
 * The quiet rule (judgement call 23) stands in for "off after three ignored":
 * the app never switches the setting off. When the last three reminder days
 * before today all went by with no Session, Today stops mentioning it; the
 * setting stays On, nothing is stored for it (it is computed from the Takes
 * each time), and the first Session after that brings the line back on the
 * next reminder day. A reminder day only counts when its time came after the
 * press that turned the reminder on (`since`), and only when the stored lists
 * reach back to it (`Practised.knownFrom`): a day the app cannot see is never
 * counted as ignored.
 *
 * The line is a fact: no streak, no count of days, no "you missed".
 */
import type { Line } from "../session/coachWords";
import type { CoachReminder } from "./store";

/** The local days with a Session, and from when the lists that gave them are complete. */
export type Practised = {
  /** `dayKey`s of every stored Path Take and saved tool run read. */
  days: ReadonlySet<string>;
  /** ms: nothing is known before this (a list was cut at its limit). 0: everything is known. */
  knownFrom: number;
};

/** Reminder days looked back over for the quiet rule: three weeks covers a day-list of one. */
const LOOK_BACK_DAYS = 21;
/** How many reminder days in a row, passed with no Session, make Today stop mentioning it. */
export const REMINDER_IGNORED_TO_QUIET = 3;

/** A local calendar day, as a key. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Local midnight of the day `daysBack` days before `now`'s day. */
function dayStart(now: number, daysBack: number): Date {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysBack);
}

/** The reminder's moment on a local day. */
function momentOn(day: Date, time: string): number {
  const [h, m] = time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
}

/**
 * The Practised days from lists read from the store, each with whether it was
 * cut at its limit (then nothing before its oldest entry is known).
 */
export function practisedFrom(lists: ReadonlyArray<{ at: readonly number[]; full: boolean }>): Practised {
  const days = new Set<string>();
  let knownFrom = 0;
  for (const list of lists) {
    for (const at of list.at) days.add(dayKey(at));
    if (list.full && list.at.length > 0) knownFrom = Math.max(knownFrom, Math.min(...list.at));
  }
  return { days, knownFrom };
}

/**
 * Has Today stopped mentioning it? True when the last three reminder days
 * before today (whose time came after the reminder was turned on, and which
 * the lists reach) had no Session, and no Session has been played since the
 * first of them.
 */
export function reminderQuiet(reminder: CoachReminder, now: number, practised: Practised): boolean {
  if (!reminder.on || reminder.days.length === 0) return false;
  const since = reminder.since ?? 0;
  let counted = 0;
  for (let back = 1; back <= LOOK_BACK_DAYS; back += 1) {
    const day = dayStart(now, back);
    // A Session on any day since the first of the counted days brings the line back.
    if (practised.days.has(dayKey(day.getTime()))) return false;
    if (day.getTime() < practised.knownFrom) return false;
    if (!reminder.days.includes(day.getDay())) continue;
    if (momentOn(day, reminder.time) < since) return false;
    counted += 1;
    if (counted >= REMINDER_IGNORED_TO_QUIET) return true;
  }
  return false;
}

/** Today's reminder line, or null. `time` is "HH:MM": the screen words it in the locale's own format. */
export function reminderLine(reminder: CoachReminder, now: number, practised: Practised): Line | null {
  if (!reminder.on) return null;
  const today = dayStart(now, 0);
  if (!reminder.days.includes(today.getDay())) return null;
  if (now < momentOn(today, reminder.time)) return null;
  if (practised.days.has(dayKey(now))) return null;
  if (reminderQuiet(reminder, now, practised)) return null;
  return { key: "notebook.reminder.line", values: { time: reminder.time } };
}

/** The next moment today at which the line may appear, or null (Today sets one timer for it). */
export function reminderDueLaterToday(reminder: CoachReminder, now: number): number | null {
  if (!reminder.on) return null;
  const today = dayStart(now, 0);
  if (!reminder.days.includes(today.getDay())) return null;
  const at = momentOn(today, reminder.time);
  return at > now ? at : null;
}

/** "18:00" in the locale's own time format. */
export function reminderTimeText(time: string, locale: string): string {
  const [h, m] = time.split(":").map(Number);
  try {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 3, h, m));
  } catch {
    return time;
  }
}
