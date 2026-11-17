import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrameScheduler, type SchedulerDeps } from "./scheduler";

/** A display at 60 Hz on fake timers: an animation frame lands on the next 16.67 ms boundary. */
function fakeDeps(): SchedulerDeps {
  const vsync = 1000 / 60;
  return {
    raf: (cb) => {
      const now = Date.now();
      const next = Math.ceil((now + 0.01) / vsync) * vsync;
      return setTimeout(() => cb(Date.now()), next - now) as unknown as number;
    },
    caf: (id) => clearTimeout(id),
    setTimeout: (cb, ms) => setTimeout(cb, ms) as unknown as number,
    clearTimeout: (id) => clearTimeout(id),
    now: () => Date.now(),
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

  it("runs an endless animation at up to 60 fps on a calm screen", () => {
    const frame = vi.fn(() => true);
    const s = new FrameScheduler(frame, fakeDeps());
    s.invalidate();
    vi.advanceTimersByTime(1000);
    expect(frame.mock.calls.length).toBeGreaterThanOrEqual(55);
    expect(frame.mock.calls.length).toBeLessThanOrEqual(61);
    s.dispose();
  });

  it("caps at 30 fps during a Take", () => {
    const frame = vi.fn(() => true);
    const s = new FrameScheduler(frame, fakeDeps());
    s.setMaxFps(30);
    s.invalidate();
    vi.advanceTimersByTime(1000);
    expect(frame.mock.calls.length).toBeGreaterThanOrEqual(27);
    expect(frame.mock.calls.length).toBeLessThanOrEqual(31);
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
