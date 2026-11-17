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
 * The budget, from the numbers measured on the DGX Spark (20 cores, NVIDIA
 * GB10) with Chromium, both stage scenes, warm frames, 2026-11-16:
 *
 * | canvas (device px)  | SwiftShader (CPU) | GB10 (gl-egl) | budget |
 * |---------------------|-------------------|---------------|--------|
 * | 620x780  (0.48 MP)  | 45 - 110 ms       | 1.4 - 2.5 ms  | 18 ms  |
 * | 1400x900 (1.26 MP)  | 105 - 400 ms      | 1.0 - 4.8 ms  | 33 ms  |
 * | 2240x1440 (3.2 MP)  | 280 - 1100 ms     | (tier 2: 5 MP) 1.8 - 3 ms | 72 ms |
 *
 * So `8 ms + 20 ms per megapixel`: the fastest CPU rasteriser seen (twenty
 * cores) is at least 2.5x over it, a desktop GPU is ten times under it, and
 * an integrated GPU several times slower than the GB10 still passes. A GPU that
 * really is over it draws under 30 fps at the size the player uses, where the
 * flat neck is the better choice anyway.
 */

/** How many frames the probe draws. The first is a warm-up and is not judged. */
export const PROBE_FRAMES = 5;

/** The longest a frame of `pixels` device pixels may take on a GPU, in ms. */
export function frameBudgetMs(pixels: number): number {
  return 8 + 20 * (Math.max(0, pixels) / 1e6);
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
