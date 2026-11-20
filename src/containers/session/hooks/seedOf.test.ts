/**
 * The variant a step plays, as the Session screen carries it
 * (`data-variant-seed`): the e2e player renders the Take's own notes from it.
 * Without it, a Take of a varied Exercise (On the beat's halves on the A and D
 * strings, its second visit) was played as written and graded 0% right notes
 * (fix-hotkey, 2026-11-20).
 */
import { describe, expect, it } from "vitest";
import { seedOf } from "./useSessionRun";
import type { PlanStep } from "../../../session/planner";

const step = (fields: Record<string, unknown>) => fields as unknown as PlanStep;

describe("seedOf", () => {
  it("is an Exercise step's variant, 0 included", () => {
    expect(seedOf(step({ kind: "exercise", variantSeed: 1 }))).toBe(1);
    expect(seedOf(step({ kind: "exercise", variantSeed: 0 }))).toBe(0);
    expect(seedOf(step({ kind: "exercise", variantSeed: null }))).toBeNull();
  });

  it("is a warm-up's variant, and none when it has none", () => {
    expect(seedOf(step({ kind: "metronome", variantSeed: 2 }))).toBe(2);
    expect(seedOf(step({ kind: "metronome" }))).toBeNull();
  });

  it("is none for a jam and for no step", () => {
    expect(seedOf(step({ kind: "jam", exerciseId: "x" }))).toBeNull();
    expect(seedOf(null)).toBeNull();
  });
});
