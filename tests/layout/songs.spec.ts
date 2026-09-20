// Songs, measured. Written the way `jam.spec.ts` is: "does it fit" lives
// here, "does it do the right thing" lives in vitest — happy-dom computes no
// geometry at all, so every element there is zero by zero and none of this is
// visible to the four thousand unit tests.
//
// The mode's particular risk is the tab itself. It is drawn by alphaTab into
// a box whose width alphaTab measures once and lays a whole score out to, so
// a stage that is wider than the window, or a viewport that collapses to
// nothing, is not a cosmetic problem — it is a score engraved to the wrong
// width with a cursor walking off the side of it.
import { test, expect } from "@playwright/test";
import { openShot, fitsOnOneLine, noSidewaysScroll } from "./fits";

/**
 * The four widths jam.spec uses, and for the same reasons: the narrow window
 * somebody actually practises in, either side of the 900px point where the
 * rail gives up its library, and the width the pictures are taken at.
 */
const WIDTHS = [
  { name: "narrow", width: 520, height: 900 },
  { name: "under the breakpoint", width: 760, height: 900 },
  { name: "over the breakpoint", width: 1100, height: 900 },
  { name: "wide", width: 1400, height: 900 },
];

/*
 * Every scene in this file engraves a score with alphaTab, on the page's own
 * thread, before it is ready. That is several times what a jam scene costs,
 * and with Playwright's workers all doing it at once a 30-second budget runs
 * out on a busy machine — the first run of this suite failed eight tests that
 * each passed in six seconds on their own. `slow()` triples the budget; the
 * work is real, not a hang.
 */
test.slow();

test.describe("the songs stage", () => {
  for (const size of WIDTHS) {
    test(`fits at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, "songs", size);
      await noSidewaysScroll(page, `songs at ${size.width}px`);
    });
  }

  for (const size of WIDTHS) {
    test(`keeps the facts about the song on the stage at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs", size);
      await fitsOnOneLine(page, ".songs-facts", `songs facts at ${size.width}px`);
    });
  }

  /**
   * The tab is the main content and is never hidden behind a toggle.
   *
   * It also must not be squeezed to nothing: alphaTab lays the score out to
   * the box's width, so a viewport that collapses produces an engraving
   * nobody can read rather than an empty space somebody would report.
   */
  for (const size of WIDTHS) {
    test(`gives the tab real room at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs", size);
      const viewport = await page.locator(".songs-tab-viewport").boundingBox();
      expect(viewport, `no tab viewport at ${size.width}px`).not.toBeNull();
      expect(
        viewport!.height,
        `the tab is only ${Math.round(viewport!.height)}px tall at ${size.width}px`,
      ).toBeGreaterThan(180);
      expect(
        viewport!.width,
        `the tab is only ${Math.round(viewport!.width)}px wide at ${size.width}px`,
      ).toBeGreaterThan(220);

      // And it is inside the window, on both sides.
      expect(viewport!.x, `the tab starts off-screen at ${size.width}px`).toBeGreaterThanOrEqual(-1);
      expect(
        viewport!.x + viewport!.width,
        `the tab runs past the window's right edge at ${size.width}px`,
      ).toBeLessThanOrEqual(size.width + 1);
    });
  }

  /**
   * The score alphaTab drew is no wider than the box it was given.
   *
   * This is the one that catches a mis-set width: the engraving is laid out
   * to whatever alphaTab measured, and if that is not the box on screen the
   * staff runs off the side rather than wrapping.
   */
  for (const size of WIDTHS) {
    test(`engraves the score to the width it was given at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs", size);
      const overflow = await page.evaluate(() => {
        const host = document.querySelector(".songs-tab-host");
        const viewport = document.querySelector(".songs-tab-viewport");
        if (!host || !viewport) return null;
        return host.getBoundingClientRect().width - viewport.clientWidth;
      });
      expect(overflow, `no tab host at ${size.width}px`).not.toBeNull();
      expect(
        overflow!,
        `the engraved score is ${Math.round(overflow!)}px wider than its box at ${size.width}px`,
      ).toBeLessThanOrEqual(1);
    });
  }

  /**
   * The stage controls wrap onto more rows; none of them leaves the window.
   *
   * They are allowed to wrap — four control blocks cannot sit side by side at
   * 520px and should not try. What they may not do is sit beyond the right
   * edge, which is the failure a flex row hides: it "fits" its parent while
   * the parent itself is off-screen.
   */
  for (const size of WIDTHS) {
    test(`keeps every stage control inside the window at ${size.width}px`, async ({ page }) => {
      await openShot(page, "songs", size);
      const boxes = await page.$$eval(".songs-stage-controls > *", (nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { left: r.left, right: r.right, what: n.className.toString() };
        }),
      );
      expect(boxes.length, `no stage controls at ${size.width}px`).toBeGreaterThan(0);
      for (const box of boxes) {
        expect(
          Math.round(box.right),
          `"${box.what}" ends at ${Math.round(box.right)}, past the window's ${size.width}`,
        ).toBeLessThanOrEqual(size.width + 1);
        expect(
          Math.round(box.left),
          `"${box.what}" starts at ${Math.round(box.left)}, off the left of the window`,
        ).toBeGreaterThanOrEqual(-1);
      }
    });
  }

  /**
   * The bar-range fields stay on their own line beside each other.
   *
   * Two number inputs and a button: the row a person uses to say "loop 17 to
   * 24", and the one place in the mode where a wrapped control reads as a
   * bug rather than as a layout.
   */
  test("keeps the bar range row together where there is room", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    await fitsOnOneLine(page, ".songs-range-fields", "the bar range row");
  });

  /**
   * Choosing a section must not move the controls under the reader's hand.
   *
   * A chip that resizes its own row when pressed is the complaint the owner
   * made about Jam's switches, and the section chips are the same shape of
   * control on the same kind of row.
   */
  test("does not move the controls when a section is chosen", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    const tempo = page.locator(".songs-control-tempo");
    const before = await tempo.boundingBox();
    await page.locator(".songs-section-chips .songs-chip").first().click();
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const after = await tempo.boundingBox();
    expect(Math.round(after!.x), "the speed control moved sideways").toBe(Math.round(before!.x));
    expect(Math.round(after!.width), "the speed control changed width").toBe(
      Math.round(before!.width),
    );
  });
});

test.describe("the empty state", () => {
  for (const size of WIDTHS) {
    test(`fits at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, "songs-empty", size);
      await noSidewaysScroll(page, `the songs empty state at ${size.width}px`);

      const box = await page.locator(".songs-empty").boundingBox();
      expect(box, `no empty state at ${size.width}px`).not.toBeNull();
      expect(box!.x, `the empty state starts off-screen at ${size.width}px`).toBeGreaterThanOrEqual(
        -1,
      );
      expect(
        box!.x + box!.width,
        `the empty state runs off the right at ${size.width}px`,
      ).toBeLessThanOrEqual(size.width + 1);
    });
  }
});

/**
 * The track picker is a sheet over the stage, so it has the failure every
 * dialog has: it is positioned against the viewport rather than laid out in
 * the flow, and a viewport it was not designed for puts it half off-screen.
 */
test.describe("the track picker", () => {
  for (const size of WIDTHS) {
    test(`stays on screen at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, "songs-picker", size);
      const box = await page.locator(".songs-picker").boundingBox();
      expect(box, `no track picker at ${size.width}px`).not.toBeNull();
      expect(box!.x, "off the left edge").toBeGreaterThanOrEqual(-1);
      expect(box!.y, "off the top edge").toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width, "off the right edge").toBeLessThanOrEqual(size.width + 1);
      expect(box!.y + box!.height, "off the bottom edge").toBeLessThanOrEqual(size.height + 1);
      await noSidewaysScroll(page, `the track picker at ${size.width}px`);
    });
  }

  test("shows every track's tuning, and puts the guitar first", async ({ page }) => {
    await openShot(page, "songs-picker", { width: 1400, height: 900 });
    const names = await page
      .locator(".songs-picker-track-name")
      .allTextContents();
    expect(names, "the guitar is offered before the bass").toEqual(["Guitar", "Bass"]);

    // Every row says what it is tuned to, before anything plays.
    const tunings = await page.locator(".songs-picker-track-tuning").allTextContents();
    expect(tunings).toHaveLength(2);
    expect(tunings[0]).toContain("E A D G B E");
    expect(tunings[1]).toContain("G D A D");
  });

  test("keeps a long list scrollable rather than growing off the screen", async ({ page }) => {
    await openShot(page, "songs-picker", { width: 1400, height: 900 });
    const overflow = await page.evaluate(() => {
      const list = document.querySelector(".songs-picker-list");
      return list ? list.scrollWidth - list.clientWidth : null;
    });
    expect(overflow, "the picker list scrolls sideways").toBeLessThanOrEqual(1);
  });
});

/**
 * Every theme draws the tab, and draws it in that theme's ink.
 *
 * This is here rather than in vitest because happy-dom runs no renderer:
 * alphaTab's engraving only exists in a real browser. It caught a real one —
 * under Manuscript the tab was BLANK, because that theme's font stack opens
 * with `Source Serif 4` and alphaTab hands the family to
 * `document.fonts.check()` without quoting it, which throws and kills the
 * font loader before anything is drawn. One theme in thirteen, no error on
 * screen. `themeFontFamilies` in `TabStage.tsx` is the fix.
 *
 * Four themes rather than thirteen: one light, one dark, the serif one that
 * broke, and the one with a quoted multi-word family. Thirteen would triple
 * the suite's runtime to re-prove the same two things.
 */
test.describe("the tab under a theme", () => {
  for (const theme of ["manuscript", "ivory", "obsidian", "neon"]) {
    test(`draws, and takes the ink, under ${theme}`, async ({ page }) => {
      await openShot(page, "songs", { width: 1400, height: 900 }, theme);

      const drawn = await page.locator(".at-surface-svg").count();
      expect(drawn, `${theme} drew no score at all`).toBeGreaterThan(0);

      const tookTheInk = await page.evaluate(() => {
        const ink = getComputedStyle(document.documentElement)
          .getPropertyValue("--text-primary")
          .trim()
          .toLowerCase();
        const fills = new Set<string>();
        document.querySelectorAll(".at-surface-svg *").forEach((el) => {
          const styled = (el.getAttribute("style") ?? "").match(/fill:\s*([^;]+)/);
          if (styled) fills.add(styled[1].trim().toLowerCase());
          const attr = el.getAttribute("fill");
          if (attr && attr !== "none") fills.add(attr.trim().toLowerCase());
        });
        return { ink, has: fills.has(ink) };
      });
      expect(
        tookTheInk.has,
        `${theme} drew the score in something other than its own ${tookTheInk.ink}`,
      ).toBe(true);
    });
  }
});
