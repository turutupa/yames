import { test, expect, type Page } from "@playwright/test";
import { openShot, insideViewport, noSidewaysScroll, settleAnimations, notHitTestable } from "./fits";

/**
 * The coach on Jam (leg c5a1): the line under Jam's stage after a stop, and
 * "Pin this shape" on a grip Ask drew, with its receipt and Undo. Ember at 1440
 * and 1024, and once in German. Pictures only when `YAMES_SHOT_DIR` names a
 * folder; a test never writes to a fixed path.
 */
test.slow();

const SHOTS_DIR = process.env.YAMES_SHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
}

async function stop(page: Page) {
  await expect(page.locator(".transport-play.playing")).toHaveCount(1);
  await page.locator(".transport-play").first().click();
  await expect(page.locator(".transport-play.playing")).toHaveCount(0);
}

test.describe("the line under Jam's stage after a stop", () => {
  for (const size of [
    { name: "1440", width: 1440, height: 900 },
    { name: "1024", width: 1024, height: 768 },
  ]) {
    test(`says what was heard beside the chart, under the stage, at ${size.name}`, async ({ page }) => {
      await openShot(page, "jam-heard", size);
      // Nothing while the band plays.
      await expect(page.getByTestId("tool-coach-jam-line")).toHaveCount(0);
      await stop(page);
      const line = page.getByTestId("tool-coach-jam-line");
      await expect(line).toBeVisible();
      await expect(line).toContainText("A7, D7, Am7");
      await expect(line).toContainText("The chart has");
      await expect(line).not.toContainText(/wrong|missed|mistake/i);
      await insideViewport(page, "[data-testid=tool-coach-jam-line]", `the jam's line at ${size.name}`, size);
      const box = await line.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const row = el.closest(".tool-coach")!.getBoundingClientRect();
        return { left: r.left, right: r.right, rowLeft: row.left, rowRight: row.right, overflow: el.scrollWidth - el.clientWidth };
      });
      expect(box.left, "the line starts inside the coach's row").toBeGreaterThanOrEqual(box.rowLeft - 0.5);
      expect(box.right, "the line ends inside the coach's row").toBeLessThanOrEqual(box.rowRight + 0.5);
      expect(box.overflow, "the line is not cut off").toBeLessThanOrEqual(1);
      await noSidewaysScroll(page, `the jam's line at ${size.name}`);
      await settleAnimations(page);
      if (size.name === "1440") await shot(page, "ember-jam-line-1440");
      // Gone again when the next play starts.
      await page.locator(".transport-play").first().click();
      await expect(page.getByTestId("tool-coach-jam-line")).toHaveCount(0);
    });
  }
});

async function openAsk(page: Page) {
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
}

async function send(page: Page, text: string) {
  await page.locator(".ask-panel [data-testid=ask-input]").fill(text);
  await page.locator(".ask-panel [data-testid=ask-send]").click();
}

/** "show a7" in each language's own command words (`src/coach/ask/commands/<lng>.json`). */
const SHOW_A7: Record<string, string> = { en: "show a7", de: "zeig a7" };

for (const lng of ["en", "de"]) {
  test(`"Pin this shape" on Jam: one press, its receipt and Undo (${lng})`, async ({ page }) => {
    await openShot(page, "jam", { width: 1440, height: 900 }, "ember", { lng });
    await stop(page);
    await expect(page.locator(".jam-pinned")).toHaveCount(0);
    await openAsk(page);
    await send(page, SHOW_A7[lng]);
    const receipt = page.locator(".ask-panel [data-testid=ask-receipt]").last();
    const pin = receipt.locator("[data-action=pinShape]");
    await expect(pin).toBeVisible();
    // Drawn, not pinned: nothing changes until the press.
    await expect(page.locator(".jam-pinned")).toHaveCount(0);
    expect(await notHitTestable(page, ".ask-panel [data-action=pinShape]")).toEqual([]);
    await pin.click();
    const said = receipt.getByTestId("ask-pin-receipt");
    await expect(said).toBeVisible();
    await expect(said).toHaveAttribute("data-state", "live");
    if (lng === "en") await expect(said).toContainText("Pinned A7, shape 1, to the Jam screen.");
    await expect(page.locator(".jam-pinned")).toHaveCount(1);
    await expect(receipt.locator("[data-action=pinShape]")).toHaveCount(0);
    await settleAnimations(page);
    await noSidewaysScroll(page, `the pin's receipt (${lng})`);
    await shot(page, `ember-jam-pin-receipt-${lng}`);
    await receipt.getByTestId("ask-pin-undo").click();
    await expect(said).toHaveAttribute("data-state", "done");
    await expect(page.locator(".jam-pinned")).toHaveCount(0);
  });
}
