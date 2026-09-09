/**
 * The hook's own job is small — two clocks in, IPC calls out — so these
 * tests only cover the wiring the runtime tests cannot see: that a beat
 * proper is `subdivision === 0`, that a landed switch reaches the engine's
 * setters, and that a finished setlist stops the transport.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSetlistRunner } from "./useSetlistRunner";
import { mockInvoke } from "../../../test/mocks";
import type { BeatEvent, Setlist, SetlistStep, SetlistTrigger } from "../../../types";

function step(name: string, bpm: number, trigger: SetlistTrigger): SetlistStep {
  return {
    id: `s-${name}`,
    name,
    bpm,
    subdivision: 1,
    beatGroups: [4],
    freeMode: false,
    soundType: "click",
    volume: 0.5,
    trigger,
    transition: { kind: "cut" },
  };
}

const CHAIN: Setlist = {
  id: "c1",
  name: "Warm-up",
  createdAt: 0,
  repeat: 1,
  steps: [step("a", 80, { kind: "bars", bars: 1 }), step("b", 120, { kind: "manual" })],
};

function beat(n: number, isDownbeat: boolean, subdivision = 0): BeatEvent {
  return { beat: n, measureBeat: 0, subdivision, isDownbeat, isAccent: isDownbeat };
}

/** Args of every invoke of `command` so far. */
function callsTo(command: string) {
  return mockInvoke.mock.calls.filter((c) => c[0] === command).map((c) => c[1]);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function mount(setlist: Setlist | null = CHAIN) {
  return renderHook(
    ({ b, playing }: { b: BeatEvent | null; playing: boolean }) =>
      useSetlistRunner(setlist, playing, b),
    { initialProps: { b: null as BeatEvent | null, playing: false } },
  );
}

describe("useSetlistRunner", () => {
  it("applies the first step when the transport starts", () => {
    const { rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    expect(callsTo("set_bpm")).toContainEqual({ bpm: 80 });
    expect(callsTo("set_beat_groups")).toContainEqual({ groups: [4] });
    expect(callsTo("set_sound_type")).toContainEqual({ soundType: "click" });
    expect(callsTo("set_volume")).toContainEqual({ volume: 0.5 });
  });

  it("does nothing at all without a setlist", () => {
    const { rerender } = mount(null);
    act(() => rerender({ b: null, playing: true }));
    expect(callsTo("set_bpm")).toEqual([]);
  });

  it("counts bars from downbeats and drives the switch through the setters", () => {
    const { result, rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    mockInvoke.mockClear();

    // Bar one: its own downbeat, then three beats.
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(1, false), playing: true }));
    act(() => rerender({ b: beat(2, false), playing: true }));
    act(() => rerender({ b: beat(3, false), playing: true }));
    expect(result.current.stepNumber).toBe(1);
    expect(callsTo("set_bpm")).toEqual([]);

    // The downbeat of bar two is where the one-bar gap comes due.
    act(() => rerender({ b: beat(4, true), playing: true }));
    expect(result.current.stepNumber).toBe(2);
    expect(result.current.step?.name).toBe("b");
    expect(callsTo("set_bpm")).toEqual([{ bpm: 120 }]);
  });

  it("ignores subdivisions and a re-emitted beat index", () => {
    const { result, rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    // Four subdivision ticks inside bar one, then the same downbeat again.
    act(() => rerender({ b: beat(1, false, 1), playing: true }));
    act(() => rerender({ b: beat(2, true, 2), playing: true }));
    act(() => rerender({ b: beat(3, true, 1), playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    expect(result.current.state.barsInStep).toBe(0);
    expect(result.current.stepNumber).toBe(1);
  });

  it("stops the transport when the setlist runs out (U9.6)", () => {
    const single: Setlist = { ...CHAIN, steps: [CHAIN.steps[0]] };
    const { result, rerender } = renderHook(
      ({ b, playing }: { b: BeatEvent | null; playing: boolean }) =>
        useSetlistRunner(single, playing, b),
      { initialProps: { b: null as BeatEvent | null, playing: false } },
    );
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(4, true), playing: true }));
    expect(callsTo("set_playing")).toContainEqual({ playing: false });
    expect(result.current.state.phase).toBe("finished");
    expect(result.current.step).toBeNull();
  });

  it("skips ahead on the next downbeat, not on the press (U9.3)", () => {
    const { result, rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(1, false), playing: true }));
    act(() => result.current.skip());
    expect(result.current.stepNumber).toBe(1);
    act(() => rerender({ b: beat(2, false), playing: true }));
    expect(result.current.stepNumber).toBe(1);
    act(() => rerender({ b: beat(4, true), playing: true }));
    expect(result.current.stepNumber).toBe(2);
  });

  it("counts a seconds gap down between beats (U9.7)", () => {
    const timed: Setlist = {
      ...CHAIN,
      steps: [step("a", 80, { kind: "seconds", seconds: 30 }), CHAIN.steps[1]],
    };
    const { result, rerender } = renderHook(
      ({ b, playing }: { b: BeatEvent | null; playing: boolean }) =>
        useSetlistRunner(timed, playing, b),
      { initialProps: { b: null as BeatEvent | null, playing: false } },
    );
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    expect(result.current.remaining).toEqual({ kind: "seconds", seconds: 30 });
    // No beat arrives, but the number still moves.
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current.remaining).toEqual({ kind: "seconds", seconds: 25 });
  });

  it("forgets the run when the transport stops", () => {
    const { result, rerender } = mount();
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(4, true), playing: true }));
    expect(result.current.stepNumber).toBe(2);
    act(() => rerender({ b: null, playing: false }));
    expect(result.current.state.phase).toBe("idle");
    expect(result.current.step).toBeNull();
  });

  it("puts the volume back if the run is stopped inside a rest", () => {
    const resting: Setlist = {
      ...CHAIN,
      steps: [
        { ...CHAIN.steps[0], volume: 0.42, transition: { kind: "rest", bars: 4 } },
        CHAIN.steps[1],
      ],
    };
    const { rerender } = renderHook(
      ({ b, playing }: { b: BeatEvent | null; playing: boolean }) =>
        useSetlistRunner(resting, playing, b),
      { initialProps: { b: null as BeatEvent | null, playing: false } },
    );
    act(() => rerender({ b: null, playing: true }));
    act(() => rerender({ b: beat(0, true), playing: true }));
    act(() => rerender({ b: beat(4, true), playing: true }));
    expect(callsTo("set_volume")).toContainEqual({ volume: 0 });
    mockInvoke.mockClear();
    act(() => rerender({ b: null, playing: false }));
    expect(callsTo("set_volume")).toContainEqual({ volume: 0.42 });
  });
});
