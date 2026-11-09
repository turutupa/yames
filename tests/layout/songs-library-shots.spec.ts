// Pictures of the songs library, for a person to look at.
//
// The suite beside this one measures rectangles, and a rectangle cannot say
// whether a row reads well — whether the title is the thing your eye lands
// on, whether the artist under it is quiet enough, whether the folded shelf
// at the bottom looks like a place rather than a stray button. `.jam-shots/`
// exists for the same reason and is written the same way: a spec, because the
// harness is already here, into a git-excluded folder, never committed.
//
//   npx playwright test tests/layout/songs-library-shots.spec.ts --workers=2
//
// Three scenes (only the shelf, three of the player's own with the shelf
// folded, one very long title), three themes, two languages, two widths — the
// window the pictures are taken at and the narrowest one that still shows the
// panel at all (`useLibraryFit`'s LIBRARY_MIN_WIDTH).
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.cwd(), ".songs-library-shots");

const SCENES = [
  { id: "songs-starter", as: "only-included" },
  { id: "songs-library", as: "three-songs" },
  { id: "songs-long-title", as: "long-title" },
];
const THEMES = ["ember", "ivory", "manuscript"];
const LOCALES = ["en", "de"];
const SIZES = [
  { name: "default-1400", width: 1400, height: 900 },
  { name: "narrowest-620", width: 620, height: 780 },
];

test.slow();

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

for (const scene of SCENES) {
  for (const theme of THEMES) {
    for (const lng of LOCALES) {
      test(`${scene.as} · ${theme} · ${lng}`, async ({ page }) => {
        // Built wide and then narrowed, the way `openShot` does it: the
        // harness reaches the library through the rail, and below ~620px the
        // rail is a strip of icons with no library on it.
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(
          `/shots.html?shot=${scene.id}&theme=${theme}&window=main&lng=${lng}`,
        );
        await page.waitForFunction(
          () => window.__SHOT_READY__ === true || typeof window.__SHOT_ERROR__ === "string",
          undefined,
          { timeout: 60_000 },
        );
        expect(await page.evaluate(() => window.__SHOT_ERROR__), "the scene did not build").toBeUndefined();

        for (const size of SIZES) {
          await page.setViewportSize(size);
          await page.evaluate(
            () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
          );
          const panel = page.locator(".preset-sidebar");
          await expect(panel).toBeVisible();
          await panel.screenshot({
            path: path.join(OUT, `${scene.as}-${theme}-${lng}-${size.name}.png`),
          });
        }
      });
    }
  }
}

/**
 * And the confirm, which is the one thing in this panel that cannot be undone.
 *
 * Reached the way a person reaches it: right-click the row, press Remove from
 * Yames. Two themes, because the destructive button is the one place this
 * panel uses a colour of its own and a light theme is where that goes wrong.
 */
for (const theme of ["ember", "ivory"]) {
  test(`remove-confirm · ${theme} · en`, async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`/shots.html?shot=songs-library&theme=${theme}&window=main&lng=en`);
    await page.waitForFunction(() => window.__SHOT_READY__ === true, undefined, {
      timeout: 60_000,
    });
    await page.locator(".preset-sidebar-item.song-item").first().click({ button: "right" });
    await page.locator(".preset-context-menu .preset-context-delete").click();
    const card = page.locator(".song-remove-card");
    await expect(card).toBeVisible();
    // The take count is one call per part; wait for the line before the shot.
    await expect(page.locator(".song-remove-takes")).toBeVisible();
    await card.screenshot({ path: path.join(OUT, `remove-confirm-${theme}-en.png`) });
  });
}
