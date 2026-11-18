import { test, expect } from "@playwright/test";
import { openShot, noSidewaysScroll, insideViewport, notHitTestable, overlapping, spillingLabels } from "./fits";

/**
 * The learning side, measured: Today, a Session, Paths and Progress.
 *
 * Every scene here is reached by pressing what a player presses (`shots/main.tsx`
 * walks Today, the big button, the verdict and on to the recap), so a scene that
 * reaches `__SHOT_READY__` at all has proved the screens before it still lead to
 * it. On top of that, each must fit: no sideways scroll, and the one big action
 * a player looks for inside the window, at the widest and the narrowest sizes the
 * rest of the app is held to.
 */
const SCENES = [
  "today-first",
  // Guitar first: a drummer's Today carries the note at the top of the hero.
  "today-drums",
  "today-returning",
  "today-back",
  "session-ready",
  "session-playing",
  "session-between",
  "session-result",
  "session-no-catch",
  "session-warmup-ready",
  "session-warmup",
  "session-edge",
  "session-edge-result",
  "session-recap",
  "paths",
  "path-alternate",
  "step-detail",
  "progress",
  "progress-empty",
  "tools",
];

const SIZES = [
  { name: "wide", width: 1400, height: 900 },
  { name: "narrow", width: 620, height: 780 },
];

/** The scenes with one big next action, and the control that is it. */
const BIG: Record<string, string> = {
  "today-first": '[data-testid="today-start"]',
  "today-drums": '[data-testid="today-start"]',
  "today-returning": '[data-testid="today-start"]',
  "today-back": '[data-testid="today-start"]',
  "session-ready": '[data-testid="session-big"]',
  "session-warmup-ready": '[data-testid="session-big"]',
  // Running, the big button is Pause (UX audit SES-1); Next is a link.
  "session-warmup": '[data-testid="session-pause"]',
  "session-result": '[data-testid="session-big"]',
  "session-no-catch": '[data-testid="session-big"]',
  "session-edge-result": '[data-testid="session-big"]',
  "session-recap": '[data-testid="session-big"]',
};

for (const scene of SCENES) {
  for (const size of SIZES) {
    test(`${scene} fits at ${size.name} (${size.width}px)`, async ({ page }) => {
      // Find my edge plays up to four Takes in real time with the neck stage
      // drawing them; under SwiftShader and a parallel suite that passes 30 s.
      if (scene === "session-edge-result") test.slow();
      await openShot(page, scene, size);
      await noSidewaysScroll(page, `${scene} at ${size.width}px`);
      const big = BIG[scene];
      if (big) {
        await expect(page.locator(big)).toBeVisible();
        await insideViewport(page, big, `${scene} at ${size.width}px`, size);
      }
    });
  }
}

/*
 * The QA sweep of 2026-11-17, measured. A short window (1024x700) and the
 * narrowest desktop one (620x780): the sizes where the learning side's blocks
 * were drawn over each other.
 */
const QA_SIZES = [
  { name: "1024x700", width: 1024, height: 700 },
  { name: "620x780", width: 620, height: 780 },
];

for (const size of QA_SIZES) {
  // #2: the "TAKE n · …" heading was drawn over Exit.
  for (const scene of ["session-between", "session-edge-result"]) {
    test(`${scene}: Exit takes a tap, and nothing overlaps, at ${size.name}`, async ({ page }) => {
      // Both play a Take (edge-result up to four) in real time first.
      test.slow();
      await openShot(page, scene, size);
      expect(await notHitTestable(page, '[data-testid="session-exit"]')).toEqual([]);
      expect(await overlapping(page)).toEqual([]);
    });
  }

  // #5: the exercise cards covered the neck, the heading and the chart.
  for (const scene of ["progress", "progress-empty"]) {
    test(`${scene}: nothing overlaps at ${size.name}`, async ({ page }) => {
      await openShot(page, scene, size);
      await noSidewaysScroll(page, `${scene} at ${size.name}`);
      expect(await overlapping(page)).toEqual([]);
    });
  }

  // #20: the switch is locked while the Take runs, and says so.
  test(`session-playing: the view switch is locked and looks it at ${size.name}`, async ({ page }) => {
    await openShot(page, "session-playing", size);
    const sw = page.locator('[data-testid="practice-view"]');
    await expect(sw).toHaveAttribute("data-locked", "");
    await expect(sw.locator(".session-viewswitch-lock")).toBeVisible();
    expect(await overlapping(page)).toEqual([]);
  });
}

// #25: under 900 px the learning side's rail is a strip of icons.
test("the learning side's rail is the icon strip at 620px", async ({ page }) => {
  await openShot(page, "progress", { width: 620, height: 780 });
  const rail = (await page.locator(".rail").boundingBox())!;
  expect(Math.round(rail.width), "the rail keeps its labels at 620px").toBeLessThanOrEqual(72);
  await expect(page.locator(".rail-mode-label").first()).toBeHidden();
});

// #19: the runway's ready screen is the neck, and says the runway comes with the Take.
test("session-runway-ready: the neck alone, and a line for the runway", async ({ page }) => {
  await openShot(page, "session-runway-ready", { width: 1024, height: 700 });
  await expect(page.locator('[data-testid="runway"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="runway-later"]')).toBeVisible();
  expect(await overlapping(page)).toEqual([]);
});

/*
 * #11: long translations fit. The big button wraps rather than cutting
 * "Закончить дубль" short, a tag stays inside its card, and the rail's labels
 * take two lines rather than an ellipsis. Built in each language through the
 * harness's own `?lng=`; the scenes are the ones it reaches without the
 * rail (src/shots/main.tsx finds the rail's doors by their English names).
 */
const LONG_LOCALES = ["ru", "de", "pt-BR", "ja"];
const LOCALE_SCENES: { scene: string; size: { width: number; height: number } }[] = [
  { scene: "today-returning", size: { width: 1024, height: 700 } },
  { scene: "today-returning", size: { width: 620, height: 780 } },
  { scene: "session-playing", size: { width: 620, height: 780 } },
  { scene: "session-between", size: { width: 1024, height: 700 } },
];
for (const lng of LONG_LOCALES) {
  for (const { scene, size } of LOCALE_SCENES) {
    test(`${scene} in ${lng}: every label fits, nothing overlaps, at ${size.width}x${size.height}`, async ({ page }) => {
      // A result scene plays its Take in real time first.
      if (scene !== "today-returning") test.slow();
      await openShot(page, scene, size, "ember", { lng });
      await noSidewaysScroll(page, `${scene} in ${lng} at ${size.width}px`);
      expect(await spillingLabels(page)).toEqual([]);
      expect(await overlapping(page)).toEqual([]);
    });
  }
}

test("a drummer's Today says the Paths are for guitar, and still starts", async ({ page }) => {
  await openShot(page, "today-drums", { width: 1400, height: 900 });
  const note = page.locator('[data-testid="instrument-note"]');
  await expect(note).toBeVisible();
  const [n, start] = [await note.boundingBox(), await page.locator('[data-testid="today-start"]').boundingBox()];
  expect(n!.y, "the note sits above the Start button").toBeLessThan(start!.y);
  await expect(page.locator('[data-testid="today-start"]')).toBeEnabled();
});

/*
 * Acceptance pass 3 P2-7: "Was this grade fair?" only where the verdict could
 * have gone the other way. Not on a clear pass (87% against 85, every bar
 * held), not on a Take in the middle of a Find my edge climb, and once, about
 * the climb, when the edge is found.
 */
test.describe("the fairness question", () => {
  test("is not asked on a clear pass", async ({ page }) => {
    await openShot(page, "session-result", { width: 1400, height: 900 });
    await expect(page.locator('[data-testid="session-result"]')).toBeVisible();
    await expect(page.locator('[data-testid="session-fair"]')).toHaveCount(0);
  });

  test("is not asked on a Take of a Find my edge climb", async ({ page }) => {
    test.slow();
    await openShot(page, "session-edge", { width: 1400, height: 900 });
    await expect(page.locator('[data-testid="session-edge"]')).toBeVisible();
    await expect(page.locator('[data-testid="session-fair"]')).toHaveCount(0);
  });

  test("is asked once, about the climb, when the edge is found", async ({ page }) => {
    test.slow();
    await openShot(page, "session-edge-result", { width: 1400, height: 900 });
    await expect(page.locator('[data-testid="session-edge"][data-done]')).toBeVisible();
    await expect(page.locator('[data-testid="session-fair"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="session-fair"]')).toContainText("climb");
  });
});
