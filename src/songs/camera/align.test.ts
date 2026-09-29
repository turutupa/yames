/**
 * Two takes of the same bars, on one axis — and the axis is bars.
 *
 * The one thing these tests are for: **the same bar position lands on the
 * same MUSIC in two passes played at different speeds.** That is the whole
 * claim then-and-now makes, it is the reason the comparison is not locked to
 * seconds, and it is not something anybody can check by watching two videos
 * and squinting.
 */
import { describe, expect, it } from "vitest";
import { barAtMs, barSpanMs, msAtBar, overlapOf } from "./align";
import type { SongScore } from "../types";

/** Four bars of 4/4 at 120 — `tape.test.ts`'s fixture. */
function score(): SongScore {
  return {
    schema: 1,
    id: "s",
    title: "Four bars",
    artist: "",
    source: { fileName: "f.alphatex", format: "alphatex", trackIndex: 0, trackName: "Lead" },
    tuning: [64, 59, 55, 50, 45, 40],
    capo: 0,
    ticksPerQuarter: 960,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: [
      { index: 0, startTick: 0, lengthTicks: 3840, printedBar: 0 },
      { index: 1, startTick: 3840, lengthTicks: 3840, printedBar: 1 },
      { index: 2, startTick: 7680, lengthTicks: 3840, printedBar: 2 },
      { index: 3, startTick: 11520, lengthTicks: 3840, printedBar: 3 },
    ],
    notes: [],
    sections: [],
  };
}

/** Bars 3 and 4 in 3/4, after two of 4/4 — a range whose bars differ. */
function mixedScore(): SongScore {
  return {
    ...score(),
    meterMap: [
      { bar: 0, numerator: 4, denominator: 4 },
      { bar: 2, numerator: 3, denominator: 4 },
    ],
    bars: [
      { index: 0, startTick: 0, lengthTicks: 3840, printedBar: 0 },
      { index: 1, startTick: 3840, lengthTicks: 3840, printedBar: 1 },
      { index: 2, startTick: 7680, lengthTicks: 2880, printedBar: 2 },
      { index: 3, startTick: 10560, lengthTicks: 2880, printedBar: 3 },
    ],
  };
}

const ALL = { startBar: 0, endBar: 3 };

describe("bar positions", () => {
  it("is the round trip, at any tempo", () => {
    for (const percent of [100, 70, 50, 137]) {
      for (const bar of [0, 0.5, 1, 2.25, 3, 3.99]) {
        const ms = msAtBar(score(), ALL, percent, bar);
        expect(
          barAtMs(score(), ALL, percent, ms),
          `${String(percent)}% at bar ${String(bar)}`,
        ).toBeCloseTo(bar, 6);
      }
    }
  });

  /**
   * The claim then-and-now is built on.
   *
   * A run at 70 % and a run at 100 % are the same music at different speeds.
   * Bar 2.5 is the middle of the third bar in both — eleven seconds into one
   * recording and eight into the other — and a comparison locked to seconds
   * would be showing two different places in the piece.
   */
  it("puts the same bar on the same music at two different speeds", () => {
    const slow = msAtBar(score(), ALL, 70, 2.5);
    const fast = msAtBar(score(), ALL, 100, 2.5);
    expect(slow).toBeGreaterThan(fast);
    // Exactly the ratio of the two tempos, which is what "the same music"
    // means when nothing but the speed differs.
    expect(slow / fast).toBeCloseTo(100 / 70, 6);
    expect(barAtMs(score(), ALL, 70, slow)).toBeCloseTo(2.5, 6);
    expect(barAtMs(score(), ALL, 100, fast)).toBeCloseTo(2.5, 6);
  });

  it("knows a bar line from the middle of a bar", () => {
    // Four bars of 4/4 at 120: two seconds each.
    expect(msAtBar(score(), ALL, 100, 0)).toBeCloseTo(0, 6);
    expect(msAtBar(score(), ALL, 100, 1)).toBeCloseTo(2000, 6);
    expect(msAtBar(score(), ALL, 100, 2.5)).toBeCloseTo(5000, 6);
    expect(barAtMs(score(), ALL, 100, 5000)).toBeCloseTo(2.5, 6);
    // The instant a bar line falls belongs to the bar it OPENS, not to the
    // one it closes — the difference between "bar 2" and "bar 1" on screen.
    expect(barAtMs(score(), ALL, 100, 2000)).toBeCloseTo(1, 6);
  });

  it("follows bars of different lengths rather than assuming one", () => {
    // Two bars of 4/4 then two of 3/4, at 120: 2 s, 2 s, 1.5 s, 1.5 s.
    const mixed = mixedScore();
    expect(msAtBar(mixed, ALL, 100, 2)).toBeCloseTo(4000, 6);
    expect(msAtBar(mixed, ALL, 100, 3)).toBeCloseTo(5500, 6);
    expect(barAtMs(mixed, ALL, 100, 4750)).toBeCloseTo(2.5, 6);
    expect(barSpanMs(mixed, ALL, 100, 0)).toBeCloseTo(2000, 6);
    expect(barSpanMs(mixed, ALL, 100, 2)).toBeCloseTo(1500, 6);
  });

  it("clamps rather than seeking off either end of the take", () => {
    // A take asked about a bar it never played gets the nearest moment it
    // did. The alternative is a negative `currentTime` or a seek past the
    // end, and a media element does something different with each.
    expect(msAtBar(score(), ALL, 100, -5)).toBeCloseTo(0, 6);
    expect(msAtBar(score(), ALL, 100, 99)).toBeCloseTo(8000, 6);
    expect(barAtMs(score(), ALL, 100, 99_999)).toBeCloseTo(4, 6);
  });

  it("works within a range that is not the whole song", () => {
    // Bars 3–4 alone: bar 2 is the start of the range, so it is at zero.
    const range = { startBar: 2, endBar: 3 };
    expect(msAtBar(score(), range, 100, 2)).toBeCloseTo(0, 6);
    expect(msAtBar(score(), range, 100, 3)).toBeCloseTo(2000, 6);
    expect(barAtMs(score(), range, 100, 1000)).toBeCloseTo(2.5, 6);
  });
});

describe("where two runs agree", () => {
  it("is the overlap, and nothing when there is none", () => {
    expect(overlapOf({ startBar: 0, endBar: 7 }, { startBar: 4, endBar: 11 })).toEqual({
      startBar: 4,
      endBar: 7,
    });
    // Touching at one bar is still an overlap: one bar is a comparison.
    expect(overlapOf({ startBar: 0, endBar: 4 }, { startBar: 4, endBar: 8 })).toEqual({
      startBar: 4,
      endBar: 4,
    });
    expect(overlapOf({ startBar: 0, endBar: 3 }, { startBar: 4, endBar: 8 })).toBeNull();
  });
});
