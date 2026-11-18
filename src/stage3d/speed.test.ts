import { describe, expect, it } from "vitest";
import { frameBudgetMs, judgeProbe } from "./speed";

/** Frame times measured on the DGX Spark, 2026-11-16 (see speed.ts). */
const SWIFTSHADER = {
  small: { px: 620 * 780, t: [2782, 53.5, 60.8, 56.8, 91.5] },
  wide: { px: 1400 * 900, t: [2588, 144.6, 156.4, 128.9, 363] },
  hidpi: { px: 2240 * 1440, t: [3110, 283.4, 332.5, 603.3, 403.4] },
};
/** The flat neck (art direction A), 2026-11-17: SwiftShader draws it about ten times faster. */
const SWIFTSHADER_FLAT = {
  small: { px: 620 * 780, t: [40, 7.7, 7.8, 7.9, 8.8] },
  wide: { px: 1400 * 900, t: [60, 16.1, 16.7, 17.4, 18.5] },
  hidpi: { px: 2240 * 1440, t: [90, 30.7, 31.6, 37.8, 39.1] },
};
const GB10_FLAT = {
  small: { px: 620 * 780, t: [5, 1.5, 2.3, 2.4, 1.8] },
  wide: { px: 1400 * 900, t: [5, 1.3, 1.6, 2.2, 1.5] },
  hidpi: { px: 2240 * 1440, t: [6, 1.5, 2.8, 2.0, 1.8] },
};
const GB10 = {
  small: { px: 620 * 780, t: [4.6, 1.9, 2.5, 2, 2] },
  wide: { px: 1400 * 900, t: [4.5, 2.4, 3.1, 3.8, 2.8] },
  hidpi: { px: 2800 * 1800, t: [13.2, 3, 2.9, 3, 2.9] },
};

describe("the frame-time guard", () => {
  it("grows with the pixels drawn", () => {
    expect(frameBudgetMs(0)).toBe(3);
    expect(frameBudgetMs(1e6)).toBe(7);
  });

  for (const [name, m] of Object.entries(SWIFTSHADER_FLAT)) {
    it(`calls SwiftShader slow on the flat neck (${name})`, () => expect(judgeProbe(m.t, m.px).slow).toBe(true));
  }
  for (const [name, m] of Object.entries(GB10_FLAT)) {
    it(`calls a GPU fast on the flat neck (${name})`, () => expect(judgeProbe(m.t, m.px).slow).toBe(false));
  }

  for (const [name, m] of Object.entries(SWIFTSHADER)) {
    it(`calls SwiftShader slow (${name})`, () => expect(judgeProbe(m.t, m.px).slow).toBe(true));
  }
  for (const [name, m] of Object.entries(GB10)) {
    it(`calls a GPU fast (${name})`, () => expect(judgeProbe(m.t, m.px).slow).toBe(false));
  }

  it("ignores the warm-up frame and one outlier", () => {
    const v = judgeProbe([4000, 2, 2, 90, 2], 1e6);
    expect(v.medianMs).toBe(2);
    expect(v.slow).toBe(false);
  });

  it("says nothing without numbers", () => {
    expect(judgeProbe([], 1e6).slow).toBe(false);
    expect(judgeProbe([NaN, NaN], 1e6).slow).toBe(false);
  });
});
