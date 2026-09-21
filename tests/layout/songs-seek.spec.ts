// A click on the tab lands where it was clicked (W36 item 1).
//
// The owner, 2026-09-21: *"when i click on a part of the tab that is not on
// the first row … it's scrolling to the wrong location, maybe because i change
// the zoom level"*.
//
// It was not the zoom. `TabStage`'s follow-scroll measured alphaTab's own
// `.at-cursor-bar`, and alphaTab moves that element TWO animation frames after
// `api.tickPosition` is written (`playerPositionChanged` → `beginInvoke` →
// `_cursorUpdateBeat` → `beginInvoke` → `placeBarCursor`). A React effect runs
// in the same commit as the write, so the rule always read the PREVIOUS
// position. Measured here before the fix, on the 120-bar fixture at 2000×1124:
//
//   printed bar 60  — page at 1035, bar at y=1235, clicked → scrolled to 0
//   printed bar 118 — page at 1804, bar at y=2398, clicked → scrolled to 1175
//
// Both landed on the bar clicked *before* them. Changing the zoom made it
// worse rather than caused it: a re-engrave builds a new `AlphaTabApi` whose
// cursor has not been placed at all, so the next scroll went to the top.
//
// The suspects the brief named and this run rules out: alphaTab's
// `BoundsLookup.finish(scale)` multiplies every rectangle by
// `display.scale`, so the lookup is in final CSS pixels and the hit test is
// right at 0.8 and 1.4 — which is what `lands on the bar it was given` asks at
// each zoom.
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { openShot } from "./fits";

const OUT = path.resolve(process.cwd(), ".w36-shots");

const LONG = { song: "long" };
const WINDOW = { width: 2000, height: 1124 };

/** Printed bars, 0-based: early, the middle of the piece, and near the end. */
const BARS = [4, 59, 117];

/** The zooms the owner moves between, and the default in the middle. */
const ZOOMS = [0.8, 1, 1.4];

test.slow();

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

/** What the engraving is currently drawn at. */
async function zoomOf(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const api = (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__;
    return api?.settings?.display?.scale ?? -1;
  });
}

/**
 * Press the head's own − / + until the music is drawn at `want`.
 *
 * Pressed rather than poked: every press destroys the `AlphaTabApi` and
 * engraves the piece again, which is the half of this bug that only appears
 * after a re-engrave.
 */
async function setZoom(page: import("@playwright/test").Page, want: number) {
  for (let i = 0; i < 12; i++) {
    const at = await zoomOf(page);
    if (Math.abs(at - want) < 0.001) return;
    await page.locator(`.songs-zoom-btn`).nth(at > want ? 0 : 1).click();
    await expect(page.locator(".songs-tab-host[data-ready]")).toHaveCount(1, { timeout: 20_000 });
    await page.waitForTimeout(150);
  }
  expect(await zoomOf(page), `the zoom never reached ${String(want)}`).toBeCloseTo(want, 2);
}

/** Where a printed bar is engraved, in the page's own coordinates. */
async function barBox(page: import("@playwright/test").Page, printed: number) {
  return page.evaluate((bar: number) => {
    const api = (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__;
    const bounds = api?.renderer?.boundsLookup?.findMasterBarByIndex(bar);
    if (!bounds) return null;
    const b = bounds.visualBounds;
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  }, printed);
}

/** The scroller, once it has stopped moving — the scroll is smooth. */
async function settled(page: import("@playwright/test").Page): Promise<number> {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const at = await page.evaluate(
      () => document.querySelector(".songs-tab-viewport")!.scrollTop,
    );
    if (at === last) return at;
    last = at;
    await page.waitForTimeout(60);
  }
  return last;
}

test.describe("a click on the tab goes where it was clicked", () => {
  for (const zoom of ZOOMS) {
    test(`lands on the bar it was given at zoom ${String(zoom)}`, async ({ page }) => {
      await openShot(page, "songs", WINDOW, "ember", LONG);
      await setZoom(page, zoom);

      for (const printed of BARS) {
        const box = await barBox(page, printed);
        expect(box, `printed bar ${String(printed + 1)} is not engraved at zoom ${String(zoom)}`)
          .not.toBeNull();

        // Put it on the screen the way a player would — by scrolling to it —
        // and leave it comfortably inside the frame, so "the page must not
        // move" is a fair thing to ask afterwards.
        const before = await page.evaluate((y: number) => {
          const viewport = document.querySelector(".songs-tab-viewport")! as HTMLElement;
          viewport.scrollTop = Math.max(0, y - 200);
          const overlay = document.querySelector(".songs-tab-overlay")!.getBoundingClientRect();
          return {
            scrollTop: viewport.scrollTop,
            clientHeight: viewport.clientHeight,
            overlayTop: overlay.y,
            overlayLeft: overlay.x,
          };
        }, box!.y);

        const wholeBarShowing =
          box!.y >= before.scrollTop &&
          box!.y + box!.h <= before.scrollTop + before.clientHeight;
        expect(
          wholeBarShowing,
          `the test did not manage to show the whole of bar ${String(printed + 1)}`,
        ).toBe(true);

        await page.mouse.click(
          before.overlayLeft + box!.x + box!.w / 2,
          before.overlayTop + box!.y + box!.h / 2,
        );
        const after = await settled(page);

        // 1. The seek went to the bar under the pointer, at every zoom. This
        //    is the half that says the hit test reads the same units the
        //    engraving is drawn in.
        const mark = await page.evaluate(() => {
          const head = document.querySelector(".songs-tab-playhead") as HTMLElement | null;
          return head ? { left: parseFloat(head.style.left), top: parseFloat(head.style.top) } : null;
        });
        expect(mark, `no playhead after clicking bar ${String(printed + 1)}`).not.toBeNull();
        expect(
          Math.abs(mark!.top - box!.y),
          `clicking printed bar ${String(printed + 1)} at zoom ${String(zoom)} put the playhead on the row at y=${String(
            Math.round(mark!.top),
          )}, and that bar is at y=${String(Math.round(box!.y))}`,
        ).toBeLessThanOrEqual(2);
        expect(Math.abs(mark!.left - box!.x)).toBeLessThanOrEqual(2);

        // 2. And the page did not move, because the bar was already there.
        //    This is the owner's sentence, and it is the one the old rule
        //    failed by up to twelve hundred pixels.
        expect(
          after,
          `clicking printed bar ${String(printed + 1)} at zoom ${String(zoom)} scrolled the page from ${String(
            Math.round(before.scrollTop),
          )} to ${String(Math.round(after))} — the bar was already fully on screen`,
        ).toBe(before.scrollTop);
      }
    });
  }

  /**
   * A bar near the bottom edge is brought fully into view, and no further.
   *
   * The other half of "goes to the right place": when the page DOES have to
   * move, it moves by what is missing rather than to wherever the cursor last
   * was.
   */
  for (const zoom of ZOOMS) {
    test(`brings a half-shown bar in at zoom ${String(zoom)}`, async ({ page }) => {
      await openShot(page, "songs", WINDOW, "ember", LONG);
      await setZoom(page, zoom);

      const box = (await barBox(page, 59))!;
      // Scrolled so the bar hangs off the bottom by a third of its height.
      const before = await page.evaluate(
        ({ y, h }: { y: number; h: number }) => {
          const viewport = document.querySelector(".songs-tab-viewport")! as HTMLElement;
          viewport.scrollTop = Math.max(0, y + h * (2 / 3) - viewport.clientHeight);
          const overlay = document.querySelector(".songs-tab-overlay")!.getBoundingClientRect();
          return {
            scrollTop: viewport.scrollTop,
            clientHeight: viewport.clientHeight,
            overlayTop: overlay.y,
            overlayLeft: overlay.x,
          };
        },
        { y: box.y, h: box.h },
      );

      // Clicked on the part of it that IS showing.
      await page.mouse.click(
        before.overlayLeft + box.x + box.w / 2,
        before.overlayTop + box.y + box.h / 3,
      );
      const after = await settled(page);

      expect(
        box.y + box.h <= after + before.clientHeight + 1 && box.y >= after - 1,
        `after clicking a half-shown bar the page sits at ${String(Math.round(after))} and the bar runs y=${String(
          Math.round(box.y),
        )}–${String(Math.round(box.y + box.h))} in a ${String(before.clientHeight)}px frame`,
      ).toBe(true);
      // The smallest scroll that does it: down, and not past the bar's top.
      expect(after).toBeGreaterThan(before.scrollTop);
      expect(after).toBeLessThanOrEqual(Math.round(box.y) + 1);
    });
  }

  /**
   * And changing the zoom keeps the place rather than throwing it away.
   *
   * This is the case the owner noticed the bug through. A re-engrave is a new
   * `AlphaTabApi` with an unplaced cursor, so a rule that measured the cursor
   * scrolled to the top of the piece the first time the music was redrawn.
   */
  test("keeps your place in the music when the zoom changes", async ({ page }) => {
    await openShot(page, "songs", WINDOW, "ember", LONG);

    const box = (await barBox(page, 59))!;
    const seat = await page.evaluate((y: number) => {
      const viewport = document.querySelector(".songs-tab-viewport")! as HTMLElement;
      viewport.scrollTop = Math.max(0, y - 200);
      const overlay = document.querySelector(".songs-tab-overlay")!.getBoundingClientRect();
      return { overlayTop: overlay.y, overlayLeft: overlay.x };
    }, box.y);
    await page.mouse.click(seat.overlayLeft + box.x + box.w / 2, seat.overlayTop + box.y + box.h / 2);
    await settled(page);

    await setZoom(page, 1.4);
    const after = await settled(page);
    const grown = (await barBox(page, 59))!;
    const frame = await page.evaluate(
      () => document.querySelector(".songs-tab-viewport")!.clientHeight,
    );

    expect(
      grown.y + grown.h <= after + frame + 1 && grown.y >= after - 1,
      `after zooming to 1.4 the page sits at ${String(Math.round(after))} and bar 60 runs y=${String(
        Math.round(grown.y),
      )}–${String(Math.round(grown.y + grown.h))} in a ${String(frame)}px frame — the place in the music was lost`,
    ).toBe(true);

    await page.screenshot({ path: path.join(OUT, "seek-bar-60-after-zoom-1.4.png") });
    // eslint-disable-next-line no-console
    console.log(
      `[w36] bar 60 at zoom 1 y=${String(Math.round(box.y))}, at zoom 1.4 y=${String(
        Math.round(grown.y),
      )}, page scrolled to ${String(Math.round(after))} in a ${String(frame)}px frame`,
    );
  });
});
