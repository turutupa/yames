import { test, expect } from "@playwright/test";
import { openShot, noSidewaysScroll, insideViewport } from "./fits";

/**
 * The first run, measured (MVP, 2026-11-16).
 *
 * Each scene is reached by pressing what a new player presses (`shots/main.tsx`):
 * Set me up, an instrument, Next, then the input step with the mocked
 * interface heard, or silent, or with no device at all. A scene that reaches
 * `__SHOT_READY__` has proved those steps still lead to it. On top of that the
 * wizard's card must fit the window, and the control a player needs next must
 * be inside it, at the widest and narrowest sizes the app is held to.
 */
const SCENES: Record<string, string> = {
  "firstrun-welcome": ".onboarding-welcome-actions .onboarding-btn-primary",
  "firstrun-input": ".onboarding-footer .onboarding-btn-primary",
  "firstrun-input-silent": '[data-testid="audio-input-skip"]',
  "firstrun-input-none": '[data-testid="audio-input-skip"]',
  "firstrun-ready": ".onboarding-ready-actions .onboarding-btn-primary",
};

const SIZES = [
  { name: "wide", width: 1400, height: 900 },
  { name: "narrow", width: 620, height: 780 },
];

for (const [scene, next] of Object.entries(SCENES)) {
  for (const size of SIZES) {
    test(`${scene} fits at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, scene, size);
      await noSidewaysScroll(page, `${scene} at ${size.width}px`);
      await insideViewport(page, ".onboarding-card", `${scene} at ${size.width}px`, size);
      // The thing to press next may sit below the fold of the card's own
      // scroller; it must be reachable, and then inside the window.
      await page.locator(next).scrollIntoViewIfNeeded();
      await expect(page.locator(next)).toBeVisible();
      await insideViewport(page, next, `${scene} at ${size.width}px`, size);
    });
  }
}

test("the input step says the guitar is heard, with Next open", async ({ page }) => {
  await openShot(page, "firstrun-input", { width: 1400, height: 900 });
  await expect(page.locator(".onboarding-input-gate.proven")).toBeVisible();
  await expect(page.locator(".onboarding-footer .onboarding-btn-primary")).toBeEnabled();
});
