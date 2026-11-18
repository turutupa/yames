import { test, expect } from "@playwright/test";
import { openShot } from "./fits";
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
  "session-recap",
];
const SIZE = { width: 1400, height: 900 };

for (const theme of ["ivory", "ember"]) {
  for (const shot of SCENES) {
    test(`${shot} in ${theme}: Session text clears AA`, async ({ page }) => {
      await openShot(page, shot, SIZE, theme);
      await page.waitForTimeout(600);
      const hits = await textContrast(page, ".session-page");
      expect(hits.length, "no text was measured").toBeGreaterThan(5);
      expect(belowAA(hits), JSON.stringify(belowAA(hits), null, 1)).toEqual([]);
    });
  }
  test(`paused warm-up in ${theme}: Session text clears AA`, async ({ page }) => {
    await openShot(page, "session-warmup", SIZE, theme);
    await page.getByTestId("session-pause").click();
    await expect(page.getByTestId("session-resume")).toBeVisible();
    await page.waitForTimeout(600);
    const hits = await textContrast(page, ".session-page");
    expect(belowAA(hits), JSON.stringify(belowAA(hits), null, 1)).toEqual([]);
  });
}
