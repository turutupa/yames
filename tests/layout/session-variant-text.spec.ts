/*
 * A key-moved Exercise's own words (card #79): the ready screen's HOW fold
 * carries the played variant's how-to, its second line (the key and its
 * frets) under the first, whole and inside the panel, at a wide window, a
 * short one, and a phone; and the runway's notes say the same lines.
 */
import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, MOBILE_URL } from "./fits";

/** The fold opened, and every line of it measured against the panel and the window. */
async function howLines(page: Page) {
  const how = page.locator('[data-testid="session-how"]');
  await expect(how).toBeVisible();
  await how.locator("summary").click();
  const more = page.locator('[data-testid="session-how-more"]');
  await expect(more.first()).toBeVisible();
  await settleAnimations(page);
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[data-testid="session-how"]')!.getBoundingClientRect();
    const lines = [...document.querySelectorAll<HTMLElement>('[data-testid="session-how"] [data-testid="session-how-more"]')];
    const outside = lines
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.left < panel.left - 0.5 || r.right > panel.right + 0.5 || r.right > innerWidth + 0.5 || el.scrollWidth > el.clientWidth + 1)
      .map(({ el, r }) => `"${(el.textContent ?? "").slice(0, 30)}" ${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(panel.left)}..${Math.round(panel.right)}`);
    return { texts: lines.map((el) => el.textContent ?? ""), outside };
  });
}

for (const size of [
  { width: 1400, height: 900 },
  { width: 1024, height: 700 },
]) {
  test(`the variant's second how-to line fits the HOW panel at ${size.width}x${size.height}`, async ({ page }) => {
    await openShot(page, "session-variant-e", size);
    const { texts, outside } = await howLines(page);
    expect(texts[0]).toMatch(/^In E\b/);
    expect(outside).toEqual([]);
  });
}

test("two keys of one Exercise say their own second line", async ({ page }) => {
  await openShot(page, "session-variant-bb", { width: 1400, height: 900 });
  const { texts } = await howLines(page);
  expect(texts[0]).toMatch(/^In B flat\b/);
});

test("the runway's ready notes carry the variant's lines", async ({ page }) => {
  await openShot(page, "session-variant-runway", { width: 1400, height: 900 });
  await expect(page.locator('.session-runway-notes [data-testid="session-how-more"]').first()).toHaveText(/^In B flat\b/);
});

test("the key chooser beside the title plays another key, from the keyboard too (card #93)", async ({ page }) => {
  await openShot(page, "session-variant-bb", { width: 1024, height: 700 });
  const chooser = page.getByTestId("session-keychoice");
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText("B\u266d");
  // Beside the title, on its line, and small: never wider than a few letters.
  const geo = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="session-keychoice"]')!.getBoundingClientRect();
    const t = document.querySelector(".practice-title")!.getBoundingClientRect();
    return { gap: c.left - t.right, mid: Math.abs((c.top + c.bottom) / 2 - (t.top + t.bottom) / 2), w: c.width };
  });
  expect(geo.gap).toBeGreaterThanOrEqual(0);
  expect(geo.mid).toBeLessThan(10);
  expect(geo.w).toBeLessThan(120);
  // The keyboard reaches it and changes it.
  const select = page.getByTestId("session-keychoice-select");
  await select.focus();
  await select.selectOption("1");
  await expect(chooser).toContainText("E");
  const { texts } = await howLines(page);
  expect(texts[0]).toMatch(/^In E\b/);
});

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  test("the variant's second how-to line fits the HOW panel at 390x844", async ({ page }) => {
    await openShot(page, "phone-session-variant-e", { width: 390, height: 844 });
    const { texts, outside } = await howLines(page);
    expect(texts[0]).toMatch(/^In E\b/);
    expect(outside).toEqual([]);
  });
});
