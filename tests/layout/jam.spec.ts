import { test, expect } from "@playwright/test";
import { openShot, fitsOnOneLine, noSidewaysScroll } from "./fits";

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

test.describe('"show the chords on the timeline"', () => {
  test("takes the names off the timeline and leaves the NOW block alone", async ({ page }) => {
    // It used to govern both, so a switch named after one part of the screen
    // quietly turned off the most useful part of another — the chord you are
    // on, its scales and the way to the fretboard. The owner found it by
    // comparing two machines and seeing a gap on one: "i think this switch
    // shouldn't affect that area, only the timeline".
    await openShot(page, "jam-setup", { width: 1500, height: 1000 });

    expect(await page.$(".jam-now-chord"), "no NOW block to begin with").toBeTruthy();
    const before = (await page.$$(".jam-timeline-cell .jam-timeline-chord")).length;
    expect(before, "no chord names on the timeline to begin with").toBeGreaterThan(0);

    const sw = await page.$(".jam-sheet-switch-row [role='switch']");
    expect(sw, "no chords switch in the drawer").toBeTruthy();
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
    await openShot(page, "jam-chords", { width: 1600, height: 1000 });
    await page.click(".jam-sheet-grow");
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

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
