import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { openShot, insideViewport, noSidewaysScroll, settleAnimations, notHitTestable, MOBILE_URL } from "./fits";
import { textContrast, belowAA } from "./contrast";

/**
 * Swap on Today's rows (owner, 2026-11-18). Measured, because happy-dom has no
 * geometry: each row's Swap button sits inside its row and is a real touch
 * target, and the menu and its preview open inside the window, at the
 * desktop size and on a 390 px phone, in a dark and a light theme.
 *
 * `YAMES_SWAP_SHOTS=<dir>` also writes the pictures the review looks at.
 */
const SHOTS = process.env.YAMES_SWAP_SHOTS;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await settleAnimations(page);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function buttonsInsideRows(page: Page) {
  const rows = await page.$$eval(".session-plan-row[data-swap]", (lis) =>
    lis.map((li) => {
      const r = li.getBoundingClientRect();
      const b = li.querySelector(".session-swap-btn")!.getBoundingClientRect();
      return {
        inside: b.left >= r.left - 0.5 && b.right <= r.right + 0.5 && b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5,
        w: b.width,
        h: b.height,
      };
    }),
  );
  expect(rows.length, "no row has a Swap button").toBeGreaterThan(1);
  for (const row of rows) {
    expect(row.inside, JSON.stringify(row)).toBe(true);
    expect(row.w).toBeGreaterThanOrEqual(44);
    expect(row.h).toBeGreaterThanOrEqual(44);
  }
}

async function menuContrast(page: Page) {
  await page.waitForTimeout(300);
  const hits = await textContrast(page, ".session-swap-menu");
  expect(hits.length, "no menu text was measured").toBeGreaterThan(2);
  const bad = belowAA(hits);
  expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
}

const DESKTOP = { width: 1400, height: 900 };

for (const theme of ["ember", "ivory"]) {
  test(`Today's Swap at 1400x900 in ${theme}: buttons in their rows, menu and preview in the window`, async ({ page }) => {
    test.slow();
    await openShot(page, "today-returning", DESKTOP, theme);
    await settleAnimations(page);
    await buttonsInsideRows(page);
    await shot(page, `today-${theme}`);

    // The row's own hover is not the button's.
    await page.locator('[data-testid="today-swap-1"]').hover();
    await shot(page, `hover-${theme}`);

    await page.locator('[data-testid="today-swap-1"]').click();
    await expect(page.getByTestId("swap-menu")).toBeVisible();
    // Swap opened a menu and started nothing.
    await expect(page.getByTestId("today")).toBeVisible();
    await insideViewport(page, '[data-testid="swap-menu"]', `swap menu in ${theme}`, DESKTOP);
    expect(await notHitTestable(page, ".session-swap-choice:not(:disabled)")).toEqual([]);
    await menuContrast(page);
    await shot(page, `menu-${theme}`);

    const choice = (await page.getByTestId("swap-harder").isEnabled()) ? "swap-harder" : "swap-different";
    await page.getByTestId(choice).click();
    await expect(page.getByTestId("swap-preview")).toBeVisible();
    await insideViewport(page, '[data-testid="swap-menu"]', `swap preview in ${theme}`, DESKTOP);
    await menuContrast(page);
    await shot(page, `preview-${theme}`);

    const title = (await page.getByTestId("swap-preview-title").textContent())!.trim();
    const total = await page.locator(".session-plan-total").textContent();
    const mins = await page.locator(".session-plan-row").nth(1).locator(".session-plan-mins").textContent();
    await page.getByTestId("swap-confirm").click();
    await expect(page.getByTestId("swap-menu")).toHaveCount(0);
    const row = page.locator(".session-plan-row").nth(1);
    await expect(row.locator(".session-plan-title")).toHaveText(title);
    await expect(row.locator(".session-plan-mins")).toHaveText(mins!);
    await expect(page.locator(".session-plan-total")).toHaveText(total!);
    await expect(page.getByTestId("today-swapped-1")).toBeVisible();
    await page.mouse.move(5, 5);
    await shot(page, `swapped-${theme}`);
  });
}

for (const [where, size] of [
  ["a narrow window", { width: 620, height: 780 }],
  ["a 1024x700 window", { width: 1024, height: 700 }],
] as const) {
  test(`Today's Swap in ${where}: buttons in their rows, titles not squeezed, menu in the window`, async ({ page }) => {
    test.slow();
    await openShot(page, "today-returning", size);
    await settleAnimations(page);
    await buttonsInsideRows(page);
    await noSidewaysScroll(page, `Today with Swap in ${where}`);
    const titles = await page.locator(".session-plan-title").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const w of titles) expect(w).toBeGreaterThanOrEqual(150);
    const button = page.locator('[data-testid="today-swap-1"]');
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await insideViewport(page, '[data-testid="swap-menu"]', `swap menu in ${where}`, size);
  });
}

// Acceptance 4, P2-1: in a real browser the menu opens hidden while it is
// placed, and a hidden button refuses focus, so the keyboard stayed on Swap.
test("Today's Swap by keyboard: focus goes in, arrows move, Tab stays in, Escape hands it back", async ({ page }) => {
  test.slow();
  await openShot(page, "today-returning", DESKTOP);
  await settleAnimations(page);
  const swap = page.locator('[data-testid="today-swap-1"]');
  await swap.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("swap-menu")).toBeVisible();
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
  const enabled = await page.locator(".session-swap-choice:not(:disabled)").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(enabled.length).toBeGreaterThan(1);
  await expect.poll(focused).toBe(enabled[0]);
  await page.keyboard.press("ArrowDown");
  expect(await focused()).toBe(enabled[1]);
  await page.keyboard.press("ArrowUp");
  expect(await focused()).toBe(enabled[0]);
  // Tab walks the menu's buttons and wraps, never leaving it.
  const inside = await page.locator(".session-swap-menu button:not(:disabled)").count();
  for (let i = 0; i < inside + 1; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".session-swap-menu"))).toBe(true);
  }
  await shot(page, "menu-keyboard");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("swap-menu")).toHaveCount(0);
  expect(await focused()).toBe("today-swap-1");
});

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
test("Today's Swap on a 390x844 phone: 44 px targets, the menu fits the screen", async ({ page }) => {
  test.slow();
  const size = { width: 390, height: 844 };
  await openShot(page, "phone-today-returning", size);
  await settleAnimations(page);
  const button = page.locator('[data-testid="today-swap-1"]');
  await button.scrollIntoViewIfNeeded();
  await buttonsInsideRows(page);
  await noSidewaysScroll(page, "phone Today with Swap");
  await shot(page, "phone-today");

  await button.tap();
  await expect(page.getByTestId("swap-menu")).toBeVisible();
  await insideViewport(page, '[data-testid="swap-menu"]', "phone swap menu", size);
  const choices = await page.locator(".session-swap-choice").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of choices) expect(h).toBeGreaterThanOrEqual(44);
  await shot(page, "phone-menu");

  const choice = (await page.getByTestId("swap-harder").isEnabled()) ? "swap-harder" : "swap-different";
  await page.getByTestId(choice).tap();
  await expect(page.getByTestId("swap-preview")).toBeVisible();
  await insideViewport(page, '[data-testid="swap-menu"]', "phone swap preview", size);
  const actions = await page
    .locator(".session-swap-actions button")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of actions) expect(h).toBeGreaterThanOrEqual(44);
  await shot(page, "phone-preview");
  await page.getByTestId("swap-confirm").tap();
  await expect(page.getByTestId("today-swapped-1")).toBeVisible();
  await shot(page, "phone-swapped");
});
});
