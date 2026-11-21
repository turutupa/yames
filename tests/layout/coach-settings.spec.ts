/**
 * Settings → Coach in five groups and the wizard's coach step (leg c6a).
 * Every group's heading in DESIGN 8's order, every control inside its panel,
 * no sideways scroll; on a phone three groups and a thumb's 44 px. Pictures
 * only when `YAMES_SHOT_DIR` names a folder.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openShot, MOBILE_URL, noSidewaysScroll, insideViewport } from "./fits";

const SHOTS_DIR = process.env.YAMES_SHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}.png`, fullPage: false });
}

/** The groups in order, and every control of the section inside its panel (and 44 px when asked). */
async function groupsFit(page: Page, expected: string[], minTarget: number) {
  const section = page.locator("#settings-coach");
  await section.scrollIntoViewIfNeeded();
  const m = await section.evaluate((el) => {
    const panel = el.getBoundingClientRect();
    const groups = Array.from(el.querySelectorAll("[data-coach-group]")).map((g) => g.getAttribute("data-coach-group"));
    const controls = Array.from(el.querySelectorAll("button, input"))
      .filter((c) => (c as HTMLElement).offsetParent !== null)
      .map((c) => {
        const r = c.getBoundingClientRect();
        return { name: (c.textContent || c.getAttribute("data-testid") || c.tagName).trim().slice(0, 30), left: r.left, right: r.right, height: r.height };
      });
    return { panel: { left: panel.left, right: panel.right }, groups, controls };
  });
  expect(m.groups).toEqual(expected);
  for (const c of m.controls) {
    expect(c.left, `${c.name} starts outside its panel`).toBeGreaterThanOrEqual(m.panel.left - 0.5);
    expect(c.right, `${c.name} ends outside its panel`).toBeLessThanOrEqual(m.panel.right + 0.5);
    if (minTarget > 0) expect(c.height, `${c.name} is under ${minTarget} px`).toBeGreaterThanOrEqual(minTarget - 0.5);
  }
}

const DESKTOP = ["answers", "voice", "suggestions", "notebook", "tools"];

test.describe("Settings → Coach, five groups", () => {
  for (const [width, theme] of [
    [1440, "ember"],
    [1440, "manuscript"],
    [1024, "ember"],
    [1024, "manuscript"],
  ] as const) {
    test(`at ${width} in ${theme}`, async ({ page }) => {
      await openShot(page, "settings-update", { width, height: 900 }, theme);
      await groupsFit(page, DESKTOP, 0);
      await noSidewaysScroll(page, "Settings");
      await page.locator('#settings-coach [data-coach-group="answers"]').scrollIntoViewIfNeeded();
      await shot(page, `coach-settings-${width}-${theme}`);
    });
  }

  test("in German at 1024, nothing cut", async ({ page }) => {
    await openShot(page, "settings-update", { width: 1024, height: 900 }, "ember", { lng: "de" });
    await groupsFit(page, DESKTOP, 0);
    await noSidewaysScroll(page, "Settings");
    await page.locator('#settings-coach [data-coach-group="notebook"]').scrollIntoViewIfNeeded();
    await shot(page, "coach-settings-1024-de");
  });
});

test.describe("Settings → Coach on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  test("Answers, Suggestions, Notebook; every control 44 px, inside the panel", async ({ page }) => {
    await openShot(page, "metronome", { width: 360, height: 800 }, "ember");
    await page.click('.mobile-tab[data-tab="settings"]');
    await page.waitForSelector("#settings-coach");
    await groupsFit(page, ["answers", "suggestions", "notebook"], 44);
    await expect(page.locator('#settings-coach [data-testid="coach-phone-tiers"] li')).toHaveCount(2);
    await noSidewaysScroll(page, "Settings");
    await page.locator("#settings-coach").scrollIntoViewIfNeeded();
    await shot(page, "coach-settings-phone");
  });
});

test.describe("the wizard's coach step", () => {
  for (const size of [
    { width: 1024, height: 768 },
    { width: 620, height: 780 },
  ]) {
    test(`one question, Off and the tiers, no listening box, at ${size.width}`, async ({ page }) => {
      await openShot(page, "firstrun-coach", size);
      await expect(page.getByTestId("coach-question")).toBeVisible();
      await expect(page.locator('[data-testid="coach-tiers"] button')).toHaveCount(3);
      await expect(page.getByTestId("coach-try-listening")).toHaveCount(0);
      await noSidewaysScroll(page, `the coach step at ${size.width}px`);
      await insideViewport(page, ".onboarding-card", `the coach step at ${size.width}px`, size);
      const next = page.locator(".onboarding-footer .onboarding-btn-primary");
      await next.scrollIntoViewIfNeeded();
      await expect(next).toBeVisible();
      await shot(page, `coach-wizard-${size.width}`);
    });
  }
});
