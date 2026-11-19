import { describe, expect, it } from "vitest";
import { steppedAside } from "./guitar";

describe("markers at one fret on neighbouring strings", () => {
  it("stay in line when they do not touch: a box shape reads as one fret (acceptance 5, P2-10)", () => {
    const box = [1, 2, 3, 4, 5, 6].map((s) => ({ s, f: 5, kind: "box" as const }));
    expect(steppedAside(box).size).toBe(0);
    // NOW beside a quiet dot clears it too.
    expect(steppedAside([{ s: 2, f: 5, kind: "now" }, { s: 3, f: 5, kind: "box" }]).size).toBe(0);
  });

  it("step aside only where two would touch, and never both of a pair", () => {
    const touching = [
      { s: 2, f: 5, kind: "now" as const },
      { s: 3, f: 5, kind: "next" as const },
      { s: 4, f: 5, kind: "box" as const },
    ];
    expect([...steppedAside(touching)]).toEqual(["3:5"]);
    // Open strings are tokens by the nut, never moved.
    expect(steppedAside([{ s: 1, f: 0, kind: "now" }, { s: 2, f: 0, kind: "next" }]).size).toBe(0);
  });
});
