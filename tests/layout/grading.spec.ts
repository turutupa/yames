import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, noSidewaysScroll, notHitTestable, MOBILE_URL } from "./fits";
import { textContrast, belowAA } from "./contrast";

/**
 * Grading is a choice (owner, 2026-11-18: "what if they don't want to turn on
 * input?"). A Take's ready screen in each of the three answers:
 *
 * - on (`session-ready`): Start, with the input on by itself;
 * - off (`session-ungraded-ready`): "Start, N BPM", and not one word about the
 *   input anywhere on the screen;
 * - ask (`session-ask-ready`): two buttons of one size, side by side on a
 *   desktop, and "Remember my choice"; nothing red.
 *
 * At three sizes, in a dark face and a light one, with the text at AA.
 */
const MODES = { on: "session-ready", off: "session-ungraded-ready", ask: "session-ask-ready" } as const;
const DESKTOP = [
  { width: 1400, height: 900 },
  { width: 1024, height: 700 },
];
const PHONE = { width: 390, height: 844 };
const INPUT_WORDS = [
  "session-no-input",
  "session-input-failed",
  "session-ungraded-note",
  "session-input-on",
  "session-play-ungraded",
  "header-input-off",
];

async function shapeOf(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    return {
      vh: innerHeight,
      vw: innerWidth,
      big: box('[data-testid="session-big"]'),
      justPlay: box('[data-testid="session-just-play"]'),
      remember: box('[data-testid="session-ask-remember"]'),
      bigText: document.querySelector<HTMLElement>('[data-testid="session-big"]')?.innerText ?? "",
      text: document.querySelector<HTMLElement>(".session-page")?.innerText ?? "",
      present: [...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")),
      clipped: [...document.querySelectorAll<HTMLElement>('[data-testid="session-ask"] .session-big')].filter(
        (b) => b.scrollWidth > b.clientWidth + 1,
      ).length,
    };
  });
}

async function check(page: Page, mode: keyof typeof MODES, where: string, phone: boolean) {
  await settleAnimations(page);
  await noSidewaysScroll(page, where);
  const s = await shapeOf(page);
  expect(s.big, `${where}: no Start`).not.toBeNull();
  expect(s.big!.bottom, `${where}: Start under the fold`).toBeLessThanOrEqual(s.vh + 1);
  if (mode === "off") {
    expect(s.bigText).toMatch(/^Start, \d+ BPM$/);
    for (const id of INPUT_WORDS) expect(s.present, `${where}: ${id} shown with grading off`).not.toContain(id);
    expect(s.text).not.toMatch(/input|microphone|can't hear/i);
    expect(s.present).toContain("session-input-chip");
  }
  if (mode === "ask") {
    expect(s.bigText).toMatch(/· graded$/);
    expect(s.justPlay, `${where}: no Just play`).not.toBeNull();
    expect(s.remember, `${where}: no Remember my choice`).not.toBeNull();
    expect(Math.abs(s.big!.width - s.justPlay!.width), `${where}: the two answers differ in width`).toBeLessThanOrEqual(1);
    expect(Math.abs(s.big!.height - s.justPlay!.height), `${where}: the two answers differ in height`).toBeLessThanOrEqual(1);
    if (!phone) expect(Math.abs(s.big!.top - s.justPlay!.top), `${where}: not side by side`).toBeLessThanOrEqual(1);
    expect(s.justPlay!.bottom).toBeLessThanOrEqual(s.vh + 1);
    expect(s.remember!.bottom).toBeLessThanOrEqual(s.vh + 1);
    expect(s.clipped, `${where}: an answer's words are cut`).toBe(0);
    for (const id of ["session-no-input", "session-input-failed", "session-input-chip"]) expect(s.present).not.toContain(id);
    expect(
      await notHitTestable(page, '[data-testid="session-big"], [data-testid="session-just-play"], [data-testid="session-ask-remember"]'),
    ).toEqual([]);
  }
  if (mode === "on") expect(s.bigText).toMatch(/^Start take, \d+ BPM$/);
}

for (const theme of ["ember", "ivory"]) {
  for (const [mode, scene] of Object.entries(MODES) as [keyof typeof MODES, string][]) {
    for (const size of DESKTOP) {
      test(`grading ${mode}: the ready screen in ${theme} at ${size.width}x${size.height}`, async ({ page }) => {
        await openShot(page, scene, size, theme);
        await check(page, mode, `${mode} ${theme} ${size.width}`, false);
        if (size.width === 1400) {
          await page.waitForTimeout(400);
          const bad = belowAA(await textContrast(page, ".session-page"));
          expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
        }
      });
    }
  }
}

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  for (const theme of ["ember", "ivory"]) {
    for (const [mode, scene] of Object.entries(MODES) as [keyof typeof MODES, string][]) {
      test(`grading ${mode}: the ready screen in ${theme} at 390x844`, async ({ page }) => {
        test.slow();
        await openShot(page, scene, PHONE, theme);
        await check(page, mode, `${mode} ${theme} phone`, true);
      });
    }
  }
});

test("Grade me opens a small choice, inside the window", async ({ page }) => {
  const size = { width: 1024, height: 700 };
  await openShot(page, "session-ungraded-ready", size, "ember");
  await settleAnimations(page);
  await page.getByTestId("session-input-chip").click();
  const menu = page.getByTestId("session-grademe-menu");
  await expect(menu).toBeVisible();
  const r = (await menu.boundingBox())!;
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(size.width + 1);
  expect(await notHitTestable(page, '[data-testid="session-grademe-session"], [data-testid="session-grademe-always"]')).toEqual([]);
});

/**
 * The input's live level (owner, 2026-11-18): four bars in the chip, moving
 * with the guitar, and the chip does not change size while they move.
 */
test("the live level moves inside a chip that does not", async ({ page }) => {
  await openShot(page, "session-ready-signal", { width: 1400, height: 900 }, "ember");
  await settleAnimations(page);
  const chip = page.getByTestId("session-input-chip");
  const level = chip.getByTestId("live-level");
  await expect(level).toBeVisible();
  await expect(level.locator("i")).toHaveCount(4);
  const seen = new Set<string>();
  const widths = new Set<number>();
  for (let i = 0; i < 12; i++) {
    seen.add((await level.getAttribute("data-bars")) ?? "");
    widths.add(Math.round((await chip.boundingBox())!.width));
    await page.waitForTimeout(80);
  }
  expect(seen.size, `the bars never moved: ${[...seen]}`).toBeGreaterThan(1);
  expect(widths.size, `the chip changed width: ${[...widths]}`).toBe(1);
  expect(await level.getAttribute("aria-label")).toMatch(/^Input level: /);
});

test("grading off: no level, no input chip in the header on Today", async ({ page }) => {
  await openShot(page, "today-ungraded", { width: 1400, height: 900 }, "ember");
  await settleAnimations(page);
  expect(await page.getByTestId("header-input-off").count()).toBe(0);
  expect(await page.getByTestId("live-level").count()).toBe(0);
});
