import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll, overlapping, settleAnimations, MOBILE_URL } from "./fits";
import { textContrast, belowAA } from "./contrast";

/**
 * Today's "Paths:" picker and the Paths card's "In my daily mix" (owner,
 * 2026-11-18). Measured, because happy-dom has no geometry: the picker sits
 * inside the hero's column under the minutes and never on top of them, its
 * choices are a thumb tall, and the switch and "Practise only this today"
 * stay inside their card, at 1400, 1024 and a 390 px phone, in Ember and Ivory.
 *
 * `YAMES_FOCUS_SHOTS=<dir>` also writes the pictures the review looks at.
 */
const SHOTS = process.env.YAMES_FOCUS_SHOTS;

/**
 * Let every finite animation land: a screen comes in with \`fade-scale\`
 * (98.7% to 100%), and a 44 px control measured mid-way reads 43.4.
 */
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

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await settleAnimations(page);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

type Rect = { left: number; right: number; top: number; bottom: number; width: number; height: number };

/** The picker inside its column, below the minutes, every choice a real target. */
async function pickerFits(page: Page, where: string) {
  await landed(page);
  const m = await page.evaluate(() => {
    const r = (el: Element | null): Rect | null => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
    };
    const focus = document.querySelector('[data-testid="today-focus"]');
    // The hero's column, or on a phone (the hero lends its children to
    // the page there, display: contents) the page column.
    let column: Element | null = focus?.parentElement ?? null;
    while (column && column.getBoundingClientRect().width === 0) column = column.parentElement;
    const minutes = document.querySelector('.session-today .session-seg:not([data-focus])');
    const controls = focus ? [...focus.querySelectorAll("button, select")].map((c) => ({ box: r(c)!, text: c.textContent ?? "" })) : [];
    // A label's words inside its button: a long Path name wraps, never spills.
    const spill = focus
      ? [...focus.querySelectorAll("button")].filter((b) => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1).map((b) => b.textContent)
      : [];
    const label = r(focus?.querySelector(".session-today-seg-label") ?? null);
    const control = r(focus?.querySelector(".session-seg, select") ?? null);
    return { label, control, focus: r(focus), column: r(column), minutes: r(minutes), controls, spill, vw: window.innerWidth };
  });
  expect(m.focus, `${where}: no picker`).not.toBeNull();
  const f = m.focus!;
  const col = m.column!;
  expect(f.left, `${where}: picker left of its column`).toBeGreaterThanOrEqual(col.left - 0.5);
  expect(f.right, `${where}: picker past its column`).toBeLessThanOrEqual(col.right + 0.5);
  expect(f.right, `${where}: picker past the window`).toBeLessThanOrEqual(m.vw);
  // Under the minutes, never over them.
  expect(m.minutes, `${where}: no minutes picker`).not.toBeNull();
  expect(f.top, `${where}: picker overlaps the minutes ${JSON.stringify({ f, minutes: m.minutes })}`).toBeGreaterThanOrEqual(
    m.minutes!.bottom - 0.5,
  );
  // "Paths:" above its control, never under it.
  expect(m.label!.bottom, `${where}: the label is not above its control`).toBeLessThanOrEqual(m.control!.top + 0.5);
  expect(m.controls.length).toBeGreaterThan(0);
  for (const c of m.controls) {
    expect(c.box.left, `${where}: ${c.text} outside the picker`).toBeGreaterThanOrEqual(f.left - 0.5);
    expect(c.box.right, `${where}: ${c.text} outside the picker`).toBeLessThanOrEqual(f.right + 0.5);
    expect(c.box.height, `${where}: ${c.text} under a thumb's height`).toBeGreaterThanOrEqual(44);
  }
  // The choices on one row do not collide.
  const boxes = m.controls.map((c) => c.box);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const hit = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      expect(hit, `${where}: choices ${i} and ${j} overlap`).toBe(false);
    }
  }
  expect(m.spill, `${where}: words spill out of their choice`).toEqual([]);
}

async function contrastIn(page: Page, root: string, where: string) {
  await page.waitForTimeout(250);
  const hits = await textContrast(page, root);
  expect(hits.length, `${where}: no text was measured`).toBeGreaterThan(0);
  const bad = belowAA(hits);
  expect(bad, `${where}: ${JSON.stringify(bad, null, 1)}`).toEqual([]);
}

/** Each subscribed card's switch and action inside the card, a real target. */
async function mixSwitchesFit(page: Page, where: string, minHeight = 32) {
  await landed(page);
  const cards = await page.$$eval(".session-path-card", (els) =>
    els
      .map((card) => {
        const c = card.getBoundingClientRect();
        const row = card.querySelector(".session-path-today");
        if (!row) return null;
        const inside = [...row.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          return {
            text: b.textContent,
            inside: r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5,
            h: r.height,
          };
        });
        return { id: card.getAttribute("data-testid"), inside };
      })
      .filter((x) => x !== null),
  );
  expect(cards.length, `${where}: no card has the switch`).toBeGreaterThan(1);
  for (const card of cards) {
    for (const b of card!.inside) {
      expect(b.inside, `${where}: ${card!.id} ${b.text} outside its card`).toBe(true);
      expect(b.h, `${where}: ${card!.id} ${b.text}`).toBeGreaterThanOrEqual(minHeight);
    }
  }
}

const SIZES = [
  { width: 1400, height: 900 },
  { width: 1024, height: 768 },
];

for (const theme of ["ember", "ivory"]) {
  for (const size of SIZES) {
    for (const scene of ["today-focus-two", "today-focus-two-one", "today-focus-three", "today-focus-three-one"]) {
      test(`${scene} at ${size.width} in ${theme}: the picker in its column, under the minutes`, async ({ page }) => {
        await openShot(page, scene, size, theme);
        await pickerFits(page, `${scene} ${size.width} ${theme}`);
        await noSidewaysScroll(page, `${scene} ${size.width} ${theme}`);
        expect(await overlapping(page)).toEqual([]);
        await contrastIn(page, '[data-testid="today-focus"]', `${scene} ${theme}`);
        await shot(page, `${scene}-${size.width}-${theme}`);
      });
    }
    test(`paths-mix at ${size.width} in ${theme}: the switch inside each card`, async ({ page }) => {
      await openShot(page, "paths-mix", size, theme);
      await mixSwitchesFit(page, `paths-mix ${size.width} ${theme}`);
      await noSidewaysScroll(page, `paths-mix ${size.width} ${theme}`);
      await contrastIn(page, ".session-path-today", `paths-mix ${theme}`);
      await shot(page, `paths-mix-${size.width}-${theme}`);
    });
  }
  test(`today-mix-empty in ${theme}: one line and the picker, no empty plan`, async ({ page }) => {
    await openShot(page, "today-mix-empty", SIZES[0], theme);
    await expect(page.getByTestId("today-nothing-why")).toBeVisible();
    await expect(page.getByTestId("today-plan")).toHaveCount(0);
    await pickerFits(page, `today-mix-empty ${theme}`);
    await shot(page, `today-mix-empty-${theme}`);
  });
}

test("one subscribed Path: no picker", async ({ page }) => {
  await openShot(page, "today-focus-one-path", SIZES[0]);
  await expect(page.getByTestId("today-plan")).toBeVisible();
  await expect(page.getByTestId("today-focus")).toHaveCount(0);
  await shot(page, "today-focus-one-path-1400-ember");
});

test("choosing a Path rebuilds the plan from it alone", async ({ page }) => {
  await openShot(page, "today-focus-two", SIZES[0]);
  await page.getByTestId("today-focus-blues-pentatonics").click();
  await expect(page.getByTestId("today-focus-blues-pentatonics")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("today-from").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("today-from")).toContainText("Blues");
  await shot(page, "today-focus-two-chosen-1400-ember");
});

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  const PHONE = { width: 390, height: 844 };
  for (const theme of ["ember", "ivory"]) {
    for (const scene of ["today-focus-two", "today-focus-three-one", "today-mix-empty"]) {
      test(`phone-${scene} at 390 in ${theme}`, async ({ page }) => {
        await openShot(page, `phone-${scene}`, PHONE, theme);
        await pickerFits(page, `phone-${scene} ${theme}`);
        await noSidewaysScroll(page, `phone-${scene} ${theme}`);
        await contrastIn(page, '[data-testid="today-focus"]', `phone-${scene} ${theme}`);
        await shot(page, `phone-${scene}-390-${theme}`);
      });
    }
    test(`phone-paths-mix at 390 in ${theme}`, async ({ page }) => {
      await openShot(page, "phone-paths-mix", PHONE, theme);
      await mixSwitchesFit(page, `phone-paths-mix ${theme}`, 44);
      await noSidewaysScroll(page, `phone-paths-mix ${theme}`);
      await shot(page, `phone-paths-mix-390-${theme}`);
    });
  }
});
