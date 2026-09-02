/**
 * Brain-tier rules that the Settings UI reads but does not own.
 *
 * Two independent gates live here:
 *
 *  - **Family / migration.** The Rust downloader writes a
 *    `models/brain/model.json` marker recording which model family it
 *    installed; `getModelStatus()` hands the family back. Anything
 *    installed before the Qwen3 refresh has no marker and reports
 *    `"legacy"`. Those weights still load, but the prompt the engine now
 *    builds is Qwen3 ChatML, so a Phi-3.5 or Qwen2.5 model answers with
 *    template artifacts — hence the "Update brain" affordance. The old
 *    file is never deleted for the user; re-running the download
 *    overwrites it.
 *
 *  - **Studio RAM gate.** ROADMAP §3 only offers Studio (Qwen3-8B) at
 *    >= 16 GB of RAM. A failed platform query reports 0, which must read
 *    as "unknown" and NOT lock the user out of a tier their machine can
 *    probably run.
 */

/** Family id written by the current downloader. */
export const CURRENT_BRAIN_FAMILY = "qwen3";

/** ROADMAP §3: Studio is offered only at or above this much RAM. */
export const STUDIO_MIN_MEMORY_MB = 16 * 1024;

type BrainStatus = {
  brainReady: boolean;
  brainFamily: string | null;
} | null;

/**
 * True when a brain is installed but belongs to a superseded family, so
 * Settings should offer "Update brain" instead of pretending all is well.
 */
export function needsBrainUpdate(status: BrainStatus): boolean {
  if (!status || !status.brainReady) return false;
  // A null family on a ready brain means the backend could not classify
  // it at all — treat that like a legacy install rather than silently
  // leaving the user on unknown weights.
  return status.brainFamily !== CURRENT_BRAIN_FAMILY;
}

/**
 * Whether the Studio tier may be offered on this machine.
 *
 * `memoryMb === 0` means the query failed (or hasn't answered yet). We
 * allow Studio in that case: a false "your machine is too small" is a
 * worse failure than letting someone with 16 GB download 5 GB of weights.
 */
export function studioAvailable(memoryMb: number | null): boolean {
  if (memoryMb === null || memoryMb === 0) return true;
  return memoryMb >= STUDIO_MIN_MEMORY_MB;
}
