import { test, expect, type Page } from "@playwright/test";
import { MOBILE_URL, openShot } from "./fits";

/*
 * The neck as the instruction, measured (acceptance pass 4, 2026-11-18).
 *
 * - P1-1: a number on a dot is a FINGER everywhere: before a Take, during it,
 *   on its result and on an ungraded one; never a fret, never an order. "next"
 *   says only "next", and never sits on a dot.
 * - P1-2: the neck keeps its height on a short window (the blocks under it
 *   scroll), and its finger numbers are 13 px and up at every window size.
 * - P2-9: NOW's ring never reaches the dot on the next string.
 * - P2-12: one row of fret numbers: the overview strip under the neck has none.
 *
 * The digit's size is its font size on screen, from where the stage draws the
 * dots (`project`): a numeral is drawn 118 px high in a 192 px sprite 0.118
 * wide, over a marker of radius 0.05 (engine/guitar.ts, engine/textures.ts),
 * so its em is 1.45 resting radii, times the kind's scale (`MARKER_SCALE`).
 */
const DIGIT_EM = (0.118 / 0.05) * (118 / 192);
const SCALE: Record<string, number> = { now: 1.3, next: 1.1 };
/** A kind's drawn radius in resting radii (`markerExtent`). */
const EXTENT = (kind: string) => (SCALE[kind] ?? 1) * 0.94 * (kind === "box" || kind === "dim" ? 0.72 : 1);

type Dot = { string: number; fret: number; kind: string; label: string | null; x: number; y: number; r: number };

async function dots(page: Page): Promise<{ mode: string; dots: Dot[] }> {
  return page.evaluate(() => {
    const c = window.__NECK__?.current;
    if (!c) return { mode: "none", dots: [] };
    const out: Dot[] = [];
    for (const n of c.getSnapshot().notes) {
      const p = c.project(n.string, n.fret);
      if (p) out.push({ string: n.string, fret: n.fret, kind: n.kind, label: n.label ?? null, x: p.x, y: p.y, r: p.r });
    }
    return { mode: c.mode, dots: out };
  });
}

/** Every number on the neck is a finger (0 to 4), and drawn at 13 px or more. */
async function fingersLegible(page: Page, where: string) {
  const got = await dots(page);
  expect(got.mode, `${where}: the 3D neck`).toBe("3d");
  const labelled = got.dots.filter((d) => d.label);
  expect(labelled.length, `${where}: fingers on the dots`).toBeGreaterThan(0);
  for (const d of labelled) {
    expect(["0", "1", "2", "3", "4"], `${where}: ${d.string}:${d.fret} says "${d.label}"`).toContain(d.label);
    const em = d.r * DIGIT_EM * (SCALE[d.kind] ?? 1);
    expect(em, `${where}: the finger on ${d.string}:${d.fret} (${d.kind}) is ${em.toFixed(1)} px`).toBeGreaterThanOrEqual(13);
  }
}

/** "next", where it is drawn, covers no dot. */
async function nextClear(page: Page, where: string) {
  const tag = page.locator('[data-testid="practice-next-tag"]');
  const shown = await tag.evaluate((el) => getComputedStyle(el).visibility === "visible");
  if (!shown) return false;
  await expect(tag, `${where}: "next" says only that`).toHaveText(/^\s*next\s*$/i);
  await expect(tag).toHaveAttribute("data-clear", "");
  const b = (await tag.boundingBox())!;
  for (const d of (await dots(page)).dots) {
    const cx = Math.max(b.x, Math.min(d.x, b.x + b.width));
    const cy = Math.max(b.y, Math.min(d.y, b.y + b.height));
    const gap = Math.hypot(d.x - cx, d.y - cy) - d.r * EXTENT(d.kind);
    expect(gap, `${where}: "next" over ${d.string}:${d.fret} (${d.kind})`).toBeGreaterThanOrEqual(0);
  }
  return true;
}

/** NOW's ring stays off every other dot. */
async function ringClear(page: Page, where: string) {
  const ring = page.locator(".practice-ring");
  if (!(await ring.evaluate((el) => getComputedStyle(el).visibility === "visible"))) return;
  const b = (await ring.boundingBox())!;
  const rx = b.x + b.width / 2;
  const ry = b.y + b.height / 2;
  for (const d of (await dots(page)).dots) {
    const dist = Math.hypot(d.x - rx, d.y - ry);
    if (d.kind === "now") continue; // the dot it rings
    const gap = dist - d.r * EXTENT(d.kind) - b.width / 2;
    expect(gap, `${where}: NOW's ring reaches ${d.string}:${d.fret} (${d.kind})`).toBeGreaterThanOrEqual(-0.5);
  }
}

const READY = ["session-neck-sweep", "session-neck-box", "session-neck-fingers"];
const SIZES = [
  { width: 1400, height: 900 },
  { width: 1024, height: 700 },
  { width: 620, height: 780 },
];

for (const size of SIZES) {
  for (const scene of [...READY, "session-result", "session-ungraded-result"]) {
    test(`${scene} at ${size.width}x${size.height}: fingers on the dots, 13 px and up, one row of fret numbers`, async ({ page }) => {
      await openShot(page, scene, size);
      await fingersLegible(page, `${scene} at ${size.width}`);
      // The strip under the neck carries no numbers: the neck's own are the one row.
      await expect(page.locator('[data-testid="neck-strip"] text')).toHaveCount(0);
      if (READY.includes(scene)) {
        // The overlay is placed again once the camera has landed (`placeOverlay`, 1.5 s).
        await page.waitForTimeout(1600);
        await ringClear(page, `${scene} at ${size.width}`);
      }
    });
  }
}

test("at 1024x700 the neck keeps its height, the input panel open or not", async ({ page }) => {
  for (const scene of ["session-neck-box", "session-input-failed"]) {
    await openShot(page, scene, { width: 1024, height: 700 });
    const neck = (await page.locator('[data-testid="practice-neck"]').boundingBox())!;
    expect(neck.height, `${scene}: the neck's slot`).toBeGreaterThanOrEqual(240);
    // No strip in a slot this short: the room is the neck's (frame = slot less its foot).
    await expect(page.locator('[data-testid="neck-strip"]')).toHaveCount(0);
    // Framed on the pattern's own frets with one either side, its dots well inside the slot.
    const got = await dots(page);
    const xs = got.dots.map((d) => d.x);
    expect(Math.min(...xs)).toBeGreaterThan(neck.x + 40);
    expect(Math.max(...xs)).toBeLessThan(neck.x + neck.width - 40);
    await fingersLegible(page, `${scene} at 1024`);
  }
  // The blocks under the neck scroll to the button rather than squeeze it.
  const big = page.locator('[data-testid="session-big"]');
  await big.scrollIntoViewIfNeeded();
  await expect(big).toBeInViewport();
});

for (const size of [
  { width: 1400, height: 900 },
  { width: 1024, height: 700 },
]) {
  for (const scene of ["session-neck-sweep-playing", "session-neck-box-playing", "session-playing"]) {
    test(`${scene} at ${size.width}: fingers while it runs, "next" never on a dot, the ring off its neighbours`, async ({ page }) => {
      await openShot(page, scene, size);
      await expect(page.locator('[data-testid="session-live"]')).toBeVisible();
      await fingersLegible(page, `${scene} at ${size.width}`);
      let shown = 0;
      for (let i = 0; i < 14; i++) {
        if (await nextClear(page, `${scene} at ${size.width}, sample ${i}`)) shown += 1;
        await page.waitForTimeout(170);
      }
      expect(shown, `${scene}: "next" found room`).toBeGreaterThan(7);
    });
  }
}

test("Watch on the sweep: NOW's ring never reaches the dot on the next string", async ({ page }) => {
  await openShot(page, "session-neck-sweep", { width: 1400, height: 900 });
  await page.locator('[data-testid="practice-watch"]').click();
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(140);
    await ringClear(page, `Watch, sample ${i}`);
  }
});

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    for (const scene of ["session-neck-sweep", "session-neck-box", "session-result", "session-ungraded-result"]) {
      test(`${scene} at ${size.width}: fingers 13 px and up`, async ({ page }) => {
        await openShot(page, scene, size);
        await fingersLegible(page, `${scene} on a ${size.width} px phone`);
      });
    }
  }
});
