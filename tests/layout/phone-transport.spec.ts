import { test, expect, type Page } from "@playwright/test";
import { openShot, switchLanguage, MOBILE_URL } from "./fits";

/**
 * The bar the Stop button lives on, with a routine on it (M12).
 *
 * On a phone it carries three controls and nothing else: Stop, the count-in
 * switch, and Skip — the one thing that moves a "when I say" step on, and
 * therefore the one thing that must never be off the screen (M11 said so
 * after it was, once). In English the three of them come to 359px in a 358px
 * row: exact, and only exact. In Brazilian Portuguese "Count-in" is
 * "Contagem inicial", the switch is 45px wider, and Skip went off the edge
 * again.
 *
 * So this measures the row in the longest language there is as well as in
 * English. Nothing here is visible to a unit test: happy-dom has no widths.
 */
const PHONES = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

/** The setlist tab with a routine on it, and the transport carrying it. */
async function openRunningSetlist(page: Page, size: { width: number; height: number }) {
  await openShot(page, "metronome", size);
  await page.click('.mobile-tab[data-tab="setlist"]');
  await page.click(".mobile-tab-library");
  await page.waitForSelector(".sheet--library");
  await page.click(".preset-sidebar-item.setlist-item");
  await page.waitForSelector(".setlist-paragraph");
  await page.waitForSelector(".transport[data-setlist]");
}

async function expectTransportOnScreen(page: Page, where: string) {
  const measured = await page.evaluate(() => {
    const row = document.querySelector(".transport")!.getBoundingClientRect();
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    };
    return {
      vw: window.innerWidth,
      row: { left: row.left, right: row.right },
      play: box(".transport-play"),
      countIn: box(".transport-switch"),
      skip: box(".transport-skip"),
    };
  });

  for (const [what, control] of [
    ["Stop", measured.play],
    ["the count-in switch", measured.countIn],
    ["Skip", measured.skip],
  ] as const) {
    expect(control, `${where}: no ${what} on the transport`).not.toBeNull();
    expect(
      Math.round(control!.right),
      `${where}: ${what} ends at ${Math.round(control!.right)}, past the screen's ${measured.vw}`,
    ).toBeLessThanOrEqual(measured.vw);
    expect(
      Math.round(control!.left),
      `${where}: ${what} starts at ${Math.round(control!.left)}, off the left of the screen`,
    ).toBeGreaterThanOrEqual(0);
  }

  // A fingertip, not a sliver: Skip is a 44px control and all 44 of it has to
  // be on the screen, which is what "past the edge" cost it before.
  expect(
    Math.round(measured.skip!.width),
    `${where}: Skip is only ${Math.round(measured.skip!.width)}px wide`,
  ).toBeGreaterThanOrEqual(44);
}

test.describe("the transport with a routine on it, on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  for (const size of PHONES) {
    test(`keeps Stop, the count-in and Skip on the screen at ${size.width}px`, async ({ page }) => {
      await openRunningSetlist(page, size);
      await expectTransportOnScreen(page, `en @ ${size.width}`);
      // Nothing is cut in English — the words fit, and the switch should not
      // be paying for room it does not need.
      const clipped = await page.$eval(
        ".transport-switch-label",
        (el) => el.scrollWidth > el.clientWidth + 1,
      );
      expect(clipped, `en @ ${size.width}: "Count-in" is being cut short`).toBe(false);
    });
  }

  test("keeps them on the screen at 360px in Brazilian Portuguese", async ({ page }) => {
    await openShot(page, "metronome", { width: 360, height: 800 });
    await switchLanguage(page, "pt-BR");
    await page.click('.mobile-tab[data-tab="setlist"]');
    await page.click(".mobile-tab-library");
    await page.waitForSelector(".sheet--library");
    await page.click(".preset-sidebar-item.setlist-item");
    await page.waitForSelector(".setlist-paragraph");
    await page.waitForSelector(".transport[data-setlist]");
    await expectTransportOnScreen(page, "pt-BR @ 360");
  });
});
