import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, noSidewaysScroll, notHitTestable, MOBILE_URL } from "./fits";

/**
 * The Path, plan and theory cards in Ask, and their source lines pressed (legs
 * c2b2a / c2b2b; DESIGN 3.6, 5.3, mock 08): a Path passage quoted and its
 * "From the Path · Step N" pressed in a Session (the Step's words open in Ask,
 * the Session stays where it is); a plan card ending in a proposal and a
 * fretboard answer on Today. At 1440 and on a phone, Ember and Manuscript, the
 * phone in German.
 *
 * Pictures go to `$YAMES_SHOT_DIR` when it is set; never to a fixed path.
 */

const SHOTS = process.env.YAMES_SHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function send(page: Page, panel: string, text: string) {
  await page.locator(`${panel} [data-testid=ask-input]`).fill(text);
  await page.locator(`${panel} [data-testid=ask-send]`).click();
}

async function openInSession(page: Page, panel: string) {
  await settleAnimations(page);
  await page.waitForTimeout(600);
  await page.locator('[data-testid="session-coach-ask"]').click();
  await expect(page.locator(panel)).toBeVisible();
  await settleAnimations(page);
  await page.waitForTimeout(400);
}

async function openFromRail(page: Page) {
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
  await page.waitForTimeout(260);
}

/** A card asked of the panel's own module: the chips on a result screen are the Take's, so no chip leads here. */
async function askCardOf(page: Page, tool: string, args: Record<string, string | number> = {}) {
  await page.evaluate(
    async (c) => {
      const mod = await import("/src/containers/coach/askCards.ts");
      mod.askCard(c, "");
    },
    { tool, args },
  );
}

/** Every turn of the thread inside the panel, nothing cut off, nothing sideways. */
async function turnsHold(page: Page, panel: string, where: string) {
  const box = (await page.locator(panel).boundingBox())!;
  const items = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} :is(.ask-turn-card, .ask-turn-card *, .ask-tool, .ask-tool *, .ask-chip)`)]
        .filter((e) => e.getBoundingClientRect().width > 0 && !(e instanceof SVGElement))
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { cls: `${e.tagName.toLowerCase()}.${e.className}`, left: r.left, right: r.right, overflow: e.scrollWidth - e.clientWidth };
        }),
    panel,
  );
  expect(items.length, `${where}: something to measure`).toBeGreaterThan(0);
  for (const b of items) {
    expect(b.left, `${where}: ${b.cls} left`).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(b.right, `${where}: ${b.cls} right`).toBeLessThanOrEqual(box.x + box.width + 0.5);
    expect(b.overflow, `${where}: ${b.cls} cut off`).toBeLessThanOrEqual(1);
  }
  expect(await page.locator(`${panel} .btn-primary`).count(), `${where}: a solid button`).toBe(0);
  await noSidewaysScroll(page, where);
}

const lastCard = (page: Page, panel: string) => page.locator(`${panel} [data-testid=ask-card]`).last();

test("at 1440, Ember: a Path passage quoted, its source pressed in a Session opens the Step's words in Ask", async ({ page }) => {
  await openShot(page, "session-between", { width: 1440, height: 900 }, "ember");
  await openInSession(page, ".ask-panel");
  await send(page, ".ask-panel", "what is this exercise for?");
  const card = lastCard(page, ".ask-panel");
  await expect(card).toHaveAttribute("data-card", "exercise_purpose");
  await expect(card).toContainText("From the Path · Step");
  const press = card.locator("[data-testid=coach-source-press]");
  await expect(press).toBeVisible();
  expect(await notHitTestable(page, ".ask-panel [data-testid=coach-source-press]"), "the source line is pressable").toEqual([]);
  const sessionAsk = page.locator('[data-testid="session-coach-ask"]');
  await press.click();
  // The Step's own words, quoted in Ask; the Session did not move.
  const opened = lastCard(page, ".ask-panel");
  await expect(opened).toHaveAttribute("data-card", "none");
  await expect(opened).toContainText("in the Path's words");
  // A long quote is cut into blocks, each with its own source line (c2b1b): every one says the Path.
  await expect(opened.locator("[data-source=path]").first()).toBeVisible();
  expect(await opened.locator(".coach-block-source:not([data-source=path])").count(), "only the Path as the source").toBe(0);
  await expect(sessionAsk).toBeAttached();
  await expect(page.locator(".ask-panel [data-testid=ask-receipt]")).toHaveCount(0);
  await page.locator(".ask-panel .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await turnsHold(page, ".ask-panel", "path quote 1440");
  await shot(page, "ember-path-source-pressed-1440");
});

test("at 1440, Manuscript, on Today: a plan card ending in a proposal, then a fretboard answer", async ({ page }) => {
  await openShot(page, "today-returning", { width: 1440, height: 900 }, "manuscript");
  await openFromRail(page);
  await send(page, ".ask-panel", "I have 7 minutes");
  await expect(lastCard(page, ".ask-panel")).toHaveAttribute("data-card", "plan_minutes");
  // The card never acts: the matching tool's proposal, for the player to press.
  const proposal = page.locator(".ask-panel [data-testid=ask-proposal]").last();
  await expect(proposal).toBeVisible();
  await expect(proposal.locator("[data-testid=ask-proposal-go]")).toBeVisible();
  await send(page, ".ask-panel", "what fits over Am?");
  await expect(lastCard(page, ".ask-panel")).toHaveAttribute("data-card", "scale_fits");
  await expect(lastCard(page, ".ask-panel")).toContainText("Worked out by the app");
  const neck = page.locator(".ask-panel [data-block=fretboard]").last();
  await expect(neck).toBeVisible();
  // "Worked out by the app", pressed: one line saying what that means, nothing moves.
  await lastCard(page, ".ask-panel").locator("[data-testid=coach-source-press]").click();
  await expect(lastCard(page, ".ask-panel")).toContainText("computed by its own rules");
  await page.locator(".ask-panel .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight - 700));
  await turnsHold(page, ".ask-panel", "plan and neck 1440");
  await shot(page, "manuscript-plan-fretboard-1440");
});

test.describe("the source line on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  test("in German, Manuscript: a Path card, its source a thumb's target, pressed in the Session", async ({ page }) => {
    await openShot(page, "phone-session-between", { width: 390, height: 844 }, "manuscript", { lng: "de" });
    await openInSession(page, ".ask-sheet");
    await askCardOf(page, "exercise_purpose");
    const card = lastCard(page, ".ask-sheet");
    await expect(card).toHaveAttribute("data-card", "exercise_purpose");
    const press = card.locator("[data-testid=coach-source-press]");
    await expect(press).toBeVisible();
    const target = (await press.boundingBox())!;
    expect(target.height, "a thumb's target").toBeGreaterThanOrEqual(44);
    await press.click();
    await expect(lastCard(page, ".ask-sheet")).toHaveAttribute("data-card", "none");
    await expect(page.locator(".ask-sheet [data-testid=ask-receipt]")).toHaveCount(0);
    await page.locator(".ask-sheet .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await turnsHold(page, ".ask-sheet", "phone de");
    await shot(page, "manuscript-source-phone-de");
  });

  test("Ember: a fretboard answer fits the sheet", async ({ page }) => {
    await openShot(page, "phone-session-between", { width: 390, height: 844 }, "ember");
    await openInSession(page, ".ask-sheet");
    await send(page, ".ask-sheet", "what fits over Am?");
    await expect(lastCard(page, ".ask-sheet")).toHaveAttribute("data-card", "scale_fits");
    await expect(page.locator(".ask-sheet [data-block=fretboard]").last()).toBeVisible();
    await page.locator(".ask-sheet .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await turnsHold(page, ".ask-sheet", "phone neck");
    await shot(page, "ember-fretboard-phone");
  });
});
