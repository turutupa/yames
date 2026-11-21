/**
 * The practice reminder (leg rem2): Today's one line above Today's line, whole
 * and never cut, on a computer and on a phone; and Settings → Coach's row, off
 * and on, every control inside its panel and a thumb's 44 px on a phone.
 * `?reminder=on` turns it on in the harness (every day, the last whole hour).
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openShot, MOBILE_URL, noSidewaysScroll, settleAnimations } from "./fits";

/** Pictures only when `YAMES_SHOT_DIR` names a folder; a test never writes to a fixed path. */
const SHOTS_DIR = process.env.YAMES_SHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
}

async function reminderWhole(page: Page) {
  await settleAnimations(page);
  const wrap = page.locator(".session-today-reminder");
  await expect(wrap).toHaveCount(1);
  await expect(page.getByTestId("today-reminder")).toBeVisible();
  const box = await wrap.evaluate((el) => {
    const text = el.querySelector(".coach-line-text") as HTMLElement;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(text);
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      cut: text.scrollWidth > text.clientWidth + 1 || style.textOverflow === "ellipsis" || style.whiteSpace === "nowrap",
      vw: window.innerWidth,
    };
  });
  expect(box.cut, "the reminder is cut").toBe(false);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.vw + 0.5);
  // Above Today's measured line, which still shows.
  const line = page.locator(".session-today-line");
  await expect(line).toHaveCount(1);
  const lineTop = await line.evaluate((el) => el.getBoundingClientRect().top);
  expect(box.bottom).toBeLessThanOrEqual(lineTop + 0.5);
  return box;
}

test.describe("the reminder on Today, on a computer", () => {
  for (const [size, theme, dock] of [
    [{ width: 1440, height: 900 }, "ember", true],
    [{ width: 1024, height: 700 }, "ember", false],
    [{ width: 1440, height: 900 }, "manuscript", false],
  ] as const) {
    test(`above the line, whole, at ${size.width} in ${theme}${dock ? " with Ask docked" : ""}`, async ({ page }) => {
      await openShot(page, "today-line", size, theme, { reminder: "on" });
      if (dock) {
        // The dock open beside Today: Ask, from the rail's row (as ask.spec opens it).
        await page.locator(".rail-footer .rail-action").first().click();
        await expect(page.locator(".ask-panel")).toBeVisible();
        await page.waitForTimeout(260); // the panel's own slide-in
      }
      await reminderWhole(page);
      await expect(page.getByTestId("today-reminder")).toHaveText(/^Your reminder: guitar at .+\.$/);
      await noSidewaysScroll(page, "Today");
      await shot(page, `reminder-today-${size.width}-${theme}${dock ? "-dock" : ""}`);
    });
  }

  test("wraps, never cut, in German at 1024", async ({ page }) => {
    await openShot(page, "today-line", { width: 1024, height: 700 }, "ember", { reminder: "on", lng: "de" });
    await reminderWhole(page);
    await shot(page, "reminder-today-1024-de");
  });

  test("absent when the reminder is off", async ({ page }) => {
    await openShot(page, "today-line", { width: 1440, height: 900 }, "ember");
    await expect(page.locator(".session-today-line")).toHaveCount(1);
    await expect(page.locator(".session-today-reminder")).toHaveCount(0);
  });
});

test.describe("the reminder on Today, on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  test("under the title, above the line, whole, at 360x800", async ({ page }) => {
    await openShot(page, "phone-today-line", { width: 360, height: 800 }, "ember", { reminder: "on" });
    await reminderWhole(page);
    const title = await page.locator(".session-today-hero .session-mega").first().evaluate((el) => el.getBoundingClientRect().bottom);
    const top = await page.locator(".session-today-reminder").evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(title - 0.5);
    await noSidewaysScroll(page, "Today");
    await shot(page, "reminder-phone-today-ember");
  });
});

async function rowFits(page: Page, minTarget: number) {
  const row = page.getByTestId("coach-reminder-row");
  await row.scrollIntoViewIfNeeded();
  const m = await row.evaluate((el) => {
    const panel = el.closest("section.settings-section")!.getBoundingClientRect();
    const controls = Array.from(el.querySelectorAll("button, input")).map((c) => {
      const r = c.getBoundingClientRect();
      return { id: c.getAttribute("data-testid"), left: r.left, right: r.right, width: r.width, height: r.height };
    });
    return { panel: { left: panel.left, right: panel.right }, controls };
  });
  for (const c of m.controls) {
    expect(c.left, `${c.id} starts outside its panel`).toBeGreaterThanOrEqual(m.panel.left - 0.5);
    expect(c.right, `${c.id} ends outside its panel`).toBeLessThanOrEqual(m.panel.right + 0.5);
    expect(c.height, `${c.id} is under ${minTarget} px`).toBeGreaterThanOrEqual(minTarget - 0.5);
    if (minTarget >= 44) expect(c.width, `${c.id} is narrower than a thumb`).toBeGreaterThanOrEqual(43.5);
  }
  return m;
}

test.describe("Settings → Coach → Practice reminder", () => {
  for (const size of [
    { width: 1400, height: 900 },
    { width: 1024, height: 900 },
    { width: 520, height: 900 },
  ]) {
    test(`off, then on, inside its panel at ${size.width}px`, async ({ page }) => {
      await openShot(page, "settings-update", size);
      const m = await rowFits(page, 20);
      expect(m.controls).toHaveLength(2);
      await shot(page, `reminder-settings-off-${size.width}`);
      await page.getByTestId("coach-reminder-on").click();
      await expect(page.getByTestId("coach-reminder-time")).toHaveValue("18:00");
      const on = await rowFits(page, 20);
      expect(on.controls).toHaveLength(2 + 1 + 7);
      await noSidewaysScroll(page, "Settings");
      await page.getByTestId("coach-reminder-row").scrollIntoViewIfNeeded();
      await shot(page, `reminder-settings-on-${size.width}`);
    });
  }

  test("in Manuscript, on", async ({ page }) => {
    await openShot(page, "settings-update", { width: 1400, height: 900 }, "manuscript", { reminder: "on" });
    await rowFits(page, 20);
    await page.getByTestId("coach-reminder-row").scrollIntoViewIfNeeded();
    await shot(page, "reminder-settings-on-1400-manuscript");
  });
});

test.describe("Settings → Practice reminder on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  test("its own section, every control 44 px, inside the panel", async ({ page }) => {
    // A phone has no rail: Settings is its tab (as phone-tabs.spec does it).
    await openShot(page, "metronome", { width: 360, height: 800 }, "ember", { reminder: "on" });
    await page.click('.mobile-tab[data-tab="settings"]');
    await page.waitForSelector(".settings-section");
    await expect(page.locator("#settings-coach-reminder")).toHaveCount(1);
    await rowFits(page, 44);
    await noSidewaysScroll(page, "Settings");
    await page.getByTestId("coach-reminder-row").scrollIntoViewIfNeeded();
    await shot(page, "reminder-phone-settings-on");
  });
});
