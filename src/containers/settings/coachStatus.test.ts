import { describe, it, expect } from "vitest";
import { coachStatusLabel } from "./coachStatus";
import type { CoachCapabilities } from "../../ipc";

const caps = (over: Partial<CoachCapabilities> = {}): CoachCapabilities => ({
  llmCompiled: true,
  modelResident: false,
  backend: "cpu",
  modelName: null,
  ramEstimateMb: 0,
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

  // The regression this task exists for: shipping binaries have no
  // `coach-llm` feature, so a user who downloaded 2.4 GB of weights
  // must still be told the build can't run them — never "active".
  it("still says template build when weights are downloaded but uncompiled", () => {
    const label = coachStatusLabel(
      caps({ llmCompiled: false, backend: "none" }),
      true,
    );
    expect(label?.key).toBe("settings.coach.statusTemplateBuild");
    expect(label?.tone).toBe("info");
  });

  it("flags downloaded-but-not-loaded weights as a warning", () => {
    const label = coachStatusLabel(caps({ modelResident: false }), true);
    expect(label).toEqual({
      key: "settings.coach.statusNotLoaded",
      tone: "warn",
    });
  });

  it("reports nothing downloaded when the build is capable but has no weights", () => {
    const label = coachStatusLabel(caps({ modelResident: false }), false);
    expect(label).toEqual({
      key: "settings.coach.statusNoModel",
      tone: "info",
    });
  });

  it("names the model and backend when one is resident", () => {
    const label = coachStatusLabel(
      caps({ modelResident: true, modelName: "model.bin", backend: "metal" }),
      true,
    );
    expect(label).toEqual({
      key: "settings.coach.statusActive",
      params: { model: "model.bin", backend: "metal" },
      tone: "ok",
    });
  });

  it("falls back to a generic model name when the backend didn't report one", () => {
    const label = coachStatusLabel(
      caps({ modelResident: true, modelName: null, backend: "vulkan" }),
      true,
    );
    expect(label?.params).toEqual({ model: "model", backend: "vulkan" });
  });

  it("trusts residency over the on-disk flag", () => {
    // brainDownloaded is derived from a separate IPC that can lag a
    // load; a resident model wins so the line never regresses to
    // "not loaded" while the coach is actively generating.
    const label = coachStatusLabel(
      caps({ modelResident: true, modelName: "model.bin" }),
      false,
    );
    expect(label?.key).toBe("settings.coach.statusActive");
  });
});
