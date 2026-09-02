/**
 * W4's honesty rules, as pure functions (ONBOARDING_PLAN §2 principle 4,
 * decision 5).
 *
 * The step must never recommend something the machine or the build cannot
 * deliver, so the decision is made here from three facts and nothing else:
 *
 *   - `llmCompiled`   — does this binary contain llama.cpp at all (T03)? A
 *                       release built without the `coach-llm` feature can hold
 *                       5 GB of weights and still not read a byte of them.
 *   - `systemMemoryMb` — total physical RAM (T04). `0`/`null` means the
 *                       platform query failed; that must read as "unknown" and
 *                       never as "too small" (same rule as `studioAvailable`).
 *   - `installedTier`  — weights already on disk, so the honest recommendation
 *                       is "use what you have", not "download 2.5 GB again".
 *
 * Kept out of the component so the matrix is unit-testable without a DOM, and
 * so the reason shown to the user is chosen in the same place as the tier —
 * a recommendation without its reason is exactly the overselling this step is
 * supposed to avoid.
 */
import { STUDIO_MIN_MEMORY_MB, studioAvailable } from "../../../coach/brainTiers";
import type { BrainTier, ModelTier } from "../../../types";

/**
 * Floor for the Standard brain (Qwen3-4B Q4_K_M, ~4 GB resident while
 * generating plus the app itself). Below this the honest answer is timing-only
 * — the model would swap and the coach would feel broken.
 */
export const STANDARD_MIN_MEMORY_MB = 8 * 1024;

export { STUDIO_MIN_MEMORY_MB, studioAvailable };

export type CoachFacts = {
  /** `get_coach_capabilities().llmCompiled`; false when the query failed. */
  llmCompiled: boolean;
  /** Total physical RAM in MB. `null` or `0` = unknown, never "too small". */
  systemMemoryMb: number | null;
  /** Tier whose weights are already on disk, or null. */
  installedTier: ModelTier | null;
};

export type CoachRecommendation = {
  tier: BrainTier;
  /**
   * i18n key explaining *why*, or null when the recommendation is the plain
   * default and needs no defence. Always set when we recommend timing-only.
   */
  reasonKey: string | null;
};

/** True when the RAM query gave us a usable number. */
function knownMemory(memoryMb: number | null): number | null {
  return memoryMb === null || memoryMb === 0 ? null : memoryMb;
}

/**
 * The preselected choice, with the reason the user is owed.
 *
 * Order matters and encodes the honesty rules:
 *   1. a build with no LLM can never run a brain, whatever the disk holds;
 *   2. a machine below the Standard floor is told so before anything is
 *      recommended to it — including weights it already downloaded;
 *   3. weights already on disk beat a fresh download;
 *   4. otherwise Standard, the floor tier.
 */
export function recommendCoachTier(facts: CoachFacts): CoachRecommendation {
  const { llmCompiled, installedTier } = facts;
  const memoryMb = knownMemory(facts.systemMemoryMb);

  if (!llmCompiled) {
    return { tier: "off", reasonKey: "onboarding.coach.reasonNoLlm" };
  }
  if (memoryMb !== null && memoryMb < STANDARD_MIN_MEMORY_MB) {
    return { tier: "off", reasonKey: "onboarding.coach.reasonLowMemory" };
  }
  if (installedTier === "standard") {
    return { tier: "standard", reasonKey: "onboarding.coach.reasonInstalled" };
  }
  // An installed Studio brain is only recommended where Studio is allowed:
  // below 16 GB an 8B model thrashes, and "it is already there" is not a
  // good enough reason to point someone at it.
  if (installedTier === "full" && studioAvailable(facts.systemMemoryMb)) {
    return { tier: "full", reasonKey: "onboarding.coach.reasonInstalled" };
  }
  return { tier: "standard", reasonKey: null };
}

/**
 * Why the Studio card is greyed out, or null when it is selectable
 * (decision 5). Two independent reasons, in the order they matter: a build
 * that cannot run any model, then the 16 GB RAM gate.
 *
 * The no-LLM case gets the short label rather than `reasonNoLlm`: the long
 * explanation is already on the recommendation line right below, and the same
 * sentence printed three times reads as noise instead of honesty.
 */
export function studioDisabledReason(facts: CoachFacts): string | null {
  if (!facts.llmCompiled) return "onboarding.coach.unavailableInBuild";
  if (!studioAvailable(facts.systemMemoryMb)) {
    return "onboarding.coach.studioNeedsRam";
  }
  return null;
}

/** Same question for the Standard card. */
export function standardDisabledReason(facts: CoachFacts): string | null {
  if (!facts.llmCompiled) return "onboarding.coach.unavailableInBuild";
  return null;
}

/** RAM in whole GB for the copy, or null when the query failed. */
export function memoryGb(memoryMb: number | null): number | null {
  const mb = knownMemory(memoryMb);
  return mb === null ? null : Math.round(mb / 1024);
}
