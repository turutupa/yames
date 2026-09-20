/**
 * The progress line — the decision about what a point IS, pinned.
 *
 * The attempt's own stored score, one point a day and the best of that day,
 * oldest first, and only attempts that overlap the bars being asked about.
 */
import { describe, expect, it } from "vitest";
import { progressPoints } from "./progress";
import type { ScoredAttempt } from "./progress";

/** Noon local, so a test never straddles a midnight of its own making. */
function at(day: number, hour = 12): number {
  const d = new Date(2026, 8, day, hour, 0, 0);
  return d.getTime();
}

function attempt(over: Partial<ScoredAttempt> = {}): ScoredAttempt {
  return { startedAt: at(1), rangeStartBar: 16, rangeEndBar: 23, score: 70, ...over };
}

describe("one point a day, and it is the best of the day", () => {
  it("keeps the best of six goes rather than drawing a sawtooth", () => {
    const points = progressPoints(
      [
        attempt({ startedAt: at(1, 9), score: 51 }),
        attempt({ startedAt: at(1, 10), score: 64 }),
        attempt({ startedAt: at(1, 11), score: 58 }),
      ],
      16,
      23,
    );
    expect(points).toEqual([{ at: expect.any(String), percent: 64 }]);
  });

  it("reads left to right the way the weeks went", () => {
    const points = progressPoints(
      [
        attempt({ startedAt: at(9), score: 80 }),
        attempt({ startedAt: at(1), score: 55 }),
        attempt({ startedAt: at(4), score: 71 }),
      ],
      16,
      23,
    );
    expect(points.map((p) => p.percent)).toEqual([55, 71, 80]);
    expect(points.map((p) => p.at)).toEqual([...points.map((p) => p.at)].sort());
  });

  it("counts days on the player's own calendar, not on UTC's", () => {
    // Late one evening and early the next morning, local: two days.
    const points = progressPoints(
      [
        attempt({ startedAt: at(1, 23), score: 60 }),
        attempt({ startedAt: at(2, 1), score: 62 }),
      ],
      16,
      23,
    );
    expect(points).toHaveLength(2);
  });
});

describe("which attempts are on the line", () => {
  it("counts a whole run-through as a reading of the bars inside it", () => {
    const points = progressPoints(
      [attempt({ rangeStartBar: 0, rangeEndBar: 120, score: 66 })],
      16,
      23,
    );
    expect(points).toEqual([{ at: expect.any(String), percent: 66 }]);
  });

  it("leaves out an attempt at bars this passage does not contain", () => {
    expect(progressPoints([attempt({ rangeStartBar: 0, rangeEndBar: 7 })], 16, 23)).toEqual([]);
    expect(progressPoints([attempt({ rangeStartBar: 24, rangeEndBar: 31 })], 16, 23)).toEqual([]);
    // Touching at one bar is overlapping.
    expect(progressPoints([attempt({ rangeStartBar: 23, rangeEndBar: 31 })], 16, 23)).toHaveLength(
      1,
    );
  });

  it("drops a score that is not a number rather than drawing a gap", () => {
    expect(progressPoints([attempt({ score: NaN })], 16, 23)).toEqual([]);
  });

  it("has nothing to say about a passage nobody has played", () => {
    expect(progressPoints([], 16, 23)).toEqual([]);
  });
});
