/**
 * W4's honesty matrix (O4). Every row here is a machine someone actually
 * has, and the rule being pinned is "never recommend what this machine or
 * this build cannot deliver".
 */
import { describe, expect, it } from "vitest";
import {
  memoryGb,
  recommendCoachTier,
  standardDisabledReason,
  studioDisabledReason,
  STANDARD_MIN_MEMORY_MB,
  STUDIO_MIN_MEMORY_MB,
  type CoachFacts,
} from "./coachRecommendation";

const facts = (over: Partial<CoachFacts> = {}): CoachFacts => ({
  llmCompiled: true,
  systemMemoryMb: 32 * 1024,
  installedTier: null,
  ...over,
});

describe("recommendCoachTier — RAM × llmCompiled", () => {
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
    for (const memoryMb of [4 * 1024, 32 * 1024, 128 * 1024, null, 0]) {
      expect(recommendCoachTier(facts({ llmCompiled: false, systemMemoryMb: memoryMb })))
        .toEqual({ tier: "off", reasonKey: "onboarding.coach.reasonNoLlm" });
    }
  });

  it("recommends timing-only below the Standard floor, with the RAM reason", () => {
    expect(recommendCoachTier(facts({ systemMemoryMb: STANDARD_MIN_MEMORY_MB - 1 })))
      .toEqual({ tier: "off", reasonKey: "onboarding.coach.reasonLowMemory" });
  });

  it("treats exactly the floor as enough", () => {
    expect(recommendCoachTier(facts({ systemMemoryMb: STANDARD_MIN_MEMORY_MB })).tier)
      .toBe("standard");
  });

  it("never reads a failed RAM query as 'too small'", () => {
    // 0 and null both mean "the platform query failed" (see brainTiers.ts).
    for (const memoryMb of [null, 0]) {
      expect(recommendCoachTier(facts({ systemMemoryMb: memoryMb })).tier).toBe(
        "standard",
      );
    }
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
    expect(
      recommendCoachTier(facts({ installedTier: "full", systemMemoryMb: 32 * 1024 })),
    ).toEqual({ tier: "full", reasonKey: "onboarding.coach.reasonInstalled" });
  });

  it("does not push an installed Studio brain onto a machine below the gate", () => {
    // "It is already there" is not a reason to run an 8B model in 8 GB.
    expect(
      recommendCoachTier(
        facts({ installedTier: "full", systemMemoryMb: STUDIO_MIN_MEMORY_MB - 1024 }),
      ),
    ).toEqual({ tier: "standard", reasonKey: null });
  });

  it("ignores installed weights a build without an LLM cannot read", () => {
    expect(
      recommendCoachTier(facts({ installedTier: "standard", llmCompiled: false })).tier,
    ).toBe("off");
  });

  it("ignores installed weights on a machine below the Standard floor", () => {
    expect(
      recommendCoachTier(facts({ installedTier: "standard", systemMemoryMb: 4 * 1024 })),
    ).toEqual({ tier: "off", reasonKey: "onboarding.coach.reasonLowMemory" });
  });
});

describe("disabled reasons", () => {
  it("greys Studio below 16 GB with the RAM reason (decision 5)", () => {
    expect(studioDisabledReason(facts({ systemMemoryMb: STUDIO_MIN_MEMORY_MB - 1 })))
      .toBe("onboarding.coach.studioNeedsRam");
  });

  it("leaves Studio selectable at exactly 16 GB", () => {
    expect(studioDisabledReason(facts({ systemMemoryMb: STUDIO_MIN_MEMORY_MB }))).toBeNull();
  });

  it("leaves Studio selectable when the RAM query failed", () => {
    for (const memoryMb of [null, 0]) {
      expect(studioDisabledReason(facts({ systemMemoryMb: memoryMb }))).toBeNull();
    }
  });

  it("greys both brains when the build cannot run one at all", () => {
    const noLlm = facts({ llmCompiled: false });
    expect(standardDisabledReason(noLlm)).toBe("onboarding.coach.reasonNoLlm");
    expect(studioDisabledReason(noLlm)).toBe("onboarding.coach.reasonNoLlm");
  });

  it("never greys Standard on a build that can run a model", () => {
    expect(standardDisabledReason(facts({ systemMemoryMb: 4 * 1024 }))).toBeNull();
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
