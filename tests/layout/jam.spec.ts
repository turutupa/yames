import { test, expect } from "@playwright/test";
import { openShot, fitsOnOneLine, insideViewport, noSidewaysScroll, IN_ENGLISH } from "./fits";

/*
 * English only, for now.
 *
 * Every jam scene is driven by pressing Jam's own labels — "set up", "cheat
 * sheet", "edit changes", and a timeline that has to read "bar 5 of" before
 * the scene is ready — and those strings are English literals in
 * `src/shots/scenarios.ts`. Under `YAMES_LAYOUT_LOCALE` the buttons are still
 * there but no longer answer to those names, and the whole file times out
 * thirty seconds at a time saying nothing useful.
 *
 * Skipping is honest and cheap; making it run means giving the scenes locale
 * keys instead of labels, which is Jam's own piece of work and not the Songs
 * wave's. Songs, the review, the blocks gallery and Settings all run in every
 * language.
 */
test.skip(!IN_ENGLISH, "jam scenes are driven by Jam's English labels (see the note in jam.spec.ts)");

/**
 * The Jam playing screen, measured in a real browser.
 *
 * Written the day the owner reported "the piano has more drop downs making
 * the on off switch show up out of the table" — a bug that passed 4298 unit
 * tests, because they run in happy-dom, which computes no geometry at all.
 * Every element there is zero by zero, so a row whose contents run off its
 * right-hand edge measures exactly the same as one that fits.
 *
 * The widths are the four the layout actually changes at: a narrow window,
 * either side of the 1024px breakpoint where the live note readout gives up
 * its room, and the size the screenshots are taken at.
 */
const WIDTHS = [
  { name: "narrow", width: 520, height: 900 },
  { name: "under the breakpoint", width: 760, height: 900 },
  { name: "over the breakpoint", width: 1100, height: 900 },
  { name: "wide", width: 1400, height: 900 },
];

/**
 * Is it on screen while the band plays? (added 2026-09-20 with W18)
 *
 * Every test in this file asks whether a box fits its PARENT, and a row fits
 * its parent perfectly while the parent sits below the bottom of the window.
 * That is how Songs shipped with the faders A13 puts on the stage 28px under
 * a 900px window, past a hundred and seven green tests — so the question gets
 * asked here too, of the controls A13 names for Jam: what each player is
 * doing, and how loud they are.
 *
 * The chord, the beat and the band, at the two window heights a person
 * practises at. The rest of the Jam stage — the timeline, the practice tools —
 * is below the fold by design and this does not claim otherwise
 * (`jam.css`: "five stacked sections and a timeline, so it overflows a 900px
 * window"); what may not be below it is the row you reach for mid-chorus.
 */
test.describe("what you reach for mid-chorus", () => {
  for (const size of [
    { name: "a laptop", width: 1100, height: 720 },
    { name: "the pictures", width: 1400, height: 900 },
  ]) {
    test(`is on screen while the jam runs at ${size.name}`, async ({ page }) => {
      await openShot(page, "jam", size);
      await expect(page.locator(".transport-play.playing")).toHaveCount(1);
      await insideViewport(page, ".jam-now", `the chord at ${size.name}`, size);
      await insideViewport(page, ".jam-band .jam-band-lane", `the band at ${size.name}`, size);
    });
  }
});

test.describe("the band rows", () => {
  for (const size of WIDTHS) {
    test(`hold their controls at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, "jam", size);
      // Every row: the name, the detail, the player's own picker, the live
      // readout, the volume and the on/off switch, all on one line inside the
      // row. This is the assertion the reported bug fails.
      await fitsOnOneLine(page, ".jam-band-lane", `band rows at ${size.width}px`);
      await noSidewaysScroll(page, `the jam screen at ${size.width}px`);
    });
  }

  test("keeps the volume and the switch reachable on every player's row", async ({ page }) => {
    // The two controls that were pushed out. A row that draws them off screen
    // "fits" by every other measure — they are still inside the row, the row
    // is just past the window — so they are checked against the WINDOW.
    await openShot(page, "jam", { width: 760, height: 900 });
    const width = page.viewportSize()!.width;

    for (const control of [".jam-band-volume", ".jam-band-lane > .jam-switch"]) {
      const boxes = await page.$$eval(control, (nodes) =>
        nodes.map((n) => n.getBoundingClientRect().right),
      );
      expect(boxes.length, `no ${control} on the screen`).toBeGreaterThan(0);
      for (const right of boxes) {
        expect(Math.round(right), `${control} ends at ${Math.round(right)}, past the window`)
          .toBeLessThanOrEqual(width);
      }
    }
  });

  test("puts every player's picker in the same column", async ({ page }) => {
    // Not a fit but a tidiness the grid is there to give: the drums row's
    // groove, the bass row's figure and the keys row's comping are one column
    // down the screen, so the eye reads them as the same kind of thing.
    await openShot(page, "jam-band", { width: 1400, height: 900 });
    const lefts = await page.$$eval(".jam-band-extra .jam-dropdown", (nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().left)),
    );
    expect(lefts.length, "no player pickers on the screen").toBeGreaterThan(1);
    expect(new Set(lefts).size, `the pickers start at ${lefts.join(", ")}`).toBe(1);
  });
});

test.describe("the band rows with the setup drawer open", () => {
  /*
   * The case the first pass missed.
   *
   * The drawer takes half the window, so the stage behind it is narrow while
   * the WINDOW is wide — and every responsive rule here is written against
   * the window. On the owner's 2000px screen with Set up open, the stage was
   * about 900px and the volume slider was drawn straight over the groove
   * dropdown. A test at four window widths with the drawer shut could not
   * see it; this one opens the drawer, which is the narrow stage.
   */
  for (const size of [
    { name: "wide", width: 1900, height: 1000 },
    { name: "medium", width: 1500, height: 1000 },
  ]) {
    test(`hold their controls at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, "jam-setup", size);
      await fitsOnOneLine(page, ".jam-band-lane", `band rows behind the drawer at ${size.width}px`);
    });
  }

  test("never draws one control over another", async ({ page }) => {
    // Overlap is its own failure: a grid item wider than its track spills
    // across the one beside it, and the row still "fits" because the row is
    // as wide as it ever was. Only the rectangles say the slider is sitting
    // on top of the dropdown.
    await openShot(page, "jam-setup", { width: 1900, height: 1000 });
    const rows = await page.$$(".jam-band-lane");
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const parts = await row.evaluate((node) =>
        [...node.children]
          .map((child) => {
            const r = child.getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              what: (child.className || child.tagName).toString().slice(0, 40),
            };
          })
          .filter((p) => p.right > p.left),
      );
      for (let i = 1; i < parts.length; i++) {
        expect(
          Math.round(parts[i].left),
          `"${parts[i - 1].what}" ends at ${Math.round(parts[i - 1].right)} and "${parts[i].what}" starts at ${Math.round(parts[i].left)} — they overlap`,
        ).toBeGreaterThanOrEqual(Math.round(parts[i - 1].right) - 1);
      }
    }
  });
});

test.describe("a player's heading in the setup drawer", () => {
  test("puts every player's controls in the same place", async ({ page }) => {
    // Four sections, four headings, and the volume and switch on each of them
    // have to line up down the sheet — otherwise the eye has to find them
    // again in every section.
    await openShot(page, "jam-setup", { width: 1500, height: 1000 });
    // The PLAYERS. Takes wears a switch on its heading too, but it carries no
    // volume beside it and is not somebody you hire, so it has no business
    // lining up with them.
    const players = ["drums", "bass", "keys", "perc"]
      .map((p) => `.jam-sheet-group[data-player="${p}"] .jam-sheet-group-control`)
      .join(", ");
    const lefts = await page.$$eval(players, (nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().left)),
    );
    expect(lefts.length, "no player headings on screen").toBeGreaterThan(1);
    expect(new Set(lefts).size, `the controls start at ${lefts.join(", ")}`).toBe(1);
  });

  test("does not move when a player is switched on or off", async ({ page }) => {
    // The switch says "Playing" or "out", which are different lengths, and it
    // sits at the end of a heading pushed to the right — so every flip used
    // to drag the slider and the switch sideways. The owner: "each element
    // must have the same width so it doesn't move left or right".
    await openShot(page, "jam-setup", { width: 1500, height: 1000 });
    const control = (await page.$(
      '.jam-sheet-group[data-player="drums"] .jam-sheet-group-control',
    ))!;
    const before = (await control.boundingBox())!;

    await (await control.$('[role="switch"]'))!.click();
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const after = (await control.boundingBox())!;

    expect(Math.round(after.x), "the controls moved sideways").toBe(Math.round(before.x));
    expect(Math.round(after.width), "the controls changed width").toBe(Math.round(before.width));
  });
});

test.describe('"chord names"', () => {
  test("takes the names off the timeline and leaves the NOW block alone", async ({ page }) => {
    // It used to govern both, so a switch named after one part of the screen
    // quietly turned off the most useful part of another — the chord you are
    // on, its scales and the way to the fretboard. The owner found it by
    // comparing two machines and seeing a gap on one: "i think this switch
    // shouldn't affect that area, only the timeline".
    await openShot(page, "jam", { width: 1500, height: 1000 });

    expect(await page.$(".jam-now-chord"), "no NOW block to begin with").toBeTruthy();
    const before = (await page.$$(".jam-timeline-cell .jam-timeline-chord")).length;
    expect(before, "no chord names on the timeline to begin with").toBeGreaterThan(0);

    // In the practice row now, not the drawer: the drawer's copy of it went,
    // because a control in two places is a control you have to check twice.
    const sw = await page.$('.jam-practice-chip:has-text("Chord names") [role=\'switch\']');
    expect(sw, "no chord names switch in the practice row").toBeTruthy();
    await sw!.scrollIntoViewIfNeeded();
    await sw!.click();
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

    expect((await page.$$(".jam-timeline-cell .jam-timeline-chord")).length,
      "the timeline kept its chord names").toBe(0);
    expect(await page.$(".jam-now-chord"), "the NOW block went with them").toBeTruthy();
  });
});

test.describe("the practice switches", () => {
  /*
   * Reported twice: "it wraps which looks meh", and then "i still don't love
   * how this wraps... i feel like it should wrap into 2 columns instead of
   * just one item wrapping". Four across or two and two — never three and a
   * stray, which is what a flex row does when it runs out of space.
   */
  for (const size of [
    { name: "wide", width: 1500, height: 1000, rows: 1 },
    { name: "narrow", width: 900, height: 1000, rows: 2 },
  ]) {
    test(`sit in ${size.rows} row(s) at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, "jam", size);
      const tops = await page.$$eval(".jam-practice .jam-practice-chip", (nodes) =>
        nodes.map((n) => Math.round(n.getBoundingClientRect().top)),
      );
      expect(tops.length, "no practice switches on screen").toBeGreaterThan(2);

      const rows = [...new Set(tops)].sort((a, b) => a - b);
      expect(rows.length, `the switches are on ${rows.length} lines`).toBe(size.rows);
      // Two lines means two and two, not three and one.
      if (rows.length === 2) {
        const counts = rows.map((top) => tops.filter((t) => t === top).length);
        expect(counts[0], `${counts.join(" then ")}`).toBe(counts[1]);
      }
    });
  }
});

test.describe("a dropdown menu", () => {
  /*
   * Menus hung from their chip's bottom-left corner and were as tall as they
   * liked. A chip near the right-hand edge sent the menu off the window; a
   * chip low in the setup drawer sent it off the bottom. Neither is visible
   * to a test that cannot measure, which is every other test in this repo.
   */
  test("opens inside the window, wherever its chip is", async ({ page }) => {
    await openShot(page, "jam-setup", { width: 1500, height: 900 });

    const chips = await page.$$(".jam-sheet .jam-dropdown");
    expect(chips.length, "no dropdowns in the setup drawer").toBeGreaterThan(0);

    for (const chip of chips) {
      if (!(await chip.isVisible())) continue;
      await chip.scrollIntoViewIfNeeded();
      await chip.click();
      const menu = await page.waitForSelector(".jam-dropdown-menu", { timeout: 5000 });
      const box = (await menu.boundingBox())!;
      const label = (await chip.textContent())?.trim().slice(0, 30);
      const { width, height } = page.viewportSize()!;

      expect(Math.round(box.x), `${label}: the menu starts off the left`).toBeGreaterThanOrEqual(0);
      expect(Math.round(box.x + box.width), `${label}: the menu runs off the right`)
        .toBeLessThanOrEqual(width);
      expect(Math.round(box.y), `${label}: the menu starts above the window`).toBeGreaterThanOrEqual(0);
      expect(Math.round(box.y + box.height), `${label}: the menu runs off the bottom`)
        .toBeLessThanOrEqual(height);
      /*
       * And it scrolls rather than growing. "Inside the window" was not
       * enough on its own: the bass style menu has fifteen rows and on a
       * tall window it drew every one of them, six hundred-odd pixels of
       * menu over the screen it belongs to, passing this test the whole
       * time. The stylesheet's cap was being overridden inline.
       */
      expect(Math.round(box.height), `${label}: the menu is ${Math.round(box.height)}px tall`)
        .toBeLessThanOrEqual(320);

      await page.keyboard.press("Escape");
    }
  });
});

test.describe("the cheat sheet, maximized", () => {
  test("takes the window but never covers Stop", async ({ page }) => {
    // The owner asked for it to "use the whole app space", and it does — the
    // rail and the header are navigation and you are not navigating. The
    // transport is the exception, and not as a matter of taste: its own
    // stylesheet says "Play and Stop never go — finding how to stop is the
    // one thing that must always work".
    // It OPENS wide now rather than being made wide: the chord chart is
    // twelve roots by sixteen types, and in a 600px drawer that is four
    // columns and a sideways scroll, which is not a cheat sheet. So there is
    // nothing to press here — the button in the header shrinks it instead.
    await openShot(page, "jam-chords", { width: 1600, height: 1000 });

    const sheet = (await (await page.waitForSelector(".jam-sheet")).boundingBox())!;
    const transport = await page.$(".transport");
    expect(transport, "no transport on the jam screen").toBeTruthy();
    const stop = (await transport!.boundingBox())!;

    expect(Math.round(sheet.x), "the sheet leaves a gap at the left").toBe(0);
    expect(Math.round(sheet.width), "the sheet is not the full width").toBe(
      page.viewportSize()!.width,
    );
    expect(
      Math.round(sheet.y + sheet.height),
      "the sheet is drawn over the transport",
    ).toBeLessThanOrEqual(Math.round(stop.y) + 1);
  });

  test("shrinks back into the drawer when asked, and stays there", async ({ page }) => {
    await openShot(page, "jam-chords", { width: 1600, height: 1000 });
    const wide = (await (await page.waitForSelector(".jam-sheet")).boundingBox())!;

    await page.click(".jam-sheet-grow");
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const narrow = (await (await page.waitForSelector(".jam-sheet")).boundingBox())!;
    expect(Math.round(narrow.width), "the button did not shrink it").toBeLessThan(
      Math.round(wide.width),
    );
  });
});

test.describe("the key, on the playing screen", () => {
  test("opens its menu inside the window", async ({ page }) => {
    // The chip sits at the right-hand end of the header, so a menu hung from
    // its left ran off the screen; the picker measures the room and flips.
    // Whether it flipped correctly is a question only a browser can answer.
    await openShot(page, "jam", { width: 1400, height: 900 });
    await page.click(".jam-key-picker .jam-dropdown");
    const menu = await page.waitForSelector(".jam-key-menu");
    const box = (await menu.boundingBox())!;
    const width = page.viewportSize()!.width;

    expect(Math.round(box.x), "the key menu starts off the left of the window").toBeGreaterThanOrEqual(0);
    expect(Math.round(box.x + box.width), "the key menu runs off the right of the window")
      .toBeLessThanOrEqual(width);
  });

  test("still fits when the window is narrow", async ({ page }) => {
    await openShot(page, "jam", { width: 520, height: 900 });
    await page.click(".jam-key-picker .jam-dropdown");
    const box = (await (await page.waitForSelector(".jam-key-menu")).boundingBox())!;
    expect(Math.round(box.x)).toBeGreaterThanOrEqual(0);
    expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await noSidewaysScroll(page, "the jam screen with the key menu open");
  });
});

test.describe("a variation chip", () => {
  test("costs nothing in width when its bars come up", async ({ page }) => {
    /*
     * Resting on a chip previews the vibe, and three little bars rise and
     * fall on the chip to say the band is sounding. They used to be part of
     * the chip's content, so the chip grew by their width for as long as the
     * mouse was on it and every chip to its right slid along — the owner
     * liked the animation and was ready to lose it over this: "maybe we
     * should get rid of that cool animation unfortunately". It keeps its
     * animation; the bars are drawn out of the flow, into padding the chips
     * carry whether or not anything is sounding.
     *
     * The mark is put there directly rather than by hovering, because what
     * broke was the geometry — a mark costs width — and not the hover that
     * reveals it.
     */
    await openShot(page, "jam-setup", { width: 1500, height: 1000 });
    const chips = ".jam-variations .jam-chip";
    await page.waitForSelector(chips);

    const widths = () =>
      page.$$eval(chips, (nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().width)));

    const before = await widths();
    expect(before.length, "no variation chips to measure").toBeGreaterThan(1);

    await page.$eval(chips, (chip) => {
      const mark = document.createElement("span");
      mark.className = "jam-vibe-playing";
      mark.innerHTML = "<i></i><i></i><i></i>";
      chip.appendChild(mark);
    });

    expect(await widths(), "a sounding chip pushes the row along").toEqual(before);
  });
});

test.describe("the chord chart", () => {
  test("keeps its diagrams readable rather than squeezing them to fit", async ({ page }) => {
    /*
     * A table's first instinct is to shrink its columns until it fits, and
     * every chord box carries `max-width: 100%` — between them a 96px
     * diagram came out thirty-one pixels across with six strings drawn in
     * it. No unit test sees this: happy-dom gives every one of those
     * diagrams the same zero width.
     */
    await openShot(page, "jam-chords-all", { width: 1500, height: 1000 });
    await page.waitForSelector(".jam-chord-table");

    const widths = await page.$$eval(".jam-chord-cell .chord-diagram svg", (nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().width)),
    );
    expect(widths.length, "no chord boxes in the chart").toBeGreaterThan(20);
    const narrowest = Math.min(...widths);
    expect(narrowest, `the narrowest box is ${narrowest}px`).toBeGreaterThanOrEqual(90);

    // Every row of a section is the same length, so a column heading means
    // the same thing all the way down it.
    const ragged = await page.$$eval(".jam-chord-family", (families) =>
      families
        .map((f) => [
          ...new Set(
            [...f.querySelectorAll("tbody tr")].map((r) => r.querySelectorAll("td").length),
          ),
        ].length)
        .filter((n) => n !== 1).length,
    );
    expect(ragged, "a section's rows are different lengths").toBe(0);

    await noSidewaysScroll(page, "the cheat sheet with the chart open");
  });

  test("splits into sections narrow enough not to scroll sideways", async ({ page }) => {
    /*
     * It was ONE table of all thirty-two chord types, which is wider than
     * any window — so it grew a horizontal scrollbar at the FOOT of a
     * twelve-row table, and you had to scroll past the whole chart to reach
     * the thing that scrolls it: "there's a horizontal bar which is awful,
     * because in order to see the horizontal bar i need to scroll down
     * first". Four narrower tables, read top to bottom, need no such thing.
     */
    await openShot(page, "jam-chords-all", { width: 1700, height: 1100 });
    const overflow = await page.$$eval(".jam-chord-table-wrap", (wraps) =>
      wraps.map((w) => w.scrollWidth - w.clientWidth),
    );
    expect(overflow.length, "no sections drawn").toBeGreaterThan(1);
    for (const over of overflow) {
      expect(over, `a section overflows its box by ${over}px`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('"take me to"', () => {
  test("scrolls the sheet to a family without hiding anything", async ({ page }) => {
    /*
     * Not a filter, and the difference is the point: "clicking on minor it
     * focuses the minor chords but doesn't fucking filter... filtering is
     * annoying because it changes the whole page". It scrolls DOWN to the
     * section, which is the direction a page moves anyway.
     */
    await openShot(page, "jam-chords-all", { width: 1500, height: 1000 });
    const cells = () => page.$$eval(".jam-chord-card", (n) => n.length);
    const before = await cells();
    expect(before, "no chart to jump around").toBeGreaterThan(100);

    const body = ".jam-sheet-body";
    expect(await page.$eval(body, (n) => n.scrollTop)).toBe(0);

    await page.click(".jam-chord-jump button:nth-of-type(2)");
    await page.waitForFunction(
      (sel) => (document.querySelector(sel) as HTMLElement).scrollTop > 0,
      body,
      { timeout: 4000 },
    );

    expect(await page.$eval(body, (n) => n.scrollTop)).toBeGreaterThan(0);
    expect(await cells(), "the jump removed chords from the chart").toBe(before);
  });
});

test.describe("the scales sheet", () => {
  test("fits several scales on the page, the way the printed card does", async ({ page }) => {
    /*
     * It used to draw one neck stretched to the width of the sheet — about
     * two and a half times the size it was designed at, so a single scale
     * took a third of the screen and every dot was eighteen pixels across.
     * The card the owner sent fits six scales on a page, and the reason it
     * is readable at that size is that a scale is a SHAPE: you read it off
     * the spacing between the dots, which a dot nearly as wide as its fret
     * leaves none of.
     */
    await openShot(page, "jam-chords", { width: 1600, height: 1100 });
    await page.click('.jam-cheat-controls .accent-control:nth-of-type(1) button:nth-of-type(2)');
    const boards = await page.$$eval(".jam-scale-board", (nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().height)),
    );
    expect(boards.length, "no scales drawn").toBeGreaterThan(1);

    // A scale and its title bar in under a fifth of the window, so several
    // are readable at once rather than one at a time.
    const tallest = Math.max(...boards);
    expect(tallest, `a scale block is ${tallest}px tall`).toBeLessThan(1100 / 5);

    // And the dots stay small enough to read the shape between them.
    const dot = await page.$eval(
      ".jam-scale-board .fretboard-dot",
      (n) => n.getBoundingClientRect().width,
    );
    expect(Math.round(dot), `the dots are ${Math.round(dot)}px across`).toBeLessThan(16);
  });
});

test.describe("a row of controls in the setup drawer", () => {
  test("lines its dropdowns and its segmented controls up with each other", async ({ page }) => {
    /*
     * A dropdown carries its label INSIDE the chip — "VOICE  Fingered" —
     * and a segmented control used to carry its above the buttons, so on a
     * row holding both the two shapes could not line up however the row was
     * aligned: the owner, on the bass lane, "this ACTIVITY label is making
     * the 3 way switch to be unaligned with the 2 dropdowns to its left".
     * They are one control in two shapes; on a row together they say so.
     */
    await openShot(page, "jam-setup", { width: 1500, height: 1000 });

    /*
     * A row WRAPS when the sheet is narrow, so two controls on it may
     * legitimately be on different lines. What has to line up is whatever
     * ends up side by side — so the controls are grouped into lines first
     * and each line checked on its own.
     */
    const lines = await page.$$eval(".jam-sheet-row", (nodes) => {
      const out: number[][] = [];
      for (const row of nodes) {
        const middles = [...row.querySelectorAll<HTMLElement>(".jam-dropdown, .accent-options")]
          .map((el) => {
            const box = el.getBoundingClientRect();
            return Math.round(box.top + box.height / 2);
          })
          .sort((a, b) => a - b);
        // Anything within half a control's height of its neighbour is on the
        // same line; a wrap puts the next one a whole row lower.
        let line: number[] = [];
        for (const middle of middles) {
          if (line.length && middle - line[line.length - 1] > 20) {
            out.push(line);
            line = [];
          }
          line.push(middle);
        }
        if (line.length) out.push(line);
      }
      return out.filter((l) => l.length > 1);
    });
    expect(lines.length, "no line holds two controls to compare").toBeGreaterThan(0);

    for (const middles of lines) {
      const drift = middles[middles.length - 1] - middles[0];
      expect(drift, `controls side by side sit ${drift}px apart: ${middles.join(", ")}`)
        .toBeLessThanOrEqual(2);
    }
  });
});

test.describe("the groove editor", () => {
  test("gets the whole stage, with none of its grid under the drawer", async ({ page }) => {
    /*
     * "Make your own" lives in the setup drawer, and the editor docks to the
     * foot of the STAGE — so it opened a twelve-column grid into the half a
     * stage the drawer had left, and the rest ran underneath it. Building a
     * groove is a different job from choosing one and it needs the room, so
     * the drawer closes on the way in.
     */
    await openShot(page, "jam-editor", { width: 1500, height: 1000 });

    // The drawer is not over it.
    expect(await page.$(".jam-sheet"), "the setup drawer stayed open").toBeNull();

    const grid = (await (await page.waitForSelector(".jam-editor__grid")).boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(Math.round(grid.x), "the grid starts off the left").toBeGreaterThanOrEqual(0);
    expect(Math.round(grid.x + grid.width), "the grid runs off the right").toBeLessThanOrEqual(
      width,
    );

    // Every column of it is on screen, not just the box that holds them.
    const cells = await page.$$eval(".jam-editor__grid button", (nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().right)),
    );
    expect(cells.length, "no cells in the grid").toBeGreaterThan(12);
    expect(Math.max(...cells), "a cell runs off the right").toBeLessThanOrEqual(width);

    await noSidewaysScroll(page, "the jam screen with the groove editor open");
  });
});
