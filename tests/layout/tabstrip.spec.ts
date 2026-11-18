import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll } from "./fits";

/**
 * The Session's tab strip, measured against the approved mock: it fits the
 * window, its fret numbers are big enough to read from the guitar (30 px and
 * up at a laptop's size), neighbouring numbers keep about twice a number's
 * width apart (never touching), the amber column sits on the current note,
 * and while a Take runs the column goes from note to note.
 */
const WIDE = { width: 1400, height: 900 };
const LAPTOP = { width: 1024, height: 700 };
const PHONE = { width: 390, height: 844 };

const SCENES = ["tabstrip-preview", "tabstrip-follow", "tabstrip-dense", "tabstrip-paused"] as const;

/** Every fret number's glyph box and font size in view, the current (enlarged) one aside. */
async function numbers(page: Page) {
  return page.locator('[data-testid="tabstrip"] .tabstrip-note:not([data-current]) text').evaluateAll((els) => {
    const view = document.querySelector(".tabstrip-view")!.getBoundingClientRect();
    return els
      .map((el) => {
        const r = el.getBoundingClientRect();
        const note = el.parentElement as unknown as SVGGElement;
        const seg = note.closest(".tabstrip-seg") as SVGSVGElement;
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          row: Math.round(seg.getBoundingClientRect().top),
          px: parseFloat(getComputedStyle(el).fontSize),
          visible: r.right > view.left && r.left < view.right && r.width > 0,
        };
      })
      .filter((n) => n.visible);
  });
}

for (const scene of SCENES) {
  for (const size of [WIDE, LAPTOP, PHONE]) {
    test(`${scene} fits at ${size.width}x${size.height}`, async ({ page }) => {
      await openShot(page, scene, size);
      await noSidewaysScroll(page, `${scene} at ${size.width}px`);
      const box = await page.locator('[data-testid="tabstrip"]').boundingBox();
      expect(box, "the strip is on the screen").not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 0.5);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);

      const shown = await numbers(page);
      expect(shown.length, "some numbers are in view").toBeGreaterThan(size.width < 500 ? 0 : 1);
      const follow = scene === "tabstrip-follow" || scene === "tabstrip-dense";
      if (follow && size.width >= 1024) {
        for (const n of shown) expect(n.px, "fret numbers are 30 px or more").toBeGreaterThanOrEqual(30);
      } else {
        for (const n of shown) expect(n.px, "still readable").toBeGreaterThanOrEqual(14);
      }
      // Neighbours on a row (whatever their string) never touch: a number's
      // width of air between them at the least.
      const byRow = new Map<number, typeof shown>();
      for (const n of shown) byRow.set(n.row, [...(byRow.get(n.row) ?? []), n]);
      for (const [row, list] of byRow) {
        const xs = [...new Set(list.map((n) => Math.round((n.left + n.right) / 2)))].sort((a, b) => a - b);
        const widest = Math.max(...list.map((n) => n.right - n.left));
        for (let i = 1; i < xs.length; i++) {
          expect(xs[i] - xs[i - 1], `row ${row}: notes ${i - 1} and ${i} crowd`).toBeGreaterThanOrEqual(widest * 1.4);
        }
      }
      if (follow) {
        // The column eases onto its note (110 ms) after the window narrows.
        await page.waitForTimeout(300);
        const cur = await page.locator(".tabstrip-note[data-current] text").first().boundingBox();
        const col = await page.locator(".tabstrip-cursor").boundingBox();
        expect(cur && col, "a current note and the column").toBeTruthy();
        expect(Math.abs(cur!.x + cur!.width / 2 - (col!.x + col!.width / 2))).toBeLessThan(5);
        await expect(page.locator('.tabstrip-seg[data-rel="now"] .tabstrip-label')).toContainText("now");
        await expect(page.locator('.tabstrip-seg[data-rel="next"] .tabstrip-label')).toContainText("next");
      } else if (scene === "tabstrip-paused") {
        await expect(page.locator('.tabstrip-seg[data-rel="mark"] .tabstrip-label')).toContainText("paused here");
      } else {
        expect(await page.locator(".tabstrip-cursor").count()).toBe(0);
      }
    });
  }
}

test("the column goes from note to note while a Take runs", async ({ page }) => {
  await openShot(page, "tabstrip-playing", WIDE);
  const at = () =>
    page.locator(".tabstrip-cursor").evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
  const frames0 = await page.evaluate(() => window.__TABSTRIP_FRAMES__ ?? 0);
  const a = await at();
  await page.waitForTimeout(1200);
  const b = await at();
  expect(b).not.toBe(a);
  expect(await page.evaluate(() => window.__TABSTRIP_FRAMES__ ?? 0)).toBeGreaterThan(frames0 + 5);
});
