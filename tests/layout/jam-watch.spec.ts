// Watching a jam back, measured — and photographed, because "does this look
// like something worth opening" is not a question any assertion answers.
//
// The panel lives inside the setup drawer, which `useMenuPlacement` caps at
// 320px, and it holds a 16:9 picture, a bar grid, a transport, a nudge and
// three actions. Everything here is that cap: nothing may be wider than the
// drawer, nothing may run off the bottom of the window at 480x780, and the
// sentence-level things — the chord, where in the form it is, and the
// transport — must be above the fold, which is what W25 held Songs' review to.
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { openShot, noSidewaysScroll } from "./fits";

const OUT = path.resolve(process.cwd(), ".jam-shots");

/** The three windows the jam work is held to, and two themes. */
const SIZES = [
  { name: "the smallest window", width: 480, height: 780 },
  { name: "a laptop", width: 1100, height: 720 },
  { name: "wide", width: 1440, height: 900 },
];

test.slow();

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

test.describe("a take opened to be watched back", () => {
  for (const size of SIZES) {
    test(`fits the drawer at ${size.name} (${String(size.width)}px)`, async ({ page }) => {
      await openShot(page, "jam-watch", size);

      const panel = page.locator(".jam-watch").first();
      await expect(panel).toHaveCount(1);

      /*
       * Brought into view before it is measured, and that is the harness's
       * doing rather than the app's: `openShot` builds every scene at 1440
       * and then narrows to the size under test (its own comment says why),
       * so the drawer is left scrolled to where the panel was in the WIDE
       * layout. The app scrolls the panel to the top of the drawer when it
       * opens — that is what `JamTakeView`'s own effect does, and what a
       * person gets. Nothing below is weakened by this: the question here is
       * whether the panel FITS the drawer once it is there, and a panel
       * taller than the room it has still fails.
       */
      // Both rectangles out of ONE layout pass: the drawer slides in and the
      // scroll above moves things, and two `boundingBox` calls a moment apart
      // measured a panel and a drawer that were never on screen together.
      const { box, drawer } = await panel.evaluate((node) => {
        node.scrollIntoView({ block: "start" });
        const rect = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return { box: rect(node), drawer: rect(node.closest(".jam-sheet")!) };
      });
      expect(
        box.x + box.width,
        `the watch panel runs ${String(Math.round(box.x + box.width - (drawer.x + drawer.width)))}px past the drawer at ${String(size.width)}px`,
      ).toBeLessThanOrEqual(drawer.x + drawer.width + 1);
      expect(box.x).toBeGreaterThanOrEqual(drawer.x - 1);

      // The things a sentence is made of, above the fold: what you were
      // playing over, where in the form that was, and the way to hear it.
      for (const selector of [".jam-watch-chord", ".jam-watch-where", ".jam-watch-play"]) {
        const part = (await page.locator(selector).first().boundingBox())!;
        expect(part, `${selector} is not drawn at ${String(size.width)}px`).not.toBeNull();
        expect(
          part.y + part.height,
          `${selector} is ${String(Math.round(part.y + part.height - size.height))}px below the fold at ${String(size.width)}px`,
        ).toBeLessThanOrEqual(size.height + 1);
      }

      // Nothing in it is wider than it is. A bar grid that scrolled sideways
      // inside a drawer is a grid whose last bar nobody reaches.
      const overflowing = await page.$$eval(".jam-watch *", (nodes) =>
        nodes
          .map((n) => ({ w: n.getBoundingClientRect().width, cls: n.className }))
          .filter((n) => typeof n.cls === "string" && n.w > 0),
      );
      for (const child of overflowing) {
        expect(child.w, `${String(child.cls)} is wider than the panel`).toBeLessThanOrEqual(
          box.width + 1,
        );
      }

      /*
       * The panel does not lie under the rows below it.
       *
       * The shelf's rows are 34 px tall by rule, and a panel opened inside one
       * of them overflowed it — the next two takes were drawn straight over
       * the picture, which is what a capture showed and no measurement here
       * was asking about. So it is asked about now.
       */
      const others = await page.$$eval(
        ".jam-takes-list .jam-take:not(:has(.jam-watch))",
        (nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return { y: r.y, bottom: r.y + r.height };
          }),
      );
      for (const row of others) {
        const clear = row.bottom <= box.y + 1 || row.y >= box.y + box.height - 1;
        expect(clear, `a take row lies over the open panel at ${String(size.width)}px`).toBe(true);
      }

      await noSidewaysScroll(page, `the jam drawer with a take open at ${String(size.width)}px`);
    });
  }

  test("plays a take with no picture as the timeline alone", async ({ page }) => {
    await openShot(page, "jam-watch-nopicture", { width: 1100, height: 720 });
    await expect(page.locator(".jam-watch")).toHaveCount(1);
    // No picture, so no video element and no nudge: there is nothing to line
    // the sound up against.
    await expect(page.locator(".jam-watch-video")).toHaveCount(0);
    await expect(page.locator(".jam-watch-nudge")).toHaveCount(0);
    // ...and the form is still there, which is the point of item 1's last
    // sentence: a take with no picture plays back too.
    await expect(page.locator(".jam-watch-grid .jam-watch-bar").first()).toBeVisible();
  });

  /**
   * The bar the panel lights is the bar the take actually opened on.
   *
   * The second fixture take was stamped at bar 8 of the form, which is what
   * pressing record while the band is already going produces — most takes. A
   * grid that started every take at bar one would be wrong about all of them,
   * and wrong in a way only a person watching one back would ever notice.
   */
  test("opens on the bar the take was recorded from", async ({ page }) => {
    await openShot(page, "jam-watch-midform", { width: 1100, height: 720 });
    const cells = page.locator(".jam-watch-bar");
    // Twelve bars of the form, every time round, whatever the take holds.
    await expect(cells).toHaveCount(12);
    // The seven before it are bars nobody played: drawn, and dead.
    for (let i = 0; i < 7; i++) await expect(cells.nth(i)).toBeDisabled();
    await expect(cells.nth(7)).toBeEnabled();
    await expect(cells.nth(7)).toHaveAttribute("data-current", "");
  });
});

/** The pictures, for a person — or an agent — to look at. */
test.describe("what it looks like", () => {
  for (const theme of ["ember", "ivory"]) {
    for (const size of SIZES) {
      test(`photographs the drawer at ${String(size.width)}px under ${theme}`, async ({ page }) => {
        await openShot(page, "jam-watch", size, theme);
        await page.locator(".jam-watch").first().evaluate((node) => {
          node.scrollIntoView({ block: "start" });
        });
        const file = path.join(OUT, `jam-watch-${String(size.width)}-${theme}.png`);
        await page.locator(".jam-sheet:has(.jam-watch)").first().screenshot({ path: file });
        console.log(`[shot] ${file}`);
      });
    }
  }
});
