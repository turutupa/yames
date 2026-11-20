import { describe, expect, it } from "vitest";
import { loadHistoryWithBudget } from "./historyBudget";
import type { SavedSession } from "../types";

const session = { id: "s1", timestamp: 1, bpm: 120 } as unknown as SavedSession;

describe("loadHistoryWithBudget", () => {
  it("returns the loaded history when load resolves within budget", async () => {
    const result = await loadHistoryWithBudget(async () => [session], 500);
    expect(result).toEqual([session]);
  });

  it("returns undefined when loader exceeds the budget", async () => {
    const result = await loadHistoryWithBudget(
      () => new Promise((resolve) => setTimeout(() => resolve([session]), 50)),
      10,
    );
    expect(result).toBeUndefined();
  });
});
