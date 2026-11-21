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

      test(`the Metronome at ${width}: Slower's chip is the press (a receipt with Undo); a typed "slower" is a proposal`, async ({ page }) => {
        await openShot(page, "metronome", { width, height: 900 }, theme);
        await openFromRail(page);
        // Leg chip1: a chip's own press is the press for a reversible one-step change.
        await page.locator(".ask-panel .ask-chip", { hasText: "Slower" }).click();
        const receipt = page.locator(".ask-panel [data-testid=ask-receipt]");
        await expect(receipt).toContainText("Tempo");
        await expect(receipt.locator("[data-testid=ask-undo]")).toHaveText("Undo");
        await expect(receipt.locator("[data-testid=ask-undo]")).toHaveClass(/btn-tonal/);
        await expect(page.locator(".ask-panel [data-testid=ask-proposal]")).toHaveCount(0);
        await toolsHold(page, `chip receipt ${width}`);
        await shot(page, `${theme}-tools-chip-receipt-${width}`);
        // A confirmed change's ten seconds do not apply: still offered after them (once is enough).
        if (theme === "ember" && width === 1024) {
          await page.waitForTimeout(10_500);
          await expect(receipt.locator("[data-testid=ask-undo]")).toBeVisible();
        }
        await receipt.locator("[data-testid=ask-undo]").click();
        await expect(receipt.locator("[data-testid=ask-undone]")).toContainText("Undone.");

        // What a typed "slower" reaches (the router's call): still a proposal.
        await page.evaluate(async () => {
          const mod = await import("/src/containers/coach/askTools.ts");
          mod.runAskCall({ tool: "set_tempo", args: { direction: "slower" } }, "slower");
        });
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

test("a fast double-click has one effect: on a chip, one change and the Undo drawn under the pointer is not pressed; on a proposal's button, one change", async ({ page }) => {
  await openShot(page, "metronome", { width: 1440, height: 900 }, "ember");
  await openFromRail(page);
  // Leg chip1: Slower's chip is the press. A double-click is one change, and its Undo is not pressed.
  await page.locator(".ask-panel .ask-chip", { hasText: "Slower" }).dblclick();
  await page.waitForTimeout(150);
  const receipt = page.locator(".ask-panel [data-testid=ask-receipt]");
  await expect(receipt).toHaveCount(1);
  await expect(receipt).toContainText("Tempo");
  await expect(page.locator(".ask-panel [data-testid=ask-proposal]")).toHaveCount(0);
  await expect(page.locator(".ask-panel [data-testid=ask-undone]")).toHaveCount(0);
  await expect(page.locator(".ask-panel [data-testid=ask-refusal]")).toHaveCount(0);
  await expect(receipt.locator("[data-testid=ask-undo]")).toBeVisible();

  // A proposal (what a typed command reaches): a double-click on its button is one change.
  await page.evaluate(async () => {
    const mod = await import("/src/containers/coach/askTools.ts");
    mod.runAskCall({ tool: "set_tempo", args: { direction: "faster" } }, "faster");
  });
  await page.locator(".ask-panel [data-testid=ask-proposal-go]").dblclick();
  await page.waitForTimeout(150);
  await expect(receipt).toHaveCount(2);
  await expect(page.locator(".ask-panel [data-testid=ask-undone]")).toHaveCount(0);
  await expect(page.locator(".ask-panel [data-testid=ask-refusal]")).toHaveCount(0);

  // The chip row above the text box stays where it is after a press: a double-click there is one call too.
  const turnsBefore = await page.locator(".ask-panel .ask-thread .ask-tool").count();
  await page.locator(".ask-panel .ask-chip-row .ask-chip", { hasText: "Faster" }).dblclick();
  await page.waitForTimeout(150);
  await expect(page.locator(".ask-panel .ask-thread .ask-tool")).toHaveCount(turnsBefore + 1);
  // A second, separate press is a second change: only the newest receipt keeps its Undo.
  await expect(page.locator(".ask-panel [data-testid=ask-undo]")).toHaveCount(1);
});

test("a held Enter on a focused chip is one press: the browser's auto-repeat clicks change nothing (leg chip1b, review M1)", async ({ page }) => {
  await openShot(page, "metronome", { width: 1440, height: 900 }, "ember");
  await openFromRail(page);
  // One turn first, so the chips sit in the row above the text box and keep focus after a press.
  await page.locator(".ask-panel .ask-chip", { hasText: "Faster" }).click();
  const receipt = page.locator(".ask-panel [data-testid=ask-receipt]");
  await expect(receipt).toHaveCount(1);
  const slower = page.locator(".ask-panel .ask-chip-row .ask-chip", { hasText: "Slower" });
  await slower.focus();
  // Playwright sends `repeat: true` for a key already down: Chromium clicks a focused button on each.
  await page.keyboard.down("Enter");
  for (let i = 0; i < 6; i++) await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await page.waitForTimeout(150);
  await expect(receipt).toHaveCount(2);
  await expect(page.locator(".ask-panel [data-testid=ask-undo]")).toHaveCount(1);
});

test("in a Session at 1024: Slower's chip nudges at once, with Undo", async ({ page }) => {
  await openShot(page, "session-ready", { width: 1024, height: 700 }, "ember");
  await settleAnimations(page);
  await page.locator('[data-testid="session-coach-ask"]').click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
  const chip = page.locator(".ask-panel [data-testid=ask-tool-chips] .ask-chip", { hasText: /Slower|Faster/ }).first();
  await expect(chip).toBeVisible();
  await chip.click();
  const receipt = page.locator(".ask-panel [data-testid=ask-receipt]");
  await expect(receipt).toContainText("Tempo");
  await expect(receipt.locator("[data-testid=ask-undo]")).toBeVisible();
  await expect(page.locator(".ask-panel [data-testid=ask-proposal]")).toHaveCount(0);
  await toolsHold(page, "session chip receipt");
  await shot(page, "ember-tools-chip-receipt-session-1024");
});

test("in German at 1024: long words wrap inside the panel", async ({ page }) => {
  await openShot(page, "metronome", { width: 1024, height: 760 }, "ember", { lng: "de" });
  await openFromRail(page);
  // The first chip is Slower: its own press is the press (leg chip1), so a receipt with Undo.
  await page.locator(".ask-panel [data-testid=ask-tool-chips] .ask-chip").first().click();
  await expect(page.locator(".ask-panel [data-testid=ask-receipt] [data-testid=ask-undo]")).toBeVisible();
  // A proposal, as a typed command reaches it, in German too.
  await page.evaluate(async () => {
    const mod = await import("/src/containers/coach/askTools.ts");
    mod.runAskCall({ tool: "set_tempo", args: { direction: "slower" } }, "langsamer");
  });
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
