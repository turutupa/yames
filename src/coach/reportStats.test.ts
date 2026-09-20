import { describe, expect, it } from "vitest";

import {
  accuracyPct,
  accuracyRatio,
  bandForScore,
  commentForScore,
  computeLegacyScore,
  feedbackToneForScore,
  gradeForScore,
  scoredBeats,
} from "./reportStats";

/**
 * The accuracy denominator is the #1 source of "subtle correctness"
 * bugs in this codebase: it MUST be `hits + miss`, NOT `totalBeats`.
 * These tests pin both helpers' semantics so the call sites that
 * delegate to them inherit correctness for free.
 */
describe("scoredBeats", () => {
  it("returns hits + miss", () => {
    expect(scoredBeats({ hitsCount: 7, missCount: 3 })).toBe(10);
  });

  it("returns 0 when nothing was scored", () => {
    expect(scoredBeats({ hitsCount: 0, missCount: 0 })).toBe(0);
  });

  it("ignores other fields on the report-like object", () => {
    // The helper accepts anything structurally compatible with
    // ScoredFields; the real SessionReport carries dozens of fields.
    // This pins the shape to just the two we care about.
    const reportish = {
      hitsCount: 4,
      missCount: 1,
      totalBeats: 999, // must be ignored
      foo: "bar",
    };
    expect(scoredBeats(reportish)).toBe(5);
  });
});

describe("accuracyPct", () => {
  it("returns hits / (hits + miss) as a rounded integer percentage", () => {
    // 7 / 10 = 70%
    expect(accuracyPct({ hitsCount: 7, missCount: 3 })).toBe(70);
  });

  it("returns 100 when every scored beat was a hit", () => {
    expect(accuracyPct({ hitsCount: 5, missCount: 0 })).toBe(100);
  });

  it("returns 0 when every scored beat was a miss", () => {
    expect(accuracyPct({ hitsCount: 0, missCount: 5 })).toBe(0);
  });

  it("returns 0 (not NaN) when no beats were attempted", () => {
    // The bug we're guarding against: division by zero leaking into
    // string templates as "NaN%". This was specifically the failure
    // mode on sessions that ended before any onsets crossed the gate.
    expect(accuracyPct({ hitsCount: 0, missCount: 0 })).toBe(0);
  });

  it("rounds (does not truncate) to the nearest integer percent", () => {
    // 2 / 3 = 66.666...% → 67 (Math.round, NOT Math.floor)
    expect(accuracyPct({ hitsCount: 2, missCount: 1 })).toBe(67);
  });

  it("does NOT use totalBeats as the denominator (regression)", () => {
    // The previously-shipped bug: dividing by totalBeats instead of
    // (hits + miss) shows artificially low accuracy whenever the
    // player rested or played below the noise floor. The helper
    // must IGNORE totalBeats entirely.
    const report = {
      hitsCount: 10,
      missCount: 0,
      totalBeats: 100, // would yield 10% if used as denom
    };
    expect(accuracyPct(report)).toBe(100);
  });
});

describe("accuracyRatio", () => {
  // accuracyRatio returns a fraction in [0, 1] for callers that need
  // to compare against thresholds (e.g. MIN_SEGMENT_HIT_RATE_FOR_REPORT)
  // rather than render a percentage. accuracyPct is a thin wrapper.
  it("returns hits / (hits + miss) as a fraction", () => {
    expect(accuracyRatio({ hitsCount: 7, missCount: 3 })).toBe(0.7);
  });

  it("returns 1 when every scored beat was a hit", () => {
    expect(accuracyRatio({ hitsCount: 5, missCount: 0 })).toBe(1);
  });

  it("returns 0 (not NaN) when no beats were attempted", () => {
    // Same denominator-of-zero guard as accuracyPct — but here the
    // 0 floor matters because thresholding `NaN >= 0.4` would always
    // be false, silently hiding "no beats yet" sessions instead of
    // letting them fall to the explicit zero floor.
    expect(accuracyRatio({ hitsCount: 0, missCount: 0 })).toBe(0);
  });

  it("ignores totalBeats just like accuracyPct (regression)", () => {
    const report = {
      hitsCount: 10,
      missCount: 0,
      totalBeats: 100,
    };
    expect(accuracyRatio(report)).toBe(1);
  });

  it("accuracyPct is consistent with Math.round(accuracyRatio * 100)", () => {
    // 2 / 3 = 0.6666... → accuracyPct rounds to 67
    const r = { hitsCount: 2, missCount: 1 };
    expect(accuracyPct(r)).toBe(Math.round(accuracyRatio(r) * 100));
  });
});

describe("computeLegacyScore", () => {
  // The two saved sessions that originally exposed the demotivating
  // scoring inconsistency on 2026-05-17 (80 BPM 16ths, back-to-back
  // sessions of the same exercise). Pinning them here so a future
  // refactor of the formula can't silently regress the relative order.
  it("scores the better-metrics 80bpm session strictly above the worse one", () => {
    // c847c91b — 75% acc, streak 30, stddev 23.6ms (PIC 1)
    const pic1 = computeLegacyScore({
      hitsCount: 200,
      missCount: 66,
      perfectCount: 83,
      goodCount: 100,
      okCount: 17,
      stdDeviationMs: 23.59,
    });
    // 6c920ad0 — 69% acc, streak 23, stddev 22.0ms (PIC 2)
    const pic2 = computeLegacyScore({
      hitsCount: 225,
      missCount: 102,
      perfectCount: 99,
      goodCount: 110,
      okCount: 16,
      stdDeviationMs: 22.05,
    });
    // Pic 1 has higher hit rate, longer streak, similar quality — it
    // SHOULD rank at least as high as Pic 2. Backend's segment-aware
    // path gave 27 vs 72 (the bug); legacy formula gives ~74 vs ~72.
    expect(pic1).toBeGreaterThanOrEqual(pic2);
    expect(pic1).toBeGreaterThanOrEqual(70); // at least a "B"
    expect(pic1).toBeLessThanOrEqual(100);
  });

  it("returns 0 for a totally empty report (no NaN/Infinity)", () => {
    expect(
      computeLegacyScore({
        hitsCount: 0,
        missCount: 0,
        perfectCount: 0,
        goodCount: 0,
        okCount: 0,
        stdDeviationMs: 0,
      }),
    ).toBe(20); // 0.2 weight × 1.0 consistency-with-zero-stddev × 100
  });

  it("clamps to [0, 100]", () => {
    // Pathological: stddev is enormous, should not produce a negative.
    const v = computeLegacyScore({
      hitsCount: 0,
      missCount: 100,
      perfectCount: 0,
      goodCount: 0,
      okCount: 0,
      stdDeviationMs: 9999,
    });
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });

  it("perfect run lands ≥ 95 (S-grade band)", () => {
    const v = computeLegacyScore({
      hitsCount: 100,
      missCount: 0,
      perfectCount: 100,
      goodCount: 0,
      okCount: 0,
      stdDeviationMs: 2,
    });
    expect(v).toBeGreaterThanOrEqual(95);
  });
});

describe("gradeForScore", () => {
  // Band boundaries pinned to match the Rust report
  // (session.rs::report) so the JS-side override stays in lockstep.
  it.each([
    [100, "S"],
    [95, "S"],
    [94, "A"],
    [85, "A"],
    [84, "B"],
    [70, "B"],
    [69, "C"],
    [55, "C"],
    [54, "D"],
    [40, "D"],
    [39, "F"],
    [0, "F"],
  ])("score %i → grade %s", (score, grade) => {
    expect(gradeForScore(score)).toBe(grade);
  });
});

describe("commentForScore", () => {
  // Strings mirror `session.rs::generate_comment` arm-for-arm; the
  // multi-segment JS aggregator goes through this helper so the
  // comment shape stays identical to a single-segment session that
  // happened to land on the same score.

  it("returns the 'not enough data' line below the scored-beats floor", () => {
    expect(commentForScore(50, 7)).toMatch(/Not enough data/i);
    expect(commentForScore(95, 0)).toMatch(/Not enough data/i);
  });

  it("returns the perfect line at score 100", () => {
    expect(commentForScore(100, 50)).toMatch(/Flawless/i);
  });

  it("returns the near-perfect line for S-grade non-100", () => {
    expect(commentForScore(96, 50)).toMatch(/near-perfect/i);
  });

  it.each([
    [90, /Solid/i],         // A
    [75, /Good work/i],     // B
    [60, /foundation/i],    // C
    [45, /Slow down/i],     // D
    [20, /muscle memory/i], // F
  ])("score %i returns grade-appropriate copy", (score, expected) => {
    expect(commentForScore(score, 50)).toMatch(expected);
  });

  it("produces a distinct string for every grade band on a real-sized session", () => {
    // Regression for the original bug: every multi-segment session
    // produced the same `"N segments played"` regardless of score.
    // The fix MUST emit visibly different comments across the bands.
    const comments = new Set([
      commentForScore(100, 50),
      commentForScore(96, 50),
      commentForScore(90, 50),
      commentForScore(75, 50),
      commentForScore(60, 50),
      commentForScore(45, 50),
      commentForScore(20, 50),
    ]);
    expect(comments.size).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// One table for what a score means (ROADMAP 1.7, P3-COACH-3)
// ---------------------------------------------------------------------------

describe("bandForScore", () => {
  it("puts each boundary in the band that starts at it", () => {
    expect(bandForScore(100)).toBe("flawless");
    expect(bandForScore(95)).toBe("flawless");
    expect(bandForScore(94)).toBe("strong");
    expect(bandForScore(85)).toBe("strong");
    expect(bandForScore(84)).toBe("solid");
    expect(bandForScore(70)).toBe("solid");
    expect(bandForScore(69)).toBe("fair");
    expect(bandForScore(55)).toBe("fair");
    expect(bandForScore(54)).toBe("building");
    expect(bandForScore(40)).toBe("building");
    expect(bandForScore(39)).toBe("early");
    expect(bandForScore(0)).toBe("early");
  });

  it("never disagrees with the letter grade the Rust report uses", () => {
    // `gradeForScore` is pinned to `session.rs::report`. If these two
    // drift, the coach is saying two things about one session.
    const expected: Record<string, string> = {
      flawless: "S",
      strong: "A",
      solid: "B",
      fair: "C",
      building: "D",
      early: "F",
    };
    for (let score = 0; score <= 100; score++) {
      expect(gradeForScore(score), `score ${score}`).toBe(expected[bandForScore(score)]);
    }
  });
});

describe("feedbackToneForScore", () => {
  it("collapses six bands onto the four beat colours, in order", () => {
    expect(feedbackToneForScore(96)).toBe("perfect");
    expect(feedbackToneForScore(85)).toBe("perfect");
    expect(feedbackToneForScore(84)).toBe("good");
    expect(feedbackToneForScore(70)).toBe("good");
    expect(feedbackToneForScore(69)).toBe("ok");
    expect(feedbackToneForScore(55)).toBe("ok");
    expect(feedbackToneForScore(54)).toBe("miss");
    expect(feedbackToneForScore(0)).toBe("miss");
  });

  it("is monotonic — a better score never gets a worse colour", () => {
    const rank = { miss: 0, ok: 1, good: 2, perfect: 3 };
    let previous = -1;
    for (let score = 0; score <= 100; score++) {
      const current = rank[feedbackToneForScore(score)];
      expect(current, `score ${score}`).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});
