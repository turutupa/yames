import fs from "node:fs";
import path from "node:path";

const STYLES = path.resolve(process.cwd(), "src/styles");

/**
 * Read a stylesheet with its `@import`s inlined, in order.
 *
 * `main-window.css` is a manifest since the A3 split, so a test that reads it
 * directly finds six import statements and nothing else. Resolving the imports
 * here keeps those tests reading what the browser reads — and keeps them
 * working through the next split, which is the point.
 *
 * Comments are stripped: these tests assert rules, not the prose explaining
 * them, and more than one of them looks for a class name that also appears in
 * a comment about its removal.
 *
 * Line endings are normalised to LF. The callers assert on fragments that
 * carry their own newline and indentation, and the repository has no
 * `.gitattributes`, so a clone made with Git for Windows' default
 * `core.autocrlf=true` checks these files out as CRLF and every one of those
 * assertions fails. The tests are about which rules exist, not about how a
 * working copy happens to store newlines.
 */
export function readStylesheet(file = "main-window.css"): string {
  const seen = new Set<string>();

  function read(name: string): string {
    const full = path.join(STYLES, name);
    if (seen.has(full)) return ""; // a cycle would otherwise hang the suite
    seen.add(full);
    return fs
      .readFileSync(full, "utf8")
      .replace(/@import\s+["']\.\/([^"']+)["'];?/g, (_, imported: string) => read(imported));
  }

  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\r\n/g, "\n");
}

/** The declarations of the first rule whose selector block starts with `selector`. */
export function ruleBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return "";
  return css.slice(start, css.indexOf("}", start));
}
