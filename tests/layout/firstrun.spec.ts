import { test, expect } from "@playwright/test";
import { openShot, noSidewaysScroll, insideViewport } from "./fits";

/**
 * The first run, measured (MVP, 2026-11-16).
 *
 * Each scene is reached by pressing what a new player presses (`shots/main.tsx`):
 * Set me up, an instrument, Next, then the input step with the mocked
 * interface heard, or silent, or with no device at all. A scene that reaches
 * `__SHOT_READY__` has proved those steps still lead to it. On top of that the
 * wizard's card must fit the window, and the control a player needs next must
 * be inside it, at the widest and narrowest sizes the app is held to.
 */
const SCENES: Record<string, string> = {
  "firstrun-welcome": ".onboarding-welcome-actions .onboarding-btn-primary",
  "firstrun-input": ".onboarding-footer .onboarding-btn-primary",
  "firstrun-input-silent": '[data-testid="audio-input-skip"]',
  "firstrun-input-none": '[data-testid="audio-input-skip"]',
  "firstrun-ready": ".onboarding-ready-actions .onboarding-btn-primary",
};

const SIZES = [
  { name: "wide", width: 1400, height: 900 },
  { name: "narrow", width: 620, height: 780 },
];

for (const [scene, next] of Object.entries(SCENES)) {
  for (const size of SIZES) {
    test(`${scene} fits at ${size.name} (${size.width}px)`, async ({ page }) => {
      await openShot(page, scene, size);
      await noSidewaysScroll(page, `${scene} at ${size.width}px`);
      await insideViewport(page, ".onboarding-card", `${scene} at ${size.width}px`, size);
      // The thing to press next may sit below the fold of the card's own
      // scroller; it must be reachable, and then inside the window.
      await page.locator(next).scrollIntoViewIfNeeded();
      await expect(page.locator(next)).toBeVisible();
      await insideViewport(page, next, `${scene} at ${size.width}px`, size);
    });
  }
}

test("the input step says the guitar is heard, with Next open", async ({ page }) => {
  await openShot(page, "firstrun-input", { width: 1400, height: 900 });
  await expect(page.locator(".onboarding-input-gate.proven")).toBeVisible();
  await expect(page.locator(".onboarding-footer .onboarding-btn-primary")).toBeEnabled();
});

/**
 * The wizard keeps its own look whatever the theme (owner, 2026-11-17).
 *
 * With Ivory chosen on W2 the click-sound cards turned into beige blocks under
 * the wizard's light amber ink, while the card around them stayed dark: the
 * overlay re-pointed only some of the theme's tokens, and `--bg-card` came
 * through from the root. The wizard now sets every token itself; the theme
 * shows in W2's swatches and on the window behind.
 */
type Rgba = [number, number, number, number];

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every unselected sound card's background, ink and icon, as RGBA. */
async function soundCards(page: import("@playwright/test").Page) {
  // Off the cards, so none is in its hover state, and past the 120 ms
  // background transition, so none is measured half-way.
  await page.mouse.move(5, 5);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const rgba = (s: string): [number, number, number, number] => {
      const m = s.match(/[\d.]+/g)!.map(Number);
      return [m[0], m[1], m[2], m[3] ?? 1];
    };
    return [...document.querySelectorAll<HTMLElement>(".onboarding-sound-card:not(.selected)")].map((card) => ({
      bg: rgba(getComputedStyle(card).backgroundColor),
      ink: rgba(getComputedStyle(card.querySelector(".onboarding-sound-name")!).color),
      icon: rgba(getComputedStyle(card.querySelector(".onboarding-sound-icon")!).color),
    }));
  });
}

test("W2's sound cards stay dark and readable with Ivory picked", async ({ page }) => {
  await openShot(page, "firstrun-sound-look", { width: 1400, height: 900 }, "obsidian");
  const before = await soundCards(page);
  const ivory = page.locator(".onboarding-theme-card").nth(2);
  await ivory.hover();
  await ivory.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ivory");
  const after = await soundCards(page);
  expect(after.length).toBeGreaterThan(0);
  for (const [i, card] of after.entries()) {
    expect(card.bg, `sound card ${i} changed colour with the theme`).toEqual(before[i].bg);
    expect(contrast(card.ink, card.bg), `sound card ${i} label contrast`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(card.icon, card.bg), `sound card ${i} icon contrast`).toBeGreaterThanOrEqual(3);
  }
});

for (const theme of ["ivory", "arctic", "sand", "lavender", "prism", "manuscript"]) {
  test(`the wizard's cards ignore the ${theme} theme`, async ({ page }) => {
    await openShot(page, "firstrun-hands-free", { width: 1400, height: 900 }, theme);
    const bgs = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".onboarding-hf-card")].map(
        (el) => getComputedStyle(el).backgroundColor,
      ),
    );
    await openShot(page, "firstrun-hands-free", { width: 1400, height: 900 }, "obsidian");
    const dark = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".onboarding-hf-card")].map(
        (el) => getComputedStyle(el).backgroundColor,
      ),
    );
    expect(bgs.length).toBeGreaterThan(0);
    expect(bgs).toEqual(dark);
  });
}
