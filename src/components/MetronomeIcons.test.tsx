import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SubdivisionIcon } from "./MetronomeIcons";
import type { Subdivision } from "../types";

const ALL: Subdivision[] = [1, 2, 3, 4, 5, 6];

function svgFor(sub: Subdivision): string {
  const { container } = render(<SubdivisionIcon sub={sub} />);
  return container.innerHTML;
}

afterEach(cleanup);

describe("SubdivisionIcon", () => {
  it("draws a different glyph for every subdivision", () => {
    // Quintuplet used to be byte-identical to Eighth, and Sextuplet to 16th —
    // two pairs of controls that looked the same and did different things.
    const drawn = ALL.map(svgFor);
    expect(new Set(drawn).size).toBe(ALL.length);
  });

  it("draws one notehead per note in the group", () => {
    for (const sub of ALL) {
      const heads = svgFor(sub).match(/<ellipse/g)?.length ?? 0;
      expect(heads, `subdivision ${sub}`).toBe(sub);
    }
  });

  it("marks the tuplets with their number, and only the tuplets", () => {
    // 3, 5 and 6 do not divide the beat in two, so notation names them.
    for (const sub of ALL) {
      const svg = svgFor(sub);
      const hasNumeral = svg.includes(`>${sub}</text>`);
      expect(hasNumeral, `subdivision ${sub}`).toBe(sub === 3 || sub === 5 || sub === 6);
    }
  });

  it("keeps every glyph inside its viewBox", () => {
    for (const sub of ALL) {
      const svg = svgFor(sub);
      const box = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
      expect(box, `subdivision ${sub}`).not.toBeNull();
      const [w, h] = [parseFloat(box![1]), parseFloat(box![2])];
      for (const m of svg.matchAll(/<rect x="([\d.]+)"[^>]*width="([\d.]+)"/g)) {
        expect(parseFloat(m[1]) + parseFloat(m[2]), `subdivision ${sub} overflows`).toBeLessThanOrEqual(w);
      }
      for (const m of svg.matchAll(/<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g)) {
        expect(parseFloat(m[2]) + parseFloat(m[4]), `subdivision ${sub} clipped`).toBeLessThanOrEqual(h);
      }
    }
  });
});
