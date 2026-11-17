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

/*
 * The plan as a list (panel review, 2026-11-17), in short and wide windows.
 * The owner's 2000x780 screenshot had the neck cut off under the title bar:
 * Today was taller than the window, so the page scrolled. On a desktop window
 * Today is now the window's height: the neck's slot and the hero give up
 * room first, and a plan longer than what is left scrolls inside its panel
 * with "More below" over its foot. Five minutes and twenty, so one row and
 * five or six.
 */
const SHORT_SIZES = [
  { width: 1280, height: 560 },
  { width: 2000, height: 780 },
  { width: 1024, height: 700 },
  { width: 1400, height: 900 },
];
for (const size of SHORT_SIZES) {
  for (const minutes of [5, 20]) {
    for (const scene of ["today-first", "today-returning"]) {
      test(`${scene}, ${minutes} min: no page scroll, Start and the picker in view, at ${size.width}x${size.height}`, async ({ page }) => {
        await openShot(page, scene, size);
        await page.locator(".session-seg button", { hasText: new RegExp(`^${minutes}$`) }).first().click();
        await expect(page.locator("li.session-plan-item").first()).toBeVisible();
        await noSidewaysScroll(page, `${scene} at ${size.width}`);
        const where = `${scene} ${minutes} min at ${size.width}x${size.height}`;
        const pageScroll = await page.evaluate(() => {
          const m = document.querySelector(".main-content")!;
          return m.scrollHeight - m.clientHeight;
        });
        expect(pageScroll, `${where}: the page scrolls, and the neck goes up under the title bar`).toBeLessThanOrEqual(1);
        await insideViewport(page, '[data-testid="today-start"]', where, size);
        await insideViewport(page, ".session-seg", where, size);
        await insideViewport(page, ".session-slot", where, size);
        expect(await page.locator('ol.session-plan-list[role="list"]').count()).toBe(1);
        expect(await overlapping(page)).toEqual([]);

        // A list longer than its panel says so, and stops saying so at its end.
        const list = page.locator("ol.session-plan-list");
        const scrolls = await list.evaluate((el) => el.scrollHeight - el.clientHeight > 1);
        const more = page.locator('[data-testid="today-more"]');
        if (scrolls) {
          await expect(more, `${where}: the list scrolls with no cue`).toBeVisible();
          await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
          await expect(more).toHaveCount(0);
        } else {
          await expect(more).toHaveCount(0);
        }
      });
    }
  }
}
