// One place in the song (W37 item 1).
//
// The owner, 2026-09-21: *"let's say i hit play, and i hit pause when it's on
// bar 3, if i click on bar 6 and hit play again, it will resume from bar 3 but
// then immediately go on from bar 6, as if there are 2 states for the current
// location, one when playing and another one when paused. It's causing many
// flickers or causing the vertical line to move around a lot"*.
//
// Two gestures, sampled every animation frame, the way W36 proved its own
// half: the line's x and y in the ENGRAVING's coordinates, and the viewport's
// scrollTop.
//
//   1. play → pause → click somewhere else → play.
//      The line must be at the clicked bar from the first frame and never at
//      the bar it was paused on.
//   2. play → pause → play, with no click in between.
//      A stop is a PAUSE: the line must resume where it stopped and must
//      never go back to bar one.
//
// Vitest sees none of this — happy-dom computes no geometry — and neither
// does a Rust test: what is being measured is what alphaTab draws.
import { test, expect } from "@playwright/test";
import { openShot } from "./fits";

const LONG = { song: "long" };
const WINDOW = { width: 2000, height: 1124 };

type Frame = { x: number; docY: number; scrollTop: number; at: number };

test.slow();

/** Every frame for `ms`: where the line is, and where the page is. */
async function watch(page: import("@playwright/test").Page, ms: number): Promise<Frame[]> {
  return page.evaluate(
    (span: number) =>
      new Promise<Frame[]>((resolve) => {
        const out: Frame[] = [];
        const opened = performance.now();
        const sample = () => {
          const cursor = document.querySelector(".songs-tab-host .at-cursor-beat");
          const viewport = document.querySelector(".songs-tab-viewport") as HTMLElement | null;
          const host = document.querySelector(".songs-tab-host") as HTMLElement | null;
          if (cursor && viewport && host) {
            const c = cursor.getBoundingClientRect();
            const h = host.getBoundingClientRect();
            out.push({
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

/** Where the line is right now, in the engraving's own coordinates. */
async function lineAt(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const cursor = document.querySelector(".songs-tab-host .at-cursor-beat");
    const host = document.querySelector(".songs-tab-host") as HTMLElement | null;
    if (!cursor || !host) return null;
    const c = cursor.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    return { x: c.left - h.left, y: c.top - h.top };
  });
}

/** Where a printed bar is engraved. */
async function barBox(page: import("@playwright/test").Page, printed: number) {
  return page.evaluate((bar: number) => {
    const api = (window as unknown as { __SONGS_TAB_API__?: any }).__SONGS_TAB_API__;
    const bounds = api?.renderer?.boundsLookup?.findMasterBarByIndex(bar);
    if (!bounds) return null;
    const b = bounds.visualBounds;
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  }, printed);
}

test.describe("one place in the song", () => {
  test("pause, click somewhere else, play: the line is never where it paused", async ({
    page,
  }) => {
    await openShot(page, "songs-playing", WINDOW, "ember", LONG);
    await expect(page.locator(".transport-play.playing")).toHaveCount(1);
    await expect(page.locator(".songs-tab-host .at-cursor-beat")).toHaveCount(1);

    // Let it get a few bars in, then stop. A stop is a pause, so this is
    // where the piece is now standing.
    await page.waitForTimeout(2000);
    await page.locator(".transport-play").click();
    await expect(page.locator(".transport-play.playing")).toHaveCount(0);
    await page.waitForTimeout(400);
    const paused = await lineAt(page);
    expect(paused, "no cursor after the pause").not.toBeNull();

    // Somewhere else, comfortably further down the page.
    const target = await barBox(page, 59);
    expect(target, "printed bar 60 is not engraved").not.toBeNull();
    await page.evaluate((y: number) => {
      (document.querySelector(".songs-tab-viewport") as HTMLElement).scrollTop = Math.max(
        0,
        y - 200,
      );
    }, target!.y);
    await page.waitForTimeout(200);
    await page.locator(".songs-tab-overlay").click({
      position: { x: target!.x + target!.w / 2, y: target!.y + target!.h / 2 },
    });
    await page.waitForTimeout(400);

    const clicked = await lineAt(page);
    expect(
      Math.abs(clicked!.y - target!.y),
      "the click did not move the line while the piece was stopped",
    ).toBeLessThanOrEqual(4);

    // ...and play. The engine begins AT the playhead, so every frame from
    // here is at the clicked bar or past it.
    await page.locator(".transport-play").click();
    await expect(page.locator(".transport-play.playing")).toHaveCount(1);
    const frames = await watch(page, 2600);
    expect(frames.length, "no frames were sampled").toBeGreaterThan(20);

    // eslint-disable-next-line no-console
    console.log(
      `[w37] paused at y=${String(Math.round(paused!.y))}, clicked printed bar 60 at y=${String(
        Math.round(target!.y),
      )}; on play the line ran y=${String(Math.round(frames[0].docY))}…${String(
        Math.round(frames[frames.length - 1].docY),
      )} over ${String(frames.length)} frames, the page ${String(
        Math.round(frames[0].scrollTop),
      )}…${String(Math.round(frames[frames.length - 1].scrollTop))}`,
    );

    const above = frames.filter((f) => f.docY < target!.y - 2);
    expect(
      above.length,
      `the line was above the clicked bar on ${String(above.length)} of ${String(
        frames.length,
      )} frames — the press of Play went back to where the piece was paused`,
    ).toBe(0);
    // And never on the paused row either, which is the owner's "bar 3".
    const backAtThePause = frames.filter((f) => Math.abs(f.docY - paused!.y) < 2);
    expect(
      backAtThePause.length,
      "the line took the position it was paused on after the press of Play",
    ).toBe(0);
  });

  test("pause and play again with no click: it continues from where it stopped", async ({
    page,
  }) => {
    await openShot(page, "songs-playing", WINDOW, "ember", LONG);
    await expect(page.locator(".transport-play.playing")).toHaveCount(1);
    await expect(page.locator(".songs-tab-host .at-cursor-beat")).toHaveCount(1);

    await page.waitForTimeout(2500);
    await page.locator(".transport-play").click();
    await expect(page.locator(".transport-play.playing")).toHaveCount(0);
    await page.waitForTimeout(400);
    const paused = await lineAt(page);
    expect(paused, "no cursor after the pause").not.toBeNull();
    const top = (await barBox(page, 0))!;
    expect(
      paused!.y > top.y + top.h || paused!.x > top.x + top.w,
      "the test did not get far enough from bar one to tell a pause from a rewind",
    ).toBe(true);

    await page.locator(".transport-play").click();
    await expect(page.locator(".transport-play.playing")).toHaveCount(1);
    const frames = await watch(page, 1600);
    expect(frames.length, "no frames were sampled").toBeGreaterThan(20);

    // eslint-disable-next-line no-console
    console.log(
      `[w37] paused at (${String(Math.round(paused!.x))}, ${String(
        Math.round(paused!.y),
      )}); on play the line ran (${String(Math.round(frames[0].x))}, ${String(
        Math.round(frames[0].docY),
      )})…(${String(Math.round(frames[frames.length - 1].x))}, ${String(
        Math.round(frames[frames.length - 1].docY),
      )}) over ${String(frames.length)} frames`,
    );

    // A stop is a pause: nothing may be drawn before where it stopped.
    const rewound = frames.filter(
      (f) => f.docY < paused!.y - 2 || (Math.abs(f.docY - paused!.y) <= 2 && f.x < paused!.x - 2),
    );
    expect(
      rewound.length,
      `the line went back before the pause on ${String(rewound.length)} of ${String(
        frames.length,
      )} frames — a stop rewound instead of pausing`,
    ).toBe(0);
    // And it did move on, rather than sitting there.
    expect(
      frames[frames.length - 1].x > frames[0].x || frames[frames.length - 1].docY > frames[0].docY,
      "the piece did not carry on after the second press of Play",
    ).toBe(true);
  });

  test("back to the start is the thing that rewinds", async ({ page }) => {
    await openShot(page, "songs-playing", WINDOW, "ember", LONG);
    await expect(page.locator(".transport-play.playing")).toHaveCount(1);
    await page.waitForTimeout(2000);
    await page.locator(".transport-play").click();
    await expect(page.locator(".transport-play.playing")).toHaveCount(0);
    await page.waitForTimeout(400);

    const rewind = page.locator(".transport-rewind");
    await expect(rewind, "there is no way back to the start beside Play").toHaveCount(1);
    await rewind.click();
    await page.waitForTimeout(400);

    const at = await lineAt(page);
    const top = (await barBox(page, 0))!;
    expect(
      Math.abs(at!.y - top.y),
      "back to the start did not go to the first bar's row",
    ).toBeLessThanOrEqual(4);
    // Inside the first bar, not at its left edge: alphaTab places the beat
    // cursor on the note rather than on the bar line, so the bar's box is
    // what "on bar one" means here.
    expect(
      at!.x >= top.x - 2 && at!.x <= top.x + top.w,
      `back to the start left the line at x=${String(Math.round(at!.x))} and bar one is ${String(
        Math.round(top.x),
      )}…${String(Math.round(top.x + top.w))}`,
    ).toBe(true);
  });
});
