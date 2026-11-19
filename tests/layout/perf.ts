import type { CDPSession, Page } from "@playwright/test";

/**
 * Frame pacing, long tasks, layout work and React renders, read from the page
 * itself (the smoothness pass, 2026-11-19).
 *
 * `installPerf` goes in before the page's own scripts (`addInitScript`), so
 * the long-task and layout-shift observers see the load as well, and React
 * registers with the hook that counts its commits. `samplePerf` then watches
 * the page for a stretch and says what happened in it.
 *
 * What the numbers are and are not: headless Chromium draws WebGL on
 * SwiftShader (the CPU), so a neck scene's frame times are a worst case, not
 * a desktop GPU's. They compare a change against itself on one machine.
 */
export type PerfSample = {
  /** Wall time watched, ms. */
  ms: number;
  /** Animation frames the page got, and the gaps between them. */
  frames: number;
  fps: number;
  gapP50: number;
  gapP95: number;
  gapP99: number;
  gapMax: number;
  /** Gaps over one and a half display frames: a frame the display showed twice. */
  dropped: number;
  /** Long tasks (over 50 ms on the main thread) that began in the window. */
  longTasks: number;
  longTaskMaxMs: number;
  longTaskTotalMs: number;
  /** Frames the neck and the runway drew in the window. */
  neckFrames: number | null;
  neckFps: number | null;
  /** Gaps between the neck's own frames, ms. */
  neckGapP50: number | null;
  neckGapP95: number | null;
  runwayFrames: number;
  /** React commits, and the components that rendered most (name: times). */
  commits: number;
  renders: Record<string, number>;
  /** ms a second React spent rendering (a dev build's own timing), and the components that took most of it (ms in the window). */
  renderMsPerSec: number;
  selfMs: Record<string, number>;
  /** The same counting each component's children: where a commit's time went, top down. */
  inclMs: Record<string, number>;
  /** Animations running at the end of the window: "name on .class [properties]"; `main` marks one the compositor cannot run alone. */
  animations: string[];
  /** Layout shift score over the window (unexpected moves only). */
  layoutShift: number;
  /** From the browser's own counters, per second of the window. */
  layoutsPerSec: number;
  styleRecalcsPerSec: number;
  layoutMsPerSec: number;
  styleMsPerSec: number;
  scriptMsPerSec: number;
  taskMsPerSec: number;
};

declare global {
  interface Window {
    __PERF__?: {
      longTasks: Array<{ start: number; duration: number }>;
      shifts: Array<{ start: number; value: number }>;
      commits: number;
      renders: Record<string, number>;
      /** ms React spent rendering (dev builds time it), in all and by component (its own, less its children). */
      renderMs: number;
      selfMs: Record<string, number>;
      /** The same with its children: where a commit's time went, from the top down. */
      inclMs: Record<string, number>;
      countRenders: boolean;
    };
  }
}

/** Before the page loads: observers, and the hook React reports its commits to. */
export async function installPerf(page: Page, opts: { countRenders?: boolean } = {}) {
  await page.addInitScript((countRenders) => {
    const perf = { longTasks: [], shifts: [], commits: 0, renders: {}, renderMs: 0, selfMs: {}, inclMs: {}, countRenders } as NonNullable<Window["__PERF__"]>;
    window.__PERF__ = perf;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) perf.longTasks.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      /* no long-task API */
    }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
          if (!e.hadRecentInput) perf.shifts.push({ start: e.startTime, value: e.value });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      /* no layout-shift API */
    }

    // React's DevTools hook, the small part of it: a commit, and which
    // components did work in it (the PerformedWork flag, as DevTools reads it).
    type Fiber = { actualDuration?: number; tag: number; flags: number; type: unknown; alternate: Fiber | null; child: Fiber | null; sibling: Fiber | null; memoizedProps: unknown; memoizedState: unknown; ref: unknown };
    const nameOf = (t: unknown): string => {
      const x = t as { displayName?: string; name?: string; render?: { name?: string }; type?: unknown } | null;
      if (!x) return "?";
      return x.displayName || x.name || x.render?.name || (x.type ? nameOf(x.type) : "") || "Anonymous";
    };
    const walk = (f: Fiber | null) => {
      while (f) {
        const a = f.alternate;
        const component = f.tag === 0 || f.tag === 1 || f.tag === 11 || f.tag === 14 || f.tag === 15;
        if (component && (f.flags & 1) !== 0 && (!a || a.memoizedProps !== f.memoizedProps || a.memoizedState !== f.memoizedState || a.ref !== f.ref)) {
          const n = nameOf(f.type);
          perf.renders[n] = (perf.renders[n] ?? 0) + 1;
          let own = f.actualDuration ?? 0;
          for (let c = f.child; c; c = c.sibling) own -= c.actualDuration ?? 0;
          if (own > 0) perf.selfMs[n] = (perf.selfMs[n] ?? 0) + own;
          perf.inclMs[n] = (perf.inclMs[n] ?? 0) + (f.actualDuration ?? 0);
        }
        // A subtree React bailed out of keeps its children by identity.
        if (!a || a.child !== f.child) walk(f.child);
        f = f.sibling;
      }
    };
    const renderers = new Map<number, unknown>();
    (window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers,
      supportsFiber: true,
      inject(r: unknown) {
        const id = renderers.size + 1;
        renderers.set(id, r);
        return id;
      },
      onCommitFiberRoot(_id: number, root: { current: Fiber }) {
        perf.commits += 1;
        perf.renderMs += root.current.actualDuration ?? 0;
        if (perf.countRenders) walk(root.current);
      },
      onPostCommitFiberRoot() {},
      onCommitFiberUnmount() {},
      onScheduleFiberRoot() {},
      checkDCE() {},
    };
  }, !!opts.countRenders);
}

const METRICS = ["LayoutCount", "RecalcStyleCount", "LayoutDuration", "RecalcStyleDuration", "ScriptDuration", "TaskDuration"] as const;

const sessions = new WeakMap<Page, Promise<CDPSession>>();

/** One session per page, kept: the counters start when it is enabled and are lost with it. */
async function browserCounters(page: Page): Promise<Record<string, number>> {
  let s = sessions.get(page);
  if (!s) {
    s = page
      .context()
      .newCDPSession(page)
      .then(async (cdp) => {
        await cdp.send("Performance.enable");
        return cdp;
      });
    sessions.set(page, s);
  }
  const { metrics } = await (await s).send("Performance.getMetrics");
  return Object.fromEntries(metrics.filter((m) => (METRICS as readonly string[]).includes(m.name)).map((m) => [m.name, m.value]));
}

/** Watch the page for `ms` (while `during` runs, when given) and report. */
export async function samplePerf(page: Page, ms: number, during?: () => Promise<void>): Promise<PerfSample> {
  const before = await browserCounters(page);
  await page.evaluate(() => {
    const w = window as unknown as {
      __PERF_RUN__?: { stamps: number[]; neck: number[]; t0: number; commits0: number; renderMs0: number; selfMs0: Record<string, number>; inclMs0: Record<string, number>; renders0: Record<string, number>; neck0: number | null; runway0: number; stop: boolean };
      __NECK__?: { current: { frames: number } | null };
    };
    const neck = () => w.__NECK__?.current?.frames ?? null;
    const run = {
      stamps: [] as number[],
      neck: [] as number[],
      t0: performance.now(),
      commits0: window.__PERF__?.commits ?? 0,
      renderMs0: window.__PERF__?.renderMs ?? 0,
      selfMs0: { ...(window.__PERF__?.selfMs ?? {}) },
      inclMs0: { ...(window.__PERF__?.inclMs ?? {}) },
      renders0: { ...(window.__PERF__?.renders ?? {}) },
      neck0: neck(),
      runway0: window.__RUNWAY_FRAMES__ ?? 0,
      stop: false,
    };
    w.__PERF_RUN__ = run;
    let last = run.neck0;
    const step = (t: number) => {
      if (run.stop) return;
      run.stamps.push(t);
      const n = neck();
      if (n !== null && last !== null && n > last) run.neck.push(t);
      last = n;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  if (during) {
    await Promise.all([during(), page.waitForTimeout(ms)]);
  } else {
    await page.waitForTimeout(ms);
  }
  const raw = await page.evaluate(() => {
    const w = window as unknown as {
      __PERF_RUN__: { stamps: number[]; neck: number[]; t0: number; commits0: number; renderMs0: number; selfMs0: Record<string, number>; inclMs0: Record<string, number>; renders0: Record<string, number>; neck0: number | null; runway0: number; stop: boolean };
      __NECK__?: { current: { frames: number } | null };
    };
    const run = w.__PERF_RUN__;
    run.stop = true;
    const t1 = performance.now();
    const p = window.__PERF__;
    const renders: Record<string, number> = {};
    for (const [k, v] of Object.entries(p?.renders ?? {})) {
      const d = v - (run.renders0[k] ?? 0);
      if (d > 0) renders[k] = d;
    }
    const selfMs: Record<string, number> = {};
    for (const [k, v] of Object.entries(p?.selfMs ?? {})) {
      const d = v - (run.selfMs0[k] ?? 0);
      if (d > 0.05) selfMs[k] = Math.round(d * 10) / 10;
    }
    const inclMs: Record<string, number> = {};
    for (const [k, v] of Object.entries(p?.inclMs ?? {})) {
      const d = v - (run.inclMs0[k] ?? 0);
      if (d > 0.05) inclMs[k] = Math.round(d * 10) / 10;
    }
    const neckNow = w.__NECK__?.current?.frames ?? null;
    const animations = document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map((a) => {
        const effect = a.effect as KeyframeEffect | null;
        const el = effect?.target as Element | null;
        const props = new Set<string>();
        for (const k of effect?.getKeyframes() ?? []) for (const key of Object.keys(k)) if (!["offset", "easing", "composite", "computedOffset"].includes(key)) props.add(key);
        // What a compositor animates without the main thread.
        const cheap = [...props].every((x) => ["transform", "opacity", "translate", "scale", "rotate", "filter", "backdropFilter"].includes(x));
        const endless = !Number.isFinite(effect?.getComputedTiming().endTime ?? Infinity);
        const name = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? "script";
        const cls = typeof el?.className === "string" ? el.className.split(" ")[0] : el?.tagName ?? "";
        const r = el?.getBoundingClientRect();
        const shown = !!r && r.width > 0 && r.height > 0;
        return `${cheap ? "" : "main "}${endless ? "endless " : ""}${shown ? "" : "hidden "}${name} on .${cls} [${[...props].join(",")}]`;
      });
    return {
      animations: [...new Set(animations)],
      t0: run.t0,
      t1,
      stamps: run.stamps,
      neckStamps: run.neck,
      commits: (p?.commits ?? 0) - run.commits0,
      renderMs: (p?.renderMs ?? 0) - run.renderMs0,
      selfMs,
      inclMs,
      renders,
      neckFrames: neckNow !== null && run.neck0 !== null ? neckNow - run.neck0 : null,
      runwayFrames: (window.__RUNWAY_FRAMES__ ?? 0) - run.runway0,
      longTasks: (p?.longTasks ?? []).filter((l) => l.start >= run.t0 && l.start <= t1),
      shifts: (p?.shifts ?? []).filter((s) => s.start >= run.t0 && s.start <= t1),
    };
  });
  const after = await browserCounters(page);
  const dur = raw.t1 - raw.t0;
  const sec = dur / 1000;
  const gapsOf = (xs: number[]) => xs.slice(1).map((t, i) => t - xs[i]).sort((a, b) => a - b);
  const q = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);
  const gaps = gapsOf(raw.stamps);
  const neckGaps = gapsOf(raw.neckStamps);
  const d = (k: string) => (after[k] ?? 0) - (before[k] ?? 0);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const top = Object.fromEntries(
    Object.entries(raw.renders)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14),
  );
  return {
    ms: Math.round(dur),
    frames: raw.stamps.length,
    fps: r1(gaps.length / sec),
    gapP50: r1(q(gaps, 0.5)),
    gapP95: r1(q(gaps, 0.95)),
    gapP99: r1(q(gaps, 0.99)),
    gapMax: r1(gaps[gaps.length - 1] ?? 0),
    dropped: gaps.filter((g) => g > 25).length,
    longTasks: raw.longTasks.length,
    longTaskMaxMs: Math.round(Math.max(0, ...raw.longTasks.map((l) => l.duration))),
    longTaskTotalMs: Math.round(raw.longTasks.reduce((a, l) => a + l.duration, 0)),
    neckFrames: raw.neckFrames,
    neckFps: raw.neckFrames === null ? null : r1(raw.neckFrames / sec),
    neckGapP50: neckGaps.length ? r1(q(neckGaps, 0.5)) : null,
    neckGapP95: neckGaps.length ? r1(q(neckGaps, 0.95)) : null,
    runwayFrames: raw.runwayFrames,
    commits: raw.commits,
    renders: top,
    renderMsPerSec: r1(raw.renderMs / sec),
    selfMs: Object.fromEntries(
      Object.entries(raw.selfMs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 16),
    ),
    inclMs: Object.fromEntries(
      Object.entries(raw.inclMs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24),
    ),
    animations: raw.animations,
    layoutShift: Math.round(raw.shifts.reduce((a, s) => a + s.value, 0) * 10000) / 10000,
    layoutsPerSec: r1(d("LayoutCount") / sec),
    styleRecalcsPerSec: r1(d("RecalcStyleCount") / sec),
    layoutMsPerSec: r1((d("LayoutDuration") * 1000) / sec),
    styleMsPerSec: r1((d("RecalcStyleDuration") * 1000) / sec),
    scriptMsPerSec: r1((d("ScriptDuration") * 1000) / sec),
    taskMsPerSec: r1((d("TaskDuration") * 1000) / sec),
  };
}

/** What happened between navigation and now: the load's long tasks and layout shift. */
export async function loadPerf(page: Page): Promise<{ longTasks: number; longTaskMaxMs: number; layoutShift: number; shifts: Array<{ start: number; value: number }> }> {
  return page.evaluate(() => {
    const p = window.__PERF__;
    const lt = p?.longTasks ?? [];
    const shifts = (p?.shifts ?? []).map((s) => ({ start: Math.round(s.start), value: Math.round(s.value * 10000) / 10000 }));
    return {
      longTasks: lt.length,
      longTaskMaxMs: Math.round(Math.max(0, ...lt.map((l) => l.duration))),
      layoutShift: Math.round(shifts.reduce((a, s) => a + s.value, 0) * 10000) / 10000,
      shifts,
    };
  });
}
