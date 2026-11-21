import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openShot, settleAnimations, notHitTestable, noSidewaysScroll, MOBILE_URL } from "./fits";

/**
 * A typed command in Ask (leg t1b2b; mock 16, items 1 and 3): the player types
 * "open paths" in the box and sends it; the router makes it a call, the runner
 * goes, and the thread shows the player's words and the receipt with its way
 * back. Then a never-list request, typed: "that one is yours". At 1440 in
 * English, and on a phone in Japanese (a language written without spaces).
 *
 * The words typed come from each language's own lines
 * (`src/coach/ask/commands/lines/<lng>.json`), the same ones its table test
 * proves. Pictures go to `$YAMES_ASK_SHOTS`.
 */

const SHOTS = process.env.YAMES_ASK_SHOTS;

type Lines = { commands: Array<{ id: string; text: string }>; nearMissYours: Array<[string, string]> };

function lines(lng: string): Lines {
  return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src/coach/ask/commands/lines", `${lng}.json`), "utf8")) as Lines;
}

function typed(lng: string, id: string): string {
  const line = lines(lng).commands.find((c) => c.id === id);
  if (!line) throw new Error(`no ${id} line for ${lng}`);
  return line.text;
}

function yours(lng: string, item: string): string {
  const line = lines(lng).nearMissYours.find(([, i]) => i === item);
  if (!line) throw new Error(`no ${item} near-miss for ${lng}`);
  return line[0];
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function send(page: Page, panel: string, text: string) {
  const box = page.locator(`${panel} [data-testid=ask-input]`);
  await box.fill(text);
  await page.locator(`${panel} [data-testid=ask-send]`).click();
}

/** Everything of the thread inside the panel, nothing solid, nothing sideways. */
async function threadHolds(page: Page, panel: string, where: string, minTarget = 0) {
  const box = (await page.locator(panel).boundingBox())!;
  const items = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} :is(.ask-turn, .ask-tool, .ask-tool-btn, .ask-tool-quiet, .ask-receipt-text)`)].map((e) => {
        const r = e.getBoundingClientRect();
        return { cls: e.className, left: r.left, right: r.right, height: r.height, overflow: e.scrollWidth - e.clientWidth };
      }),
    panel,
  );
  for (const b of items) {
    expect(b.left, `${where}: ${b.cls} left`).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(b.right, `${where}: ${b.cls} right`).toBeLessThanOrEqual(box.x + box.width + 0.5);
    expect(b.overflow, `${where}: ${b.cls} cut off`).toBeLessThanOrEqual(1);
  }
  if (minTarget > 0) {
    for (const b of items.filter((x) => /ask-tool-btn|ask-tool-quiet/.test(x.cls))) {
      expect(b.height, `${where}: ${b.cls} a thumb's target`).toBeGreaterThanOrEqual(minTarget);
    }
  }
  expect(await page.locator(`${panel} .btn-primary`).count(), `${where}: a solid button`).toBe(0);
  expect(await notHitTestable(page, `${panel} .ask-tool-btn`), where).toEqual([]);
  await noSidewaysScroll(page, where);
}

test("typed at 1440: a command and its receipt, then a never-list request", async ({ page }) => {
  await openShot(page, "today-returning", { width: 1440, height: 900 }, "ember");
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);

  const command = typed("en", "openPaths");
  await send(page, ".ask-panel", command);
  const receipt = page.locator(".ask-panel [data-testid=ask-receipt]");
  await expect(receipt).toContainText("Opened Paths");
  await expect(receipt.locator("[data-testid=ask-undo]")).toHaveText("Back to Today");
  await expect(page.locator(".ask-panel .ask-turn-user").first()).toHaveText(command);
  await expect(page.locator("[data-testid=ask-input]")).toHaveValue("");

  await send(page, ".ask-panel", yours("en", "input"));
  await expect(page.locator(".ask-panel [data-testid=ask-yours]")).toBeVisible();
  await page.locator(".ask-panel .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await threadHolds(page, ".ask-panel", "typed 1440");
  await shot(page, "ember-typed-1440");
});

test.describe("typed on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  test("in Japanese: a command and its receipt, then a never-list request; every target 44 px", async ({ page }) => {
    await openShot(page, "phone-today-returning", { width: 390, height: 844 }, "ember", { lng: "ja" });
    await page.locator('[data-testid="header-ask"]').click();
    await expect(page.locator(".sheet--ask")).toBeVisible();
    await page.waitForTimeout(400);

    const command = typed("ja", "openPaths");
    await send(page, ".ask-sheet", command);
    await expect(page.locator(".ask-sheet [data-testid=ask-receipt]")).toBeVisible();
    await expect(page.locator(".ask-sheet .ask-turn-user").first()).toHaveText(command);

    await send(page, ".ask-sheet", yours("ja", "recording"));
    await expect(page.locator(".ask-sheet [data-testid=ask-yours]")).toBeVisible();
    await page.locator(".ask-sheet .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await threadHolds(page, ".ask-sheet", "typed phone ja", 44);
    await shot(page, "ember-typed-phone-ja");
  });
});
