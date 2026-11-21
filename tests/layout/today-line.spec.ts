/**
 * Today's line (c1b2a, DESIGN 6.1, mocks 01 and 12): the coach's glyph and one
 * sentence above the plan. It wraps and is never cut, in the longest languages
 * too; it sits above the plan's head on a computer and under the title on a
 * phone; with nothing to add the slot is absent, not an empty gap.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openShot, MOBILE_URL, noSidewaysScroll, settleAnimations } from "./fits";

/** Pictures only when `YAMES_SHOT_DIR` names a folder; a test never writes to a fixed path. */
const SHOTS_DIR = process.env.YAMES_SHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
}

async function lineFits(page: Page, selector = ".session-today-line") {
  await settleAnimations(page);
  const line = page.locator(selector);
  await expect(line).toHaveCount(1);
  await expect(line).toBeVisible();
  const box = await line.evaluate((el) => {
    const text = el.querySelector(".coach-line-text") as HTMLElement;
    const r = el.getBoundingClientRect();
    const glyph = el.querySelector("svg.coach-glyph")!.getBoundingClientRect();
    const style = getComputedStyle(text);
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      height: r.height,
      lineHeight: parseFloat(getComputedStyle(el.querySelector(".coach-line") as HTMLElement).lineHeight),
      cut: text.scrollWidth > text.clientWidth + 1 || style.textOverflow === "ellipsis" || style.whiteSpace === "nowrap",
      glyphColour: getComputedStyle(el.querySelector("svg.coach-glyph")!).color,
      textColour: style.color,
      glyphLeft: glyph.left,
      background: getComputedStyle(el).backgroundColor,
      border: getComputedStyle(el).borderTopWidth,
      vw: window.innerWidth,
    };
  });
  expect(box.cut, "the line is cut").toBe(false);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.vw + 0.5);
  // No card: no fill and no border of its own.
  expect(box.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(box.border).toBe("0px");
  // The coach's colour on the glyph only; the words are ink.
  expect(box.glyphColour).not.toBe(box.textColour);
  return box;
}

test.describe("Today's line on a computer", () => {
  for (const theme of ["ember", "manuscript"]) {
    for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 700 }]) {
      test(`above the plan, whole, at ${size.width}x${size.height} in ${theme}`, async ({ page }) => {
        await openShot(page, "today-line", size, theme);
        const box = await lineFits(page);
        const head = await page.locator(".session-plan-head").first().evaluate((el) => el.getBoundingClientRect().top);
        expect(box.bottom).toBeLessThanOrEqual(head + 0.5);
        await expect(page.getByTestId("today-line-ask")).toHaveJSProperty("tagName", "BUTTON");
        await noSidewaysScroll(page, "Today");
        await shot(page, `today-line-${size.width}-${theme}`);
      });
    }
  }

  for (const lng of ["de", "ru"]) {
    test(`wraps, never cut, in ${lng} at 1024x700`, async ({ page }) => {
      await openShot(page, "today-line", { width: 1024, height: 700 }, "ember", { lng });
      const box = await lineFits(page);
      // It wraps onto a second line rather than running out of its column.
      expect(box.height).toBeGreaterThan(box.lineHeight * 1.5);
      await noSidewaysScroll(page, "Today");
      await shot(page, `today-line-1024-${lng}`);
    });
  }

  test("absent, not empty, when it has nothing to add", async ({ page }) => {
    await openShot(page, "today-returning", { width: 1440, height: 900 }, "ember");
    await expect(page.locator(".session-today-line")).toHaveCount(0);
    await expect(page.getByTestId("today-left-off")).toHaveCount(0);
  });

  test("a player back after a break gets the last number and the rungs, no card", async ({ page }) => {
    await openShot(page, "today-back", { width: 1440, height: 900 }, "ember");
    await lineFits(page);
    await expect(page.getByTestId("today-left-off")).toHaveCount(0);
    await headerSaysTheFact(page);
    await shot(page, "today-back-1440-ember");
  });

  test("back after a break at 1024x700: the header says the fact, the line beneath it whole", async ({ page }) => {
    await openShot(page, "today-back", { width: 1024, height: 700 }, "ember");
    await lineFits(page);
    await headerSaysTheFact(page);
    await noSidewaysScroll(page, "Today");
    await shot(page, "today-back-1024-ember");
  });
});

/**
 * Today's header back after a break (owner, the 1k questions, item 4): the
 * plain fact, "Last Session: 12 days ago", never a welcome; and not Today's
 * line said twice.
 */
async function headerSaysTheFact(page: Page) {
  const kick = page.getByTestId("today-lead");
  await expect(kick).toHaveText(/^Last Session: \d+ days ago$/i);
  await expect(kick).not.toHaveText(/welcome|it has been|you/i);
  const kicker = (await kick.textContent())!.trim();
  const line = (await page.locator(".session-today-line .coach-line-text").textContent())!;
  expect(line, "the header repeats Today's line").not.toContain(kicker);
  // The days away are the header's: the line under it does not say them again
  // ("That was 12 days ago." was removed, nf1b).
  expect(line, "Today's line repeats the days away").not.toMatch(/\bdays? ago\b/i);
  expect(line).toMatch(/^Last Session, .+ BPM\. Today (.+ )?starts at \d+ BPM\.$/);
}

/** The Step page's line sits under the Step's goal and above its Exercises. */
async function stepLineInPlace(page: Page, box: { top: number; bottom: number }) {
  await expect(page.getByTestId("step-coach-line")).toContainText("slipped");
  const goal = await page.locator('[data-testid="step-detail"] .session-lede').first().evaluate((el) => el.getBoundingClientRect().bottom);
  const grid = await page.locator('[data-testid="step-detail"] .session-stepgrid').first().evaluate((el) => el.getBoundingClientRect().top);
  expect(box.top).toBeGreaterThanOrEqual(goal - 0.5);
  expect(box.bottom).toBeLessThanOrEqual(grid + 0.5);
}

test.describe("The Step page's line", () => {
  test("under the goal, whole, at 1440x900 in ember", async ({ page }) => {
    await openShot(page, "step-line", { width: 1440, height: 900 }, "ember");
    const box = await lineFits(page, ".session-step-line");
    await stepLineInPlace(page, box);
    await expect(page.getByTestId("step-coach-line-ask")).toHaveJSProperty("tagName", "BUTTON");
    await noSidewaysScroll(page, "the Step page");
    await shot(page, "step-line-1440-ember");
  });
});

test.describe("The Step page's line on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  test("under the goal, whole, not a target, at 360x800 in ember", async ({ page }) => {
    await openShot(page, "phone-step-line", { width: 360, height: 800 }, "ember");
    const box = await lineFits(page, ".session-step-line");
    await stepLineInPlace(page, box);
    await expect(page.getByTestId("step-coach-line-ask")).toHaveCount(0);
    await noSidewaysScroll(page, "the Step page");
    await shot(page, "phone-step-line-ember");
  });
});

test.describe("Today's line on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  for (const theme of ["ember", "manuscript"]) {
    test(`under the title, whole, not a target, at 360x800 in ${theme}`, async ({ page }) => {
      await openShot(page, "phone-today-line", { width: 360, height: 800 }, theme);
      const box = await lineFits(page);
      const title = await page.locator(".session-today-hero .session-mega").first().evaluate((el) => el.getBoundingClientRect().bottom);
      expect(box.top).toBeGreaterThanOrEqual(title - 0.5);
      // A sentence is no thumb target: the phone's Ask is the header's button.
      await expect(page.getByTestId("today-line-ask")).toHaveCount(0);
      await noSidewaysScroll(page, "Today");
      await shot(page, `phone-today-line-${theme}`);
    });
  }

  test("back after a break on a phone: the header says the fact, the line beneath it whole", async ({ page }) => {
    await openShot(page, "phone-today-back", { width: 360, height: 800 }, "ember");
    await lineFits(page);
    await headerSaysTheFact(page);
    await noSidewaysScroll(page, "Today");
    await shot(page, "phone-today-back-ember");
  });

  test("in Russian on a phone it wraps and is never cut", async ({ page }) => {
    await openShot(page, "phone-today-line", { width: 360, height: 800 }, "ember", { lng: "ru" });
    await lineFits(page);
    await noSidewaysScroll(page, "Today");
    await shot(page, "phone-today-line-ru");
  });
});
