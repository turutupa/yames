/**
 * The "Test inputs" button had `width: 64px` with `white-space: nowrap`
 * and `text-transform: uppercase`. "TEST INPUTS" is roughly 95px at that
 * size, so the label overflowed its own border and background — visible
 * as text spilling out of the button.
 *
 * A stylesheet guard rather than a rendered assertion because vitest runs
 * with `css: false` and happy-dom does no layout, so neither the computed
 * width nor the overflow is observable in a component test. This is the
 * same shape as the guard in `CoachDownloadStatus.test.tsx`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("input-test-btn sizing", () => {
  // Comments stripped so these assert rules, not the prose explaining them
  // (the fix's own comment names the declaration it removed).
  const css = fs
    .readFileSync(path.join(process.cwd(), "src/styles/main-window.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const block = css.slice(
    css.indexOf(".input-test-btn {"),
    css.indexOf("}", css.indexOf(".input-test-btn {")),
  );

  it("has a rule to guard", () => {
    expect(block).toContain("min-width");
  });

  it("never pins a fixed width — no label in 15 locales is guaranteed to fit one", () => {
    expect(block).not.toMatch(/(^|[;{\s])width\s*:/);
  });

  it("still refuses to wrap, so min-width is what keeps the label on one line", () => {
    expect(block).toContain("white-space: nowrap");
  });
});
