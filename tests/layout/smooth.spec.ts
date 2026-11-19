import { test, expect, type Page } from "@playwright/test";
import { openShot, MOBILE_URL } from "./fits";
import { installPerf, samplePerf, type PerfSample } from "./perf";

/**
 * Smoothness, held (the pass of 2026-11-19; the survey behind it is
 * `smooth-measure.spec.ts`, its numbers in `plans/HANDOFF-smooth.md`).
 *
 * What a running Take may not do to the frame it shares with the click's
 * visuals: hold the main thread for a long task, redraw what did not change,
 * force a layout per note, or let the lane fall behind the display. And what
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

test("a Take on the neck does not force a layout per note", async ({ page }) => {
  test.slow();
  /*
   * Two things did, until this pass: the level meter restarted its pulse with
   * "attribute off, read offsetWidth, attribute on" at every note heard, and
   * the neck's overlay read the "next" tag's size after it had moved the
   * ring. Each is a style-and-layout pass over the whole Take screen, inside
   * the frame. Measured here (SwiftShader, where the page gets fewer frames
   * and so fewer layouts of its own): 31 layouts in 64 commits with them, 10
   * to 17 in 61 to 65 without. (On a GPU: 1.1 a commit, and 0.6.)
   *
   * Counted by the browser (its own layout counter) against React's commits
   * in the same window, so a busy machine moves neither: frames it drops
   * only merge the layouts a frame would have done anyway.
   */
  await installPerf(page);
  await openShot(page, "session-playing", WIDE);
  await takeRunning(page);
  const s = await samplePerf(page, WINDOW_MS * 2);
  const layouts = Math.round((s.layoutsPerSec * s.ms) / 1000);
  expect(s.commits, "the Take is running").toBeGreaterThan(10);
  expect(layouts / s.commits, `${layouts} layouts in ${s.commits} commits`).toBeLessThan(0.38);
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
