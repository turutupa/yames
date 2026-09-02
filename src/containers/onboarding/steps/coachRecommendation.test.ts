/**
 * W4's honesty matrix (O4). Every row here is a machine someone actually
 * has, and the rule being pinned is "never recommend what this machine or
 * this build cannot deliver".
 *
 * The RAM thresholds themselves are no longer tested here — they moved to
 * Rust (`models::recommendations`, tested in `models.rs`) because a
 * literal 16 GiB comparison against reported RAM locked real 16 GB
 * machines out of Studio. What this file pins is the *matrix*: given the
 * gates the backend computed, which tier does the wizard point at and
 * which reason does it owe the user.
 */
import { describe, expect, it } from "vitest";
import {
  memoryGb,
  recommendCoachTier,
  standardDisabledReason,
  studioDisabledReason,
  type CoachFacts,
} from "./coachRecommendation";

const facts = (over: Partial<CoachFacts> = {}): CoachFacts => ({
  llmCompiled: true,
  systemMemoryMb: 32 * 1024,
  gates: {
    studioRecommended: true,
    standardRecommended: true,
    brainUpdateRecommended: false,
  },
  installedTier: null,
  ...over,
});

/** A machine the backend says is below the Standard floor. */
const tooSmall = { studioRecommended: false, standardRecommended: false, brainUpdateRecommended: false };
/** Big enough for Standard, not for Studio. */
const standardOnly = { studioRecommended: false, standardRecommended: true, brainUpdateRecommended: false };

describe("recommendCoachTier — gates × llmCompiled", () => {
  it("recommends Standard on a capable machine, with nothing to explain", () => {
    expect(recommendCoachTier(facts())).toEqual({ tier: "standard", reasonKey: null });
  });

  it("recommends Standard, not Studio, even on a 64 GB machine", () => {
    // Studio is selectable there, but the floor tier is what we point at:
    // 2.5 GB is a smaller promise than 5 GB and runs everywhere.
    expect(recommendCoachTier(facts({ systemMemoryMb: 64 * 1024 })).tier).toBe(
      "standard",
    );
  });

  it("recommends timing-only when the build has no LLM, whatever the RAM", () => {
    for (const gates of [tooSmall, standardOnly, null]) {
      expect(recommendCoachTier(facts({ llmCompiled: false, gates })))
        .toEqual({ tier: "off", reasonKey: "onboarding.coach.reasonNoLlm" });
    }
  });

  it("recommends timing-only below the Standard floor, with the RAM reason", () => {
    expect(recommendCoachTier(facts({ gates: tooSmall })))
      .toEqual({ tier: "off", reasonKey: "onboarding.coach.reasonLowMemory" });
  });

  it("never reads an unanswered gate query as 'too small'", () => {
    // `gates: null` means the status has not arrived yet — same rule the
    // backend applies to a failed RAM query.
    expect(recommendCoachTier(facts({ gates: null })).tier).toBe("standard");
  });
});

describe("recommendCoachTier — weights already on disk", () => {
  it("points at an installed Standard brain instead of a fresh download", () => {
    expect(recommendCoachTier(facts({ installedTier: "standard" }))).toEqual({
      tier: "standard",
      reasonKey: "onboarding.coach.reasonInstalled",
    });
  });

  it("points at an installed Studio brain when the machine may run it", () => {
    expect(recommendCoachTier(facts({ installedTier: "full" }))).toEqual({
      tier: "full",
      reasonKey: "onboarding.coach.reasonInstalled",
    });
  });

  it("does not push an installed Studio brain onto a machine below the gate", () => {
    // "It is already there" is not a reason to run an 8B model in 8 GB.
    expect(
      recommendCoachTier(facts({ installedTier: "full", gates: standardOnly })),
    ).toEqual({ tier: "standard", reasonKey: null });
  });

  it("ignores installed weights a build without an LLM cannot read", () => {
    expect(
      recommendCoachTier(facts({ installedTier: "standard", llmCompiled: false })).tier,
    ).toBe("off");
  });

  it("ignores installed weights on a machine below the Standard floor", () => {
    expect(
      recommendCoachTier(facts({ installedTier: "standard", gates: tooSmall })),
    ).toEqual({ tier: "off", reasonKey: "onboarding.coach.reasonLowMemory" });
  });
});

describe("disabled reasons", () => {
  it("greys Studio when the backend says the machine is too small (decision 5)", () => {
    expect(studioDisabledReason(facts({ gates: standardOnly })))
      .toBe("onboarding.coach.studioNeedsRam");
  });

  it("leaves Studio selectable when the backend allows it", () => {
    expect(studioDisabledReason(facts())).toBeNull();
  });

  it("leaves Studio selectable while the gates are unknown", () => {
    expect(studioDisabledReason(facts({ gates: null }))).toBeNull();
  });

  it("greys both brains when the build cannot run one at all", () => {
    // The short label, not `reasonNoLlm`: the long sentence belongs to the
    // recommendation line, printed once.
    const noLlm = facts({ llmCompiled: false });
    expect(standardDisabledReason(noLlm)).toBe("onboarding.coach.unavailableInBuild");
    expect(studioDisabledReason(noLlm)).toBe("onboarding.coach.unavailableInBuild");
  });

  it("greys Standard below its own floor", () => {
    // Settings gained the same gate in T04c; before that the two screens
    // told the same machine two different things about the same tier.
    expect(standardDisabledReason(facts({ gates: tooSmall })))
      .toBe("onboarding.coach.standardNeedsRam");
  });

  it("never greys Standard on a capable machine", () => {
    expect(standardDisabledReason(facts({ gates: standardOnly }))).toBeNull();
  });
});

describe("memoryGb", () => {
  it("rounds to whole GB for the copy", () => {
    expect(memoryGb(16 * 1024)).toBe(16);
    expect(memoryGb(8100)).toBe(8);
  });

  it("has no number to show when the query failed", () => {
    expect(memoryGb(null)).toBeNull();
    expect(memoryGb(0)).toBeNull();
  });
});
