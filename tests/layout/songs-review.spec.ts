// The review, measured — and read for contrast in all thirteen themes.
//
// The review is the one screen in Songs whose whole job is to be READ: a
// sentence, a button, and a tab with a coloured mark under every note. Two
// failures are invisible to every unit test in this repo, because happy-dom
// computes no geometry and no cascade:
//
//   - a bar of sixteenths is thirty-two columns, and at 520px it either
//     wraps into porridge or pushes the window sideways;
//   - a mark drawn in `--feedback-ok` on `--bg-base` is legible in nine
//     themes and invisible in the other four.
//
// Both are checked here, at the two narrowest widths the app is ever dragged
// to, against the real stylesheets.
import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll } from "./fits";

/** The two narrowest widths, which is where a review either fits or does not. */
const WIDTHS = [
  { name: "narrow", width: 520, height: 900 },
  { name: "under the breakpoint", width: 760, height: 900 },
];

/** Every theme the app ships. A mark has to be readable in all of them. */
const THEMES = [
  "mono", "obsidian", "velvet", "neon", "aurora", "ash", "ember",
  "ivory", "arctic", "sand", "lavender", "prism", "manuscript",
];

/*
 * Every scene here engraves a score with alphaTab AND plays a pass through
 * the mocked engine before it is ready, so it costs more than a jam scene.
 * `slow()` triples the budget; the work is real, not a hang.
 */
test.slow();

test.describe("the verdict", () => {
  for (const size of WIDTHS) {
    test(`fits at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, "songs-review-rushing", size);
      await noSidewaysScroll(page, `the review at ${size.width}px`);

      const box = await page.locator(".songs-review").boundingBox();
      expect(box, `no review at ${size.width}px`).not.toBeNull();
      expect(box!.x, `the review starts off-screen at ${size.width}px`).toBeGreaterThanOrEqual(-1);
      expect(
        box!.x + box!.width,
        `the review runs past the window's right edge at ${size.width}px`,
      ).toBeLessThanOrEqual(size.width + 1);
    });
  }

  /**
   * The coloured tab is the part that can genuinely not fit: a bar is as many
   * columns as it has attacks, and nothing about a passage says how many that
   * is. Bars wrap; a single bar scrolls inside its own box. What neither may
   * do is push the window sideways, which `noSidewaysScroll` above already
   * says — this checks the box itself stays inside its parent.
   */
  for (const size of WIDTHS) {
    test(`keeps the coloured tab inside the review at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs-review-missed", size);
      const overflow = await page.evaluate(() => {
        const tab = document.querySelector(".songs-review-tab");
        const review = document.querySelector(".songs-review");
        if (!tab || !review) return null;
        return tab.getBoundingClientRect().width - review.clientWidth;
      });
      expect(overflow, `no coloured tab at ${size.width}px`).not.toBeNull();
      expect(
        overflow!,
        `the coloured tab is ${Math.round(overflow!)}px wider than the review at ${size.width}px`,
      ).toBeLessThanOrEqual(1);
    });
  }

  /**
   * Every bar of the tab is inside the window, on both sides.
   *
   * The bars are a wrapping flex row, which is the layout that "fits" its
   * parent while the parent sits off-screen — the failure `fits.ts` was
   * written for, one level down.
   */
  for (const size of WIDTHS) {
    test(`keeps every bar of the tab on screen at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs-review-missed", size);
      const boxes = await page.$$eval(".songs-review-bar", (nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { left: r.left, right: r.right };
        }),
      );
      expect(boxes.length, `no bars drawn at ${size.width}px`).toBeGreaterThan(0);
      for (const [i, box] of boxes.entries()) {
        expect(
          Math.round(box.right),
          `bar ${i + 1} ends at ${Math.round(box.right)}, past the window's ${size.width}`,
        ).toBeLessThanOrEqual(size.width + 1);
        expect(Math.round(box.left), `bar ${i + 1} starts off the left`).toBeGreaterThanOrEqual(-1);
      }
    });
  }

  /**
   * "What else" opens something and does not move the sentence above it.
   *
   * A4: the headline is the thing being said, and the rest is there if you
   * open it. A disclosure that reflows the sentence makes the player lose
   * their place in it.
   */
  test("does not move the headline when the rest is opened", async ({ page }) => {
    await openShot(page, "songs-review-missed", { width: 1400, height: 900 });
    const answer = page.locator(".songs-review-answer");
    const before = await answer.boundingBox();
    // The scene already opened it; close it and open it again, which is the
    // press a person makes.
    await page.locator(".songs-review-more .songs-link").click();
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const after = await answer.boundingBox();
    expect(Math.round(after!.y), "the headline moved down the page").toBe(Math.round(before!.y));
    expect(Math.round(after!.width), "the headline changed width").toBe(Math.round(before!.width));
  });

  /** The pass stepper is a row of chips and must not wrap into a column. */
  test("keeps the go-stepper on one line where there is room", async ({ page }) => {
    await openShot(page, "songs-review-missed", { width: 1400, height: 900 });
    const rows = await page.$$eval(".songs-review-passes .songs-chip", (nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().top)),
    );
    expect(rows.length, "no go-stepper — the fixture should have three goes").toBeGreaterThan(1);
    expect(new Set(rows).size, "the goes are on more than one line at 1400px").toBe(1);
  });
});

/**
 * Contrast, in all thirteen themes.
 *
 * The marks are the whole review. Each one is drawn in one of the four
 * feedback tokens over the tab's own background, and `themes.test.ts` checks
 * the token contract but cannot check a pairing that only exists in this
 * stylesheet. 3:1 is WCAG's bar for a graphical object, which is what these
 * are — a glyph carrying meaning, not body text.
 */
test.describe("the marks are readable", () => {
  for (const theme of THEMES) {
    test(`in ${theme}`, async ({ page }) => {
      await openShot(page, "songs-review-missed", { width: 1400, height: 900 }, theme);
      const worst = await worstMarkContrast(page);
      expect(worst, `no marks drawn in ${theme}`).not.toBeNull();
      expect(
        worst!.ratio,
        `${theme}: the "${worst!.mark}" mark is ${worst!.ratio.toFixed(2)}:1 against the tab`,
      ).toBeGreaterThanOrEqual(3);
    });
  }
});

/** The least legible mark on the page, and how legible it is. */
async function worstMarkContrast(page: Page) {
  return page.evaluate(() => {
    const parse = (value: string): [number, number, number] | null => {
      const m = /rgba?\(([^)]+)\)/.exec(value);
      if (!m) return null;
      const parts = m[1].split(",").map((p) => parseFloat(p));
      return [parts[0], parts[1], parts[2]];
    };
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const luminance = ([r, g, b]: [number, number, number]) =>
      0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

    /** The first ancestor that actually paints something. */
    const behind = (el: Element): [number, number, number] => {
      let node: Element | null = el;
      while (node) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        const alpha = /rgba\(/.test(getComputedStyle(node).backgroundColor)
          ? parseFloat(getComputedStyle(node).backgroundColor.split(",")[3] ?? "1")
          : 1;
        if (bg && alpha > 0.5) return bg;
        node = node.parentElement;
      }
      return [255, 255, 255];
    };

    let worst: { mark: string; ratio: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>(".songs-review-mark")) {
      const ink = parse(getComputedStyle(el).color);
      if (!ink) continue;
      const paper = behind(el);
      const a = luminance(ink);
      const b = luminance(paper);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const mark = el.parentElement?.getAttribute("data-mark") ?? "?";
      if (!worst || ratio < worst.ratio) worst = { mark, ratio };
    }
    return worst;
  });
}
