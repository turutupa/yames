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
import { openShot, insideViewport, noSidewaysScroll, IN_ENGLISH } from "./fits";

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
       * The vertical rule, at every size — the skip is gone (W25 item 1).
       *
       * W21 had to skip this at 480×780, because the stage's head and strip
       * left the review a 181px panel and nothing at all was above that fold.
       * The strip now stands down while a verdict is up (`songs.css`), which
       * gives the review the whole column, and the coach's sentence moved into
       * the review's own pinned head — so there is a frame to fit into at
       * every window the app opens, and this asks about all of them.
       */
      expect(
        picture!.y + picture!.height,
        `the picture ends below the frame at ${size.width}px`,
      ).toBeLessThanOrEqual(bottom + 1);
      expect(
        tape!.y,
        `the tape starts below the frame at ${size.width}px — it is a scroll away`,
      ).toBeLessThanOrEqual(bottom - 8);

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
   * The verdict itself is on screen at the smallest window the app opens.
   *
   * W25 item 1, and the point of the whole change: the coach's sentence, the
   * button that acts on it, and the top of the player's own hands, all inside
   * a 480×780 window with nothing scrolled. Measured against the VIEWPORT
   * rather than against a frame — this is the "is it above the fold" question,
   * and the fold is the window.
   */
  test("shows the sentence, the fix and the picture at the smallest window", async ({ page }) => {
    const size = { width: 480, height: 780 };
    await openShot(page, "songs-camera", size);

    for (const [selector, what] of [
      [".songs-review-said .coach-block-sentence", "the coach's sentence"],
      [".songs-review-said .coach-block-button", "the fix"],
    ] as const) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box, `${what} is not on the review`).not.toBeNull();
      expect(box!.y, `${what} starts below the window`).toBeLessThanOrEqual(size.height);
      expect(
        box!.y + box!.height,
        `${what} ends ${Math.round(box!.y + box!.height - size.height)}px below the window`,
      ).toBeLessThanOrEqual(size.height);
      expect(box!.x, `${what} starts off the left`).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width, `${what} runs past the right`).toBeLessThanOrEqual(size.width + 1);
    }

    // And the top of the picture, which is the reward (`ECHORA.md` E0.7). Its
    // TOP, not its whole height: the body scrolls, and what matters is that a
    // player who stops sees their own hands without asking for them.
    const picture = await page.locator(".songs-take-video-stage").boundingBox();
    expect(picture, "no picture").not.toBeNull();
    expect(
      picture!.y,
      `the picture starts ${Math.round(picture!.y - size.height)}px below the window`,
    ).toBeLessThan(size.height);

    // Nothing above had to be scrolled to.
    const scrolled = await page.$eval(".songs-review-body", (node) => node.scrollTop);
    expect(scrolled, "the review's body was already scrolled").toBe(0);
  });

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

/**
 * "Save as a video" (W25 item 2, `plans/ECHORA.md` D4).
 *
 * The only question worth asking about a video is whether it is one, and no
 * assertion about a `Blob` answers it. So the scene makes a real clip — the
 * shipping compositor, the shipping `canvas.captureStream()`, the shipping
 * audio graph and the shipping `MediaRecorder`, in real time — and these
 * tests open the bytes it produced.
 */
test.describe("the clip you can send somebody", () => {
  /** The choices fit, at every window the app opens. */
  for (const size of SIZES) {
    test(`keeps its choices inside the window at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs-clip", size);
      const boxes = await page.$$eval(".songs-clip-options button", (nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return { left: r.left, right: r.right, what: (node.textContent ?? "").slice(0, 30) };
        }),
      );
      expect(boxes.length, `no choices at ${size.width}px`).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(box.left, `"${box.what}" starts off-screen`).toBeGreaterThanOrEqual(-1);
        expect(box.right, `"${box.what}" runs past the window`).toBeLessThanOrEqual(size.width + 1);
      }
      await noSidewaysScroll(page, `the clip's choices at ${size.width}px`);
    });
  }

  /**
   * It is a real video, with real sound in it.
   *
   * Four facts, and each of them is a different way the export could be
   * quietly broken: the container's own magic bytes say it is a file a player
   * will open; the picture is a whole number of seconds of 1280×720; there is
   * an audio track at all; and the audio is NOT SILENT — which is the one the
   * others cannot catch, because a `MediaStreamAudioDestinationNode` that was
   * never connected to anything produces a perfectly valid track full of
   * zeros. The harness's take carries a tone for exactly this.
   *
   * Decoded in the page rather than by a tool: the browser that wrote the
   * file is the one asked to read it back, and the suite gains no dependency.
   */
  test("writes a real video, with the take's sound in it", async ({ page }) => {
    await openShot(page, "songs-clip-make", { width: 1100, height: 720 });

    const clip = await page.evaluate(async () => {
      const made = (window as unknown as { __SHOT_CLIP__?: { url: string; bytes: number } })
        .__SHOT_CLIP__;
      if (!made) return null;
      const buffer = await (await fetch(made.url)).arrayBuffer();
      const head = [...new Uint8Array(buffer.slice(0, 12))];
      // `ftyp` at offset 4 is an MP4; 0x1A45DFA3 at 0 is a Matroska/WebM.
      const container =
        String.fromCharCode(head[4], head[5], head[6], head[7]) === "ftyp"
          ? "mp4"
          : head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3
            ? "webm"
            : "neither";

      let peak = 0;
      let seconds = 0;
      let channels = 0;
      try {
        const ctx = new OfflineAudioContext(1, 1, 48_000);
        const decoded = await ctx.decodeAudioData(buffer.slice(0));
        seconds = decoded.duration;
        channels = decoded.numberOfChannels;
        const samples = decoded.getChannelData(0);
        for (let i = 0; i < samples.length; i += 17) {
          const value = Math.abs(samples[i]);
          if (value > peak) peak = value;
        }
      } catch {
        // Left at zero, which fails below and says so.
      }
      return { bytes: made.bytes, container, peak, seconds, channels };
    });

    expect(clip, "no clip was made").not.toBeNull();
    expect(clip!.container, "the bytes are not a video container").not.toBe("neither");
    // A ten-second 720p clip at four megabits is about a megabyte. A file of
    // a few kilobytes is a container with no pictures in it.
    expect(clip!.bytes, "the clip is too small to have a picture in it").toBeGreaterThan(200_000);
    expect(clip!.channels, "the clip has no audio track").toBeGreaterThan(0);
    // The chosen bars are four bars at 96 BPM, which is ten seconds, and the
    // export is real time — so a clip that is not about ten seconds long is
    // an export that stopped early or never started.
    expect(clip!.seconds, `the clip is ${clip!.seconds.toFixed(1)}s long`).toBeGreaterThan(8);
    expect(clip!.seconds).toBeLessThan(13);
    expect(
      clip!.peak,
      "the clip's audio track is silent — the mix never reached the recorder",
    ).toBeGreaterThan(0.01);
  });

  /**
   * ...and once it is saved, the player is told where it went and given
   * somewhere to put it (the owner's second pass on item 2).
   *
   * The links are checked to be the SITES' OWN upload pages and nothing
   * else: the whole design is that Yames opens a tab and the player drags
   * the file in, so a link that pointed anywhere but outwards would be the
   * feature quietly becoming an integration.
   */
  test("says where the clip went and offers somewhere to put it", async ({ page }) => {
    await openShot(page, "songs-clip-make", { width: 1400, height: 900 });
    await expect(page.locator(".songs-clip-done")).toHaveCount(1);
    await expect(page.locator(".songs-clip-share .songs-clip-place")).toHaveCount(4);
    if (IN_ENGLISH) {
      await expect(page.locator(".songs-clip-share").first()).toContainText("Show in folder");
      for (const name of ["Instagram", "TikTok", "YouTube", "X"]) {
        await expect(page.getByRole("button", { name, exact: true })).toHaveCount(1);
      }
    }
    // Nothing off the right edge of the panel.
    const panel = await page.locator(".songs-clip").boundingBox();
    const chips = await page.$$eval(".songs-clip-share button", (nodes) =>
      nodes.map((n) => n.getBoundingClientRect().right),
    );
    for (const right of chips) {
      expect(right).toBeLessThanOrEqual(panel!.x + panel!.width + 1);
    }
  });
});

/**
 * Then and now (W25 item 3, `plans/ECHORA.md` A2).
 *
 * The scene is a review whose headline is `improved`, with one earlier run at
 * the same bars in the store — a month ago, at 70 % — and its recording on
 * the shelf. What the coach offers under the sentence is the two of them,
 * side by side.
 */
test.describe("then and now", () => {
  test("draws both takes, each with its own tape", async ({ page }) => {
    await openShot(page, "songs-compare", { width: 1400, height: 900 });
    await expect(page.locator(".songs-compare-side")).toHaveCount(2);
    // Each side's own tape, from its own pass: the old run was judged at its
    // own tempo against its own boundaries, and one tape drawn twice would be
    // a comparison of a pass with itself.
    await expect(page.locator(".songs-compare .songs-tape-strip")).toHaveCount(2);
    if (IN_ENGLISH) {
      await expect(page.locator(".songs-compare-label").first()).toHaveText("Then");
      await expect(page.locator(".songs-compare-label").nth(1)).toHaveText("Now");
    }
    // Side by side where there is room, which is what "side by side" means.
    const boxes = await page.$$eval(".songs-compare-side", (nodes) =>
      nodes.map((n) => n.getBoundingClientRect().top),
    );
    expect(new Set(boxes.map(Math.round)).size, "the two are stacked at 1400px").toBe(1);
  });

  /** ...and one under the other where there is not, with nothing off-screen. */
  test("stacks rather than squeezing at the smallest window", async ({ page }) => {
    const size = { width: 480, height: 780 };
    await openShot(page, "songs-compare", size);
    await noSidewaysScroll(page, "then and now at 480px");
    const boxes = await page.$$eval(".songs-compare-side", (nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { top: Math.round(r.top), left: r.left, right: r.right };
      }),
    );
    expect(boxes.length).toBe(2);
    expect(new Set(boxes.map((b) => b.top)).size, "still side by side at 480px").toBe(2);
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(size.width + 1);
    }
  });

  /**
   * The claim the whole thing rests on: the two are locked to BARS.
   *
   * March was at 70 % and tonight at 100 %, so after a few seconds the older
   * recording is several seconds further behind in its own file — and both
   * are at the same bar of the music. Asserted on the elements' own
   * `currentTime`, which is the only place the truth is: a test that read the
   * app's own idea of where they were would be asking the code to confirm
   * itself.
   */
  test("holds the two to the same BAR while their clocks differ", async ({ page }) => {
    await openShot(page, "songs-compare", { width: 1400, height: 900 });
    await page.locator(".songs-compare-controls button").first().click();
    // Long enough for the leader to cross several bar lines — a bar of the
    // fixture is 2.5 s at 96 BPM and 3.6 s at 67.
    await page.waitForTimeout(6000);

    const seen = await page.$$eval(".songs-compare audio", (nodes) =>
      nodes.map((n) => (n as HTMLAudioElement).currentTime),
    );
    expect(seen.length, "the two takes have no audio").toBe(2);
    const [older, newer] = seen;
    expect(newer, "the newer take never started playing").toBeGreaterThan(1);

    // 70 % against 100 %: the older recording covers the same bars in about
    // 1/0.7 of the time, so at the same bar it is that much further into its
    // own file. Locked to SECONDS the two would be equal, which is the bug
    // this exists to make impossible.
    const ratio = older / newer;
    expect(
      ratio,
      `the older take is at ${older.toFixed(2)}s against ${newer.toFixed(2)}s — ratio ${ratio.toFixed(2)}`,
    ).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.7);
  });
});

/**
 * Takes look like takes (W25 item 4, addendum 10).
 *
 * A frame of the picture, what the take was a go AT, and a filter for the
 * ones that were filmed — inside a popover `useMenuPlacement` caps at 320px,
 * which is the constraint the whole row has to live in.
 */
test.describe("the takes shelf", () => {
  for (const size of SIZES) {
    test(`shows a frame and the facts, inside 320px at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs-takes", size);
      await expect(page.locator(".songs-takes-pop")).toHaveCount(1);
      await expect(page.locator(".songs-take")).toHaveCount(3);
      // Two of the three were filmed, and their boxes hold an image; the
      // third has the same box, empty, so the rows stay scannable.
      await expect(page.locator(".songs-take-thumb img")).toHaveCount(2);
      await expect(page.locator(".songs-take-thumb[data-empty]")).toHaveCount(1);
      await expect(page.locator(".songs-take-was")).toHaveCount(3);

      const pop = await page.locator(".songs-takes-pop").boundingBox();
      expect(pop, "no shelf").not.toBeNull();
      expect(pop!.width, `the shelf is ${Math.round(pop!.width)}px wide`).toBeLessThanOrEqual(320);
      expect(pop!.x, "the shelf starts off-screen").toBeGreaterThanOrEqual(-1);
      expect(pop!.x + pop!.width, "the shelf runs past the window").toBeLessThanOrEqual(
        size.width + 1,
      );

      // Nothing clipped: the score is the end of the facts line and the one
      // an ellipsis would eat.
      const clipped = await page.$$eval(".songs-take-was", (nodes) =>
        nodes.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
      );
      expect(clipped, "a take's facts are cut off").toBe(0);
      for (const row of await page.$$eval(".songs-take", (nodes) =>
        nodes.map((n) => n.getBoundingClientRect()),
      )) {
        expect(row.right).toBeLessThanOrEqual(pop!.x + pop!.width + 1);
      }
    });
  }

  /** The filter narrows the list to the ones with a picture, and says so. */
  test("filters to the takes that were filmed", async ({ page }) => {
    await openShot(page, "songs-takes", { width: 1400, height: 900 });
    await page.locator(".songs-takes-filter").click();
    await expect(page.locator(".songs-take")).toHaveCount(2);
    await expect(page.locator(".songs-take-thumb[data-empty]")).toHaveCount(0);
    await page.locator(".songs-takes-filter").click();
    await expect(page.locator(".songs-take")).toHaveCount(3);
  });
});

test.describe("the camera on the stage", () => {
  /**
   * The preview sits over the tab rather than in the strip, so it costs the
   * one-screen layout no height at all. Both halves are worth asserting: that
   * it is on screen, and that the strip is no taller with it than without it.
   */
  test("puts the preview over the tab and not in the strip", async ({ page }) => {
    const size = { width: 1100, height: 720 };
    // Both scenes are of a stage being PLAYED rather than reviewed: a verdict
    // takes the strip's room now (W25 item 1), so the strip is not drawn on
    // either review scene and comparing two absences proves nothing. The
    // camera is open in the first and has never been opened in the second,
    // which is the difference this is about.
    await openShot(page, "songs-camera-armed", size);
    const preview = await page.locator(".songs-camera-preview").boundingBox();
    expect(preview, "no preview on the armed stage").not.toBeNull();

    const withCamera = await page.locator(".songs-strip").boundingBox();
    await openShot(page, "songs", size);
    const without = await page.locator(".songs-strip").boundingBox();
    expect(withCamera, "no strip on the camera scene").not.toBeNull();
    expect(without, "no strip on the plain scene").not.toBeNull();
    expect(
      Math.abs(withCamera!.height - without!.height),
      "the camera made the strip taller",
    ).toBeLessThanOrEqual(2);
  });

  /**
   * The switch is reachable, and on screen once it is reached.
   *
   * W29 — one press away rather than none: the strip is one row now and the
   * camera went into "More" with the record switch it belongs to and the
   * band. It is still on a footswitch (`yames:songs-camera`), which is the
   * door A13 cares about most, and it is still a thing you arm before a pass
   * rather than change during one.
   */
  for (const size of SIZES) {
    test(`keeps the camera switch on screen at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs", size);
      await page.locator(".songs-more-chip").click();
      await expect(page.locator(".songs-more-pop")).toHaveCount(1);
      await insideViewport(
        page,
        ".songs-camera-switch",
        `the camera switch at ${size.width}px`,
        size,
      );
    });
  }
});
