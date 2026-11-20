import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, notHitTestable, noSidewaysScroll } from "./fits";

/**
 * The coach model selector at the foot of the right-hand coach panel (ms1).
 *
 * The menu opens upward and stays inside the panel and the window at both
 * of the panel's widths (380 above 720px of window, 320 under it), with a
 * not-downloaded row and with a download in progress; nothing in it is cut,
 * and the panel's Start button and chat stay usable once it closes.
 * Pictures go to `/tmp/coach-ms1/shots/` when `YAMES_COACH_MODEL_SHOTS` is set.
 */

const SHOTS_DIR = process.env.YAMES_COACH_MODEL_SHOTS;
const SIZES = [
  { panel: 380, width: 1280, height: 800 },
  { panel: 320, width: 700, height: 700 },
];
const THEMES = ["ember", "neon", "manuscript"];

type Box = { left: number; right: number; top: number; bottom: number; width: number };

async function boxes(page: Page) {
  return page.evaluate(() => {
    const b = (sel: string): Box | null => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
    };
    const menu = document.querySelector(".coach-model-menu") as HTMLElement | null;
    // Anything inside the menu that sticks out of it sideways, or is cut.
    const cut: string[] = [];
    if (menu) {
      const m = menu.getBoundingClientRect();
      for (const el of menu.querySelectorAll<HTMLElement>("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.left < m.left - 0.5 || r.right > m.right + 0.5) cut.push(`${el.className} sticks out`);
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") {
          cut.push(`${el.className} is cut`);
        }
      }
    }
    return {
      vw: innerWidth,
      vh: innerHeight,
      card: b(".coach-card.coach-card-open"),
      head: b(".coach-card-header"),
      menu: b(".coach-model-menu"),
      cut,
    };
  });
}

function inside(inner: Box, outer: Box, what: string) {
  expect(inner.left, `${what}: left edge`).toBeGreaterThanOrEqual(outer.left - 0.5);
  expect(inner.right, `${what}: right edge`).toBeLessThanOrEqual(outer.right + 0.5);
  expect(inner.top, `${what}: top edge`).toBeGreaterThanOrEqual(outer.top - 0.5);
  expect(inner.bottom, `${what}: bottom edge`).toBeLessThanOrEqual(outer.bottom + 0.5);
}

async function checkMenu(page: Page, where: string) {
  await settleAnimations(page);
  const m = await boxes(page);
  expect(m.card, "the coach panel is open").not.toBeNull();
  expect(m.menu, "the menu is open").not.toBeNull();
  expect(Math.round(m.card!.width)).toBeGreaterThan(0);
  inside(m.menu!, m.card!, `${where}: the menu in the panel`);
  inside(m.menu!, { left: 0, right: m.vw, top: 0, bottom: m.vh, width: m.vw }, `${where}: the menu in the window`);
  // Under the panel's head: Start stays where it can be pressed.
  expect(m.menu!.top, `${where}: the menu covers the panel's head`).toBeGreaterThanOrEqual(m.head!.bottom - 0.5);
  expect(m.cut, `${where}: cut or sticking out`).toEqual([]);
  expect(await notHitTestable(page, ".coach-card-start-btn"), `${where}: Start`).toEqual([]);
}

for (const theme of THEMES) {
  for (const size of SIZES) {
    test(`the selector's menu at ${size.panel}px of panel, in ${theme}`, async ({ page }) => {
      test.slow();
      await openShot(page, "coach-model", { width: size.width, height: size.height }, theme);
      await page.mouse.click(5, 300);
      await page.keyboard.press("c");
      await expect(page.locator(".coach-card.coach-card-open")).toBeVisible();
      await settleAnimations(page);
      const card = (await page.locator(".coach-card.coach-card-open").boundingBox())!;
      expect(Math.round(card.width)).toBe(size.panel);
      await noSidewaysScroll(page, `coach panel at ${size.panel}`);

      await page.locator(".coach-model-button").click();
      await expect(page.locator(".coach-model-menu")).toBeVisible();
      const download = page.getByRole("menuitem", { name: /^Download: Standard/ });
      await expect(download).toBeVisible();
      await checkMenu(page, `not downloaded, ${theme}, ${size.panel}`);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-not-downloaded.png` });

      await download.click();
      await expect(page.locator(".coach-model-progress")).toContainText("42%");
      await expect(page.getByRole("menuitem", { name: /^Pause: Standard/ })).toBeVisible();
      await checkMenu(page, `downloading, ${theme}, ${size.panel}`);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-downloading.png` });

      // Closed, the button still says a download runs; the feed is usable.
      await page.keyboard.press("Escape");
      await expect(page.locator(".coach-model-menu")).toHaveCount(0);
      await expect(page.locator(".coach-model-button")).toContainText("42%");
      expect(await notHitTestable(page, ".coach-card-start-btn, .coach-card-chat-input, .coach-card-chat-send")).toEqual([]);
      const button = (await page.locator(".coach-model-button").boundingBox())!;
      expect(button.x + button.width, "the selector's button in the panel").toBeLessThanOrEqual(card.x + card.width + 0.5);
      expect(button.y + button.height, "the selector's button in the window").toBeLessThanOrEqual(size.height + 0.5);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-closed.png` });
    });
  }
}
