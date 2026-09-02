/**
 * T07 — the adaptive drill's comment path.
 *
 * The regression these lock down: the coach used to DECIDE the tempo
 * and the engine obeyed, which meant a template-only build (every
 * shipped build) parsed every reply as "hold" and froze the drill.
 * The prompt must now present the decision as settled, and the
 * template path must produce a line without any model at all.
 */

import { describe, expect, it } from "vitest";

import {
  adaptiveScenario,
  buildAdaptiveCommentPrompt,
  isUsableComment,
} from "./adaptiveComment";
import { createShuffleState, pickTemplate } from "./templates";
import { TEMPLATE_CATALOG } from "./templateCatalog";
import type { AdaptiveEvalRequest } from "../ipc";

function req(over: Partial<AdaptiveEvalRequest> = {}): AdaptiveEvalRequest {
  return {
    currentBpm: 120,
    newBpm: 124,
    startBpm: 100,
    targetBpm: 160,
    accuracyPct: 88,
    aggressiveness: "moderate",
    currentStep: 3,
    decision: "up",
    ...over,
  };
}

describe("adaptiveScenario", () => {
  it("maps up/down onto catalog scenarios", () => {
    expect(adaptiveScenario("up")).toBe("drill_step_up");
    expect(adaptiveScenario("down")).toBe("drill_step_down");
  });

  it("returns null for hold so no feed line is emitted", () => {
    expect(adaptiveScenario("hold")).toBeNull();
  });
});

describe("buildAdaptiveCommentPrompt", () => {
  it("states the decision as already applied and forbids changing it", () => {
    const prompt = buildAdaptiveCommentPrompt(req());
    expect(prompt).toContain("already happened");
    expect(prompt).toContain("already decided and applied");
    expect(prompt.toLowerCase()).toContain("do not suggest a different tempo");
  });

  it("never asks the model to choose a direction", () => {
    for (const decision of ["up", "hold", "down"] as const) {
      const prompt = buildAdaptiveCommentPrompt(req({ decision }));
      // The old prompt ended with "should the tempo go UP, HOLD, or
      // DOWN? Reply with exactly one word". Nothing may ask for that.
      expect(prompt).not.toMatch(/should the tempo/i);
      expect(prompt).not.toMatch(/reply with exactly one word/i);
      expect(prompt).not.toMatch(/\bUP,\s*HOLD,?\s*(or\s*)?DOWN\b/i);
    }
  });

  it("carries the engine's numbers and locks them", () => {
    const prompt = buildAdaptiveCommentPrompt(
      req({ currentBpm: 120, newBpm: 124, accuracyPct: 88, currentStep: 3 }),
    );
    expect(prompt).toContain("88%");
    expect(prompt).toContain("120");
    expect(prompt).toContain("124");
    expect(prompt).toContain("Step number: 3");
    expect(prompt).toContain("Keep every number exactly as given");
  });

  it("describes the direction the engine actually took", () => {
    expect(buildAdaptiveCommentPrompt(req({ decision: "up" }))).toContain(
      "went UP from 120 to 124 BPM",
    );
    expect(
      buildAdaptiveCommentPrompt(
        req({ decision: "down", currentBpm: 124, newBpm: 120 }),
      ),
    ).toContain("went DOWN from 124 to 120 BPM");
    expect(buildAdaptiveCommentPrompt(req({ decision: "hold" }))).toContain(
      "HELD at 124 BPM",
    );
  });

  it("does not quote a target ceiling for an open-ended drill", () => {
    const prompt = buildAdaptiveCommentPrompt(req({ targetBpm: 300 }));
    expect(prompt).toContain("open-ended");
    expect(prompt).not.toContain("300 BPM target");
  });
});

describe("isUsableComment", () => {
  it("rejects empty, terse and runaway replies", () => {
    expect(isUsableComment("")).toBe(false);
    expect(isUsableComment("  ok ")).toBe(false);
    expect(isUsableComment("x".repeat(250))).toBe(false);
  });

  it("accepts a normal one-liner", () => {
    expect(isUsableComment("Clean round — you're at 124 BPM now.")).toBe(true);
  });
});

describe("template path (no model resident)", () => {
  for (const decision of ["up", "down"] as const) {
    it(`produces a filled line for a ${decision} step`, () => {
      const scenario = adaptiveScenario(decision)!;
      const state = createShuffleState();
      const out = pickTemplate(TEMPLATE_CATALOG, state, {
        vocab: "generic",
        scenario,
        severity: "neutral",
        context: { bpm: 124, accuracyPct: 88 },
        rng: () => 0,
      });
      expect(out).not.toBeNull();
      // Every placeholder resolved — a raw {bpm} would reach the feed.
      expect(out!).not.toMatch(/\{[a-zA-Z0-9_]+\}/);
      expect(out!).toMatch(/124|88/);
    });
  }

  it("resolves for every instrument vocabulary via the generic fallback", () => {
    for (const vocab of [
      "drums",
      "electric-guitar",
      "acoustic-guitar",
      "bass",
      "piano",
      "generic",
    ] as const) {
      const state = createShuffleState();
      const out = pickTemplate(TEMPLATE_CATALOG, state, {
        vocab,
        scenario: "drill_step_up",
        severity: "neutral",
        context: { bpm: 130, accuracyPct: 91 },
        rng: () => 0,
      });
      expect(out, `${vocab} had no drill_step_up line`).not.toBeNull();
    }
  });
});
