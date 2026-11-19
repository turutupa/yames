/*
 * A short desktop window (acceptance 5, P1-6): at 1024x700 with the input
 * failed, Start was cut by the bottom of the window (y 678 to 732 in 700).
 * Nothing of a ready screen's footer may be below the fold, in any state the
 * ready screen has, in each view, in a narrow face (Aurora) and a wide one
 * (Ember).
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openShot, settleAnimations } from "./fits";

const SIZES = [
  { width: 1024, height: 700 },
  { width: 1280, height: 720 },
];
// The last two are Exercises played over the band, opened from their Step
// page (card #93): the band's slider and its mic hint pushed Start to 714 in 700.
const SCENES = [
  "session-ready",
  "session-input-failed",
  "session-input-off",
  "session-ungraded-ready",
  "session-ask-ready",
  "session-neck-triads",
  "session-variant-bb",
];

/** Every visible thing in the footer, and Start, that ends below the window. */
async function belowFold(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const h = window.innerHeight;
    const scroller = document.scrollingElement;
    if (scroller && scroller.scrollTop > 0) out.push(`the page is scrolled ${scroller.scrollTop}px`);
    const els = document.querySelectorAll<HTMLElement>(
      '[data-testid="session-take"] .session-actions *, [data-testid="session-big"]',
    );
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
      if (r.bottom > h + 0.5) {
        const name = (el.getAttribute("data-testid") || el.className || el.tagName).toString().slice(0, 40);
        out.push(`${name} "${(el.textContent || "").trim().slice(0, 30)}" ends at ${Math.round(r.bottom)} in ${h}`);
      }
    }
    return [...new Set(out)].slice(0, 8);
  });
}

for (const theme of ["aurora", "ember"]) {
  for (const size of SIZES) {
    for (const scene of SCENES) {
      for (const view of ["neck", "runway", "tab"]) {
        test(`${scene} (${view}) in ${theme} at ${size.width}x${size.height}: the footer is in the window`, async ({ page }) => {
          await openShot(page, scene, size, theme);
          if (view !== "neck") {
            await page.locator(`[data-testid="practice-view-${view}"]`).click();
            await page.waitForTimeout(600);
          }
          await settleAnimations(page);
          expect(await belowFold(page)).toEqual([]);
        });
      }
    }
    test(`the Watch demo in ${theme} at ${size.width}x${size.height}: the footer is in the window`, async ({ page }) => {
      await openShot(page, "session-ready", size, theme);
      await page.locator('[data-testid="practice-watch"]').click();
      await expect(page.locator('[data-testid="session-listen-note"]')).toBeVisible({ timeout: 5000 });
      await settleAnimations(page);
      expect(await belowFold(page)).toEqual([]);
    });
  }
}
