import { describe, expect, it } from "vitest";
import {
  CURRENT_BRAIN_FAMILY,
  STUDIO_MIN_MEMORY_MB,
  needsBrainUpdate,
  studioAvailable,
} from "./brainTiers";

describe("needsBrainUpdate", () => {
  it("is false when nothing is downloaded", () => {
    expect(needsBrainUpdate(null)).toBe(false);
    expect(needsBrainUpdate({ brainReady: false, brainFamily: null })).toBe(false);
  });

  it("is false for a current-family brain", () => {
    expect(
      needsBrainUpdate({ brainReady: true, brainFamily: CURRENT_BRAIN_FAMILY }),
    ).toBe(false);
  });

  it("is true for a pre-Qwen3 install (no marker on disk)", () => {
    expect(needsBrainUpdate({ brainReady: true, brainFamily: "legacy" })).toBe(true);
  });

  it("is true when the backend could not classify the brain at all", () => {
    // A ready brain with a null family means a marker that exists but is
    // unreadable, or a backend older than the marker. Offer the update.
    expect(needsBrainUpdate({ brainReady: true, brainFamily: null })).toBe(true);
  });

  it("is true for a future family this build does not know", () => {
    expect(needsBrainUpdate({ brainReady: true, brainFamily: "qwen4" })).toBe(true);
  });
});

describe("studioAvailable", () => {
  it("allows Studio at or above 16 GB", () => {
    expect(studioAvailable(STUDIO_MIN_MEMORY_MB)).toBe(true);
    expect(studioAvailable(32 * 1024)).toBe(true);
  });

  it("blocks Studio below 16 GB", () => {
    expect(studioAvailable(8 * 1024)).toBe(false);
    expect(studioAvailable(STUDIO_MIN_MEMORY_MB - 1)).toBe(false);
  });

  it("treats an unknown/failed RAM query as permissive", () => {
    expect(studioAvailable(0)).toBe(true);
    expect(studioAvailable(null)).toBe(true);
  });
});
