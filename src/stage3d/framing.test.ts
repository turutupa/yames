import { describe, expect, it } from "vitest";
import { FLAT_TILT, framingFor, isPortrait } from "./framing";

const WIDE = { width: 1200, height: 400 };
const TALL = { width: 380, height: 700 };

describe("framingFor", () => {
  it("keeps the whole-neck shot as it was", () => {
    expect(framingFor({ kind: "whole" }, WIDE)).toEqual({ dir: [0, 1, 0.26], fov: 14, numScale: 1.55, pool: 1.1 });
    expect(framingFor({ kind: "whole" }, TALL)).toEqual({ dir: [0, 1, 0.26], fov: 14, numScale: 2.4, pool: 0.55 });
  });

  it("keeps the practice zoom's three-quarter angle when not flat", () => {
    expect(framingFor({ kind: "zoom", from: 3, to: 9 }, WIDE)).toEqual({ dir: [0, 1, 0.34], fov: 22, numScale: 0.66, pool: 0.9 });
    expect(framingFor({ kind: "zoom", from: 3, to: 9 }, TALL).dir).toEqual([0.95, 1, 0]);
    expect(framingFor({ kind: "zoom", from: 3, to: 9, flat: false }, WIDE).fov).toBe(22);
  });

  it("looks almost straight down for a flat zoom, high e on top, in any slot", () => {
    for (const rect of [WIDE, TALL]) {
      const f = framingFor({ kind: "zoom", from: 3, to: 9, flat: true }, rect);
      // No sideways component: the neck runs left to right like the runway under it.
      expect(f.dir[0]).toBe(0);
      // Tilted towards +z (the low-E side), so -z (string 1, high e) is the top of the picture.
      expect(f.dir[2]).toBeGreaterThan(0);
      expect(f.dir[2]).toBe(FLAT_TILT);
      expect(Math.atan2(f.dir[2], f.dir[1])).toBeLessThan(0.1);
      // A narrower lens than the hero zoom: less perspective, strings evenly spaced.
      expect(f.fov).toBeLessThan(22);
    }
  });

  it("calls a slot portrait the way the engine always has", () => {
    expect(isPortrait(TALL)).toBe(true);
    expect(isPortrait(WIDE)).toBe(false);
    expect(isPortrait({ width: 100, height: 108 })).toBe(false);
  });
});
