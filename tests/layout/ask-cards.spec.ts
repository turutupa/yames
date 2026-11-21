import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, noSidewaysScroll, MOBILE_URL } from "./fits";

/**
 * Fact cards in Ask (legs c2b1a / c2b1b; DESIGN 5.3, mocks 08 and 15): over a
 * Session's Take below the pass mark, a card answering a question typed in
 * English (the text box's seam: the router, then the cards), a measured card
 * from a chip with its source line, the early-or-late card asked with a
 * premise, and "I didn't measure that". At 1024 x 700 and 1440, on a phone,
 * in Ember and Manuscript, and on a phone in German, where typed text does not
 * reach a card and the chips do.
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

/** Every card turn and its blocks inside the panel, nothing cut off, nothing sideways. */
async function cardsHold(page: Page, panel: string, where: string) {
  const box = (await page.locator(panel).boundingBox())!;
  const items = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} :is(.ask-turn-card, .ask-turn-card *, .ask-card-chips button)`)]
        .filter((e) => e.getBoundingClientRect().width > 0)
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
  await noSidewaysScroll(page, where);
}

async function openInSession(page: Page, panel: string) {
  await settleAnimations(page);
  await page.waitForTimeout(600);
  await page.locator('[data-testid="session-coach-ask"]').click();
  await expect(page.locator(panel)).toBeVisible();
  await settleAnimations(page);
  await page.waitForTimeout(400);
}

const lastCard = (page: Page, panel: string) => page.locator(`${panel} [data-testid=ask-card]`).last();

test("a card answering a typed question in a Session at 1024 x 700, Ember", async ({ page }) => {
  await openShot(page, "session-between", { width: 1024, height: 700 }, "ember");
  await openInSession(page, ".ask-panel");
  await send(page, ".ask-panel", "How far is the pass mark?");
  const card = lastCard(page, ".ask-panel");
  await expect(card).toHaveAttribute("data-card", "pass_mark_distance");
  await expect(card).toContainText("pass mark");
  await expect(card).toContainText("Measured · Take");
  // The card answered it: the model's plain statement did not.
  await expect(page.locator(".ask-panel .ask-turn-app")).toHaveCount(0);
  await page.locator(".ask-panel .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await cardsHold(page, ".ask-panel", "typed 1024");
  await shot(page, "ember-card-typed-1024");
});

test("at 1440, Manuscript: a measured card from a chip, the premise answered, and 'I didn't measure that'", async ({ page }) => {
  await openShot(page, "session-between", { width: 1440, height: 900 }, "manuscript");
  await openInSession(page, ".ask-panel");
  const chips = page.locator(".ask-panel [data-testid=ask-card-chips] button");
  await expect(chips.first()).toBeVisible();
  expect(await chips.count(), "three card chips at most").toBeLessThanOrEqual(3);
  await cardsHold(page, ".ask-panel", "chips 1440");
  await page.locator(".ask-panel [data-testid=ask-card-chip-where_slipped]").click();
  await expect(lastCard(page, ".ask-panel")).toHaveAttribute("data-card", "where_slipped");
  await expect(lastCard(page, ".ask-panel")).toContainText("Measured · Take");

  // Mock 15: a question that assumes a way; the card says what was measured first.
  await send(page, ".ask-panel", "how do I stop rushing?");
  await expect(lastCard(page, ".ask-panel")).toHaveAttribute("data-card", "early_or_late");

  await send(page, ".ask-panel", "do you check my pick direction?");
  await expect(lastCard(page, ".ask-panel")).toHaveAttribute("data-card", "why_not_counted");
  await expect(lastCard(page, ".ask-panel")).toContainText("I didn't measure that.");
  await expect(lastCard(page, ".ask-panel")).toContainText("Worked out by the app");

  await page.locator(".ask-panel .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await cardsHold(page, ".ask-panel", "cards 1440");
  await shot(page, "manuscript-cards-1440");
});

test.describe("fact cards on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  test("a card answering a typed question, Ember", async ({ page }) => {
    await openShot(page, "phone-session-between", { width: 390, height: 844 }, "ember");
    await openInSession(page, ".ask-sheet");
    await send(page, ".ask-sheet", "How far is the pass mark?");
    await expect(lastCard(page, ".ask-sheet")).toHaveAttribute("data-card", "pass_mark_distance");
    await page.locator(".ask-sheet .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await cardsHold(page, ".ask-sheet", "typed phone");
    await shot(page, "ember-card-typed-phone");
  });

  test("in German, Manuscript: typed text goes on to the plain statement, a chip answers with a card", async ({ page }) => {
    await openShot(page, "phone-session-between", { width: 390, height: 844 }, "manuscript", { lng: "de" });
    await openInSession(page, ".ask-sheet");
    const chip = page.locator(".ask-sheet [data-testid=ask-card-chips] button").first();
    await expect(chip).toBeVisible();
    const target = (await chip.boundingBox())!;
    expect(target.height, "a thumb's target").toBeGreaterThanOrEqual(44);
    await chip.click();
    await expect(page.locator(".ask-sheet [data-testid=ask-card]")).toHaveCount(1);
    // English words in a German interface: not a card's question here.
    await send(page, ".ask-sheet", "how far is the pass mark?");
    await expect(page.locator(".ask-sheet .ask-turn-app")).toBeVisible();
    await expect(page.locator(".ask-sheet [data-testid=ask-card]")).toHaveCount(1);
    await page.locator(".ask-sheet .ask-thread").evaluate((el) => (el.scrollTop = 0));
    await cardsHold(page, ".ask-sheet", "phone de");
    await shot(page, "manuscript-card-phone-de");
  });
});
