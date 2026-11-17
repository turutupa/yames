import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll, insideViewport } from "./fits";

/**
 * The practice runway (plans/tasks/mvp/RUNWAY.md), measured.
 *
 * The lane is DOM moved by one transform per frame from the engine's song
 * position, so the questions here are about motion and place: it moves while a
 * Take runs and stops when it ends; a note the analyzer has ruled on has
 * already reached the hit line; the switch flips the screen, is locked during a
 * Take, and the Take remembers which view it was played in.
 *
 * One picture at a time (the owner, 2026-11-16): before a runway Take the
 * neck shows where the hand goes; while it runs the runway is alone; theory
 * keeps the neck and has no runway; the neck view hides the tab while playing.
 */
test.use({
  launchOptions: {
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

const WIDE = { width: 1400, height: 900 };
const NARROW = { width: 620, height: 780 };
const PHONE = { width: 390, height: 844 };

const SCENES: Array<[string, Array<{ width: number; height: number }>]> = [
  ["session-runway-ready", [WIDE, NARROW]],
  ["session-runway-playing", [WIDE, NARROW]],
  ["session-runway-theory", [WIDE, NARROW]],
  ["session-theory-playing", [WIDE]],
  ["session-runway-phone", [PHONE]],
];

/** The strip's x offset, from its transform. */
const stripX = (page: Page) =>
  page.locator('[data-testid="runway-strip"]').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);

for (const [scene, sizes] of SCENES) {
  for (const size of sizes) {
    test(`${scene} fits at ${size.width}x${size.height}`, async ({ page }) => {
      await openShot(page, scene, size);
      await noSidewaysScroll(page, `${scene} at ${size.width}px`);
      await expect(page.locator('[data-testid="session-big"]')).toBeVisible();
      await insideViewport(page, '[data-testid="session-big"]', `${scene} at ${size.width}px`, size);
      const runwayShown = scene === "session-runway-playing" || scene === "session-runway-phone";
      const neckShown = scene === "session-runway-ready" || scene === "session-runway-theory";
      if (runwayShown) {
        const lane = await page.locator('[data-testid="runway"]').boundingBox();
        expect(lane, "the runway is on the screen").not.toBeNull();
        expect(lane!.x).toBeGreaterThanOrEqual(-1);
        expect(lane!.x + lane!.width).toBeLessThanOrEqual(size.width + 1);
        expect(lane!.height).toBeGreaterThan(100);
        await expect(page.locator("[data-runway-neck]"), "one picture: no neck over a running runway").toHaveCount(0);
      }
      if (neckShown) {
        const neck = await page.locator("[data-runway-neck]").boundingBox();
        expect(neck, "the neck is on the screen").not.toBeNull();
        expect(neck!.height).toBeGreaterThan(150);
        await expect(page.locator('[data-testid="runway"]'), "one picture: no runway beside the neck").toHaveCount(0);
      }
      if (scene === "session-theory-playing") {
        await expect(page.locator('[data-testid="runway"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="exercise-stage"]'), "no tab while the neck view plays").toHaveCount(0);
      }
    });
  }
}

test("the runway's neck is the straight-on zoom", async ({ page }) => {
  await openShot(page, "session-runway-ready", WIDE);
  const view = await page.evaluate(() => window.__NECK__?.current?.getSnapshot().view);
  expect(view).toMatchObject({ kind: "zoom", flat: true });
});

test("the lane moves while a Take runs, and stops when it ends", async ({ page }) => {
  await openShot(page, "session-runway-playing", WIDE);
  // Under SwiftShader the neck's first frames can hold the main thread for a
  // moment; measure once the lane's own frames are flowing.
  const start = await page.evaluate(() => window.__RUNWAY_FRAMES__ ?? 0);
  await page.waitForFunction((f) => (window.__RUNWAY_FRAMES__ ?? 0) > f + 10, start, { timeout: 15_000 });
  const x0 = await stripX(page);
  await page.waitForTimeout(500);
  const x1 = await stripX(page);
  expect(x1, "the strip travels right to left").toBeLessThan(x0 - 10);
  // At 80 BPM a bar is three seconds and the lane is three bars wide: half a
  // second is about a sixth of the lane (a stalled frame may add a little).
  const lane = (await page.locator(".runway-lanes").boundingBox())!;
  expect(x0 - x1).toBeLessThan(lane.width / 2);

  // A note the analyzer has ruled on has reached the line (within a beat).
  const late = await page.evaluate(() => {
    const hit = document.querySelector(".runway-hit")!.getBoundingClientRect().left;
    const beat = document.querySelector(".runway-lanes")!.getBoundingClientRect().width / 12;
    return [...document.querySelectorAll<HTMLElement>(".runway-note[data-state]")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.left + r.width / 2 > hit + beat).length;
  });
  expect(late, "judged notes still ahead of the hit line").toBe(0);
  expect(await page.locator(".runway-note[data-state]").count()).toBeGreaterThan(0);

  await page.locator('[data-testid="session-big"]').click();
  await expect(page.locator('[data-testid="session-take"]')).toHaveCount(0, { timeout: 15_000 });
  const f0 = await page.evaluate(() => window.__RUNWAY_FRAMES__ ?? 0);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__RUNWAY_FRAMES__ ?? 0), "frames after the Take").toBe(f0);
});

test("the Take remembers the view it was played in", async ({ page }) => {
  await openShot(page, "session-runway-playing", WIDE);
  const before = await page.evaluate(
    () => (window as unknown as { __SHOT_PATHS__: { takes: unknown[] } }).__SHOT_PATHS__.takes.length,
  );
  await page.locator('[data-testid="session-big"]').click();
  await page.waitForFunction(
    (n) => (window as unknown as { __SHOT_PATHS__: { takes: unknown[] } }).__SHOT_PATHS__.takes.length > n,
    before,
    { timeout: 20_000 },
  );
  const facts = await page.evaluate(
    () => (window as unknown as { __SHOT_PATHS__: { takes: Array<{ facts: { view?: string } }> } }).__SHOT_PATHS__.takes[0].facts,
  );
  expect(facts.view).toBe("runway");
});

test("the switch flips the Take screen, and is locked while a Take runs", async ({ page }) => {
  await openShot(page, "session-ready", WIDE);
  await expect(page.locator('[data-testid="practice-view-neck"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[data-testid="exercise-stage"]')).toBeVisible();
  await page.locator('[data-testid="practice-view-runway"]').click();
  // Before the Take the runway view shows the neck alone; the lane comes with the Take.
  await expect(page.locator("[data-runway-neck]")).toBeVisible();
  await expect(page.locator('[data-testid="exercise-stage"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="runway"]')).toHaveCount(0);
  await page.locator('[data-testid="practice-view-neck"]').click();
  await expect(page.locator('[data-testid="exercise-stage"]')).toBeVisible();

  await openShot(page, "session-runway-playing", WIDE);
  await expect(page.locator('[data-testid="practice-view-neck"]')).toBeDisabled();
  await expect(page.locator('[data-testid="practice-view-runway"]')).toBeDisabled();
});

test("the neck view hides the tab while a Take runs", async ({ page }) => {
  await openShot(page, "session-playing", WIDE);
  await expect(page.locator('[data-testid="exercise-stage"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="runway"]')).toHaveCount(0);
});
