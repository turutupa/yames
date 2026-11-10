// A Take's notes must be a pure function of the seed: replay, review and grading
// all depend on it.
import { describe, expect, it } from "vitest";
import type { Exercise, ExerciseVariant } from "./format";
import {
  exerciseWithVariant,
  notesForTake,
  progressKey,
  resolveVariant,
  variantOrder,
  warmupStartBpm,
} from "./variants";

const note = (fret: number) => ({ string: 3, fret, midi: 55 + fret, tick: 0, dur: 960, tech: [] });

const variant = (id: string, fret: number, pool = "all"): ExerciseVariant => ({
  id,
  label: id,
  params: { key: id },
  pool,
  tab: `/4 3:${fret}`,
  position: { fret, shifts: "none" },
  crossing: "none",
  notes: [note(fret)],
  rests: [],
  backing: { kind: "click", subdivision: 1 },
  computed: { noteCount: 1, minGapMsAtTop: null, handShifts: 0, maxPlayableBpm: 400, difficulty: 1 },
});

const base = (variants?: ExerciseVariant[]): Exercise =>
  ({
    id: "step.ex",
    notes: [note(5)],
    tempo: { rungs: [{ bpm: 60, grading: "graded" }, { bpm: 80, grading: "graded" }, { bpm: 100, grading: "graded" }], passAtBpm: 80 },
    ...(variants
      ? { variation: { dimensions: ["key"], pooled: ["key"], notPooled: [], variants } }
      : {}),
  }) as unknown as Exercise;

const six = base(["a", "b", "c", "d", "e", "f"].map((id, i) => variant(id, 5 + i)));

describe("notesForTake", () => {
  it("is a pure function of the seed", () => {
    expect(variantOrder(six, 42)).toEqual(variantOrder(six, 42));
    expect(notesForTake(six, "session-7", 3)).toEqual(notesForTake(six, "session-7", 3));
  });

  it("pins the order, so it can never drift between versions", () => {
    expect(variantOrder(six, 42)).toEqual(variantOrder(six, "42"));
    expect([...variantOrder(six, 42)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(variantOrder(six, 1)).not.toEqual(variantOrder(six, 2));
  });

  it("plays every variant before repeating, and never the same notes twice running", () => {
    const seen = Array.from({ length: 13 }, (_v, i) => notesForTake(six, 9, i).variantId);
    expect(new Set(seen.slice(0, 6)).size).toBe(6);
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it("gives the concrete notes, and they come back from what was stored", () => {
    const take = notesForTake(six, 5, 0);
    const again = resolveVariant(six, take.variantId);
    expect(again).toEqual(take.exercise);
    expect(take.exercise.variation).toBeUndefined();
    expect(take.exercise.id).toContain("#");
  });

  it("an Exercise with no variants always gives itself", () => {
    const fixed = base();
    expect(notesForTake(fixed, 1, 7)).toEqual({ variantId: null, exercise: fixed });
    expect(resolveVariant(fixed, null)).toBe(fixed);
  });

  it("refuses a variant that does not exist", () => {
    expect(resolveVariant(six, "nope")).toBeNull();
    expect(resolveVariant(six, null)).toBeNull();
  });
});

describe("progressKey", () => {
  it("pools across variants, and splits where the pack says difficulty changes", () => {
    const ex = base([variant("a", 5, "strings=3"), variant("b", 7, "strings=3"), variant("c", 5, "strings=5")]);
    expect(progressKey(ex, "a")).toBe(progressKey(ex, "b"));
    expect(progressKey(ex, "a")).not.toBe(progressKey(ex, "c"));
    expect(progressKey(base(), null)).toBe("step.ex::all");
  });
});

describe("warmupStartBpm", () => {
  const warm = {
    ...base(),
    warmup: { startAtCleanRatio: 0.6, topAtCleanRatio: 0.8, referenceExercise: "x", fallbackBpm: 80, advancesProgress: false },
  } as Exercise;

  it("starts below the player's recent clean tempo", () => {
    expect(warmupStartBpm(warm, 140)).toBe(80);
    expect(warmupStartBpm(warm, 170)).toBe(100);
  });
  it("uses the fallback with no history, and stays on the ladder", () => {
    expect(warmupStartBpm(warm, null)).toBe(80);
    expect(warmupStartBpm(warm, 30)).toBe(60);
  });
});

describe("exerciseWithVariant", () => {
  it("takes every note-bearing field from the variant", () => {
    const v = { ...variant("z", 9), chords: ["A7"] };
    const merged = exerciseWithVariant({ ...base(), chords: ["D7"], harmony: { kind: "chordTones", cover: false } }, v);
    expect(merged.notes).toEqual(v.notes);
    expect(merged.chords).toEqual(["A7"]);
    expect(merged.harmony).toBeUndefined();
    const bars = [{ metric: "notesHeard", min: 0.7, overBars: 4 }];
    expect(exerciseWithVariant(base(), { ...v, passBars: bars }).passBars).toEqual(bars);
  });
});
