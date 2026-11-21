/**
 * The companion's cards (c4b2, c4b3; DESIGN 6.2 to 6.6, mock 10), measured
 * where a player sees them (leg c4b4):
 *
 * - the weekly look-back, first on Progress, at 1160 with Ask docked beside
 *   it (DESIGN 10, C4's gate) and on a phone;
 * - the plateau question, its three buttons;
 * - a milestone (the first Exercise passed; a Level finished, with the Path's
 *   own words);
 * - the Path suggestion, last on Paths;
 * - the dot on Progress in the rail and on the phone's tab bar, gone once
 *   Progress has shown the card.
 *
 * Ember and Manuscript, and German. What is measured is what a layout spec
 * measures: the card inside its page and never under the dock, nothing in it
 * outside its row or cut, nothing off the window's edge, no sideways scroll,
 * every button reachable (the element at its centre is the button), and 44 px
 * buttons on a phone. Pictures only when `YAMES_SHOT_DIR` names a folder.
 */
import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, noSidewaysScroll, notHitTestable, MOBILE_URL } from "./fits";

const SHOTS = process.env.YAMES_SHOT_DIR;
const THEMES = ["ember", "manuscript"] as const;
const DESKTOP = { width: 1160, height: 800 };
const PHONE = { width: 360, height: 800 };

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/companion-${name}.png` });
}

/** Ask, docked beside the page (the rail's first footer action), as mock 10 draws it. */
async function openDock(page: Page) {
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
  await page.waitForTimeout(260);
}

/**
 * The card holds: inside its page and the window, beside (never under) the
 * dock, every line and button inside the card, no text cut, every button
 * reachable, 44 px buttons on a phone, no sideways scroll.
 */
async function holds(page: Page, card: string, where: string, phone = false) {
  await settleAnimations(page);
  const el = page.locator(card);
  await expect(el, `${where}: the card`).toBeVisible({ timeout: 8000 });
  await el.scrollIntoViewIfNeeded();
  const report = await el.evaluate((node, isPhone) => {
    const out: string[] = [];
    const name = (e: Element) => `${e.tagName.toLowerCase()}.${String(e.getAttribute("class") ?? "").split(" ")[0]} "${(e.textContent ?? "").trim().slice(0, 30)}"`;
    const c = node.getBoundingClientRect();
    const page = node.closest(".session-page")!.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    if (c.left < Math.max(0, page.left) - 0.5 || c.right > Math.min(vw, page.right) + 0.5) {
      out.push(`the card ${Math.round(c.left)}–${Math.round(c.right)} is outside its page ${Math.round(page.left)}–${Math.round(page.right)} (window ${vw})`);
    }
    const dock = document.querySelector(".ask-panel");
    if (dock) {
      const d = dock.getBoundingClientRect();
      const w = Math.min(c.right, d.right) - Math.max(c.left, d.left);
      const h = Math.min(c.bottom, d.bottom) - Math.max(c.top, d.top);
      if (d.width > 0 && w > 1 && h > 1) out.push(`the card is under the dock (${Math.round(w)}×${Math.round(h)})`);
    }
    for (const e of node.querySelectorAll<HTMLElement>("p, span, b, strong, li, button, ul, div")) {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      // Inside the card, and inside the row that holds it.
      if (r.left < c.left - 1 || r.right > c.right + 1) out.push(`${name(e)} runs outside the card`);
      const row = e.parentElement && e.parentElement !== node ? e.parentElement.getBoundingClientRect() : null;
      if (row && (r.left < row.left - 1 || r.right > row.right + 1)) out.push(`${name(e)} runs outside its row ${name(e.parentElement!)}`);
      // Cut: text wider than the box that shows it, with the overflow hidden.
      const cs = getComputedStyle(e);
      if (e.scrollWidth > e.clientWidth + 1 && (cs.overflow !== "visible" || cs.textOverflow === "ellipsis")) out.push(`${name(e)} is cut`);
      if (cs.whiteSpace === "nowrap" && e.scrollWidth > e.clientWidth + 1) out.push(`${name(e)} does not wrap and spills`);
    }
    if (isPhone) {
      for (const b of node.querySelectorAll<HTMLElement>("button")) {
        const r = b.getBoundingClientRect();
        if (r.height < 43.5 || r.width < 43.5) out.push(`${name(b)} is ${Math.round(r.width)}×${Math.round(r.height)}, under 44 px`);
      }
    }
    return out;
  }, phone);
  expect(report, where).toEqual([]);
  expect(await notHitTestable(page, `${card} button`), `${where}: buttons reachable`).toEqual([]);
  await noSidewaysScroll(page, where);
}

/** First on Progress: under the page's title and intro, above the totals. */
async function firstOnProgress(page: Page, card: string, where: string) {
  const c = (await page.locator(card).boundingBox())!;
  const intro = (await page.getByTestId("progress-intro").boundingBox())!;
  expect(c.y, `${where}: under the intro`).toBeGreaterThanOrEqual(intro.y + intro.height - 0.5);
  const totals = page.getByTestId("progress-totals");
  if ((await totals.count()) > 0) {
    const s = (await totals.boundingBox())!;
    expect(c.y + c.height, `${where}: above the totals`).toBeLessThanOrEqual(s.y + 0.5);
  }
}

/** Last on Paths: nothing on the page ends below it. */
async function lastOnPaths(page: Page, where: string) {
  const below = await page.getByTestId("path-suggestion").evaluate((node) => {
    const pageEl = node.closest(".session-page")!;
    const bottom = node.getBoundingClientRect().bottom;
    return [...pageEl.children]
      .filter((ch) => !ch.contains(node) && ch.getBoundingClientRect().height > 0 && ch.getBoundingClientRect().top > bottom - 0.5)
      .map((ch) => String(ch.getAttribute("class") ?? ch.tagName));
  });
  expect(below, `${where}: nothing after the suggestion`).toEqual([]);
}

test.describe("The companion on a computer", () => {
  for (const theme of THEMES) {
    test(`the look-back at 1160 with Ask docked, ${theme}`, async ({ page }) => {
      await openShot(page, "progress-week", DESKTOP, theme);
      await openDock(page);
      const card = '[data-testid="companion-weekly"]';
      await expect(page.locator(card)).toBeVisible({ timeout: 8000 });
      await expect(page.getByTestId("companion-moved")).toBeVisible();
      await expect(page.locator(`${card} .companion-moved li`)).toHaveCount(2);
      await expect(page.getByTestId("companion-foot")).toBeVisible();
      await firstOnProgress(page, card, `week ${theme}`);
      await holds(page, card, `week 1160 dock ${theme}`);
      await shot(page, `week-1160-dock-${theme}`);
    });

    test(`the plateau question, its buttons in their row, ${theme}`, async ({ page }) => {
      await openShot(page, "progress-plateau", DESKTOP, theme);
      const card = '[data-testid="companion-plateau-card"]';
      await expect(page.locator(card)).toBeVisible({ timeout: 8000 });
      await expect(page.getByTestId("companion-plateau-keep")).toBeVisible();
      await expect(page.getByTestId("companion-plateau-rest")).toBeVisible();
      await firstOnProgress(page, card, `plateau ${theme}`);
      await holds(page, card, `plateau 1160 ${theme}`);
      await shot(page, `plateau-1160-${theme}`);
    });

    test(`a milestone: the first Exercise passed, ${theme}`, async ({ page }) => {
      await openShot(page, "progress-milestone", DESKTOP, theme);
      const card = '[data-testid="companion-milestone-card"]';
      await expect(page.getByTestId("companion-milestone-line")).toBeVisible({ timeout: 8000 });
      await firstOnProgress(page, card, `milestone ${theme}`);
      await holds(page, card, `milestone 1160 ${theme}`);
      await shot(page, `milestone-1160-${theme}`);
    });

    test(`the Path suggestion, last on Paths, ${theme}`, async ({ page }) => {
      await openShot(page, "paths-suggestion", DESKTOP, theme);
      await expect(page.getByTestId("path-suggestion")).toBeVisible({ timeout: 8000 });
      await lastOnPaths(page, `suggestion ${theme}`);
      await holds(page, '[data-testid="path-suggestion"]', `suggestion 1160 ${theme}`);
      await shot(page, `paths-suggestion-1160-${theme}`);
    });
  }

  test("a Level finished: its milestone with the Path's own words", async ({ page }) => {
    await openShot(page, "progress-level-done", DESKTOP, "ember");
    const card = '[data-testid="companion-milestone-card"]';
    await expect(page.getByTestId("companion-milestone-payoff")).toBeVisible({ timeout: 8000 });
    await holds(page, card, "level done 1160");
    await shot(page, "level-done-1160-ember");
  });

  test("the dot on Progress in the rail, gone once Progress has shown the card", async ({ page }) => {
    await openShot(page, "today-dot", DESKTOP, "ember");
    const entry = page.locator('.rail .rail-mode[data-view="progress"]');
    const dot = entry.getByTestId("progress-dot");
    await expect(dot).toBeVisible({ timeout: 8000 });
    const d = (await dot.boundingBox())!;
    const e = (await entry.boundingBox())!;
    expect(d.x, "the dot inside its entry").toBeGreaterThanOrEqual(e.x - 0.5);
    expect(d.x + d.width, "the dot inside its entry").toBeLessThanOrEqual(e.x + e.width + 0.5);
    expect(d.y, "the dot inside its entry").toBeGreaterThanOrEqual(e.y - 0.5);
    expect(d.y + d.height, "the dot inside its entry").toBeLessThanOrEqual(e.y + e.height + 0.5);
    await shot(page, "dot-rail-1160-ember");
    await entry.click();
    await expect(page.getByTestId("companion-weekly")).toBeVisible({ timeout: 8000 });
    await page.locator('.rail .rail-mode[data-view="today"]').click();
    await expect(page.locator('.rail [data-testid="progress-dot"]')).toHaveCount(0);
  });
});

test.describe("The companion in German", () => {
  test("the look-back at 1160 with Ask docked: the long words stay inside", async ({ page }) => {
    await openShot(page, "progress-week", DESKTOP, "ember", { lng: "de" });
    await openDock(page);
    await holds(page, '[data-testid="companion-weekly"]', "de week 1160 dock");
    await shot(page, "de-week-1160-dock");
  });

  test("the plateau question at 1160, Manuscript", async ({ page }) => {
    await openShot(page, "progress-plateau", DESKTOP, "manuscript", { lng: "de" });
    await holds(page, '[data-testid="companion-plateau-card"]', "de plateau 1160");
    await shot(page, "de-plateau-1160-manuscript");
  });

  test("the Path suggestion at 1160", async ({ page }) => {
    await openShot(page, "paths-suggestion", DESKTOP, "ember", { lng: "de" });
    await holds(page, '[data-testid="path-suggestion"]', "de suggestion 1160");
    await shot(page, "de-paths-suggestion-1160");
  });
});

test.describe("The companion on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  for (const theme of THEMES) {
    test(`the look-back on a phone, ${theme}`, async ({ page }) => {
      await openShot(page, "phone-progress-week", PHONE, theme);
      await holds(page, '[data-testid="companion-weekly"]', `phone week ${theme}`, true);
      await shot(page, `phone-week-${theme}`);
    });

    test(`the milestone card on a phone, ${theme}`, async ({ page }) => {
      await openShot(page, "phone-progress-milestone", PHONE, theme);
      await holds(page, '[data-testid="companion-milestone-card"]', `phone milestone ${theme}`, true);
      await shot(page, `phone-milestone-${theme}`);
    });
  }

  test("the plateau question on a phone: three thumb-sized buttons", async ({ page }) => {
    await openShot(page, "phone-progress-plateau", PHONE, "ember");
    await holds(page, '[data-testid="companion-plateau-card"]', "phone plateau", true);
    await shot(page, "phone-plateau-ember");
  });

  test("the Path suggestion on a phone, in German", async ({ page }) => {
    await openShot(page, "phone-paths-suggestion", PHONE, "ember", { lng: "de" });
    await holds(page, '[data-testid="path-suggestion"]', "phone de suggestion", true);
    await lastOnPaths(page, "phone de suggestion");
    await shot(page, "phone-de-paths-suggestion");
  });

  test("the dot on the tab bar's Progress", async ({ page }) => {
    await openShot(page, "phone-today-dot", PHONE, "ember");
    const tab = page.locator('.mobile-tabs .mobile-tab[data-tab="progress"]');
    const dot = tab.getByTestId("progress-dot");
    await expect(dot).toBeVisible({ timeout: 8000 });
    const d = (await dot.boundingBox())!;
    const e = (await tab.boundingBox())!;
    expect(d.x + d.width, "the dot inside its tab").toBeLessThanOrEqual(e.x + e.width + 0.5);
    expect(d.y, "the dot inside its tab").toBeGreaterThanOrEqual(e.y - 0.5);
    await shot(page, "phone-dot-ember");
  });
});
