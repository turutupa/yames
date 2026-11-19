import { describe, expect, it } from "vitest";
import { categoryOfPath, categoryTagKey, kindOfPath } from "./kind";

const PATHS = [
  { id: "shred", kind: "mechanics" as const },
  { id: "blues-pentatonics", kind: "theory" as const },
];

describe("an Exercise's kind is its Path's", () => {
  it("reads the Path's own kind", () => {
    expect(kindOfPath(PATHS, "blues-pentatonics")).toBe("theory");
    expect(kindOfPath(PATHS, "shred")).toBe("mechanics");
  });

  it("falls back to Mechanics when the Path is unknown", () => {
    expect(kindOfPath(PATHS, "nope")).toBe("mechanics");
    expect(kindOfPath(PATHS, undefined)).toBe("mechanics");
  });

  it("names a Take by its Path's category, not its kind", () => {
    const paths = [
      { id: "triads", kind: "theory" as const, category: "harmony" as const },
      { id: "first-chords", kind: "mechanics" as const, category: "foundations" as const },
      ...PATHS,
    ];
    expect(categoryTagKey(paths, "triads")).toBe("session.category.harmony");
    expect(categoryTagKey(paths, "first-chords")).toBe("session.category.foundations");
    // A pack written before `category`: the old split.
    expect(categoryOfPath(paths, "blues-pentatonics")).toBe("style");
    expect(categoryOfPath(paths, "shred")).toBe("technique");
    expect(categoryOfPath(paths, undefined)).toBe("technique");
  });
});
