// How much of the window the music actually gets (W36 item 2).
//
// W29 measured the frame's share of the window sideways and held the tab to
// within one gutter of the content region (`songs-stage.spec.ts`). This is the
// other axis, which nothing was asking about: the owner's window is 1124px
// tall and Songs was stacking THREE rows above the music — the app's header,
// the song's own head, and a warning banner — before the tab got a pixel.
//
// The number this prints is the frame's HEIGHT as a share of the window, which
// is the thing a player sees. The floor below it is set from what the layout
// actually reaches, so a row creeping back above the music fails here rather
// than in a screenshot six weeks later.
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { openShot, fitsOnOneLine, insideViewport, noSidewaysScroll } from "./fits";

const OUT = path.resolve(process.cwd(), ".w36-shots");

const SIZES = [
  { width: 1100, height: 900 },
  { width: 1440, height: 900 },
  { width: 2000, height: 1124 },
];

/**
 * The share of the window's height the tab's frame gets, at each size, with
 * the rail open and with it collapsed.
 *
 * Measured on the long fixture and set a point under what the layout actually
 * reaches. Before item 2 merged the song's head into the app's bar: 67.7 % at
 * 1100×900 and at 1440×900, 74.2 % at 2000×1124 — the same with the rail
 * collapsed, because the rail takes width and not height. After items 2 and
 * 3: 72.0 %, 72.0 % and 77.6 %, which is 38px of window back at every size.
 * W29 measured 74.7 % as the ceiling with the old header.
 */
const FLOOR: Record<number, number> = {
  1100: 0.71,
  1440: 0.71,
  2000: 0.77,
};

test.slow();

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

/** The frame, the stage and the window, in one read. */
async function room(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const frame = document.querySelector(".songs-tab-viewport");
    const content = document.querySelector(".main-content");
    if (!frame || !content) return null;
    const f = frame.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    return {
      frame: { top: f.top, height: f.height, width: f.width, left: f.left, right: f.right },
      content: { width: c.width, left: c.left, right: c.right },
      window: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

/** Put the rail away the way a person does — its own button. */
async function collapseRail(page: import("@playwright/test").Page) {
  const button = page.locator(".rail-collapse");
  if ((await button.count()) === 0) return false;
  await button.click();
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForTimeout(250);
  return true;
}

test.describe("the room the tab gets", () => {
  for (const size of SIZES) {
    for (const rail of ["open", "collapsed"] as const) {
      test(`gives the music its share at ${String(size.width)}×${String(size.height)}, rail ${rail}`, async ({
        page,
      }) => {
        await openShot(page, "songs", size, "ember", { song: "long" });
        if (rail === "collapsed") {
          expect(await collapseRail(page), "no rail button to collapse with").toBe(true);
        }
        const boxes = await room(page);
        expect(boxes, `no songs stage at ${String(size.width)}px`).not.toBeNull();
        const { frame, content, window: win } = boxes!;

        const share = frame.height / win.height;
        // eslint-disable-next-line no-console
        console.log(
          `[w36] ${String(size.width)}×${String(size.height)} rail ${rail}: tab frame ${String(
            Math.round(frame.width),
          )}×${String(Math.round(frame.height))} starting at y=${String(
            Math.round(frame.top),
          )} — ${(share * 100).toFixed(1)}% of the window's height, ${String(
            Math.round((frame.width / content.width) * 100),
          )}% of the stage's width`,
        );

        expect(
          share,
          `the tab is ${String(Math.round(frame.height))}px of a ${String(
            win.height,
          )}px window (${(share * 100).toFixed(1)}%) at ${String(size.width)}×${String(
            size.height,
          )} with the rail ${rail} — something above the music took a row back`,
        ).toBeGreaterThanOrEqual(FLOOR[size.width]);

        // Still rail-to-edge sideways: W29's gate, asked again with the rail
        // collapsed, which it never was.
        expect(Math.round(frame.left - content.left)).toBeLessThanOrEqual(25);
        expect(Math.round(content.right - frame.right)).toBeLessThanOrEqual(25);

        await page.screenshot({
          path: path.join(
            OUT,
            `stage-${String(size.width)}x${String(size.height)}-rail-${rail}.png`,
          ),
        });
        await noSidewaysScroll(page, `songs at ${String(size.width)} rail ${rail}`);
      });
    }
  }

  /**
   * Playing, at the owner's window — the state A13 is about, and the one the
   * pictures in the report are of.
   */
  for (const rail of ["open", "collapsed"] as const) {
    test(`photographs the stage playing at 2000×1124, rail ${rail}`, async ({ page }) => {
      await openShot(page, "songs-playing", { width: 2000, height: 1124 });
      if (rail === "collapsed") await collapseRail(page);
      const boxes = (await room(page))!;
      await page.screenshot({ path: path.join(OUT, `stage-playing-2000x1124-rail-${rail}.png`) });
      // eslint-disable-next-line no-console
      console.log(
        `[w36] playing 2000×1124 rail ${rail}: tab frame ${String(
          Math.round(boxes.frame.width),
        )}×${String(Math.round(boxes.frame.height))} — ${(
          (boxes.frame.height / boxes.window.height) *
          100
        ).toFixed(1)}% of the window's height`,
      );
      expect(boxes.frame.height / boxes.window.height).toBeGreaterThanOrEqual(FLOOR[2000]);
    });
  }

  /**
   * The air around the strip, moved rather than added (W36 item 3).
   *
   * The owner: *"the row below the alphatab is great, but can we reduce its
   * margin bottom and increase its margin top so it's not so close to the
   * tabs?"*. Before: 6px between the frame and the strip and 28px between the
   * strip and the transport — pressed against the music and floating over
   * nothing. The condition on the fix is that the frame does not pay for it.
   */
  for (const size of SIZES) {
    test(`gives the strip more room above than below at ${String(size.width)}×${String(size.height)}`, async ({
      page,
    }) => {
      await openShot(page, "songs", size, "ember", { song: "long" });
      const air = await page.evaluate(() => {
        const frame = document.querySelector(".songs-stage-frame");
        const strip = document.querySelector(".songs-strip");
        const transport = document.querySelector(".transport");
        if (!frame || !strip || !transport) return null;
        const f = frame.getBoundingClientRect();
        const s = strip.getBoundingClientRect();
        const t = transport.getBoundingClientRect();
        return { above: s.top - f.bottom, below: t.top - s.bottom, frame: f.height };
      });
      expect(air, `no strip at ${String(size.width)}px`).not.toBeNull();
      // eslint-disable-next-line no-console
      console.log(
        `[w36] ${String(size.width)}×${String(size.height)}: ${String(
          Math.round(air!.above),
        )}px above the strip, ${String(Math.round(air!.below))}px below it, frame ${String(
          Math.round(air!.frame),
        )}px tall`,
      );
      expect(
        Math.round(air!.above),
        `the strip has ${String(Math.round(air!.above))}px above it and ${String(
          Math.round(air!.below),
        )}px below — it is still closer to the music than to the transport`,
      ).toBeGreaterThan(Math.round(air!.below));
      // Not a stripe of white either: the room came off the bottom, and the
      // frame is what it was or taller (checked by FLOOR above).
      expect(Math.round(air!.above)).toBeLessThanOrEqual(28);
    });
  }

  /**
   * The one bar at the top holds together at the smallest window the app
   * opens, with nothing pushed onto a second line and nothing off the edge.
   */
  for (const size of [
    { width: 480, height: 780 },
    { width: 1100, height: 900 },
    { width: 2000, height: 1124 },
  ]) {
    test(`keeps the top bar one row at ${String(size.width)}px`, async ({ page }) => {
      await openShot(page, "songs", size);
      await insideViewport(page, ".main-header", `the header at ${String(size.width)}px`, size);
      const rows = await page.evaluate(() => {
        const header = document.querySelector(".main-header")!;
        const box = header.getBoundingClientRect();
        const tall = getComputedStyle(header).height;
        return { height: box.height, tall };
      });
      expect(
        rows.height,
        `the top bar is ${String(Math.round(rows.height))}px tall at ${String(
          size.width,
        )}px — it has wrapped onto a second row`,
      ).toBeLessThanOrEqual(64);
      // And everything in it shares the row's middle — the one question the
      // 107 tests that missed the switch outside its row were not asking.
      await fitsOnOneLine(page, ".songs-head", `the top bar at ${String(size.width)}px`);
      await noSidewaysScroll(page, `songs header at ${String(size.width)}px`);
      await page.screenshot({
        path: path.join(OUT, `top-bar-${String(size.width)}x${String(size.height)}.png`),
        clip: { x: 0, y: 0, width: size.width, height: 140 },
      });
    });
  }

  /**
   * The click's sound picker is not on this tab (W36 item 2).
   *
   * The owner: *"i don't think we need the audio preset dropdown (where it
   * says drum) right now"*. The click starts off over a file with a band of
   * its own, and what it sounds like when it is on is a metronome setting.
   * Asked the other way round as well, because "the chip is gone" would also
   * be true if the whole bar had failed to draw.
   */
  test("shows no click-sound picker on Songs, and still shows one on the metronome", async ({
    page,
  }) => {
    await openShot(page, "songs", { width: 1440, height: 900 });
    await expect(page.locator(".main-header .header-sound-wrap")).toHaveCount(0);
    await expect(page.locator(".main-header .songs-title")).toHaveCount(1);

    await openShot(page, "metronome", { width: 1440, height: 900 });
    await expect(page.locator(".main-header .header-sound-wrap")).toHaveCount(1);
    await expect(page.locator(".main-header .songs-title")).toHaveCount(0);
  });

  /**
   * What the bar sheds, and where it goes (W36 item 2).
   *
   * The brief's order is facts, then artist, then zoom — and nothing of the
   * song's may simply vanish. At the smallest window the app opens the facts
   * are in the part menu's panel and the zoom is in the bar's overflow, and
   * this walks to both of them the way a person would.
   */
  test("puts the facts in the part menu and the zoom in the overflow at 480px", async ({
    page,
  }) => {
    const size = { width: 480, height: 780 };
    await openShot(page, "songs", size);

    // Not on the row any more...
    await expect(page.locator(".songs-head .songs-facts[data-folded]")).toHaveCount(1);
    await expect(page.locator(".songs-head .songs-zoom")).toHaveCount(0);

    // ...but one press away, in the menu that is already "which part".
    await page.locator(".songs-track-chip").click();
    const facts = page.locator(".songs-track-pop-facts .songs-fact").first();
    await expect(facts).toBeVisible();
    await insideViewport(page, ".songs-track-pop", "the part menu at 480px", size);
    await page.screenshot({ path: path.join(OUT, "top-bar-480-facts-in-part-menu.png") });
    await page.keyboard.press("Escape");

    // And the zoom, in the bar's own overflow.
    await page.locator(".header-more-wrap .context-chip-icon").click();
    const zoom = page.locator(".header-more-slot .songs-zoom-btn");
    await expect(zoom).toHaveCount(2);
    await insideViewport(page, ".header-more-menu", "the overflow at 480px", size);
    await page.screenshot({ path: path.join(OUT, "top-bar-480-zoom-in-overflow.png") });

    // It is the real control: pressing it redraws the music.
    const before = await page.evaluate(
      () =>
        (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__?.settings?.display
          ?.scale ?? -1,
    );
    await zoom.nth(1).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__?.settings?.display
              ?.scale ?? -1,
        ),
      )
      .toBeGreaterThan(before);
  });
});
