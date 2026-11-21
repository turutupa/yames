/**
 * Totals: the top row of Progress (`totalsFrom`, moved here from
 * `ProgressView.tsx` with its test) and one calendar week of it (`weekTotals`).
 *
 * The week tests build their times from local calendar fields. The time zone
 * is pinned for this file (c4b2, from c4b1's review) so the daylight-saving
 * rows really cross a clock change on every machine: Europe/Berlin, and
 * America/New_York inside the one US row. Vitest runs files in forks, and
 * the zone is put back after the file.
 */
import { afterAll, describe, expect, it } from "vitest";

const TZ_BEFORE = process.env.TZ;
process.env.TZ = "Europe/Berlin";
afterAll(() => {
  if (TZ_BEFORE === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_BEFORE;
});
import { totalsFrom, weekStartOf, weekTotals } from "./totals";
import type { Weekday } from "./totals";
import { ALT, DAY, NOW, take } from "./testKit";

const EX = ALT.steps[0].exercises[0];

/** Local time from calendar fields; month is 1-based here, for reading. */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe("totalsFrom", () => {
  it("counts an ungraded Take toward minutes and the streak", () => {
    const quiet = take(EX.id, {
      bpm: 60,
      bars: 16,
      startedAt: NOW - 1000,
      caught: false,
      facts: { verdict: "ungraded", ungraded: "inputOff" },
    });
    const without = totalsFrom([], [ALT], NOW);
    const withIt = totalsFrom([quiet], [ALT], NOW);
    expect(withIt.seconds).toBeGreaterThan(without.seconds);
    expect(withIt.streak).toBe(1);
    expect(totalsFrom([quiet, take(EX.id, { startedAt: NOW - DAY })], [ALT], NOW).streak).toBe(2);
  });
});

describe("weekStartOf", () => {
  it.each<[string, Weekday]>([
    ["en-US", 0],
    ["en", 0],
    ["en-GB", 1],
    ["de", 1],
    ["es-ES", 1],
    ["fr", 1],
    ["ja", 0],
    ["pt-BR", 0],
    ["ar-EG", 6],
    ["not a locale!", 1],
  ])("%s starts its week on day %i", (locale, day) => {
    expect(weekStartOf(locale)).toBe(day);
  });
});

describe("weekTotals", () => {
  const MON = 1 as Weekday;
  const SUN = 0 as Weekday;
  const SAT = 6 as Weekday;

  it("the pinned zone changes its clocks inside the DST rows' weeks", () => {
    // 23 to 30 March 2026 in Berlin is 167 hours: the rows above cross a real change.
    expect(Math.round((at(2026, 3, 30, 0) - at(2026, 3, 23, 0)) / 3_600_000)).toBe(167);
    expect(Math.round((at(2026, 10, 26, 0) - at(2026, 10, 19, 0)) / 3_600_000)).toBe(169);
  });

  it("a week with the US spring change, in New York", () => {
    process.env.TZ = "America/New_York";
    try {
      const start = at(2026, 3, 8, 0);
      const end = at(2026, 3, 15, 0);
      expect(Math.round((end - start) / 3_600_000)).toBe(167);
      const { thisWeek } = weekTotals([], [ALT], at(2026, 3, 10), SUN);
      expect(thisWeek.start).toBe(start);
      expect(thisWeek.end).toBe(end);
    } finally {
      process.env.TZ = "Europe/Berlin";
    }
  });

  it("splits a Session that ran across the week's edge between the two weeks", () => {
    const now = at(2026, 4, 1); // Wednesday, Monday-first: the week of 30 March
    const takes = [
      take(EX.id, { startedAt: at(2026, 3, 29, 23, 50), bars: 60, bpm: 60, facts: { session: 7 } }),
      take(EX.id, { startedAt: at(2026, 3, 30, 0, 10), bars: 60, bpm: 60, facts: { session: 7 } }),
    ];
    const { thisWeek, lastWeek } = weekTotals(takes, [ALT], now, MON);
    expect(thisWeek).toMatchObject({ takes: 1, sessions: 1, minutes: 4 });
    expect(lastWeek).toMatchObject({ takes: 1, sessions: 1, minutes: 4 });
  });

  it.each<[string, number, Weekday, number, number]>([
    // name, now, week start, expected start, expected end
    ["across a month end, Monday first", at(2026, 4, 1), MON, at(2026, 3, 30, 0), at(2026, 4, 6, 0)],
    ["across a month end, Sunday first", at(2026, 4, 1), SUN, at(2026, 3, 29, 0), at(2026, 4, 5, 0)],
    ["across a year end", at(2027, 1, 1), MON, at(2026, 12, 28, 0), at(2027, 1, 4, 0)],
    ["on the week's first day itself", at(2026, 3, 30, 0, 5), MON, at(2026, 3, 30, 0), at(2026, 4, 6, 0)],
    // Europe moves its clocks on Sunday 29 March 2026, the US on Sunday 8 March.
    ["a week with Europe's spring change", at(2026, 3, 29, 20), MON, at(2026, 3, 23, 0), at(2026, 3, 30, 0)],
    ["a week with Europe's autumn change", at(2026, 10, 25, 9), MON, at(2026, 10, 19, 0), at(2026, 10, 26, 0)],
    ["a Saturday-first week", at(2026, 4, 1), SAT, at(2026, 3, 28, 0), at(2026, 4, 4, 0)],
    ["a Saturday-first week, on the Saturday", at(2026, 3, 28, 0, 5), SAT, at(2026, 3, 28, 0), at(2026, 4, 4, 0)],
  ])("%s", (_name, now, weekStart, start, end) => {
    const { thisWeek, lastWeek } = weekTotals([], [ALT], now, weekStart);
    expect(thisWeek.start).toBe(start);
    expect(thisWeek.end).toBe(end);
    expect(lastWeek.end).toBe(start);
    const s = new Date(start);
    expect(lastWeek.start).toBe(new Date(s.getFullYear(), s.getMonth(), s.getDate() - 7).getTime());
    // Seven calendar days, whatever the clock did: 167, 168 or 169 hours.
    expect([167, 168, 169]).toContain(Math.round((end - start) / 3_600_000));
  });

  it("puts a Take in the week of the local day it was played on", () => {
    const now = at(2026, 3, 29, 20); // Sunday, Monday-first: the week of 23 March
    const takes = [
      take(EX.id, { startedAt: at(2026, 3, 29, 23, 30), facts: { session: 1 } }), // this week, last evening
      take(EX.id, { startedAt: at(2026, 3, 23, 0, 30), facts: { session: 2 } }), // this week, first hour
      take(EX.id, { startedAt: at(2026, 3, 22, 23, 30), facts: { session: 3 } }), // last week, last hour
      take(EX.id, { startedAt: at(2026, 3, 16, 0, 30), facts: { session: 4 } }), // last week, first hour
      take(EX.id, { startedAt: at(2026, 3, 15, 23, 30), facts: { session: 5 } }), // two weeks ago
    ];
    const { thisWeek, lastWeek } = weekTotals(takes, [ALT], now, MON);
    expect(thisWeek.takes).toBe(2);
    expect(lastWeek.takes).toBe(2);
    expect(thisWeek.sessions).toBe(2);
    expect(lastWeek.sessions).toBe(2);
  });

  it("counts Sessions, minutes and Takes as totalsFrom does over the same Takes", () => {
    const now = at(2026, 4, 1);
    const week = [
      take(EX.id, { startedAt: at(2026, 3, 30, 18), bars: 60, bpm: 60, facts: { session: 10 } }),
      take(EX.id, { startedAt: at(2026, 3, 30, 18, 5), bars: 60, bpm: 60, facts: { session: 10 } }),
      take(EX.id, { startedAt: at(2026, 3, 31, 9), bars: 120, bpm: 90, caught: false, facts: { ungraded: "chosen", session: 20 } }),
    ];
    const { thisWeek, lastWeek } = weekTotals(week, [ALT], now, MON);
    const all = totalsFrom(week, [ALT], now);
    expect(thisWeek.takes).toBe(3);
    expect(thisWeek.sessions).toBe(2);
    expect(thisWeek.seconds).toBeCloseTo(all.seconds);
    expect(thisWeek.minutes).toBe(all.minutes);
    expect(thisWeek.minutes).toBeGreaterThan(0);
    expect(lastWeek).toMatchObject({ takes: 0, sessions: 0, minutes: 0, seconds: 0 });
  });

  it("is all zeros with no Sessions at all, or none in either week", () => {
    const now = at(2026, 4, 1);
    const empty = weekTotals([], [ALT], now, MON);
    expect(empty.thisWeek).toMatchObject({ takes: 0, sessions: 0, minutes: 0, seconds: 0 });
    expect(empty.lastWeek).toMatchObject({ takes: 0, sessions: 0, minutes: 0, seconds: 0 });
    const old = weekTotals([take(EX.id, { startedAt: at(2026, 3, 1) })], [ALT], now, MON);
    expect(old.thisWeek.takes).toBe(0);
    expect(old.lastWeek.takes).toBe(0);
  });
});
