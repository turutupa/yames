// The result's line over the number: its short parts never break inside
// (acceptance 4, P2-11: "BARS" alone on a phone's second line).
import { describe, expect, it } from "vitest";
import { keepNumberWithUnit, keepShortParts } from "./SessionView";

describe("keepShortParts", () => {
  it("holds a number to its unit, and lets a long title wrap", () => {
    const out = keepShortParts("Take 1 · Four fingers, one string · 80 BPM · 10 bars");
    expect(out).toBe("Take 1 · Four fingers, one string · 80 BPM · 10 bars");
  });

  it("leaves a line with no separators as it is, when it is long", () => {
    expect(keepShortParts("A long line with no parts in it at all")).toBe("A long line with no parts in it at all");
  });
});

describe("keepNumberWithUnit", () => {
  it("holds the minutes to their unit, wherever the language puts them", () => {
    expect(keepNumberWithUnit("Осталось 5 мин")).toBe("Осталось 5\u00a0мин");
    expect(keepNumberWithUnit("5 min left")).toBe("5\u00a0min left");
    expect(keepNumberWithUnit("Noch 10 Min.")).toBe("Noch 10\u00a0Min.");
    expect(keepNumberWithUnit("残り 5 分")).toBe("残り 5\u00a0分");
  });

  it("leaves a line with no space after its number alone", () => {
    expect(keepNumberWithUnit("5분 남음")).toBe("5분 남음");
    expect(keepNumberWithUnit("Time is up")).toBe("Time is up");
  });
});
