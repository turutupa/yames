// A long song, all of it (W34 item 5).
//
// The owner, 2026-09-21: *"I imported a tab and it feels like it's not
// rendering the entire song, just a section of it"*. He was right, and it was
// alphaTab's `enableLazyLoading`: on a 120-bar file the engraving is
// twenty-three systems and SEVEN of them had any content in the DOM. The rest
// were empty boxes of the right height, filled in a frame after you scrolled
// to them and emptied again when you scrolled away.
//
// Every song written for these pictures until now was eight bars, which fits
// on two systems, so no test in this folder could ever have asked the
// question. `?song=long` is the fixture that can: six sections, a repeat in
// the Bridge, and six screens of music at the window the owner uses.
//
// Nothing here is about pixels-per-bar. It is about whether bar 100 exists.
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { openShot, noSidewaysScroll } from "./fits";

const OUT = path.resolve(process.cwd(), ".w34-shots");

/** The fixture's own shape — `mockIpc.ts`'s `longSongTex`. */
const PRINTED_BARS = 120;
/** Four of the Bridge's bars are played twice, so the piece is longer. */
const PLAYED_BARS = 124;

const LONG = { song: "long" };

test.slow();

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

test.describe("a hundred and twenty bars", () => {
  test("brings in every bar of the file", async ({ page }) => {
    await openShot(page, "songs", { width: 2000, height: 1124 }, "ember", LONG);
    const counted = await page.evaluate(() => {
      const api = (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__;
      return {
        printed: api?.score?.masterBars?.length ?? -1,
        // What the library row says, which is what the player reads.
        row: document.querySelector(".songs-row-meta, .preset-item-meta")?.textContent ?? "",
      };
    });
    expect(counted.printed, "the importer dropped bars").toBe(PRINTED_BARS);
  });

  /**
   * And draws every one of them, at rest and at every scroll position.
   *
   * The measurement that found the bug: one `div` per system under alphaTab's
   * surface, and the empty ones are the systems that are not there.
   */
  test("leaves no system empty, wherever the page is scrolled", async ({ page }) => {
    await openShot(page, "songs", { width: 2000, height: 1124 }, "ember", LONG);

    const look = () =>
      page.evaluate(() => {
        const host = document.querySelector(".songs-tab-host")!;
        const surface = [...host.children].find((el) => el.childElementCount > 3);
        if (!surface) return null;
        const systems = [...surface.children];
        return {
          systems: systems.length,
          empty: systems.filter((el) => el.childElementCount === 0).length,
          glyphs: host.querySelectorAll("text").length,
        };
      });

    const places: string[] = [];
    for (const where of ["top", "middle", "end", "back to the top"]) {
      if (where !== "top") {
        await page.evaluate((place) => {
          const viewport = document.querySelector(".songs-tab-viewport")!;
          viewport.scrollTop =
            place === "middle"
              ? viewport.scrollHeight / 2
              : place === "end"
                ? viewport.scrollHeight
                : 0;
        }, where);
        // Two frames and then some: an intersection observer that was going
        // to empty a system has had every chance to.
        await page.waitForTimeout(400);
      }
      const seen = await look();
      expect(seen, "no engraving at all").not.toBeNull();
      expect(seen!.systems, `only ${String(seen!.systems)} systems for a 120-bar song`)
        .toBeGreaterThan(10);
      expect(
        seen!.empty,
        `${String(seen!.empty)} of ${String(seen!.systems)} systems are blank ${where}`,
      ).toBe(0);
      places.push(`${where}: ${String(seen!.systems)} systems, ${String(seen!.glyphs)} glyphs`);
    }
    // eslint-disable-next-line no-console
    console.log(`[w34] long song — ${places.join(" | ")}`);
  });

  /**
   * Bar 100 is engraved, and it is where the page says it is.
   *
   * `boundsLookup` is what every other thing on this stage asks — the
   * selection bands, the playhead mark, the hit test under a click — so a bar
   * it does not know about is a bar none of them work on.
   */
  test("knows where bar 100 is, and draws notes there", async ({ page }) => {
    await openShot(page, "songs", { width: 2000, height: 1124 }, "ember", LONG);
    const bar = await page.evaluate(() => {
      const api = (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__;
      const lookup = api?.renderer?.boundsLookup;
      const missing: number[] = [];
      for (let i = 0; i < 120; i++) {
        if (!lookup?.findMasterBarByIndex(i)) missing.push(i);
      }
      const hundred = lookup?.findMasterBarByIndex(99);
      return {
        missing: missing.slice(0, 10),
        missingCount: missing.length,
        box: hundred
          ? {
              x: hundred.visualBounds.x,
              y: hundred.visualBounds.y,
              w: hundred.visualBounds.w,
              h: hundred.visualBounds.h,
            }
          : null,
      };
    });
    expect(
      bar.missingCount,
      `${String(bar.missingCount)} bars are not engraved at all (first: ${bar.missing.join(", ")})`,
    ).toBe(0);
    expect(bar.box, "bar 100 has no box").not.toBeNull();
    expect(bar.box!.w, "bar 100 is drawn with no width").toBeGreaterThan(20);

    // Scroll it into view and check there is ink in it.
    const ink = await page.evaluate((box: { x: number; y: number; w: number; h: number }) => {
      const viewport = document.querySelector(".songs-tab-viewport")!;
      const host = document.querySelector(".songs-tab-host")! as HTMLElement;
      viewport.scrollTop = Math.max(0, box.y - 100);
      const hostBox = host.getBoundingClientRect();
      let inside = 0;
      for (const node of host.querySelectorAll("text")) {
        const r = node.getBoundingClientRect();
        const x = r.x - hostBox.x;
        const y = r.y - hostBox.y + viewport.scrollTop;
        if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) inside += 1;
      }
      return inside;
    }, bar.box!);
    expect(ink, "bar 100 is engraved but has nothing written in it").toBeGreaterThan(3);
  });

  /**
   * And the stage's own furniture works there: a click at bar 100 goes to bar
   * 100, and a drag across it makes a portion of bars near 100.
   *
   * The repeat in the Bridge is why this is asked in PRINTED bars and
   * answered in played ones: four bars are played twice, so the number in the
   * strip's field is the printed one and the engine's is not.
   */
  test("goes to bar 100 when bar 100 is clicked", async ({ page }) => {
    await openShot(page, "songs", { width: 2000, height: 1124 }, "ember", LONG);
    const target = await page.evaluate(() => {
      const api = (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__;
      const bounds = api.renderer.boundsLookup.findMasterBarByIndex(99).visualBounds;
      const viewport = document.querySelector(".songs-tab-viewport")!;
      viewport.scrollTop = Math.max(0, bounds.y - 200);
      // The overlay is INSIDE the scroller, so its own rectangle already
      // carries the scroll: a bar's engraving coordinates are added to it and
      // nothing is subtracted.
      const overlay = document.querySelector(".songs-tab-overlay")!.getBoundingClientRect();
      return {
        x: overlay.x + bounds.x + bounds.w / 2,
        y: overlay.y + bounds.y + bounds.h / 2,
      };
    });
    await page.mouse.click(target.x, target.y);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

    // The playhead's own mark is drawn on the bar that was clicked.
    const mark = await page.evaluate(() => {
      const api = (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__;
      const bounds = api.renderer.boundsLookup.findMasterBarByIndex(99).visualBounds;
      const head = document.querySelector(".songs-tab-playhead") as HTMLElement | null;
      if (!head) return null;
      return { left: parseFloat(head.style.left), top: parseFloat(head.style.top), want: bounds };
    });
    expect(mark, "no playhead mark after clicking bar 100").not.toBeNull();
    expect(
      Math.abs(mark!.left - mark!.want.x),
      `the playhead landed at ${String(Math.round(mark!.left))} and bar 100 starts at ${String(Math.round(mark!.want.x))}`,
    ).toBeLessThanOrEqual(2);
    expect(Math.abs(mark!.top - mark!.want.y)).toBeLessThanOrEqual(2);
  });

  test("never scrolls sideways, however long the song is", async ({ page }) => {
    for (const size of [
      { width: 1100, height: 900 },
      { width: 1440, height: 900 },
      { width: 2000, height: 1124 },
    ]) {
      await openShot(page, "songs", size, "ember", LONG);
      const across = await page.evaluate(() => {
        const el = document.querySelector(".songs-tab-viewport")!;
        return el.scrollWidth - el.clientWidth;
      });
      expect(
        across,
        `the long song scrolls ${String(across)}px sideways at ${String(size.width)}px`,
      ).toBeLessThanOrEqual(1);
      await noSidewaysScroll(page, `the long song at ${String(size.width)}px`);
    }
  });

  /** The picture the brief asks for: the long fixture, scrolled to bar 100. */
  test("photographs bar 100", async ({ page }) => {
    await openShot(page, "songs", { width: 2000, height: 1124 }, "ember", LONG);
    const at = await page.evaluate(() => {
      const api = (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__;
      const bounds = api.renderer.boundsLookup.findMasterBarByIndex(99).visualBounds;
      const viewport = document.querySelector(".songs-tab-viewport")!;
      viewport.scrollTop = Math.max(0, bounds.y - 200);
      return { y: bounds.y, scrollTop: viewport.scrollTop, scrollH: viewport.scrollHeight };
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "long-bar-100-2000x1124.png") });
    // eslint-disable-next-line no-console
    console.log(
      `[w34] long song: ${String(PRINTED_BARS)} printed bars (${String(PLAYED_BARS)} played), page ${String(
        at.scrollH,
      )}px tall, bar 100 at y=${String(Math.round(at.y))}, scrolled to ${String(Math.round(at.scrollTop))}`,
    );
  });
});
