import { describe, it, expect } from "vitest";
import { THEMES, TOKEN_CONTRACT } from "./themes";

describe("theme token contract", () => {
  it("every theme defines every variable in the contract", () => {
    const missing: string[] = [];
    for (const theme of THEMES) {
      for (const token of TOKEN_CONTRACT) {
        if (!(token in theme.vars)) missing.push(`${theme.id} is missing ${token}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("no theme defines a variable outside the contract", () => {
    // Not a style rule — a drift alarm. A variable only one theme knows about
    // paints correctly in that theme and inherits the previous theme's value
    // everywhere else, which is the exact bug the contract exists to prevent.
    const contract = new Set<string>(TOKEN_CONTRACT);
    const extra: string[] = [];
    for (const theme of THEMES) {
      for (const token of Object.keys(theme.vars)) {
        if (!contract.has(token)) extra.push(`${theme.id} defines ${token}`);
      }
    }
    expect(extra).toEqual([]);
  });

  it("theme ids are unique and previews have three colours", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const theme of THEMES) {
      expect(theme.preview, theme.id).toHaveLength(3);
    }
  });

  it("both theme groups are populated", () => {
    expect(THEMES.some((t) => t.group === "dark")).toBe(true);
    expect(THEMES.some((t) => t.group === "light")).toBe(true);
  });

  it("the picker's third swatch is the theme's actual accent", () => {
    // `preview` is [bg-primary, bg-card, accent], and the third one is the
    // only swatch a reader can match against the running app. It went stale
    // the moment six accents moved for contrast, so it is pinned here: the
    // first two are representative of gradients and washes, this one is not.
    const wrong: string[] = [];
    for (const theme of THEMES) {
      const accent = theme.vars["--accent"];
      if (!isHex(accent)) continue;
      if (theme.preview[2].toLowerCase() !== accent.toLowerCase()) {
        wrong.push(`${theme.id}: preview ${theme.preview[2]} vs --accent ${accent}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

/** WCAG relative luminance for a #rrggbb colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

const HEX_IN = /#[0-9a-f]{6}\b/gi;
const RGBA_IN = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i;

/** `colour` painted at its own alpha over an opaque `base`, as a flat hex. */
function over(colour: string, base: string): string | null {
  const m = colour.match(RGBA_IN);
  if (!m || !isHex(base)) return null;
  const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
  const under = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  const ink = [1, 2, 3].map((i) => parseInt(m[i], 10));
  const mix = ink.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha)));
  return "#" + mix.map((c) => c.toString(16).padStart(2, "0")).join("");
}

/**
 * Every opaque colour a theme can end up painting text on.
 *
 * The old version of this file compared text against `--bg-primary` and
 * stopped there, which is why it passed while the owner could not read the
 * screen. Three things were missing:
 *
 *   - the other four surfaces. `--bg-card` and `--bg-raised` are much darker
 *     than the page on a light theme (Arctic's card is a mid grey), so ink
 *     tuned to clear the bar on paper falls under it on a card.
 *   - gradients. Aurora and Prism paint one, and `isHex` skipped them, so
 *     two whole themes were unmeasured. A gradient has no single luminance,
 *     but it does have stops, and text has to survive all of them.
 *   - translucent surfaces. Prism's card is `rgba(255,255,255,.6)` and
 *     Aurora's is `rgba(255,255,255,.05)`; composited over the ground they
 *     are real, opaque colours.
 */
const SURFACE_TOKENS = [
  "--bg-primary",
  "--bg-secondary",
  "--bg-panel",
  "--bg-card",
  "--bg-raised",
  "--bg-widget",
] as const;

function surfacesOf(theme: { vars: Record<string, string> }): string[] {
  const ground = (theme.vars["--bg-primary"].match(HEX_IN) ?? []).map((c) => c.toLowerCase());
  const found = new Set<string>(ground);
  for (const token of SURFACE_TOKENS) {
    const value = theme.vars[token];
    for (const stop of value.match(HEX_IN) ?? []) found.add(stop.toLowerCase());
    if (RGBA_IN.test(value)) {
      for (const base of ground) {
        const mixed = over(value, base);
        if (mixed) found.add(mixed);
      }
    }
  }
  return [...found];
}

/** The lowest contrast `ink` reaches against any surface the theme paints. */
function worstOn(ink: string, surfaces: string[]): number {
  return Math.min(...surfaces.map((s) => contrast(ink, s)));
}

/**
 * The five text levels, quietest last. Small print is still text: the ladder
 * is about which line you read first, not about which lines are optional.
 */
const TEXT_LADDER = [
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--text-muted",
  "--text-faint",
] as const;

/** Every token that is drawn as ink somewhere: `color: var(--x)` in the CSS. */
const INK = [
  ...TEXT_LADDER,
  "--accent",
  "--accent-2",
  "--feedback-perfect",
  "--feedback-good",
  "--feedback-ok",
  "--feedback-miss",
] as const;

describe("theme legibility", () => {
  /**
   * The one rule the old file was missing, and the reason the owner had to
   * report the same thing twice: "the light themes all need every text
   * element ... its contrast increased, its hard to read."
   *
   * The first pass walked `--text-tertiary` and `--text-faint` up until they
   * measured 4.5:1 against `--bg-primary` — landing every one of them on
   * 4.51–4.59, with no headroom at all — and never looked at another
   * surface. On a card the same ink read 3.3:1. `--text-muted` was not in the
   * assertion at all and was the worst of the lot: 1.35:1 on Sand, 1.48:1 on
   * Arctic, 1.82:1 on Mono. It carries timestamps and field labels; one
   * stylesheet had already worked around it in a comment rather than fix it.
   *
   * So: measure against every surface, not the friendliest one, and include
   * the accents, which 149 `color: var(--accent)` rules draw as text.
   */
  it("every ink clears 4.5:1 on every surface the theme paints", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      const surfaces = surfacesOf(theme);
      for (const token of INK) {
        const ink = theme.vars[token];
        if (!isHex(ink)) continue;
        const ratio = worstOn(ink, surfaces);
        if (ratio < 4.5) failures.push(`${theme.id} ${token}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * Clearing the bar is not the same as being a hierarchy. Before this work
   * Ivory's `--text-muted` (2.26:1) was quieter than its `--text-faint`
   * (3.26:1) — the ladder was upside down at the bottom, because only some
   * rungs had ever been measured. Each rung is now set a step above the one
   * below it, and this keeps them in order.
   */
  it("the text ladder actually descends", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      const surfaces = surfacesOf(theme);
      for (let i = 1; i < TEXT_LADDER.length; i++) {
        const above = theme.vars[TEXT_LADDER[i - 1]];
        const below = theme.vars[TEXT_LADDER[i]];
        if (!isHex(above) || !isHex(below)) continue;
        const a = worstOn(above, surfaces);
        const b = worstOn(below, surfaces);
        if (b > a + 0.001) {
          failures.push(
            `${theme.id}: ${TEXT_LADDER[i]} (${b.toFixed(2)}) is louder than ${TEXT_LADDER[i - 1]} (${a.toFixed(2)})`
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * `--accent-subtle` is a wash of the accent itself, and several controls
   * put accent ink straight on it: the +/- tempo buttons, the drill plan's
   * open token, the rail's active mode. Ink on a wash of itself is the
   * thinnest pairing in the system — Prism's was 3.69:1 — so the accents
   * carry enough headroom to survive it.
   *
   * Measured over the page-level surfaces, which is where those controls sit.
   * A tinted chip nested inside a card is a stylesheet decision, not a token
   * one, and is not this file's to enforce.
   */
  it("accent ink survives its own subtle wash", () => {
    const PAGE = ["--bg-primary", "--bg-secondary", "--bg-panel"] as const;
    const failures: string[] = [];
    for (const theme of THEMES) {
      const bases: string[] = [];
      for (const token of PAGE) {
        for (const stop of theme.vars[token].match(HEX_IN) ?? []) bases.push(stop.toLowerCase());
      }
      const pairs = [
        ["--accent", ["--accent-subtle", "--accent-subtle-hover"]],
        ["--accent-2", ["--accent-2-subtle"]],
      ] as const;
      for (const [inkToken, washTokens] of pairs) {
        const ink = theme.vars[inkToken];
        if (!isHex(ink)) continue;
        for (const washToken of washTokens) {
          for (const base of bases) {
            const wash = over(theme.vars[washToken], base);
            if (!wash) continue;
            const ratio = contrast(ink, wash);
            if (ratio < 4.5) {
              failures.push(`${theme.id} ${inkToken} on ${washToken}: ${ratio.toFixed(2)}:1`);
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * The Play button is accent-filled with `--accent-text` on top, and it is
   * the one control a player hits without looking.
   *
   * Three themes used to be listed here as known failures — velvet 4.23,
   * ivory 3.25, prism 3.34 — on the grounds that fixing them meant visibly
   * changing a shipped theme. Two of them were light themes the owner could
   * not read, so they were fixed rather than re-listed: Ivory's and Prism's
   * accents went dark enough to carry white, and Velvet kept a violet close
   * to its old one but wears its own near-black ink instead of white. There
   * is no exceptions list any more, and there should not be a new one.
   */
  it("text on an accent-filled button clears 4.5:1", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      for (const pair of [
        ["--accent", "--accent-text"],
        ["--accent-2", "--accent-2-text"],
      ] as const) {
        const bg = theme.vars[pair[0]];
        const fg = theme.vars[pair[1]];
        if (!isHex(bg) || !isHex(fg)) continue;
        const ratio = contrast(bg, fg);
        if (ratio < 4.5) failures.push(`${theme.id} ${pair[0]}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * `--beat-accent` fills the dot for an accented beat. It is not text, so
   * the bar is the 3:1 WCAG asks of a UI component — but the light themes
   * were nowhere near it, because their beat colours were pale tints picked
   * against a dark ground: Arctic's sky blue measured 1.04:1 on its own page
   * and Sand's amber 1.06:1. The downbeat was invisible on paper.
   */
  it("the accented beat is visible at 3:1", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      const beat = theme.vars["--beat-accent"];
      if (!isHex(beat)) continue;
      const ratio = worstOn(beat, surfacesOf(theme));
      if (ratio < 3) failures.push(`${theme.id}: ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  /**
   * `--border` draws the dividers and panel outlines. On paper every light
   * theme's hairline was an 8–12% ink wash measuring 1.14–1.27:1, which is
   * to say it was not there.
   *
   * The bar here is 1.9:1, not the 3:1 of WCAG 1.4.11, and deliberately: a
   * divider at 3:1 is a drawn box, and the controls that need a perceivable
   * boundary do not get it from this token — the tempo and meter buttons
   * draw their own from a `color-mix` of `--text-primary`. 1.9:1 is a rule
   * you can see on a lit screen without the UI turning into a grid. The dark
   * group sits at 1.10–1.18:1 and is left alone; raising it is a look
   * decision for all thirteen themes, not a legibility fix for six.
   */
  it("a light theme's hairlines are actually visible", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      if (theme.group !== "light") continue;
      const surfaces = surfacesOf(theme);
      let worst = Infinity;
      for (const surface of surfaces) {
        const line = over(theme.vars["--border"], surface);
        if (line) worst = Math.min(worst, contrast(line, surface));
      }
      if (worst < 1.9) failures.push(`${theme.id} --border: ${worst.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });
});
