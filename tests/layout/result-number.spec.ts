/*
 * The result's number and the words over it never touch (acceptance 5, P1-5
 * and P2-9): in Velvet's face the big "87%" rose into "PASSED · BAR 85%" by
 * 15 px on a phone, and on a desktop "LAST TIME" sat 2 px under "PASSED".
 *
 * A line box is not the glyph: the number is set tight (`line-height` under
 * 1), so its digits reach above its box by however tall the theme's face
 * draws them. The glyph's top is measured with the font's own metrics, in
 * all thirteen themes, at two phone widths and a desktop.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openShot, MOBILE_URL, settleAnimations } from "./fits";

const THEMES = "mono obsidian velvet neon aurora ash ember ivory arctic sand lavender prism manuscript".split(" ");

async function clashes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const why = document.querySelector(".session-decided-why");
    const value = document.querySelector<HTMLElement>(".session-moved-value");
    const before = document.querySelector<HTMLElement>(".session-moved-before");
    const last = document.querySelector<HTMLElement>(".session-moved-before small");
    if (!why || !value) return ["no result number on screen"];
    const whyBottom = why.getBoundingClientRect().bottom;
    // Where a run of digits really starts, from the face's own metrics.
    const glyphTop = (el: HTMLElement, text: string) => {
      const cs = getComputedStyle(el);
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(text);
      const box = el.getBoundingClientRect();
      // The baseline sits where the line box puts it: half-leading either side
      // of the font's ascent and descent.
      const lh = parseFloat(cs.lineHeight) || box.height;
      const content = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
      const top = box.top + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.borderTopWidth) || 0);
      const baseline = top + (lh - content) / 2 + m.fontBoundingBoxAscent;
      return baseline - m.actualBoundingBoxAscent;
    };
    const digits = (el: HTMLElement) => (el.firstChild?.textContent ?? el.textContent ?? "").replace(/[^0-9%]/g, "") || "0";
    const vTop = glyphTop(value, digits(value));
    if (vTop < whyBottom + 4) out.push(`the number's top (${vTop.toFixed(1)}) is ${(whyBottom - vTop).toFixed(1)} px into the line over it (${whyBottom.toFixed(1)})`);
    if (last) {
      const lTop = last.getBoundingClientRect().top;
      if (lTop < whyBottom + 3) out.push(`"last time" (${lTop.toFixed(1)}) is under the line over it (${whyBottom.toFixed(1)})`);
    }
    if (before) {
      const bTop = glyphTop(before, digits(before));
      const ceiling = last ? last.getBoundingClientRect().bottom : whyBottom;
      if (bTop < ceiling + 1) out.push(`the last number's top (${bTop.toFixed(1)}) runs into what is over it (${ceiling.toFixed(1)})`);
    }
    return out;
  });
}

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  for (const width of [360, 390]) {
    for (const theme of THEMES) {
      test(`the result's number clears its words in ${theme} at ${width}px`, async ({ page }) => {
        await openShot(page, "session-result", { width, height: 800 }, theme);
        await settleAnimations(page);
        expect(await clashes(page)).toEqual([]);
      });
    }
  }
});

for (const theme of THEMES) {
  test(`the result's number clears its words in ${theme} on a desktop`, async ({ page }) => {
    await openShot(page, "session-result", { width: 1400, height: 900 }, theme);
    await settleAnimations(page);
    expect(await clashes(page)).toEqual([]);
  });
}
