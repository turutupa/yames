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

describe("theme legibility", () => {
  it("body text clears 4.5:1 against the window background", () => {
    // Only themes whose background is a flat colour can be checked this way —
    // Aurora and Prism paint gradients, and a gradient has no one luminance.
    const failures: string[] = [];
    for (const theme of THEMES) {
      const bg = theme.vars["--bg-primary"];
      const fg = theme.vars["--text-primary"];
      if (!isHex(bg) || !isHex(fg)) continue;
      const ratio = contrast(bg, fg);
      if (ratio < 4.5) failures.push(`${theme.id}: ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  it("secondary text stays readable, at the large-text bar of 3:1", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      const bg = theme.vars["--bg-primary"];
      const fg = theme.vars["--text-secondary"];
      if (!isHex(bg) || !isHex(fg)) continue;
      const ratio = contrast(bg, fg);
      if (ratio < 3) failures.push(`${theme.id}: ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  it("text on an accent-filled button clears 4.5:1", () => {
    // The Play button is accent-filled with --accent-text on top, and it is
    // the one control a player hits without looking.
    //
    // Three shipped themes do not clear the bar and predate this work. They
    // are listed rather than waved through: the assertion still fails if one
    // gets worse or a fourth appears. Fixing them means changing either a
    // theme's accent or the ink on it — a visible change to a shipped theme,
    // and the owner's call:
    //   velvet  #8b5cf6 + white  4.23:1  needs a slightly darker violet
    //   ivory   #b8860b + white  3.25:1  reads far better with dark ink on gold
    //   prism   #ff3d8a + white  3.34:1  same — dark ink on the pink clears 5:1
    const KNOWN = [
      "velvet --accent: 4.23:1",
      "ivory --accent: 3.25:1",
      "prism --accent: 3.34:1",
    ];
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
    expect(failures).toEqual(KNOWN);
  });

  /**
   * The quiet text has to be readable, not merely present.
   *
   * `--text-tertiary` and `--text-faint` carry the section labels (TEMPO,
   * METER, SUBDIVISION), the ruler's numbers and eras, and most of the small
   * print. They were set by eye and measured 1.65:1 to 4.40:1 against their
   * own background — under the 4.5:1 body text needs and, at the bottom of
   * that range, under the 3:1 asked of anything at all. The owner's report was
   * blunter: on the light themes you could not see a thing.
   *
   * Every one of them was walked towards its own theme's `--text-primary`
   * until it cleared the bar, so the hues survived and only the contrast
   * moved. This keeps them there.
   */
  it("keeps the quiet text readable in every theme", () => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      const bg = theme.vars["--bg-primary"];
      if (!isHex(bg)) continue;
      for (const key of ["--text-secondary", "--text-tertiary", "--text-faint"] as const) {
        const fg = theme.vars[key];
        if (!isHex(fg)) continue;
        const ratio = contrast(bg, fg);
        if (ratio < 4.5) failures.push(`${theme.id} ${key}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });
});
