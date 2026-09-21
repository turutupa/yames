// The camera on the jam stage, measured — with no camera and nobody in front
// of it.
//
// Chromium's fake device (`playwright.config.ts` passes the two flags) gives
// the `jam-camera` scene a real `MediaStream` of a synthetic picture, so the
// scene arms the shipping camera code and the shipping preview draws a real
// `<video>`. Nothing about the picture is mocked but the disk underneath it.
//
// What is checked here is the thing vitest physically cannot see, because
// happy-dom computes no geometry: **the little mirror must not cover the
// chord, the form's bar grid, or the transport.** A jam is read at arm's
// length off two things — what you are playing over, and where in the form
// you are — and a picture of your own face over either of them would make the
// mode unusable with the camera on. That is exactly the class of bug the
// layout suite exists for; `AGENTS.md` says four thousand unit tests have
// shipped it twice.
//
// Two of the three decisions in `jam.css` came out of this file: the first
// version of the mirror sat ten pixels off the bottom of the stage and landed
// on Stop at 1100×720, and the second was a hundred and sixty pixels below
// the fold at 480×780 because the jam stage is a column that scrolls.
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { openShot, noSidewaysScroll } from "./fits";

/**
 * The window sizes the brief names — and the smallest of them is a different
 * test rather than a smaller one. See `NO_ROOM` below.
 */
const ROOMY = [
  { name: "a laptop", width: 1100, height: 720 },
  { name: "wide", width: 1440, height: 900 },
];

/** The minimum window the app allows (`tauri.conf.json`). */
const NO_ROOM = { name: "the smallest window", width: 480, height: 780 };

/**
 * The three extremes: the darkest dark, the brightest light, and the
 * paper-coloured one whose contrast is deliberately low.
 */
const THEMES = ["ember", "ivory", "manuscript"];

/* The scene loads a jam, turns two switches on through their promises and
 * waits for a camera to answer. It is expensive and the work is real. */
test.slow();

type Box = { x: number; y: number; width: number; height: number };

/** Do two rectangles share any pixel at all? */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe("the mirror on the jam stage", () => {
  for (const theme of THEMES) {
    for (const size of ROOMY) {
      test(`covers nothing at ${size.name} (${size.width}px) under ${theme}`, async ({ page }) => {
        await openShot(page, "jam-camera", size, theme);

        // There is a picture at all — the point of the scene. `readyState >= 1`
        // is the element having metadata, which is the difference between a
        // video and an empty box.
        const ready = await page.$eval(
          ".jam-camera-preview .songs-camera-video",
          (node) => (node as HTMLVideoElement).readyState,
        );
        expect(ready, "the preview has no video in it").toBeGreaterThanOrEqual(1);

        await noSidewaysScroll(page, `the jam stage with the camera on at ${size.width}px`);

        const preview = await page.locator(".jam-camera-preview").boundingBox();
        expect(preview, "no preview on the stage").not.toBeNull();

        /*
         * The chord, and the form.
         *
         * `.jam-now` is what you are playing over and `.jam-timeline-section`
         * is where in the form you are — the two things a jam IS. Both are
         * measured rather than assumed, because the preview's corner is
         * remembered across sessions and a stylesheet change that moved
         * either of them would put the picture on top without anything else
         * in the suite noticing.
         */
        for (const selector of [".jam-now", ".jam-timeline-section"]) {
          const target = page.locator(selector).first();
          if ((await target.count()) === 0) continue;
          const box = await target.boundingBox();
          if (!box) continue;
          expect(
            overlaps(preview!, box),
            `the preview covers ${selector} at ${size.width}px under ${theme}`,
          ).toBe(false);
        }

        /*
         * Stop, and the count-in.
         *
         * Both live in the window's own transport, which the mirror is lifted
         * 96px clear of. A MEASURED guarantee rather than a structural one —
         * the first version of this landed on Stop at 1100×720 — so it is
         * measured at every size rather than argued once.
         */
        const transport = page.locator(".transport-play").first();
        if ((await transport.count()) > 0) {
          const box = await transport.boundingBox();
          if (box) {
            expect(
              overlaps(preview!, box),
              `the preview covers the transport at ${size.width}px under ${theme}`,
            ).toBe(false);
          }
        }

        /*
         * And it is ON THE SCREEN. A mirror anchored to the bottom of a column
         * that is taller than the room it has is a mirror below the fold,
         * which is the same bug as covering something and harder to notice.
         */
        const vp = page.viewportSize()!;
        expect(preview!.y, "the preview starts above the window").toBeGreaterThanOrEqual(0);
        expect(
          preview!.y + preview!.height,
          `the preview runs ${String(
            Math.round(preview!.y + preview!.height - vp.height),
          )}px below the window at ${size.width}px under ${theme}`,
        ).toBeLessThanOrEqual(vp.height + 1);
        expect(preview!.x).toBeGreaterThanOrEqual(-1);
        expect(preview!.x + preview!.width).toBeLessThanOrEqual(vp.width + 1);
      });
    }
  }
});

test.describe("the smallest window", () => {
  for (const theme of THEMES) {
    test(`shows no mirror, and still says the camera is on, under ${theme}`, async ({ page }) => {
      await openShot(page, "jam-camera", NO_ROOM, theme);

      /*
       * Measured at 480×780: the stage is 314px wide and the form's bar grid
       * runs the whole of it, from y 493 down to the transport. There is no
       * rectangle left for a picture, so the MIRROR gives way rather than the
       * grid — a player reads a jam off the chord and the form, and a picture
       * of their own face over either is worse than no picture at all.
       */
      await expect(page.locator(".jam-camera-preview")).toBeHidden();

      // Nothing about the recording changed: the camera is open, and the chip
      // in the setup sheet says so with the dot that means "actually open".
      const chip = page.locator('.jam-sheet [data-player="takes"] .songs-camera-switch');
      await expect(chip).toHaveAttribute("aria-pressed", "true");
      await expect(chip.locator(".songs-camera-dot[data-live]")).toHaveCount(1);

      await noSidewaysScroll(page, "the jam stage with the camera on at 480px");
    });
  }
});

test.describe("the camera's switch", () => {
  test("sits with the take's own controls, and says the camera is on", async ({ page }) => {
    await openShot(page, "jam-camera", { width: 1440, height: 900 });

    // In the takes group of the setup sheet, which is where Record the take
    // and the sound source are — one place that answers "what is kept of this
    // jam", rather than a camera control somewhere else on the screen.
    const chip = page.locator('.jam-sheet [data-player="takes"] .songs-camera-switch');
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveAttribute("aria-pressed", "true");

    // The dot that says the camera is actually OPEN, not merely switched on.
    // A laptop's own light is two millimetres and half the people who own one
    // have a sticker over it, so the app says it (`CameraControl`).
    await expect(chip.locator(".songs-camera-dot[data-live]")).toHaveCount(1);
  });
});

/**
 * "See yourself" — the answer to the mirror not being there (W33 §3).
 *
 * The stage draws no mirror below 900px, and W32's own report called out what
 * that leaves: a player at a small window records a picture they have never
 * seen. So the camera chip gained a neighbour, and what matters about it is
 * that it exists at the size the mirror does NOT, that it opens a real live
 * picture, and that the picture stays inside the window it was opened in —
 * a portalled panel off a control deep in a drawer is exactly the shape of
 * bug this suite was written for.
 */
test.describe("seeing yourself when there is no mirror", () => {
  for (const size of [NO_ROOM, { name: "a laptop", width: 1100, height: 720 }]) {
    test(`opens a live picture at ${size.name} (${String(size.width)}px)`, async ({ page }) => {
      await openShot(page, "jam-camera", size);

      const peek = page.locator(".songs-camera-peek");
      await expect(peek, "no way to see yourself with the camera on").toHaveCount(1);
      await expect(peek).toHaveAttribute("aria-expanded", "false");
      await peek.click();

      const pop = page.locator(".songs-camera-peek-pop");
      await expect(pop).toHaveCount(1);
      // A real picture, not an empty box: the same `readyState >= 1` the
      // stage's own preview is held to. Polled, because a camera hands over
      // its first frame when it is ready and not when a test asks.
      await expect
        .poll(
          () =>
            page.$eval(
              ".songs-camera-peek-pop video",
              (node) => (node as HTMLVideoElement).readyState,
            ),
          { message: "the picture has no video in it", timeout: 15_000 },
        )
        .toBeGreaterThanOrEqual(1);

      // Inside the window, both ways. It is allowed to cover the grid while
      // it is open — you are not reading the form while you are framing up —
      // but a panel half off the screen is a panel nobody can use.
      //
      // Measured after a breath: `useMenuPlacement` places against the chip
      // the instant the panel mounts and places again on every scroll, and
      // the press itself scrolls the drawer. A reading taken in the same tick
      // as the click is a reading of where the chip WAS.
      await page.waitForTimeout(250);
      const box = (await pop.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.y).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);

      await noSidewaysScroll(page, `the jam screen with the picture open at ${String(size.width)}px`);

      // Escape shuts it, like every other menu on this screen.
      await page.keyboard.press("Escape");
      await expect(pop).toHaveCount(0);
    });
  }
});

/** The stage with the camera on, photographed for a person to look at. */
test.describe("what the stage looks like", () => {
  const OUT = path.resolve(process.cwd(), ".jam-shots");
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });
  for (const theme of ["ember", "ivory"]) {
    for (const size of [NO_ROOM, ...ROOMY]) {
      test(`photographs the stage at ${String(size.width)}px under ${theme}`, async ({ page }) => {
        await openShot(page, "jam-camera", size, theme);
        /*
         * The drawer is shut first, and the first-run hint with it.
         *
         * The scene has to OPEN the drawer to reach the two switches — there
         * is no other door — but what this photograph is of is the STAGE with
         * the camera on it, and at 480px the drawer is the whole window.
         * Closing it is what a player does the moment they have armed the
         * thing, so it is also the state they actually play in.
         */
        const hint = page.getByRole("button", { name: "Got it", exact: true });
        if ((await hint.count()) > 0) await hint.first().click();
        const done = page.locator(".jam-sheet-done, .jam-sheet-frame-done").first();
        if ((await done.count()) > 0) await done.click();
        else {
          const label = page.getByRole("button", { name: "Done", exact: true });
          if ((await label.count()) > 0) await label.first().click();
        }
        await expect(page.locator(".jam-sheet")).toHaveCount(0);
        await page.waitForTimeout(300);
        const file = path.join(OUT, `jam-stage-${String(size.width)}-${theme}.png`);
        await page.screenshot({ path: file });
        console.log(`[shot] ${file}`);
      });
    }
  }
});
