import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TOKEN_CONTRACT } from "../../themes";

/**
 * The wizard wears the current theme (owner, 2026-11-18: "everything should
 * follow the current set theme").
 *
 * It used to pin every theme token on the overlay to its own warm-dark
 * palette and its own faces, so Neon, Ivory or Mono showed only in W2's
 * swatches and the window behind. Now the overlay defines only its local
 * `--l-*` names, each read from a theme token (with the old value as a
 * fallback, the way `session.css` does it), and sets no theme token at all:
 * one set on the overlay would shadow what `applyTheme` writes on `:root`,
 * and W2's live preview would stop restyling the wizard.
 */
const css = fs.readFileSync(path.join(process.cwd(), "src/styles/onboarding.css"), "utf8");
const learning = fs.readFileSync(path.join(process.cwd(), "src/styles/onboarding-learning.css"), "utf8");

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

  it.each([...TOKEN_CONTRACT])("leaves %s to the theme", (token) => {
    expect(block).not.toMatch(new RegExp(`(^|\\s)${token}\\s*:`));
  });

  it("does not pin the colour scheme: the theme's group sets it on :root", () => {
    expect(block).not.toMatch(/color-scheme\s*:/);
  });

  it("reads every local colour and face from a theme token", () => {
    const locals = [...block.matchAll(/(--l-[a-z0-9-]+)\s*:\s*([^;]+);/g)];
    expect(locals.length).toBeGreaterThan(8);
    for (const [, name, value] of locals) {
      expect(value, `${name} is a fixed value`).toMatch(/var\(--/);
    }
  });

  it("names no font family outside a token's fallback", () => {
    for (const sheet of [css, learning]) {
      const fixed = [...sheet.matchAll(/font(?:-family)?\s*:\s*([^;]+);/g)]
        .map((m) => m[1])
        .filter((v) => /[A-Za-z"']/.test(v) && !/var\(--|inherit/.test(v));
      expect(fixed).toEqual([]);
    }
  });
});
