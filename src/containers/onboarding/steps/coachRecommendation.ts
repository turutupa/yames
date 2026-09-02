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
 *   - `gates`          — `studioRecommended` / `standardRecommended` as
 *                       computed by Rust against the RAM the OS actually
 *                       reports. The floors used to live here as literal 8 GiB
 *                       and 16 GiB comparisons, which no real 8 GB or 16 GB
 *                       Windows/Linux machine passes — firmware and iGPU
 *                       reservations come off the top before the OS answers.
 *   - `installedTier`  — weights already on disk, so the honest recommendation
 *                       is "use what you have", not "download 2.5 GB again".
 *
 * `systemMemoryMb` survives only as *copy*: "this machine has {gb} GB". It no
 * longer decides anything.
 *
 * Kept out of the component so the matrix is unit-testable without a DOM, and
 * so the reason shown to the user is chosen in the same place as the tier —
 * a recommendation without its reason is exactly the overselling this step is
 * supposed to avoid.
 */
import { standardAvailable, studioAvailable } from "../../../coach/brainTiers";
import type { BrainTier, ModelTier } from "../../../types";

export type CoachFacts = {
  /** `get_coach_capabilities().llmCompiled`; false when the query failed. */
  llmCompiled: boolean;
  /** Total physical RAM in MB, for the copy only. `null`/`0` = unknown. */
  systemMemoryMb: number | null;
  /** Rust's tier gates. `null` until the status has arrived (permissive). */
  gates: {
    studioRecommended: boolean;
    standardRecommended: boolean;
    brainUpdateRecommended: boolean;
  } | null;
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

  if (!llmCompiled) {
    return { tier: "off", reasonKey: "onboarding.coach.reasonNoLlm" };
  }
  if (!standardAvailable(facts.gates)) {
    return { tier: "off", reasonKey: "onboarding.coach.reasonLowMemory" };
  }
  if (installedTier === "standard") {
    return { tier: "standard", reasonKey: "onboarding.coach.reasonInstalled" };
  }
  // An installed Studio brain is only recommended where Studio is allowed:
  // below the floor an 8B model thrashes, and "it is already there" is not
  // a good enough reason to point someone at it.
  if (installedTier === "full" && studioAvailable(facts.gates)) {
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
  if (!studioAvailable(facts.gates)) {
    return "onboarding.coach.studioNeedsRam";
  }
  return null;
}

/** Same question for the Standard card. */
export function standardDisabledReason(facts: CoachFacts): string | null {
  if (!facts.llmCompiled) return "onboarding.coach.unavailableInBuild";
  if (!standardAvailable(facts.gates)) {
    return "onboarding.coach.standardNeedsRam";
  }
  return null;
}

/** RAM in whole GB for the copy, or null when the query failed. */
export function memoryGb(memoryMb: number | null): number | null {
  const mb = knownMemory(memoryMb);
  return mb === null ? null : Math.round(mb / 1024);
}
