import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll, overlapping, settleAnimations, MOBILE_URL } from "./fits";
import { textContrast, belowAA } from "./contrast";

/**
 * "Add to today" (t2e): mock 17's box added to today. Today plays it right
 * after the warm-up as "Your exercise · You added it for today", every row
 * inside the plan; on Paths its row says "Take off today" and "In today's
 * Session", the other row "Add to today", each a thumb tall on a phone.
 *
 * Pictures only when `YAMES_SHOT_DIR` names a folder.
 */
const SHOTS_DIR = process.env.YAMES_SHOT_DIR;

async function shot(page: Page, name: string, sel: string) {
  if (!SHOTS_DIR) return;
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.locator(sel).first().scrollIntoViewIfNeeded();
  await settleAnimations(page);
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

type Rect = { left: number; right: number; top: number; bottom: number };
const inside = (a: Rect, b: Rect) =>
  a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;

async function todayFits(page: Page, where: string) {
  const plan = page.locator('[data-testid="today-plan"]');
  await expect(plan).toHaveCount(1);
  const mine = plan.locator('[data-role="mine"]');
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText("Your exercise");
  await expect(mine).toContainText("You added it for today.");
  await expect(mine).toContainText("A minor pentatonic");
  await settleAnimations(page);
  await noSidewaysScroll(page, where);
  // The plan's rows among themselves: on a phone the sticky Start sits over a
  // list that scrolls under it by design ("More below"), as on every Today.
  expect(await overlapping(page, '[data-testid="today-plan"]'), `${where}: rows drawn over each other`).toEqual([]);
  const found = await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const list = document.querySelector('[data-testid="today-plan"]')!;
    const items = [...list.querySelectorAll(".session-plan-item")];
    return {
      vw: document.documentElement.clientWidth,
      list: box(list),
      roles: items.map((el) => el.getAttribute("data-role")),
      rows: items.map((el) => box(el)),
    };
  });
  // Right after the warm-up.
  expect(found.roles[0], `${where}: the first row (the warm-up slot)`).not.toBe("mine");
  expect(found.roles[1], `${where}: the second row`).toBe("mine");
  expect(found.list.right, `${where}: past the window`).toBeLessThanOrEqual(found.vw + 0.5);
  for (const r of found.rows) expect(r.right, `${where}: a row past the window`).toBeLessThanOrEqual(found.vw + 0.5);
  // The new row's words, in view (on a phone the rows lower down sit under the
  // sticky Start until scrolled, by design, and read against its colour).
  await mine.scrollIntoViewIfNeeded();
  await settleAnimations(page);
  const hits = await textContrast(page, '[data-testid="today-plan"] [data-role="mine"]');
  expect(hits.length, `${where}: no text measured`).toBeGreaterThan(0);
  expect(belowAA(hits), where).toEqual([]);
}

async function pathsFits(page: Page, where: string, thumb: boolean) {
  const rows = page.locator('[data-testid="my-exercise"]');
  await expect(rows).toHaveCount(2);
  await rows.first().scrollIntoViewIfNeeded();
  await settleAnimations(page);
  await expect(rows.nth(0).locator('[data-testid="my-exercise-today"]')).toHaveText("Take off today");
  await expect(rows.nth(0).locator('[data-testid="my-exercise-in-today"]')).toHaveCount(1);
  await expect(rows.nth(1).locator('[data-testid="my-exercise-today"]')).toHaveText("Add to today");
  await expect(rows.nth(1).locator('[data-testid="my-exercise-in-today"]')).toHaveCount(0);
  await noSidewaysScroll(page, where);
  expect(await overlapping(page), `${where}: blocks drawn over each other`).toEqual([]);
  const found = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="my-exercise"]')].map((row) => {
      const b = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      return { row: b(row), buttons: [...row.querySelectorAll("button")].map((el) => ({ what: el.getAttribute("data-testid"), r: b(el) })) };
    }),
  );
  for (const { row, buttons } of found) {
    expect(buttons.length).toBe(3);
    for (const p of buttons) {
      expect(inside(p.r, row), `${where}: ${p.what} spills out of its row`).toBe(true);
      if (thumb) expect(Math.round(p.r.bottom - p.r.top), `${where}: ${p.what} is not a thumb tall`).toBeGreaterThanOrEqual(44);
    }
  }
  const hits = await textContrast(page, '[data-testid="my-exercises"]');
  expect(belowAA(hits), where).toEqual([]);
}

test("today-mine at 1440: the exercise added comes after the warm-up, as yours", async ({ page }) => {
  await openShot(page, "today-mine", { width: 1440, height: 900 });
  await todayFits(page, "today-mine 1440");
  await shot(page, "today-mine-1440", '[data-testid="today-plan"]');
});

test("paths-mine-today at 1440: Take off today on the one added, Add to today on the other", async ({ page }) => {
  await openShot(page, "paths-mine-today", { width: 1440, height: 900 });
  await pathsFits(page, "paths-mine-today 1440", false);
  await shot(page, "paths-mine-today-1440", '[data-testid="my-exercises"]');
});

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  test("phone-today-mine at 390", async ({ page }) => {
    test.slow();
    await openShot(page, "phone-today-mine", { width: 390, height: 844 });
    await todayFits(page, "phone-today-mine 390");
    await shot(page, "today-mine-390", '[data-testid="today-plan"] [data-role="mine"]');
  });
  test("phone-paths-mine-today at 390: three buttons a thumb tall", async ({ page }) => {
    test.slow();
    await openShot(page, "phone-paths-mine-today", { width: 390, height: 844 });
    await pathsFits(page, "phone-paths-mine-today 390", true);
  });
});
