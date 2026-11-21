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

/**
 * Renders of a component by its name, however the dev build spelled it.
 * `export const X = memo(function X …)` is served with the inner function
 * renamed `X2` (the module already has an `X`), so a count read under `X`
 * alone stays 0 whatever the component does.
 */
function rendersOf(s: PerfSample, name: string): number {
  return Object.entries(s.renders)
    .filter(([n]) => n === name || new RegExp(`^${name}\\d+$`).test(n))
    .reduce((sum, [, v]) => sum + v, 0);
}

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
// c4c: and when the order is the cue the last Take chose, the same, on the neck and on the runway.
// (The neck's was missing: the harness hurried the Take after Go again too, so it was over before the
// scene returned. It runs at its tempo now; pol1.)
for (const scene of ["coach-take-order", "coach-take-order-runway", "coach-next-order", "coach-next-order-runway"]) {
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

/*
 * "Hear bar N: yours, then the demo" (coach leg c5b2): while the player's
 * bar plays nothing renders per frame. The chip's words change at the press
 * and at the boundary between the halves, nothing in between; and during a
 * Take the chip is not in the page at all.
 */
test("hear-back: the player's bar plays without a commit per frame, and a Take has no chip", async ({ page }) => {
  test.slow();
  await installPerf(page, { countRenders: true });
  await openShot(page, "session-between", WIDE, "ember", { hearBack: "1" });
  const chip = page.locator('[data-testid="coach-hear-back"]');
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.click();
  await expect(chip).toHaveText(/^Yours: bar \d+ · Stop$/);
  // The harness's bar lasts 1.2 s; this window sits inside it, after the press's own commit.
  const s = await samplePerf(page, 700);
  expect(s.commits, `${s.commits} commits while the player's bar played`).toBeLessThanOrEqual(2);
  expect(rendersOf(s, "CoachNote"), `CoachNote rendered in ${s.commits} commits`).toBeLessThanOrEqual(2);
  await expect(chip).toHaveText(/^Hear bar \d+: yours, then the demo$/, { timeout: 30_000 });

  await openShot(page, "session-playing", WIDE, "ember", { hearBack: "1" });
  await takeRunning(page);
  await expect(page.locator('[data-testid="coach-hear-back"]')).toHaveCount(0);
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
  /*
   * hd1: it waits on states, not on time. Under load the three windows of
   * `bestWindow` could outlast the Take, and once the Take ends Ask opens as
   * the bar promised, which read as "rendered during the Take". Now every
   * window measured begins and ends with the Take playing (one that the Take
   * ended in is thrown away), the counts of the DOM are read while it plays,
   * and AskPanel's renders are summed over every window kept, not read from
   * the best one alone. When the Take ends before the three windows the old
   * test had and none was free of long tasks, the scene is opened again (three
   * openings at most) for the rest of the three: never more windows than
   * before, only every one of them inside a running Take.
   */
  await installPerf(page, { countRenders: true });
  let best: PerfSample | null = null;
  let askRenders = 0;
  let windows = 0;
  const seen: string[] = [];
  for (let opening = 0; opening < 3; opening++) {
    await openShot(page, "session-playing", WIDE);
    await takeRunning(page);
    await page.keyboard.press("Shift+Slash");
    await expect(page.locator('[data-testid="session-coach-ask-later"]')).toBeVisible({ timeout: 30_000 });
    // The press's own commit is over: two frames have been drawn since.
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    if ((await takePhase(page)) !== "playing") continue;
    expect(await page.locator(".ask-panel").count(), "the Ask panel is mounted during the Take").toBe(0);
    expect(await page.locator('[data-testid="session-coach-ask"]').count(), "an Ask button in the bar during the Take").toBe(0);
    const kept = await windowsInTake(page, 3 - windows);
    windows += kept.windows.length;
    seen.push(`opening ${opening + 1}: ${kept.windows.map((w) => w.longTasks).join(",") || "-"}${kept.ended ? " (Take ended)" : ""}`);
    for (const s of kept.windows) {
      askRenders += s.renders.AskPanel ?? 0;
      if (!best || s.longTasks < best.longTasks) best = s;
    }
    // Done at a window free of long tasks, or at the old test's three windows
    // in all: never more chances than it had, only all of them inside a Take.
    if ((best && best.longTasks === 0) || windows >= 3) break;
  }
  expect(best, "no measuring window began and ended inside the Take, in three openings of the scene").not.toBeNull();
  const s = best!;
  expect(s.commits, "the Take is running").toBeGreaterThan(0);
  expect(askRenders, `the Ask panel rendered during the Take (${windows} windows)`).toBe(0);
  expect(s.longTasks, `long tasks in the best of ${windows} windows (longest ${s.longTaskMaxMs} ms; ${seen.join("; ")})`).toBe(0);
});

/** What the Take's big button says it is doing. */
function takePhase(page: Page): Promise<string | null> {
  return page.locator('[data-testid="session-take"]').getAttribute("data-phase");
}

/**
 * `bestWindow`'s windows, held inside the Take: up to `most`, each kept only
 * when the Take was still playing as it ended (it was as the first began, and
 * none is taken after one the Take ended in); it stops early at a window free
 * of long tasks, as `bestWindow` does.
 */
async function windowsInTake(page: Page, most: number): Promise<{ windows: PerfSample[]; ended: boolean }> {
  const windows: PerfSample[] = [];
  for (let i = 0; i < most; i++) {
    const s = await samplePerf(page, WINDOW_MS);
    if ((await takePhase(page)) !== "playing") return { windows, ended: true };
    windows.push(s);
    if (s.longTasks === 0) break;
  }
  return { windows, ended: false };
}

test("the open Ask panel on a tool screen does not re-render with the beat", async ({ page }) => {
  test.slow();
  /*
   * Review of leg c2a1: the tools' coach inside Ask was a new element at
   * every render of the shell, which re-renders at every report from the
   * engine, so the panel's `memo` did nothing. The drill is climbing, the
   * click playing, Ask open over it: the shell commits, the panel does not.
   * (Since c2a2 the tools' coach is not in Ask at all; this still holds the
   * panel's own `memo`.)
   */
  await installPerf(page, { countRenders: true });
  await openShot(page, "drill", WIDE);
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  const s = await samplePerf(page, WINDOW_MS);
  expect(s.commits, "the click is playing: the shell commits as the engine reports").toBeGreaterThan(0);
  expect(rendersOf(s, "AskPanel"), `AskPanel rendered in ${s.commits} commits`).toBe(0);
});

test("the tools' coach under the stage does not re-render with the beat while Listen is on", async ({ page }) => {
  test.slow();
  /*
   * Leg c2a2: `ToolCoach` sits under every tool's stage, inside the shell
   * that re-renders at each report from the engine. It is `memo` and none of
   * its props change at a beat, so with the click playing and Listen on the
   * shell commits and it does not. Listen first, then the click, the way a
   * player does it (the metronome: its tempo stays put, so no settings change
   * opens a new run under the sample).
   */
  await installPerf(page, { countRenders: true });
  await openShot(page, "metronome", WIDE);
  const listen = page.locator('[data-testid="transport-listen"]');
  await listen.click();
  await expect(listen).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[data-testid="tool-coach"]')).toBeVisible();
  await page.locator(".transport-play").click();
  await expect(page.locator(".transport-play.playing")).toBeVisible();
  // The run's own start (`runStartedAt`) and the status chip's "playing" are
  // one render each, as the click starts; let them land before sampling.
  await page.waitForTimeout(1200);
  /*
   * Asked of ToolCoach's own fiber, not of `perf.ts`'s commit walk: that walk
   * does not reach the shell's main content (it counts the Transport 0 times
   * in a window where its bar count visibly changes), so a 0 from it here
   * would prove nothing. A function component that renders gets a new hook
   * list; one that `memo` bails out of keeps the one it had. So: the hook
   * lists on the fiber pair before the window, and after it.
   */
  await page.evaluate(() => {
    type F = { type: unknown; return: F | null; alternate: F | null; memoizedState: unknown };
    const el = document.querySelector('[data-testid="tool-coach"]')!;
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"))!;
    let f: F | null = (el as unknown as Record<string, F>)[key];
    while (f && !(typeof f.type === "function" && /^ToolCoach\d*$/.test((f.type as { name: string }).name))) f = f.return;
    const w = window as unknown as { __TC__: { fiber: F; seen: unknown[] } };
    w.__TC__ = { fiber: f!, seen: [f!.memoizedState, f!.alternate?.memoizedState] };
  });
  const rendered = () =>
    page.evaluate(() => {
      const { fiber, seen } = (window as unknown as { __TC__: { fiber: { memoizedState: unknown; alternate: { memoizedState: unknown } | null }; seen: unknown[] } }).__TC__;
      return [fiber.memoizedState, fiber.alternate?.memoizedState].some((s) => s !== undefined && !seen.includes(s));
    });
  expect(await page.evaluate(() => !!(window as unknown as { __TC__?: { fiber: unknown } }).__TC__?.fiber), "found ToolCoach's fiber").toBe(true);
  const s = await samplePerf(page, WINDOW_MS);
  expect(s.commits, "the click is playing: the shell commits as the engine reports").toBeGreaterThan(0);
  expect(await rendered(), `ToolCoach rendered during ${s.commits} commits of the shell`).toBe(false);
  expect(rendersOf(s, "ToolCoach"), `ToolCoach counted in ${s.commits} commits`).toBe(0);
  // And the check can fail: turning Listen off is a change ToolCoach renders for.
  await page.locator('[data-testid="transport-listen"]').click();
  await expect(page.locator('[data-testid="transport-listen"]')).toHaveAttribute("aria-checked", "false");
  await expect.poll(rendered, { message: "ToolCoach renders when Listen goes off" }).toBe(true);
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
