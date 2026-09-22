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
import { openShot, insideViewport, noSidewaysScroll, onlyTheseScroll } from "./fits";

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
    // Measured in the body's own LAYOUT, not against the viewport: the review
    // scrolls inside the frame now, so closing a section shortens the content
    // and the browser clamps the scroll position — which moves everything on
    // screen without moving anything in the layout. Adding `scrollTop` back
    // asks the question this test is actually about, which is whether the
    // sentence sits in a different place in the panel.
    const offset = async () => {
      const box = await page.evaluate(() => {
        const answer = document.querySelector(".songs-review-answer");
        const body = document.querySelector(".songs-review-body");
        if (!answer || !body) return null;
        const a = answer.getBoundingClientRect();
        const b = body.getBoundingClientRect();
        return { top: a.top - b.top + body.scrollTop, width: a.width };
      });
      expect(box, "no headline on the review").not.toBeNull();
      return box!;
    };

    const before = await offset();
    // The scene already opened it; close it and open it again, which is the
    // press a person makes.
    await page.locator(".songs-review-more .songs-link").click();
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const after = await offset();
    expect(Math.round(after.top), "the headline moved down the review").toBe(
      Math.round(before.top),
    );
    expect(Math.round(after.width), "the headline changed width").toBe(Math.round(before.width));
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
 * The verdict arrives where you were looking (W18, COACH_UX A4).
 *
 * It used to be drawn below the stage controls, the takes shelf and two more
 * blocks, inside a stage that scrolled — so at 1400×900 its first line was at
 * y=1075 and a player who stopped saw nothing happen at all. It takes the
 * tab's place in the same frame now, and these are the three things that has
 * to mean: it is where the tab was, its sentence and its button need no
 * scroll to be read, and the tab is still behind it rather than thrown away.
 */
const HEIGHTS = [
  { name: "the smallest window", width: 480, height: 780 },
  { name: "a laptop", width: 1100, height: 720 },
  { name: "the pictures", width: 1400, height: 900 },
];

test.describe("where the verdict appears", () => {
  for (const size of HEIGHTS) {
    test(`puts its heading and its button on screen at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs-review-rushing", size);

      // The two things a player has to be able to see without moving: what
      // the coach said, and the way back.
      await insideViewport(
        page,
        ".songs-review-title, .songs-review-sub, .songs-review-back",
        `the verdict at ${size.name}`,
        size,
      );
      await noSidewaysScroll(page, `the verdict at ${size.name}`);
    });
  }

  for (const size of HEIGHTS) {
    test(`takes the tab's own frame at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs-review-rushing", size);
      const where = await page.evaluate(() => {
        const review = document.querySelector(".songs-review");
        const frame = document.querySelector(".songs-stage-frame");
        const pane = document.querySelector(".songs-tab-pane");
        if (!review || !frame || !pane) return null;
        const r = review.getBoundingClientRect();
        const f = frame.getBoundingClientRect();
        return {
          dTop: Math.abs(r.top - f.top),
          dLeft: Math.abs(r.left - f.left),
          dBottom: Math.abs(r.bottom - f.bottom),
          // The tab is hidden, not unmounted: alphaTab engraved the score to
          // this box's width and would have to do it again from scratch.
          paneHidden: getComputedStyle(pane).visibility === "hidden",
          paneWidth: pane.getBoundingClientRect().width,
        };
      });
      expect(where, `nothing to measure at ${size.name}`).not.toBeNull();
      expect(where!.dTop, "the verdict does not start where the tab did").toBeLessThanOrEqual(2);
      expect(where!.dLeft, "the verdict is not over the tab").toBeLessThanOrEqual(2);
      expect(where!.dBottom, "the verdict does not fill the frame").toBeLessThanOrEqual(2);
      expect(where!.paneHidden, "the tab is still showing under the verdict").toBe(true);
      expect(
        where!.paneWidth,
        "the tab lost its box — alphaTab will re-engrave the whole score",
      ).toBeGreaterThan(100);
    });
  }

  /**
   * Nothing scrolls but the verdict's own body.
   *
   * A scroller inside a scroller is the shape of the bug this task was sent
   * to fix. The body is allowed one, because "what else" opens a second
   * finding under the first; the stage is not.
   */
  for (const size of HEIGHTS) {
    test(`scrolls nowhere but its own body at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs-review-missed", size);
      await onlyTheseScroll(
        page,
        ".songs-view",
        [".songs-tab-viewport", ".songs-review-body", ".songs-takes-pop"],
        `the verdict at ${size.name}`,
      );
    });
  }

  /**
   * The three ways out, and where the caret lands.
   *
   * The button, Escape, and simply pressing play. Focus goes to the heading
   * when it opens so a screen reader is told something arrived, and back to
   * Play when it closes so a keyboard player is not left on a heading that no
   * longer exists.
   */
  test("takes focus to its heading and gives it back to Play", async ({ page }) => {
    await openShot(page, "songs-review-rushing", { width: 1400, height: 900 });
    expect(
      await page.evaluate(() => document.activeElement?.className ?? ""),
      "the verdict did not take focus",
    ).toContain("songs-review-title");

    await page.locator(".songs-review-back").click();
    await expect(page.locator(".songs-review")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.activeElement?.className ?? ""),
      "focus was left nowhere after the verdict closed",
    ).toContain("transport-play");
  });

  test("closes on Escape", async ({ page }) => {
    await openShot(page, "songs-review-rushing", { width: 1400, height: 900 });
    await page.keyboard.press("Escape");
    await expect(page.locator(".songs-review")).toHaveCount(0);
    await expect(page.locator(".songs-tab-pane[data-behind]")).toHaveCount(0);
  });

  test("closes when play is pressed again", async ({ page }) => {
    await openShot(page, "songs-review-rushing", { width: 1400, height: 900 });
    await page.locator(".transport-play").click();
    await expect(page.locator(".songs-review")).toHaveCount(0);
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

/**
 * The least legible mark on the page, and how legible it is.
 *
 * The ground under a mark has to be COMPOSITED, not looked up. Four of the
 * thirteen themes paint their cards in `rgba(255, 255, 255, 0.05)` over a
 * gradient, so `backgroundColor` on every ancestor is translucent or
 * transparent and there is no single computed colour to compare against —
 * a first version of this took the first opaque ancestor, found none, fell
 * back to white, and reported Aurora's bright green at 1.9:1 when it is a
 * bright green on a near-black gradient. So: start from the theme's own
 * `--bg-primary` (its first colour stop when it is a gradient) and lay every
 * layer between there and the mark over it.
 */
async function worstMarkContrast(page: Page) {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];

    const parse = (value: string): Rgba | null => {
      const rgb = /rgba?\(([^)]+)\)/.exec(value);
      if (rgb) {
        const p = rgb[1].split(",").map((x) => parseFloat(x));
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
      }
      const hex = /#([0-9a-f]{6})\b/i.exec(value);
      if (hex) {
        const n = parseInt(hex[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
      }
      return null;
    };

    /** `over` laid on `under`, both premultiplied out. */
    const composite = (under: Rgba, over: Rgba): Rgba => {
      const a = over[3];
      if (a <= 0) return under;
      if (a >= 1) return over;
      return [
        over[0] * a + under[0] * (1 - a),
        over[1] * a + under[1] * (1 - a),
        over[2] * a + under[2] * (1 - a),
        1,
      ];
    };

    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const luminance = (c: Rgba) =>
      0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);

    // The theme's own ground, which is a gradient in four of the thirteen —
    // its first stop is what the top of the page actually shows.
    const base =
      parse(getComputedStyle(document.documentElement).getPropertyValue("--bg-primary")) ??
      ([255, 255, 255, 1] as Rgba);

    const groundUnder = (el: Element): Rgba => {
      const layers: Rgba[] = [];
      let node: Element | null = el.parentElement;
      while (node) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg && bg[3] > 0) layers.push(bg);
        node = node.parentElement;
      }
      // Outermost first: the page, then everything stacked on it.
      return layers.reverse().reduce<Rgba>((under, over) => composite(under, over), base);
    };

    let worst: { mark: string; ratio: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>(".songs-review-mark")) {
      const ink = parse(getComputedStyle(el).color);
      if (!ink) continue;
      const paper = groundUnder(el);
      const a = luminance(composite(paper, ink));
      const b = luminance(paper);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const mark = el.parentElement?.getAttribute("data-mark") ?? "?";
      if (!worst || ratio < worst.ratio) worst = { mark, ratio };
    }
    return worst;
  });
}
