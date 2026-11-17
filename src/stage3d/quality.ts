/**
 * Quality tiers and the adaptive step-down. No three.js here: the engine
 * hands in what it learned from the GPU, and the logic stays testable.
 *
 * Tier 2 (desktop GPU): shadow map, full textures, DPR cap 2.
 * Tier 1 (integrated GPU, most phones): painted string shadows, 3/4 textures.
 * Tier 0 (software rendering, old GPUs): DPR cap 1.6, half textures.
 */
export type Tier = 0 | 1 | 2;

export function pickTier(o: { forced?: number | null; userAgent: string; gpu: string; touchPoints?: number; screenMin?: number }): Tier {
  if (o.forced === 0 || o.forced === 1 || o.forced === 2) return o.forced;
  const phone = /Mobi|Android|iPhone|iPod/.test(o.userAgent) || ((o.touchPoints ?? 0) > 1 && (o.screenMin ?? 9999) < 900);
  if (/SwiftShader|llvmpipe|Software/i.test(o.gpu)) return 0;
  if (phone) return /Adreno \(TM\) [3-5]\d\d|Mali-[GT][0-6]\d(?!\d)|PowerVR/i.test(o.gpu) ? 0 : 1;
  return /Intel.*(HD|UHD)/i.test(o.gpu) ? 1 : 2;
}

export function tierSettings(tier: Tier) {
  return {
    maxDpr: tier >= 1 ? 2 : 1.6,
    textureScale: tier >= 2 ? 1 : tier === 1 ? 0.75 : 0.5,
    shadows: tier >= 2,
  };
}

/** What the adaptive step-down asks the engine to give up, in order. */
export type QualityStep = "resolution" | "shadows";

/**
 * Watches the gaps between frames that were meant to be back to back (a camera
 * flight, a vibrating string) and steps quality down when they average over
 * `budgetMs`. Gaps from frames that were not consecutive (idle, a 30 fps cap)
 * are not fed in. `lower` returns false when it had nothing left to give.
 */
export class Adaptive {
  private sum = 0;
  private n = 0;
  private exhausted = false;
  dprScale = 1;

  constructor(
    private readonly lower: (step: QualityStep, dprScale: number) => boolean,
    private readonly window = 45,
    private readonly budgetMs = 26,
  ) {}

  /** One gap between two consecutive frames, in ms. */
  sample(gapMs: number): void {
    if (this.exhausted) return;
    this.sum += gapMs;
    this.n += 1;
    if (this.n < this.window) return;
    const avg = this.sum / this.n;
    this.sum = 0;
    this.n = 0;
    if (avg <= this.budgetMs) return;
    if (this.dprScale > 0.68) {
      this.dprScale = Math.max(0.62, this.dprScale - 0.14);
      this.lower("resolution", this.dprScale);
      return;
    }
    if (!this.lower("shadows", this.dprScale)) this.exhausted = true;
  }

  /** A run of frames ended: drop the partial window. */
  reset(): void {
    this.sum = 0;
    this.n = 0;
  }
}
