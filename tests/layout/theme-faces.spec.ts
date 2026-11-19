import { test, expect, type Page } from "@playwright/test";
import { openShot } from "./fits";
import { textContrast, belowAA } from "./contrast";

/**
 * Everything follows the current theme (owner, 2026-11-18).
 *
 * The first-run wizard used to pin its own faces (Barlow Condensed, Fraunces,
 * Inter) and its own warm-dark palette whatever the theme. These tests hold
 * the wizard, the rail and Today to the theme's own faces, in three themes
 * whose faces could not be mistaken for each other (Neon's Orbitron, Ivory's
 * serifs, Mono's system sans), and the wizard's text to WCAG AA in those and
 * in the two gradient themes, where every panel must be a solid token.
 */
const SIZE = { width: 1400, height: 900 };
const FACE_THEMES = ["neon", "ivory", "mono"];

/** Visible elements with their own text whose face is not one of the theme's tokens. */
async function strangers(page: Page, root: string) {
  return page.evaluate((root) => {
    const norm = (s: string) => s.replace(/["']/g, "").replace(/\s*,\s*/g, ",").trim().toLowerCase();
    const css = getComputedStyle(document.documentElement);
    const faces = ["--font-display", "--font-heading", "--font-body", "--font-num", "--font-family"].map((t) =>
      norm(css.getPropertyValue(t)),
    );
    const out: string[] = [];
    let seen = 0;
    for (const r of document.querySelectorAll(root)) {
      for (const el of r.querySelectorAll<HTMLElement>("*")) {
        // W2's preview wears the previewed theme on purpose.
        if (el.closest("svg, canvas, .onboarding-theme-preview, .theme-card-preview")) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && /[\p{L}\p{N}]/u.test(n.textContent ?? ""))) continue;
        const box = el.getBoundingClientRect();
        if (box.width < 1 || box.height < 1 || getComputedStyle(el).visibility !== "visible") continue;
        seen++;
        const face = norm(getComputedStyle(el).fontFamily);
        // Key caps keep a monospace face.
        if (faces.includes(face) || face.endsWith("monospace")) continue;
        out.push(`${el.className || el.tagName} "${(el.textContent ?? "").trim().slice(0, 24)}": ${face}`);
      }
    }
    return { seen, out };
  }, root);
}

/** The wizard's card has stopped moving (a step can grow a line after it mounts). */
async function settled(page: Page) {
  await page.mouse.move(2, 2);
  let last = "";
  for (let i = 0; i < 20; i++) {
    const now = await page.locator(".onboarding-card").evaluate((el) => JSON.stringify(el.getBoundingClientRect()));
    if (now === last) return;
    last = now;
    await page.waitForTimeout(250);
  }
}

for (const theme of FACE_THEMES) {
  for (const scene of ["firstrun-welcome", "firstrun-start", "firstrun-hands-free", "firstrun-ready"]) {
    test(`${scene} in ${theme}: the wizard and the rail wear the theme's faces`, async ({ page }) => {
      await openShot(page, scene, SIZE, theme);
      const { seen, out } = await strangers(page, ".onboarding-overlay, .rail");
      expect(seen, "no text was found").toBeGreaterThan(5);
      expect(out).toEqual([]);
    });
  }
  test(`Today in ${theme}: the page and the rail wear the theme's faces`, async ({ page }) => {
    await openShot(page, "today-returning", SIZE, theme);
    const { seen, out } = await strangers(page, ".main-content, .rail");
    expect(seen, "no text was found").toBeGreaterThan(5);
    expect(out).toEqual([]);
  });
}

test("picking Aurora on W2 restyles the wizard's own titles, buttons and card", async ({ page }) => {
  // W2 offers Obsidian, Aurora and Ivory; Ivory's serifs and Aurora's Inter
  // cannot be mistaken for each other, nor Ivory's paper for Aurora's night.
  await openShot(page, "firstrun-sound-look", SIZE, "ivory");
  const look = () =>
    page.evaluate(() => ({
      title: getComputedStyle(document.querySelector(".onboarding-step-title")!).fontFamily,
      button: getComputedStyle(document.querySelector(".onboarding-footer .onboarding-btn-primary")!).fontFamily,
      card: getComputedStyle(document.querySelector(".onboarding-card")!).backgroundColor,
    }));
  const before = await look();
  expect(before.title.toLowerCase()).toContain("fraunces");
  await page.locator(".onboarding-theme-card", { hasText: "Aurora" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "aurora");
  const after = await look();
  expect(after.title.toLowerCase()).toMatch(/^"?inter/);
  expect(after.button.toLowerCase()).toMatch(/^"?inter/);
  expect(after.card).not.toEqual(before.card);
  const { out } = await strangers(page, ".onboarding-overlay");
  expect(out).toEqual([]);
});

const WIZARD = [
  "firstrun-welcome",
  "firstrun-instrument",
  "firstrun-start",
  "firstrun-input",
  "firstrun-input-none",
  "firstrun-sound-look",
  "firstrun-hands-free",
  "firstrun-ready",
];

for (const theme of [...FACE_THEMES, "aurora", "prism"]) {
  for (const scene of WIZARD) {
    test(`${scene} in ${theme}: the wizard's text clears AA`, async ({ page }) => {
      await openShot(page, scene, SIZE, theme);
      await settled(page);
      let measured = 0;
      const bad = [];
      // The card scrolls on a long step: measure every screenful of it.
      for (let i = 0; i < 4; i++) {
        const hits = await textContrast(page, ".onboarding-card");
        measured += hits.length;
        bad.push(...belowAA(hits));
        const more = await page.evaluate(() => {
          const body = document.querySelector(".onboarding-body")!;
          const was = body.scrollTop;
          body.scrollTop += body.clientHeight * 0.8;
          return body.scrollTop !== was;
        });
        if (!more) break;
        await page.waitForTimeout(150);
      }
      expect(measured, "no text was measured").toBeGreaterThan(5);
      expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
    });
  }
}

/**
 * The big headlines wear the theme's heading face, in all thirteen themes
 * (owner, 2026-11-18: "I still see the word TODAY ... without the theme's
 * fonts"). Ember's heading face is its display face, Barlow Condensed, like
 * its titles and clocks; Ivory and Manuscript keep their serif by design.
 * Measured on the element itself, so a rule that pins a face on one
 * headline (rather than the token) fails here even if the token is right.
 */
const ALL_THEMES = "mono obsidian velvet neon aurora ash ember ivory arctic sand lavender prism manuscript".split(" ");
const HEADLINES: [scene: string, selector: string][] = [
  ["today-returning", ".session-today .session-mega"],
  ["paths", ".session-page .session-h1"],
  ["progress", ".session-page .session-h1"],
  ["session-recap", ".session-recap-head .session-h1"],
  ["session-ungraded-result", ".session-page .session-h1"],
];
for (const theme of ALL_THEMES) {
  test(`headlines in ${theme}: Today, Paths, Progress and the result wear the theme's heading face`, async ({ page }) => {
    test.setTimeout(120_000);
    for (const [scene, selector] of HEADLINES) {
      await openShot(page, scene, SIZE, theme);
      const got = await page.locator(selector).first().evaluate((el) => {
        const norm = (s: string) => s.replace(/["']/g, "").replace(/\s*,\s*/g, ",").trim().toLowerCase();
        const cs = getComputedStyle(el);
        return {
          face: norm(cs.fontFamily),
          heading: norm(getComputedStyle(document.documentElement).getPropertyValue("--font-heading")),
          weight: Number(cs.fontWeight),
        };
      });
      expect(got.face, `${scene} ${selector}`).toBe(got.heading);
      if (theme === "ember") {
        expect(got.face, `${scene}: Ember's headlines are Barlow Condensed`).toMatch(/^barlow condensed/);
        // A condensed face set at 500 reads thin next to its own 700 clocks.
        expect(got.weight, `${scene}: Ember's headline weight`).toBeGreaterThanOrEqual(600);
      }
      if (theme === "ivory" || theme === "manuscript") expect(got.face).toMatch(/^fraunces/);
    }
  });
}
