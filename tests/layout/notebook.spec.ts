import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, noSidewaysScroll, notHitTestable, MOBILE_URL } from "./fits";

/**
 * The Notebook, Ask's second tab (leg c4a2; DESIGN 6.7, mocks 10 and 17).
 *
 * Two noticed lines and a goal at 1440 with the dock (mock 10), the empty
 * state, a Leave out with its Undo, on a phone sheet, in Ember and
 * Manuscript, and once in German. Pictures go to `$YAMES_SHOT_DIR` when set.
 */

const SHOTS = process.env.YAMES_SHOT_DIR;
const THEMES = ["ember", "manuscript"] as const;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/notebook-${name}.png` });
}

async function openNotebook(page: Page) {
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
  await page.waitForTimeout(260);
  await page.locator('[data-testid="ask-tab-notebook"]').click();
  await expect(page.locator('[data-testid="notebook"]')).toBeVisible();
}

/** Every part of the Notebook inside the panel, nothing sideways, nothing covered. */
async function holds(page: Page, where: string) {
  const panel = (await page.locator(".ask-panel").boundingBox())!;
  for (const sel of [".ask-tabs", '[data-testid="notebook"]', ".ask-footer"]) {
    const r = (await page.locator(`.ask-panel ${sel}`).first().boundingBox())!;
    expect(r, `${where}: ${sel}`).not.toBeNull();
    expect(r.x, `${where}: ${sel} left`).toBeGreaterThanOrEqual(panel.x - 0.5);
    expect(r.x + r.width, `${where}: ${sel} right`).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
  }
  // Each line's text and its Leave out side by side, inside its row.
  for (const item of await page.locator(".nb-item").all()) {
    const row = (await item.boundingBox())!;
    const button = (await item.locator("button").boundingBox())!;
    expect(button.x + button.width, `${where}: a row's button inside it`).toBeLessThanOrEqual(row.x + row.width + 0.5);
    expect(button.y, `${where}: a row's button inside it`).toBeGreaterThanOrEqual(row.y - 0.5);
  }
  expect(await notHitTestable(page, ".ask-tab, .nb-leave, .nb-edit"), where).toEqual([]);
  await noSidewaysScroll(page, where);
  expect(await page.locator(".ask-panel .btn-primary").count(), `${where}: solid`).toBe(0);
}

for (const theme of THEMES) {
  test.describe(`The Notebook, ${theme}`, () => {
    test("two noticed lines and a goal at 1440, with the dock (mock 10)", async ({ page }) => {
      await openShot(page, "notebook", { width: 1440, height: 900 }, theme);
      await openNotebook(page);
      await expect(page.locator(".nb-item[data-line]")).toHaveCount(2);
      await expect(page.locator('[data-testid="nb-goal"]')).toContainText("A clean pentatonic solo at 120");
      await shot(page, `${theme}-1440`);
      await holds(page, `${theme} 1440`);
    });

    test("Leave out: the line goes, the Undo is offered, and the Undo brings it back", async ({ page }) => {
      await openShot(page, "notebook", { width: 1440, height: 900 }, theme);
      await openNotebook(page);
      await page.locator('[data-testid="nb-leave-out"]').first().click();
      await expect(page.locator(".nb-item[data-line]")).toHaveCount(1);
      await expect(page.locator('[data-testid="nb-undo"]')).toBeVisible();
      await shot(page, `${theme}-left-out`);
      await holds(page, `${theme} left out`);
      await page.locator('[data-testid="nb-undo"]').click();
      await expect(page.locator(".nb-item[data-line]")).toHaveCount(2);
    });

    test("the empty state, and the goal question a week in", async ({ page }) => {
      await openShot(page, "today-returning", { width: 1440, height: 900 }, theme);
      await openNotebook(page);
      await expect(page.locator('[data-testid="nb-nothing-yet"]')).toBeVisible();
      await expect(page.locator('[data-testid="nb-goal-offer"]')).toBeVisible();
      await shot(page, `${theme}-empty`);
      await holds(page, `${theme} empty`);
    });
  });
}

test("in German, at 1160, the long words stay inside", async ({ page }) => {
  await openShot(page, "notebook", { width: 1160, height: 800 }, "ember", { lng: "de" });
  await openNotebook(page);
  await shot(page, "de-1160");
  await holds(page, "de 1160");
});

test.describe("The Notebook on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  for (const theme of THEMES) {
    test(`the sheet's "Ask | Notebook", every control 44 px, ${theme}`, async ({ page }) => {
      await openShot(page, "phone-notebook", { width: 360, height: 800 }, theme);
      await page.locator('[data-testid="header-ask"]').click();
      await expect(page.locator(".sheet--ask")).toBeVisible();
      await page.waitForTimeout(400);
      await page.locator('[data-testid="ask-tab-notebook"]').click();
      await expect(page.locator('[data-testid="notebook"]')).toBeVisible();
      for (const sel of [".ask-tab", ".nb-leave", ".nb-edit"]) {
        for (const el of await page.locator(`.sheet--ask ${sel}`).all()) {
          const r = (await el.boundingBox())!;
          expect(r.height, `${sel}: 44 px`).toBeGreaterThanOrEqual(44);
        }
      }
      await expect(page.locator(".sheet--ask .nb-leave-label").first()).toBeVisible();
      await noSidewaysScroll(page, "phone notebook");
      await shot(page, `${theme}-phone`);
    });
  }
});
