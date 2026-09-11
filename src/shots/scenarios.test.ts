// What the pictures are of, and what the website expects them to be.
//
// Three files have to agree about the screenshots, and they live in three
// different languages: this folder says what gets taken, `docs/site.js` builds
// the carousel's filenames and declares each image's shape, and
// `docs/style.css` reserves the card's box before the image arrives. Nothing
// makes them agree — and they had silently stopped:
//
//   - the app shipped thirteen themes; site.js listed ten, so three themes had
//     no card and the shots for them would have sat unused;
//   - the homepage's own copy still said "ten themes";
//   - `docs/img/zen/` held sixty pictures of a UI two redesigns old, referenced
//     by nothing.
//
// A broken reference here is invisible until someone loads the page, and a
// mismatched aspect ratio shows up as the whole row of cards jumping as the
// images load. Both are cheap to check and neither is visible in a diff.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SHOT_THEMES, SHOTS, shotPath } from "./scenarios";
import { THEMES } from "../themes";

const ROOT = path.resolve(process.cwd());
const SITE_JS = fs.readFileSync(path.join(ROOT, "docs/site.js"), "utf8");
const STYLE_CSS = fs.readFileSync(path.join(ROOT, "docs/style.css"), "utf8");
const IMG_DIR = path.join(ROOT, "docs/img");

/** The ids in site.js's own THEMES table, in order. */
function siteThemeIds(): string[] {
  const start = SITE_JS.indexOf("const THEMES = [");
  const end = SITE_JS.indexOf("];", start);
  return [...SITE_JS.slice(start, end).matchAll(/\{ id: "([^"]+)"/g)].map((m) => m[1]);
}

/** Every `img/<section>/<name>.webp` written down anywhere the site is served from. */
function referencedImages(): { file: string; rel: string }[] {
  const out: { file: string; rel: string }[] = [];
  for (const file of ["README.md", "docs/index.html", "docs/site.js", "docs/style.css"]) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of text.matchAll(/(?:docs\/)?img\/([a-z]+)\/([a-z0-9-]+)\.webp/g)) {
      out.push({ file, rel: `${m[1]}/${m[2]}.webp` });
    }
  }
  return out;
}

describe("the screenshots the website is built on", () => {
  it("shoots every theme the app ships", () => {
    // A theme with no shot is a blank card; a shot for a theme that no longer
    // exists is a file nothing will ever ask for.
    expect([...SHOT_THEMES].sort()).toEqual(THEMES.map((t) => t.id).sort());
  });

  it("gives the carousel a card for every theme, and no card without a file", () => {
    expect(siteThemeIds().sort()).toEqual([...SHOT_THEMES].sort());
    for (const theme of siteThemeIds()) {
      const file = path.join(IMG_DIR, "metronome", `${theme}-metronome.webp`);
      expect(fs.existsSync(file), `site.js lists ${theme} but ${file} is missing`).toBe(true);
    }
  });

  it("says the same shape in all three places", () => {
    // The card reserves its box from `aspect-ratio` in the stylesheet and the
    // width/height attributes site.js sets. If either disagrees with the size
    // the shot is actually taken at, every card resizes as its image lands.
    const metronome = SHOTS.find((s) => s.id === "metronome")!;
    const ratio = metronome.width / metronome.height;

    const card = STYLE_CSS.slice(STYLE_CSS.indexOf(".fan__card img {"));
    const css = card.slice(0, card.indexOf("}")).match(/aspect-ratio:\s*(\d+)\s*\/\s*(\d+)/);
    expect(css, ".fan__card img has no aspect-ratio").not.toBeNull();
    expect(Number(css![1]) / Number(css![2])).toBeCloseTo(ratio, 3);

    const w = SITE_JS.match(/img\.width\s*=\s*(\d+)/);
    const h = SITE_JS.match(/img\.height\s*=\s*(\d+)/);
    expect(Number(w![1])).toBe(metronome.width);
    expect(Number(h![1])).toBe(metronome.height);
  });

  it("has the file behind every image the site and README point at", () => {
    const missing = referencedImages().filter(
      ({ rel }) => !fs.existsSync(path.join(IMG_DIR, rel)),
    );
    expect(missing, `referenced but not on disk: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it("keeps no picture nothing asks for", () => {
    // Sixty of these accumulated across two redesigns — zen visuals for styles
    // the app had renamed, at a window size it no longer uses.
    const referenced = new Set(referencedImages().map((r) => r.rel));
    // The carousel builds its own filenames from site.js's THEMES at runtime.
    for (const theme of siteThemeIds()) referenced.add(`metronome/${theme}-metronome.webp`);

    const onDisk: string[] = [];
    for (const section of fs.readdirSync(IMG_DIR)) {
      const dir = path.join(IMG_DIR, section);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) onDisk.push(`${section}/${f}`);
    }

    // A shot this repo takes is allowed to sit unused — the README picks a
    // handful per section on purpose. A file no shot would produce is not.
    const takeable = new Set(
      SHOTS.flatMap((shot) => SHOT_THEMES.map((theme) => shotPath(shot, theme))),
    );
    const orphans = onDisk.filter((f) => !referenced.has(f) && !takeable.has(f));
    expect(orphans, `on disk but nothing takes or uses them: ${orphans.join(", ")}`).toEqual([]);
  });
});
