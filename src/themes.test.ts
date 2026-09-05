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
