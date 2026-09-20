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
import { openShot, fitsOnOneLine, insideViewport, noSidewaysScroll, onlyTheseScroll, IN_ENGLISH, LAYOUT_LOCALE } from "./fits";

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
      await insideViewport(page, ".songs-strip > *", `the strip at ${size.width}px`, size);
    });
  }

  /**
   * The portion group stays on one line where there is room.
   *
   * The bars, what they add up to, the repeat, "whole song" and "keep it":
   * the row a person uses to say "loop 17 to 24", and the one place in the
   * mode where a wrapped control reads as a bug rather than as a layout.
   */
  test("keeps the portion row together where there is room", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    await fitsOnOneLine(page, ".songs-strip-portion", "the portion row");
  });

  /**
   * Choosing a section must not move the controls under the reader's hand.
   *
   * A chip that resizes its own row when pressed is the complaint the owner
   * made about Jam's switches, and the section chips are the same shape of
   * control on the same kind of row. This got sharper with the portion: the
   * sentence beside the fields goes from "The whole song" to "4 bars · on
   * repeat" when a section is pressed, and a sentence that changes width
   * drags every control on the row along with it.
   */
  test("does not move the controls when a section is chosen", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    const tempo = page.locator(".songs-strip-tempo");
    const loop = page.locator(".songs-loop-chip");
    const before = { tempo: await tempo.boundingBox(), loop: await loop.boundingBox() };
    await page.locator(".songs-section-chips .songs-chip").first().click();
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const after = { tempo: await tempo.boundingBox(), loop: await loop.boundingBox() };
    expect(Math.round(after.tempo!.x), "the speed control moved sideways").toBe(
      Math.round(before.tempo!.x),
    );
    expect(Math.round(after.tempo!.width), "the speed control changed width").toBe(
      Math.round(before.tempo!.width),
    );
    // And the repeat switch, which sits right after the sentence that changed.
    expect(Math.round(after.loop!.x), "the repeat switch moved under the hand").toBe(
      Math.round(before.loop!.x),
    );
  });
});

/**
 * Is it on screen? (W18, 2026-09-20)
 *
 * The question the hundred and seven tests above and beside this one never
 * asked. Every one of them measured a box against its PARENT, and a row fits
 * its parent perfectly while the parent sits below the bottom of the window.
 * Measured on the day this was written, at 1400×900: the band's faders began
 * at y=928 and the verdict at y=1075, in a 900px window, with every test
 * green. So these ask about the WINDOW, in the state each thing is for — the
 * strip while the band is playing, the verdict after the stop.
 *
 * Three sizes: the smallest window the app can be dragged to
 * (`tauri.conf.json`'s `minWidth`/`minHeight`), the one a laptop lid gives
 * you, and the one the pictures are taken at.
 */
const HEIGHTS = [
  { name: "the smallest window", width: 480, height: 780 },
  { name: "a laptop", width: 1100, height: 720 },
  { name: "the pictures", width: 1400, height: 900 },
];

/**
 * The boxes that are allowed to scroll, and nothing else.
 *
 * The tab, because the cursor walks down a page that is longer than any
 * window; the verdict's body, because "what else" opens a second finding
 * under the first; and the takes shelf, which is a popover and is portalled
 * out of the stage anyway.
 */
const MAY_SCROLL = [".songs-tab-viewport", ".songs-review-body", ".songs-takes-pop"];

test.describe("the stage is one screen", () => {
  for (const size of HEIGHTS) {
    test(`puts every control within reach while playing at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs-playing", size);

      // Still playing, so this is the state A13 is about rather than a stage
      // that quietly stopped before it was measured.
      await expect(page.locator(".transport-play.playing")).toHaveCount(1);

      // Every group of the strip, and every control inside every group: the
      // fader is the one that fails silently, because it goes on working at
      // four pixels and at minus forty.
      await insideViewport(page, ".songs-strip > *", `the strip at ${size.name}`, size);
      await insideViewport(
        page,
        ".songs-band-lane, .songs-strip .songs-chip, .songs-range-field input",
        `the strip's controls at ${size.name}`,
        size,
      );
      await noSidewaysScroll(page, `songs playing at ${size.name}`);
    });
  }

  for (const size of HEIGHTS) {
    test(`scrolls nowhere but the tab at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs", size);
      await onlyTheseScroll(page, ".songs-view", MAY_SCROLL, `songs at ${size.name}`);

      // And the stage's own wrapper, which is where the outer scroller was.
      const outer = await page.evaluate(() => {
        const el = document.querySelector('.main-content[data-view="songs"] > .view-transition-wrapper');
        return el ? el.scrollHeight - el.clientHeight : null;
      });
      expect(outer, "no songs stage wrapper").not.toBeNull();
      expect(outer!, `the stage itself scrolls ${outer}px at ${size.name}`).toBeLessThanOrEqual(2);
    });
  }

  /**
   * The tab keeps real room at every one of them.
   *
   * The other half of "one screen": a stage that fits because the score was
   * squeezed to eighty pixels has not solved anything, and alphaTab engraves
   * to whatever box it is given.
   */
  for (const size of HEIGHTS) {
    test(`still gives the tab a page to read at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs", size);
      const viewport = await page.locator(".songs-tab-viewport").boundingBox();
      expect(viewport, `no tab viewport at ${size.name}`).not.toBeNull();
      expect(
        viewport!.height,
        `the tab is only ${Math.round(viewport!.height)}px tall at ${size.name}`,
      ).toBeGreaterThan(180);
    });
  }
});

/**
 * The portion you are working on, drawn where it actually is (W18 item 0).
 *
 * The owner: *"Being able to select a portion of a song so it plays that
 * portion in repeat is super critical for song learning."* So the band behind
 * the chosen bars is not decoration — it is the answer to "what is it going to
 * play?", and it has to be over the RIGHT bars. Nothing in vitest can check
 * that: where bar five sits on the page is decided by alphaTab at run time,
 * in a browser, at whatever width the window happens to be.
 */
test.describe("the chosen portion, on the tab", () => {
  for (const size of HEIGHTS) {
    test(`draws the band over the chosen bars at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs-portion", size);

      // What the scene chose, and where the engraving put those bars. The
      // bounds come from alphaTab's own lookup — the same one the stage hit-
      // tests with — because nothing about the DOM says which box is bar 5.
      const measured = await page.evaluate(() => {
        const api = (
          window as unknown as {
            __SONGS_TAB_API__?: {
              renderer?: {
                boundsLookup?: {
                  findMasterBarByIndex(i: number): {
                    visualBounds: { x: number; y: number; w: number; h: number };
                  } | null;
                } | null;
              };
            };
          }
        ).__SONGS_TAB_API__;
        const lookup = api?.renderer?.boundsLookup;
        if (!lookup) return null;
        const bands = [...document.querySelectorAll<HTMLElement>(".songs-tab-band")].map((el) => ({
          x: el.offsetLeft,
          y: el.offsetTop,
          w: el.offsetWidth,
          h: el.offsetHeight,
        }));
        // The scene chooses printed bars 5 to 8, so 4..7 zero-based.
        const wanted = [4, 5, 6, 7].map((i) => lookup.findMasterBarByIndex(i)?.visualBounds ?? null);
        const notWanted = [0, 1, 2, 3].map(
          (i) => lookup.findMasterBarByIndex(i)?.visualBounds ?? null,
        );
        return { bands, wanted, notWanted };
      });
      expect(measured, `no tab bounds at ${size.name}`).not.toBeNull();
      const { bands, wanted, notWanted } = measured!;
      expect(bands.length, `nothing drawn behind the chosen bars at ${size.name}`).toBeGreaterThan(
        0,
      );

      /** Is the middle of this bar inside one of the bands? */
      const covered = (box: { x: number; y: number; w: number; h: number } | null) => {
        if (!box) return false;
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        return bands.some(
          (b) => cx >= b.x - 2 && cx <= b.x + b.w + 2 && cy >= b.y - 2 && cy <= b.y + b.h + 2,
        );
      };

      for (const [i, box] of wanted.entries()) {
        expect(covered(box), `bar ${i + 5} is chosen but has no band over it`).toBe(true);
      }
      for (const [i, box] of notWanted.entries()) {
        expect(covered(box), `bar ${i + 1} is not chosen but has a band over it`).toBe(false);
      }
    });
  }

  /**
   * A selection that crosses a line break is two bands, not one box drawn
   * across the page and through the music between the systems.
   */
  test("draws a band per system when the portion crosses a line break", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });

    // Bars 3 to 6 of the fixture: the page breaks after bar 3, so this is the
    // case that needs two. Set through the strip's own fields, which are one
    // of the four doors to the same selection.
    const from = page.locator(".songs-strip-range input, .songs-strip-portion input").first();
    const to = page.locator(".songs-strip-range input, .songs-strip-portion input").nth(1);
    await from.fill("3");
    await to.fill("6");
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

    const tops = await page.$$eval(".songs-tab-band", (nodes) =>
      nodes.map((n) => Math.round((n as HTMLElement).offsetTop)),
    );
    expect(tops.length, "the portion was not drawn at all").toBeGreaterThan(0);
    expect(
      new Set(tops).size,
      "bars 3–6 cross a line break and were drawn as one band across the page",
    ).toBeGreaterThan(1);
  });

  /**
   * Choosing means looping, and the strip says so in words.
   *
   * The band is the picture; this is the sentence. Neither is ever the only
   * signal — one of them is what a screen reader and a low-contrast theme
   * have to go on.
   */
  test("says what is chosen, and turns the repeat on with it", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    const says = page.locator(".songs-portion-says");
    await expect(says, "a fresh song should be the whole song").toHaveText(/whole song/i);

    await page.locator(".songs-strip-portion input").first().fill("3");
    await expect(says).toContainText("bars");
    await expect(says, "choosing a portion did not start the repeat").toContainText("repeat");
    await expect(page.locator(".songs-loop-chip")).toHaveAttribute("aria-pressed", "true");

    // "Whole song" clears it, and stops the repeat with it.
    await page.getByRole("button", { name: /whole song/i }).click();
    await expect(says).toHaveText(/whole song/i);
    await expect(page.locator(".songs-tab-band")).toHaveCount(0);
    await expect(page.locator(".songs-loop-chip")).toHaveAttribute("aria-pressed", "false");
  });

  /** A portion kept under a name sits beside the sections and comes back. */
  test("keeps a named portion beside the sections", async ({ page }) => {
    await openShot(page, "songs-portion", { width: 1400, height: 900 });
    const chip = page.locator(".songs-portion-chip-main");
    await expect(chip).toHaveText("The chorus");

    // Clear it, then press the chip: the same bars come back.
    await page.getByRole("button", { name: /^whole song$/i }).click();
    await expect(page.locator(".songs-tab-band")).toHaveCount(0);
    await expect(page.locator(".songs-strip-portion input").first()).toHaveValue("1");
    await chip.click();
    await expect(page.locator(".songs-strip-portion input").first()).toHaveValue("5");
    await expect(page.locator(".songs-strip-portion input").nth(1)).toHaveValue("8");
    await expect(page.locator(".songs-tab-band").first()).toBeVisible();
  });
});

/**
 * The cursor, and the question nobody asked (W22 item 1).
 *
 * The capture of `songs-playing` had a transport counting bars over a page
 * with no cursor anywhere on it, and a hundred-odd layout tests were green,
 * because every one of them asked where a box WAS and none asked whether it
 * could be SEEN. Three things were wrong at once and two of them could only
 * ever be found by asking this:
 *
 * 1. alphaTab ships no stylesheet — there is no `.css` file in the package —
 *    so its two cursor boxes were `background-color: rgba(0, 0, 0, 0)`.
 *    Present, positioned, moving, invisible, in all thirteen themes.
 * 2. The harness's mocked beat events carried the jam's fields and none of
 *    the song's, so `songTick` arrived `undefined` and the cursor never left
 *    tick zero.
 * 3. The scroll that keeps it in view read `offsetTop`, which is zero for
 *    ever because alphaTab moves the cursor with a transform.
 *
 * So: it exists, it is painted, it is inside the tab, nothing opaque is over
 * it, and it is somewhere else a bar later. The same visibility question is
 * then asked of a lit note, which is the other thing drawn on this page that
 * a layer over the engraving could have swallowed.
 */
test.describe("the playback cursor", () => {
  /**
   * Is anything painted OVER this box?
   *
   * `elementFromPoint` alone cannot answer it. alphaTab's cursor wrapper is
   * `pointer-events: none` — it has to be, or a drag across the bar being
   * played would be caught by the cursor instead of the selection surface —
   * so the hit test never returns the cursor itself, and the surface that
   * owns the pointer is always what comes back. Covering is about PAINT, so
   * the question is asked of the paint: of everything the hit test finds
   * above the engraving, is any of it opaque?
   */
  const coveredBy = (selector: string) =>
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const host = document.querySelector(".songs-tab-host");
      if (!el || !host) return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      const stack = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const above = stack.slice(0, Math.max(0, stack.indexOf(host)));
      const solid = (node) => {
        const cs = getComputedStyle(node);
        if (cs.backgroundImage !== "none") return true;
        const m = cs.backgroundColor.match(/rgba?\\(([^)]+)\\)/);
        if (!m) return false;
        const parts = m[1].split(",").map((n) => parseFloat(n));
        return parts.length < 4 || parts[3] > 0.5;
      };
      return above
        .filter((node) => node !== host && !host.contains(node) && solid(node))
        .map((node) => node.tagName + "." + String(node.className).slice(0, 40));
    })()`;

  test("is drawn, on the page, and moves while the band plays", async ({ page }) => {
    await openShot(page, "songs-playing", { width: 1400, height: 900 });

    const seen = await page.evaluate(() => {
      const cursor = document.querySelector(".at-cursor-beat");
      const bar = document.querySelector(".at-cursor-bar");
      const viewport = document.querySelector(".songs-tab-viewport");
      if (!cursor || !bar || !viewport) return null;
      const alpha = (node: Element) => {
        const m = getComputedStyle(node).backgroundColor.match(/rgba?\(([^)]+)\)/);
        if (!m) return 0;
        const parts = m[1].split(",").map((n) => parseFloat(n));
        return parts.length < 4 ? 1 : parts[3];
      };
      const box = cursor.getBoundingClientRect();
      const frame = viewport.getBoundingClientRect();
      return {
        beatAlpha: alpha(cursor),
        barAlpha: alpha(bar),
        box: { x: box.x, y: box.y, w: box.width, h: box.height },
        frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      };
    });
    expect(seen, "there is no cursor on the tab at all").not.toBeNull();

    // Painted. This is the one the shipped bug would have failed: alphaTab
    // gives its cursors no colour of their own and the app has to.
    expect(seen!.beatAlpha, "the beat cursor has no colour — it is invisible").toBeGreaterThan(0.5);
    expect(seen!.barAlpha, "the bar cursor has no colour — it is invisible").toBeGreaterThan(0.02);

    // Inside the tab's own frame, on all four sides.
    const { box, frame } = seen!;
    expect(box.x, "the cursor is off the left of the tab").toBeGreaterThanOrEqual(frame.x - 1);
    expect(box.x + box.w, "the cursor is off the right of the tab").toBeLessThanOrEqual(
      frame.x + frame.w + 1,
    );
    expect(box.y, "the cursor is above the tab").toBeGreaterThanOrEqual(frame.y - 1);
    expect(box.y + box.h, "the cursor is below the tab").toBeLessThanOrEqual(
      frame.y + frame.h + 1,
    );

    // Nothing opaque over it — the selection band and the handles share this
    // stack, and the band used to be the layer on top.
    const blocked = await page.evaluate(coveredBy(".at-cursor-beat"));
    expect(blocked, "something opaque is painted over the cursor").toEqual([]);

    // And it is somewhere else a bar later. The shot song is 4/4 at 96, so a
    // bar is 2.5 seconds; three is comfortably one and not two.
    const where = () =>
      page.evaluate(() => {
        const el = document.querySelector(".at-cursor-beat");
        return el ? getComputedStyle(el).transform : "";
      });
    const before = await where();
    await page.waitForTimeout(3000);
    const after = await where();
    expect(before, "the cursor has no transform to move").not.toBe("");
    expect(after, "the cursor has not moved in a bar — it is stuck on tick zero").not.toBe(before);
  });

  test("lights notes as they go by, and nothing covers them", async ({ page }) => {
    await openShot(page, "songs-playing", { width: 1400, height: 900 });

    const lit = page.locator(".songs-tab-host [data-song-light]").first();
    await expect(lit, "no note lit while the band plays").toHaveCount(1);

    const inside = await page.evaluate(() => {
      const el = document.querySelector(".songs-tab-host [data-song-light]");
      const viewport = document.querySelector(".songs-tab-viewport");
      if (!el || !viewport) return null;
      const box = el.getBoundingClientRect();
      const frame = viewport.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.x >= frame.x - 1 &&
        box.x + box.width <= frame.x + frame.width + 1 &&
        box.y >= frame.y - 1 &&
        box.y + box.height <= frame.y + frame.height + 1
      );
    });
    expect(inside, "the lit note is not inside the tab's frame").toBe(true);

    const blocked = await page.evaluate(coveredBy(".songs-tab-host [data-song-light]"));
    expect(blocked, "something opaque is painted over the lit note").toEqual([]);
  });

  /**
   * The band behind the chosen bars is UNDER the music, and the handles are
   * over everything — which is what puts the cursor between them.
   */
  test("sits above the selection band and below its handles", async ({ page }) => {
    await openShot(page, "songs-portion", { width: 1400, height: 900 });
    const order = await page.evaluate(() => {
      const value = (selector: string) => {
        const el = document.querySelector(selector);
        return el ? getComputedStyle(el).zIndex : null;
      };
      const host = document.querySelector(".songs-tab-host");
      const bands = document.querySelector(".songs-tab-bands");
      const overlay = document.querySelector(".songs-tab-overlay");
      return {
        bands: value(".songs-tab-bands"),
        host: value(".songs-tab-host"),
        overlay: value(".songs-tab-overlay"),
        cursorInsideHost: !!host?.querySelector(".at-cursors"),
        bandInBandLayer: !!bands?.querySelector(".songs-tab-band"),
        handleInOverlay: !!overlay?.querySelector(".songs-tab-handle"),
      };
    });
    expect(order.cursorInsideHost, "the cursor is not a child of the engraving").toBe(true);
    expect(order.bandInBandLayer, "the band is not in the layer under the music").toBe(true);
    expect(order.handleInOverlay, "the handles are not in the layer over the music").toBe(true);
    expect(Number(order.bands), "the band is not under the music").toBeLessThan(Number(order.host));
    expect(Number(order.overlay), "the handles are not over the music").toBeGreaterThan(
      Number(order.host),
    );
  });
});

/**
 * One count-in, not two (W18 item 3).
 *
 * Songs shipped with the stage's three chips AND the transport's switch, and
 * the transport's wrote the click's warm-up beats — which `load_song` clears,
 * so the one in the bottom bar did nothing at all. There is one now, it is
 * the transport's, and it writes the song's own setting.
 */
test.describe("the count-in", () => {
  test("is the transport's switch and nothing else on the stage", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });

    expect(
      await page.locator(".songs-view .songs-countin-chips").count(),
      "the stage still has its own count-in chips",
    ).toBe(0);

    const transportSwitch = page.locator(".transport .transport-switch").first();
    await expect(transportSwitch, "no count-in switch in the transport").toHaveCount(1);
    await expect(transportSwitch).toHaveAttribute("aria-checked", "false");
  });

  test("turns the song's own count-in on when it is pressed", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    const transportSwitch = page.locator(".transport .transport-switch").first();
    await transportSwitch.click();
    await expect(
      transportSwitch,
      "the switch went back off — it is writing somewhere the song does not read",
    ).toHaveAttribute("aria-checked", "true");
  });
});

/**
 * The library panel under a song is the song library, and nothing else.
 *
 * It used to go on drawing the metronome's presets beneath the songs, and
 * with none saved it offered "No presets yet — save a tempo, sound and meter
 * you keep coming back to", which is not a sentence about a piece of music.
 */
test.describe("the sidebar under a song", () => {
  test("offers no presets", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    expect(
      await page.locator(".preset-sidebar-empty-state").count(),
      "the preset empty state is still under the song list",
    ).toBe(0);
    expect(
      await page.locator(".preset-sidebar-item:not(.song-item)").count(),
      "a preset row is still under the song list",
    ).toBe(0);
    // And the songs themselves are still there.
    expect(await page.locator(".preset-sidebar-item.song-item").count()).toBeGreaterThan(0);
  });
});

/**
 * The takes shelf is a popover now, and it does not land on Play.
 *
 * It was a section under the stage controls — one of the three blocks that
 * pushed the verdict under the fold. A popover off its own switch costs the
 * stage nothing, and the one rule it has to keep is the one the cheat sheet
 * keeps in `jam.spec.ts`: never over the transport.
 */
test.describe("the takes shelf", () => {
  for (const size of HEIGHTS) {
    test(`opens inside the window and clear of Play at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs-takes", size);
      const shelf = await page.locator(".songs-takes-pop").boundingBox();
      expect(shelf, `no takes shelf at ${size.name}`).not.toBeNull();
      expect(shelf!.y, "off the top").toBeGreaterThanOrEqual(-1);
      expect(shelf!.y + shelf!.height, "off the bottom").toBeLessThanOrEqual(size.height + 1);
      expect(shelf!.x, "off the left").toBeGreaterThanOrEqual(-1);
      expect(shelf!.x + shelf!.width, "off the right").toBeLessThanOrEqual(size.width + 1);

      const play = await page.locator(".transport-play").boundingBox();
      expect(play, "no transport").not.toBeNull();
      expect(
        Math.round(shelf!.y + shelf!.height),
        "the shelf covers the Play button",
      ).toBeLessThanOrEqual(Math.round(play!.y) + 1);
    });
  }
});

/**
 * The band's faders, at the smallest window the app opens.
 *
 * 480 × 780 is `minWidth`/`minHeight` in `tauri.conf.json` — the window a
 * person can actually drag themselves down to — and it is narrower than
 * anything else in this file. A lane is a name, a slider, a number and a
 * switch, and a slider is the control that fails silently when the row runs
 * out of room, because it shrinks to a few pixels and goes on working.
 */
const SMALLEST = { width: 480, height: 780 };

/** Every theme the app ships, from `src/themes.ts`. */
const THEMES = [
  "mono",
  "obsidian",
  "velvet",
  "neon",
  "aurora",
  "ivory",
  "arctic",
  "sand",
  "lavender",
  "prism",
  "ash",
  "ember",
  "manuscript",
];

test.describe("the band", () => {
  test("has a row for the click and for each player the file has", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    const names = await page.locator(".songs-band-name").allTextContents();
    if (!IN_ENGLISH) {
      // In another language the three names are that language's words. That
      // the band has exactly three lanes, in this order, is still worth
      // saying; what they are called is `i18n.songs-wave.test.ts`'s job.
      expect(names, `three lanes in ${LAYOUT_LOCALE}`).toHaveLength(3);
      return;
    }
    // The fixture is a guitar, a drum kit and a bass — and the guitar is the
    // part being played, so it is never in the band.
    expect(names.map((n) => n.trim())).toEqual(["Click", "Drums", "Bass"]);
  });

  /**
   * Every lane keeps its name where the stage is wide enough, and loses it
   * rather than the fader where it is not.
   *
   * The container query does the dropping, and what it must never do is drop
   * the name while leaving the row too wide to fit anyway — so both ends are
   * asserted rather than the rule being trusted.
   */
  test("sheds the names, then the row, as the stage narrows", async ({ page }) => {
    // Wide: name, fader, number and mute, all of it on the strip.
    await openShot(page, "songs", { width: 1400, height: 900 });
    const wide = await page.locator(".songs-band-name-text").first().boundingBox();
    expect(wide, "no lane name at 1400px").not.toBeNull();
    expect(wide!.width, "the lane names are gone on a wide stage").toBeGreaterThan(10);

    // Middling: the container query drops the WORD and keeps the row, so the
    // faders stay on the strip where A13 wants them.
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await expect(
      page.locator(".songs-strip .songs-band-lane"),
      "the lanes left the strip before they had to",
    ).toHaveCount(3);
    expect(
      await page.locator(".songs-band-name-text").first().boundingBox(),
      "the lane names are still laid out at a middling width",
    ).toBeNull();

    // Narrow: a row no longer fits at all, so the band folds into one chip
    // and the faders are a press away rather than a scroll away.
    await page.setViewportSize({ width: 480, height: 780 });
    await expect(page.locator(".songs-band-opener")).toHaveCount(1);
    await expect(page.locator(".songs-strip .songs-band-lane")).toHaveCount(0);
  });

  for (const theme of THEMES) {
    test(`fits at ${SMALLEST.width}×${SMALLEST.height} under ${theme}`, async ({ page }) => {
      await openShot(page, "songs", SMALLEST, theme);
      await noSidewaysScroll(page, `songs at ${SMALLEST.width}px under ${theme}`);

      // At this width the band is folded, so the faders are inside its
      // popover — opened here the way a person opens it, because a control
      // behind a press still has to be a control when it is reached.
      await page.locator(".songs-band-opener").click();
      await expect(page.locator(".songs-band-pop")).toHaveCount(1);

      // Every fader row is inside the window, and the slider in it is still
      // a slider rather than a sliver.
      const lanes = await page.$$eval(".songs-band-lane", (nodes) =>
        nodes.map((n) => {
          const row = n.getBoundingClientRect();
          const slider = n.querySelector("input[type=range]")!.getBoundingClientRect();
          const switchEl = n.querySelector("button[role=switch]")!.getBoundingClientRect();
          return { row, slider, switchEl };
        }),
      );
      expect(lanes.length, `no band under ${theme}`).toBeGreaterThan(1);
      for (const lane of lanes) {
        expect(
          Math.round(lane.row.right),
          `a fader row ends at ${Math.round(lane.row.right)}, past the window's ${SMALLEST.width}`,
        ).toBeLessThanOrEqual(SMALLEST.width + 1);
        expect(Math.round(lane.row.left), "a fader row starts off the left").toBeGreaterThanOrEqual(
          -1,
        );
        expect(
          Math.round(lane.slider.width),
          `the fader is ${Math.round(lane.slider.width)}px wide under ${theme}`,
        ).toBeGreaterThan(40);
        // The mute is a hit target, not a hairline.
        expect(
          Math.round(lane.switchEl.width),
          `the mute is ${Math.round(lane.switchEl.width)}px wide under ${theme}`,
        ).toBeGreaterThanOrEqual(30);
        expect(
          Math.round(lane.switchEl.right),
          "the mute is past the right edge",
        ).toBeLessThanOrEqual(SMALLEST.width + 1);
      }

      // And the speed chips wrap rather than run off the side.
      const chips = await page.$$eval(".songs-tempo-chips .songs-chip", (nodes) =>
        nodes.map((n) => n.getBoundingClientRect().right),
      );
      expect(chips.length, `no speed chips under ${theme}`).toBe(6);
      for (const right of chips) {
        expect(Math.round(right), "a speed chip is past the right edge").toBeLessThanOrEqual(
          SMALLEST.width + 1,
        );
      }
    });
  }
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
    // Track names and note names come from the file, not from a locale, so
    // this one would hold in any language — but it says nothing about
    // layout, and running it fifteen times over engraves fifteen scores.
    test.skip(!IN_ENGLISH, "track and note names are the file's, not the locale's");
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
