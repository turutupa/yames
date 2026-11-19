import { describe, expect, it } from "vitest";
import { applyTheme, getThemeById, THEMES } from "../themes";
import { hue, luminance, mix, neckPalette, noteLook, paletteFrom, readNeckPalette, solid, subscribeNeckPalette } from "./neckTheme";

const paletteOf = (id: string) => {
  const t = getThemeById(id);
  return paletteFrom((n) => t.vars[n] ?? "", t.group === "light");
};
const hueGap = (a: string, b: string) => {
  const x = hue(a);
  const y = hue(b);
  if (x === null || y === null) return 360;
  const d = Math.abs(x - y);
  return Math.min(d, 360 - d);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("colour arithmetic", () => {
  it("flattens gradients and translucent colours", () => {
    expect(solid("#abc")).toBe("#aabbcc");
    expect(solid("linear-gradient(90deg, #000000 0%, #ffffff 100%)")).toBe("#808080");
    expect(solid("rgba(255, 255, 255, 0.5)", "#000000")).toBe("#808080");
    expect(mix("#000000", "#ffffff", 0.25)).toBe("#404040");
  });
});

describe("the neck palette, every theme", () => {
  it.each(THEMES.map((t) => t.id))("%s: every part is an opaque colour", (id) => {
    const p = paletteOf(id);
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === "string" && k !== "numFont") expect(v, k).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(p.dark).toBe(getThemeById(id).group === "dark");
    // The shadow is a dark-theme thing.
    expect(p.shadowA > 0).toBe(p.dark);
  });

  // The designer's check: a played note must never be mistaken for NOW. Measured
  // on hue, with a grey accent (Mono) passing by having none.
  it.each(THEMES.map((t) => t.id))("%s: the accent's hue is at least 30° from hit and from miss", (id) => {
    const p = paletteOf(id);
    expect(hueGap(p.accent, p.hit), `hit ${p.hit} vs accent ${p.accent}`).toBeGreaterThanOrEqual(30);
    expect(hueGap(p.accent, p.miss), `miss ${p.miss} vs accent ${p.accent}`).toBeGreaterThanOrEqual(30);
    expect(hueGap(p.hit, p.miss)).toBeGreaterThanOrEqual(60);
  });

  it.each(THEMES.map((t) => t.id))("%s: miss is a red and hit a green", (id) => {
    const p = paletteOf(id);
    const m = hue(p.miss)!;
    const h = hue(p.hit)!;
    expect(m >= 330 || m <= 15, `miss ${p.miss} at ${m}`).toBe(true);
    expect(h >= 100 && h <= 175, `hit ${p.hit} at ${h}`).toBe(true);
  });

  it.each(THEMES.map((t) => t.id))("%s: the notes stand out from the board and their numerals read", (id) => {
    const p = paletteOf(id);
    for (const kind of ["now", "aim", "tone", "clash"] as const) {
      const look = noteLook(kind, p);
      expect(contrast(look.fill, look.ink), `${kind} ink`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(p.board, p.accent), "accent on board").toBeGreaterThanOrEqual(2.2);
    expect(contrast(p.board, p.num), "fret number on page").toBeGreaterThanOrEqual(3);
  });
});

describe("the neck reads, every theme (WCAG, owner 2026-11-18)", () => {
  // Numerals on a dot are text: 4.5:1 against the dot's fill. Rings, notes,
  // strings and frets are marks: 3:1 against the board. Fret numbers are text
  // on the page.
  it.each(THEMES.map((t) => t.id))("%s: every finger digit clears 4.5:1 on its dot", (id) => {
    const p = paletteOf(id);
    for (const kind of ["now", "next", "aim", "tone", "tens", "clash", "box", "dim"] as const) {
      const look = noteLook(kind, p);
      expect(contrast(look.fill, look.ink), `${kind}: ${look.ink} on ${look.fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it.each(THEMES.map((t) => t.id))("%s: every mark clears 3:1 on the board", (id) => {
    const p = paletteOf(id);
    const marks = { accent: p.accent, hit: p.hit, miss: p.miss, ghost: p.ghost, dim: p.dim, string: p.string, wound: p.wound, fret: p.fret };
    for (const [name, c] of Object.entries(marks)) {
      expect(contrast(c, p.board), `${name} ${c} on board ${p.board}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(p.num, p.bg), "marker fret numbers").toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.numFaint, p.bg), "the other fret numbers").toBeGreaterThanOrEqual(4.5);
  });
});

describe("live: the palette follows the theme", () => {
  it("reads the root and notices a theme change", () => {
    applyTheme(getThemeById("ember"));
    let calls = 0;
    const off = subscribeNeckPalette(() => (calls += 1));
    expect(neckPalette().accent).toBe("#ff7a3c");
    applyTheme(getThemeById("ivory"));
    return new Promise<void>((done) =>
      setTimeout(() => {
        expect(calls).toBeGreaterThan(0);
        expect(neckPalette().dark).toBe(false);
        expect(neckPalette().accent).toBe(getThemeById("ivory").vars["--accent"]);
        off();
        done();
      }, 0),
    );
  });

  it("an override a theme leaves out does not leak from the previous theme", () => {
    applyTheme(getThemeById("neon")); // sets --neck-hit
    expect(document.documentElement.style.getPropertyValue("--neck-hit")).not.toBe("");
    applyTheme(getThemeById("ember")); // does not
    expect(document.documentElement.style.getPropertyValue("--neck-hit")).toBe("");
    expect(readNeckPalette().hit).toBe(getThemeById("ember").vars["--feedback-perfect"]);
  });
});
