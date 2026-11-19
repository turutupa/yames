// Pictures of every theme on the screens a designer judges a theme by, and a
// WCAG AA count of each, for a person to look at (themes polish, 2026-11-19).
//
// Skipped unless THEME_SHOTS_OUT names a folder to write to, so the suite
// proper never writes a picture:
//
//   THEME_SHOTS_OUT=~/projects/.preview/themes-polish/after npx playwright test tests/layout/themes-polish-shots.spec.ts --workers=3
//
// THEME_SHOTS_THEMES=neon,ivory narrows the run to some themes;
// THEME_SHOTS_SCENES=tools,drill measures other scenes instead.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { openShot } from "./fits";
import { textContrast, belowAA } from "./contrast";

const OUT = process.env.THEME_SHOTS_OUT ? path.resolve(process.env.THEME_SHOTS_OUT) : null;
const SIZE = { width: 1400, height: 900 };
const PHONE = { width: 390, height: 844 };
const ALL = ["mono", "obsidian", "velvet", "neon", "aurora", "ivory", "arctic", "sand", "lavender", "prism", "ash", "ember", "manuscript"];
const THEMES = process.env.THEME_SHOTS_THEMES ? process.env.THEME_SHOTS_THEMES.split(",") : ALL;
/** scene → the root whose text is measured. */
const SCENES: Record<string, string> = {
  "today-returning": ".main-content, .rail",
  paths: ".main-content",
  "session-ready": ".session-page",
  "session-playing-neck": ".session-page",
  "session-result": ".session-page",
  "settings-update": ".main-content",
  "firstrun-welcome": ".onboarding-overlay",
  "firstrun-sound-look": ".onboarding-overlay",
  metronome: ".main-content",
};

// THEME_SHOTS_SCENES=tools,drill measures other scenes instead (no phone shots).
const EXTRA = process.env.THEME_SHOTS_SCENES?.split(",");
if (EXTRA) {
  for (const key of Object.keys(SCENES)) delete SCENES[key];
  for (const scene of EXTRA) SCENES[scene] = ".main-content, .session-page, .rail";
}

test.skip(!OUT, "set THEME_SHOTS_OUT to take the pictures");
test.slow();

test.beforeAll(() => {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
});

for (const theme of THEMES) {
  for (const [scene, root] of Object.entries(SCENES)) {
    test(`${scene} · ${theme}`, async ({ page }) => {
      await openShot(page, scene, SIZE, theme);
      expect(await page.evaluate(() => window.__SHOT_ERROR__), "the scene did not build").toBeUndefined();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT!, `${theme}-${scene}.png`) });
      const bad = belowAA(await textContrast(page, root));
      fs.writeFileSync(path.join(OUT!, `${theme}-${scene}.aa.json`), JSON.stringify(bad, null, 1));
    });
  }
  for (const scene of EXTRA ? [] : ["today-returning", "session-ready"]) {
    test(`${scene} · ${theme} · phone width`, async ({ page }) => {
      await openShot(page, scene, PHONE, theme);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT!, `${theme}-${scene}-390.png`) });
    });
  }
}
