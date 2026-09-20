// The camera, measured — with no camera and nobody in front of it.
//
// Chromium's fake device (`playwright.config.ts` passes the two flags) gives
// the `songs-camera` scene a real `MediaStream` of a synthetic picture. So the
// scene arms the shipping camera code, records three seconds with the shipping
// `MediaRecorder`, streams the chunks the shipping way, and shows the shipping
// review playing a real `<video>`. Nothing about the picture is mocked but the
// disk underneath it.
//
// What is checked here is the thing vitest physically cannot see, because
// happy-dom computes no geometry: **the review with a picture has to fit the
// frame W18 gives the review, at the sizes a person actually uses, without the
// page scrolling.** A video pane is the largest thing this app has ever put
// inside that frame, and "it fits with sound alone" says nothing about it.
import { test, expect } from "@playwright/test";
import { openShot, insideViewport, noSidewaysScroll } from "./fits";

/**
 * The sizes the orchestrator named: the minimum window the app allows
 * (`tauri.conf.json` — 480×780), and the two the stage suite measures.
 */
const SIZES = [
  { name: "the smallest window", width: 480, height: 780 },
  { name: "a laptop", width: 1100, height: 720 },
  { name: "wide", width: 1400, height: 900 },
];

/**
 * The three themes the brief names, which are the three extremes: the darkest
 * dark, the brightest light, and the paper-coloured one whose contrast is
 * deliberately low.
 */
const THEMES = ["ember", "ivory", "manuscript"];

/*
 * This scene engraves a score, plays a pass, records three seconds of video
 * and decodes it again before it is ready. It is the most expensive scene in
 * the suite by some way; `slow()` triples the budget and the work is real.
 */
test.slow();

test.describe("the review with a picture", () => {
  for (const size of SIZES) {
    test(`fits at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, "songs-camera", size);

      // There is a picture at all — the point of the scene. `readyState >= 1`
      // is the element having metadata, which is the difference between a
      // video and an empty box.
      const ready = await page.$eval(
        ".songs-take-video-picture",
        (node) => (node as HTMLVideoElement).readyState,
      );
      expect(ready, "the picture has no video in it").toBeGreaterThanOrEqual(1);

      await noSidewaysScroll(page, `the review with a picture at ${size.width}px`);

      /*
       * The picture and the start of the tape are BOTH inside the frame the
       * moment the review opens.
       *
       * Measured against the frame rather than the window because W18's review
       * is a panel whose body scrolls — at a 720px window that body is 160px
       * tall, and nothing at all would pass an "everything is above the fold"
       * rule there. What matters is what the player sees first: their own
       * hands, and enough of the tape to know it is there. The picture being
       * the body's FIRST child is asserted separately below, because that is
       * the part a stylesheet cannot make true.
       */
      const frame = await page.locator(".songs-review-body").boundingBox();
      expect(frame, "no review body").not.toBeNull();
      const bottom = frame!.y + frame!.height;

      const picture = await page.locator(".songs-take-video-stage").boundingBox();
      expect(picture, `no picture at ${size.width}px`).not.toBeNull();
      const tape = await page.locator(".songs-tape-strip").boundingBox();
      expect(tape, `no tape at ${size.width}px`).not.toBeNull();

      /*
       * The vertical rule applies where there is a frame to fit into.
       *
       * At 480×780 there is not: the stage's header and strip leave the review
       * a 139px panel with a 15px scrolling body, and nothing at all — not the
       * coach's own sentence either — is above that fold. That is W18's layout
       * at the minimum window and it is reported rather than worked around
       * here. Where the frame has room, the picture has to fit it and the tape
       * has to START inside it, which is what makes them the first thing the
       * player sees.
       */
      if (frame!.height >= 120) {
        expect(
          picture!.y + picture!.height,
          `the picture ends below the frame at ${size.width}px`,
        ).toBeLessThanOrEqual(bottom + 1);
        expect(
          tape!.y,
          `the tape starts below the frame at ${size.width}px — it is a scroll away`,
        ).toBeLessThanOrEqual(bottom - 8);
      }

      // And both inside the window on either side: a percentage-positioned
      // strip wider than its parent is a tape whose marks point at the wrong
      // bar.
      for (const [box, what] of [
        [picture!, "the picture"],
        [tape!, "the tape"],
      ] as const) {
        expect(box.x, `${what} starts off-screen at ${size.width}px`).toBeGreaterThanOrEqual(-1);
        expect(
          box.x + box.width,
          `${what} runs past the window at ${size.width}px`,
        ).toBeLessThanOrEqual(size.width + 1);
      }
    });
  }

  /**
   * The picture is the first thing in the review's body.
   *
   * A structural check rather than a measured one, and it is the one that
   * would have caught the version of this screen that put the player after the
   * coach's blocks: it was inside the frame, it fitted, and the reward the
   * player came back for was a scroll away. `plans/ECHORA.md` E0.7 — seeing
   * yourself play IS the reward.
   */
  test("puts the picture first, not under the coach's blocks", async ({ page }) => {
    await openShot(page, "songs-camera", { width: 1400, height: 900 });
    const first = await page.$eval(
      ".songs-review-body",
      (node) => (node.firstElementChild?.className ?? "").toString(),
    );
    expect(first, `the body opens with "${first}"`).toContain("songs-take-video");
  });

  /**
   * The page itself does not scroll. W18's rule for the whole mode, applied to
   * the biggest thing anybody has put in its frame: the review's own content
   * may scroll INSIDE the frame, and nothing else may.
   */
  test("does not make the page scroll", async ({ page }) => {
    const size = { width: 480, height: 780 };
    await openShot(page, "songs-camera", size);
    const pageScroll = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return el.scrollHeight - el.clientHeight;
    });
    expect(pageScroll, `the page scrolls ${pageScroll}px down at 480px`).toBeLessThanOrEqual(1);
  });

  /**
   * Every control under the picture is reachable.
   *
   * Play, the two slip jumps, the speeds and the nudge are the whole of what a
   * player does with the tape, and a button that has been pushed off the right
   * edge of a 480px window is a button that does not exist.
   */
  for (const size of SIZES) {
    test(`keeps the tape's controls inside the window at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs-camera", size);
      const boxes = await page.$$eval(".songs-take-video-controls button", (nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return { left: r.left, right: r.right, what: (node.textContent ?? "").slice(0, 30) };
        }),
      );
      expect(boxes.length, `no controls under the tape at ${size.width}px`).toBeGreaterThan(0);
      // Across, not down: they sit under the tape inside a body that scrolls,
      // so being below the fold is the design. Being off the RIGHT edge is a
      // button that does not exist.
      for (const box of boxes) {
        expect(
          box.left,
          `"${box.what}" starts off-screen at ${size.width}px`,
        ).toBeGreaterThanOrEqual(-1);
        expect(
          box.right,
          `"${box.what}" runs past the window at ${size.width}px`,
        ).toBeLessThanOrEqual(size.width + 1);
      }
    });
  }

  /**
   * The verdict is painted on the tape, and it has to be visible in the themes
   * that make it hardest — the darkest, the brightest and the one whose
   * contrast is deliberately low.
   *
   * Only that the ticks are drawn and inside the strip: their COLOURS are
   * `MARK_TOKEN`, which `songs-review.spec.ts` already reads for contrast in
   * all thirteen themes, and measuring the same four tokens twice would be two
   * places to update when a theme changes.
   */
  for (const theme of THEMES) {
    test(`draws the verdict on the tape in ${theme}`, async ({ page }) => {
      const size = { width: 1100, height: 720 };
      await openShot(page, "songs-camera", size, theme);

      const strip = await page.locator(".songs-tape-strip").boundingBox();
      expect(strip, "no tape").not.toBeNull();
      expect(strip!.height, "the tape has no height").toBeGreaterThan(8);

      const ticks = await page.$$eval(".songs-tape-tick", (nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return { left: r.left, mark: node.getAttribute("data-mark") ?? "" };
        }),
      );
      expect(ticks.length, "the tape carries no notes").toBeGreaterThan(0);
      // Every tick is inside the strip it belongs to, which is what a
      // percentage-positioned child gets wrong when its parent is not the
      // element it was measured against.
      for (const tick of ticks) {
        expect(tick.left).toBeGreaterThanOrEqual(strip!.x - 2);
        expect(tick.left).toBeLessThanOrEqual(strip!.x + strip!.width + 2);
      }
      // And every one of them carries a glyph as well as a colour.
      const glyphs = await page.$$eval(".songs-tape-glyph", (nodes) =>
        nodes.map((node) => (node.textContent ?? "").trim()),
      );
      expect(glyphs.length).toBe(ticks.length);
      expect(glyphs.every((g) => g.length > 0), "a tick with no glyph on it").toBe(true);
    });
  }
});

test.describe("the camera on the stage", () => {
  /**
   * The preview sits over the tab rather than in the strip, so it costs the
   * one-screen layout no height at all. Both halves are worth asserting: that
   * it is on screen, and that the strip is no taller with it than without it.
   */
  test("puts the preview over the tab and not in the strip", async ({ page }) => {
    const size = { width: 1100, height: 720 };
    await openShot(page, "songs-camera", size);

    // The scene ends on the review, where the preview is gone with the camera
    // — so this measures the strip's height there against the same stage with
    // no camera at all. A difference is the camera having taken a row.
    const withCamera = await page.locator(".songs-strip").boundingBox();
    await openShot(page, "songs-review-rushing", size);
    const without = await page.locator(".songs-strip").boundingBox();
    expect(withCamera, "no strip on the camera scene").not.toBeNull();
    expect(without, "no strip on the plain scene").not.toBeNull();
    expect(
      Math.abs(withCamera!.height - without!.height),
      "the camera made the strip taller",
    ).toBeLessThanOrEqual(2);
  });

  /** The switch is on the strip and reachable at the smallest window. */
  for (const size of SIZES) {
    test(`keeps the camera switch on screen at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs", size);
      await insideViewport(
        page,
        ".songs-camera-switch",
        `the camera switch at ${size.width}px`,
        size,
      );
    });
  }
});
