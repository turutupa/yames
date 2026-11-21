import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, notHitTestable, noSidewaysScroll, MOBILE_URL } from "./fits";

/**
 * Ask, the one coach panel (leg c2a1; DESIGN 3.2, 3.3; mocks 02, 08, 11, 15).
 *
 * One width (380, 320 under 720 px of window), three shapes: a dock that
 * pushes the content at 1160 px and wider (and over Today from 981 px), a
 * drawer over the content narrower than that and in a Session at any width,
 * a sheet on a phone. In a Session the drawer covers the picture and never
 * the controls: Start stays on screen and pressable at 1024 × 700, the neck
 * is not re-framed. The model selector sits at the panel's foot.
 *
 * Pictures go to `$YAMES_ASK_SHOTS` (e.g. `/tmp/coach-c2a1/shots`) when set,
 * in Ember and Manuscript.
 */

const SHOTS = process.env.YAMES_ASK_SHOTS;
const THEMES = ["ember", "manuscript"] as const;

type R = { left: number; right: number; top: number; bottom: number; width: number; height: number };

async function rect(page: Page, sel: string): Promise<R | null> {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }, sel);
}

async function position(page: Page, sel: string): Promise<string> {
  return page.evaluate((s) => getComputedStyle(document.querySelector(s)!).position, sel);
}

/** Open Ask the way a person does on a desktop: the rail's row. */
async function openFromRail(page: Page) {
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
  await page.waitForTimeout(260); // the panel's own slide-in
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** The panel's own checks, any shape: one width, its parts inside it, the selector at its foot. */
async function panelHolds(page: Page, width: number, where: string) {
  const panel = (await rect(page, ".ask-panel"))!;
  expect(Math.round(panel.width), `${where}: one width`).toBe(width);
  // The window's own 1 px frame is outside it.
  expect(page.viewportSize()!.width - panel.right, `${where}: at the window's right edge`).toBeLessThanOrEqual(1.5);
  for (const part of [".ask-head", ".ask-thread", ".ask-compose", ".ask-foot", ".coach-model-button"]) {
    const r = (await rect(page, `.ask-panel ${part}`))!;
    expect(r, `${where}: ${part}`).not.toBeNull();
    expect(r.left, `${where}: ${part} left`).toBeGreaterThanOrEqual(panel.left - 0.5);
    expect(r.right, `${where}: ${part} right`).toBeLessThanOrEqual(panel.right + 0.5);
    expect(r.bottom, `${where}: ${part} in the window`).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
  }
  const compose = (await rect(page, ".ask-compose"))!;
  const foot = (await rect(page, ".ask-foot"))!;
  expect(foot.top, `${where}: the selector under the text box`).toBeGreaterThanOrEqual(compose.bottom - 0.5);
  expect(await notHitTestable(page, ".ask-close, .ask-input, .coach-model-button"), where).toEqual([]);
  await noSidewaysScroll(page, where);
  // No solid button inside it: the page keeps its one.
  expect(await page.locator(".ask-panel .btn-primary, .ask-panel .session-big").count(), `${where}: solid`).toBe(0);
}

for (const theme of THEMES) {
  test.describe(`Ask, ${theme}`, () => {
    for (const width of [1440, 1160]) {
      test(`the dock at ${width}: pushes the tool, one width, the selector at its foot`, async ({ page }) => {
        await openShot(page, "metronome", { width, height: 900 }, theme);
        await openFromRail(page);
        await shot(page, `${theme}-dock-${width}`);
        await panelHolds(page, 380, `dock ${width}`);
        expect(await position(page, ".ask-panel"), "a dock is in the flow").not.toBe("absolute");
        const content = (await rect(page, ".main-content"))!;
        const panel = (await rect(page, ".ask-panel"))!;
        expect(content.right, "the content ends where the dock starts").toBeLessThanOrEqual(panel.left + 0.5);
        // Only Ask and its Notebook (legs c2a2, c4a2): the tools' coach is
        // Listen on the transport, so no other section and no Start.
        expect(await page.locator('.ask-panel [data-testid^="ask-section-"]').count(), "sections in Ask").toBe(0);
        await expect(page.locator('.ask-panel [role="tab"]')).toHaveText(["Ask", "Notebook"]);
        expect(await page.locator(".ask-panel [class*='coach-card']").count(), "the old coach card in Ask").toBe(0);
        await expect(page.locator(".ask-panel").getByRole("button", { name: /^start$/i })).toHaveCount(0);
      });
    }

    test("Today with the dock at 1200: one column of 560 beside it", async ({ page }) => {
      await openShot(page, "today-returning", { width: 1200, height: 860 }, theme);
      await openFromRail(page);
      await shot(page, `${theme}-today-1200`);
      await panelHolds(page, 380, "Today 1200");
      expect(await position(page, ".ask-panel"), "docked over Today from 981").not.toBe("absolute");
      const today = (await rect(page, ".session-today"))!;
      const panel = (await rect(page, ".ask-panel"))!;
      expect(Math.round(today.width)).toBeLessThanOrEqual(560);
      expect(today.right, "Today beside the dock, not under it").toBeLessThanOrEqual(panel.left + 0.5);
    });

    test("the drawer at 1024 x 700 over a Session's ready screen: Start stays in view and pressable", async ({ page }) => {
      await openShot(page, "session-ready", { width: 1024, height: 700 }, theme);
      await settleAnimations(page);
      // The Session's own entrance (a scale on the page) is over first.
      await page.waitForTimeout(1000);
      const hero = await rect(page, ".session-practice-hero");
      await page.locator('[data-testid="session-coach-ask"]').click();
      await expect(page.locator(".ask-panel")).toBeVisible();
      await settleAnimations(page);
      await page.waitForTimeout(260);
      // A question with no model on: the honest line, no answer made up.
      await page.locator(".ask-input").fill("is 90 slow for this tune?");
      await page.keyboard.press("Enter");
      await expect(page.locator(".ask-turn-app")).toBeVisible();
      await shot(page, `${theme}-session-ready-1024x700`);
      await panelHolds(page, 380, "Session ready 1024");
      expect(await position(page, ".ask-panel"), "a drawer in a Session").toBe("absolute");
      const panel = (await rect(page, ".ask-panel"))!;
      // The controls: never under it, and on screen without scrolling.
      for (const sel of ['[data-testid="session-exit"]', ".session-bar-left", '[data-testid="session-big"]']) {
        const r = (await rect(page, sel))!;
        expect(r, sel).not.toBeNull();
        expect(r.right, `${sel} left of the drawer`).toBeLessThanOrEqual(panel.left + 0.5);
        expect(r.bottom, `${sel} on screen`).toBeLessThanOrEqual(700 + 0.5);
      }
      expect(await notHitTestable(page, '[data-testid="session-big"], [data-testid="session-exit"]')).toEqual([]);
      // The neck is covered, not re-framed.
      // Measured open, then closed: the Session's own entrance (a scale on
      // the page) can still be running when the scene says it is ready.
      const open = (await rect(page, ".session-practice-hero"))!;
      await page.locator(".ask-close").click();
      await expect(page.locator(".ask-panel")).toHaveCount(0);
      await page.waitForTimeout(200);
      const closed = (await rect(page, ".session-practice-hero"))!;
      expect([open.width, open.height], "the picture keeps its frame").toEqual([closed.width, closed.height]);
      expect(hero, "the picture was there before").not.toBeNull();
      await page.locator('[data-testid="session-coach-ask"]').click();
      await expect(page.locator(".ask-panel")).toBeVisible();
      // Start take closes it.
      await page.locator('[data-testid="session-big"]').click();
      await expect(page.locator(".ask-panel")).toHaveCount(0);
    });

    for (const size of [
      { width: 1280, height: 800 },
      { width: 1024, height: 700 },
    ]) {
      test(`the drawer over a result at ${size.width}: the text column stays whole, the button pressable`, async ({ page }) => {
        await openShot(page, "session-result", size, theme);
        await settleAnimations(page);
        await page.locator('[data-testid="session-coach-ask"]').click();
        await expect(page.locator(".ask-panel")).toBeVisible();
        await settleAnimations(page);
        await page.waitForTimeout(260);
        await shot(page, `${theme}-session-result-${size.width}x${size.height}`);
        const panel = (await rect(page, ".ask-panel"))!;
        const col = (await rect(page, ".session-between > .session-col:first-child"))!;
        expect(col.right, `${size.width}: the result's text left of the drawer`).toBeLessThanOrEqual(panel.left + 0.5);
        const exit = (await rect(page, '[data-testid="session-exit"]'))!;
        expect(exit.right, "Exit left of the drawer").toBeLessThanOrEqual(panel.left + 0.5);
        expect(await notHitTestable(page, '[data-testid="session-big"], [data-testid="session-exit"]')).toEqual([]);
      });
    }

    test("Escape closes it and gives focus back", async ({ page }) => {
      await openShot(page, "metronome", { width: 1280, height: 800 }, theme);
      await openFromRail(page);
      await expect(page.locator(".ask-input")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.locator(".ask-panel")).toHaveCount(0);
    });
  });
}

test.describe("Ask on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  for (const theme of THEMES) {
    test(`the header's Ask button opens the sheet, ${theme}`, async ({ page }) => {
      const size = { width: 390, height: 844 };
      await openShot(page, "phone-today-returning", size, theme);
      const button = page.locator('[data-testid="header-ask"]');
      await expect(button).toBeVisible();
      const b = (await button.boundingBox())!;
      expect(b.height, "a 44 px control").toBeGreaterThanOrEqual(44);
      await expect(button).toContainText("Ask");
      await button.click();
      const sheet = page.locator(".sheet--ask");
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAttribute("role", "dialog");
      await page.waitForTimeout(400);
      const s = (await sheet.boundingBox())!;
      expect(s.height / size.height, "92% high").toBeGreaterThan(0.88);
      expect(s.height / size.height).toBeLessThan(0.95);
      // Head: the selector, then the context line; no model, the honest sentence.
      await expect(page.locator(".ask-sheet .ask-head .coach-model-button")).toBeVisible();
      await expect(page.locator(".ask-sheet .ask-empty")).toBeVisible();
      await expect(page.locator(".ask-sheet .ask-footer")).toBeVisible();
      for (const sel of [".ask-input", ".ask-send", ".sheet-close"]) {
        const r = (await page.locator(`.sheet--ask ${sel}`).boundingBox())!;
        expect(r.height, `${sel}: 44 px`).toBeGreaterThanOrEqual(44);
      }
      await noSidewaysScroll(page, "phone sheet");
      await shot(page, `${theme}-phone-sheet`);

      // The keyboard up: the context line and the footer make room.
      await page.locator(".sheet--ask .ask-input").focus();
      await expect(page.locator(".ask-sheet .ask-context")).toBeHidden();
      await expect(page.locator(".ask-sheet .ask-footer")).toBeHidden();
      await page.locator(".sheet--ask .ask-input").fill("why is 90 slow?");
      await page.keyboard.press("Enter");
      await expect(page.locator(".ask-sheet .ask-turn-app")).toBeVisible();
      await shot(page, `${theme}-phone-sheet-typing`);

      // Closed by its close button.
      await page.locator(".sheet--ask .sheet-close").click();
      await expect(sheet).toHaveCount(0);
    });
  }

  test("in landscape it is the 360 px drawer", async ({ page }) => {
    await openShot(page, "phone-today-returning", { width: 844, height: 390 });
    await page.locator('[data-testid="header-ask"]').click();
    const sheet = page.locator(".sheet--ask");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400);
    const s = (await sheet.boundingBox())!;
    expect(Math.round(s.width)).toBe(360);
    expect(Math.round(s.x + s.width)).toBe(844);
    await shot(page, "ember-phone-landscape");
  });

  test("a phone Session's bar has the Ask pill; the sheet does not leave the Session", async ({ page }) => {
    await openShot(page, "phone-session-ready", { width: 390, height: 844 });
    await page.locator('[data-testid="session-coach-ask"]').click();
    await expect(page.locator(".sheet--ask")).toBeVisible();
    await page.locator(".sheet-scrim").click({ position: { x: 10, y: 10 } });
    await expect(page.locator(".sheet--ask")).toHaveCount(0);
    await expect(page.locator('[data-testid="session"]')).toBeVisible();
  });
});
