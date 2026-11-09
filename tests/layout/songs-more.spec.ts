// The "More" panel, which the owner photographed not rendering (W36 item 4).
//
// His screenshot, 2026-09-21, had four things wrong in one panel:
//
//   * the band's rows were wider than the panel — the mute switches cut in
//     half at the right edge, with a sideways scrollbar under them;
//   * the part names were cut to seven letters ("Lead Gu…", "Rhythm …",
//     "Addition…") with room to spare on the row;
//   * the record mark on "Record the take" drew as a broken glyph over the
//     first letter of the word;
//   * the chip read "More 1" with nothing to say what the 1 counted.
//
// Not one of them can be seen on a three-part file, which is every song
// written for these pictures until now: a lane is only squeezed once there
// are enough of them to put a scrollbar down the side. `?song=band2`,
// `band6` and `band12` are files with that many parts, the second of them
// named with forty characters (`mockIpc.ts`).
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { openShot, insideViewport, noSidewaysScroll } from "./fits";

const OUT = path.resolve(process.cwd(), ".w36-shots");

/** The windows the panel has to survive: the owner's, and the smallest. */
const WINDOWS = [
  { name: "the owner's window", width: 2000, height: 1124 },
  { name: "the smallest window", width: 480, height: 780 },
];

const PARTS = [2, 6, 12];

test.slow();

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

/** Open the strip's "More", the way a person does. */
async function openMore(page: import("@playwright/test").Page) {
  await page.locator(".songs-more-chip").click();
  await expect(page.locator(".songs-more-pop")).toHaveCount(1);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

test.describe("the More panel", () => {
  for (const size of WINDOWS) {
    for (const parts of PARTS) {
      test(`fits every lane inside itself with ${String(parts)} parts at ${size.name}`, async ({
        page,
      }) => {
        await openShot(page, "songs", size, "ember", { song: `band${String(parts)}` });
        await openMore(page);

        const seen = await page.evaluate(() => {
          const pop = document.querySelector(".songs-more-pop") as HTMLElement;
          const band = document.querySelector(".songs-more-pop .songs-band") as HTMLElement;
          const popBox = pop.getBoundingClientRect();
          const lanes = [...pop.querySelectorAll(".songs-band-lane")].map((lane) => {
            const l = lane.getBoundingClientRect();
            const parts = [...lane.children].map((child) => {
              const c = child.getBoundingClientRect();
              return {
                what: (child.className || child.tagName).toString().slice(0, 40),
                left: c.left,
                right: c.right,
                width: c.width,
              };
            });
            return { left: l.left, right: l.right, parts };
          });
          return {
            pop: { left: popBox.left, right: popBox.right, width: popBox.width },
            across: pop.scrollWidth - pop.clientWidth,
            bandAcross: band ? band.scrollWidth - band.clientWidth : 0,
            bandDown: band ? band.scrollHeight - band.clientHeight : 0,
            lanes,
            name:
              pop.querySelector(".songs-band-name-text")?.textContent ?? "",
            names: [...pop.querySelectorAll(".songs-band-name-text")].map((n) =>
              (n.textContent ?? "").trim(),
            ),
          };
        });

        // eslint-disable-next-line no-console
        console.log(
          `[w36] More with ${String(parts)} parts at ${String(size.width)}px: panel ${String(
            Math.round(seen.pop.width),
          )}px, ${String(seen.lanes.length)} lanes, band scrolls ${String(
            seen.bandDown,
          )}px down and ${String(seen.bandAcross)}px across`,
        );

        expect(seen.lanes.length, "the band drew no lanes").toBe(parts + 1);

        // 1. Nothing in a lane sticks out of the panel. The three that were
        //    clipped in the owner's picture are the last three children of
        //    every lane, so this is the assertion about them.
        for (const [i, lane] of seen.lanes.entries()) {
          for (const child of lane.parts) {
            if (child.width === 0) continue;
            expect(
              Math.round(child.right),
              `lane ${String(i + 1)}'s "${child.what}" ends at ${String(
                Math.round(child.right),
              )}, past the panel's ${String(Math.round(seen.pop.right))}`,
            ).toBeLessThanOrEqual(Math.round(seen.pop.right));
            expect(Math.round(child.left)).toBeGreaterThanOrEqual(
              Math.round(seen.pop.left) - 1,
            );
          }
        }

        // 2. No sideways scroll inside a popover, ever — not the panel, not
        //    the band inside it, and not the window under both.
        expect(seen.across, `the panel scrolls ${String(seen.across)}px sideways`).toBeLessThanOrEqual(1);
        expect(
          seen.bandAcross,
          `the band scrolls ${String(seen.bandAcross)}px sideways inside the panel`,
        ).toBeLessThanOrEqual(1);
        await noSidewaysScroll(page, `the More panel with ${String(parts)} parts`);

        // 3. And the panel is inside the window, however many parts there are.
        await insideViewport(
          page,
          ".songs-more-pop",
          `the More panel with ${String(parts)} parts at ${size.name}`,
          size,
        );

        await page.screenshot({
          path: path.join(OUT, `more-${String(parts)}-parts-${String(size.width)}.png`),
        });
      });
    }
  }

  /**
   * A forty-character part name is readable, and the slider is what gave the
   * room up for it.
   *
   * The owner: names *"cut to seven letters with room to spare"*. Seven is
   * what a 74px box holds; the point of the fix is that the box is not 74px
   * any more, it is whatever the lane has left after the slider has given
   * what it can.
   */
  test("shows far more of a long part name than the seven letters it used to", async ({
    page,
  }) => {
    await openShot(page, "songs", { width: 2000, height: 1124 }, "ember", { song: "band12" });
    await openMore(page);

    const seen = await page.evaluate(() => {
      const names = [...document.querySelectorAll(".songs-more-pop .songs-band-name-text")];
      const long = names.find((n) => (n.textContent ?? "").length > 30);
      if (!long) return null;
      const box = long.getBoundingClientRect();
      const fader = long.closest(".songs-band-lane")?.querySelector(".songs-band-fader");
      return {
        text: long.textContent ?? "",
        shown: box.width,
        wanted: long.scrollWidth,
        fader: fader ? fader.getBoundingClientRect().width : 0,
      };
    });
    expect(seen, "no long part name in the panel").not.toBeNull();
    // eslint-disable-next-line no-console
    console.log(
      `[w36] "${seen!.text}" is drawn ${String(Math.round(seen!.shown))}px wide of the ${String(
        Math.round(seen!.wanted),
      )}px it wants, with a ${String(Math.round(seen!.fader))}px fader beside it`,
    );
    // 74px held about seven letters of this face. Anything over 120 is more
    // than half the name and is the difference the owner asked for.
    expect(
      seen!.shown,
      `the long name is drawn ${String(Math.round(seen!.shown))}px wide — it is still being cut short`,
    ).toBeGreaterThan(120);
    // And the slider gave first: it is at or near its floor rather than
    // sitting at its full width while the name is squeezed.
    expect(seen!.fader).toBeGreaterThanOrEqual(40);
  });

  /**
   * The record mark is a dot, the same one "Record the picture" draws.
   *
   * It was a `<span>` with a width, a height and a 50 % radius inside a
   * button that is not a flex container — so the span was inline, took none
   * of them, and drew a curl of border over the R of "Record".
   */
  test("draws the record mark as a dot beside the word, not over it", async ({ page }) => {
    await openShot(page, "songs", { width: 2000, height: 1124 }, "ember", { song: "band6" });
    await openMore(page);

    const marks = await page.evaluate(() => {
      const read = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const box = el.getBoundingClientRect();
        const button = el.closest("button")!.getBoundingClientRect();
        return {
          w: box.width,
          h: box.height,
          // How far into the button the mark sits, and how far the text
          // starts after it: a mark drawn OVER the first letter has a right
          // edge past where the text begins.
          left: box.left - button.left,
          right: box.right - button.left,
          buttonWidth: button.width,
        };
      };
      return { record: read(".songs-record-dot"), camera: read(".songs-camera-dot") };
    });

    expect(marks.record, "no record mark in the panel").not.toBeNull();
    // eslint-disable-next-line no-console
    console.log(
      `[w36] the record mark is ${String(Math.round(marks.record!.w))}×${String(
        Math.round(marks.record!.h),
      )} at x=${String(Math.round(marks.record!.left))}; the camera's is ${String(
        Math.round(marks.camera?.w ?? -1),
      )}×${String(Math.round(marks.camera?.h ?? -1))}`,
    );
    // A real box, not an inline span that took neither number.
    expect(
      Math.round(marks.record!.w),
      "the record mark has no width — it is still an inline span",
    ).toBeGreaterThanOrEqual(7);
    expect(Math.round(marks.record!.h)).toBeGreaterThanOrEqual(7);
    // Square, so a 50% radius is a circle rather than a curl.
    expect(Math.abs(marks.record!.w - marks.record!.h)).toBeLessThanOrEqual(1);
    // And the same mark the camera's switch draws.
    if (marks.camera) {
      expect(Math.round(marks.record!.w)).toBe(Math.round(marks.camera.w));
      expect(Math.round(marks.record!.h)).toBe(Math.round(marks.camera.h));
    }
  });

  /**
   * The figure on the chip says what it counts — in the tooltip and in the
   * button's accessible name, not only in a number nobody can read.
   */
  test("says what the number on the More chip counts", async ({ page }) => {
    await openShot(page, "songs", { width: 2000, height: 1124 }, "ember", { song: "band6" });
    const chip = page.locator(".songs-more-chip");

    // Nothing turned down: no figure at all.
    await expect(chip.locator(".songs-band-opener-off")).toHaveCount(0);

    // Turn two parts down through the panel's own switches.
    await openMore(page);
    const switches = page.locator(".songs-more-pop .songs-band-switch");
    await switches.nth(1).click();
    await switches.nth(2).click();
    await page.keyboard.press("Escape");

    await expect(chip.locator(".songs-band-opener-off")).toHaveText("2");
    const title = await chip.getAttribute("title");
    expect(title, "the figure on the chip says nothing about what it counts").toBeTruthy();
    expect(title!).toContain("2");
    // eslint-disable-next-line no-console
    console.log(`[w36] the More chip's figure is explained as "${String(title)}"`);
    // And a screen reader hears the sentence rather than "More 2".
    const named = await chip.evaluate((el) => el.textContent ?? "");
    expect(named).toContain(title!);
  });
});
