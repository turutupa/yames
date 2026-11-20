import { describe, expect, it } from "vitest";
import { loopButtonLine, loopHeardOf, loopLine, loopTitleLine } from "./loopLine";
import type { LoopRound } from "./loopLine";

function rounds(...missed: Array<number | null>): Map<number, LoopRound> {
  // null: a round cut short by the stop (two of four onsets seen).
  return new Map(missed.map((m, i) => [i, m === null ? { seen: 2, missed: 0 } : { seen: 4, missed: m }]));
}

describe("what a loop heard", () => {
  it("counts whole rounds only, and the landed ones last in a row", () => {
    expect(loopHeardOf(rounds(1, 0, 0, 0, null), 4)).toEqual({ rounds: 4, landed: 3, lastRun: 3 });
    expect(loopHeardOf(rounds(0, 1), 4)).toEqual({ rounds: 2, landed: 1, lastRun: 0 });
    expect(loopHeardOf(rounds(null), 4)).toBeNull();
    expect(loopHeardOf(new Map(), 4)).toBeNull();
    expect(loopHeardOf(rounds(0), 0)).toBeNull();
  });
});

describe("the loop's words", () => {
  it("the button follows the bar", () => {
    expect(loopButtonLine({ fromBar: 1, toBar: 1 })).toEqual({ key: "session.loop.button.first", values: {} });
    expect(loopButtonLine({ fromBar: 3, toBar: 3 })).toEqual({ key: "session.loop.button.bar", values: { bar: 3 } });
    expect(loopButtonLine({ fromBar: 2, toBar: 3 })).toEqual({ key: "session.loop.button.bars", values: { from: 2, to: 3 } });
    expect(loopTitleLine({ fromBar: 1, toBar: 2 }).key).toBe("session.loop.title.bars");
  });

  it("after it: the last rounds in a row, else how many of them, and nothing ungraded or unheard", () => {
    const one = { fromBar: 1, toBar: 1 };
    expect(loopLine({ rounds: 5, landed: 4, lastRun: 3 }, one, true)).toEqual({
      key: "session.loop.after.lastBar",
      values: { bar: 1, count: 3 },
    });
    expect(loopLine({ rounds: 5, landed: 2, lastRun: 1 }, { fromBar: 2, toBar: 3 }, true)).toEqual({
      key: "session.loop.after.ofBars",
      values: { from: 2, to: 3, landed: 2, count: 5 },
    });
    expect(loopLine({ rounds: 5, landed: 4, lastRun: 3 }, one, false)).toBeNull();
    expect(loopLine(null, one, true)).toBeNull();
  });
});
