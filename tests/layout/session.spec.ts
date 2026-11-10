import { test, expect } from "@playwright/test";
import { openShot, noSidewaysScroll, insideViewport } from "./fits";

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
  "today-returning",
  "today-back",
  "session-ready",
  "session-playing",
  "session-between",
  "session-result",
  "session-no-catch",
  "session-warmup",
  "session-edge",
  "session-edge-result",
  "session-recap",
  "paths",
  "path-alternate",
  "step-detail",
  "progress",
  "progress-empty",
];

const SIZES = [
  { name: "wide", width: 1400, height: 900 },
  { name: "narrow", width: 620, height: 780 },
];

/** The scenes with one big next action, and the control that is it. */
const BIG: Record<string, string> = {
  "today-first": '[data-testid="today-start"]',
  "today-returning": '[data-testid="today-start"]',
  "today-back": '[data-testid="today-start"]',
  "session-ready": '[data-testid="session-big"]',
  "session-result": '[data-testid="session-big"]',
  "session-no-catch": '[data-testid="session-big"]',
  "session-edge-result": '[data-testid="session-big"]',
  "session-recap": '[data-testid="session-big"]',
};

for (const scene of SCENES) {
  for (const size of SIZES) {
    test(`${scene} fits at ${size.name} (${size.width}px)`, async ({ page }) => {
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
