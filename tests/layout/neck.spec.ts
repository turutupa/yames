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

/** What the stage logged on its way to the fallback, for a failure's message. */
async function stageErrors(page: Page): Promise<string> {
  return page.evaluate(() => {
    const c = window.__NECK__?.current as unknown as { errors?: string[]; mode?: string } | undefined;
    return c ? `mode ${c.mode ?? "?"}; ${(c.errors ?? []).join("; ") || "no errors logged"}` : "no stage";
  });
}

/** Every number on the neck is a finger (0 to 4), and drawn at 13 px or more. */
async function fingersLegible(page: Page, where: string) {
  // The engine arrives by a lazy import: a scene can be ready while the neck
  // is still "loading". Waited for as a state; a neck that fell back for good
  // still fails, and says what the stage said.
  try {
    await expect.poll(async () => (await dots(page)).mode, { timeout: 20_000 }).toBe("3d");
  } catch {
    throw new Error(`${where}: the 3D neck never came up (${await stageErrors(page)})`);
  }
  const got = await dots(page);
  const labelled = got.dots.filter((d) => d.label);
  expect(labelled.length, `${where}: fingers on the dots`).toBeGreaterThan(0);
  for (const d of labelled) {
    expect(["0", "1", "2", "3", "4"], `${where}: ${d.string}:${d.fret} says "${d.label}"`).toContain(d.label);
    const em = d.r * DIGIT_EM * (SCALE[d.kind] ?? 1);
    expect(em, `${where}: the finger on ${d.string}:${d.fret} (${d.kind}) is ${em.toFixed(1)} px`).toBeGreaterThanOrEqual(13);
  }
}

/**
 * The neck and what is hung over it, read in ONE task.
 *
 * The ring, "next" and the dots used to be read with a round trip each, and
 * the neck moves on between round trips: the ring measured on one note and
 * the dots on the next put the ring 50 px "off" a dot it was never near
 * (about one Watch run in three on a quiet machine, most runs on a busy
 * one). Everything a check compares is taken from the same frame now.
 */
type Overlay = {
  mode: string;
  dots: Dot[];
  /** NOW's ring: its centre and diameter on screen, when it is drawn. */
  ring: { x: number; y: number; d: number } | null;
  /** "next", when it is drawn. */
  next: { left: number; top: number; right: number; bottom: number; text: string; clear: boolean } | null;
  /** Which note is NOW and which is NEXT: a new key is a new state to sample. */
  key: string;
};

/** In the page. Kept as a string so `waitForFunction` and `evaluate` share it. */
const READ_OVERLAY = `(() => {
  const c = window.__NECK__ && window.__NECK__.current;
  if (!c) return { mode: "none", dots: [], ring: null, next: null, key: "" };
  const dots = [];
  for (const n of c.getSnapshot().notes) {
    const p = c.project(n.string, n.fret);
    if (p) dots.push({ string: n.string, fret: n.fret, kind: n.kind, label: n.label == null ? null : n.label, x: p.x, y: p.y, r: p.r });
  }
  const shown = (el) => !!el && getComputedStyle(el).visibility === "visible";
  const ringEl = document.querySelector(".practice-ring");
  let ring = null;
  if (shown(ringEl)) {
    const b = ringEl.getBoundingClientRect();
    ring = { x: b.x + b.width / 2, y: b.y + b.height / 2, d: b.width };
  }
  const tag = document.querySelector('[data-testid="practice-next-tag"]');
  let next = null;
  if (shown(tag)) {
    const b = tag.getBoundingClientRect();
    next = { left: b.left, top: b.top, right: b.right, bottom: b.bottom, text: tag.textContent || "", clear: tag.hasAttribute("data-clear") };
  }
  const of = (kind) => dots.filter((d) => d.kind === kind).map((d) => d.string + ":" + d.fret).join(",");
  return { mode: c.mode, dots, ring, next, key: of("now") + "|" + of("next") };
})()`;

/**
 * The next state worth sampling: NOW has moved on from `prev`, and the ring
 * (when `ringed`) has landed on the NOW it rings. Waited for on the page's
 * own frames, so a slow machine waits longer and samples the same thing; a
 * wall-clock tick sampled one note ten times, or none. `null` when the neck
 * stops moving (the Take or the Watch ended).
 */
async function nextState(page: Page, prev: string, ringed: boolean, timeout = 6_000): Promise<Overlay | null> {
  const handle = await page
    .waitForFunction(
      `(() => {
        const o = ${READ_OVERLAY};
        if (o.mode !== "3d" || !o.key || o.key === ${JSON.stringify(prev)}) return false;
        if (${String(ringed)}) {
          const now = o.dots.find((d) => d.kind === "now");
          if (!now || !o.ring || Math.hypot(o.ring.x - now.x, o.ring.y - now.y) > 1.5) return false;
        }
        return o;
      })()`,
      undefined,
      { polling: "raf", timeout },
    )
    .catch(() => null);
  return handle ? ((await handle.jsonValue()) as Overlay) : null;
}

/** "next", where it is drawn, covers no dot. */
function nextClear(o: Overlay, where: string): boolean {
  const b = o.next;
  if (!b) return false;
  expect(b.text, `${where}: "next" says only that`).toMatch(/^\s*next\s*$/i);
  expect(b.clear, `${where}: "next" is drawn where the app found no room for it`).toBe(true);
  for (const d of o.dots) {
    const cx = Math.max(b.left, Math.min(d.x, b.right));
    const cy = Math.max(b.top, Math.min(d.y, b.bottom));
    const gap = Math.hypot(d.x - cx, d.y - cy) - d.r * EXTENT(d.kind);
    expect(gap, `${where}: "next" over ${d.string}:${d.fret} (${d.kind})`).toBeGreaterThanOrEqual(0);
  }
  return true;
}

/** NOW's ring stays off every other dot. */
function ringClear(o: Overlay, where: string) {
  const ring = o.ring;
  if (!ring) return;
  for (const d of o.dots) {
    const dist = Math.hypot(d.x - ring.x, d.y - ring.y);
    if (d.kind === "now") continue; // the dot it rings
    const gap = dist - d.r * EXTENT(d.kind) - ring.d / 2;
    expect(gap, `${where}: NOW's ring reaches ${d.string}:${d.fret} (${d.kind})`).toBeGreaterThanOrEqual(-0.5);
  }
}

/** The frame in which the ring sits on a dot (the one it rings), or `null` if it never does. */
async function ringLanded(page: Page, timeout = 15_000): Promise<Overlay | null> {
  const handle = await page
    .waitForFunction(
      `(() => {
        const o = ${READ_OVERLAY};
        const on = o.ring && o.dots.some((d) => Math.hypot(d.x - o.ring.x, d.y - o.ring.y) <= 1.5);
        return on ? o : false;
      })()`,
      undefined,
      { polling: "raf", timeout },
    )
    .catch(() => null);
  return handle ? ((await handle.jsonValue()) as Overlay) : null;
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
        // The overlay is placed again once the camera has landed (`placeOverlay`,
        // 1.5 s on the page's own timer): waited for as a state, the ring
        // sitting on its dot, and measured in that same frame.
        const landed = await ringLanded(page);
        expect(landed, `${scene}: the ring never landed on its note`).not.toBeNull();
        ringClear(landed!, `${scene} at ${size.width}`);
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
      // The scene walks the app from Today and plays the Take in real time.
      test.slow();
      await openShot(page, scene, size);
      await expect(page.locator('[data-testid="session-live"]')).toBeVisible();
      await fingersLegible(page, `${scene} at ${size.width}`);
      // Fourteen notes of the Take, one sample each, taken as NOW moves on
      // (it was fourteen ticks of a 170 ms clock, which under load landed on
      // the same note again and again, or after the Take had ended).
      const SAMPLES = 14;
      let shown = 0;
      let taken = 0;
      let key = "";
      while (taken < SAMPLES) {
        const state = await nextState(page, key, false);
        if (!state) break;
        key = state.key;
        taken += 1;
        if (nextClear(state, `${scene} at ${size.width}, note ${taken}`)) shown += 1;
      }
      expect(taken, `${scene}: the Take stopped moving after ${taken} notes`).toBe(SAMPLES);
      expect(shown, `${scene}: "next" found room`).toBeGreaterThan(SAMPLES / 2);
    });
  }
}

/** The sweep's demo lights at least this many different notes before it ends. */
const WANT_AT_LEAST = 8;

test("Watch on the sweep: NOW's ring never reaches the dot on the next string", async ({ page }) => {
  await openShot(page, "session-neck-sweep", { width: 1400, height: 900 });
  const watch = page.locator('[data-testid="practice-watch"]');
  await watch.click();
  await expect(watch).toHaveAttribute("aria-pressed", "true");
  // One sample per note Watch lights, taken in the frame the ring has landed
  // on that note: the ring and the dots it is measured against are the same
  // moment's. Sixteen 140 ms ticks read them a round trip apart and caught
  // "the ring 50 px off" between two notes.
  const WANT = 12;
  let taken = 0;
  let key = "";
  while (taken < WANT) {
    const state = await nextState(page, key, true);
    if (!state) break;
    key = state.key;
    taken += 1;
    ringClear(state, `Watch, note ${taken}`);
  }
  expect(taken, "Watch lit too few notes to judge the ring by").toBeGreaterThanOrEqual(WANT_AT_LEAST);
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
