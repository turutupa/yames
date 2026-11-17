import { test, expect } from "@playwright/test";
import { openShot, noSidewaysScroll, insideViewport, IN_ENGLISH } from "./fits";

/**
 * Play now across every subscribed Path (plans/tasks/mvp/CONTENT.md): Today on
 * three Paths with the "Resting today" footer, a Step's page with Test out, and
 * a result with "Was this grade fair?" answered. Each reached by pressing what
 * a player presses (`shots/main.tsx`), and each must fit.
 */
const SIZES = [
  { name: "wide", width: 1400, height: 900 },
  { name: "narrow", width: 620, height: 780 },
];

for (const size of SIZES) {
  test(`today-three-paths fits, with whose turn it is and who rests, at ${size.name}`, async ({ page }) => {
    await openShot(page, "today-three-paths", size);
    await noSidewaysScroll(page, `today-three-paths at ${size.width}px`);
    await expect(page.locator('[data-testid="today-start"]')).toBeVisible();
    await insideViewport(page, '[data-testid="today-start"]', `today-three-paths at ${size.width}px`, size);
    // Ten minutes on three Paths: the lead and one other, the third resting.
    await expect(page.locator(".session-plan-item")).toHaveCount(3);
    await expect(page.locator(".session-context").first()).toBeVisible();
    const footer = page.locator('[data-testid="today-skipped"]');
    await expect(footer).toBeVisible();
    await expect(footer.locator(".session-why")).toHaveCount(1);
    if (IN_ENGLISH) await expect(footer).toContainText("rests today");
  });

  test(`step-test-out fits, and offers Test out, at ${size.name}`, async ({ page }) => {
    await openShot(page, "step-test-out", size);
    await noSidewaysScroll(page, `step-test-out at ${size.width}px`);
    const button = page.locator('[data-testid="step-test-out"]');
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    await insideViewport(page, '[data-testid="step-test-out"]', `step-test-out at ${size.width}px`, size);
  });

  test(`session-result-fair fits, with the answer kept, at ${size.name}`, async ({ page }) => {
    await openShot(page, "session-result-fair", size);
    await noSidewaysScroll(page, `session-result-fair at ${size.width}px`);
    await expect(page.locator('[data-testid="session-big"]')).toBeVisible();
    await insideViewport(page, '[data-testid="session-big"]', `session-result-fair at ${size.width}px`, size);
    const fair = page.locator('[data-testid="session-fair"]');
    await fair.scrollIntoViewIfNeeded();
    await expect(fair).toBeVisible();
    await expect(page.locator('[data-testid="session-fair-yes"]')).toHaveAttribute("aria-pressed", "true");
  });
}
