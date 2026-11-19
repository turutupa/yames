import { describe, expect, it } from "vitest";
import { isGradingChoice, legacyGradeFor, readGradingChoice } from "./grading";

describe("grading: on, off or ask (owner, 2026-11-18)", () => {
  it("the new key wins over the old switch", () => {
    expect(readGradingChoice("on", false)).toBe("on");
    expect(readGradingChoice("off", true)).toBe("off");
    expect(readGradingChoice("ask", false)).toBe("ask");
  });

  it("a player from before it keeps what they chose, and one who never chose is asked", () => {
    expect(readGradingChoice(undefined, false)).toBe("off");
    expect(readGradingChoice(undefined, true)).toBe("on");
    expect(readGradingChoice(undefined, undefined)).toBe("ask");
    expect(readGradingChoice(null, null)).toBe("ask");
  });

  it("anything else in the store is not a choice", () => {
    expect(readGradingChoice("yes", undefined)).toBe("ask");
    expect(isGradingChoice(true)).toBe(false);
  });

  it("the old switch is written beside it for on and off only", () => {
    expect(legacyGradeFor("on")).toBe(true);
    expect(legacyGradeFor("off")).toBe(false);
    expect(legacyGradeFor("ask")).toBeNull();
  });
});
