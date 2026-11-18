/**
 * The frame-time guard: is this "GPU" really a GPU?
 *
 * `webgl.ts` refuses a software renderer by its name, but the name is not
 * always there to read: WebKitGTK masks it (it says "Apple GPU" on every
 * Linux machine), so a VM or a box with no driver draws the neck on the CPU,
 * which cost about nine cores during a Take. The clock does not lie. Right
 * after the engine compiles, the controller has it draw a few frames back to
 * back, each waited for (`StageEngine.probe`), and compares the middle one
 * with a budget for that many pixels.
 *
 * The budget. The realistic neck (2026-11-16) cost SwiftShader 105 to 400 ms a
 * frame at 1400x900 and the budget was `8 + 20 ms per megapixel`. The flat
 * neck (art direction "A, graphic", 2026-11-17) is unlit with no textures, and
 * a CPU rasteriser draws it about ten times faster, fast enough to slip under
 * that budget while still costing several cores at 30 fps during a Take. So
 * the budget was re-cut against the flat neck, measured on the DGX Spark (20
 * cores, NVIDIA GB10) with Chromium, both stage scenes, the median of three
 * probes each, with the box at a load of about 9:
 *
 * | canvas (device px)  | SwiftShader (CPU) | GB10 (gl-egl) | budget |
 * |---------------------|-------------------|---------------|--------|
 * | 620x780  (0.48 MP)  | 7.7 - 8.8 ms      | 1.5 - 2.4 ms  | 4.9 ms |
 * | 1400x900 (1.26 MP)  | 16.1 - 18.5 ms    | 1.3 - 2.2 ms  | 8.0 ms |
 * | 2240x1440 (3.2 MP)  | 30.7 - 39.1 ms    | 1.5 - 2.8 ms  | 15.9 ms |
 *
 * So `3 ms + 4 ms per megapixel`: the fastest CPU rasteriser seen (twenty
 * cores) is about twice over it, and the GB10 two to five times under it (a
 * GPU frame here is mostly the fixed cost of the read-back that waits for it).
 * A GPU that really is over it would be one where the SVG neck, which looks
 * the same, is the better choice anyway.
 */

/** How many frames the probe draws. The first is a warm-up and is not judged. */
export const PROBE_FRAMES = 5;

/** The longest a frame of `pixels` device pixels may take on a GPU, in ms. */
export function frameBudgetMs(pixels: number): number {
  return 3 + 4 * (Math.max(0, pixels) / 1e6);
}

export type ProbeVerdict = { slow: boolean; medianMs: number; budgetMs: number };

/** Judge the probe's frame times (ms, warm-up first) for a canvas of `pixels`. */
export function judgeProbe(times: readonly number[], pixels: number): ProbeVerdict {
  const budgetMs = frameBudgetMs(pixels);
  const warm = (times.length > 1 ? times.slice(1) : times.slice()).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  if (warm.length === 0) return { slow: false, medianMs: 0, budgetMs };
  const mid = warm.length >> 1;
  const medianMs = warm.length % 2 ? warm[mid] : (warm[mid - 1] + warm[mid]) / 2;
  return { slow: medianMs > budgetMs, medianMs, budgetMs };
}
