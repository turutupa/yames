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
 * The tab gets the room (W29 item 3).
 *
 * The owner: *"figure out how to use as much space as possible on the stage
 * area with tabs, right now a lot of space is under used"*. Measured before
 * the change: 502 px of a 900 px window at 1440×900, which is 55.8 %, and
 * 181 px of 780 at the smallest window the app opens, which is 23.2 % — the
 * strip was three rows there and five here.
 *
 * ## What the window actually has to give
 *
 * At 1440×900 the stage's own column is 672 px: the app's header takes 84
 * above it and the transport 104 below, and neither is this screen's to
 * spend. So **74.7 % is the ceiling**, and the brief's 70 % would leave 42
 * pixels for a title, the instrument menu, the bar fields, the repeat and
 * the speed — a one-line head and a one-row strip are 50 between them at
 * their smallest. The numbers asserted here are what a head and a strip that
 * are each genuinely one row leave over: measured at 67.7 % and 62.5 %, with
 * a point of slack for a font that rounds the other way.
 */
test.describe("the tab's share of the window", () => {
  const SHARE = [
    { name: "the pictures", width: 1440, height: 900, least: 66 },
    { name: "the smallest window", width: 480, height: 780, least: 55 },
  ];

  for (const size of SHARE) {
    for (const scene of ["songs", "songs-playing"]) {
      test(`is at least ${size.least}% at ${size.name}, ${scene === "songs" ? "stopped" : "playing"}`, async ({
        page,
      }) => {
        await openShot(page, scene, size);
        const viewport = await page.locator(".songs-tab-viewport").boundingBox();
        expect(viewport, `no tab viewport at ${size.name}`).not.toBeNull();
        const share = (viewport!.height / size.height) * 100;
        expect(
          share,
          `the tab is ${share.toFixed(1)}% of the window's height at ${size.name} (${Math.round(viewport!.height)} of ${size.height})`,
        ).toBeGreaterThanOrEqual(size.least);
      });
    }
  }

  /**
   * And the full width of the content region.
   *
   * A page of music is the widest thing in Yames, and it was giving up
   * ninety-six pixels of every row to gutters the rest of the app does not
   * use.
   */
  for (const size of SHARE) {
    test(`takes the whole width of the stage at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs", size);
      const viewport = await page.locator(".songs-tab-viewport").boundingBox();
      const column = await page.locator(".songs-view").boundingBox();
      expect(viewport, `no tab viewport at ${size.name}`).not.toBeNull();
      expect(column, `no stage column at ${size.name}`).not.toBeNull();
      expect(
        Math.round(viewport!.width),
        `the tab is ${Math.round(viewport!.width)}px inside a ${Math.round(column!.width)}px stage`,
      ).toBe(Math.round(column!.width));
    });
  }

  /**
   * One row of strip, at every width. Two is thirty pixels off the tab.
   *
   * `fitsOnOneLine` asks the question directly: every group shares vertical
   * space with the row's middle. It is the assertion that fails the day
   * somebody puts a fourth control back on the strip.
   */
  for (const size of HEIGHTS) {
    test(`keeps the strip to one row at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs", size);
      await fitsOnOneLine(page, ".songs-strip", `the strip at ${size.name}`);
      await fitsOnOneLine(page, ".songs-head", `the head at ${size.name}`);
    });
  }

  /**
   * Tablature first, and the notation staff one press away.
   *
   * The page drew standard notation AND tab for every system, so a screen
   * held half the bars it could. Counting the staves is the only way to ask:
   * alphaTab decides its own layout at run time, in a browser.
   */
  /**
   * Measured rather than asked about: alphaTab writes no class that says
   * "this is a tab staff", so what is checked is the consequence. The same
   * eight bars at the same width take a great deal more height when every
   * system carries a notation staff as well — that extra height is the
   * screenful of bars this item went looking for.
   */
  test("draws tab alone, and both staves when asked", async ({ page }) => {
    await openShot(page, "songs", { width: 1440, height: 900 });
    const engraving = () =>
      page.evaluate(() => {
        const host = document.querySelector(".songs-tab-host");
        return host ? host.getBoundingClientRect().height : 0;
      });
    const tabOnly = await engraving();
    expect(tabOnly, "nothing was engraved").toBeGreaterThan(0);

    await page.locator(".songs-notation-chip").click();
    await expect(page.locator(".songs-tab-host[data-ready]")).toHaveCount(1);
    await expect
      .poll(engraving, { message: "the notation staff never came back" })
      .toBeGreaterThan(tabOnly * 1.3);

    // And back again, so the control is a two-state control and not a door.
    await page.locator(".songs-notation-chip").click();
    await expect.poll(engraving, { message: "the notation staff never went away" }).toBeLessThan(
      tabOnly * 1.1,
    );
  });
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

  /**
   * One chip lights for one set of bars (W22 item 4).
   *
   * The shot's saved portion is "The chorus" over bars 5–8, which is exactly
   * what the file calls Chorus — so the stage had two chips lit over the same
   * four bars, which says the range is two things. The name the player chose
   * wins; the section stays on the row, unlit, because it is still a way in.
   */
  test("lights one chip when a saved portion covers a section's own bars", async ({ page }) => {
    await openShot(page, "songs-portion", { width: 1400, height: 900 });

    const lit = page.locator(".songs-strip-sections [aria-pressed='true']");
    await expect(lit, "two chips are lit over the same bars").toHaveCount(1);
    await expect(lit, "the section lit instead of the name the player gave it").toHaveText(
      "The chorus",
    );

    // The section is still there to press, and pressing it still works.
    const section = page.getByRole("button", { name: "Chorus", exact: true });
    await expect(section, "the file's own section went off the row").toHaveCount(1);
    await expect(section).toHaveAttribute("aria-pressed", "false");
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
  /**
   * The faders are one press away now (W29 item 3).
   *
   * They had a row of the strip to themselves, and the strip is one row.
   * Opening "More" is what a person does, and it is what these do: a control
   * behind a press still has to be a control when it is reached. On a narrow
   * stage the band folds again inside the panel, into its own chip — that is
   * `SongBand`'s own rule and W28 owns it, so this only follows it.
   */
  const openBand = async (page: import("@playwright/test").Page) => {
    await page.locator(".songs-more-chip").click();
    await expect(page.locator(".songs-more-pop")).toHaveCount(1);
    if ((await page.locator(".songs-band-opener").count()) > 0) {
      await page.locator(".songs-band-opener").click();
      await expect(page.locator(".songs-band-pop")).toHaveCount(1);
    }
    await expect(page.locator(".songs-band-lane").first()).toBeVisible();
  };

  test("never takes a row of the strip", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    // W28 put a fader in here for every track in the file, and a dozen of
    // them on the strip is the tab's height gone again.
    await expect(page.locator(".songs-strip .songs-band-lane")).toHaveCount(0);
    await openBand(page);
    await expect(page.locator(".songs-band-lane")).toHaveCount(4);
  });

  test("has a row for the click and for every track the file has", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    await openBand(page);
    const names = await page.locator(".songs-band-name").allTextContents();
    if (!IN_ENGLISH) {
      // In another language the names are that language's words, except the
      // three that are the FILE's and are never translated. That the band
      // has exactly four rows is still worth saying; what the one
      // translated row is called is `i18n.songs-wave.test.ts`'s job.
      expect(names, `four rows in ${LAYOUT_LOCALE}`).toHaveLength(4);
      return;
    }
    // W28 — the fixture is a guitar, a drum kit and a bass, and all three
    // sound. The guitar is the part being played, so it is FIRST and it is
    // the guide: before this it was the one track that was never heard,
    // which is what made pressing play a metronome.
    expect(names.map((n) => n.trim())).toEqual(["Click", "Guitar", "Drums", "Bass"]);
  });

  /**
   * Every lane keeps its name, at every width.
   *
   * It used to lose the word on a middling stage, because the lanes were
   * side by side on the strip and a lane is a name, a slider, a number and a
   * switch. They are stacked in a panel now, so the width they are squeezed
   * by is the panel's and not the stage's — and the panel is portalled to
   * the body, outside the `@container stage` this mode's rules ask about, so
   * the name stays whatever the window is doing.
   */
  test("keeps every lane's name, however narrow the stage", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    await openBand(page);
    const wide = await page.locator(".songs-band-name-text").first().boundingBox();
    expect(wide, "no lane name at 1400px").not.toBeNull();
    expect(wide!.width, "the lane names are gone on a wide stage").toBeGreaterThan(10);

    await openShot(page, "songs", { width: 480, height: 780 });
    await openBand(page);
    const narrow = await page.locator(".songs-band-name-text").first().boundingBox();
    expect(narrow, "no lane name at 480px").not.toBeNull();
    expect(narrow!.width, "the lane names went at the smallest window").toBeGreaterThan(10);
  });

  for (const theme of THEMES) {
    test(`fits at ${SMALLEST.width}×${SMALLEST.height} under ${theme}`, async ({ page }) => {
      await openShot(page, "songs", SMALLEST, theme);
      await noSidewaysScroll(page, `songs at ${SMALLEST.width}px under ${theme}`);

      // The faders are behind "More" now, and behind the band's own chip at
      // this width — opened here the way a person opens them, because a
      // control behind a press still has to be a control when it is reached.
      await openBand(page);

      // Every fader row is inside the window, and the slider in it is still
      // a slider rather than a sliver.
      const lanes = await page.$$eval(".songs-band-lane", (nodes) =>
        nodes.map((n) => {
          const row = n.getBoundingClientRect();
          const slider = n.querySelector("input[type=range]")!.getBoundingClientRect();
          // The MUTE, by its class rather than by its role: the solo
          // button beside it is a button too, and a query that took
          // whichever came first would measure the wrong control and pass
          // or fail for a reason nobody could read off the failure.
          const switchEl = n.querySelector(".songs-band-switch")!.getBoundingClientRect();
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

      // And the speed, which at this width is one chip with the six behind
      // it (W29 item 3) — it keeps its place on the row rather than leaving,
      // because the repeat and the speed are what sheds last.
      await page.keyboard.press("Escape");
      const speed = await page.locator(".songs-speed-chip").boundingBox();
      expect(speed, `no speed control under ${theme}`).not.toBeNull();
      expect(
        Math.round(speed!.x + speed!.width),
        "the speed chip is past the right edge",
      ).toBeLessThanOrEqual(SMALLEST.width + 1);

      await page.locator(".songs-speed-chip").click();
      const steps = await page.$$eval(".songs-speed-pop .songs-chip", (nodes) =>
        nodes.map((n) => n.getBoundingClientRect().right),
      );
      expect(steps.length, `no speed steps under ${theme}`).toBe(6);
      for (const right of steps) {
        expect(Math.round(right), "a speed step is past the right edge").toBeLessThanOrEqual(
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
 * A click goes there; a drag chooses a portion (W29 item 1).
 *
 * The owner, after his first session: *"when i click on the tab its selecting
 * it for loop instead of just going to that place — mimic songsterr click
 * events, they are the common industry"*. It belongs here and nowhere else:
 * telling the two gestures apart needs a pointer over a bar, and where a bar
 * is on the page is decided by alphaTab at run time in a real browser. The
 * arithmetic underneath — four pixels of slop — is `selection.test.ts`.
 */
test.describe("clicking the tab", () => {
  /** The middle of a printed bar, in window coordinates. */
  const barMiddle = (page: import("@playwright/test").Page, printedBar: number) =>
    page.evaluate((n) => {
      const overlay = document.querySelector(".songs-tab-overlay");
      const api = (
        window as unknown as {
          __SONGS_TAB_API__?: {
            renderer?: {
              boundsLookup?: {
                findMasterBarByIndex(
                  index: number,
                ): { visualBounds: { x: number; y: number; w: number; h: number } } | null;
              } | null;
            };
          };
        }
      ).__SONGS_TAB_API__;
      const bounds = api?.renderer?.boundsLookup?.findMasterBarByIndex(n - 1);
      if (!overlay || !bounds) return null;
      const box = overlay.getBoundingClientRect();
      const b = bounds.visualBounds;
      return { x: box.left + b.x + b.w / 2, y: box.top + b.y + b.h / 2 };
    }, printedBar);

  /** Where alphaTab's beat cursor is standing. */
  const cursorAt = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const el = document.querySelector(".at-cursor-beat");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) };
    });

  test("moves the playhead and chooses nothing", async ({ page }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    const before = await cursorAt(page);
    expect(before, "no cursor to move").not.toBeNull();

    const bar = await barMiddle(page, 3);
    expect(bar, "bar 3 was not engraved").not.toBeNull();
    await page.mouse.click(bar!.x, bar!.y);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

    // It went there...
    const after = await cursorAt(page);
    expect(
      after!.x !== before!.x || after!.y !== before!.y,
      "the cursor did not move to the bar that was clicked",
    ).toBe(true);
    // ...and the mark that says where play will begin is drawn on that bar.
    await expect(page.locator(".songs-tab-playhead")).toHaveCount(1);
    // ...and it chose nothing. A band would mean the old behaviour is back.
    await expect(page.locator(".songs-tab-band")).toHaveCount(0);
  });

  test("a drag across bars chooses them, and a click afterwards leaves them alone", async ({
    page,
  }) => {
    await openShot(page, "songs", { width: 1400, height: 900 });
    const from = await barMiddle(page, 5);
    const to = await barMiddle(page, 7);
    expect(from, "bar 5 was not engraved").not.toBeNull();
    expect(to, "bar 7 was not engraved").not.toBeNull();

    await page.mouse.move(from!.x, from!.y);
    await page.mouse.down();
    await page.mouse.move(to!.x, to!.y, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

    const bands = await page.locator(".songs-tab-band").count();
    expect(bands, "the drag chose nothing").toBeGreaterThan(0);

    // And now a plain click inside it. The repeat is a switch in every tab
    // player people know — Songsterr, Ultimate Guitar, Guitar Pro — so
    // touching the page must not take the passage away.
    const inside = await barMiddle(page, 6);
    await page.mouse.click(inside!.x, inside!.y);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    expect(
      await page.locator(".songs-tab-band").count(),
      "a click threw the chosen portion away",
    ).toBe(bands);
  });
});

/**
 * The part you are reading, from the head (W29 item 2).
 *
 * The owner: *"there's no dropdown for selecting the instrument if a file has
 * multiple instruments"*. The menu is portalled to the body, so nothing about
 * where it lands can be reasoned about from the stylesheet — and 320 px is
 * not a decoration: `useMenuPlacement` positions against a width it caps at
 * 320, so a wider panel is slid to an edge the hook thinks it is inside and
 * hangs off the right of a 480 px window.
 */
test.describe("the instrument menu", () => {
  for (const size of HEIGHTS) {
    test(`opens inside the window at ${size.name}`, async ({ page }) => {
      await openShot(page, "songs", size);
      await page.locator(".songs-track-chip").click();
      const pop = await page.locator(".songs-track-pop").boundingBox();
      expect(pop, `no instrument menu at ${size.name}`).not.toBeNull();
      expect(pop!.width, `the menu is ${Math.round(pop!.width)}px wide`).toBeLessThanOrEqual(320);
      expect(pop!.x, `the menu starts off-screen at ${size.name}`).toBeGreaterThanOrEqual(0);
      expect(
        pop!.x + pop!.width,
        `the menu runs past the right edge at ${size.name}`,
      ).toBeLessThanOrEqual(size.width);
      expect(pop!.y + pop!.height, `the menu runs off the bottom at ${size.name}`).toBeLessThanOrEqual(
        size.height,
      );
      await noSidewaysScroll(page, `the instrument menu at ${size.name}`);
    });
  }

  test("lists every part, and says why one cannot be chosen", async ({ page }) => {
    // The fixture's track names are the FILE's, not the locale's.
    test.skip(!IN_ENGLISH, "track names come from the file");
    await openShot(page, "songs", { width: 1400, height: 900 });
    await page.locator(".songs-track-chip").click();
    const rows = await page.$$eval(".songs-track-row", (nodes) =>
      nodes.map((node) => ({
        name: node.querySelector(".songs-track-row-name")?.textContent ?? "",
        facts: node.querySelector(".songs-track-row-facts")?.textContent ?? "",
        disabled: (node as HTMLButtonElement).disabled,
        chosen: node.hasAttribute("data-chosen"),
      })),
    );
    expect(rows.map((r) => r.name), "not every part of the file is listed").toEqual([
      "Guitar",
      "Drums",
      "Bass",
    ]);
    // The part being read is marked, and every fretted part says its tuning.
    expect(rows.filter((r) => r.chosen).map((r) => r.name)).toEqual(["Guitar"]);
    expect(rows[0].facts).toContain("E A D G B E");
    expect(rows[2].facts).toContain("E A D G");
    // The drum chart is there and is not offered, with the reason in the row.
    expect(rows[1].disabled, "the drum chart was offered as something to read").toBe(true);
    expect(rows[1].facts.length, "the drum row does not say why").toBeGreaterThan(0);
  });

  test("switches the tab, the tuning and the name to the chosen part", async ({ page }) => {
    test.skip(!IN_ENGLISH, "track names come from the file");
    await openShot(page, "songs", { width: 1400, height: 900 });
    const tuning = page.locator(".songs-facts dd").first();
    await expect(tuning).toHaveText("E A D G B E");

    await page.locator(".songs-track-chip").click();
    await page.getByRole("option", { name: /Bass/ }).click();

    await expect(page.locator(".songs-track-chip-name")).toHaveText("Bass");
    await expect(tuning).toHaveText("E A D G");
    // And the tab was re-engraved for it rather than left on the guitar.
    await expect(page.locator(".songs-tab-host[data-ready]")).toHaveCount(1);
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
