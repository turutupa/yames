import { inflateSync } from "node:zlib";
import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll } from "./fits";

/**
 * The neck stage (src/stage3d), drawn for real.
 *
 * Headless Chromium has WebGL2 through SwiftShader, so these scenes run the
 * actual three.js stage: each must paint the neck INSIDE its slot (wood,
 * frets, dots: many bright, varied pixels there, and dark backdrop well
 * outside it), stop drawing once nothing moves (rule 1 of the wave-2 brief),
 * and survive the window being narrowed after it was built. `?nogl=1` takes
 * the SVG fallback, which must sit in the same slot.
 */
test.use({
  launchOptions: {
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

const SIZES = [
  { name: "wide", width: 1400, height: 900 },
  { name: "narrow", width: 620, height: 780 },
];

type Rect = { left: number; top: number; width: number; height: number };

/** Decode an 8-bit RGB/RGBA PNG, the kind Playwright writes. */
function decodePng(buf: Buffer): { width: number; height: number; px: (x: number, y: number) => [number, number, number] } {
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 2 ? 3 : 4;
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6)) throw new Error("unexpected PNG format");
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[y * stride + i - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= channels && y > 0 ? out[(y - 1) * stride + i - channels] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = v & 255;
    }
  }
  return { width, height, px: (x, y) => [out[y * stride + x * channels], out[y * stride + x * channels + 1], out[y * stride + x * channels + 2]] };
}

/** Share of sampled pixels in `r` that are lit (any channel over 60), and how many distinct colours (5-bit) they hold. */
async function painted(page: Page, r: Rect) {
  const vp = page.viewportSize()!;
  const clip = {
    x: Math.max(0, Math.floor(r.left)),
    y: Math.max(0, Math.floor(r.top)),
    width: Math.min(vp.width, Math.floor(r.left + r.width)) - Math.max(0, Math.floor(r.left)),
    height: Math.min(vp.height, Math.floor(r.top + r.height)) - Math.max(0, Math.floor(r.top)),
  };
  const png = decodePng(await page.screenshot({ clip, scale: "css" }));
  let lit = 0;
  let n = 0;
  const colours = new Set<number>();
  for (let y = 0; y < png.height; y += 3) {
    for (let x = 0; x < png.width; x += 3) {
      const [R, G, B] = png.px(x, y);
      n += 1;
      if (Math.max(R, G, B) > 60) lit += 1;
      colours.add(((R >> 3) << 10) | ((G >> 3) << 5) | (B >> 3));
    }
  }
  return { lit: lit / Math.max(1, n), colours: colours.size };
}

async function settled(page: Page) {
  await page.waitForFunction(() => {
    const c = window.__NECK__?.current;
    return !!c && c.mode === "3d" && !c.scheduler.active;
  }, undefined, { timeout: 30_000 });
  // One more frame for the compositor.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const slotRect = (page: Page) =>
  page.locator('[data-testid="stage-slot"]').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

for (const scene of ["stage-whole", "stage-zoom", "stage-pluck", "stage-flat"]) {
  for (const size of SIZES) {
    test(`${scene} paints the neck inside its slot at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, scene, size);
      await noSidewaysScroll(page, `${scene} at ${size.width}px`);
      expect(await page.evaluate(() => window.__NECK__?.current?.mode), "WebGL2 should be up under SwiftShader").toBe("3d");
      await settled(page);

      const slot = await slotRect(page);
      expect(slot.width).toBeGreaterThan(100);
      const inside = await painted(page, slot);
      expect(inside.lit, `lit share inside the slot of ${scene}`).toBeGreaterThan(0.12);
      expect(inside.colours, `colours inside the slot of ${scene}`).toBeGreaterThan(60);

      // Well below the slot is backdrop: the camera framed the neck into the slot, not the window.
      const vp = page.viewportSize()!;
      const below = { left: 0, top: slot.top + slot.height + 24, width: vp.width, height: vp.height - (slot.top + slot.height + 24) };
      if (below.height > 30) {
        const out = await painted(page, below);
        expect(out.lit, `lit share below the slot of ${scene}`).toBeLessThan(0.06);
      }

      if (scene !== "stage-whole") {
        const strip = await page.locator('[data-testid="neck-strip"]').boundingBox();
        expect(strip, "a zoom has the overview strip").not.toBeNull();
        expect(strip!.y + strip!.height).toBeLessThanOrEqual(slot.top + slot.height + 1);
        expect(strip!.y).toBeGreaterThanOrEqual(slot.top);
      }

      // Rule 1: nothing moves, nothing is drawn.
      const before = await page.evaluate(() => window.__NECK__!.current!.frames);
      await page.waitForTimeout(1000);
      expect(await page.evaluate(() => window.__NECK__!.current!.frames), "frames drawn while idle").toBe(before);
    });
  }
}

test("a pluck animates for a moment, then the stage stops again", async ({ page }) => {
  await openShot(page, "stage-zoom", SIZES[0]);
  await settled(page);
  const f0 = await page.evaluate(() => window.__NECK__!.current!.frames);
  await page.evaluate(() => window.__NECK__!.current!.facade(true).pluck(3, 7, "tone"));
  await page.waitForTimeout(300);
  const f1 = await page.evaluate(() => window.__NECK__!.current!.frames);
  expect(f1 - f0, "frames during the ring").toBeGreaterThan(3);
  await settled(page);
  const f2 = await page.evaluate(() => window.__NECK__!.current!.frames);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__NECK__!.current!.frames)).toBe(f2);
});

test("during a Take the stage draws at most 30 frames a second", async ({ page }) => {
  await openShot(page, "stage-zoom", SIZES[0]);
  await settled(page);
  /*
   * Measured on the frames themselves, not on a second of wall clock.
   *
   * It used to count the frames drawn in "one second" of a loop that slept 50
   * ms at a time. On a busy machine that second ran long (the last sleep
   * alone can overshoot by hundreds of ms), or the page was starved and five
   * frames failed "more than 5". And one failure was the app's: on a busy
   * machine the cap really did let 41 frames a second through (see
   * `FrameScheduler` on its two clocks), which a count over a stretchy second
   * could not tell from its own noise.
   *
   * The cap is a spacing rule, so the spacing is what is read: when each
   * frame the stage drew while strings rang began. Load can only stretch
   * those gaps, never shrink them. Uncapped, they are a vsync (16.7 ms).
   */
  const times = await page.evaluate(async () => {
    const c = window.__NECK__!.current!;
    const drawn: number[] = [];
    const raf = window.requestAnimationFrame.bind(window);
    // The scheduler asks `window.requestAnimationFrame` by name each time, so
    // its tick runs inside this wrapper and a frame it draws is seen here.
    window.requestAnimationFrame = (cb) =>
      raf((stamp) => {
        const before = c.frames;
        const began = performance.now();
        cb(stamp);
        if (c.frames > before) drawn.push(began);
      });
    c.setTakeRunning(true);
    const WANT = 40;
    const giveUp = performance.now() + 30_000;
    // Keep strings ringing until that many frames have been drawn.
    while (drawn.length < WANT && performance.now() < giveUp) {
      c.facade(true).pluck(1 + Math.floor(Math.random() * 6), 5, "aim");
      await new Promise((r) => setTimeout(r, 50));
    }
    c.setTakeRunning(false);
    window.requestAnimationFrame = raf;
    return drawn;
  });
  expect(times.length, "the stage stopped drawing while strings rang").toBeGreaterThanOrEqual(40);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const CAP_MS = 1000 / 30;
  // Every frame waited out the cap, less the scheduler's own slack (it wakes
  // a millisecond early to catch the vsync, and takes a frame under 2 ms out).
  const tightest = Math.min(...gaps);
  expect(tightest, `two frames ${tightest.toFixed(1)} ms apart`).toBeGreaterThanOrEqual(CAP_MS - 2.5);
  // And over the run: 30 a second, with that slack.
  const perSecond = (gaps.length * 1000) / (times[times.length - 1] - times[0]);
  expect(perSecond, `${perSecond.toFixed(1)} frames a second`).toBeLessThanOrEqual(31);
});

for (const scene of ["stage-whole", "stage-zoom"]) {
  test(`${scene} without WebGL draws the SVG fallback in its slot`, async ({ page }) => {
    await openShot(page, scene, SIZES[0], "ember", { nogl: "1" });
    expect(await page.evaluate(() => window.__NECK__?.current?.mode)).toBe("fallback");
    const slot = await slotRect(page);
    const svg = await page.locator('[data-testid="stage-slot"] [data-testid="neck-fallback"] svg').boundingBox();
    expect(svg).not.toBeNull();
    expect(svg!.width).toBeGreaterThan(slot.width * 0.5);
    expect(svg!.x).toBeGreaterThanOrEqual(slot.left - 1);
    expect(svg!.x + svg!.width).toBeLessThanOrEqual(slot.left + slot.width + 1);
    expect(svg!.y).toBeGreaterThanOrEqual(slot.top - 1);
    expect(svg!.y + svg!.height).toBeLessThanOrEqual(slot.top + slot.height + 1);
    expect(await page.locator("canvas.neck-stage-canvas").isVisible()).toBe(false);
  });
}

/*
 * The frame-time guard (src/stage3d/speed.ts). The harness lets SwiftShader
 * through its name check, which is what WebKitGTK does for every renderer (it
 * says "Apple GPU"); `?probe=1` turns the clock back on, and the clock must
 * catch it and leave the SVG neck in the slot.
 */
test("a CPU renderer the name check cannot see is caught by the frame clock", async ({ page }) => {
  await openShot(page, "stage-whole", SIZES[0], "ember", { probe: "1" });
  const r = await page.evaluate(() => {
    const c = window.__NECK__!.current! as unknown as { mode: string; lastProbe: { slow: boolean; medianMs: number; budgetMs: number } | null };
    return { mode: c.mode, probe: c.lastProbe };
  });
  expect(r.probe, "the probe ran").not.toBeNull();
  expect(r.probe!.slow, `SwiftShader at ${r.probe!.medianMs.toFixed(0)} ms against ${r.probe!.budgetMs.toFixed(0)} ms`).toBe(true);
  expect(r.mode).toBe("fallback");
  expect(await page.locator('[data-testid="stage-slot"] [data-testid="neck-fallback"] svg').count()).toBe(1);
  expect(await page.locator("canvas.neck-stage-canvas").isVisible()).toBe(false);
});
