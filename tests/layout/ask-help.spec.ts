import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openShot, settleAnimations, noSidewaysScroll, MOBILE_URL } from "./fits";

/**
 * The help set in Ask (legs c2cb / c2cc; DESIGN 5.3, 5.5): a typed question a
 * Path passage answers, quoted with its Step (English at 1440, Japanese on a
 * phone); "What is this screen for?" (`explain_screen`) on Today and on the
 * Session's result, at 1440 and on a phone, in Ember and Manuscript; and the
 * one sentence a tuning question gets, with "slow the tune down" left alone.
 *
 * The questions typed come from search's own fixtures
 * (`src/coach/ask/searchData/fixtures/<lng>.json`): the first one the loaded
 * Paths answer is used, as `askAnswerers.test.ts` picks it.
 *
 * Pictures go to `$YAMES_SHOT_DIR` when it is set; never to a fixed path.
 */

const SHOTS = process.env.YAMES_SHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

function questions(lng: string): string[] {
  const file = join(dirname(fileURLToPath(import.meta.url)), "../../src/coach/ask/searchData/fixtures", `${lng}.json`);
  return (JSON.parse(readFileSync(file, "utf8")) as { questions: Array<{ q: string }> }).questions.map((x) => x.q);
}

async function send(page: Page, panel: string, text: string) {
  await page.locator(`${panel} [data-testid=ask-input]`).fill(text);
  await page.locator(`${panel} [data-testid=ask-send]`).click();
}

const turns = (page: Page, panel: string) => page.locator(`${panel} .ask-thread .ask-turn`);
const lastCard = (page: Page, panel: string) => page.locator(`${panel} [data-testid=ask-card]`).last();

/** Sends fixture questions until one is answered by a quoted passage; returns it. */
async function askUntilSearch(page: Page, panel: string, lng: string): Promise<string> {
  for (const q of questions(lng)) {
    const before = await turns(page, panel).count();
    await send(page, panel, q);
    await expect.poll(() => turns(page, panel).count()).toBeGreaterThanOrEqual(before + 2);
    if ((await turns(page, panel).last().getAttribute("data-card")) === "search") return q;
  }
  throw new Error(`no ${lng} fixture question was answered by a Path passage`);
}

/** Every card and chip inside the panel, nothing cut off, nothing sideways. */
async function cardsHold(page: Page, panel: string, where: string) {
  const box = (await page.locator(panel).boundingBox())!;
  const items = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} :is(.ask-turn-card, .ask-turn-card *, .ask-card-chips button, .ask-empty-text)`)]
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

async function openOnToday(page: Page, panel: string) {
  if (panel === ".ask-panel") await page.locator(".rail-footer .rail-action").first().click();
  else await page.locator('[data-testid="header-ask"]').click();
  await expect(page.locator(panel)).toBeVisible();
  await settleAnimations(page);
  await page.waitForTimeout(400);
}

async function openInSession(page: Page, panel: string) {
  await settleAnimations(page);
  await page.waitForTimeout(600);
  await page.locator('[data-testid="session-coach-ask"]').click();
  await expect(page.locator(panel)).toBeVisible();
  await settleAnimations(page);
  await page.waitForTimeout(400);
}

async function helpChip(page: Page, panel: string, startsWith: string, where: string) {
  const chips = page.locator(`${panel} [data-testid=ask-card-chips] button`);
  await expect(chips.first()).toBeVisible();
  expect(await chips.count(), `${where}: three chips at most`).toBeLessThanOrEqual(3);
  await page.locator(`${panel} [data-testid=ask-card-chip-help]`).click();
  const card = lastCard(page, panel);
  await expect(card).toHaveAttribute("data-card", "help");
  await expect(card).toContainText(startsWith);
  await page.locator(`${panel} .ask-thread`).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await cardsHold(page, panel, where);
}

test("at 1440, Ember: a Path passage answers a typed question, and a tuning question gets one sentence", async ({ page }) => {
  await openShot(page, "today-returning", { width: 1440, height: 900 }, "ember");
  await openOnToday(page, ".ask-panel");
  await askUntilSearch(page, ".ask-panel", "en");
  await expect(lastCard(page, ".ask-panel")).toContainText("From the Path");
  await page.locator(".ask-panel .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await cardsHold(page, ".ask-panel", "search 1440");
  await shot(page, "ember-help-search-1440");

  await send(page, ".ask-panel", "How do I tune my guitar?");
  await expect(lastCard(page, ".ask-panel")).toHaveAttribute("data-card", "help");
  await expect(lastCard(page, ".ask-panel")).toContainText("The app has no tuner yet");
  // "The tune" is the piece being played: never the tuning line (review of c2cb, H1).
  const before = await turns(page, ".ask-panel").count();
  await send(page, ".ask-panel", "which bar of the tune slipped?");
  await expect.poll(() => turns(page, ".ask-panel").count()).toBeGreaterThanOrEqual(before + 2);
  await expect(page.locator(".ask-panel [data-testid=ask-card]", { hasText: "The app has no tuner yet" })).toHaveCount(1);
  await page.locator(".ask-panel .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await cardsHold(page, ".ask-panel", "tuning 1440");
  await shot(page, "ember-help-tuning-1440");
});

test("at 1440, Manuscript: 'What is this screen for?' on Today", async ({ page }) => {
  await openShot(page, "today-returning", { width: 1440, height: 900 }, "manuscript");
  await openOnToday(page, ".ask-panel");
  await helpChip(page, ".ask-panel", "Today builds your Session", "today 1440");
  await shot(page, "manuscript-help-today-1440");
});

test("at 1440, Ember: 'What is this screen for?' on the Session's result", async ({ page }) => {
  await openShot(page, "session-result", { width: 1440, height: 900 }, "ember");
  await openInSession(page, ".ask-panel");
  await helpChip(page, ".ask-panel", "This is how the Take went", "result 1440");
  await shot(page, "ember-help-result-1440");
});

test.describe("the help set on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  test("in Japanese, Manuscript: a Path passage answers a typed question", async ({ page }) => {
    await openShot(page, "phone-today-returning", { width: 390, height: 844 }, "manuscript", { lng: "ja" });
    await openOnToday(page, ".ask-sheet");
    await askUntilSearch(page, ".ask-sheet", "ja");
    await page.locator(".ask-sheet .ask-thread").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await cardsHold(page, ".ask-sheet", "search phone ja");
    await shot(page, "manuscript-help-search-phone-ja");
  });

  test("Ember: 'What is this screen for?' on Today", async ({ page }) => {
    await openShot(page, "phone-today-returning", { width: 390, height: 844 }, "ember");
    await openOnToday(page, ".ask-sheet");
    await helpChip(page, ".ask-sheet", "Today builds your Session", "today phone");
    await shot(page, "ember-help-today-phone");
  });

  test("Manuscript: 'What is this screen for?' on the Session's result", async ({ page }) => {
    await openShot(page, "phone-session-result", { width: 390, height: 844 }, "manuscript");
    await openInSession(page, ".ask-sheet");
    await helpChip(page, ".ask-sheet", "This is how the Take went", "result phone");
    await shot(page, "manuscript-help-result-phone");
  });
});
