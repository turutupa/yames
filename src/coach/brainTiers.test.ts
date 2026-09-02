import { describe, expect, it } from "vitest";
import {
  backendLabel,
  brainTierLabelKey,
  needsBrainUpdate,
  standardAvailable,
  studioAvailable,
} from "./brainTiers";

/** A `ModelStatus`-shaped gate bundle with everything permissive. */
const gates = (over: Partial<Parameters<typeof needsBrainUpdate>[0] & object> = {}) => ({
  studioRecommended: true,
  standardRecommended: true,
  brainUpdateRecommended: false,
  ...over,
});

describe("needsBrainUpdate", () => {
  it("mirrors the backend's answer", () => {
    expect(needsBrainUpdate(gates({ brainUpdateRecommended: true }))).toBe(true);
    expect(needsBrainUpdate(gates({ brainUpdateRecommended: false }))).toBe(false);
  });

  it("offers no update before the status has arrived", () => {
    // Prompting for a 2.5 GB re-download on a guess is worse than
    // prompting a moment later.
    expect(needsBrainUpdate(null)).toBe(false);
  });
});

describe("tier gates", () => {
  it("mirror the backend's answers", () => {
    expect(studioAvailable(gates({ studioRecommended: false }))).toBe(false);
    expect(standardAvailable(gates({ standardRecommended: false }))).toBe(false);
    expect(studioAvailable(gates())).toBe(true);
    expect(standardAvailable(gates())).toBe(true);
  });

  it("are permissive while the status is unknown", () => {
    // Same rule the backend applies to a failed RAM query: a false "your
    // machine is too small" is the worse failure.
    expect(studioAvailable(null)).toBe(true);
    expect(standardAvailable(null)).toBe(true);
  });
});

describe("brainTierLabelKey", () => {
  it("maps the frozen `full` id onto the Studio label", () => {
    expect(brainTierLabelKey("full")).toBe("settings.coach.brainStudio");
    expect(brainTierLabelKey("standard")).toBe("settings.coach.brainStandard");
  });

  it("falls back to Off for anything else", () => {
    expect(brainTierLabelKey(null)).toBe("common.off");
    expect(brainTierLabelKey(undefined)).toBe("common.off");
    expect(brainTierLabelKey("off")).toBe("common.off");
  });
});

describe("backendLabel", () => {
  it("capitalises the compile-time backend for display", () => {
    expect(backendLabel("vulkan")).toBe("Vulkan");
    expect(backendLabel("metal")).toBe("Metal");
    expect(backendLabel("cpu")).toBe("CPU");
  });

  it("passes anything unknown through unchanged", () => {
    expect(backendLabel("none")).toBe("none");
  });
});
