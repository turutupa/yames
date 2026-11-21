// "Add to today" (t2eb, review L1): an old choice never loads the list or the
// generator at launch; today's, and yesterday's (a Session across midnight), do.
import { describe, expect, it } from "vitest";
import { liveChosenKeys } from "./ChosenTodayParts";
import { dayKey } from "../../session/swap";

const NOW = new Date(2026, 10, 22, 0, 1).getTime();
const YESTERDAY = new Date(2026, 10, 21, 23, 59).getTime();
const LAST_WEEK = new Date(2026, 10, 14, 12, 0).getTime();

describe("liveChosenKeys", () => {
  it("today's and yesterday's keys are built; older ones and none are not", () => {
    expect(liveChosenKeys({ day: dayKey(NOW), keys: ["a"] }, NOW)).toEqual(["a"]);
    expect(liveChosenKeys({ day: dayKey(YESTERDAY), keys: ["b"] }, NOW)).toEqual(["b"]);
    expect(liveChosenKeys({ day: dayKey(LAST_WEEK), keys: ["c"] }, NOW)).toEqual([]);
    expect(liveChosenKeys({ day: "2020-01-01", keys: ["d"] }, NOW)).toEqual([]);
    expect(liveChosenKeys(null, NOW)).toEqual([]);
  });

  it("yesterday is the calendar day before, also on a 23-hour day (DST)", () => {
    // 30 March 2026, 00:30: a day after the spring change in much of Europe.
    const after = new Date(2026, 2, 30, 0, 30).getTime();
    expect(liveChosenKeys({ day: "2026-03-29", keys: ["e"] }, after)).toEqual(["e"]);
  });
});
