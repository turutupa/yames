import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { openShot, MOBILE_URL } from "./fits";
import { installPerf, loadPerf, samplePerf, type PerfSample } from "./perf";

/**
 * The frame-time survey behind the smoothness pass (2026-11-19). Not a gate:
 * it runs only when asked, and writes one JSON file per scene.
 *
 *     YAMES_PERF_OUT=~/projects/.preview/smooth/before \
 *       npx playwright test smooth-measure --workers=1
 *
 * `--workers=1`, or the scenes measure each other. `smooth.spec.ts` is the
 * gate that came out of it.
 */
const OUT = process.env.YAMES_PERF_OUT;
test.skip(!OUT, "set YAMES_PERF_OUT to run the survey");
test.describe.configure({ mode: "serial" });
// YAMES_PERF_GL: other flags for the GL backend (a GPU, where the machine has one Chromium can use).
const GL = process.env.YAMES_PERF_GL?.split(" ") ?? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const ONLY = process.env.YAMES_PERF_ONLY?.split(",");
test.use({ launchOptions: { args: GL } });

const DESKTOP = { width: 1400, height: 900 };
const PHONE = { width: 390, height: 844 };

type Act = (page: import("@playwright/test").Page) => Promise<void>;

/**
 * Scroll the tallest scroller on the page down and back, from inside the page
 * on its own animation frames. (Playwright's wheel asks the page where the
 * pointer is before each tick, which forces a layout per tick: the trace of a
 * Settings scroll was two thirds that, 2026-11-19.)
 */
const scrollIt: Act = async (page) => {
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        let best: Element | null = null;
        let room = 0;
        for (const el of document.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          if (!/auto|scroll/.test(cs.overflowY)) continue;
          const r = el.scrollHeight - el.clientHeight;
          if (r > room) {
            room = r;
            best = el;
          }
        }
        if (!best) return done();
        const el = best as HTMLElement;
        let n = 0;
        const step = () => {
          n += 1;
          el.scrollTop += n <= 60 ? 14 : -14;
          if (n < 120) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
  );
};

const click = (selector: string, then?: string): Act => async (page) => {
  await page.locator(selector).first().click();
  if (then) await page.locator(then).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
};

/** Press a rail (or, on a phone, a tab bar) destination, wait, press another. */
const hop = (...views: string[]): Act => async (page) => {
  for (const v of views) {
    await page.locator(`button.rail-mode[data-view="${v}"], .mobile-tab[data-tab="${v}"]`).first().click();
    await page.waitForTimeout(700);
  }
};

/** [scene, what happens while it is watched, ms watched] */
const SCENES: Array<[string, Act | null, number, string?]> = [
  ["session-ready", null, 3000],
  ["session-playing", null, 6000],
  ["session-playing-neck", null, 6000],
  ["session-runway-playing", null, 6000],
  ["session-playing-tab", null, 6000],
  ["session-band-playing", null, 6000],
  ["session-warmup", null, 5000],
  ["session-result", null, 2000],
  ["today-returning", null, 2000],
  ["today-returning", hop("paths", "progress", "today", "paths", "today"), 4000, "hops"],
  ["today-returning", click('[data-testid="today-start"]'), 2500, "start"],
  ["session-ready", click('[data-testid="session-big"]'), 3000, "starttake"],
  ["paths", scrollIt, 2500],
  ["path-alternate", scrollIt, 2500],
  ["progress", scrollIt, 2500],
  ["tour-learn", null, 2500],
  ["firstrun-welcome", null, 2000],
  ["settings-update", scrollIt, 2500],
  ["stage-zoom", null, 1500],
  ["tabstrip-playing", null, 4000],
];

for (const build of ["desktop", "phone"] as const) {
  test.describe(build, () => {
    if (build === "phone") test.use({ baseURL: MOBILE_URL, viewport: PHONE, isMobile: true, hasTouch: true });
    for (const [scene, act, ms, tag] of SCENES) {
      if (ONLY && !ONLY.includes(scene)) continue;
      test(`${build} ${scene}${tag ? ` ${tag}` : ""}`, async ({ page }) => {
        test.setTimeout(120_000);
        const size = build === "phone" ? PHONE : DESKTOP;
        const id = build === "phone" && !/^(stage|tabstrip|settings|tour)/.test(scene) ? `phone-${scene}` : scene;
        await installPerf(page, { countRenders: true });
        const t0 = Date.now();
        try {
          await openShot(page, id, size);
        } catch (e) {
          if (build === "phone") {
            test.skip(true, `no ${id} scene: ${String(e).slice(0, 80)}`);
            return;
          }
          throw e;
        }
        const readyMs = Date.now() - t0;
        const load = await loadPerf(page);
        const gpu = await page.evaluate(() => {
          const gl = document.createElement("canvas").getContext("webgl2");
          const ext = gl?.getExtension("WEBGL_debug_renderer_info");
          return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "none";
        });
        // YAMES_PERF_TRACE=1: where the main thread's time went in the window, by trace event.
        const tracing = !!process.env.YAMES_PERF_TRACE;
        if (tracing) await page.context().browser()!.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "toplevel", "blink", "cc", "v8", "disabled-by-default-devtools.timeline.invalidationTracking", "disabled-by-default-devtools.timeline.stack"] });
        // YAMES_PERF_PROFILE=1: the functions the main thread spent the window in (V8's sampler).
        const profiling = !!process.env.YAMES_PERF_PROFILE;
        const cdp = profiling ? await page.context().newCDPSession(page) : null;
        if (cdp) {
          await cdp.send("Profiler.enable");
          await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
          await cdp.send("Profiler.start");
        }
        const sample: PerfSample = await samplePerf(page, ms, act ? () => act(page) : undefined);
        let profile: Record<string, number> | undefined;
        if (cdp) {
          const { profile: prof } = await cdp.send("Profiler.stop");
          const self = new Map<number, number>();
          const dts = prof.timeDeltas ?? [];
          (prof.samples ?? []).forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dts[i] ?? 0) / 1000));
          const by: Record<string, number> = {};
          for (const n of prof.nodes) {
            const t = self.get(n.id);
            if (!t) continue;
            const f = n.callFrame;
            const k = `${f.functionName || "(anon)"} ${f.url.split("/").pop()?.split("?")[0] ?? ""}:${f.lineNumber}`;
            by[k] = (by[k] ?? 0) + t;
          }
          profile = Object.fromEntries(
            Object.entries(by)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 40)
              .map(([k, v]) => [k, Math.round(v * 10) / 10]),
          );
        }
        let trace: Record<string, number> | undefined;
        if (tracing) {
          const buf = await page.context().browser()!.stopTracing();
          const events = JSON.parse(buf.toString("utf8")).traceEvents as Array<{ name: string; ph: string; dur?: number; tid: number; pid: number; args?: { data?: { functionName?: string; url?: string } } }>;
          // The page's main thread: the busiest thread named CrRendererMain.
          const mains = new Set(events.filter((e) => e.ph === "M" && e.name === "thread_name" && (e.args as { name?: string } | undefined)?.name === "CrRendererMain").map((e) => `${e.pid}:${e.tid}`));
          const byThread = new Map<string, number>();
          for (const e of events) {
            const k = `${e.pid}:${e.tid}`;
            if (e.ph === "X" && mains.has(k)) byThread.set(k, (byThread.get(k) ?? 0) + 1);
          }
          const main = [...byThread.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
          const sum: Record<string, number> = {};
          const count: Record<string, number> = {};
          for (const e of events) {
            if (e.ph !== "X" || `${e.pid}:${e.tid}` !== main || !e.dur) continue;
            sum[e.name] = (sum[e.name] ?? 0) + e.dur / 1000;
            // A layout the script forced: read with the stack that asked for it.
            if (e.name === "Layout" || e.name === "UpdateLayoutTree") {
              const st = (e.args as { beginData?: { stackTrace?: Array<{ functionName: string; url: string; lineNumber: number }> } } | undefined)?.beginData?.stackTrace?.[0];
              if (st) {
                const k = `forced ${e.name} by ${st.functionName || "?"} ${st.url.split("/").pop()?.split("?")[0]}:${st.lineNumber}`;
                sum[k] = (sum[k] ?? 0) + e.dur / 1000;
                count[k] = (count[k] ?? 0) + 1;
              }
            }
          }
          // What asked for the style recalcs and layouts: the node, and why.
          for (const e of events as unknown as Array<{ name: string; args?: { data?: { nodeName?: string; reason?: string; extraData?: string } } }>) {
            if (e.name !== "StyleRecalcInvalidationTracking" && e.name !== "LayoutInvalidationTracking" && e.name !== "ScheduleStyleInvalidationTracking") continue;
            const d = e.args?.data;
            const k = `${e.name.replace("InvalidationTracking", "")} ${d?.nodeName ?? "?"} (${d?.reason ?? d?.extraData ?? ""})`;
            sum[k] = (sum[k] ?? 0) + 0.001;
            count[k] = (count[k] ?? 0) + 1;
          }
          const asked = Object.entries(count)
            .filter(([k]) => /^(StyleRecalc|Layout|ScheduleStyle) /.test(k))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 14);
          for (const [k] of asked) sum[k] = 1e6 + count[k];
          trace = Object.fromEntries(
            Object.entries(sum)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 40)
              .map(([k, v]) => [count[k] ? `${k} x${count[k]}` : k, Math.round(v * 10) / 10]),
          );
        }
                mkdirSync(OUT!, { recursive: true });
        writeFileSync(path.join(OUT!, `${build}-${scene}${tag ? `-${tag}` : ""}.json`), JSON.stringify({ scene: id, size, gpu, readyMs, load, sample, trace, profile }, null, 2));
      });
    }
  });
}
