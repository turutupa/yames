/**
 * The stage's state and its two backends, with no React in it.
 *
 * It holds what the screens asked for (view, slot, notes, Take running) and
 * hands it to whichever backend is drawing: the three.js engine, loaded the
 * first time a visible view is asked for, or the SVG fallback (drawn by the
 * provider from `getSnapshot()`). Rendering goes through `FrameScheduler`, so
 * the canvas is drawn only when something changed or is still settling.
 */
import type { NeckKind, NeckNote, NeckStage, NeckView } from "./api";
import type { EngineModule, SlotRect, StageEngine } from "./engineTypes";
import { neckPalette, subscribeNeckPalette } from "./neckTheme";
import { Adaptive } from "./quality";
import { FrameScheduler, type SchedulerDeps } from "./scheduler";
import { PROBE_FRAMES, judgeProbe, type ProbeVerdict } from "./speed";

export type StageMode = "idle" | "loading" | "3d" | "fallback";

export type StageSnapshot = {
  readonly mode: StageMode;
  /** The view in force; `hidden` once a hide has been applied. */
  readonly view: NeckView;
  readonly slot: HTMLElement | null;
  readonly notes: readonly NeckNote[];
  /** The last pluck, for the fallback's flash. `seq` changes on every pluck. */
  readonly pluck: { string: number; fret: number; kind: NeckKind; seq: number } | null;
};

/** How long a `hidden` waits before it is applied, so that a screen's unmount and the next one's mount do not blink. */
export const HIDE_DELAY_MS = 120;
/** How long a lost WebGL context may stay lost before the fallback takes over. */
export const LOST_GRACE_MS = 3000;
/** Frames per second while a Take runs (rule 1). */
export const TAKE_FPS = 30;
export const CALM_FPS = 60;

/** The overview strip's height for a slot of height `h` (zoom only). */
export function stripHeight(h: number): number {
  if (h < 150) return 0;
  return h >= 260 ? 54 : 42;
}

export type ControllerDeps = {
  loadEngine: () => Promise<EngineModule>;
  webgl2: () => boolean;
  scheduler?: SchedulerDeps;
  reduced?: boolean;
  forcedTier?: number | null;
  /** The player's prefs (`prefs.ts`) are known. Awaited before the engine is built. */
  ready?: () => Promise<void>;
  /** The flat neck is wanted (Settings said Off, or an earlier probe found this machine too slow). */
  flat?: () => boolean;
  /** Time a few frames after the engine compiles and refuse a renderer too slow for a GPU (`speed.ts`). */
  probe?: boolean;
  /** The probe found the frames too slow: remember it. */
  onSlow?: (v: ProbeVerdict) => void;
};

/** The last controller built, for the `?shot=` scenes and their tests. */
export const stageDebug: { current: StageController | null } = { current: null };

export class StageController {
  private snap: StageSnapshot = { mode: "idle", view: { kind: "hidden" }, slot: null, notes: [], pluck: null };
  private listeners = new Set<() => void>();
  private canvas: HTMLCanvasElement | null = null;
  /** Bumped on every attach and detach, so an engine that finishes loading for a stage that has since gone is thrown away. */
  private gen = 0;
  private engine: StageEngine | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private lostTimer: ReturnType<typeof setTimeout> | null = null;
  private lost = false;
  private attached = false;
  private wasHidden = true;
  private lastRect: SlotRect | null = null;
  private slotObserver: ResizeObserver | null = null;
  private rectCheck: number | null = null;
  private takeRunning = false;
  private pluckSeq = 0;
  private unsubPalette: (() => void) | null = null;
  /** The fallback is drawing because of the prefs (or the probe), so a change of prefs can undo it. */
  private flatFallback = false;
  /** The last probe's verdict, for the shot scenes and the e2e. */
  lastProbe: ProbeVerdict | null = null;
  readonly scheduler: FrameScheduler;
  private readonly adaptive: Adaptive;
  /** Errors from loading or running the engine, newest last (for the shot scenes). */
  readonly errors: string[] = [];

  constructor(private readonly deps: ControllerDeps) {
    this.scheduler = new FrameScheduler((dt, info) => this.frame(dt, info.gapMs), deps.scheduler);
    this.adaptive = new Adaptive((step, scale) => this.engine?.lowerQuality(step, scale) ?? false);
  }

  // ─── For React ───
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): StageSnapshot => this.snap;
  private set(patch: Partial<StageSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  get mode(): StageMode {
    return this.snap.mode;
  }
  get frames(): number {
    return this.scheduler.frames;
  }
  get fpsCap(): number {
    return this.scheduler.fpsCap;
  }
  get tier(): number | null {
    return this.engine?.tier ?? null;
  }

  /**
   * The provider's layer exists. A fresh canvas goes into it (never a canvas
   * an earlier engine lost on purpose), and a view already waiting starts
   * loading. Reversible: React's StrictMode detaches and attaches again.
   */
  attach(host: HTMLElement): void {
    if (this.attached) this.detach();
    this.attached = true;
    this.gen += 1;
    const canvas = document.createElement("canvas");
    canvas.className = "neck-stage-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    this.canvas = canvas;
    stageDebug.current = this;
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
    if (this.snap.slot) this.observeSlot(this.snap.slot);
    this.unsubPalette = subscribeNeckPalette(this.onPalette);
    this.updatePaused();
    if (this.snap.view.kind !== "hidden") this.ensureBackend();
  }

  /** The theme changed: the neck takes its new colours (the fallback and the strip re-render on their own). */
  private onPalette = () => {
    if (!this.engine) return;
    this.engine.setPalette(neckPalette());
    this.scheduler.invalidate();
  };

  /** Stop, free the GPU, and take the canvas away. */
  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.gen += 1;
    this.clearHide();
    if (this.lostTimer) clearTimeout(this.lostTimer);
    this.lostTimer = null;
    this.lost = false;
    if (this.rectCheck !== null) cancelAnimationFrame(this.rectCheck);
    this.rectCheck = null;
    this.unobserveSlot();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("scroll", this.onScroll, { capture: true });
    this.unsubPalette?.();
    this.unsubPalette = null;
    this.updatePaused();
    this.engine?.dispose();
    this.engine = null;
    this.canvas?.remove();
    this.canvas = null;
    this.wasHidden = true;
    if (this.snap.mode === "loading" || this.snap.mode === "3d") this.set({ mode: "idle" });
  }

  get isAttached(): boolean {
    return this.attached;
  }

  // ─── NeckStage ───
  setView(view: NeckView, slot: HTMLElement | null, opts?: { instant?: boolean }): void {
    if (view.kind === "hidden") {
      if (this.snap.view.kind === "hidden" || this.hideTimer) return;
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        this.applyHidden();
      }, HIDE_DELAY_MS);
      return;
    }
    this.clearHide();
    const instant = !!opts?.instant || this.wasHidden;
    this.wasHidden = false;
    if (slot !== this.snap.slot) this.observeSlot(slot);
    this.set({ view, slot });
    this.updatePaused();
    if (this.snap.mode === "idle") this.ensureBackend();
    if (this.engine) {
      this.lastRect = this.frameRect();
      this.engine.setView(view, this.lastRect, instant);
      this.scheduler.invalidate();
      this.queueRectCheck();
    }
  }

  setNotes(notes: NeckNote[], opts?: { fade?: number }): void {
    const fade = opts?.fade ?? 0.25;
    this.set({ notes: notes.slice() });
    if (this.engine) {
      this.engine.setNotes(notes, fade);
      this.scheduler.invalidate();
    }
  }

  pluck(string: number, fret: number, kind: NeckKind): void {
    if (this.snap.view.kind === "hidden") return;
    if (this.engine) {
      this.engine.pluck(string, fret, kind);
      this.scheduler.invalidate();
    } else if (this.snap.mode === "fallback") {
      this.set({ pluck: { string, fret, kind, seq: ++this.pluckSeq } });
    }
  }

  sweep(): void {
    if (this.snap.view.kind === "hidden" || !this.engine) return;
    this.engine.sweep();
    this.scheduler.invalidate();
  }

  setTakeRunning(on: boolean): void {
    this.takeRunning = on;
    this.scheduler.setMaxFps(on ? TAKE_FPS : CALM_FPS);
    this.adaptive.reset();
  }

  /**
   * A place on screen. In 3D the engine projects it through the camera it is
   * flying to; on the SVG fallback it is the centre of that place's dot, which
   * the fallback draws inside the slot.
   */
  project(string: number, fret: number): { x: number; y: number; r: number } | null {
    if (this.snap.view.kind === "hidden") return null;
    if (this.engine) {
      try {
        return this.engine.project(string, fret);
      } catch {
        return null;
      }
    }
    if (this.snap.mode !== "fallback") return null;
    const dot = this.snap.slot?.querySelector<SVGElement>(
      `[data-testid="fret-dot"][data-string="${6 - string}"][data-fret="${Math.round(fret)}"]`,
    );
    if (!dot) return null;
    const b = dot.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) return null;
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 };
  }

  get isTakeRunning(): boolean {
    return this.takeRunning;
  }

  /** A stable NeckStage over this controller, with `is3d` fixed at what it is now. */
  facade(is3d: boolean): NeckStage {
    return {
      setView: (v, s, o) => this.setView(v, s, o),
      setNotes: (n, o) => this.setNotes(n, o),
      pluck: (s, f, k) => this.pluck(s, f, k),
      sweep: () => this.sweep(),
      setTakeRunning: (on) => this.setTakeRunning(on),
      project: (s, f) => this.project(s, f),
      is3d,
    };
  }

  // ─── Internals ───
  private clearHide() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  private applyHidden() {
    this.wasHidden = true;
    this.unobserveSlot();
    this.set({ view: { kind: "hidden" }, slot: null, pluck: null });
    this.updatePaused();
  }

  private updatePaused() {
    const off = !this.attached || this.snap.view.kind === "hidden" || this.lost || (typeof document !== "undefined" && document.hidden);
    this.scheduler.setPaused(off);
  }

  /**
   * The prefs changed (Settings, or the probe's verdict): go flat, or leave a
   * flat neck the prefs put there and try 3D again.
   */
  prefsChanged(): void {
    const flat = !!this.deps.flat?.();
    if (flat && (this.snap.mode === "3d" || this.snap.mode === "loading")) {
      this.gen += 1; // an engine still loading is thrown away when it arrives
      this.engine?.dispose();
      this.engine = null;
      this.replaceCanvas();
      this.flatFallback = true;
      this.set({ mode: "fallback" });
    } else if (!flat && this.snap.mode === "fallback" && this.flatFallback) {
      this.flatFallback = false;
      this.set({ mode: "idle" });
      if (this.snap.view.kind !== "hidden") this.ensureBackend();
    }
  }

  /** A canvas an engine was built on cannot get a second context of another kind: give the next engine a fresh one. */
  private replaceCanvas() {
    const old = this.canvas;
    if (!old || !old.parentElement) return;
    const canvas = document.createElement("canvas");
    canvas.className = old.className;
    canvas.setAttribute("aria-hidden", "true");
    old.replaceWith(canvas);
    this.canvas = canvas;
  }

  private ensureBackend() {
    if (this.snap.mode !== "idle" || !this.canvas || !this.attached) return;
    if (this.deps.flat?.()) {
      this.flatFallback = true;
      this.set({ mode: "fallback" });
      return;
    }
    if (!this.deps.webgl2()) {
      this.set({ mode: "fallback" });
      return;
    }
    this.set({ mode: "loading" });
    const canvas = this.canvas;
    const gen = this.gen;
    const stale = () => gen !== this.gen;
    const ready = this.deps.ready ? this.deps.ready().catch(() => {}) : Promise.resolve();
    Promise.all([this.deps.loadEngine(), ready])
      .then(([m]) => {
        if (stale()) return null;
        if (this.deps.flat?.()) {
          this.flatFallback = true;
          this.set({ mode: "fallback" });
          return null;
        }
        return m.createEngine({
          canvas,
          reduced: !!this.deps.reduced,
          forcedTier: this.deps.forcedTier ?? null,
          onLost: this.onLost,
          onRestored: this.onRestored,
        });
      })
      .then((engine) => {
        if (!engine) return;
        if (stale()) {
          engine.dispose();
          return;
        }
        engine.setPalette(neckPalette());
        engine.setNotes(this.snap.notes.slice(), 0);
        if (this.snap.view.kind !== "hidden") {
          this.lastRect = this.frameRect();
          engine.setView(this.snap.view, this.lastRect, true);
        }
        if (this.deps.probe && !this.passesProbe(engine, canvas)) {
          engine.dispose();
          this.replaceCanvas();
          this.flatFallback = true;
          this.set({ mode: "fallback" });
          if (this.lastProbe) this.deps.onSlow?.(this.lastProbe);
          return;
        }
        this.engine = engine;
        this.set({ mode: "3d" });
        this.scheduler.invalidate();
      })
      .catch((e: unknown) => {
        if (!stale()) this.toFallback(e);
      });
  }

  /** The frame-time guard (`speed.ts`): false when this renderer is too slow to be a GPU. */
  private passesProbe(engine: StageEngine, canvas: HTMLCanvasElement): boolean {
    let times: number[];
    try {
      times = engine.probe(PROBE_FRAMES);
    } catch {
      return true; // a probe that cannot run says nothing; the adaptive step-down still watches
    }
    const v = judgeProbe(times, Math.max(1, canvas.width * canvas.height));
    this.lastProbe = v;
    return !v.slow;
  }

  private toFallback(e: unknown) {
    this.errors.push(String((e as Error)?.message ?? e));
    this.engine?.dispose();
    this.engine = null;
    this.set({ mode: "fallback" });
  }

  private onLost = () => {
    this.lost = true;
    this.updatePaused();
    if (this.lostTimer) clearTimeout(this.lostTimer);
    this.lostTimer = setTimeout(() => {
      this.lostTimer = null;
      if (this.lost) {
        this.lost = false;
        this.toFallback(new Error("WebGL context lost and not restored"));
        this.updatePaused();
      }
    }, LOST_GRACE_MS);
  };

  private onRestored = () => {
    if (this.lostTimer) clearTimeout(this.lostTimer);
    this.lostTimer = null;
    this.lost = false;
    this.updatePaused();
    this.scheduler.invalidate();
  };

  private onVisibility = () => this.updatePaused();

  private onResize = () => {
    this.engine?.resize(window.innerWidth, window.innerHeight);
    this.lastRect = null;
    this.queueRectCheck();
  };

  private onScroll = () => this.queueRectCheck();

  private observeSlot(slot: HTMLElement | null) {
    this.unobserveSlot();
    if (slot && typeof ResizeObserver !== "undefined") {
      this.slotObserver = new ResizeObserver(() => this.queueRectCheck());
      this.slotObserver.observe(slot);
      this.slotObserver.observe(document.documentElement);
    }
  }

  private unobserveSlot() {
    this.slotObserver?.disconnect();
    this.slotObserver = null;
  }

  private queueRectCheck() {
    if (this.rectCheck !== null || !this.engine || this.snap.view.kind === "hidden") return;
    this.rectCheck = requestAnimationFrame(() => {
      this.rectCheck = null;
      if (!this.engine || this.snap.view.kind === "hidden") return;
      const r = this.frameRect();
      const l = this.lastRect;
      if (l && Math.abs(l.left - r.left) < 0.5 && Math.abs(l.top - r.top) < 0.5 && Math.abs(l.width - r.width) < 0.5 && Math.abs(l.height - r.height) < 0.5) return;
      this.lastRect = r;
      this.engine.refit(r);
      this.scheduler.invalidate();
    });
  }

  /** Where the neck is framed: the slot (or the window), less the overview strip on a zoom. */
  frameRect(): SlotRect {
    const slot = this.snap.slot;
    let r: SlotRect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    if (slot) {
      const b = slot.getBoundingClientRect();
      if (b.width > 4 && b.height > 4) r = { left: b.left, top: b.top, width: b.width, height: b.height };
    }
    if (this.snap.view.kind === "zoom") {
      const s = stripHeight(r.height);
      r = { ...r, height: r.height - s - (s ? 6 : 0) };
    }
    return r;
  }

  private frame(dt: number, gapMs: number | null): boolean {
    const engine = this.engine;
    if (!engine || this.snap.view.kind === "hidden") return false;
    if (gapMs !== null && this.scheduler.fpsCap >= 50) this.adaptive.sample(gapMs);
    else this.adaptive.reset();
    try {
      return engine.frame(dt);
    } catch (e) {
      this.toFallback(e);
      return false;
    }
  }
}
