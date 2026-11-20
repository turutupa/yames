import { describe, expect, it } from "vitest";
import { buildTake } from "../session/take";
import { ALT } from "../session/testKit";
import type { OnsetResult } from "../songs/types";
import {
  countRounds,
  deviationsByBar,
  foldBar,
  leanPerPatternBar,
  patternBarsOf,
  roundsIn,
  roundsOfPatternBar,
  spotKey,
  takeLean,
} from "./rounds";

const TUNE = ALT.steps.flatMap((s) => s.exercises).find((e) => e.id === "other-strings.b-string-tune")!;

describe("rounds of the tune", () => {
  it("folds bars 1, 5 and 9 of a four-bar tune onto its first bar", () => {
    expect(foldBar(0, 4)).toEqual({ round: 1, patternBar: 1 });
    expect(foldBar(4, 4)).toEqual({ round: 2, patternBar: 1 });
    expect(foldBar(8, 4)).toEqual({ round: 3, patternBar: 1 });
    expect(foldBar(9, 4)).toEqual({ round: 3, patternBar: 2 });
  });

  it("leaves the count-in out when the numbering carries it", () => {
    expect(foldBar(0, 4, 1)).toBeNull();
    expect(foldBar(1, 4, 1)).toEqual({ round: 1, patternBar: 1 });
    expect(foldBar(5, 4, 1)).toEqual({ round: 2, patternBar: 1 });
    expect(patternBarsOf([0, 1], 4, 1)).toEqual([1]);
  });

  it("counts a partial last round: ten bars of four are three rounds, its last two bars played twice", () => {
    expect(roundsIn(10, 4)).toBe(3);
    expect(roundsOfPatternBar(10, 4, 1)).toBe(3);
    expect(roundsOfPatternBar(10, 4, 2)).toBe(3);
    expect(roundsOfPatternBar(10, 4, 3)).toBe(2);
    expect(roundsOfPatternBar(10, 4, 4)).toBe(2);
    expect(roundsOfPatternBar(10, 4, 5)).toBe(0);
    // A one-bar loop: every bar is a round.
    expect(roundsIn(10, 1)).toBe(10);
    expect(foldBar(7, 1)).toEqual({ round: 8, patternBar: 1 });
  });

  it("counts slipped rounds per pattern bar from the strip, a thin bar judging nothing", () => {
    const cells = Array.from({ length: 10 }, (_u, i) => ({
      n: i + 1,
      state: (i === 0 || i === 4 ? "missed" : i === 9 ? "thin" : "met") as "met" | "missed" | "thin",
    }));
    const counts = countRounds(cells, 4);
    expect(counts[1]).toEqual({ patternBar: 1, slippedIn: [1, 2], of: 3 });
    expect(counts[2]).toEqual({ patternBar: 2, slippedIn: [], of: 2 });
    expect(counts[3].of).toBe(2);
  });

  it("names a span by the pattern bars it touches, once each", () => {
    expect(patternBarsOf([3, 5], 4)).toEqual([1, 2, 4]);
    expect(patternBarsOf([0, 9], 4)).toEqual([1, 2, 3, 4]);
  });

  it("keys a comparison on (variant, pattern bar)", () => {
    expect(spotKey(null, 1)).toBe("-:1");
    expect(spotKey(undefined, 1)).toBe(spotKey(null, 1));
    expect(spotKey(2, 1)).not.toBe(spotKey(0, 1));
  });
});

describe("the lean per pattern bar", () => {
  const plan = buildTake(ALT, TUNE, 90);
  const barTicks = plan.score.bars[0].lengthTicks;
  const barOf = (beat: number) => Math.floor((beat * plan.score.ticksPerQuarter) / barTicks);
  const results = (dev: (bar: number) => number | null): OnsetResult[] =>
    plan.schedule.onsets.map((o) => {
      const d = dev(barOf(o.beat));
      return d === null
        ? { id: o.id, state: "miss", deviationMs: null, pass: 0 }
        : { id: o.id, state: "hit", deviationMs: d, pass: 0 };
    });

  it("files every heard note under its played bar", () => {
    const devs = deviationsByBar(plan.score, plan.schedule, results(() => 5));
    expect(devs.length).toBe(plan.schedule.onsets.length);
    expect(Math.max(...devs.map((d) => d.bar))).toBe(9);
  });

  it("is relative to the Take's median: a whole-Take lean is no lean", () => {
    // Everything 40 ms late but the tune's first bar, 70 ms late.
    const lean = leanPerPatternBar(
      deviationsByBar(plan.score, plan.schedule, results((bar) => (bar % 4 === 0 ? 70 : 40))),
      4,
    );
    expect(lean).toEqual([30, 0, 0, 0]);
    expect(leanPerPatternBar(deviationsByBar(plan.score, plan.schedule, results(() => 40)), 4)).toEqual([0, 0, 0, 0]);
  });

  it("leaves a bar with nothing heard null, never zero", () => {
    const lean = takeLean(
      { ...plan, segment: { onsetResults: results((bar) => (bar % 4 === 2 ? null : bar % 4 === 0 ? -20 : 0)) } },
      4,
    );
    expect(lean).toEqual([-20, 0, null, 0]);
    expect(takeLean({ ...plan, segment: { onsetResults: [] } }, 4)).toBeNull();
    expect(takeLean(null, 4)).toBeNull();
  });
});
