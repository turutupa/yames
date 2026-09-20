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

  /**
   * And the strip it appears above does not move.
   *
   * The whole shape of the Songs stage is "one screen, and the controls are
   * reachable with a guitar on". An offer that pushed the bars, the speed and
   * the band off the bottom would undo that on exactly the screen a new
   * player is on. It cannot: `.songs-view` is a fixed-height column whose one
   * flexible child is the tab frame. This is that, measured.
   */
  test("does not push the stage's controls out of the window", async ({ page }) => {
    for (const size of [SMALLEST, { width: 1100, height: 720 }]) {
      await openShot(page, "songs-offer", size);
      await noSidewaysScroll(page, `the offer at ${size.width}px`);
      // The offer scene opens on the empty state, which has no strip — so
      // this asks whether there is one before measuring it, rather than
      // waiting thirty seconds for a control that is not on this screen.
      const strip = page.locator(".songs-strip");
      if ((await strip.count()) > 0) {
        const box = (await strip.boundingBox())!;
        expect(
          Math.round(box.y + box.height),
          `the strip ends at ${Math.round(box.y + box.height)} in a ${size.height}px window`,
        ).toBeLessThanOrEqual(size.height + 1);
      }
      // Nothing outside the tab frame scrolls, offer or no offer.
      const scrolls = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement;
        return el.scrollHeight - el.clientHeight;
      });
      expect(scrolls, `the window scrolls ${scrolls}px with an offer on it`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("the shelf Yames ships with", () => {
  /**
   * The library is never empty, and the seven pieces fit in it.
   *
   * The scene lets the real seeding run against an empty store, so these are
   * the pieces the app actually ships — imported by the real importer, drawn
   * by the real sidebar. What can go wrong is a title plus an "Included"
   * marker that does not fit the row, which is invisible to vitest because
   * happy-dom computes no geometry at all.
   */
  for (const size of [
    { width: 1100, height: 720 },
    { width: 1400, height: 900 },
  ]) {
    test(`puts seven pieces in the library at ${size.width}×${size.height}`, async ({ page }) => {
      await openShot(page, "songs-starter", size);
      await noSidewaysScroll(page, `the starter shelf at ${size.width}px`);

      const rows = page.locator(".preset-sidebar-item.song-item");
      expect(await rows.count(), "the shelf did not arrive").toBe(7);

      // Every row is marked as having come with Yames, and every marker is
      // inside its own row rather than hanging off the end of it.
      const marked = await page.$$eval(".preset-sidebar-item.song-item", (nodes) =>
        nodes.map((node) => {
          const row = node.getBoundingClientRect();
          const mark = node.querySelector(".song-item-starter")?.getBoundingClientRect();
          const name = node.querySelector(".preset-item-name")!.getBoundingClientRect();
          return {
            text: node.querySelector(".preset-item-name")?.textContent ?? "",
            rowRight: row.right,
            rowLeft: row.left,
            markRight: mark?.right ?? null,
            nameWidth: name.width,
          };
        }),
      );
      for (const row of marked) {
        expect(row.markRight, `"${row.text}" is not marked as included`).not.toBeNull();
        expect(
          Math.round(row.markRight!),
          `the marker on "${row.text}" ends at ${Math.round(row.markRight!)}, past the row's ${Math.round(row.rowRight)}`,
        ).toBeLessThanOrEqual(Math.round(row.rowRight) + 1);
        // And the marker has not squeezed the name to nothing: a row that
        // says "Included" and shows three letters of the title is worse than
        // one that says nothing.
        expect(row.nameWidth, `"${row.text}" has no room left for its name`).toBeGreaterThan(40);
      }
    });
  }

  /** One of them on the stage, at the smallest window the app opens. */
  test(`plays a shipped piece at ${SMALLEST.width}×${SMALLEST.height}`, async ({ page }) => {
    await openShot(page, "songs-starter", SMALLEST);
    await noSidewaysScroll(page, `a shipped piece at ${SMALLEST.width}px`);
    const strip = await page.locator(".songs-strip").boundingBox();
    expect(strip, "no controls on the stage").not.toBeNull();
    expect(
      Math.round(strip!.y + strip!.height),
      `the strip ends at ${Math.round(strip!.y + strip!.height)} in a ${SMALLEST.height}px window`,
    ).toBeLessThanOrEqual(SMALLEST.height + 1);
  });
});
