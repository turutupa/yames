import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrameScheduler, type SchedulerDeps } from "./scheduler";

/**
 * A display on fake timers: an animation frame runs at the next vsync, once
 * per vsync, stamped with that vsync. (The fake clock counts whole ms, so the
 * callback runs up to a ms after its stamp, as a real one does.)
 */
function fakeDeps(hz = 60): SchedulerDeps {
  const vsync = 1000 / hz;
  let served = -Infinity;
  return {
    raf: (cb) => {
      const now = Date.now();
      const index = Math.max(Math.floor(now / vsync) + 1, served + 1);
      served = index;
      const stamp = index * vsync;
      return setTimeout(() => cb(stamp), Math.max(0, Math.ceil(stamp - now))) as unknown as number;
    },
    caf: (id) => clearTimeout(id),
    setTimeout: (cb, ms) => setTimeout(cb, ms) as unknown as number,
    clearTimeout: (id) => clearTimeout(id),
    now: () => Date.now(),
  };
}

/**
 * The same display as Chromium serves it: an animation frame asked for when
 * this vsync's has not been run yet runs AT ONCE, stamped with the vsync
 * already gone (up to 16.67 ms stale); only one asked for after that waits
 * for the next. A timer that fires just after a vsync meets exactly this.
 */
function chromiumDeps(): SchedulerDeps {
  const vsync = 1000 / 60;
  /** The last vsync an animation frame was run for, counted in vsyncs. */
  let served = -Infinity;
  return {
    ...fakeDeps(),
    raf: (cb) => {
      const now = Date.now();
      const current = Math.floor(now / vsync);
      const index = current > served ? current : current + 1;
      served = index;
      const stamp = index * vsync;
      return setTimeout(() => cb(stamp), Math.max(0, Math.ceil(stamp - now))) as unknown as number;
    },
  };
}

describe("FrameScheduler: render on demand", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("draws nothing until asked", () => {
    const frame = vi.fn(() => false);
    const s = new FrameScheduler(frame, fakeDeps());
    vi.advanceTimersByTime(2000);
    expect(frame).not.toHaveBeenCalled();
    expect(s.active).toBe(false);
  });

  it("draws one frame for a change that settles at once, then stops", () => {
    const frame = vi.fn(() => false);
    const s = new FrameScheduler(frame, fakeDeps());
    s.invalidate();
    s.invalidate();
    s.invalidate();
    vi.advanceTimersByTime(2000);
    expect(frame).toHaveBeenCalledTimes(1);
    expect(s.active).toBe(false);
  });

  it("keeps drawing while the frame says something is still settling, and stops when it is not", () => {
    let left = 10;
    const frame = vi.fn(() => --left > 0);
    const s = new FrameScheduler(frame, fakeDeps());
    s.invalidate();
    vi.advanceTimersByTime(5000);
    expect(frame).toHaveBeenCalledTimes(10);
    expect(s.active).toBe(false);
  });

  it("passes dt in seconds: 1/60 after idle, the real gap between consecutive frames", () => {
    const dts: number[] = [];
    const gaps: Array<number | null> = [];
    let n = 0;
    const s = new FrameScheduler((dt, info) => {
      dts.push(dt);
      gaps.push(info.gapMs);
      return ++n < 3;
    }, fakeDeps());
    s.invalidate();
    vi.advanceTimersByTime(500);
    expect(dts[0]).toBeCloseTo(1 / 60, 5);
    expect(gaps[0]).toBeNull();
    expect(dts[1]).toBeGreaterThan(0.01);
    expect(dts[1]).toBeLessThan(0.02);
    expect(gaps[1]).not.toBeNull();
  });

  it("runs an endless animation on the display's beat", () => {
    const frame = vi.fn(() => true);
    const s = new FrameScheduler(frame, fakeDeps());
    s.invalidate();
    vi.advanceTimersByTime(1000);
    expect(frame.mock.calls.length).toBeGreaterThanOrEqual(55);
    expect(frame.mock.calls.length).toBeLessThanOrEqual(61);
    s.dispose();
  });

  it("caps at 30 fps when told to (a Take on a machine that should not be asked for more)", () => {
    const frame = vi.fn(() => true);
    const s = new FrameScheduler(frame, fakeDeps());
    s.setMaxFps(30);
    s.invalidate();
    vi.advanceTimersByTime(1000);
    expect(frame.mock.calls.length).toBeGreaterThanOrEqual(27);
    expect(frame.mock.calls.length).toBeLessThanOrEqual(31);
    s.dispose();
  });

  it("caps at 30 fps by when frames are drawn, not by their stamps (a late frame's stamp is a vsync stale)", () => {
    // Each frame takes 3 ms, so the cap's timer fires just after the vsync
    // it was aiming at and the frame runs at once under the old stamp. Spaced
    // from that stamp, every other frame came a vsync early: 41 a second.
    const drawn: number[] = [];
    const s = new FrameScheduler(() => {
      drawn.push(Date.now());
      vi.setSystemTime(Date.now() + 3);
      return true;
    }, chromiumDeps());
    s.setMaxFps(30);
    s.invalidate();
    vi.advanceTimersByTime(2000);
    s.dispose();
    expect(drawn.length).toBeGreaterThan(40);
    for (let i = 1; i < drawn.length; i++) {
      expect(drawn[i] - drawn[i - 1], `frames ${i - 1} and ${i}`).toBeGreaterThanOrEqual(1000 / 30 - 2);
    }
    const perSecond = ((drawn.length - 1) * 1000) / (drawn[drawn.length - 1] - drawn[0]);
    expect(perSecond).toBeLessThanOrEqual(31);
  });

  it("still runs the calm loop on the display's beat in that browser", () => {
    const frame = vi.fn(() => true);
    const s = new FrameScheduler(frame, chromiumDeps());
    s.invalidate();
    vi.advanceTimersByTime(1000);
    expect(frame.mock.calls.length).toBeGreaterThanOrEqual(55);
    // The first runs at once, then one a vsync.
    expect(frame.mock.calls.length).toBeLessThanOrEqual(62);
    s.dispose();
  });

  for (const [hz, cap, low, high] of [
    [60, 120, 55, 61], // a cap over the display's rate is the display's rate
    [120, 120, 112, 121],
    [144, 120, 135, 145], // a little over the cap: every frame, never two-then-one
    [240, 120, 112, 124], // twice the cap: every other frame
    [120, 60, 56, 62],
  ] as const) {
    it(`a cap of ${cap} on a ${hz} Hz display draws ${low} to ${high} frames a second`, () => {
      const frame = vi.fn(() => true);
      const s = new FrameScheduler(frame, fakeDeps(hz));
      s.setMaxFps(cap);
      s.invalidate();
      // The first frames teach it the display's rate.
      vi.advanceTimersByTime(500);
      expect(s.displayMs).toBeCloseTo(1000 / hz, 0);
      const before = frame.mock.calls.length;
      vi.advanceTimersByTime(1000);
      const drawn = frame.mock.calls.length - before;
      expect(drawn).toBeGreaterThanOrEqual(low);
      expect(drawn).toBeLessThanOrEqual(high);
      s.dispose();
    });
  }

  it("a dropped frame does not pass for a slower display", () => {
    let n = 0;
    const s = new FrameScheduler(() => {
      // Every third frame takes 20 ms: the next one is two vsyncs on.
      if (++n % 3 === 0) vi.setSystemTime(Date.now() + 20);
      return true;
    }, fakeDeps(60));
    s.invalidate();
    vi.advanceTimersByTime(1000);
    expect(s.displayMs).toBeCloseTo(1000 / 60, 0);
    s.dispose();
  });

  it("caps a burst of changes during a Take too: no frame closer than the cap allows", () => {
    const times: number[] = [];
    const s = new FrameScheduler(() => {
      times.push(Date.now());
      return false;
    }, fakeDeps());
    s.setMaxFps(30);
    for (let i = 0; i < 40; i++) {
      s.invalidate();
      vi.advanceTimersByTime(5);
    }
    vi.advanceTimersByTime(500);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1000 / 30 - 2);
  });

  it("does nothing while paused, and draws the owed frame on resume", () => {
    const frame = vi.fn(() => false);
    const s = new FrameScheduler(frame, fakeDeps());
    s.setPaused(true);
    s.invalidate();
    vi.advanceTimersByTime(1000);
    expect(frame).not.toHaveBeenCalled();
    s.setPaused(false);
    vi.advanceTimersByTime(100);
    expect(frame).toHaveBeenCalledTimes(1);
  });

  it("stops an animation when paused and picks it up on resume", () => {
    const frame = vi.fn(() => true);
    const s = new FrameScheduler(frame, fakeDeps());
    s.invalidate();
    vi.advanceTimersByTime(200);
    const before = frame.mock.calls.length;
    s.setPaused(true);
    vi.advanceTimersByTime(2000);
    expect(frame.mock.calls.length).toBe(before);
    s.setPaused(false);
    vi.advanceTimersByTime(200);
    expect(frame.mock.calls.length).toBeGreaterThan(before);
    s.dispose();
  });

  it("does nothing after dispose", () => {
    const frame = vi.fn(() => true);
    const s = new FrameScheduler(frame, fakeDeps());
    s.dispose();
    s.invalidate();
    vi.advanceTimersByTime(1000);
    expect(frame).not.toHaveBeenCalled();
  });
});
