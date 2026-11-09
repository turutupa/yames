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

/**
 * And the same click while the song is PLAYING, which is where the owner
 * found the rest of it.
 *
 * *"when clicking on alphatab to go to a certain place, i think it's mostly
 * flaky WHEN THE TABS ARE PLAYING"*, and *"if they're not playing sometimes
 * they do a flickering thing like the cursor goes to where it was already and
 * then to the target location"*.
 *
 * One cause: the engine reports where it is once per click tick — 625 ms at
 * the fixture's 96 BPM — so for up to one of those intervals after a click
 * the webview was still interpolating from the anchor it already had. The
 * line went on walking at the bar the song was in and then teleported, and
 * the page went with it. `TabStage` believes the click at once now and
 * ignores reports until one agrees with it.
 *
 * Sampled every frame rather than asserted at the end: "it gets there
 * eventually" was always true. What was wrong was the second and a half in
 * between, and only a sample per frame can see it.
 */
test.describe("a click while the song is playing", () => {
  /** Every frame for `ms`: where the line is, and where the page is. */
  async function watch(page: import("@playwright/test").Page, ms: number) {
    return page.evaluate(
      (span: number) =>
        new Promise<{ x: number; docY: number; scrollTop: number; at: number }[]>((resolve) => {
          const out: { x: number; docY: number; scrollTop: number; at: number }[] = [];
          const opened = performance.now();
          const sample = () => {
            const cursor = document.querySelector(".songs-tab-host .at-cursor-beat");
            const viewport = document.querySelector(".songs-tab-viewport") as HTMLElement | null;
            const host = document.querySelector(".songs-tab-host") as HTMLElement | null;
            if (cursor && viewport && host) {
              const c = cursor.getBoundingClientRect();
              const h = host.getBoundingClientRect();
              out.push({
                // In the ENGRAVING's own coordinates, so a sample means the
                // same thing however the page has been scrolled.
                x: c.left - h.left,
                docY: c.top - h.top,
                scrollTop: viewport.scrollTop,
                at: performance.now() - opened,
              });
            }
            if (performance.now() - opened < span) requestAnimationFrame(sample);
            else resolve(out);
          };
          requestAnimationFrame(sample);
        }),
      ms,
    );
  }

  /**
   * A bar somebody could actually click mid-song: below the line, and on the
   * screen.
   *
   * Not a fixed bar number, because while the piece runs the page follows the
   * cursor — parking it at bar 40 and clicking there is a gesture nobody can
   * make, and a test that made it would be measuring a scroll fight rather
   * than a seek.
   */
  async function belowTheLine(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const api = (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__;
      const lookup = api?.renderer?.boundsLookup;
      const viewport = document.querySelector(".songs-tab-viewport") as HTMLElement | null;
      const host = document.querySelector(".songs-tab-host") as HTMLElement | null;
      const cursor = document.querySelector(".songs-tab-host .at-cursor-beat");
      if (!lookup || !viewport || !host || !cursor) return null;
      const lineY = cursor.getBoundingClientRect().top - host.getBoundingClientRect().top;
      let best: { index: number; x: number; y: number; w: number; h: number } | null = null;
      for (let i = 0; i < 120; i++) {
        const bounds = lookup.findMasterBarByIndex(i);
        if (!bounds) continue;
        const v = bounds.visualBounds;
        if (v.y <= lineY + 8) continue;
        if (v.y < viewport.scrollTop) continue;
        if (v.y + v.h > viewport.scrollTop + viewport.clientHeight) break;
        best = { index: i, x: v.x, y: v.y, w: v.w, h: v.h };
      }
      return best
        ? { ...best, lineY, scrollTop: viewport.scrollTop, clientHeight: viewport.clientHeight }
        : null;
    });
  }

  for (const zoom of ZOOMS) {
    test(`never walks back to where the song was at zoom ${String(zoom)}`, async ({ page }) => {
      await openShot(page, "songs-playing", WINDOW, "ember", LONG);
      await setZoom(page, zoom);
      await expect(page.locator(".transport-play.playing")).toHaveCount(1);
      await expect(page.locator(".songs-tab-host .at-cursor-beat")).toHaveCount(1);

      const box = await belowTheLine(page);
      expect(box, `no bar below the line and on screen at zoom ${String(zoom)}`).not.toBeNull();

      // Clicked through the overlay's own box, so the point is in the
      // engraving's coordinates whatever the page has scrolled to by the
      // instant the press lands — which, mid-song, is not what it was when
      // the bar was chosen.
      await page.locator(".songs-tab-overlay").click({
        position: { x: box!.x + box!.w / 2, y: box!.y + box!.h / 2 },
      });
      // Two and a half seconds, deliberately longer than the second and a
      // half the click is believed for on its own: past that the ENGINE has
      // to be the one keeping the line there. A window that stopped at the
      // backstop would pass on a seek the engine never made.
      const frames = await watch(page, 2600);
      expect(frames.length, "no frames were sampled").toBeGreaterThan(20);

      // The first few frames may still carry alphaTab's previous transform —
      // it defers a position change by two animation frames — and after that
      // the line is at the clicked bar or past it, and never above it again.
      const settled = frames.filter((f) => f.at > 120);
      expect(settled.length, "nothing was sampled after the click settled").toBeGreaterThan(10);
      // eslint-disable-next-line no-console
      console.log(
        `[w36] zoom ${String(zoom)} playing: the line was at y=${String(
          Math.round(box!.lineY),
        )}, clicked printed bar ${String(box!.index + 1)} at y=${String(
          Math.round(box!.y),
        )}; the line then ran y=${String(Math.round(settled[0].docY))}…${String(
          Math.round(settled[settled.length - 1].docY),
        )}, the page ${String(Math.round(settled[0].scrollTop))}…${String(
          Math.round(settled[settled.length - 1].scrollTop),
        )} over ${String(settled.length)} frames`,
      );

      const above = settled.filter((f) => f.docY < box!.y - 2);
      expect(
        above.length,
        `the line was above the clicked bar on ${String(above.length)} of ${String(
          settled.length,
        )} frames — it went back to where the song was`,
      ).toBe(0);

      // On the clicked bar's own row it is never left of the bar either.
      const before = settled.filter((f) => f.docY < box!.y + box!.h && f.x < box!.x - 2);
      expect(
        before.length,
        `the line was left of the clicked bar on ${String(before.length)} frames of its own row`,
      ).toBe(0);

      // And the page never lost it: the line is on the screen on every frame.
      const lost = settled.filter(
        (f) => f.docY < f.scrollTop - 2 || f.docY > f.scrollTop + box!.clientHeight + 2,
      );
      expect(
        lost.length,
        `the line was off the screen on ${String(lost.length)} of ${String(
          settled.length,
        )} frames — the page was dragged away from the bar that was clicked`,
      ).toBe(0);
    });
  }

  /**
   * Stopped, the line takes exactly one new position: no bounce.
   *
   * The owner saw it *"go to where it was already and then to the target
   * location"* — two writes to alphaTab's position, which defers each one by
   * two animation frames and so draws both.
   */
  for (const zoom of ZOOMS) {
    test(`moves once and not twice, stopped, at zoom ${String(zoom)}`, async ({ page }) => {
      await openShot(page, "songs", WINDOW, "ember", LONG);
      await setZoom(page, zoom);

      const box = (await barBox(page, 39))!;
      await page.evaluate((y: number) => {
        const viewport = document.querySelector(".songs-tab-viewport")! as HTMLElement;
        viewport.scrollTop = Math.max(0, y - 200);
      }, box.y);

      // Sampling starts BEFORE the press, so the old position is in the
      // series and "it moved once" is a thing that can be said about it.
      const watching = watch(page, 1200);
      await page.locator(".songs-tab-overlay").click({
        position: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
      });
      const frames = await watching;
      expect(frames.length, "no frames were sampled").toBeGreaterThan(20);

      const key = (f: { x: number; docY: number }) =>
        `${String(Math.round(f.x))},${String(Math.round(f.docY))}`;
      const runs: string[] = [];
      for (const frame of frames) {
        const at = key(frame);
        if (runs[runs.length - 1] !== at) runs.push(at);
      }
      // eslint-disable-next-line no-console
      console.log(`[w36] zoom ${String(zoom)} stopped: the line took ${runs.join(" -> ")}`);
      expect(
        runs.length,
        `the line took ${String(runs.length)} positions (${runs.join(" -> ")}) — one press should move it once`,
      ).toBeLessThanOrEqual(2);
      // And it ended on the bar that was clicked.
      const last = frames[frames.length - 1];
      expect(Math.abs(last.docY - box.y)).toBeLessThanOrEqual(box.h);
      expect(last.x).toBeGreaterThanOrEqual(box.x - 2);
    });
  }
});
