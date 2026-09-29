// alphaTab's words, in the theme's own typeface (W36 item 5).
//
// The owner, 2026-09-21: *"I love that you change the font of the numbers to
// match the theme… can we also do that with other fonts like 'TAB' or the
// number for the bpm … it says 161 but in that weird font. not critical"*.
//
// He had found exactly where the old rule stopped. `TabStage`'s `applyTheme`
// walked `Object.keys(settings.display.resources)` and set the families on
// every `Font` it found — and in alphaTab 1.8 only FOUR fonts are still own
// fields of `RenderingResources`, the tablature numbers among them. That is
// why the numbers were the part that looked right. Everything else lives in
// `elementFonts`, a `Map<NotationElement, Font>`, which is not a `Font`, so
// the walk stepped over it and fifteen faces stayed Georgia and Arial: the
// tempo marker, the section names, the bar numbers, the fingerings, the chord
// names, the tuning legend.
//
// So the question this asks is the owner's own: is the tempo drawn in the
// same face as the fret numbers? Comparing the two rather than naming a font
// is what makes it true in all thirteen themes without a table of faces here.
//
// What it does NOT ask about is "TAB" at the head of the staff. That is
// `MusicFontSymbol.SixStringTabClef` — a Bravura glyph, the tab staff's own
// clef, drawn the way a G clef is — and so is the quarter note in "♩ = 96".
// They are notation, not text.
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { openShot } from "./fits";

const OUT = path.resolve(process.cwd(), ".w36-shots");

/**
 * The three the brief names: the app's own, the serif one, and the
 * monospaced one — three different kinds of stack, and Ivory's is the family
 * of stack that once left the whole tab blank.
 */
const THEMES = ["ember", "ivory", "obsidian"];

test.slow();

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

test.describe("the words on the page are the theme's", () => {
  for (const theme of THEMES) {
    test(`draws the tempo and the section names in ${theme}'s face`, async ({ page }) => {
      await openShot(page, "songs", { width: 2000, height: 1124 }, theme, { song: "long" });

      const faces = await page.evaluate(() => {
        const host = document.querySelector(".songs-tab-host");
        if (!host) return null;
        const texts = [...host.querySelectorAll("text")];
        const faceOf = (node: Element) => {
          const family = getComputedStyle(node).fontFamily;
          // alphaTab writes the family into an inline `font:` shorthand, so
          // the computed value is what is actually drawn.
          return family.trim();
        };
        const find = (match: (s: string) => boolean) => {
          const node = texts.find((t) => match((t.textContent ?? "").trim()));
          return node ? { text: (node.textContent ?? "").trim(), face: faceOf(node) } : null;
        };
        return {
          // A fret number on the tab staff: the face the owner already
          // liked, and the one everything else is held against.
          number: find((s) => /^\d{1,2}$/.test(s)),
          tempo: find((s) => s.startsWith("= ")),
          section: find((s) => s === "Verse" || s === "Chorus" || s === "Bridge"),
          themeFace: getComputedStyle(document.body).fontFamily.trim(),
          drawn: texts.length,
        };
      });

      expect(faces, "no tab host").not.toBeNull();
      expect(faces!.drawn, "nothing was engraved at all").toBeGreaterThan(20);
      expect(faces!.number, "no fret number on the page").not.toBeNull();
      expect(faces!.tempo, "the tempo mark is not drawn").not.toBeNull();
      expect(faces!.section, "no section name is drawn").not.toBeNull();

      // eslint-disable-next-line no-console
      console.log(
        `[w36] ${theme}: the page is "${faces!.themeFace}"; a fret number is drawn in "${
          faces!.number!.face
        }", "${faces!.tempo!.text}" in "${faces!.tempo!.face}", "${faces!.section!.text}" in "${
          faces!.section!.face
        }"`,
      );

      expect(
        faces!.tempo!.face,
        `the tempo is drawn in "${faces!.tempo!.face}" and the fret numbers in "${
          faces!.number!.face
        }" — the owner's "that weird font"`,
      ).toBe(faces!.number!.face);
      expect(
        faces!.section!.face,
        `the section name is drawn in "${faces!.section!.face}", not the face the numbers use`,
      ).toBe(faces!.number!.face);

      // And it is not alphaTab's own default, which is what "that weird
      // font" was: a serif nothing in this app uses.
      expect(faces!.tempo!.face.toLowerCase()).not.toBe("georgia, serif");
      expect(faces!.tempo!.face.toLowerCase()).not.toBe("arial, sans-serif");

      await page.screenshot({
        path: path.join(OUT, `type-${theme}-2000x1124.png`),
        clip: { x: 0, y: 0, width: 1200, height: 560 },
      });
    });
  }

  /**
   * The faces are in the browser BEFORE the first engrave.
   *
   * alphaTab measures every piece of text it draws and lays the page out from
   * the answer, so a face that arrives after the engraving leaves the spacing
   * of a font that is no longer on the page. Asked as the consequence: the
   * engraving is the same width before and after `document.fonts.ready`.
   */
  test("engraves at the theme's own widths, not the fallback's", async ({ page }) => {
    await openShot(page, "songs", { width: 2000, height: 1124 }, "ember", { song: "long" });
    const before = await page.evaluate(() => {
      const node = [...document.querySelectorAll(".songs-tab-host text")].find((t) =>
        (t.textContent ?? "").trim().startsWith("= "),
      );
      return node ? node.getBoundingClientRect().width : -1;
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const node = [...document.querySelectorAll(".songs-tab-host text")].find((t) =>
        (t.textContent ?? "").trim().startsWith("= "),
      );
      return node ? node.getBoundingClientRect().width : -1;
    });
    // eslint-disable-next-line no-console
    console.log(
      `[w36] the tempo mark was ${String(Math.round(before))}px wide when it was drawn and ${String(
        Math.round(after),
      )}px once every face had landed`,
    );
    expect(before, "the tempo mark was never drawn").toBeGreaterThan(0);
    expect(
      Math.abs(after - before),
      `the tempo mark was ${String(Math.round(before))}px wide when it was engraved and ${String(
        Math.round(after),
      )}px after the faces arrived — the page was laid out in the fallback`,
    ).toBeLessThanOrEqual(1);
  });
});
