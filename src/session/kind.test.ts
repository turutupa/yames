import { describe, expect, it } from "vitest";
import { kindOfPath, kindTagKey } from "./kind";

const PATHS = [
  { id: "shred", kind: "mechanics" as const },
  { id: "blues-pentatonics", kind: "theory" as const },
];

describe("an Exercise's kind is its Path's", () => {
  it("reads the Path's own kind", () => {
    expect(kindOfPath(PATHS, "blues-pentatonics")).toBe("theory");
    expect(kindOfPath(PATHS, "shred")).toBe("mechanics");
    expect(kindTagKey(PATHS, "blues-pentatonics")).toBe("session.kind.theory");
  });

  it("falls back to Mechanics when the Path is unknown", () => {
    expect(kindOfPath(PATHS, "nope")).toBe("mechanics");
    expect(kindOfPath(PATHS, undefined)).toBe("mechanics");
  });
});
