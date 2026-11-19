import { test, expect } from "@playwright/test";
import { openShot } from "./fits";
import type { Page } from "@playwright/test";
import { textContrast, belowAA } from "./contrast";

/**
 * The learning side follows the theme, light themes included (owner,
 * 2026-11-17). Before it did, the Session's cream ink sat on Ivory's cream
 * page. Every line of text on a learning screen must clear WCAG AA against
 * what is actually painted behind it (`contrast.ts` reads it off a
 * screenshot): Ivory, the light theme that broke, and Ember, the dark one the
 * learning side was drawn in.
 */
const SCENES = [
  "path-alternate",
  "today-returning",
  "paths",
  "step-detail",
  "progress",
  "session-ready",
  "session-playing",
  "session-runway-playing",
  "session-playing-tab",
  "session-warmup",
  "session-result",
  "session-between",
  "session-recap",
  "session-input-failed",
  "session-ungraded-ready",
  "session-ungraded-result",
  "session-ask-ready",
  "progress-ungraded",
];
const SIZE = { width: 1400, height: 900 };

/**
 * The lines below AA in two looks a moment apart. A running Take moves its
 * words with the notes, and under load the picture and the layout can be a
 * frame apart; a real failure is there both times, a race is not.
 */
async function belowAATwice(page: Page) {
  // The pages rise in: measure once every finite animation has landed.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const first = await textContrast(page, ".session-page");
  const bad = belowAA(first);
  if (!bad.length) return { hits: first, bad };
  await page.waitForTimeout(400);
  const again = belowAA(await textContrast(page, ".session-page"));
  const key = (h: { text: string; where: string }) => `${h.where}|${h.text}`;
  const still = new Set(again.map(key));
  return { hits: first, bad: bad.filter((h) => still.has(key(h))) };
}

for (const theme of ["ivory", "ember"]) {
  for (const shot of SCENES) {
    test(`${shot} in ${theme}: Session text clears AA`, async ({ page }) => {
      await openShot(page, shot, SIZE, theme);
      await page.waitForTimeout(600);
      const { hits, bad } = await belowAATwice(page);
      expect(hits.length, "no text was measured").toBeGreaterThan(5);
      expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
    });
  }
  test(`paused warm-up in ${theme}: Session text clears AA`, async ({ page }) => {
    await openShot(page, "session-warmup", SIZE, theme);
    await page.getByTestId("session-pause").click();
    await expect(page.getByTestId("session-resume")).toBeVisible();
    await page.waitForTimeout(600);
    const { bad } = await belowAATwice(page);
    expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
  });
}

/**
 * The tour's card over the Session, every stop, in all thirteen themes
 * (acceptance 5, P1-4): its Next and Done sat at about 2:1 in six of them,
 * dark ink on a dark accent, where the Session's own Start button was fine.
 */
const ALL_THEMES = "mono obsidian velvet neon aurora ash ember ivory arctic sand lavender prism manuscript".split(" ");
for (const theme of ALL_THEMES) {
  test(`the tour card in ${theme}: every stop clears AA`, async ({ page }) => {
    test.setTimeout(60_000);
    await openShot(page, "tour-learn", SIZE, theme);
    const bad: unknown[] = [];
    let stops = 0;
    for (;;) {
      await page.waitForTimeout(500);
      const card = page.locator(".tour-card");
      if ((await card.count()) === 0) break;
      stops += 1;
      bad.push(...belowAA(await textContrast(page, ".tour-card")).map((h) => ({ stop: stops, ...h })));
      const next = page.locator(".tour-btn-primary");
      if ((await next.count()) === 0 || stops > 12) break;
      await next.click();
    }
    expect(stops, "the tour showed no stops").toBeGreaterThan(3);
    expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
  });
}
