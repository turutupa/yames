// The room the tab gets, measured — and photographed, because "is it using
// all the space it could" is a question the owner asked by looking at his
// window and no assertion in this folder was asking at all.
//
// The owner, 2026-09-21, at 2000x1124: *"the alpha tab area … is not using all
// the space it could — why doesn't it go wider? this is not a page where we
// want a max width, we want to use all we can"*. The cap came off on
// `songs-v1`; what was left was a SECOND gutter — the app pads the content
// region by 24px and `songs.css` was padding the stage by another 24 on top of
// it — so the frame started 48px right of the rail and stopped 49px short of
// the window.
//
// So the gate is a share of the room, not a pixel count: the tab's frame is
// within ONE gutter of the content region at every width. A cap, a second
// gutter or a centred column all fail it, whichever one somebody adds back.
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { openShot, noSidewaysScroll } from "./fits";

const OUT = path.resolve(process.cwd(), ".w34-shots");

/** The app's own gutter, from `shell.css`'s `.main-content`. */
const GUTTER = 24;

/**
 * The widths this is argued at.
 *
 * 1100 and 1440 are the suite's own; 2000x1124 is the owner's real window,
 * which is where the dead air was visible enough to report.
 */
const WIDTHS = [
  { name: "over the breakpoint", width: 1100, height: 900 },
  { name: "wide", width: 1440, height: 900 },
  { name: "the owner's window", width: 2000, height: 1124 },
];

test.slow();

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

/** The stage's own room: the content region minus the rail and the dock. */
async function room(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const wrapper = document.querySelector(
      '.main-content[data-view="songs"] > .view-transition-wrapper',
    );
    const content = document.querySelector(".main-content");
    const frame = document.querySelector(".songs-tab-viewport");
    if (!wrapper || !content || !frame) return null;
    const w = wrapper.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    return {
      content: { left: c.left, right: c.right, width: c.width },
      wrapper: { left: w.left, right: w.right, width: w.width },
      frame: { left: f.left, right: f.right, width: f.width, height: f.height },
    };
  });
}

test.describe("the tab uses all the room", () => {
  for (const size of WIDTHS) {
    test(`runs rail to edge at ${size.name} (${String(size.width)}px)`, async ({ page }) => {
      await openShot(page, "songs", size);
      const boxes = await room(page);
      expect(boxes, `no songs stage at ${String(size.width)}px`).not.toBeNull();
      const { content, frame } = boxes!;

      // One gutter on the left, one on the right — and no more. The content
      // region is the box the rail and the dock have already taken from, so
      // this is the whole of "use all we can".
      const leftAir = frame.left - content.left;
      const rightAir = content.right - frame.right;
      expect(
        Math.round(leftAir),
        `the tab starts ${String(Math.round(leftAir))}px right of the stage at ${String(size.width)}px — one ${String(GUTTER)}px gutter is all it may have`,
      ).toBeLessThanOrEqual(GUTTER + 1);
      expect(
        Math.round(rightAir),
        `the tab stops ${String(Math.round(rightAir))}px short of the window at ${String(size.width)}px`,
      ).toBeLessThanOrEqual(GUTTER + 1);

      // And said the other way round, as a share, so a future max-width fails
      // loudly rather than by a few pixels.
      const share = frame.width / content.width;
      expect(
        share,
        `the tab is ${String(Math.round(frame.width))}px of the stage's ${String(Math.round(content.width))}px (${String(Math.round(share * 100))}%) at ${String(size.width)}px`,
      ).toBeGreaterThan(1 - (2 * (GUTTER + 2)) / content.width);
    });
  }

  /**
   * No sideways scrollbar under the music, ever.
   *
   * The owner's screenshot had one under an eight-bar piece. alphaTab measures
   * the host and engraves to it; the vertical scrollbar then appears, takes
   * its width off the host, and the engraving no longer fits the box it was
   * drawn for. `scrollbar-gutter: stable` is what stops that happening —
   * the room is reserved whether or not the bar is showing.
   */
  for (const size of WIDTHS) {
    test(`never scrolls the tab sideways at ${String(size.width)}px`, async ({ page }) => {
      await openShot(page, "songs", size);
      const across = await page.evaluate(() => {
        const el = document.querySelector(".songs-tab-viewport");
        return el ? el.scrollWidth - el.clientWidth : null;
      });
      expect(across, `no tab viewport at ${String(size.width)}px`).not.toBeNull();
      expect(
        across!,
        `the tab scrolls ${String(across)}px sideways at ${String(size.width)}px`,
      ).toBeLessThanOrEqual(1);
      await noSidewaysScroll(page, `songs at ${String(size.width)}px`);
    });
  }

  /**
   * What is written above the first bar does not sit on top of itself.
   *
   * The owner: *"the first row's tempo mark is drawn on top of the section
   * name and the cursor"*. Before `effectBandPaddingBottom`, `♩ = 96` ended
   * at y=183 and `Verse` began at y=183 — the same pixel — with the bar
   * number's row starting one pixel after that.
   *
   * Read off the drawn SVG rather than off the settings, because what is
   * being asked is whether two pieces of engraving touch.
   */
  test("keeps the tempo mark off the section name", async ({ page }) => {
    await openShot(page, "songs", { width: 2000, height: 1124 });
    const rows = await page.evaluate(() => {
      const host = document.querySelector(".songs-tab-host");
      if (!host) return null;
      const find = (match: (s: string) => boolean) => {
        for (const node of host.querySelectorAll("text")) {
          const text = (node.textContent ?? "").trim();
          if (!match(text)) continue;
          const r = node.getBoundingClientRect();
          return { text, top: r.top, bottom: r.bottom };
        }
        return null;
      };
      return {
        tempo: find((s) => s.startsWith("= ")),
        section: find((s) => s === "Verse"),
      };
    });
    expect(rows, "no tab host").not.toBeNull();
    expect(rows!.tempo, "the tempo mark is not drawn").not.toBeNull();
    expect(rows!.section, "the section name is not drawn").not.toBeNull();
    expect(
      Math.round(rows!.section!.top - rows!.tempo!.bottom),
      `the section name starts ${String(
        Math.round(rows!.section!.top - rows!.tempo!.bottom),
      )}px after the tempo mark ends — they are on top of each other`,
    ).toBeGreaterThanOrEqual(2);
  });

  /**
   * The pictures. Not an assertion — a thing to look at.
   *
   * Stopped and playing, at the two windows the brief names, plus the numbers
   * printed beside them so a report can quote what was measured rather than
   * what was hoped for.
   */
  for (const shot of ["songs", "songs-playing"]) {
    for (const size of [
      { width: 1440, height: 900 },
      { width: 2000, height: 1124 },
    ]) {
      test(`photographs ${shot} at ${String(size.width)}x${String(size.height)}`, async ({
        page,
      }) => {
        await openShot(page, shot, size);
        const boxes = (await room(page))!;
        await page.screenshot({
          path: path.join(OUT, `${shot}-${String(size.width)}x${String(size.height)}.png`),
        });
        // eslint-disable-next-line no-console
        console.log(
          `[w34] ${shot} ${String(size.width)}x${String(size.height)}: stage ${String(
            Math.round(boxes.content.width),
          )}px, tab frame ${String(Math.round(boxes.frame.width))}x${String(
            Math.round(boxes.frame.height),
          )} — ${String(Math.round((boxes.frame.width / boxes.content.width) * 100))}% of the stage's width, left air ${String(
            Math.round(boxes.frame.left - boxes.content.left),
          )}px, right air ${String(Math.round(boxes.content.right - boxes.frame.right))}px`,
        );
        expect(boxes.frame.width).toBeGreaterThan(200);
      });
    }
  }
});
