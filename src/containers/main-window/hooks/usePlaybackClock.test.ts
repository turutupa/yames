import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaybackClock } from "./usePlaybackClock";
import type { BeatEvent } from "../../../types";

function beat(n: number, isDownbeat: boolean): BeatEvent {
  return { beat: n, measureBeat: 0, subdivision: 0, isDownbeat, isAccent: isDownbeat };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("usePlaybackClock", () => {
  it("counts bars by downbeat, not by beat index", () => {
    // The engine's beat index is a running total that does not reset when the
    // meter changes mid-play, so counting downbeats is the only honest way to
    // say which bar the player is in.
    const { result, rerender } = renderHook(
      ({ b }: { b: BeatEvent | null }) => usePlaybackClock(true, b),
      { initialProps: { b: null as BeatEvent | null } },
    );
    expect(result.current.bar).toBe(1);

    rerender({ b: beat(0, true) }); // the first downbeat is bar 1, not bar 2
    expect(result.current.bar).toBe(1);

    rerender({ b: beat(1, false) });
    rerender({ b: beat(2, false) });
    expect(result.current.bar).toBe(1);

    rerender({ b: beat(3, true) });
    expect(result.current.bar).toBe(2);

    rerender({ b: beat(6, true) });
    expect(result.current.bar).toBe(3);
  });

  it("ignores a beat event it has already counted", () => {
    const { result, rerender } = renderHook(
      ({ b }: { b: BeatEvent | null }) => usePlaybackClock(true, b),
      { initialProps: { b: beat(0, true) as BeatEvent | null } },
    );
    rerender({ b: beat(4, true) });
    expect(result.current.bar).toBe(2);
    rerender({ b: { ...beat(4, true) } }); // same index, new object
    expect(result.current.bar).toBe(2);
  });

  it("counts wall time, so a tempo ramp does not distort it", () => {
    const { result } = renderHook(() => usePlaybackClock(true, null));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.elapsedSeconds).toBeGreaterThanOrEqual(2.5);
    expect(result.current.elapsedSeconds).toBeLessThan(4);
  });

  it("resets on the next start", () => {
    const { result, rerender } = renderHook(
      ({ running, b }: { running: boolean; b: BeatEvent | null }) => usePlaybackClock(running, b),
      { initialProps: { running: true, b: null as BeatEvent | null } },
    );
    rerender({ running: true, b: beat(0, true) });
    rerender({ running: true, b: beat(4, true) });
    expect(result.current.bar).toBe(2);

    rerender({ running: false, b: null });
    rerender({ running: true, b: null });
    expect(result.current.bar).toBe(1);
    expect(result.current.elapsedSeconds).toBe(0);
  });

  it("holds the last reading after the click stops", () => {
    // Freezing rather than clearing: the numbers are worth reading after the
    // last note, which is exactly when a player looks at them.
    const { result, rerender } = renderHook(
      ({ running, b }: { running: boolean; b: BeatEvent | null }) => usePlaybackClock(running, b),
      { initialProps: { running: true, b: null as BeatEvent | null } },
    );
    rerender({ running: true, b: beat(0, true) });
    rerender({ running: true, b: beat(4, true) });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const heldBar = result.current.bar;
    const heldTime = result.current.elapsedSeconds;
    rerender({ running: false, b: null });
    expect(result.current.bar).toBe(heldBar);
    expect(result.current.elapsedSeconds).toBe(heldTime);
  });
});
