import { describe, expect, it } from "vitest";
import { sameRecord } from "./sameRecord";

describe("sameRecord — what 'unsaved changes' compares", () => {
  it("ignores the order the fields were written in", () => {
    expect(sameRecord({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  it("treats a field that is null, undefined or absent as the same nothing", () => {
    expect(sameRecord({ name: "x", customKit: null }, { name: "x" })).toBe(true);
    expect(sameRecord({ name: "x", customKit: undefined }, { name: "x", customKit: null })).toBe(true);
  });

  it("still sees every real change", () => {
    expect(sameRecord({ bpm: 120 }, { bpm: 121 })).toBe(false);
    expect(sameRecord({ name: "x", customKit: { dir: "d" } }, { name: "x" })).toBe(false);
    expect(sameRecord({ steps: [1, 2] }, { steps: [2, 1] })).toBe(false);
    expect(sameRecord({ steps: [1, 2] }, { steps: [1, 2, 3] })).toBe(false);
    expect(sameRecord({ on: false }, {})).toBe(false);
    expect(sameRecord({ n: 0 }, {})).toBe(false);
    expect(sameRecord({ s: "" }, {})).toBe(false);
  });

  it("does not mistake an array for an object with the same keys", () => {
    expect(sameRecord({ v: ["a"] }, { v: { 0: "a" } })).toBe(false);
  });
});
