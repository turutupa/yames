/**
 * The practice reminder's line on Today (leg rem2; OWNER-UPDATES 2026-11-20:
 * in the app only, no notification). Pure: the stored reminder, the clock and
 * the days the player practised in; one `Line` or null out.
 *
 * Today says "Your reminder: guitar at 18:00." (the player's own instrument,
 * or none named: `reminderLineKey`) when, and only when:
 * - the reminder is on (only the player's press in Settings → Coach does that);
 * - today, in local time, is one of its days;
 * - `now` is at or past its time today;
 * - the player has not practised today. What counts as practice (judgement
 *   call 21, widened in rem2b): a stored Path Take (My exercises included, a
 *   Take marked "not fair" included), a saved tool run, or a stored Songs
 *   attempt, dated today;
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
  /** `dayKey`s of every stored Path Take, saved tool run and stored Songs attempt read. */
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

/**
 * How far back a read of practice must reach (rem2c): local midnight
 * `LOOK_BACK_DAYS` days before `now`'s day. `reminderQuiet` looks at days
 * 1 to `LOOK_BACK_DAYS` back and `reminderLine` at today, so a list holding
 * everything from here on answers both exactly; nothing older is ever asked.
 */
export function reminderReadFrom(now: number): number {
  return dayStart(now, LOOK_BACK_DAYS).getTime();
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

/**
 * The line's key for the instrument the player chose (rem2c, owner 2026-11-21:
 * a bass player is never told "guitar"). Both guitars are "guitar"; an
 * instrument the app does not know, "other", or no choice yet gets the line
 * that names none ("Your reminder: practice at 18:00.").
 */
export function reminderLineKey(instrument: string | null | undefined): string {
  switch (instrument) {
    case "electric-guitar":
    case "acoustic-guitar":
      return "notebook.reminder.lineGuitar";
    case "bass":
      return "notebook.reminder.lineBass";
    case "drums":
      return "notebook.reminder.lineDrums";
    case "piano":
      return "notebook.reminder.linePiano";
    default:
      return "notebook.reminder.line";
  }
}

/**
 * Today's reminder line, or null. `time` is "HH:MM": the screen words it in the
 * locale's own format. `instrument` is the player's chosen one, if any.
 */
export function reminderLine(
  reminder: CoachReminder,
  now: number,
  practised: Practised,
  instrument?: string | null,
): Line | null {
  if (!reminder.on) return null;
  const today = dayStart(now, 0);
  if (!reminder.days.includes(today.getDay())) return null;
  if (now < momentOn(today, reminder.time)) return null;
  if (practised.days.has(dayKey(now))) return null;
  if (reminderQuiet(reminder, now, practised)) return null;
  return { key: reminderLineKey(instrument), values: { time: reminder.time } };
}

/** The next moment today at which the line may appear, or null (Today sets one timer for it). */
export function reminderDueLaterToday(reminder: CoachReminder, now: number): number | null {
  if (!reminder.on) return null;
  const today = dayStart(now, 0);
  if (!reminder.days.includes(today.getDay())) return null;
  const at = momentOn(today, reminder.time);
  return at > now ? at : null;
}

/**
 * When a screen left open must look again (rem2b): the reminder's time today
 * if it is still to come, else the next local midnight (the line belongs to a
 * day, and a screen open across midnight must not keep yesterday's). Null
 * while the reminder is off.
 */
export function reminderNextCheck(reminder: CoachReminder, now: number): number | null {
  if (!reminder.on) return null;
  const midnight = dayStart(now, -1).getTime();
  const due = reminderDueLaterToday(reminder, now);
  return due !== null && due < midnight ? due : midnight;
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
