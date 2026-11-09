import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePlaybackClock } from "./usePlaybackClock";
import type { BeatEvent } from "../../../types";

/**
 * One tick, shaped the way the ENGINE shapes it — which is the point of this
 * file. `isDownbeat` is `sub == 0`, "this tick is a whole beat and not a
 * subdivision", and is true once per BEAT; `measureBeat` is bar-local and
 * wraps at the meter. This test used to hardcode `measureBeat: 0` on every
 * event and set `isDownbeat` by hand, which asserted a contract no engine
 * path supplies and let a counter that added a bar per beat pass.
 */
function tick(
  beat: number,
  measureBeat: number,
  subdivision: number,
  extra: Partial<BeatEvent> = {},
): BeatEvent {
  const whole = subdivision === 0;
  const accentLevel = whole && measureBeat === 0 ? 2 : 0;
  return {
    beat,
    measureBeat,
    subdivision,
    isDownbeat: whole,
    accentLevel,
    isAccent: accentLevel > 0,
    formBar: 0,
    chorus: 1,
    bandState: "full",
    songBar: null,
    songTick: 0,
    songPass: 0,
    songCountIn: false,
    ...extra,
  };
}

/**
 * A stretch of the click as the callback walks it: `bars` bars of
 * `beatsPerBar`, `subdivision` ticks to the beat, and `beat` a running total
 * that never resets.
 */
function run(bars: number, beatsPerBar: number, subdivision = 1): BeatEvent[] {
  const out: BeatEvent[] = [];
  let beat = 0;
  for (let b = 0; b < bars; b++) {
    for (let mb = 0; mb < beatsPerBar; mb++) {
      for (let s = 0; s < subdivision; s++) out.push(tick(beat, mb, s));
      beat += 1;
    }
  }
  return out;
}

function play(events: BeatEvent[]) {
  const { result, rerender } = renderHook(
    ({ b }: { b: BeatEvent | null }) => usePlaybackClock(true, b),
    { initialProps: { b: null as BeatEvent | null } },
  );
  for (const e of events) rerender({ b: e });
  return result;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("usePlaybackClock", () => {
  it("counts bars, not beats", () => {
    // The bug this file exists for: four beats of 4/4 are ONE bar, and the
    // readout used to say 4 because every one of them is an `isDownbeat`.
    const result = play(run(1, 4));
    expect(result.current.bar).toBe(1);
  });

  it("opens a new bar on the first beat of the bar", () => {
    const result = play(run(3, 4));
    expect(result.current.bar).toBe(3);
  });

  it("does not open a bar per subdivision", () => {
    // Sixteenths: four ticks to the beat, sixteen to the bar, one bar.
    const result = play(run(2, 4, 4));
    expect(result.current.bar).toBe(2);
  });

  it("counts an odd meter at its own length", () => {
    // 7/8 is seven beats to a bar, not four and a bit.
    const result = play(run(3, 7));
    expect(result.current.bar).toBe(3);
  });

  it("counts a bar of one beat once per beat", () => {
    // FREE mode collapses the meter to a single group, and then every whole
    // beat is also a bar line. Nothing here may read "still on a bar line" as
    // one long bar.
    const result = play(run(4, 1));
    expect(result.current.bar).toBe(4);
  });

  it("starts a bar where a meter change says it does", () => {
    // `beat_groups_changed` resets `measure_beat` to 0 before the tick is
    // shaped, so the tick the new meter begins on IS a bar line — while
    // `beat`, a running total, carries straight on through it.
    const result = play([
      ...run(1, 4),
      tick(4, 0, 0),
      ...[1, 2, 3, 4, 5, 6].map((mb) => tick(4 + mb, mb, 0)),
      tick(11, 0, 0),
    ]);
    expect(result.current.bar).toBe(3);
  });

  it("does not count the click's count-in", () => {
    // The engine swallows the count-in's whole beats (`is_warmup_beat`) and
    // only the subdivision ticks between them reach the window, with
    // `isDownbeat` false. The last count beat IS beat 0 of the real thing and
    // arrives as one, with the engine's counters already back to zero.
    const result = play([
      tick(0, 0, 1),
      tick(1, 1, 1),
      tick(0, 0, 0),
      ...run(1, 4).slice(1),
    ]);
    expect(result.current.bar).toBe(1);
  });

  it("does not count a song's count-in", () => {
    // A song's count-in DOES reach the window — somebody counting you in is
    // something to watch — with `songBar` null and `songCountIn` set. Those
    // bars are not bars of the piece.
    const result = play([
      ...[0, 1, 2, 3].map((mb) => tick(mb, mb, 0, { songCountIn: true })),
      ...[0, 1, 2, 3].map((mb) => tick(mb, mb, 0, { songBar: 4 })),
    ]);
    expect(result.current.bar).toBe(5);
  });

  it("reads the engine's own bar in Songs, over a loop", () => {
    // A four-bar range that does not begin at bar one, played twice. The tab
    // cursor is drawn from `songBar`; so is this, so the two cannot disagree.
    const events: BeatEvent[] = [];
    for (let pass = 0; pass < 2; pass++) {
      let beat = 0;
      for (let songBar = 8; songBar < 12; songBar++) {
        for (let mb = 0; mb < 4; mb++) {
          events.push(tick(beat++, mb, 0, { songBar, songPass: pass }));
        }
      }
    }
    const { result, rerender } = renderHook(
      ({ b }: { b: BeatEvent | null }) => usePlaybackClock(true, b),
      { initialProps: { b: null as BeatEvent | null } },
    );
    rerender({ b: events[0] });
    expect(result.current.bar).toBe(9); // bar nine of the piece, not bar one of the range
    for (const e of events.slice(1, 16)) rerender({ b: e });
    expect(result.current.bar).toBe(12);
    rerender({ b: events[16] }); // round again
    expect(result.current.bar).toBe(9);
  });

  it("ignores a tick it has already counted", () => {
    const events = run(2, 4);
    const { result, rerender } = renderHook(
      ({ b }: { b: BeatEvent | null }) => usePlaybackClock(true, b),
      { initialProps: { b: null as BeatEvent | null } },
    );
    for (const e of events) rerender({ b: e });
    expect(result.current.bar).toBe(2);
    rerender({ b: { ...events[events.length - 1] } }); // same tick, new object
    expect(result.current.bar).toBe(2);
  });

  it("counts wall time, so a tempo ramp does not distort it", () => {
    // And nothing on the event says what the tempo is, which is why a tempo
    // step mid-play cannot move the bar count either way.
    const { result } = renderHook(() => usePlaybackClock(true, null));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.elapsedSeconds).toBeGreaterThanOrEqual(2.5);
    expect(result.current.elapsedSeconds).toBeLessThan(4);
  });

  it("resets on the next start", () => {
    const events = run(2, 4);
    const { result, rerender } = renderHook(
      ({ running, b }: { running: boolean; b: BeatEvent | null }) => usePlaybackClock(running, b),
      { initialProps: { running: true, b: null as BeatEvent | null } },
    );
    for (const e of events) rerender({ running: true, b: e });
    expect(result.current.bar).toBe(2);

    rerender({ running: false, b: null });
    rerender({ running: true, b: null });
    expect(result.current.bar).toBe(1);
    expect(result.current.elapsedSeconds).toBe(0);

    // And the second run counts from one rather than carrying on.
    for (const e of events) rerender({ running: true, b: e });
    expect(result.current.bar).toBe(2);
  });

  it("holds the last reading after the click stops", () => {
    // Freezing rather than clearing: the numbers are worth reading after the
    // last note, which is exactly when a player looks at them.
    const events = run(2, 4);
    const { result, rerender } = renderHook(
      ({ running, b }: { running: boolean; b: BeatEvent | null }) => usePlaybackClock(running, b),
      { initialProps: { running: true, b: null as BeatEvent | null } },
    );
    for (const e of events) rerender({ running: true, b: e });
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
