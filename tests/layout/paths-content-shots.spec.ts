// Pictures of the Paths added on mvp-paths-content, for a person to look at:
// the Paths screen with the new cards on it, and one Session ready neck a Path.
//
// Skipped unless PATHS_SHOTS_OUT names a folder to write to, so the suite
// proper never writes a picture:
//
//   PATHS_SHOTS_OUT=~/projects/.preview/paths-content npx playwright test tests/layout/paths-content-shots.spec.ts --workers=2
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { openShot } from "./fits";

const OUT = process.env.PATHS_SHOTS_OUT ? path.resolve(process.env.PATHS_SHOTS_OUT) : null;
const SIZE = { width: 1400, height: 900 };
const SCENES = ["paths", "session-neck-legato", "session-neck-rhythm", "session-neck-metal", "session-neck-know", "session-neck-scales", "session-neck-tapping", "session-neck-funk", "session-neck-triads", "session-neck-chords", "session-neck-arpeggios", "session-neck-first-chords"];
const THEMES = ["ember", "ivory"];

test.skip(!OUT, "set PATHS_SHOTS_OUT to take the pictures");
test.slow();

test.beforeAll(() => {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
});

for (const scene of SCENES) {
  for (const theme of THEMES) {
    test(`${scene} · ${theme}`, async ({ page }) => {
      await openShot(page, scene, SIZE, theme);
      expect(await page.evaluate(() => window.__SHOT_ERROR__), "the scene did not build").toBeUndefined();
      // The Paths list fades in; a picture taken on the ready flag is of an empty page.
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT!, `${scene}-${theme}.png`) });
      if (scene === "paths") {
        // The new cards sit below the owner's five: a second picture, scrolled to them.
        await page.locator('[data-testid="path-card-metal-rhythm"]').scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT!, `${scene}-new-${theme}.png`) });
      }
    });
  }
}
