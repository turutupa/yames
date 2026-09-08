/**
 * Recording a drill run (UI_DECISIONS U3.3).
 *
 * The underlay is only as honest as this. `barsInStep` never reaches
 * `barsPerStep` — the engine increments it and resets it to 0 in the same
 * locked update that advances the step — so a completed step is only ever
 * visible as the step having moved on, and every one of these tests is really
 * about whether the hook counts that correctly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDrillRuns } from "./useDrillRuns";
import { mockInvoke } from "../../test/mocks";
import type { SpeedRamp } from "../../types";
import type { DrillPlan } from "./useDrillPlan";

const PLAN: DrillPlan = {
  startBpm: 80,
  targetBpm: 100,
  increment: 10,
  decrement: 5,
  barsPerStep: 4,
  beatsPerBar: 4,
  subdivision: 1,
  mode: "linear",
  cyclic: false,
  aggressiveness: "moderate",
  warmupBeats: 0,
};

const STEPS = [80, 90, 100];

function ramp(over: Partial<SpeedRamp> = {}): SpeedRamp {
  return {
    startBpm: 80,
    targetBpm: 100,
    increment: 10,
    decrement: 5,
    barsPerStep: 4,
    beatsPerBar: 4,
    subdivision: 1,
    mode: "linear",
    cyclic: false,
    aggressiveness: "moderate",
    active: false,
    currentStep: 0,
    currentBpm: 80,
    direction: "up",
    barsInStep: 0,
    completed: false,
    warmupBeats: 0,
    warmupCount: 0,
    ...over,
  };
}

/** The payloads `save_drill_run` was called with. */
function saved() {
  return mockInvoke.mock.calls
    .filter((c) => c[0] === "save_drill_run")
    .map((c) => (c[1] as { run: Record<string, unknown> }).run);
}

function mount() {
  return renderHook(({ r }: { r: SpeedRamp }) => useDrillRuns(r, PLAN, STEPS), {
    initialProps: { r: ramp() },
  });
}

/** Play the ramp through a sequence of states, ending stopped. */
function play(
  rerender: (p: { r: SpeedRamp }) => void,
  states: Partial<SpeedRamp>[],
) {
  for (const s of states) act(() => rerender({ r: ramp(s) }));
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("useDrillRuns", () => {
  it("records the tempos actually played, and how many bars at each", () => {
    const { rerender } = mount();
    play(rerender, [
      { active: true, currentStep: 0, currentBpm: 80, barsInStep: 0 },
      { active: true, currentStep: 0, currentBpm: 80, barsInStep: 3 },
      // The step moved on: 80 got its full four bars, and the frontend never
      // saw the fourth as a `barsInStep`.
      { active: true, currentStep: 1, currentBpm: 90, barsInStep: 0 },
      { active: true, currentStep: 1, currentBpm: 90, barsInStep: 2 },
      // Stopped.
      { active: false, currentStep: 1, currentBpm: 90, barsInStep: 2 },
    ]);

    const [run] = saved();
    expect(run.reach).toEqual([
      { bpm: 80, bars: 4 },
      { bpm: 90, bars: 2 },
    ]);
    expect(run.reachedBpm).toBe(90);
    expect(run.reachedBar).toBe(2);
    expect(run.completed).toBe(false);
    // The plan is what makes a later run comparable at all.
    expect(run.barsPerStep).toBe(4);
    expect(run.beatsPerBar).toBe(4);
    expect(run.subdivision).toBe(1);
    expect(run.mode).toBe("linear");
  });

  it("credits the last step in full when the ramp reached its target", () => {
    const { rerender } = mount();
    play(rerender, [
      { active: true, currentStep: 0, currentBpm: 80, barsInStep: 2 },
      { active: true, currentStep: 1, currentBpm: 90, barsInStep: 1 },
      { active: true, currentStep: 2, currentBpm: 100, barsInStep: 1 },
      // A completed ramp stops ON the step it finished, and that step was
      // played out.
      { active: false, completed: true, currentStep: 2, currentBpm: 100, barsInStep: 0 },
    ]);
    const [run] = saved();
    expect(run.completed).toBe(true);
    expect(run.reach).toEqual([
      { bpm: 80, bars: 4 },
      { bpm: 90, bars: 4 },
      { bpm: 100, bars: 4 },
    ]);
  });

  it("does not record pressing start and stopping again", () => {
    // The same judgement `isSegmentReportable` makes about a session that
    // aggregates to nothing: without one completed step there is no wall to
    // draw, and the record would only get in the way of the last real run.
    const { rerender } = mount();
    play(rerender, [
      { active: true, currentStep: 0, currentBpm: 80, barsInStep: 0 },
      { active: true, currentStep: 0, currentBpm: 80, barsInStep: 1 },
      { active: false, currentStep: 0, currentBpm: 80, barsInStep: 1 },
    ]);
    expect(saved()).toEqual([]);
  });

  it("does not credit bars that were jumped over rather than played", () => {
    // Clicking a cell of the climb moves the step without playing it. Without
    // `markJump` the underlay would grow every time you clicked the picture.
    const { result, rerender } = mount();
    play(rerender, [
      { active: true, currentStep: 0, currentBpm: 80, barsInStep: 3 },
      // 80 ran out honestly: four bars.
      { active: true, currentStep: 1, currentBpm: 90, barsInStep: 1 },
    ]);
    act(() => result.current.markJump());
    play(rerender, [
      { active: true, currentStep: 2, currentBpm: 100, barsInStep: 0 },
      { active: true, currentStep: 2, currentBpm: 100, barsInStep: 3 },
      { active: false, currentStep: 2, currentBpm: 100, barsInStep: 3 },
    ]);
    const [run] = saved();
    // 90 keeps the one bar it was actually given, not the four it would have
    // been credited for running out.
    expect(run.reach).toEqual([
      { bpm: 80, bars: 4 },
      { bpm: 90, bars: 1 },
      { bpm: 100, bars: 3 },
    ]);
  });

  it("writes nothing while the drill has never run", () => {
    const { rerender } = mount();
    play(rerender, [{ active: false, currentStep: 0, barsInStep: 0 }]);
    expect(saved()).toEqual([]);
  });

  it("draws no underlay when the store has no runs to give", () => {
    // The mocked bridge answers `get_drill_runs` with undefined, which is
    // also what a binary without the command registered looks like from here.
    const { result } = mount();
    expect(result.current.underlay).toBeNull();
  });
});
