/**
 * Which brains are on disk, per tier (leg ms2).
 *
 * Since ms2 each tier lives in its own folder (`models/brain/<tier>/`) and
 * `ModelStatus.tiers` reports each one. An older backend (and an older test
 * fixture) only has the single-brain fields, which describe at most one
 * brain; this reads either, so no screen has to know which it was given.
 */
import type { ModelStatus, TierStatus } from "../ipc.desktop";
import type { ModelTier } from "../types";

export const MODEL_TIERS: readonly ModelTier[] = ["standard", "full"];

/** `tier`'s brain, or null when it is not on disk (or nothing is known yet). */
export function tierOnDisk(status: ModelStatus | null | undefined, tier: ModelTier): TierStatus | null {
  if (!status) return null;
  if (status.tiers) {
    const t = status.tiers.find((x) => x.tier === tier);
    return t?.onDisk ? t : null;
  }
  if (!status.brainReady || status.brainTier?.trim() !== tier) return null;
  return {
    tier,
    onDisk: true,
    sizeBytes: status.brainSizeBytes,
    family: status.brainFamily,
    updateRecommended: status.brainUpdateRecommended,
    partialBytes: 0,
    downloadBytes: null,
    checksumPinned: false,
  };
}

/** The tiers on disk, in the selector's order. */
export function tiersOnDisk(status: ModelStatus | null | undefined): ModelTier[] {
  return MODEL_TIERS.filter((t) => tierOnDisk(status, t) !== null);
}

/**
 * A brain is on disk whose tier cannot be read (an older backend whose
 * `tier` file is missing or garbled). Nothing can be said about where a new
 * download would land beside it, so nothing is offered.
 */
export function unplacedBrain(status: ModelStatus | null | undefined): boolean {
  return !!status && !status.tiers && status.brainReady && tiersOnDisk(status).length === 0;
}

/** Sizes as people read them, and as the selector shows them: decimal gigabytes, one place. */
export function gbText(bytes: number, lng: string): string {
  const n = new Intl.NumberFormat(lng, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return `${n.format(bytes / 1e9)} GB`;
}

/**
 * The bytes done so far, in the same unit as the whole and never rounded up
 * to it: "2.4 of 2.5 GB" until the last byte, not "2.5 of 2.5 GB".
 */
export function gbDoneText(done: number, total: number, lng: string): string {
  const n = new Intl.NumberFormat(lng, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const tenths = done >= total ? Math.round(total / 1e8) : Math.min(Math.floor(done / 1e8), Math.floor(total / 1e8));
  return n.format(tenths / 10);
}

/** Bytes of a paused download of `tier` kept on disk (0 when none or unknown). */
export function partialBytes(status: ModelStatus | null | undefined, tier: ModelTier): number {
  return status?.tiers?.find((x) => x.tier === tier)?.partialBytes ?? 0;
}
