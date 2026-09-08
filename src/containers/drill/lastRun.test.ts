/**
 * Matching a past run to tonight's plan (UI_DECISIONS U3.3).
 *
 * These lock in the judgement calls rather than the arithmetic, because the
 * arithmetic is trivial and the judgement is the whole feature: a misaligned
 * underlay is worse than no underlay, so the interesting assertions here are
 * the ones about what is NOT drawn.
 */
import { describe, it, expect } from "vitest";
import type { DrillRun } from "../../types";
import { calendarDaysAgo, isComparable, pickUnderlay, underlayFor } from "./lastRun";

const NOW = new Date(2026, 8, 7, 20, 0, 0).getTime();
const at = (daysAgo: number) => NOW - daysAgo * 86_400_000;

/** A run of 80→120 by 5, twelve bars a step, stopped five bars into 110. */
function run(over: Partial<DrillRun> = {}): DrillRun {
  return {
    id: "r1",
    timestamp: at(4),
    startBpm: 80,
    targetBpm: 120,
    increment: 5,
    decrement: 3,
    barsPerStep: 12,
    beatsPerBar: 4,
    subdivision: 1,
    mode: "linear",
    cyclic: false,
    reachedStep: 6,
    reachedBar: 5,
    reachedBpm: 110,
    completed: false,
    reach: [
      { bpm: 80, bars: 12 },
      { bpm: 85, bars: 12 },
      { bpm: 90, bars: 12 },
      { bpm: 95, bars: 12 },
      { bpm: 100, bars: 12 },
      { bpm: 105, bars: 12 },
      { bpm: 110, bars: 5 },
    ],
    ...over,
  };
}

const plan = { barsPerStep: 12, beatsPerBar: 4, subdivision: 1 };
const tonight = [80, 85, 90, 95, 100, 105, 110, 115, 120];

describe("isComparable", () => {
  it("accepts a run whose route changed but whose exercise did not", () => {
    // Nudging the target from 120 to 140 does not make last night a different
    // exercise. Requiring the plan to match exactly would throw away every
    // run you had done the moment you touched a number.
    expect(isComparable(run({ targetBpm: 140, increment: 10, mode: "zigzag" }), plan)).toBe(
      true,
    );
  });

  it("rejects a run where one cell means something else", () => {
    // These three are what a cell IS: how many of them a column holds, how
    // long one is, and what you were playing inside it.
    expect(isComparable(run({ barsPerStep: 8 }), plan)).toBe(false);
    expect(isComparable(run({ beatsPerBar: 3 }), plan)).toBe(false);
    expect(isComparable(run({ subdivision: 2 }), plan)).toBe(false);
  });
});

describe("underlayFor", () => {
  it("puts the bars under the tempo they were played at, not under the column index", () => {
    // The point of the whole module. Tonight starts at 90, so tonight's first
    // column is last night's third — and index matching would have credited
    // 90 with the bars played at 80.
    const u = underlayFor(run(), [90, 100, 110, 120, 130], plan, NOW);
    expect(u?.barsPerColumn).toEqual([12, 12, 5, 0, 0]);
  });

  it("draws nothing over tempos the run never played", () => {
    const u = underlayFor(run(), tonight, plan, NOW);
    expect(u?.barsPerColumn.slice(7)).toEqual([0, 0]);
  });

  it("returns null rather than an empty picture when the ladders never meet", () => {
    // 82, 87… shares no tempo with 80, 85… An underlay of all zeroes would
    // read as "you got nowhere", which is a different claim from "there is no
    // record of this".
    expect(underlayFor(run(), [125, 130, 135], plan, NOW)).toBeNull();
    expect(underlayFor(run(), [82, 87, 92], plan, NOW)).toBeNull();
  });

  it("returns null for a run recorded before bars-per-tempo existed", () => {
    expect(underlayFor(run({ reach: [] }), tonight, plan, NOW)).toBeNull();
  });

  it("never lets a column claim more bars than it has cells", () => {
    // A run whose step was longer than tonight's is not comparable at all, so
    // the only way this happens is a corrupt record — and a cell that does
    // not exist must not be filled.
    const u = underlayFor(run({ reach: [{ bpm: 80, bars: 99 }] }), tonight, plan, NOW);
    expect(u?.barsPerColumn[0]).toBe(12);
  });

  it("takes the best visit to a tempo, not the sum of them", () => {
    // A zigzag or a cyclic ramp passes 90 more than once. The question the
    // column answers is how far you got there; summing would overflow a
    // column that only holds `barsPerStep` cells.
    const u = underlayFor(
      run({
        mode: "zigzag",
        reach: [
          { bpm: 80, bars: 12 },
          { bpm: 90, bars: 9 },
        ],
      }),
      [80, 90],
      plan,
      NOW,
    );
    expect(u?.barsPerColumn).toEqual([12, 9]);
  });

  it("puts the wall at the far end of tonight's route, not at the highest tempo", () => {
    // A descending drill's wall is its SLOWEST step. Reading "the wall" as
    // "the top of the chart" would put it at the start line.
    const down = run({
      startBpm: 120,
      targetBpm: 80,
      reach: [
        { bpm: 120, bars: 12 },
        { bpm: 115, bars: 12 },
        { bpm: 110, bars: 4 },
      ],
    });
    const u = underlayFor(down, [120, 115, 110, 105, 100], plan, NOW);
    expect(u?.wallStep).toBe(2);
    expect(u?.wallBpm).toBe(110);
    expect(u?.wallBar).toBe(4);
    // And the sentence follows the run's own direction too.
    expect(u?.furthestBpm).toBe(110);
    expect(u?.furthestBars).toBe(4);
  });

  it("reports where the RUN got to, even when tonight's plan stops short of it", () => {
    // Tonight only goes to 100. The picture cannot show 110, but the sentence
    // still should — "you got to 110 last time" is exactly the thing worth
    // knowing when tonight's target is lower.
    const u = underlayFor(run(), [80, 85, 90, 95, 100], plan, NOW);
    expect(u?.wallBpm).toBe(100);
    expect(u?.furthestBpm).toBe(110);
    expect(u?.furthestBars).toBe(5);
  });

  it("names the step it actually played when the run stopped on a step boundary", () => {
    // `reachedBpm` is 115 with zero bars on it — reading the sentence off
    // that would say "you got 0 bars into 115".
    const u = underlayFor(
      run({ reachedBpm: 115, reachedBar: 0 }),
      tonight,
      plan,
      NOW,
    );
    expect(u?.furthestBpm).toBe(110);
    expect(u?.furthestBars).toBe(5);
  });
});

describe("pickUnderlay", () => {
  it("means the last run OF THIS EXERCISE, not the last time you pressed start", () => {
    const yesterdaysOtherDrill = run({
      id: "other",
      timestamp: at(1),
      beatsPerBar: 3,
      reach: [{ bpm: 80, bars: 12 }],
    });
    const u = pickUnderlay([yesterdaysOtherDrill, run()], tonight, plan, NOW);
    expect(u?.daysAgo).toBe(4);
    expect(u?.wallBpm).toBe(110);
  });

  it("skips a comparable run that says nothing about tonight's tempos", () => {
    const comparableButElsewhere = run({
      id: "elsewhere",
      timestamp: at(1),
      reach: [{ bpm: 140, bars: 12 }],
    });
    const u = pickUnderlay([comparableButElsewhere, run()], tonight, plan, NOW);
    expect(u?.daysAgo).toBe(4);
  });

  it("admits it has no history rather than inventing one", () => {
    expect(pickUnderlay([], tonight, plan, NOW)).toBeNull();
  });
});

describe("calendarDaysAgo", () => {
  it("counts midnights, not hours", () => {
    // Played at 11pm, looked at at 8am: that is yesterday, not today.
    const lateLastNight = new Date(2026, 8, 6, 23, 0, 0).getTime();
    const thisMorning = new Date(2026, 8, 7, 8, 0, 0).getTime();
    expect(calendarDaysAgo(lateLastNight, thisMorning)).toBe(1);
  });

  it("is 0 for earlier the same day and never negative", () => {
    expect(calendarDaysAgo(NOW - 3600_000, NOW)).toBe(0);
    expect(calendarDaysAgo(NOW + 86_400_000, NOW)).toBe(0);
  });
});
