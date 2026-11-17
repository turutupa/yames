import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TOKEN_CONTRACT } from "../../themes";

/**
 * The wizard wears its own palette, whatever theme is chosen.
 *
 * The bug this guards (owner, 2026-11-17): the overlay re-pointed only some
 * theme tokens, so `--bg-card` still came from `:root`, where `applyTheme`
 * writes the chosen theme. With Ivory chosen the click-sound cards on W2
 * turned beige under the wizard's light amber ink, and nothing else did.
 * Every token in the theme contract must be set on the overlay itself, so no
 * part of the wizard can inherit the theme behind it.
 */
const css = fs.readFileSync(
  path.join(process.cwd(), "src/styles/onboarding.css"),
  "utf8",
);

/** The `.onboarding-overlay { ... }` block that defines the wizard's palette. */
function paletteBlock(): string {
  const re = /(^|\n)\.onboarding-overlay\s*\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    if (m[2].includes("--l-ink")) return m[2];
  }
  throw new Error("no .onboarding-overlay block defines the wizard palette");
}

describe("the first-run wizard's palette", () => {
  const block = paletteBlock();

  it.each([...TOKEN_CONTRACT])("sets %s on the overlay", (token) => {
    expect(block).toMatch(new RegExp(`(^|\\s)${token}\\s*:`));
  });

  it("is a dark surface for form controls and scrollbars too", () => {
    expect(block).toMatch(/color-scheme:\s*dark/);
  });
});
