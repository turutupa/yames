// Getting a song in, measured (W19, `plans/SONGS.md` S0.9).
//
// Its own file rather than more of `songs.spec.ts`: that one is about the
// STAGE — the tab, the controls, the band — and these three things happen
// before there is a song to put on it. The offer strip when a download
// finishes, the "find a tab" row, and the shelf the mode is never empty
// because of.
//
// The question every test here asks is the one a hundred and seven layout
// tests failed to ask before the stage was rebuilt: is the thing ON SCREEN,
// at the smallest window the app will open, in the longest language. Vitest
// cannot answer it — happy-dom computes no geometry, so every element there
// is zero by zero.
import { test, expect } from "@playwright/test";
import { openShot, fitsOnOneLine, noSidewaysScroll } from "./fits";

/** The smallest window `src-tauri/tauri.conf.json` lets anybody make. */
const SMALLEST = { width: 480, height: 780 };

const WIDTHS = [
  SMALLEST,
  { width: 520, height: 900 },
  { width: 760, height: 900 },
  { width: 1100, height: 720 },
  { width: 1400, height: 900 },
];

test.slow();

test.describe("the offer when a download finishes", () => {
  for (const size of WIDTHS) {
    test(`fits at ${size.width}×${size.height}`, async ({ page }) => {
      await openShot(page, "songs-offer", size);
      await noSidewaysScroll(page, `the offer at ${size.width}px`);

      const strip = await page.locator(".songs-offer").boundingBox();
      expect(strip, "no offer on screen").not.toBeNull();
      expect(
        Math.round(strip!.x + strip!.width),
        `the offer ends at ${Math.round(strip!.x + strip!.width)}, past the window's ${size.width}`,
      ).toBeLessThanOrEqual(size.width + 1);
      expect(Math.round(strip!.x), "the offer starts off the left").toBeGreaterThanOrEqual(-1);
    });
  }

  /**
   * Both buttons are reachable without scrolling.
   *
   * The whole feature is a saved step, and an offer whose "Open it" is below
   * the fold has cost the player a step rather than saved one. Measured
   * against the viewport, not against the strip.
   */
  for (const size of WIDTHS) {
    test(`keeps both buttons in the window at ${size.width}×${size.height}`, async ({ page }) => {
      await openShot(page, "songs-offer", size);
      const buttons = await page.$$eval(".songs-offer-actions button", (nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: n.textContent };
        }),
      );
      expect(buttons.length, "the offer has no buttons").toBe(2);
      for (const button of buttons) {
        expect(
          button.bottom <= size.height + 1 && button.top >= -1,
          `"${button.text}" is at ${Math.round(button.top)}–${Math.round(button.bottom)}, outside a ${size.height}px window`,
        ).toBe(true);
        expect(
          button.right <= size.width + 1 && button.left >= -1,
          `"${button.text}" runs from ${Math.round(button.left)} to ${Math.round(button.right)} in a ${size.width}px window`,
        ).toBe(true);
      }
    });
  }

  /**
   * The two buttons stay beside each other.
   *
   * They are a pair — yes and no — and a "Not this one" that has wrapped
   * under "Open it" reads as a second, unrelated control. The strip itself
   * may wrap (the name and the buttons go onto two lines on a narrow
   * window); the pair may not.
   */
  test("keeps yes and no on one line at the smallest window", async ({ page }) => {
    await openShot(page, "songs-offer", SMALLEST);
    await fitsOnOneLine(page, ".songs-offer-actions", "the offer's buttons");
  });

  /** A file name longer than the window is clipped, never a third line. */
  test("does not let a long file name grow the strip", async ({ page }) => {
    await openShot(page, "songs-offer", SMALLEST);
    const height = (await page.locator(".songs-offer").boundingBox())!.height;
    // Two rows of controls plus padding. Anything past this is the name
    // having wrapped, which is what `text-overflow: ellipsis` is there to
    // stop and what a sixty-character tab-site file name would otherwise do.
    expect(Math.round(height), "the offer strip is not a strip any more").toBeLessThanOrEqual(110);
  });
});
