import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, notHitTestable, noSidewaysScroll, MOBILE_URL } from "./fits";

/**
 * A press in the phone's Ask sheet while the keyboard is up (leg t2f; the
 * phone scene of leg t2d's `ask-make.spec.ts`, which was a `fixme`).
 *
 * After a typed line the box keeps the focus, so the sheet hides its context
 * line and footer (`data-typing`). A press on the thread used to blur the box
 * on `mousedown`, which brought the context line back above the thread and
 * moved the button from under the finger before `mouseup`: the click landed
 * on the turn around it and nothing happened ("Add it", any chip, Undo).
 *
 * Here: `make_exercise`'s "Add it" pressed with a finger after the typed
 * recipe (the receipt with Undo, then the Undo ended on Paths), and a chip
 * ("Go to Paths") pressed while the box has the focus. After the press the
 * keyboard goes away, as it did before. Pictures only when `$YAMES_SHOT_DIR`
 * names a folder.
 */

const SHOTS = process.env.YAMES_SHOT_DIR;
const MOCK_17 = "a minor pentatonic eighths 5th fret";
const ROOT = ".ask-sheet";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => console.log(`pageerror: ${e.message}\n${e.stack ?? ""}`));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`console.error: ${m.text()}`);
  });
});

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Everything of the tools inside the sheet, nothing solid, nothing sideways, every target 44 px. */
async function makeHolds(page: Page, where: string) {
  const panel = (await page.locator(ROOT).boundingBox())!;
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
    ROOT,
  );
  expect(boxes.length, `${where}: nothing drawn`).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.left, `${where}: ${b.cls} left`).toBeGreaterThanOrEqual(panel.x - 0.5);
    expect(b.right, `${where}: ${b.cls} right`).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    expect(b.overflow, `${where}: ${b.cls} cut off`).toBeLessThanOrEqual(1);
  }
  for (const b of boxes.filter((x) => /ask-chip|ask-tool-btn|ask-tool-quiet/.test(x.cls))) {
    expect(b.height, `${where}: ${b.cls} a thumb's target`).toBeGreaterThanOrEqual(44);
  }
  expect(await page.locator(`${ROOT} .btn-primary`).count(), `${where}: a solid button`).toBe(0);
  expect(await notHitTestable(page, `${ROOT} .ask-tool-btn, ${ROOT} .ask-chip`), where).toEqual([]);
  await noSidewaysScroll(page, where);
}

async function toBottom(page: Page) {
  await page.locator(`${ROOT} .ask-thread`).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(120);
}

/** The keyboard is up: the box has the focus and the sheet made room for it. */
async function boxHasFocus(page: Page): Promise<boolean> {
  return page.evaluate(
    (sel) => document.activeElement === document.querySelector(`${sel} [data-testid=ask-input]`) && document.querySelector(sel)!.hasAttribute("data-typing"),
    ROOT,
  );
}

async function openSheet(page: Page) {
  await openShot(page, "phone-today-returning", { width: 390, height: 844 }, "ember");
  await page.locator('[data-testid="header-ask"]').click();
  await expect(page.locator(".sheet--ask")).toBeVisible();
  await page.waitForTimeout(400);
}

test.describe("on a phone, the keyboard up", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  test("the sheet (Ember): a typed recipe, Add it, the receipt with Undo, the Undo ended; every target 44 px", async ({ page }) => {
    await openSheet(page);
    await page.locator(`${ROOT} [data-testid=ask-input]`).fill(MOCK_17);
    await page.locator(`${ROOT} [data-testid=ask-send]`).click();
    await expect(page.locator(`${ROOT} [data-testid=ask-make-preview]`).last()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`${ROOT} [data-testid=ask-make-neck]`).last()).toBeVisible();
    await expect(page.locator(`${ROOT} [data-testid=ask-make-graded]`).last()).toBeVisible();
    const go = page.locator(`${ROOT} [data-testid=ask-proposal-go]`).last();
    await expect(go).toHaveText("Add it");
    await toBottom(page);
    await makeHolds(page, "phone preview");
    await shot(page, "make-preview-phone");

    await settleAnimations(page);
    await go.scrollIntoViewIfNeeded();
    // The case the defect needs: the box still has the focus from the typed line.
    expect(await boxHasFocus(page), "the box keeps the focus after a send").toBe(true);
    await go.tap();
    const addTappedAt = Date.now();
    // The make receipt by its place: "Open Paths" below adds a receipt of its own (with its own Undo).
    const receipts = page.locator(`${ROOT} [data-testid=ask-receipt]`);
    await expect(receipts.first()).toBeVisible({ timeout: 10_000 });
    const receipt = receipts.nth((await receipts.count()) - 1);
    await expect(receipt.locator("[data-testid=ask-undo]")).toBeVisible({ timeout: 10_000 });
    await expect(receipt).toContainText("to My exercises.");
    // The press landed, then the keyboard went away.
    await expect.poll(() => boxHasFocus(page)).toBe(false);
    await settleAnimations(page);
    await toBottom(page);
    await makeHolds(page, "phone receipt");
    await shot(page, "make-receipt-phone");

    // "Open Paths": the move retires the add's Undo, and the receipt says what does its job now.
    // The chip sits about where "Add it" was. A second tap there within Chromium's double-tap window
    // (measured by leg t2g: 350 ms gives `detail` 2, 450 ms gives 1) is the second half of a double
    // tap, which `onePress` ignores on purpose (a double tap on "Add it" must not also open Paths).
    // A finger's next press comes later: wait the window out, then press the chip by what it is.
    await page.waitForTimeout(Math.max(0, 700 - (Date.now() - addTappedAt)));
    await receipt.locator("[data-testid=ask-receipt-next] .ask-chip", { hasText: "Open Paths" }).tap();
    await expect(receipt).toBeVisible();
    await expect(receipt.locator("[data-testid=ask-undo]")).toHaveCount(0);
    await expect(receipt).toContainText("The Undo ended when you left the screen this was added on.");
    // Paths is on screen: the receipt no longer offers to open it (leg t2g; t2d's open point 5).
    await expect(receipt.locator("[data-testid=ask-receipt-next]")).toHaveCount(0);
    await settleAnimations(page);
    await toBottom(page);
    await makeHolds(page, "phone ended");
    await shot(page, "make-ended-phone");
  });

  test("a chip pressed while the box has the focus is pressed (Go to Paths)", async ({ page }) => {
    await openSheet(page);
    await page.locator(`${ROOT} [data-testid=ask-input]`).tap();
    await expect.poll(() => boxHasFocus(page)).toBe(true);
    await settleAnimations(page);
    const chip = page.locator(`${ROOT} .ask-chip`, { hasText: "Go to Paths" });
    await chip.tap();
    await expect(page.locator(`${ROOT} [data-testid=ask-receipt]`)).toContainText("Opened Paths", { timeout: 10_000 });
    await expect.poll(() => boxHasFocus(page)).toBe(false);
    await shot(page, "chip-receipt-phone");
  });
});
