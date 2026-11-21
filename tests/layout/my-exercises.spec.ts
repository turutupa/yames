import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll, overlapping, settleAnimations, MOBILE_URL } from "./fits";
import { textContrast, belowAA } from "./contrast";

/**
 * My exercises on the Paths screen (t2b): two custom Exercises after the Paths,
 * at 1440 and on a phone, in Ember and Manuscript, and once in German. Each row,
 * its line and its two buttons inside the section and the window, nothing drawn
 * over anything, the words at AA; on a phone Play and Remove are a thumb tall.
 * With nothing stored the section is not there at all.
 *
 * Pictures only when `YAMES_SHOT_DIR` names a folder.
 */
const SHOTS_DIR = process.env.YAMES_SHOT_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS_DIR) return;
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.locator('[data-testid="my-exercises"]').scrollIntoViewIfNeeded();
  await settleAnimations(page);
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

type Rect = { left: number; right: number; top: number; bottom: number };
const inside = (a: Rect, b: Rect) =>
  a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;

async function sectionFits(page: Page, where: string, thumb: boolean) {
  const section = page.locator('[data-testid="my-exercises"]');
  await expect(section).toHaveCount(1);
  await section.scrollIntoViewIfNeeded();
  await settleAnimations(page);
  await noSidewaysScroll(page, where);
  expect(await overlapping(page), `${where}: blocks drawn over each other`).toEqual([]);
  await expect(page.locator('[data-testid="my-exercise"]')).toHaveCount(2);
  const found = await page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const sec = document.querySelector('[data-testid="my-exercises"]')!;
    return {
      vw: document.documentElement.clientWidth,
      section: box(sec),
      rows: [...sec.querySelectorAll('[data-testid="my-exercise"]')].map((row) => ({
        row: box(row),
        parts: [...row.querySelectorAll(".session-plan-title, .session-exercise-tempo, button")].map((el) => ({
          what: el.getAttribute("data-testid") ?? el.className,
          r: box(el),
        })),
      })),
      // The section is the last block on the page: after every track.
      last: sec.parentElement?.lastElementChild === sec,
    };
  });
  expect(found.last, `${where}: My exercises is not after the Paths`).toBe(true);
  expect(found.section.right, `${where}: past the window`).toBeLessThanOrEqual(found.vw + 0.5);
  for (const { row, parts } of found.rows) {
    expect(inside(row, found.section), `${where}: a row spills out of the section`).toBe(true);
    expect(parts.length).toBeGreaterThanOrEqual(4);
    for (const p of parts) {
      expect(inside(p.r, row), `${where}: ${p.what} spills out of its row ${JSON.stringify(p)}`).toBe(true);
      if (thumb && p.what.startsWith("my-exercise-")) {
        expect(Math.round(p.r.bottom - p.r.top), `${where}: ${p.what} is not a thumb tall`).toBeGreaterThanOrEqual(44);
        expect(Math.round(p.r.right - p.r.left), `${where}: ${p.what} is not a thumb wide`).toBeGreaterThanOrEqual(44);
      }
    }
  }
  const hits = await textContrast(page, '[data-testid="my-exercises"]');
  expect(hits.length, `${where}: no text measured`).toBeGreaterThan(0);
  expect(belowAA(hits), where).toEqual([]);
}

for (const theme of ["ember", "manuscript"]) {
  test(`paths-mine at 1440 in ${theme}: two rows after the Paths, everything inside`, async ({ page }) => {
    await openShot(page, "paths-mine", { width: 1440, height: 900 }, theme);
    await sectionFits(page, `paths-mine 1440 ${theme}`, false);
    await shot(page, `paths-mine-1440-${theme}`);
  });
}

test("paths-mine at 1440 in German", async ({ page }) => {
  await openShot(page, "paths-mine", { width: 1440, height: 900 }, "ember", { lng: "de" });
  await sectionFits(page, "paths-mine 1440 de", false);
  await shot(page, "paths-mine-1440-ember-de");
});

test("paths with nothing stored: no My exercises at all", async ({ page }) => {
  await openShot(page, "paths", { width: 1440, height: 900 });
  await expect(page.locator('[data-testid="paths"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="my-exercises"]')).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  for (const theme of ["ember", "manuscript"]) {
    test(`phone-paths-mine at 390 in ${theme}: one column, a thumb's buttons`, async ({ page }) => {
      test.slow();
      await openShot(page, "phone-paths-mine", { width: 390, height: 844 }, theme);
      await sectionFits(page, `phone-paths-mine ${theme}`, true);
      await shot(page, `paths-mine-390-${theme}`);
    });
  }
  test("phone-paths-mine at 390 in German", async ({ page }) => {
    test.slow();
    await openShot(page, "phone-paths-mine", { width: 390, height: 844 }, "ember", { lng: "de" });
    await sectionFits(page, "phone-paths-mine de", true);
    await shot(page, "paths-mine-390-ember-de");
  });
});
