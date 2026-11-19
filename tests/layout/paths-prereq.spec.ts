import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll, overlapping, settleAnimations, MOBILE_URL } from "./fits";
import { textContrast, belowAA } from "./contrast";

/**
 * The Paths screen by track, and what a Path builds on (plans/paths/NEW_PATHS.md,
 * "The curriculum map" and "UI spec for prerequisites"), measured in a real
 * browser: the tracks and their cards fit at 1400, 1024 and a 390 px phone,
 * every "Builds on" line stays inside its card and wraps inside the page, the
 * suggestion and the Subscribe offer stay inside their cards, nothing is drawn
 * over anything else, and the new words read at AA in Ember and Ivory.
 *
 * `YAMES_PREREQ_SHOTS=<dir>` (or `=1` for ~/projects/.preview/prereq-ui) also
 * writes the pictures the review looks at, wizard steps included.
 */
const SHOTS_ENV = process.env.YAMES_PREREQ_SHOTS;
const SHOTS = SHOTS_ENV === "1" ? path.join(os.homedir(), "projects/.preview/prereq-ui") : SHOTS_ENV;

async function landed(page: Page) {
  await settleAnimations(page);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.playState === "running" && Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity))
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/** A picture of the view, and one of the whole scrolled page (the window made as tall as it). */
async function shot(page: Page, name: string, full = false) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await landed(page);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  if (!full) return;
  const size = page.viewportSize()!;
  const tall = await page.evaluate(() => {
    const pane = document.querySelector(".main-content > .view-transition-wrapper") ?? document.querySelector(".main-content");
    return pane ? pane.scrollHeight - pane.clientHeight : 0;
  });
  if (tall > 0) {
    await page.setViewportSize({ width: size.width, height: size.height + tall });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await landed(page);
    await page.screenshot({ path: path.join(SHOTS, `${name}-full.png`) });
    await page.setViewportSize(size);
  }
}

type Rect = { left: number; right: number; top: number; bottom: number };
const inside = (a: Rect, b: Rect) =>
  a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;

/** Each element of `sel` inside the nearest ancestor matching `within`, and inside the window's width. */
async function allInside(page: Page, sel: string, within: string, where: string, atLeast = 1) {
  await landed(page);
  const found = await page.$$eval(
    sel,
    (els, within) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const box = el.parentElement?.closest(within)?.getBoundingClientRect() ?? null;
        return {
          id: el.getAttribute("data-testid") ?? el.className,
          r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
          box: box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null,
          vw: document.documentElement.clientWidth,
        };
      }),
    within,
  );
  expect(found.length, `${where}: fewer ${sel} than expected`).toBeGreaterThanOrEqual(atLeast);
  for (const f of found) {
    expect(f.box, `${where}: ${f.id} is not inside ${within}`).not.toBeNull();
    expect(inside(f.r, f.box!), `${where}: ${f.id} spills out of ${within} ${JSON.stringify(f)}`).toBe(true);
    expect(f.r.right, `${where}: ${f.id} past the window`).toBeLessThanOrEqual(f.vw + 0.5);
  }
}

async function contrastIn(page: Page, root: string, where: string) {
  await page.waitForTimeout(250);
  const hits = await textContrast(page, root);
  expect(hits.length, `${where}: no text was measured in ${root}`).toBeGreaterThan(0);
  const bad = belowAA(hits);
  expect(bad, `${where}: ${JSON.stringify(bad, null, 1)}`).toEqual([]);
}

/** The Paths list: the tracks, their cards in columns, "Builds on" inside each card. */
async function pathsFit(page: Page, where: string, columnsAtLeast: number) {
  await landed(page);
  await noSidewaysScroll(page, where);
  expect(await overlapping(page), `${where}: blocks drawn over each other`).toEqual([]);
  await expect(page.locator(".session-pathgroup")).toHaveCount(4);
  await allInside(page, ".session-path-card", ".session-pathgroup-cards", where, 15);
  await allInside(page, '.session-prereq-line[data-where="card"]', ".session-path-card", where, 13);
  // The names run inline in the card's quiet line: each inside its card.
  await allInside(page, ".session-prereq-link", ".session-path-card", where, 13);
  // The Technique track's seven cards in as many columns as the width gives.
  const columns = await page.$eval('[data-testid="path-track-technique"] .session-pathgroup-cards', (el) =>
    getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length,
  );
  expect(columns, `${where}: Technique in ${columns} columns`).toBeGreaterThanOrEqual(columnsAtLeast);
  // "Start here" on the one start, at the top, above every other group.
  const start = await page.$eval('[data-testid="path-start-here"]', (el) => el.getBoundingClientRect().top);
  const technique = await page.$eval('[data-testid="path-track-technique"]', (el) => el.getBoundingClientRect().top);
  expect(start, `${where}: Start here is not above the tracks`).toBeLessThan(technique);
}

/** A Path page with "Builds on" and the suggestion: inside the page, the suggestion inside its card above Continue. */
async function pathPageFits(page: Page, where: string) {
  await landed(page);
  await noSidewaysScroll(page, where);
  expect(await overlapping(page), `${where}: blocks drawn over each other`).toEqual([]);
  await allInside(page, '[data-testid="builds-on-page-shred"]', ".session-page", where);
  await allInside(page, ".session-prereq-link", ".session-prereq-line, .session-prereq-first", where, 3);
  await allInside(page, '[data-testid="path-start-first"]', '[data-testid="path-where"]', where);
  const order = await page.evaluate(() => {
    const line = document.querySelector('[data-testid="path-start-first"]')!.getBoundingClientRect();
    const start = document.querySelector('[data-testid="path-open-current"]')!.getBoundingClientRect();
    return { line: line.bottom, start: start.top };
  });
  expect(order.line, `${where}: the suggestion is not above Continue`).toBeLessThanOrEqual(order.start + 0.5);
}

const SIZES = [
  { width: 1400, height: 900, columns: 3 },
  { width: 1024, height: 768, columns: 2 },
];

for (const theme of ["ember", "ivory"]) {
  for (const size of SIZES) {
    test(`paths at ${size.width} in ${theme}: tracks, columns, Builds on inside its card`, async ({ page }) => {
      await openShot(page, "paths", size, theme);
      await pathsFit(page, `paths ${size.width} ${theme}`, size.columns);
      await contrastIn(page, ".session-pathgroup-head", `paths heads ${theme}`);
      await contrastIn(page, ".session-prereq-line", `paths builds-on ${theme}`);
      await contrastIn(page, '[data-testid="path-start-here"]', `paths start-here ${theme}`);
      await shot(page, `paths-${size.width}-${theme}`, true);
    });
    test(`path-unmet at ${size.width} in ${theme}: Builds on and Start with X first`, async ({ page }) => {
      await openShot(page, "path-unmet", size, theme);
      await pathPageFits(page, `path-unmet ${size.width} ${theme}`);
      await contrastIn(page, '[data-testid="builds-on-page-shred"]', `path-unmet builds-on ${theme}`);
      await contrastIn(page, '[data-testid="path-start-first"]', `path-unmet start-first ${theme}`);
      await shot(page, `path-unmet-${size.width}-${theme}`);
    });
    test(`path-offer at ${size.width} in ${theme}: the offer inside the subscription card`, async ({ page }) => {
      await openShot(page, "path-offer", size, theme);
      await landed(page);
      await noSidewaysScroll(page, `path-offer ${size.width} ${theme}`);
      expect(await overlapping(page)).toEqual([]);
      await allInside(page, '[data-testid="path-offer"]', '[data-testid="path-subscription"]', `path-offer ${size.width}`);
      await allInside(page, '[data-testid="path-offer"] button', '[data-testid="path-offer"]', `path-offer ${size.width}`, 2);
      await page.locator('[data-testid="path-offer"]').scrollIntoViewIfNeeded();
      await contrastIn(page, '[data-testid="path-offer"]', `path-offer ${theme}`);
      await shot(page, `path-offer-${size.width}-${theme}`);
    });
  }
}

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  const PHONE = { width: 390, height: 844 };
  for (const theme of ["ember", "ivory"]) {
    test(`phone-paths at 390 in ${theme}`, async ({ page }) => {
      await openShot(page, "phone-paths", PHONE, theme);
      await pathsFit(page, `phone-paths ${theme}`, 1);
      await contrastIn(page, ".session-pathgroup-head", `phone-paths heads ${theme}`);
      // Foundations holds two Paths that build on nothing, so the first "Builds on" line starts below the fold.
      await page.locator(".session-prereq-line").first().scrollIntoViewIfNeeded();
      await contrastIn(page, ".session-prereq-line", `phone-paths builds-on ${theme}`);
      await shot(page, `paths-390-${theme}`, true);
    });
    test(`phone-path-unmet at 390 in ${theme}`, async ({ page }) => {
      await openShot(page, "phone-path-unmet", PHONE, theme);
      await pathPageFits(page, `phone-path-unmet ${theme}`);
      await contrastIn(page, '[data-testid="path-start-first"]', `phone-path-unmet ${theme}`);
      await shot(page, `path-unmet-390-${theme}`);
    });
    test(`phone-path-offer at 390 in ${theme}`, async ({ page }) => {
      await openShot(page, "phone-path-offer", PHONE, theme);
      await landed(page);
      await noSidewaysScroll(page, `phone-path-offer ${theme}`);
      await allInside(page, '[data-testid="path-offer"]', '[data-testid="path-subscription"]', `phone-path-offer ${theme}`);
      await page.locator('[data-testid="path-offer"]').scrollIntoViewIfNeeded();
      await shot(page, `path-offer-390-${theme}`);
    });
  }
  test("phone-firstrun-start-basics at 390: the question, the Paths, the why line inside the card", async ({ page }) => {
    await openShot(page, "phone-firstrun-start-basics", PHONE);
    await landed(page);
    await allInside(page, ".onboarding-start-goal", ".onboarding-card", "phone start", 4);
    await allInside(page, ".onboarding-start-path", ".onboarding-card", "phone start", 15);
    await allInside(page, '[data-testid="onboarding-start-why"]', ".onboarding-card", "phone start");
    await shot(page, "wizard-start-basics-390-ember");
  });
});

// The first run for three players: the answer staged on the start step, and
// the summary it leads to, saying what was picked and why in one row.
for (const goal of ["basics", "harmony", "technique"] as const) {
  for (const theme of goal === "basics" ? ["ember", "ivory"] : ["ember"]) {
    test(`firstrun-start-${goal} in ${theme}: staged, the why line inside the card`, async ({ page }) => {
      await openShot(page, `firstrun-start-${goal}`, { width: 1400, height: 900 }, theme);
      await landed(page);
      await expect(page.locator(`[data-goal="${goal}"]`)).toHaveAttribute("aria-pressed", "true");
      await allInside(page, ".onboarding-start-goal", ".onboarding-card", `start ${goal}`, 4);
      await allInside(page, ".onboarding-start-path", ".onboarding-card", `start ${goal}`, 15);
      await allInside(page, '[data-testid="onboarding-start-why"]', ".onboarding-card", `start ${goal}`);
      await contrastIn(page, ".onboarding-start", `start ${goal} ${theme}`);
      await shot(page, `wizard-start-${goal}-1400-${theme}`);
    });
  }
  test(`firstrun-ready-${goal}: the Path row says what and why`, async ({ page }) => {
    test.slow();
    await openShot(page, `firstrun-ready-${goal}`, { width: 1400, height: 900 });
    await landed(page);
    const why = page.getByTestId("onboarding-summary-why-path");
    await expect(why).toBeVisible();
    await allInside(page, '[data-testid="onboarding-summary-why-path"]', ".onboarding-summary-row", `ready ${goal}`);
    await shot(page, `wizard-ready-${goal}-1400-ember`);
  });
}
