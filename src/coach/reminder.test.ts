/**
 * The reminder's line on Today and its quiet rule (leg rem2). Every date is
 * built in local time, so the table holds in any time zone.
 */
import { describe, expect, it } from "vitest";
import {
  dayKey,
  practisedFrom,
  reminderDueLaterToday,
  reminderLine,
  reminderLineKey,
  reminderNextCheck,
  reminderQuiet,
  reminderReadFrom,
  reminderTimeText,
} from "./reminder";
import type { Practised } from "./reminder";
import type { CoachReminder } from "./store";

const at = (d: number, h = 0, m = 0) => new Date(2026, 10, d, h, m).getTime();
/** Friday 20 November 2026, 19:00 local. */
const NOW = at(20, 19);
const FRI = new Date(NOW).getDay();
const ALL = [0, 1, 2, 3, 4, 5, 6];
const ON: CoachReminder = { on: true, time: "18:00", days: ALL, since: at(1) };
const NONE: Practised = { days: new Set(), knownFrom: 0 };
const played = (...stamps: number[]): Practised => ({ days: new Set(stamps.map(dayKey)), knownFrom: 0 });
/** Played every day of the month before the 20th, so the quiet rule does not hold. */
const DAILY = played(...Array.from({ length: 19 }, (_, i) => at(i + 1, 12)));

describe("reminderReadFrom: the Songs read's bound (rem2c M1)", () => {
  it("is local midnight 21 days back", () => {
    expect(reminderReadFrom(NOW)).toBe(at(-1)); // 30 October, 00:00
    expect(reminderReadFrom(at(20, 0, 0))).toBe(at(-1));
  });

  it("answers the line and the quiet rule exactly as the whole history does", () => {
    const fridays: CoachReminder = { on: true, time: "18:00", days: [FRI], since: at(-60) };
    const histories = [
      [],
      [at(-2, 12)], // before the bound only
      [at(-2, 12), at(-1, 0)], // one on the bound's first moment
      [at(-30, 9), at(6, 12)],
      [at(13, 20)],
      [at(20, 9)], // today
    ];
    for (const reminder of [ON, fridays]) {
      for (const stamps of histories) {
        const whole = practisedFrom([{ at: stamps, full: false }]);
        const bounded = practisedFrom([{ at: stamps.filter((s) => s >= reminderReadFrom(NOW)), full: false }]);
        expect(reminderQuiet(reminder, NOW, bounded)).toBe(reminderQuiet(reminder, NOW, whole));
        expect(reminderLine(reminder, NOW, bounded)).toEqual(reminderLine(reminder, NOW, whole));
      }
    }
  });
});

describe("reminderLineKey: the player's instrument (rem2c)", () => {
  it.each([
    ["electric-guitar", "notebook.reminder.lineGuitar"],
    ["acoustic-guitar", "notebook.reminder.lineGuitar"],
    ["bass", "notebook.reminder.lineBass"],
    ["drums", "notebook.reminder.lineDrums"],
    ["piano", "notebook.reminder.linePiano"],
    ["other", "notebook.reminder.line"],
    [undefined, "notebook.reminder.line"],
    [null, "notebook.reminder.line"],
  ])("%s → %s", (instrument, key) => {
    expect(reminderLineKey(instrument)).toBe(key);
    expect(reminderLine(ON, NOW, NONE, instrument)?.key).toBe(key);
  });
});

describe("reminderLine: the table", () => {
  it.each<[string, CoachReminder, number, Practised, boolean]>([
    ["off", { ...ON, on: false }, NOW, DAILY, false],
    ["not a reminder day", { ...ON, days: ALL.filter((d) => d !== FRI) }, NOW, DAILY, false],
    ["before the time", ON, at(20, 17, 59), DAILY, false],
    ["at the minute", ON, at(20, 18, 0), DAILY, true],
    ["a minute before the minute", ON, at(20, 18, 0) - 1, DAILY, false],
    ["a Session already today", ON, NOW, { days: new Set([...DAILY.days, dayKey(at(20, 9))]), knownFrom: 0 }, false],
    ["after the time with none today", ON, NOW, DAILY, true],
    ["a day-list of one, today", { ...ON, days: [FRI] }, NOW, played(at(13, 12)), true],
    ["a day-list of one, another day", { ...ON, days: [(FRI + 1) % 7] }, NOW, DAILY, false],
  ])("%s", (_name, reminder, now, practised, says) => {
    const line = reminderLine(reminder, now, practised);
    expect(line !== null).toBe(says);
    if (line) expect(line).toEqual({ key: "notebook.reminder.line", values: { time: "18:00" } });
  });

  it("the locale's midnight: a Session at 23:59 yesterday is not a Session today", () => {
    const late: CoachReminder = { ...ON, time: "00:00" };
    expect(reminderLine(late, at(20, 0, 0), played(at(19, 23, 59)))).not.toBeNull();
    expect(reminderLine(late, at(20, 0, 0) - 1, played(at(19, 23, 59)))).toBeNull(); // still yesterday, and played
    expect(reminderLine(late, at(20, 0, 1), played(at(20, 0, 0)))).toBeNull();
  });
});

describe("reminderQuiet: three reminder days passed with no Session", () => {
  it("two: still said; three: quiet; a Session: said again", () => {
    // Played on the 17th; the 18th and 19th went by: two.
    expect(reminderQuiet(ON, NOW, played(at(17, 12)))).toBe(false);
    expect(reminderLine(ON, NOW, played(at(17, 12)))).not.toBeNull();
    // Played on the 16th; the 17th, 18th and 19th went by: three.
    expect(reminderQuiet(ON, NOW, played(at(16, 12)))).toBe(true);
    expect(reminderLine(ON, NOW, played(at(16, 12)))).toBeNull();
    // A Session on the 21st: on the 22nd it is said again.
    expect(reminderLine(ON, at(22, 19), played(at(16, 12), at(21, 12)))).not.toBeNull();
  });

  it("counts reminder days only; a Session on any day since brings it back", () => {
    const monWedFri = { ...ON, days: [1, 3, 5] };
    // Nothing since the 1st: Mon 16, Wed 18 and Fri 13 went by.
    expect(reminderQuiet(monWedFri, NOW, NONE)).toBe(true);
    // A Session on Tuesday 17 (not a reminder day): only Wed 18 since.
    expect(reminderQuiet(monWedFri, NOW, played(at(17, 12)))).toBe(false);
  });

  it("never counts a day before the reminder was turned on", () => {
    // Turned on yesterday at noon: only yesterday (18:00) has passed since.
    expect(reminderQuiet({ ...ON, since: at(19, 12) }, NOW, NONE)).toBe(false);
    expect(reminderLine({ ...ON, since: at(19, 12) }, NOW, NONE)).not.toBeNull();
    // Turned on the 17th at 19:00: the 17th's 18:00 came before it, so two days count.
    expect(reminderQuiet({ ...ON, since: at(17, 19) }, NOW, NONE)).toBe(false);
    expect(reminderQuiet({ ...ON, since: at(17, 17) }, NOW, NONE)).toBe(true);
  });

  it("never counts a day the lists do not reach", () => {
    expect(reminderQuiet(ON, NOW, { days: new Set(), knownFrom: at(18, 12) })).toBe(false);
    expect(reminderQuiet(ON, NOW, { days: new Set(), knownFrom: at(17, 0) })).toBe(true);
  });

  it("off, or no days: never quiet (and never said)", () => {
    expect(reminderQuiet({ ...ON, on: false }, NOW, NONE)).toBe(false);
    expect(reminderQuiet({ ...ON, days: [] }, NOW, NONE)).toBe(false);
    expect(reminderLine({ ...ON, days: [] }, NOW, NONE)).toBeNull();
  });
});

describe("helpers", () => {
  it("practisedFrom: a list cut at its limit is known from its oldest entry", () => {
    const p = practisedFrom([
      { at: [at(19, 9), at(10, 9)], full: true },
      { at: [at(5, 9)], full: false },
    ]);
    expect(p.knownFrom).toBe(at(10, 9));
    expect(p.days.has(dayKey(at(5, 20)))).toBe(true);
    expect(practisedFrom([{ at: [], full: true }]).knownFrom).toBe(0);
  });

  it("reminderDueLaterToday: the moment when it is later today, else null", () => {
    expect(reminderDueLaterToday(ON, at(20, 9))).toBe(at(20, 18));
    expect(reminderDueLaterToday(ON, NOW)).toBeNull();
    expect(reminderDueLaterToday({ ...ON, on: false }, at(20, 9))).toBeNull();
    expect(reminderDueLaterToday({ ...ON, days: [(FRI + 1) % 7] }, at(20, 9))).toBeNull();
  });

  it("reminderNextCheck: the time today if still to come, else the next local midnight (rem2b M1)", () => {
    expect(reminderNextCheck(ON, at(20, 9))).toBe(at(20, 18));
    expect(reminderNextCheck(ON, NOW)).toBe(at(21));
    expect(reminderNextCheck(ON, at(20, 23, 59))).toBe(at(21));
    expect(reminderNextCheck({ ...ON, days: [(FRI + 1) % 7] }, at(20, 9))).toBe(at(21));
    expect(reminderNextCheck({ ...ON, on: false }, at(20, 9))).toBeNull();
    // The last day of a month rolls into the next.
    expect(reminderNextCheck(ON, at(30, 20))).toBe(new Date(2026, 11, 1).getTime());
  });

  it("reminderTimeText: the locale's own format", () => {
    expect(reminderTimeText("18:00", "en-US")).toMatch(/6:00\s?PM/);
    expect(reminderTimeText("18:00", "de")).toBe("18:00");
  });
});
