/**
 * Render on demand (rule 1 of the wave-2 brief: the click is sacred).
 *
 * Nothing runs while nothing changes. `invalidate()` asks for a frame; the
 * frame callback returns true while something is still settling (a camera
 * flight, a vibrating string, a fade, the sweep) and the loop keeps going
 * only for as long as that holds. A cap (30 fps during a Take) spaces frames
 * with a timer rather than by skipping animation frames, so a capped loop
 * does not wake 60 times a second to do nothing. Paused, it does nothing at
 * all and remembers that a frame is owed.
 */
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
  private lastFrame = -Infinity;
  private continuing = false;
  private owed = false;
  private paused = false;
  private disposed = false;
  private maxFps = 60;
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

  /** Frames per second at most: 60 normally, 30 during a Take. */
  setMaxFps(fps: number): void {
    this.maxFps = Math.max(1, fps);
  }

  get fpsCap(): number {
    return this.maxFps;
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
    const wait = this.lastFrame + minGap - this.deps.now();
    // A frame inside the cap's window waits on a timer, then on the next vsync.
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
    this.lastFrame = now;
    this.owed = false;
    this.frames += 1;
    const more = this.frame(dt, { gapMs: consecutive ? gap : null });
    this.continuing = more;
    if (more || this.owed) this.schedule();
  };
}
