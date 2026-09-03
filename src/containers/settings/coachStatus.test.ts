import { describe, it, expect } from "vitest";
import { coachStatusLabel, coachTierLabel } from "./coachStatus";
import type { CoachCapabilities } from "../../ipc";

const caps = (over: Partial<CoachCapabilities> = {}): CoachCapabilities => ({
  llmCompiled: true,
  modelResident: false,
  loading: false,
  backend: "cpu",
  modelName: null,
  loadError: null,
  brainDownloaded: false,
  studioRecommended: true,
  standardRecommended: true,
  brainUpdateRecommended: false,
  tipsUseModel: false,
  rephraseP50Ms: null,
  ...over,
});

describe("coachStatusLabel", () => {
  it("renders nothing until capabilities have been fetched", () => {
    expect(coachStatusLabel(null, false)).toBeNull();
    expect(coachStatusLabel(null, true)).toBeNull();
  });

  it("says the build cannot run a model when the LLM isn't compiled in", () => {
    const label = coachStatusLabel(
      caps({ llmCompiled: false, backend: "none" }),
      false,
    );
    expect(label).toEqual({
      key: "settings.coach.statusTemplateBuild",
      tone: "info",
    });
  });

  // The regression T03 exists for: shipping binaries had no `coach-llm`
  // feature, so a user who downloaded 2.4 GB of weights must still be
  // told the build can't run them — never "active".
  it("still says template build when weights are downloaded but uncompiled", () => {
    const label = coachStatusLabel(
      caps({ llmCompiled: false, backend: "none" }),
      true,
    );
    expect(label?.key).toBe("settings.coach.statusTemplateBuild");
    expect(label?.tone).toBe("info");
  });

  // The model is deliberately not resident until a session starts, so
  // "downloaded, not loaded" is the normal resting state — a neutral
  // fact, not a warning about a wasted download.
  it("reports downloaded-but-not-loaded as a neutral resting state", () => {
    const label = coachStatusLabel(caps({ modelResident: false }), true);
    expect(label).toEqual({
      key: "settings.coach.statusReadyNotLoaded",
      tone: "info",
    });
  });

  // Weights the engine refuses are the one genuinely actionable case.
  it("warns about weights from a superseded family", () => {
    const label = coachStatusLabel(
      caps({ modelResident: false, brainUpdateRecommended: true }),
      true,
    );
    expect(label).toEqual({
      key: "settings.coach.statusLegacyWeights",
      tone: "warn",
    });
  });

  it("says warming up while a load is in flight", () => {
    const label = coachStatusLabel(
      caps({ loading: true, modelResident: false }),
      true,
    );
    expect(label).toEqual({
      key: "settings.coach.statusWarmingUp",
      tone: "info",
    });
  });

  it("reports nothing downloaded when the build is capable but has no weights", () => {
    const label = coachStatusLabel(caps({ modelResident: false }), false);
    expect(label).toEqual({
      key: "settings.coach.statusNoModel",
      tone: "info",
    });
  });

  // Item 8: the name comes from GGUF metadata, and the backend is
  // capitalised for display — the line used to read "model.bin on vulkan".
  it("names the model and backend when one is resident", () => {
    const label = coachStatusLabel(
      caps({ modelResident: true, modelName: "Qwen3 4B", backend: "vulkan" }),
      true,
    );
    expect(label).toEqual({
      key: "settings.coach.statusActive",
      params: { model: "Qwen3 4B", backend: "Vulkan" },
      tone: "ok",
    });
  });

  it("falls back to a generic model name when the backend didn't report one", () => {
    const label = coachStatusLabel(
      caps({ modelResident: true, modelName: null, backend: "metal" }),
      true,
    );
    expect(label?.params).toEqual({ model: "model", backend: "Metal" });
  });

  it("trusts residency over the on-disk flag", () => {
    // brainDownloaded is derived from a separate IPC that can lag a
    // load; a resident model wins so the line never regresses to
    // "not loaded" while the coach is actively generating.
    const label = coachStatusLabel(
      caps({ modelResident: true, modelName: "Qwen3 4B" }),
      false,
    );
    expect(label?.key).toBe("settings.coach.statusActive");
  });
});

describe("coachTierLabel", () => {
  it("says nothing without capabilities, without an LLM, or with nothing resident", () => {
    expect(coachTierLabel(null)).toBeNull();
    expect(coachTierLabel(caps({ llmCompiled: false }))).toBeNull();
    // Weights on disk but not loaded: the line above already says so, and
    // there is no routing decision to report yet.
    expect(coachTierLabel(caps({ modelResident: false, brainDownloaded: true }))).toBeNull();
  });

  it("says every tier uses the model when tips are fast enough", () => {
    const label = coachTierLabel(
      caps({ modelResident: true, tipsUseModel: true, rephraseP50Ms: 310 }),
    );
    expect(label).toEqual({ key: "settings.coach.tiersAllModel", tone: "ok" });
  });

  // The dishonesty T04b removes: this machine reports backend "vulkan"
  // because that is the compile-time feature string, but has no usable
  // GPU, so tips are templates. "AI brain active on vulkan" alone would
  // be true and still mislead.
  it("admits tips are templates on a vulkan build with no usable GPU", () => {
    const label = coachTierLabel(
      caps({
        modelResident: true,
        backend: "vulkan",
        tipsUseModel: false,
        rephraseP50Ms: 3830,
      }),
    );
    expect(label).toEqual({
      key: "settings.coach.tiersTipsTemplateMeasured",
      params: { seconds: "3.8" },
      tone: "info",
    });
  });

  it("omits the number until a rephrase has actually been measured", () => {
    const label = coachTierLabel(
      caps({ modelResident: true, tipsUseModel: false, rephraseP50Ms: null }),
    );
    expect(label).toEqual({
      key: "settings.coach.tiersTipsTemplate",
      params: undefined,
      tone: "info",
    });
  });
});
