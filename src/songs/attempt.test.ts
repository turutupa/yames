// An attempt is play-to-stop, and it is one thing.
//
// The two rules that cost something if they are wrong: the last segment
// SUPERSEDES the ones before it (the analyzer's run accumulates, so adding
// them up counts every note as many times as the player paused), and an
// attempt under the floor is not saved at all.
import { describe, expect, it } from "vitest";
import {
  MIN_SCORED_ONSETS,
  attemptFacts,
  attemptRecord,
  countScored,
  isAttemptWorthKeeping,
  newAttemptId,
  resultsFromSegment,
  resultsFromStored,
} from "./attempt";
import type { PracticeSegmentEndedPayload } from "../ipc";
import type { OnsetResult } from "./types";

function hit(id: number, deviationMs: number, pass = 0): OnsetResult {
  return { id, state: "hit", deviationMs, pass };
}
function miss(id: number, pass = 0): OnsetResult {
  return { id, state: "miss", deviationMs: null, pass };
}
function soft(id: number, pass = 0): OnsetResult {
  return { id, state: "softAbsent", deviationMs: null, pass };
}

function segment(results: OnsetResult[], extras: { beat: number; pass: number }[] = []) {
  return {
    startMs: 0,
    endMs: 1000,
    score: 77,
    componentScores: { intervalConsistency: 0, gridAlignment: 0, hitCompleteness: 0, onsetEfficiency: 0 },
    bpm: 120,
    instrument: "electric-guitar",
    endReason: "userStopped",
    onsetCount: results.length,
    beatCount: 8,
    totalOnsets: results.length,
    spuriousOnsets: 0,
    onsetEfficiency: 1,
    inferredDivisor: 1,
    inferredDivisorConfidence: 1,
    playMode: "structured",
    onsetResults: results,
    extraOnsets: extras,
  } as unknown as PracticeSegmentEndedPayload;
}

describe("what a segment hands over", () => {
  it("says nothing at all in free play", () => {
    const free = segment([]);
    delete (free as { onsetResults?: unknown }).onsetResults;
    expect(resultsFromSegment(free)).toBeNull();
  });

  it("takes the run whole, because that is what the analyzer reports", () => {
    const run = resultsFromSegment(segment([hit(0, 3), hit(1, -4)], [{ beat: 1.5, pass: 0 }]));
    expect(run?.results).toHaveLength(2);
    expect(run?.extras).toHaveLength(1);
    expect(run?.score).toBe(77);
  });

  /**
   * The bug this prevents: a player who paused mid-pass closes a segment, and
   * a review that appended would count everything before the pause twice. The
   * hook keeps the LAST payload, so this is a test that the shape supports
   * that — the results come back as they arrived, never merged.
   */
  it("copies rather than aliasing, so the next segment cannot edit the last", () => {
    const results = [hit(0, 3)];
    const run = resultsFromSegment(segment(results))!;
    results.push(hit(1, 9));
    expect(run.results).toHaveLength(1);
  });
});

describe("the eight-onset floor", () => {
  it("does not count a soft onset that never arrived", () => {
    const results = [...Array.from({ length: 8 }, (_, i) => soft(i))];
    expect(countScored(results)).toBe(0);
    expect(isAttemptWorthKeeping(results)).toBe(false);
  });

  it("is eight, and seven is not enough", () => {
    expect(MIN_SCORED_ONSETS).toBe(8);
    const seven = Array.from({ length: 7 }, (_, i) => hit(i, 0));
    expect(isAttemptWorthKeeping(seven)).toBe(false);
    expect(isAttemptWorthKeeping([...seven, miss(7)])).toBe(true);
  });

  it("counts a miss — a passage you dropped is still a passage you played", () => {
    const results = Array.from({ length: 8 }, (_, i) => miss(i));
    expect(isAttemptWorthKeeping(results)).toBe(true);
  });
});

describe("the facts a sentence and a row are built from", () => {
  const run = {
    results: [
      hit(0, 10, 0),
      hit(1, -10, 0),
      hit(2, 30, 0),
      miss(3, 0),
      soft(4, 0),
      hit(0, 6, 1),
      hit(1, -2, 1),
    ],
    extras: [{ beat: 2.5, pass: 1 }],
    score: 80,
  };

  it("counts the passes from the highest one anybody reported", () => {
    expect(attemptFacts(run).passes).toBe(2);
  });

  it("separates what was missed from what was never due", () => {
    const facts = attemptFacts(run);
    expect(facts.hits).toBe(5);
    expect(facts.misses).toBe(1);
    expect(facts.softAbsent).toBe(1);
    expect(facts.scoredOnsets).toBe(6);
  });

  it("averages only the notes that landed", () => {
    // (10 - 10 + 30 + 6 - 2) / 5
    expect(attemptFacts(run).meanDevMs).toBeCloseTo(6.8, 5);
  });

  /**
   * MAD, not standard deviation — the same estimator the Rust scorer uses,
   * and for the same reason: one wild note must not decide how steady the
   * pass was. Deviations sorted: -10, -2, 6, 10, 30 → median 6; distances
   * 16, 8, 0, 4, 24 → sorted 0, 4, 8, 16, 24 → median 8.
   */
  it("measures the spread with a median, so one wild note cannot decide it", () => {
    expect(attemptFacts(run).madMs).toBeCloseTo(8, 5);
  });

  it("survives a pass where nothing landed", () => {
    const facts = attemptFacts({ results: [miss(0), miss(1)], extras: [], score: 0 });
    expect(facts.meanDevMs).toBe(0);
    expect(facts.madMs).toBe(0);
    expect(facts.passes).toBe(1);
  });
});

describe("the row that reaches the store", () => {
  it("carries the range, the tempo and every verdict", () => {
    const facts = attemptFacts({ results: [hit(0, 5), soft(1)], extras: [{ beat: 1, pass: 0 }], score: 90 });
    const row = attemptRecord({
      id: "a1",
      scoreId: "song-1",
      startedAt: 1_700_000_000_000,
      range: { startBar: 16, endBar: 23 },
      tempoPercent: 70,
      facts,
    });
    expect(row.rangeStartBar).toBe(16);
    expect(row.rangeEndBar).toBe(23);
    expect(row.tempoPercent).toBe(70);
    expect(row.onsets).toHaveLength(2);
    expect(row.extraOnsets).toHaveLength(1);
    expect(row.score).toBe(90);
  });

  it("leaves out what it has nothing to say about", () => {
    const facts = attemptFacts({ results: [hit(0, 5)], extras: [], score: 90 });
    const row = attemptRecord({
      id: "a1",
      scoreId: "s",
      startedAt: 0,
      range: { startBar: 0, endBar: 1 },
      tempoPercent: 100,
      facts,
    });
    expect("sessionId" in row).toBe(false);
    expect("takePath" in row).toBe(false);
    expect("accentHeard" in row.onsets![0]).toBe(false);
  });

  it("goes there and back without losing a verdict", () => {
    const facts = attemptFacts({
      results: [{ id: 0, state: "hit", deviationMs: 5, pass: 0, accentHeard: false }, soft(1)],
      extras: [{ beat: 2, pass: 0 }],
      score: 88,
    });
    const row = attemptRecord({
      id: "a1",
      scoreId: "s",
      startedAt: 0,
      range: { startBar: 0, endBar: 1 },
      tempoPercent: 100,
      facts,
    });
    const back = resultsFromStored(row);
    expect(back.results).toEqual(facts.results);
    expect(back.extras).toEqual(facts.extras);
    expect(back.score).toBe(88);
  });
});

describe("attempt ids", () => {
  it("are never the same twice", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newAttemptId()));
    expect(ids.size).toBe(50);
  });
});
