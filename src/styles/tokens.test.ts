/**
 * No colour that does not exist.
 *
 * A `var(--token)` naming something nothing defines resolves to NOTHING. Not
 * an error, not a console warning, not a fallback to the property's initial
 * value in any way a person would notice — the declaration is simply dropped,
 * and the element keeps whatever it inherited. So the bug looks like a
 * slightly wrong colour in one theme, or like text on a card that turns out
 * to be the page's background, and it survives review because the screenshot
 * looks plausible.
 *
 * It has been found three times in one night: `jam.css` reaching for
 * `--warning`, `--radius-md` and `--bg-elevated`, none of which exist
 * anywhere; `songs.css` asking for `--bg-base`, which the file's own header
 * warns against. Each time by somebody reading the stylesheet. This makes it
 * impossible to land a fourth.
 *
 * ## What is legal
 *
 * 1. A name in `TOKEN_CONTRACT` — every theme defines all of those, and
 *    `themes.test.ts` is what makes that true.
 * 2. A name the same file defines. A stylesheet is allowed its own private
 *    variables; what it may not do is depend on somebody else's.
 * 3. A `var()` with a fallback — `var(--danger, #e5484d)`. That is a
 *    deliberate idiom in this repo for a value a theme MAY override and a
 *    default that is used when it does not, and it cannot resolve to nothing
 *    by construction.
 *
 * Anything else is a token nobody defines, and the test says which file and
 * which line.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TOKEN_CONTRACT } from "../themes";

const ROOT = path.resolve(process.cwd(), "src");

/**
 * Where a stylesheet may live.
 *
 * `src/styles` is where nearly all of them are; `src/containers/**` is where
 * a mode's own would go if somebody put one beside its component, which is a
 * shape this repo has not used yet and which must not be a way round this
 * test the day it is.
 */
const SEARCH = [path.join(ROOT, "styles"), path.join(ROOT, "containers")];

function stylesheets(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...stylesheets(full));
    else if (entry.name.endsWith(".css")) out.push(full);
  }
  return out.sort();
}

/** Every custom property this file declares — `--x: …`, anywhere in it. */
function declaredIn(css: string): Set<string> {
  const out = new Set<string>();
  for (const match of css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) out.add(match[1]);
  return out;
}

type Use = { token: string; line: number; hasFallback: boolean };

/**
 * Every `var(…)` in a file, with the line it is on.
 *
 * The fallback is anything after the first comma inside the parentheses, so
 * `var(--a, var(--b))` counts as having one — and rightly: it cannot resolve
 * to nothing unless `--b` is also missing, and `--b` is itself a use this
 * function reports.
 */
function usesIn(css: string): Use[] {
  const out: Use[] = [];
  const re = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,)?/g;
  for (const match of css.matchAll(re)) {
    const line = css.slice(0, match.index).split("\n").length;
    out.push({ token: match[1], line, hasFallback: match[2] === "," });
  }
  return out;
}

const CONTRACT = new Set<string>(TOKEN_CONTRACT);

/** Every token one stylesheet reaches for that nothing will define. */
function missingIn(css: string, where: string): string[] {
  const declared = declaredIn(css);
  const out: string[] = [];
  for (const use of usesIn(css)) {
    if (use.hasFallback) continue;
    if (CONTRACT.has(use.token)) continue;
    if (declared.has(use.token)) continue;
    out.push(`${where}:${String(use.line)} uses ${use.token}, which nothing defines`);
  }
  return out;
}

/**
 * The detector, on stylesheets written for it.
 *
 * A sweep that finds nothing looks exactly like a sweep that cannot find
 * anything, and this test exists because three real bugs got past three
 * readings. So the thing doing the finding is checked first, on the three
 * shapes it has to tell apart.
 */
describe("the detector itself", () => {
  it("catches the bugs this was written for", () => {
    expect(missingIn(".a { color: var(--warning); }", "x.css")).toEqual([
      "x.css:1 uses --warning, which nothing defines",
    ]);
    expect(missingIn(".a { background: var(--bg-elevated); }", "x.css")).toHaveLength(1);
    expect(missingIn(".a { border-radius: var(--radius-md); }", "x.css")).toHaveLength(1);
    // The one songs.css's own header warns about, and W13 found.
    expect(missingIn(".a { background: var(--bg-base); }", "x.css")).toHaveLength(1);
  });

  it("leaves the three legal shapes alone", () => {
    // In the contract.
    expect(missingIn(".a { color: var(--text-primary); }", "x.css")).toEqual([]);
    // Defined by the same file, wherever in it.
    expect(missingIn(".a { color: var(--mine); }\n.b { --mine: red; }", "x.css")).toEqual([]);
    // Written with a fallback, which cannot resolve to nothing.
    expect(missingIn(".a { color: var(--danger, #e5484d); }", "x.css")).toEqual([]);
    expect(missingIn(".a { color: var(--danger, var(--text-primary)); }", "x.css")).toEqual([]);
  });

  it("says which line, because a stylesheet is long", () => {
    const css = "/* a\n b\n c */\n.a { color: var(--nope); }";
    expect(missingIn(css, "x.css")).toEqual(["x.css:4 uses --nope, which nothing defines"]);
  });
});

describe("every colour a stylesheet asks for exists", () => {
  const files = SEARCH.flatMap(stylesheets);

  it("finds the stylesheets at all", () => {
    // A test that scans nothing passes for ever. This is the guard on the
    // guard: if the stylesheets move, this fails before the sweep can go
    // quietly green.
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith("songs.css"))).toBe(true);
    expect(files.some((f) => f.endsWith("jam.css"))).toBe(true);
  });

  it("never reaches for a token that is neither in the contract nor its own", () => {
    const missing = files.flatMap((file) =>
      missingIn(fs.readFileSync(file, "utf8"), path.relative(ROOT, file).replace(/\\/g, "/")),
    );
    expect(missing).toEqual([]);
  });
});
