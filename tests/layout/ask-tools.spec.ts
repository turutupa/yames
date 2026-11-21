import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, notHitTestable, noSidewaysScroll, MOBILE_URL } from "./fits";

/**
 * The coach's tools in Ask (leg t1b1; DESIGN 13, 3.6; mock 16): the chips in
 * the empty state, a receipt with its way back, the receipt undone, a
 * proposal, "Which one?" and "that one is yours", at 1440, 1024 and on a
 * phone, in Ember, Neon and Manuscript, and once in German.
 *
 * The chips are pressed as a person presses them, through the real host;
 * "Which one?" and "that one is yours" have no chip yet (typed commands are
 * leg t1b2), so the scene asks the panel's own module for them.
 *
 * Every scene checks: everything inside the panel, nothing sideways, no solid
 * button, the targets pressable, chips and buttons wrap inside the panel; on
 * a phone every target at least 44 px. Pictures go to `$YAMES_ASK_SHOTS`.
 */

const SHOTS = process.env.YAMES_ASK_SHOTS;
const THEMES = ["ember", "neon", "manuscript"] as const;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function openFromRail(page: Page) {
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
  await page.waitForTimeout(260);
}

/** Everything of the tools inside the panel, nothing solid, nothing sideways. */
async function toolsHold(page: Page, where: string, minTarget = 0) {
  const panel = (await page.locator(".ask-panel").boundingBox())!;
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll(".ask-panel :is(.ask-tool, .ask-chip, .ask-tool-btn, .ask-tool-quiet, .ask-receipt-text, .ask-proposal-line)")].map((e) => {
      const r = e.getBoundingClientRect();
      return { cls: e.className, left: r.left, right: r.right, height: r.height, overflow: e.scrollWidth - e.clientWidth };
    }),
  );
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
  expect(await page.locator(".ask-panel .btn-primary").count(), `${where}: a solid button`).toBe(0);
  expect(await notHitTestable(page, ".ask-panel .ask-tool-btn, .ask-panel .ask-chip"), where).toEqual([]);
  await noSidewaysScroll(page, where);
}

/** "Which one?" and "that one is yours", asked of the panel's own module (no chip leads there yet). */
async function askWhichAndYours(page: Page, call: { tool: string; args: Record<string, string | number> }) {
  await page.evaluate(async (c) => {
    const mod = await import("/src/containers/coach/askTools.ts");
    mod.runAskCall(c, "open the picking one");
    mod.askYours("input", "and switch the mic on for me");
  }, call);
  await expect(page.locator(".ask-panel [data-testid=ask-yours]")).toBeVisible();
}

for (const theme of THEMES) {
  test.describe(`Ask's tools, ${theme}`, () => {
    for (const width of [1440, 1024]) {
      test(`Today at ${width}: the chips, a receipt with its way back, undone`, async ({ page }) => {
        await openShot(page, "today-returning", { width, height: 900 }, theme);
        await openFromRail(page);
        const chips = page.locator(".ask-panel .ask-empty [data-testid=ask-tool-chips] .ask-chip");
        await expect(chips.first()).toBeVisible();
        await toolsHold(page, `chips ${width}`);
        await shot(page, `${theme}-tools-chips-${width}`);

        await page.locator(".ask-panel .ask-chip", { hasText: "Go to Paths" }).click();
        const receipt = page.locator(".ask-panel [data-testid=ask-receipt]");
        await expect(receipt).toContainText("Opened Paths");
        await expect(receipt.locator("[data-testid=ask-undo]")).toHaveText("Back to Today");
        await toolsHold(page, `receipt ${width}`);
        await shot(page, `${theme}-tools-receipt-${width}`);

        await receipt.locator("[data-testid=ask-undo]").click();
        await expect(receipt.locator("[data-testid=ask-undone]")).toContainText("Undone.");
        await expect(receipt.locator("[data-testid=ask-undo]")).toHaveCount(0);
        await toolsHold(page, `undone ${width}`);
        await shot(page, `${theme}-tools-undone-${width}`);

        await askWhichAndYours(page, { tool: "open_path", args: { path: "picking" } });
        await expect(page.locator(".ask-panel [data-testid=ask-refusal]").first()).toContainText("Which one?");
        await expect(page.locator(".ask-panel [data-testid=ask-choices] .ask-chip").first()).toBeVisible();
        await page.locator(".ask-panel .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
        await toolsHold(page, `which and yours ${width}`);
        await shot(page, `${theme}-tools-which-yours-${width}`);
      });

      test(`the Metronome at ${width}: a proposal`, async ({ page }) => {
        await openShot(page, "metronome", { width, height: 900 }, theme);
        await openFromRail(page);
        await page.locator(".ask-panel .ask-chip", { hasText: "Slower" }).click();
        const proposal = page.locator(".ask-panel [data-testid=ask-proposal]");
        await expect(proposal).toContainText("Tempo");
        await expect(proposal.locator("[data-testid=ask-proposal-go]")).toHaveClass(/btn-tonal/);
        await expect(proposal.locator("[data-testid=ask-proposal-not-now]")).toBeVisible();
        await toolsHold(page, `proposal ${width}`);
        await shot(page, `${theme}-tools-proposal-${width}`);
      });
    }
  });
}

test("in German at 1024: long words wrap inside the panel", async ({ page }) => {
  await openShot(page, "metronome", { width: 1024, height: 760 }, "ember", { lng: "de" });
  await openFromRail(page);
  await page.locator(".ask-panel [data-testid=ask-tool-chips] .ask-chip").first().click();
  await expect(page.locator(".ask-panel [data-testid=ask-proposal]")).toBeVisible();
  // What the practice view can be: the choices as chips, in German.
  await askWhichAndYours(page, { tool: "set_setting", args: { key: "practiceView", value: "x" } });
  await expect(page.locator(".ask-panel [data-testid=ask-choices] .ask-chip").first()).toBeVisible();
  await page.locator(".ask-panel .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await toolsHold(page, "de 1024");
  await shot(page, "ember-tools-de-1024");
});

test.describe("Ask's tools on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  for (const theme of THEMES) {
    test(`the sheet, ${theme}: chips, a receipt, that one is yours; every target 44 px`, async ({ page }) => {
      await openShot(page, "phone-today-returning", { width: 390, height: 844 }, theme);
      await page.locator('[data-testid="header-ask"]').click();
      await expect(page.locator(".sheet--ask")).toBeVisible();
      await page.waitForTimeout(400);
      const chips = page.locator(".ask-sheet [data-testid=ask-tool-chips] .ask-chip");
      await expect(chips.first()).toBeVisible();
      await toolsHold(page, "phone chips", 44);
      await shot(page, `${theme}-tools-phone-chips`);

      await page.locator(".ask-sheet .ask-chip", { hasText: "Go to Paths" }).click();
      // On a phone the sheet stays over the screen it opened on.
      await expect(page.locator(".ask-sheet [data-testid=ask-receipt]")).toContainText("Opened Paths");
      await page.evaluate(async () => {
        const mod = await import("/src/containers/coach/askTools.ts");
        mod.askYours("grading", "turn grading off");
      });
      await page.locator(".ask-sheet .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
      await toolsHold(page, "phone thread", 44);
      await shot(page, `${theme}-tools-phone-thread`);
    });
  }
});
