/**
 * Render on demand (rule 1 of the wave-2 brief: the click is sacred).
 *
 * Nothing runs while nothing changes. `invalidate()` asks for a frame; the
 * frame callback returns true while something is still settling (a camera
 * flight, a vibrating string, a fade, the sweep) and the loop keeps going
 * only for as long as that holds. A cap below the display's rate (30 fps for
 * a Take on a machine that should not be asked for more, `takeRate.ts`)
 * spaces frames with a timer rather than by skipping animation frames, so a
 * capped loop does not wake 60 times a second to do nothing. A cap at or
 * near the display's rate is the display's own beat: every animation frame. Paused, it does nothing at
 * all and remembers that a frame is owed.
 *
 * Two clocks, on purpose. A frame's `dt` comes from the animation-frame
 * stamps, which is the display's own time. The cap is spaced from when a
 * frame was actually DRAWN (`deps.now()`), because a stamp is not that: an
 * animation frame asked for just after a vsync is run at once by Chromium and
 * stamped with the vsync already gone, up to 16.7 ms stale. Spaced from the
 * stamp, the next frame was then let through a vsync early, every other
 * frame: gaps of 31, 17, 31, 17 ms, which is 41 frames a second under a cap
 * of 30 (measured in the layout suite on a busy machine, 2026-11-18, where
 * the timer rarely beats the vsync). The loop on the display's beat keeps the
 * stamps: its gap IS a vsync, and timing it from the draw would walk it off
 * that beat.
 *
 * What the display's beat is, it learns (`DisplayClock`): from the stamps of
 * frames it asked for back to back. Until it has a few, 60 Hz.
 */
import { DisplayClock, everyFrame } from "./takeRate";

export type SchedulerDeps = {
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  now: () => number;
};

export function browserDeps(): SchedulerDeps {
  return {
    raf: (cb) => window.requestAnimationFrame(cb),
    caf: (id) => window.cancelAnimationFrame(id),
    setTimeout: (cb, ms) => window.setTimeout(cb, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    now: () => performance.now(),
  };
}

/** `dt` in seconds since the last frame (1/60 after an idle spell); `gapMs` is set only between consecutive frames. */
export type FrameFn = (dt: number, info: { gapMs: number | null }) => boolean;

export class FrameScheduler {
  private rafId: number | null = null;
  private timerId: number | null = null;
  /** The last frame's animation-frame stamp: `dt`, and the calm loop's spacing. */
  private lastFrame = -Infinity;
  /** When the last frame was drawn, on `deps.now()`: a cap's spacing. */
  private lastDrawn = -Infinity;
  private continuing = false;
  private owed = false;
  private paused = false;
  private disposed = false;
  private maxFps = 60;
  /** The frame being run was asked for straight from the one before (no timer between). */
  private direct = false;
  private readonly display = new DisplayClock();
  /** Frames drawn, for tests and the stage's debug readout. */
  frames = 0;

  constructor(
    private readonly frame: FrameFn,
    private readonly deps: SchedulerDeps = browserDeps(),
  ) {}

  /** Ask for (at least) one more frame. */
  invalidate(): void {
    if (this.disposed) return;
    this.owed = true;
    if (!this.paused) this.schedule();
  }

  /** Frames per second at most. */
  setMaxFps(fps: number): void {
    this.maxFps = Math.max(1, fps);
  }

  get fpsCap(): number {
    return this.maxFps;
  }

  /** The display's frame time in ms, as learned so far. */
  get displayMs(): number {
    return this.display.ms;
  }

  /** True when the cap leaves every display frame to be drawn. */
  get uncapped(): boolean {
    return everyFrame(this.maxFps, this.display.ms);
  }

  setPaused(on: boolean): void {
    if (this.paused === on) return;
    this.paused = on;
    if (on) {
      if (this.rafId !== null || this.timerId !== null || this.continuing) this.owed = true;
      this.cancel();
      this.continuing = false;
    } else if (this.owed) {
      this.lastFrame = -Infinity;
      this.lastDrawn = -Infinity;
      this.schedule();
    }
  }

  /** True while a frame is scheduled. */
  get active(): boolean {
    return this.rafId !== null || this.timerId !== null;
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  private cancel(): void {
    if (this.rafId !== null) this.deps.caf(this.rafId);
    if (this.timerId !== null) this.deps.clearTimeout(this.timerId);
    this.rafId = null;
    this.timerId = null;
  }

  private schedule(): void {
    if (this.rafId !== null || this.timerId !== null || this.paused || this.disposed) return;
    const minGap = 1000 / this.maxFps;
    // Under a cap, from the draw itself; at the display's rate, from its stamp.
    const uncapped = this.uncapped;
    const from = uncapped ? this.lastFrame : this.lastDrawn;
    const wait = uncapped ? 0 : from + minGap - this.deps.now();
    // A frame inside the cap's window waits on a timer, then on the next vsync.
    this.direct = !(wait > 2);
    if (wait > 2) {
      this.timerId = this.deps.setTimeout(() => {
        this.timerId = null;
        this.rafId = this.deps.raf(this.tick);
      }, wait - 1);
    } else {
      this.rafId = this.deps.raf(this.tick);
    }
  }

  private tick = (now: number): void => {
    this.rafId = null;
    if (this.paused || this.disposed) return;
    const gap = now - this.lastFrame;
    const consecutive = this.continuing && gap < 250;
    const dt = consecutive ? Math.min(gap, 100) / 1000 : 1 / 60;
    if (consecutive && this.direct) this.display.sample(gap);
    this.lastFrame = now;
    this.lastDrawn = this.deps.now();
    this.owed = false;
    this.frames += 1;
    const more = this.frame(dt, { gapMs: consecutive ? gap : null });
    this.continuing = more;
    if (more || this.owed) this.schedule();
  };
}
