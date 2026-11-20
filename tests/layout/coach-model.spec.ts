import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, notHitTestable, noSidewaysScroll } from "./fits";

/**
 * The coach model selector at the foot of the right-hand coach panel (ms1),
 * which is Ask since leg c2a1.
 *
 * The menu opens upward and stays inside the panel and the window at both
 * of the panel's widths (380 above 720px of window, 320 under it), with a
 * not-downloaded row and with a download in progress; nothing in it is cut,
 * it stays under the panel's head (its close button), and the text box and
 * Send stay usable once it closes.
 * ms2 adds: bytes and Cancel in the row and the window's strip, both tiers on
 * disk, low storage, a pause kept from before a restart, the checksum stage.
 * Pictures go to the folder `YAMES_COACH_MODEL_SHOTS` names, when it is set.
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
      card: b(".ask-panel"),
      head: b(".ask-head"),
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
  // Under the panel's head: its close button stays where it can be pressed.
  expect(m.menu!.top, `${where}: the menu covers the panel's head`).toBeGreaterThanOrEqual(m.head!.bottom - 0.5);
  expect(m.cut, `${where}: cut or sticking out`).toEqual([]);
  expect(await notHitTestable(page, ".ask-close"), `${where}: Close`).toEqual([]);
}

for (const theme of THEMES) {
  for (const size of SIZES) {
    test(`the selector's menu at ${size.panel}px of panel, in ${theme}`, async ({ page }) => {
      test.slow();
      await openShot(page, "coach-model", { width: size.width, height: size.height }, theme);
      await page.mouse.click(5, 300);
      await page.keyboard.press("c");
      await expect(page.locator(".ask-panel")).toBeVisible();
      await settleAnimations(page);
      const card = (await page.locator(".ask-panel").boundingBox())!;
      expect(Math.round(card.width)).toBe(size.panel);
      await noSidewaysScroll(page, `coach panel at ${size.panel}`);

      await page.locator(".coach-model-button").click();
      await expect(page.locator(".coach-model-menu")).toBeVisible();
      const download = page.getByRole("menuitem", { name: /^Download: Standard/ });
      await expect(download).toBeVisible();
      await checkMenu(page, `not downloaded, ${theme}, ${size.panel}`);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-not-downloaded.png` });

      await download.click();
      // Bytes, ms2: "1.0 of 2.5 GB", with Pause and Cancel side by side.
      await expect(page.locator(".coach-model-progress")).toContainText("of 2.5 GB");
      await expect(page.getByRole("menuitem", { name: /^Pause: Standard/ })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /^Cancel: Standard/ })).toBeVisible();
      await checkMenu(page, `downloading, ${theme}, ${size.panel}`);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-downloading.png` });

      // Closed, the button still says a download runs; the feed is usable.
      await page.keyboard.press("Escape");
      await expect(page.locator(".coach-model-menu")).toHaveCount(0);
      await expect(page.locator(".coach-model-button")).toContainText("42%");
      // The window's download strip is over the bottom edge now: the button clears it.
      expect(
        await notHitTestable(page, ".ask-close, .ask-input, .ask-send, .coach-model-button"),
      ).toEqual([]);
      const button = (await page.locator(".coach-model-button").boundingBox())!;
      expect(button.x + button.width, "the selector's button in the panel").toBeLessThanOrEqual(card.x + card.width + 0.5);
      expect(button.y + button.height, "the selector's button in the window").toBeLessThanOrEqual(size.height + 0.5);
      // The window's strip: Pause and Cancel, the selector's words, both
      // inside the window and pressable.
      await expect(page.getByTestId("download-bar-pause")).toHaveText("Pause");
      await expect(page.getByTestId("download-bar-cancel")).toHaveText("Cancel");
      expect(await notHitTestable(page, "[data-testid=download-bar-pause], [data-testid=download-bar-cancel]")).toEqual([]);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-closed.png` });

      // Cancel from the strip: the bytes go, and the row says so.
      await page.getByTestId("download-bar-cancel").click();
      await page.locator(".coach-model-button").click();
      await expect(page.locator(".coach-model-progress")).toContainText("What had downloaded was removed");
      await expect(page.getByRole("menuitem", { name: /^Download: Standard/ })).toBeVisible();
      await checkMenu(page, `cancelled, ${theme}, ${size.panel}`);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-cancelled.png` });
    });
  }
}

/** Open the coach panel and the selector's menu in one of ms2's worlds. */
async function openMenu(page: Page, scene: string, size: (typeof SIZES)[number], theme: string) {
  await openShot(page, scene, { width: size.width, height: size.height }, theme);
  await page.mouse.click(5, 300);
  await page.keyboard.press("c");
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
  await page.locator(".coach-model-button").click();
  await expect(page.locator(".coach-model-menu")).toBeVisible();
}

// ms2b: an older copy of a model on disk, in Settings → Coach, with its own
// Remove inside the section at every width; the Remove takes only that line.
for (const width of [520, 1024, 1400]) {
  test(`an older copy of a model in Settings, at ${width}px`, async ({ page }) => {
    test.slow();
    await openShot(page, "coach-model-olderCopy", { width, height: 900 });
    const older = page.locator("[data-older-copy]");
    await older.scrollIntoViewIfNeeded();
    await expect(older).toContainText("An older copy of this model is also on disk · 5.0 GB");
    const m = await older.evaluate((el) => {
      const panel = el.closest("section.settings-section")!.getBoundingClientRect();
      const b = el.querySelector("button")!.getBoundingClientRect();
      const label = el.querySelector(".coach-tier-name")!.getBoundingClientRect();
      return { panel: { l: panel.left, r: panel.right }, b: { l: b.left, r: b.right, w: b.width, t: b.top, bt: b.bottom }, label: { r: label.right, t: label.top, bt: label.bottom } };
    });
    expect(m.b.w, "the Remove has a size").toBeGreaterThan(10);
    expect(m.b.l, "the Remove starts inside the section").toBeGreaterThanOrEqual(m.panel.l - 0.5);
    expect(m.b.r, "the Remove ends inside the section").toBeLessThanOrEqual(m.panel.r + 0.5);
    const sideBySide = m.label.r <= m.b.l + 0.5;
    const stacked = m.label.bt <= m.b.t + 0.5 || m.b.bt <= m.label.t + 0.5;
    expect(sideBySide || stacked, "the line and its Remove overlap").toBe(true);
    expect(await notHitTestable(page, "[data-older-copy] button")).toEqual([]);
    if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/settings-older-copy-${width}.png` });

    await older.locator("button").click();
    await expect(page.locator("[data-older-copy]")).toHaveCount(0);
    await expect(page.locator(".coach-tier-item")).toHaveCount(2);
  });
}

// ms2: both tiers on disk, room on disk, a pause kept from before, the check.
for (const theme of ["ember", "manuscript"]) {
  for (const size of SIZES) {
    test(`both models on disk, at ${size.panel}px, in ${theme}`, async ({ page }) => {
      test.slow();
      await openMenu(page, "coach-model-bothOnDisk", size, theme);
      await expect(page.getByRole("menuitemradio", { name: /Studio/ })).toBeVisible();
      await expect(page.getByRole("menuitemradio", { name: /Standard/ })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /^Download/ })).toHaveCount(0);
      await checkMenu(page, `both on disk, ${theme}, ${size.panel}`);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-both-on-disk.png` });
    });

    test(`low storage, at ${size.panel}px, in ${theme}`, async ({ page }) => {
      test.slow();
      await openMenu(page, "coach-model-lowStorage", size, theme);
      await expect(page.locator(".coach-model-menu")).toContainText("Needs 5.3 GB, 3.1 GB free");
      await expect(page.getByRole("menuitem", { name: /^Download: Studio/ })).toHaveCount(0);
      await page.getByRole("menuitem", { name: /^Download: Standard/ }).click();
      await expect(page.locator(".coach-model-note")).toContainText("Only 3.1 GB is free");
      await expect(page.getByRole("menuitem", { name: /^Download anyway: Standard/ })).toBeVisible();
      await checkMenu(page, `low storage, ${theme}, ${size.panel}`);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-low-storage.png` });
    });

    test(`a pause kept from before, then cancelled, at ${size.panel}px, in ${theme}`, async ({ page }) => {
      test.slow();
      await openMenu(page, "coach-model-paused", size, theme);
      await expect(page.locator(".coach-model-progress")).toContainText("Paused at 1.2 of 5.0 GB");
      await expect(page.getByRole("menuitem", { name: /^Resume: Studio/ })).toBeVisible();
      await checkMenu(page, `paused, ${theme}, ${size.panel}`);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-paused.png` });
      await page.getByRole("menuitem", { name: /^Cancel: Studio/ }).click();
      await expect(page.locator(".coach-model-progress")).toContainText("What had downloaded was removed");
      await expect(page.getByRole("menuitem", { name: /^Download: Studio/ })).toBeVisible();
      await checkMenu(page, `paused then cancelled, ${theme}, ${size.panel}`);
    });

    test(`checking the download, at ${size.panel}px, in ${theme}`, async ({ page }) => {
      test.slow();
      await openMenu(page, "coach-model-checking", size, theme);
      await page.getByRole("menuitem", { name: /^Download: Standard/ }).click();
      await expect(page.locator(".coach-model-progress")).toContainText("published checksum");
      await checkMenu(page, `checking, ${theme}, ${size.panel}`);
      if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${theme}-${size.panel}-checking.png` });
      await page.keyboard.press("Escape");
      await expect(page.locator(".coach-model-button")).toContainText("checking");
    });
  }
}
