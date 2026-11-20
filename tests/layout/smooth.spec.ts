import { test, expect, type Page } from "@playwright/test";
import { openShot, MOBILE_URL } from "./fits";
import { installPerf, samplePerf, type PerfSample } from "./perf";

/**
 * Smoothness, held (the pass of 2026-11-19; the survey behind it is
 * `smooth-measure.spec.ts`, its numbers in `plans/HANDOFF-smooth.md`).
 *
 * What a running Take may not do to the frame it shares with the click's
 * visuals: hold the main thread for a long task, redraw what did not change,
 * restart an animation with a forced reflow, or let the lane fall behind the display. And what
 * the screens around it may not do: build the 3D engine in the frame a
 * Session opens on.
 *
 * Written for a busy machine (see README, "When the machine is busy"):
 *
 * - Nothing here is a count over a second of wall clock. Renders are counted
 *   per commit, the lane's frames per frame the page got, and a long task is
 *   looked for in the best of three windows: load can add a long task to a
 *   window, it cannot take one out.
 * - The neck draws on SwiftShader here, which is slow on purpose-built
 *   grounds (`stage.spec.ts`); nothing below reads how fast it drew.
 */
test.use({
  launchOptions: {
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

const WIDE = { width: 1400, height: 900 };
const PHONE = { width: 390, height: 844 };
const WINDOW_MS = 2500;

/** Up to three windows of a running scene; the one with the fewest long tasks. */
async function bestWindow(page: Page): Promise<PerfSample> {
  let best: PerfSample | null = null;
  for (let i = 0; i < 3; i++) {
    const s = await samplePerf(page, WINDOW_MS);
    if (!best || s.longTasks < best.longTasks) best = s;
    if (s.longTasks === 0) break;
  }
  return best!;
}

/** The Take in the scene is running: the big button says so and the engine has reported. */
async function takeRunning(page: Page) {
  await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "playing", { timeout: 30_000 });
}

const TAKES: Array<{ scene: string; phone?: boolean; what: string }> = [
  { scene: "session-playing", what: "the neck" },
  { scene: "session-runway-playing", what: "the runway" },
  { scene: "session-playing-tab", what: "the tab" },
  { scene: "phone-session-playing", phone: true, what: "the tab, on a phone" },
  { scene: "phone-session-runway-playing", phone: true, what: "the runway, on a phone" },
];

for (const build of ["desktop", "phone"] as const) {
  test.describe(`a running Take, ${build}`, () => {
    if (build === "phone") test.use({ baseURL: MOBILE_URL, viewport: PHONE, isMobile: true, hasTouch: true });
    for (const take of TAKES.filter((t) => !!t.phone === (build === "phone"))) {
      test(`${take.scene}: no long task, and nothing redrawn that did not change (${take.what})`, async ({ page }) => {
        test.slow();
        await installPerf(page, { countRenders: true });
        await openShot(page, take.scene, take.phone ? PHONE : WIDE);
        await takeRunning(page);
        const s = await bestWindow(page);

        // 1. The main thread is never held for a frame budget three times over.
        expect(s.longTasks, `long tasks in the best of three windows (longest ${s.longTaskMaxMs} ms)`).toBe(0);

        // 2. A commit per report from the engine, and not many times that: at
        //    80 BPM in sixteenths the engine reports about five times a second
        //    and the lights follow each note (nine commits a second measured).
        expect(s.commits, "the Take is running: React commits as the engine reports").toBeGreaterThan(0);
        expect(s.commits / (s.ms / 1000), `${s.commits} commits in ${s.ms} ms`).toBeLessThan(24);

        // 3. The tab's notes are drawn once, not at every beat. Before the
        //    pass every `Segment` on screen re-rendered with each commit
        //    (thirty `TechMarks` nine times a second).
        const marks = s.renders.TechMarks ?? 0;
        expect(marks, `TechMarks rendered ${marks} times in ${s.commits} commits`).toBeLessThanOrEqual(s.commits * 4);

        // 4. The overview strip under the neck changes with the notes, not with the shell.
        const strip = s.renders.OverviewStrip ?? 0;
        expect(strip, `OverviewStrip rendered ${strip} times in ${s.commits} commits`).toBeLessThanOrEqual(Math.ceil(s.commits * 0.75));

        // 5. The lane moves on every frame the page gets (this webview is not
        //    one held to 30, and the fallback has not been given cause).
        if (/runway/.test(take.scene)) {
          expect(s.runwayFrames, "the lane is moving").toBeGreaterThan(10);
          expect(s.runwayFrames / s.frames, `${s.runwayFrames} lane frames in ${s.frames} page frames`).toBeGreaterThan(0.45);
        }
      });
    }
  });
}

/*
 * The coach's order during a Take (DESIGN 3.4): rendered once, as the Take
 * starts, and never again while it runs. It reads no beat and no count, so
 * the commits the engine's reports cause must not reach it; nor may the
 * coach's note, which has no business on a running screen at all.
 */
for (const scene of ["coach-take-order", "coach-take-order-runway"]) {
  test(`${scene}: the coach's line and note never commit during a running Take`, async ({ page }) => {
    test.slow();
    await installPerf(page, { countRenders: true });
    await openShot(page, scene, WIDE);
    await takeRunning(page);
    await expect(page.locator('[data-testid="coach-order"]')).toBeVisible();
    const s = await samplePerf(page, WINDOW_MS);
    expect(s.commits, "the Take is running: React commits as the engine reports").toBeGreaterThan(0);
    expect(s.renders.TakeOrder ?? 0, `TakeOrder rendered in ${s.commits} commits`).toBe(0);
    expect(s.renders.CoachNote ?? 0, `CoachNote rendered in ${s.commits} commits`).toBe(0);
    expect(s.renders.CoachLine ?? 0, `CoachLine rendered in ${s.commits} commits`).toBe(0);
  });
}

/*
 * The loop (coach leg c1c; DESIGN 4.2, "Loop a bar"): a per-beat screen like
 * a Take, held to the same rules, and the coach's note (which it does not
 * show) never commits under it.
 */
test("coach-loop: a loop running holds a Take's rules, and the coach's note never commits", async ({ page }) => {
  test.slow();
  await installPerf(page, { countRenders: true });
  await openShot(page, "coach-loop", WIDE);
  await expect(page.locator('[data-testid="session-loop-screen"]')).toHaveAttribute("data-phase", "looping", { timeout: 30_000 });
  const s = await bestWindow(page);
  expect(s.longTasks, `long tasks in the best of three windows (longest ${s.longTaskMaxMs} ms)`).toBe(0);
  expect(s.commits, "the loop is running: React commits as the engine reports").toBeGreaterThan(0);
  expect(s.commits / (s.ms / 1000), `${s.commits} commits in ${s.ms} ms`).toBeLessThan(24);
  const strip = s.renders.OverviewStrip ?? 0;
  expect(strip, `OverviewStrip rendered ${strip} times in ${s.commits} commits`).toBeLessThanOrEqual(Math.ceil(s.commits * 0.75));
  expect(s.renders.CoachNote ?? 0, `CoachNote rendered in ${s.commits} commits`).toBe(0);
  expect(s.renders.CoachLine ?? 0, `CoachLine rendered in ${s.commits} commits`).toBe(0);
});

test("the lane keeps the display's beat: a frame for every frame, or exactly every other", async ({ page }) => {
  test.slow();
  await installPerf(page);
  await openShot(page, "session-runway-playing", WIDE, "ember", { takefps: "120" });
  await takeRunning(page);
  // Forced to the display's rate (`?takefps`), so a machine too busy to hold
  // it cannot trip the fallback mid-measure: then every page frame moves the lane.
  const s = await samplePerf(page, WINDOW_MS);
  expect(s.runwayFrames / s.frames, `${s.runwayFrames} lane frames in ${s.frames} page frames`).toBeGreaterThan(0.9);

  await openShot(page, "session-runway-playing", WIDE, "ember", { takefps: "30" });
  await takeRunning(page);
  const low = await samplePerf(page, WINDOW_MS);
  // Held to 30 on a 60 Hz page: every other frame, never more.
  expect(low.runwayFrames / low.frames, `${low.runwayFrames} lane frames in ${low.frames} page frames at 30`).toBeLessThan(0.62);
  expect(low.runwayFrames, "the lane still moves at 30").toBeGreaterThan(10);
});

test("Ask commits nothing during a running Take: the Ask key there is one static label", async ({ page }) => {
  test.slow();
  /*
   * DESIGN 3.4 (leg c2a1): nothing of Ask exists while a Take runs. The key
   * pressed then shows "Ask opens after this Take" in the bar, once, and the
   * panel itself is not mounted, so it cannot render with the shell at each
   * report from the engine.
   */
  await installPerf(page, { countRenders: true });
  await openShot(page, "session-playing", WIDE);
  await takeRunning(page);
  await page.keyboard.press("Shift+Slash");
  await expect(page.locator('[data-testid="session-coach-ask-later"]')).toBeVisible();
  const s = await bestWindow(page);
  expect(s.commits, "the Take is running").toBeGreaterThan(0);
  expect(s.renders.AskPanel ?? 0, "the Ask panel rendered during the Take").toBe(0);
  expect(await page.locator(".ask-panel").count(), "the Ask panel is mounted during the Take").toBe(0);
  expect(await page.locator('[data-testid="session-coach-ask"]').count(), "an Ask button in the bar during the Take").toBe(0);
  expect(s.longTasks, `long tasks in the best of three windows (longest ${s.longTaskMaxMs} ms)`).toBe(0);
});

test("the open Ask panel on a tool screen does not re-render with the beat", async ({ page }) => {
  test.slow();
  /*
   * Review of leg c2a1: the tools' coach inside Ask was a new element at
   * every render of the shell, which re-renders at every report from the
   * engine, so the panel's `memo` did nothing. The drill is climbing, the
   * click playing, Ask open over it with the tools' coach as its second
   * section: the shell commits, the panel does not.
   */
  await installPerf(page, { countRenders: true });
  await openShot(page, "drill", WIDE);
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await expect(page.locator('[data-testid="ask-section-tools"]')).toBeVisible();
  const s = await samplePerf(page, WINDOW_MS);
  expect(s.commits, "the click is playing: the shell commits as the engine reports").toBeGreaterThan(0);
  expect(s.renders.AskPanel ?? 0, `AskPanel rendered in ${s.commits} commits`).toBe(0);
});

test("the level meter pulses without reading the layout", async ({ page }) => {
  test.slow();
  /*
   * It restarted its pulse with "attribute off, read offsetWidth, attribute
   * on" at every note heard: a style-and-layout pass over the whole Take
   * screen each time, the top of the profile of a running Take. It plays an
   * `el.animate` now. Asked of the read itself, by who made it, because the
   * count of layouts a second moves with how many frames a busy machine
   * gives the page (0.16 to 0.55 a commit for one build, measured), and a
   * gate that moves with the machine is not one.
   */
  await page.addInitScript(() => {
    const w = window as unknown as { __METER_READS__: number };
    w.__METER_READS__ = 0;
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!;
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get(this: HTMLElement) {
        if (this.classList?.contains("live-level") || /LiveLevelBars/.test(String(new Error().stack ?? ""))) w.__METER_READS__ += 1;
        return d.get!.call(this);
      },
    });
  });
  await openShot(page, "session-playing", WIDE);
  await takeRunning(page);
  // The meter is on screen and has pulsed: notes have been heard and lit.
  await expect(page.locator(".live-level").first()).toBeVisible();
  await page.waitForFunction(() => document.querySelectorAll(".live-level[data-pulse]").length > 0, undefined, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __METER_READS__: number }).__METER_READS__)).toBe(0);
});

test("the 3D neck is ready before the first Start: a Session does not open on the engine being built", async ({ page }) => {
  test.slow();
  await openShot(page, "today-returning", WIDE);
  // Today has no neck on it. Idle, it gets the engine ready all the same.
  expect(await page.evaluate(() => window.__NECK__?.current?.getSnapshot().view.kind)).toBe("hidden");
  await page.waitForFunction(() => window.__NECK__?.current?.mode === "3d", undefined, { timeout: 30_000 });
  // Ready, and drawing nothing: rule 1 holds on a calm screen.
  const frames = await page.evaluate(() => window.__NECK__!.current!.frames);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__NECK__!.current!.frames), "frames drawn with no neck on screen").toBe(frames);
  expect(await page.evaluate(() => window.__NECK__!.current!.scheduler.active)).toBe(false);
  // And the same engine is the one the Session draws with.
  await page.locator('[data-testid="today-start"]').click();
  await page.waitForFunction(() => window.__NECK__?.current?.getSnapshot().view.kind === "zoom", undefined, { timeout: 15_000 });
  expect(await page.evaluate(() => window.__NECK__!.current!.mode)).toBe("3d");
});

test("a tool never loads the 3D engine", async ({ page }) => {
  await openShot(page, "metronome", WIDE);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__NECK__?.current?.mode ?? "idle")).toBe("idle");
});
