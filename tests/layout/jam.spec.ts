import { test, expect } from "@playwright/test";
import { openShot, fitsOnOneLine, noSidewaysScroll } from "./fits";

/**
 * The Jam playing screen, measured in a real browser.
 *
 * Written the day the owner reported "the piano has more drop downs making
 * the on off switch show up out of the table" — a bug that passed 4298 unit
 * tests, because they run in happy-dom, which computes no geometry at all.
 * Every element there is zero by zero, so a row whose contents run off its
 * right-hand edge measures exactly the same as one that fits.
 *
 * The widths are the four the layout actually changes at: a narrow window,
 * either side of the 1024px breakpoint where the live note readout gives up
 * its room, and the size the screenshots are taken at.
 */
const WIDTHS = [
  { name: "narrow", width: 520, height: 900 },
  { name: "under the breakpoint", width: 760, height: 900 },
  { name: "over the breakpoint", width: 1100, height: 900 },
  { name: "wide", width: 1400, height: 900 },
];

test.describe("the band rows", () => {
  for (const size of WIDTHS) {
    test(`hold their controls at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, "jam", size);
      // Every row: the name, the detail, the player's own picker, the live
      // readout, the volume and the on/off switch, all on one line inside the
      // row. This is the assertion the reported bug fails.
      await fitsOnOneLine(page, ".jam-band-lane", `band rows at ${size.width}px`);
      await noSidewaysScroll(page, `the jam screen at ${size.width}px`);
    });
  }

  test("keeps the volume and the switch reachable on every player's row", async ({ page }) => {
    // The two controls that were pushed out. A row that draws them off screen
    // "fits" by every other measure — they are still inside the row, the row
    // is just past the window — so they are checked against the WINDOW.
    await openShot(page, "jam", { width: 760, height: 900 });
    const width = page.viewportSize()!.width;

    for (const control of [".jam-band-volume", ".jam-band-lane > .jam-switch"]) {
      const boxes = await page.$$eval(control, (nodes) =>
        nodes.map((n) => n.getBoundingClientRect().right),
      );
      expect(boxes.length, `no ${control} on the screen`).toBeGreaterThan(0);
      for (const right of boxes) {
        expect(Math.round(right), `${control} ends at ${Math.round(right)}, past the window`)
          .toBeLessThanOrEqual(width);
      }
    }
  });

  test("puts every player's picker in the same column", async ({ page }) => {
    // Not a fit but a tidiness the grid is there to give: the drums row's
    // groove, the bass row's figure and the keys row's comping are one column
    // down the screen, so the eye reads them as the same kind of thing.
    await openShot(page, "jam-band", { width: 1400, height: 900 });
    const lefts = await page.$$eval(".jam-band-extra .jam-dropdown", (nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().left)),
    );
    expect(lefts.length, "no player pickers on the screen").toBeGreaterThan(1);
    expect(new Set(lefts).size, `the pickers start at ${lefts.join(", ")}`).toBe(1);
  });
});

test.describe("the key, on the playing screen", () => {
  test("opens its menu inside the window", async ({ page }) => {
    // The chip sits at the right-hand end of the header, so a menu hung from
    // its left ran off the screen; the picker measures the room and flips.
    // Whether it flipped correctly is a question only a browser can answer.
    await openShot(page, "jam", { width: 1400, height: 900 });
    await page.click(".jam-key-picker .jam-dropdown");
    const menu = await page.waitForSelector(".jam-key-menu");
    const box = (await menu.boundingBox())!;
    const width = page.viewportSize()!.width;

    expect(Math.round(box.x), "the key menu starts off the left of the window").toBeGreaterThanOrEqual(0);
    expect(Math.round(box.x + box.width), "the key menu runs off the right of the window")
      .toBeLessThanOrEqual(width);
  });

  test("still fits when the window is narrow", async ({ page }) => {
    await openShot(page, "jam", { width: 520, height: 900 });
    await page.click(".jam-key-picker .jam-dropdown");
    const box = (await (await page.waitForSelector(".jam-key-menu")).boundingBox())!;
    expect(Math.round(box.x)).toBeGreaterThanOrEqual(0);
    expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await noSidewaysScroll(page, "the jam screen with the key menu open");
  });
});
