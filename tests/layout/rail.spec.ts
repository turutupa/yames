import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openShot, settleAnimations, spillingLabels } from "./fits";

/**
 * The rail's keycaps (owner, 2026-11-17): every entry shows its key at the
 * right of its row. Measured here because "the keycap sits on the label" is a
 * thing happy-dom cannot see: long names (ru, de) must give way to it, and the
 * strip of icons must not show it at all.
 */
const SCENES = ["metronome", "tools"];
const SIZES = [
  { name: "wide", width: 1400, height: 900 },
  { name: "laptop", width: 1024, height: 800 },
];
const LANGUAGES = ["en", "ru", "de"];

/** Each shown keycap, against its button and the text beside it. */
async function keycapTrouble(page: Page): Promise<{ count: number; trouble: string[] }> {
  await settleAnimations(page);
  return page.evaluate(() => {
    const trouble: string[] = [];
    const caps = [...document.querySelectorAll<HTMLElement>(".rail .rail-key")].filter(
      (el) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0,
    );
    for (const cap of caps) {
      const r = cap.getBoundingClientRect();
      const button = cap.closest("button")!;
      const b = button.getBoundingClientRect();
      const name = `${cap.dataset.testid} "${cap.textContent}"`;
      if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) {
        trouble.push(`${name} is outside its row`);
      }
      for (const text of button.querySelectorAll<HTMLElement>(
        ".rail-mode-label, .rail-mode-badge, .rail-action-label, svg",
      )) {
        const t = text.getBoundingClientRect();
        if (t.width < 1) continue;
        const overlap = Math.min(r.right, t.right) - Math.max(r.left, t.left);
        const vertical = Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top);
        if (overlap > 0.5 && vertical > 0.5) trouble.push(`${name} sits on "${(text.textContent ?? "icon").trim()}"`);
      }
    }
    return { count: caps.length, trouble };
  });
}

for (const scene of SCENES) {
  for (const size of SIZES) {
    for (const lng of LANGUAGES) {
      test(`${scene}: rail keycaps fit at ${size.width}px in ${lng}`, async ({ page }) => {
        await openShot(page, scene, size, "ember", { lng });
        const { count, trouble } = await keycapTrouble(page);
        // Today, Paths, Progress, Tools, the five tools and Settings.
        expect(count).toBe(10);
        expect(trouble).toEqual([]);
        expect(await spillingLabels(page, ".rail")).toEqual([]);
      });
    }
  }
}

test("the strip of icons shows no keycaps", async ({ page }) => {
  await openShot(page, "metronome", { width: 600, height: 800 });
  const { count } = await keycapTrouble(page);
  expect(count).toBe(0);
});
