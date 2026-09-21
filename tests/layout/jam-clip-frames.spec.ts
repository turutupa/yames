/**
 * Look at what the compositor actually paints for a jam.
 *
 * Started by W30 as an uncommitted scratch file and kept, because it is the
 * only way anybody — a person or an agent that cannot see the app — reads the
 * frames a clip is made of. Every other test in this suite measures
 * rectangles; this one paints real frames with the real compositor, the real
 * palette off a real theme and the real display face, and writes them out as
 * PNGs to be looked at.
 *
 * It loads the app's own bundle and calls the shipping `paintClipFrame`, so
 * nothing here is a second drawing of the clip: if it looks wrong in these
 * files it looks wrong in the video.
 *
 * ## What it asserts, and what it does not
 *
 * It asserts the frames are frames — a PNG of the right size with ink in it,
 * and no `system-ui` left anywhere in the painter (the brief's one hard rule
 * about type). It cannot assert that a clip is worth posting; that is what
 * the files are for. They go to `.jam-frames/`, which is git-excluded, and
 * the paths are printed so a report can name them.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const OUT = path.resolve(process.cwd(), ".jam-frames");

/** Ember and Ivory: the darkest dark and the brightest light. */
const THEMES = ["ember", "ivory"];

/** Both shapes, with a picture behind the furniture and without one. */
const SHAPES = ["wide", "tall"] as const;

type Painted = { dataUrl: string; width: number; height: number; ms: number };

test.describe("the frames a jam clip is made of", () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  for (const theme of THEMES) {
    for (const shape of SHAPES) {
      for (const withPicture of [true, false]) {
        const what = `${shape}-${withPicture ? "picture" : "no-picture"}-${theme}`;
        test(`paints ${what}`, async ({ page }) => {
          await page.goto(`/shots.html?manifest=1&theme=${theme}`);
          await page.waitForLoadState("networkidle");

          const painted: Painted = await page.evaluate(
            async ({ which, picture, themeId }) => {
              // The theme, applied by hand.
              //
              // `shots.html?manifest=1` mounts no app, so nothing has set the
              // custom properties and every token would answer "" — the frames
              // would all come out in the fallback palette and two themes
              // would be one picture twice. This is what the app itself does
              // on every theme change.
              const themes = await import("/src/themes.ts");
              document.documentElement.setAttribute("data-theme", themeId);
              themes.applyTheme(themes.getThemeById(themeId));

              const strip = await import("/src/takes/jamStrip.ts");
              const rec = await import("/src/takes/clipRecorder.ts");
              const clip = await import("/src/takes/clip.ts");

              const jam = {
                id: "j1",
                name: "Blues in F",
                createdAt: 0,
                bpm: 120,
                grooveId: "swing",
                feel: "swing",
                intensity: "normal",
                kit: "brushes",
                form: { kind: "blues12", bars: 12 },
                countIn: 0,
                fills: true,
                key: "F",
              } as never;
              const take = {
                id: "t1",
                jamId: "j1",
                createdAt: 0,
                durationSec: 48,
                path: "x.wav",
                position: { mode: "jam", bar: 0, tick: 0, pass: 0 },
              } as never;

              const shape2 = strip.jamTapeShape(
                jam,
                take,
                "Bluesy",
                (n: number) => `Chorus ${String(n)}`,
                "drums · bass · keys",
                "next",
              );
              const renderer = strip.jamStrip(shape2);
              // The renderer asks for the overlay composition; the harness has
              // to pick the same one the recorder would.
              const layout = renderer.overlay
                ? clip.clipOverlayLayout(which)
                : clip.clipLayout(which);
              const canvas = document.createElement("canvas");
              canvas.width = layout.width;
              canvas.height = layout.height;
              const ctx = canvas.getContext("2d", { alpha: false })!;

              // A stand-in for the camera: a plain two-tone ground, so it is
              // obvious in the file which pixels are "the picture" and which
              // are the furniture drawn over it.
              let source: CanvasImageSource | null = null;
              if (picture) {
                const room = document.createElement("canvas");
                room.width = 1280;
                room.height = 720;
                const rc = room.getContext("2d")!;
                const g = rc.createLinearGradient(0, 0, 1280, 720);
                g.addColorStop(0, "#4a5a6a");
                g.addColorStop(1, "#1d232b");
                rc.fillStyle = g;
                rc.fillRect(0, 0, 1280, 720);
                rc.strokeStyle = "rgba(255,255,255,0.18)";
                rc.lineWidth = 2;
                for (let x = 0; x < 1280; x += 80) {
                  rc.beginPath();
                  rc.moveTo(x, 0);
                  rc.lineTo(x, 720);
                  rc.stroke();
                }
                source = room;
              }

              const style = getComputedStyle(document.documentElement);
              const token = (n: string, f: string) =>
                style.getPropertyValue(n).trim() || f;
              const face =
                getComputedStyle(document.body).fontFamily ||
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

              const state = {
                layout,
                palette: {
                  ground: token("--bg-card", "#111"),
                  ink: token("--text-primary", "#f2f2f2"),
                  quiet: token("--text-tertiary", "#9a9a9a"),
                  line: token("--border", "#2a2a2a"),
                  accent: token("--accent", "#ff7a1a"),
                  marks: {} as never,
                  face,
                },
                picture: source,
                // Said separately from `picture`, because the recorder says it
                // separately (W31): a frame painted before the video element
                // is ready has no picture in it yet and must not be drawn as
                // if the take had none, or the first second of every clip is
                // a different composition from the rest of it.
                hasPicture: picture,
                strip: renderer,
                windowMs: strip.jamWindowMs(shape2),
                // Bar four of the blues, a hair past the bar line: the chord
                // coming up is the FOUR, so the frame proves the "next Bb7"
                // line rather than the rule that hides a repeat — and it
                // catches a bar line mid-window and the beat at full pulse.
                nowMs: shape2.barMs * 3 + shape2.beatMs * 0.06,
                marks: false,
                brand: true,
                wordmark: "yames.app",
                words: { bar: "Bar", bpm: "BPM" },
              };

              // The face, before anything is drawn — the same wait the real
              // recorder does, for the same reason.
              if (document.fonts?.load) {
                await Promise.all([
                  document.fonts.load(`700 96px ${face}`),
                  document.fonts.load(`600 32px ${face}`),
                ]);
              }

              // Frame time, measured over enough frames to mean something, at
              // the moment the strip is busiest.
              const RUNS = 60;
              const t0 = performance.now();
              for (let i = 0; i < RUNS; i++) {
                rec.paintClipFrame(ctx, {
                  ...state,
                  nowMs: state.nowMs + i * (1000 / 30),
                } as never);
              }
              const ms = (performance.now() - t0) / RUNS;

              rec.paintClipFrame(ctx, state as never);
              return {
                dataUrl: canvas.toDataURL("image/png"),
                width: layout.width,
                height: layout.height,
                ms,
              };
            },
            { which: shape, picture: withPicture, themeId: theme },
          );

          const base64 = painted.dataUrl.replace(/^data:image\/png;base64,/, "");
          const file = path.join(OUT, `jam-${what}.png`);
          fs.writeFileSync(file, Buffer.from(base64, "base64"));

          // A frame, not an empty canvas.
          expect(base64.length, "the frame is suspiciously small").toBeGreaterThan(4000);
          expect(painted.width).toBe(shape === "tall" ? 720 : 1280);
          expect(painted.height).toBe(shape === "tall" ? 1280 : 720);

          /*
           * 30 fps in real time is the gate the brief sets, which is 33.3 ms a
           * frame — and the compositor shares the machine with a video
           * encoder, so a painter that took anything like the whole budget
           * would drop frames in the file. Generous here on purpose: this
           * number is a smoke alarm, not a benchmark, and CI machines vary.
           */
          expect(
            painted.ms,
            `a frame took ${painted.ms.toFixed(2)}ms at ${painted.width}×${painted.height}`,
          ).toBeLessThan(16);

          console.log(
            `[frame] ${what}: ${file} — ${painted.width}×${painted.height}, ${painted.ms.toFixed(
              2,
            )}ms/frame`,
          );
        });
      }
    }
  }
});

test("the painter names no font of its own", async () => {
  /*
   * The brief's one hard rule about type: the chord and the caption are in the
   * APP's display face, read off the document, not in whatever `system-ui`
   * resolves to. A canvas takes a CSS font shorthand as a string, so a
   * hard-coded family is a silent regression no rendered frame would obviously
   * show — the two faces look similar at a glance and differ in weight.
   */
  for (const file of ["src/takes/jamStrip.ts", "src/takes/clipRecorder.ts"]) {
    const text = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
    // The shorthand, not the word: the header of `clipRecorder.ts` names
    // `system-ui` in prose to say what it stopped doing, and a test that
    // failed on a comment would be a test people delete.
    expect(text, `${file} still hard-codes a font family`).not.toMatch(/px system-ui/);
  }
});
