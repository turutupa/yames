import { test, expect, type Page } from "@playwright/test";
import { noSidewaysScroll } from "./fits";

/**
 * The coach's blocks, measured in a real browser.
 *
 * Everything else about them is checked in happy-dom, which computes no
 * geometry — every element there is zero by zero, so "the chord box is
 * squeezed to thirty pixels with six strings drawn in it" is invisible to
 * every unit test in this repo. It is also a bug the Jam chord chart has
 * already shipped once, and the blocks reuse that very component.
 *
 * The page is `/blocks-gallery.html`, the dev-only workbench: every block in
 * the catalogue, in all thirteen themes. Nothing in the app links to it and
 * Vite's production build does not include it.
 *
 * ## The two widths
 *
 * **380px** is the coach dock (U1.6) — the narrowest the blocks ever have to
 * work at, and the width a six-block answer has to fit into.
 * **520px** is the narrowest window the Jam suite measures, which is the
 * narrowest anybody drags this app to.
 */
const WIDTHS = [
  { name: "the coach dock", width: 380, height: 900 },
  { name: "a narrow window", width: 520, height: 900 },
];

async function openGallery(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto("/blocks-gallery.html");

  /*
   * That the page is the gallery at all, before waiting thirty seconds for
   * it to say it is ready.
   *
   * Vite answers an unknown .html with `index.html`, so a dev server
   * belonging to another checkout returns 200 and serves the APP. That used
   * to be reachable: the config pinned one port for every worktree and
   * reused whatever was listening on it, so two workers running this suite
   * at once was all it took, and the failure read as "the gallery never
   * finished drawing" when the gallery was never served. The config now
   * takes a port of this checkout's own and starts its own server; this
   * guard stays because the failure was expensive and silent.
   */
  const title = await page.title();
  const origin = new URL(page.url()).origin;
  expect(
    title,
    `${origin} answered with "${title}" — that is not this checkout's gallery. Stop whatever else is on that port and run again.`,
  ).toContain("blocks");

  await page
    .waitForFunction(() => window.__GALLERY_READY__ === true, undefined, { timeout: 30_000 })
    .catch(() => {
      throw new Error("the blocks gallery never settled");
    });
  // One frame for the container queries to restyle, one for the compositor.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

declare global {
  interface Window {
    __GALLERY_READY__?: boolean;
  }
}

test.describe("every block, in every theme", () => {
  for (const size of WIDTHS) {
    test(`stays inside its card at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openGallery(page, size);

      const spills = await page.$$eval(".coach-block", (blocks) =>
        blocks
          .map((block) => {
            const card = block.closest(".gallery-scene");
            if (!card) return null;
            const b = block.getBoundingClientRect();
            const c = card.getBoundingClientRect();
            const theme =
              block.closest("[data-theme]")?.getAttribute("data-theme") ?? "?";
            const what = block.getAttribute("data-block") ?? "?";
            // One pixel of tolerance: a border-box edge and a child's edge
            // meant to touch can land a fraction apart after scaling.
            if (Math.round(b.right) <= Math.round(c.right) + 1 && Math.round(b.left) >= Math.round(c.left) - 1)
              return null;
            return `${theme}/${what}: ${Math.round(b.left)}–${Math.round(b.right)} against the card's ${Math.round(c.left)}–${Math.round(c.right)}`;
          })
          .filter((line): line is string => line !== null),
      );

      expect(spills, `blocks hanging out of their card at ${size.width}px`).toEqual([]);
      await noSidewaysScroll(page, `the blocks gallery at ${size.width}px`);
    });

    test(`keeps its drawings readable at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openGallery(page, size);

      /*
       * A chord box carries `max-width: 100%`, and a box squeezed narrower
       * than its own strings is the Jam chart's bug all over again.
       *
       * Measured per instrument, because the two natural widths differ and a
       * single floor would either miss a squeezed guitar box or fail every
       * honest bass one: `ChordDiagram` at `md` scales a six-string box to
       * 132px, and a four-string bass box is the same scale over four
       * strings — 94px, at full size and not squeezed at all.
       */
      const boxes = await page.$$eval(".coach-block .chord-diagram svg", (nodes) =>
        nodes.map((n) => ({
          width: Math.round(n.getBoundingClientRect().width),
          strings: Number(n.querySelector("[data-strings]")?.getAttribute("data-strings") ?? 0),
        })),
      );
      expect(boxes.length, "no chord boxes on the page").toBeGreaterThan(10);

      const natural: Record<number, number> = { 6: 132, 4: 94 };
      for (const box of boxes) {
        const want = natural[box.strings];
        expect(want, `a chord box with ${box.strings} strings — new instrument?`).toBeDefined();
        expect(
          box.width,
          `a ${box.strings}-string box is ${box.width}px, squeezed from ${want}px`,
        ).toBeGreaterThanOrEqual(want - 2);
      }

      // And the neck, which is the widest thing a block draws.
      const necks = await page.$$eval(".coach-block .fretboard", (nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          const parent = (n.parentElement as HTMLElement).getBoundingClientRect();
          return Math.round(r.right - parent.right);
        }),
      );
      expect(necks.length, "no necks on the page").toBeGreaterThan(10);
      expect(Math.max(...necks), "a neck runs past the block that holds it").toBeLessThanOrEqual(1);
    });
  }
});

test.describe("a six-block answer", () => {
  test("fits the coach dock at its narrowest", async ({ page }) => {
    // The catalogue's cap is six, and "Every button" is exactly six blocks.
    // This is the answer that has to fit where the coach actually lives.
    await openGallery(page, { width: 380, height: 900 });

    const scene = page.locator(".gallery-theme[data-theme='mono'] .gallery-scene", {
      hasText: "Every button",
    });
    await expect(scene.locator(".coach-block")).toHaveCount(6);

    const width = page.viewportSize()!.width;
    const rights = await scene.locator(".coach-block-button").evaluateAll((nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().right)),
    );
    expect(rights.length, "the six buttons are not all drawn").toBe(6);
    for (const right of rights) {
      expect(right, `a button ends at ${right}, past the ${width}px dock`).toBeLessThanOrEqual(width);
    }

    // Stacked, not overlapping: each block starts at or below the one above.
    const rows = await scene.locator(".coach-block").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
      }),
    );
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].top, `block ${i + 1} overlaps the one above it`).toBeGreaterThanOrEqual(
        rows[i - 1].bottom - 1,
      );
    }
  });
});

test.describe("an answer whose references mean nothing", () => {
  test("draws the one line that resolved and not a frame for the rest", async ({ page }) => {
    /*
     * D3 rule 1, measured: six bad references and one good sentence. What
     * must NOT be on screen is an empty card where a chord box would go —
     * the failure mode of every renderer that draws its frame first and its
     * content second.
     */
    await openGallery(page, { width: 520, height: 900 });

    const scene = page.locator(".gallery-theme[data-theme='mono'] .gallery-scene", {
      hasText: "What gets dropped",
    });
    await expect(scene.locator(".coach-block")).toHaveCount(1);
    await expect(scene.locator(".coach-block-sentence")).toHaveText(
      "Only this line should be on screen.",
    );
    // The workbench lists what went, so the owner can see it was deliberate.
    await expect(scene.locator("[data-testid='gallery-dropped'] li")).toHaveCount(6);
  });
});
