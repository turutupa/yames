import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll } from "./fits";

/**
 * The Session's tab strip (mvp-tabstrip), measured: it fits the window, its
 * fret numbers are big enough to read from the guitar (30 px and up at a
 * laptop's size), no two numbers on a string overlap, and while a Take runs
 * it moves by transform alone.
 */
const WIDE = { width: 1400, height: 900 };
const LAPTOP = { width: 1024, height: 700 };
const PHONE = { width: 390, height: 844 };

const SCENES = ["tabstrip-preview", "tabstrip-follow", "tabstrip-dense"] as const;

/** Every fret number's knock-out box and font size in view, the current (enlarged) one aside. */
async function numbers(page: Page) {
  return page.locator('[data-testid="tabstrip"] .tabstrip-note:not([data-current])').evaluateAll((els) => {
    const view = document.querySelector(".tabstrip-view")!.getBoundingClientRect();
    return els
      .map((el) => {
        // The knock-out box, which is what would hide a neighbour.
        const r = el.getBoundingClientRect();
        const note = el as HTMLElement;
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          string: note.dataset.string,
          px: parseFloat(getComputedStyle(el.querySelector("b")!).fontSize),
          visible: r.right > view.left && r.left < view.right,
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
      expect(shown.length, "some numbers are in view").toBeGreaterThan(1);
      if (size.width >= 1024) {
        for (const n of shown) expect(n.px, "fret numbers are 30 px or more").toBeGreaterThanOrEqual(30);
      } else {
        for (const n of shown) expect(n.px, "a phone still reads them").toBeGreaterThanOrEqual(15);
      }
      // No two numbers on one string overlap.
      const byString = new Map<string, typeof shown>();
      for (const n of shown) byString.set(n.string!, [...(byString.get(n.string!) ?? []), n]);
      for (const [string, list] of byString) {
        list.sort((a, b) => a.left - b.left);
        for (let i = 1; i < list.length; i++) {
          expect(list[i].left, `string ${string}: number ${i} overlaps the one before`).toBeGreaterThanOrEqual(
            list[i - 1].right - 1,
          );
        }
      }
      if (scene === "tabstrip-preview") {
        await expect(page.locator(".tabstrip-order").first()).toBeVisible();
      } else {
        const cursor = await page.locator(".tabstrip-cursor").boundingBox();
        const view = await page.locator(".tabstrip-view").boundingBox();
        expect(cursor!.x + cursor!.width / 2 - view!.x).toBeCloseTo(view!.width * 0.3, -1);
        await expect(page.locator(".tabstrip-note[data-current]").first()).toBeVisible();
      }
    });
  }
}

test("the strip moves by transform while a Take runs", async ({ page }) => {
  await openShot(page, "tabstrip-playing", WIDE);
  const x = () =>
    page
      .locator('[data-testid="tabstrip-strip"]')
      .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
  const frames0 = await page.evaluate(() => window.__TABSTRIP_FRAMES__ ?? 0);
  const a = await x();
  await page.waitForTimeout(400);
  const b = await x();
  expect(b).toBeLessThan(a);
  expect(await page.evaluate(() => window.__TABSTRIP_FRAMES__ ?? 0)).toBeGreaterThan(frames0 + 5);
});

test("under reduced motion the strip steps onto notes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openShot(page, "tabstrip-playing", WIDE);
  await expect(page.locator('[data-testid="tabstrip"]')).toHaveAttribute("data-reduced", "");
  // The note under the column sits exactly on it.
  const offset = await page.evaluate(() => {
    const cur = document.querySelector(".tabstrip-note[data-current]")!.getBoundingClientRect();
    const col = document.querySelector(".tabstrip-cursor")!.getBoundingClientRect();
    return cur.left + cur.width / 2 - (col.left + col.width / 2);
  });
  expect(Math.abs(offset)).toBeLessThan(2);
});
