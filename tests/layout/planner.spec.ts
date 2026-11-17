import { test, expect } from "@playwright/test";
import { openShot, noSidewaysScroll, insideViewport, IN_ENGLISH, notHitTestable, overlapping } from "./fits";

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

/*
 * QA 2026-11-17 #1: the neck's slot sat over the Step page's first Exercise
 * card and took the taps meant for "Play this" and "Find my edge". Each of
 * the page's buttons is measured where a pointer lands on it, and nothing on
 * the page is drawn over anything else.
 */
for (const size of [...SIZES, { name: "1024", width: 1024, height: 700 }]) {
  for (const scene of ["step-detail", "step-test-out"]) {
    test(`${scene}: every Exercise's buttons take a tap, and nothing overlaps, at ${size.name}`, async ({ page }) => {
      await openShot(page, scene, size);
      await expect(page.locator('[data-testid^="play-"]').first()).toBeVisible();
      expect(await notHitTestable(page, '[data-testid="step-detail"] button')).toEqual([]);
      expect(await overlapping(page)).toEqual([]);
    });
  }
}

// QA #6: at 1024x700 the minutes picker started below the fold.
test("today: the minutes picker is in the window at 1024x700", async ({ page }) => {
  const size = { width: 1024, height: 700 };
  await openShot(page, "today-returning", size);
  await insideViewport(page, '[data-testid="today-start"]', "today-returning at 1024", size);
  await insideViewport(page, ".session-seg", "today-returning at 1024", size);
  expect(await overlapping(page)).toEqual([]);
});

// QA #7: subscribed to nothing, Today's one big action leads to the Paths.
for (const size of SIZES) {
  test(`today-no-paths offers the Paths, and they open, at ${size.name}`, async ({ page }) => {
    await openShot(page, "today-no-paths", size);
    await noSidewaysScroll(page, `today-no-paths at ${size.width}px`);
    const choose = page.locator('[data-testid="today-choose-path"]');
    await expect(choose).toBeVisible();
    await insideViewport(page, '[data-testid="today-choose-path"]', `today-no-paths at ${size.width}px`, size);
    await expect(page.locator('[data-testid="today-start"]')).toHaveCount(0);
    await choose.click();
    await expect(page.locator('[data-testid="paths"]')).toBeVisible();
  });
}

// QA #8: the rail's Paths, pressed on a Step's page, is the Paths list again.
test("the rail's Paths on a Step page returns to the list", async ({ page }) => {
  await openShot(page, "step-detail", { width: 1400, height: 900 });
  await expect(page.locator('[data-testid="step-detail"]')).toBeVisible();
  await page.locator(".rail-learn .rail-mode[aria-current=page]").click();
  await expect(page.locator('[data-testid="paths"]')).toBeVisible();
  await expect(page.locator('[data-testid="step-detail"]')).toHaveCount(0);
});
