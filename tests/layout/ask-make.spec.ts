import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, notHitTestable, noSidewaysScroll, MOBILE_URL } from "./fits";

/**
 * `make_exercise` in Ask (legs t2c, t2d; mock 17): the preview with its
 * proposal, the receipt with Undo, and the notice that the Undo ended once the
 * player left for Paths. At 1440 with the dock (Manuscript), on a phone's sheet
 * (Ember), and in German at 1024 (the long-text locale).
 *
 * A typed line reaches the tool as a player types it (English); the German
 * scene asks the panel's own module for the call, so it does not depend on the
 * German recipe words. Nothing reaches the player's real store: the shot
 * harness's settings store is the mock's.
 *
 * Every scene checks: everything inside the panel, nothing sideways, no solid
 * button, the targets pressable; on a phone every target at least 44 px.
 * Pictures only when `$YAMES_SHOT_DIR` names a folder.
 */

const SHOTS = process.env.YAMES_SHOT_DIR;
const MOCK_17 = "a minor pentatonic eighths 5th fret";

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Everything of the tools inside `root` (the dock or the sheet), nothing solid, nothing sideways. */
async function makeHolds(page: Page, root: string, where: string, minTarget = 0) {
  const panel = (await page.locator(root).boundingBox())!;
  const boxes = await page.evaluate(
    (sel) =>
      [
        ...document.querySelectorAll(
          `${sel} :is(.ask-tool, .ask-chip, .ask-tool-btn, .ask-tool-quiet, .ask-receipt-text, .ask-proposal-line, .ask-tool-note, [data-testid=ask-make-preview], [data-testid=ask-make-neck], [data-testid=ask-make-graded])`,
        ),
      ].map((e) => {
        const r = e.getBoundingClientRect();
        return { cls: String(e.className) || e.getAttribute("data-testid") || e.tagName, left: r.left, right: r.right, height: r.height, overflow: e.scrollWidth - e.clientWidth };
      }),
    root,
  );
  expect(boxes.length, `${where}: nothing drawn`).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.left, `${where}: ${b.cls} left`).toBeGreaterThanOrEqual(panel.x - 0.5);
    expect(b.right, `${where}: ${b.cls} right`).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    expect(b.overflow, `${where}: ${b.cls} cut off`).toBeLessThanOrEqual(1);
  }
  if (minTarget > 0) {
    for (const b of boxes.filter((x) => /ask-chip|ask-tool-btn|ask-tool-quiet/.test(x.cls))) {
      expect(b.height, `${where}: ${b.cls} a thumb's target`).toBeGreaterThanOrEqual(minTarget);
    }
  }
  expect(await page.locator(`${root} .btn-primary`).count(), `${where}: a solid button`).toBe(0);
  expect(await notHitTestable(page, `${root} .ask-tool-btn, ${root} .ask-chip`), where).toEqual([]);
  await noSidewaysScroll(page, where);
}

async function typeLine(page: Page, root: string, text: string) {
  await page.locator(`${root} [data-testid=ask-input]`).fill(text);
  await page.locator(`${root} [data-testid=ask-send]`).click();
}

async function toBottom(page: Page, root: string) {
  await page.locator(`${root} .ask-thread`).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(120);
}

/** The preview and its proposal, then Add it: the receipt with Undo, then Open Paths: the Undo ended. */
async function previewReceiptEnded(page: Page, root: string, where: string, english: boolean, minTarget = 0) {
  await expect(page.locator(`${root} [data-testid=ask-make-preview]`).last()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`${root} [data-testid=ask-make-neck]`).last()).toBeVisible();
  await expect(page.locator(`${root} [data-testid=ask-make-graded]`).last()).toBeVisible();
  const go = page.locator(`${root} [data-testid=ask-proposal-go]`).last();
  await expect(go).toBeVisible();
  if (english) await expect(go).toHaveText("Add it");
  await toBottom(page, root);
  await makeHolds(page, root, `${where} preview`, minTarget);
  await shot(page, `make-preview-${where}`);

  await go.click();
  const receipt = page.locator(`${root} [data-testid=ask-receipt]`).last();
  await expect(receipt.locator("[data-testid=ask-undo]")).toBeVisible({ timeout: 10_000 });
  if (english) await expect(receipt).toContainText("to My exercises.");
  await toBottom(page, root);
  await makeHolds(page, root, `${where} receipt`, minTarget);
  await shot(page, `make-receipt-${where}`);

  // "Open Paths": the move retires the add's Undo, and the receipt says what does its job now.
  await receipt.locator("[data-testid=ask-receipt-next] .ask-chip").first().click();
  await expect(receipt.locator("[data-testid=ask-undo]")).toHaveCount(0);
  if (english) await expect(receipt).toContainText("The Undo ended when you left the screen this was added on.");
  else await expect(receipt.locator(":is([data-testid=ask-undone], [data-testid=ask-undo-note])")).toBeVisible();
  await settleAnimations(page);
  await toBottom(page, root);
  await makeHolds(page, root, `${where} ended`, minTarget);
  await shot(page, `make-ended-${where}`);
}

test("at 1440 with the dock (Manuscript): a typed recipe's preview, the receipt with Undo, the Undo ended on Paths", async ({ page }) => {
  await openShot(page, "today-returning", { width: 1440, height: 900 }, "manuscript");
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
  await typeLine(page, ".ask-panel", MOCK_17);
  await previewReceiptEnded(page, ".ask-panel", "1440", true);
});

test("in German at 1024 (Ember): the same three, long words inside the panel", async ({ page }) => {
  await openShot(page, "today-returning", { width: 1024, height: 760 }, "ember", { lng: "de" });
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
  await page.evaluate(async () => {
    const mod = await import("/src/containers/coach/askTools.ts");
    void mod.runAskCall({ tool: "make_exercise", args: { root: "A", scale: "minorPentatonic", subdivision: 2, position: 5 } }, "");
  });
  await previewReceiptEnded(page, ".ask-panel", "de-1024", false);
});

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  test("the sheet (Ember): the preview, the receipt with Undo, the Undo ended; every target 44 px", async ({ page }) => {
    await openShot(page, "phone-today-returning", { width: 390, height: 844 }, "ember");
    await page.locator('[data-testid="header-ask"]').click();
    await expect(page.locator(".sheet--ask")).toBeVisible();
    await page.waitForTimeout(400);
    await typeLine(page, ".ask-sheet", MOCK_17);
    await previewReceiptEnded(page, ".ask-sheet", "phone", true, 44);
  });
});
