import { writeFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { MOBILE_URL, noSidewaysScroll, openShot, settleAnimations } from "./fits";

/**
 * "Hear bar N: yours, then the demo" (coach leg c5b2; DESIGN 4.2 "Hear it
 * back"; mocks 06 and 14), in a real browser:
 *
 * - on a graded result whose note names a place, with the Take's audio held
 *   (`?hearBack=1` makes the harness's `heard_take` say so), the chip is the
 *   note's first, inside the note and the window;
 * - absent on an ungraded result, and when the engine holds no audio;
 * - one press: the player's bar, then the demo of it, and the chip back,
 *   with the engine sends in the one safe order (the harness logs them on
 *   `window.__yamesHearBack`): the player's bar is stopped BEFORE anything
 *   starts the transport (c5b1b review L1);
 * - a second press stops it, and nothing of the demo is sent.
 *
 * Pictures only when `YAMES_SHOT_DIR` names a folder.
 */

const WIDE = { width: 1440, height: 900 };
const SHORT = { width: 1024, height: 700 };
const PHONE = { width: 390, height: 844 };
const HEARD = { hearBack: "1" };
const CHIP = '[data-testid="coach-hear-back"]';

async function hearLog(page: Page): Promise<string[]> {
  return page.evaluate(() => [...((window as unknown as { __yamesHearBack?: string[] }).__yamesHearBack ?? [])]);
}

async function chipFits(page: Page, where: string) {
  await settleAnimations(page);
  await noSidewaysScroll(page, where);
  const vw = await page.evaluate(() => innerWidth);
  const box = await page.locator(CHIP).boundingBox();
  expect(box, `${where}: the chip is drawn`).not.toBeNull();
  expect(box!.x, `${where}: the chip starts inside the window`).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width, `${where}: the chip ends inside the window`).toBeLessThanOrEqual(vw + 0.5);
  const note = await page.locator('[data-testid="coach-note"]').boundingBox();
  expect(note, `${where}: the note`).not.toBeNull();
  expect(box!.x + box!.width, `${where}: the chip is inside the note`).toBeLessThanOrEqual(note!.x + note!.width + 0.5);
}

test("the chip on a graded result: first in the note, its bar named, inside the window", async ({ page }) => {
  test.slow();
  await openShot(page, "session-between", WIDE, "ember", HEARD);
  const chip = page.locator(CHIP);
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await expect(chip).toHaveText(/^Hear bar \d+: yours, then the demo$/);
  await expect(page.locator('[data-testid="coach-note"] .coach-chips > .coach-chip').first()).toHaveAttribute(
    "data-testid",
    "coach-hear-back",
  );
  await expect(chip).toHaveAttribute("data-kind", "play");
  await chipFits(page, "1440");
  await page.setViewportSize(SHORT);
  await chipFits(page, "1024x700");
});

test("one press: the player's bar, then the demo, in the safe order", async ({ page }) => {
  test.slow();
  await openShot(page, "session-between", WIDE, "ember", HEARD);
  const chip = page.locator(CHIP);
  await expect(chip).toBeVisible({ timeout: 30_000 });
  const bar = Number(/bar (\d+)/.exec((await chip.textContent()) ?? "")?.[1]);
  expect(bar).toBeGreaterThan(0);
  await page.evaluate(() => {
    (window as unknown as { __yamesHearBack?: string[] }).__yamesHearBack = [];
  });
  await chip.click();
  await expect(chip).toHaveText(`Yours: bar ${bar} · Stop`);
  await expect(chip).toHaveText(`Demo: bar ${bar} · Stop`, { timeout: 10_000 });
  await expect(chip).toHaveText(`Hear bar ${bar}: yours, then the demo`, { timeout: 30_000 });
  const log = await hearLog(page);
  test.info().annotations.push({ type: "hear-back order", description: log.join(" > ") });
  // For the review: the order as logged, beside the pictures.
  if (process.env.YAMES_SHOT_DIR) writeFileSync(`${process.env.YAMES_SHOT_DIR}/hear-back-order.txt`, `${log.join("\n")}\n`);
  const at = (prefix: string) => log.findIndex((e) => e.startsWith(prefix));
  expect(log[0], "the input is gated before anything sounds").toBe("gate(on)");
  expect(at("hear_take(")).toBeGreaterThan(0);
  expect(log[at("hear_take(")]).toMatch(new RegExp(`^hear_take\\(\\d+,${bar},${bar}\\)$`));
  expect(at("stop_hear_take(")).toBeGreaterThan(at("hear_take("));
  expect(at("ended(")).toBeGreaterThan(at("hear_take("));
  expect(at("set_playing(true)"), "the player's bar is stopped before the demo starts").toBeGreaterThan(at("stop_hear_take("));
  expect(at("load_song")).toBeGreaterThan(at("stop_hear_take("));
  expect(log[log.length - 1], "the input is the player's again at the end").toBe("gate(off)");
});

test("a second press stops it during the player's bar, and nothing of the demo is sent", async ({ page }) => {
  test.slow();
  await openShot(page, "session-between", WIDE, "ember", HEARD);
  const chip = page.locator(CHIP);
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    (window as unknown as { __yamesHearBack?: string[] }).__yamesHearBack = [];
  });
  await chip.click();
  await expect(chip).toHaveText(/^Yours: bar \d+ · Stop$/);
  await chip.click();
  await expect(chip).toHaveText(/^Hear bar \d+: yours, then the demo$/);
  // Past the bar's own length: had it gone on, the demo would have started by now.
  await page.waitForTimeout(1_800);
  const log = await hearLog(page);
  expect(log.some((e) => e.startsWith("stop_hear_take("))).toBe(true);
  expect(log).not.toContain("set_playing(true)");
  expect(log).not.toContain("load_song");
  expect(log[log.length - 1]).toBe("gate(off)");
});

test("absent on an ungraded result, even with the audio held", async ({ page }) => {
  test.slow();
  await openShot(page, "session-ungraded-result", WIDE, "ember", HEARD);
  await expect(page.locator('[data-testid="session-big"]')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await expect(page.locator(CHIP)).toHaveCount(0);
});

test("absent when the engine holds no audio for the Take", async ({ page }) => {
  test.slow();
  await openShot(page, "session-between", WIDE, "ember");
  await expect(page.locator('[data-testid="coach-note"]')).toBeVisible({ timeout: 30_000 });
  // The Session asks a few times over five seconds; the answer stays no.
  await page.waitForTimeout(6_000);
  await expect(page.locator(CHIP)).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, viewport: PHONE, isMobile: true, hasTouch: true });
  test("the chip fits a phone's result", async ({ page }) => {
    test.slow();
    await openShot(page, "phone-session-between", PHONE, "ember", HEARD);
    await expect(page.locator(CHIP)).toBeVisible({ timeout: 30_000 });
    await chipFits(page, "phone");
  });
});

test("in German, the chip still fits", async ({ page }) => {
  test.slow();
  await openShot(page, "session-between", WIDE, "manuscript", { ...HEARD, lng: "de" });
  await expect(page.locator(CHIP)).toBeVisible({ timeout: 30_000 });
  await chipFits(page, "1440 de");
  await page.setViewportSize(SHORT);
  await chipFits(page, "1024x700 de");
});

const SHOTS_DIR = process.env.YAMES_SHOT_DIR;
test.describe("pictures for the review", () => {
  test.skip(!SHOTS_DIR, "YAMES_SHOT_DIR is not set");
  for (const [theme, lng] of [
    ["ember", "en"],
    ["manuscript", "en"],
    ["ember", "de"],
  ] as const) {
    test(`the chip in ${theme}, ${lng}`, async ({ page }) => {
      test.slow();
      await openShot(page, "session-between", WIDE, theme, { ...HEARD, lng });
      await expect(page.locator(CHIP)).toBeVisible({ timeout: 30_000 });
      await settleAnimations(page);
      await page.screenshot({ path: `${SHOTS_DIR}/hear-back--${theme}--${lng}--1440.png` });
      await page.locator(CHIP).click();
      await expect(page.locator(CHIP)).toHaveText(/·/);
      await page.screenshot({ path: `${SHOTS_DIR}/hear-back-playing--${theme}--${lng}--1440.png` });
    });
  }
  test("ungraded: no chip", async ({ page }) => {
    test.slow();
    await openShot(page, "session-ungraded-result", WIDE, "ember", HEARD);
    await expect(page.locator('[data-testid="session-big"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await settleAnimations(page);
    await page.screenshot({ path: `${SHOTS_DIR}/hear-back-ungraded--ember--1440.png` });
  });
});

test.describe("phone pictures for the review", () => {
  test.skip(!SHOTS_DIR, "YAMES_SHOT_DIR is not set");
  test.use({ baseURL: MOBILE_URL, viewport: PHONE, isMobile: true, hasTouch: true });
  for (const theme of ["ember", "manuscript"] as const) {
    test(`the chip on a phone in ${theme}`, async ({ page }) => {
      test.slow();
      await openShot(page, "phone-session-between", PHONE, theme, HEARD);
      await expect(page.locator(CHIP)).toBeVisible({ timeout: 30_000 });
      await settleAnimations(page);
      await page.screenshot({ path: `${SHOTS_DIR}/hear-back--${theme}--phone.png`, fullPage: true });
    });
  }
});
