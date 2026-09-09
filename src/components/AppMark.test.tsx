import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { AppMark } from "./AppMark";

/**
 * The titlebar's mark and the website's favicon are the same drawing, kept in
 * two files because one is JSX and the other is an asset. Nothing generates
 * either from the other, so this is what stops the copy drifting.
 *
 * It matters more than a duplicated path usually would: the mark sits one
 * strip above the window's own icon in the taskbar, and the failure mode is
 * two versions of the brand a centimetre apart. That is exactly what was
 * there before — a themed gradient square beside the ember — and it is the
 * kind of wrong that is invisible until somebody looks at a screenshot.
 */

const favicon = fs.readFileSync(
  path.resolve(process.cwd(), "docs/favicon.svg"),
  "utf8",
);

/** Every `d=""` in a chunk of SVG, whitespace flattened. */
function paths(svg: string): string[] {
  return [...svg.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
}

describe("the app mark is the ember", () => {
  it("draws the same Y as the favicon, stroke for stroke", () => {
    const { container } = render(<AppMark />);
    expect(paths(container.innerHTML)).toEqual(paths(favicon));
  });

  it("carries the same tile and the same ink", () => {
    const { container } = render(<AppMark />);
    const svg = container.innerHTML;
    // The two gradient stops and the ink, which are the brand's colours and
    // not the theme's — see the note in AppMark.
    for (const colour of ["#FFC24D", "#E8760C", "#0B0A14"]) {
      expect(favicon.toUpperCase()).toContain(colour);
      expect(svg.toUpperCase()).toContain(colour);
    }
    // Same corner radius, so it is the same tile and not a rounder one.
    expect(/\brx="15"/.test(svg)).toBe(true);
    expect(/\brx="15"/.test(favicon)).toBe(true);
  });

  it("does not follow the theme", () => {
    // The window's icon in the taskbar cannot recolour itself, so a mark that
    // did would only match the icon beside it by accident.
    const { container } = render(<AppMark />);
    expect(container.innerHTML).not.toContain("var(--");
  });

  it("is labelled, and keeps the class the titlebar positions it by", () => {
    const { container } = render(<AppMark />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-label")).toBe("Yames");
    expect(svg.classList.contains("app-mark")).toBe(true);
  });
});
