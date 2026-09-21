import { test, expect } from "@playwright/test";
import { openShot, MOBILE_URL } from "./fits";

/**
 * The bottom tab bar, on a phone (M12).
 *
 * Every screen in the app is drawn inside ONE scrolling box — the children
 * swap when you change tab, the box does not — and on a phone every screen
 * is taller than the screen, Settings most of all. So scrolling to the
 * bottom of Settings and pressing Metronome arrived at a metronome scrolled
 * 61px down, with the big BPM number drawn behind the bar at the top; the
 * same thing happened between any two tabs.
 *
 * Nothing about it is visible to a unit test: happy-dom has no scrollTop
 * worth the name, and no viewport for anything to be pushed out of.
 */
const PHONE = { width: 360, height: 800 };

/** How far down the screen the tempo is drawn, and where the bar ends. */
async function tempoAndBar(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const stage = document.querySelector(".main-content > .view-transition-wrapper")!;
    const tempo = document.querySelector(".bpm-display")?.getBoundingClientRect();
    const bar = document.querySelector(".main-header")!.getBoundingClientRect();
    return {
      scrollTop: Math.round(stage.scrollTop),
      tempoTop: tempo ? Math.round(tempo.top) : null,
      barBottom: Math.round(bar.bottom),
    };
  });
}

test.describe("changing tab on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  test("starts the new screen at its top", async ({ page }) => {
    await openShot(page, "metronome", PHONE);

    // Settings, scrolled well down — the ordinary way to reach About.
    await page.click('.mobile-tab[data-tab="settings"]');
    await page.waitForSelector(".settings-section");
    await page.evaluate(() => {
      document.querySelector(".main-content > .view-transition-wrapper")!.scrollTop = 900;
    });
    await page.waitForTimeout(300);

    await page.click('.mobile-tab[data-tab="beat"]');
    await page.waitForTimeout(700);

    const { scrollTop, tempoTop, barBottom } = await tempoAndBar(page);
    expect(scrollTop, "the metronome opened where Settings was left").toBe(0);
    expect(tempoTop, "no tempo on the metronome tab").not.toBeNull();
    expect(
      tempoTop!,
      `the tempo starts at ${tempoTop}, above the bar's ${barBottom}`,
    ).toBeGreaterThanOrEqual(barBottom);
  });
});
