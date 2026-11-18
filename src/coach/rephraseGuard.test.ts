import { describe, expect, it } from "vitest";
import { keepsFacts, safeRephrase } from "./rephraseGuard";

describe("a rephrase keeps the facts of its original", () => {
  it("drops the tempo the model invented (owner report, 2026-11-18)", () => {
    const original = "Welcome back. Pick up where you left off.";
    const invented = "Welcome back! Let's keep building on this week's 120 BPM reps.";
    expect(keepsFacts(original, invented)).toBe(false);
    expect(safeRephrase(original, invented)).toBe(original);
  });

  it("drops a unit with no number: reps, BPM, percent", () => {
    const original = "Welcome back. Pick up where you left off.";
    expect(keepsFacts(original, "Welcome back, let's get those reps in.")).toBe(false);
    expect(keepsFacts(original, "Back at your usual BPM, then.")).toBe(false);
    expect(keepsFacts("Nice and even.", "Even, about a hundred percent.")).toBe(false);
  });

  it("keeps a rephrase that only rewords, numbers and all", () => {
    const original = "Back at Alt picking — you hit 78 at 96 BPM last time. Let's see if 81 is within reach.";
    const reworded = "Alt picking again: 78 at 96 BPM last round. 81 looks within reach.";
    expect(keepsFacts(original, reworded)).toBe(true);
    expect(safeRephrase(original, reworded)).toBe(reworded);
    expect(keepsFacts("85% — the kick is 20ms behind.", "The kick sits 20 ms behind; still 85 percent.")).toBe(true);
  });

  it("a number may not be used more often than the original used it", () => {
    expect(keepsFacts("You hit 78.", "78, then 78 again.")).toBe(false);
  });

  it("a blank answer ships the original", () => {
    expect(safeRephrase("Hello.", "   ")).toBe("Hello.");
    expect(safeRephrase("Hello.", undefined)).toBe("Hello.");
  });
});
