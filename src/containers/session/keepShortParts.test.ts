// The result's line over the number: its short parts never break inside
// (acceptance 4, P2-11: "BARS" alone on a phone's second line).
import { describe, expect, it } from "vitest";
import { keepShortParts } from "./SessionView";

describe("keepShortParts", () => {
  it("holds a number to its unit, and lets a long title wrap", () => {
    const out = keepShortParts("Take 1 · Four fingers, one string · 80 BPM · 10 bars");
    expect(out).toBe("Take 1 · Four fingers, one string · 80 BPM · 10 bars");
  });

  it("leaves a line with no separators as it is, when it is long", () => {
    expect(keepShortParts("A long line with no parts in it at all")).toBe("A long line with no parts in it at all");
  });
});
