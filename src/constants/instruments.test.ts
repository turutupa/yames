import { describe, it, expect } from "vitest";
import {
  DEFAULT_INSTRUMENT,
  GUITAR_INSTRUMENTS,
  isGuitar,
  learningFit,
} from "./instruments";
import { INSTRUMENTS } from "./metronome";

/** Guitar first (owner, 2026-11-17): what counts as a guitar, in one place. */
describe("isGuitar", () => {
  it("is true for the electric and the acoustic", () => {
    expect(isGuitar("electric-guitar")).toBe(true);
    expect(isGuitar("acoustic-guitar")).toBe(true);
  });

  it("is false for bass, for now, and for everything else", () => {
    for (const id of ["bass", "drums", "piano", "other", "", "ukulele"]) {
      expect(isGuitar(id), id).toBe(false);
    }
    expect(isGuitar(undefined)).toBe(false);
    expect(isGuitar(null)).toBe(false);
  });
});

describe("learningFit", () => {
  it("tells a guitar, a bass (Paths planned) and anything else apart", () => {
    expect(learningFit("electric-guitar")).toBe("guitar");
    expect(learningFit("acoustic-guitar")).toBe("guitar");
    expect(learningFit("bass")).toBe("bass");
    expect(learningFit("drums")).toBe("other");
    expect(learningFit("piano")).toBe("other");
    expect(learningFit("other")).toBe("other");
  });
});

describe("the instrument lists", () => {
  it("defaults to a guitar", () => {
    expect(isGuitar(DEFAULT_INSTRUMENT)).toBe(true);
    expect(GUITAR_INSTRUMENTS[0]).toBe(DEFAULT_INSTRUMENT);
  });

  it("every guitar is a real instrument id", () => {
    const ids = INSTRUMENTS.map((i) => i.id);
    for (const id of GUITAR_INSTRUMENTS) expect(ids).toContain(id);
  });

  it("Settings still offers bass, drums and piano (the tools lose nothing)", () => {
    for (const id of ["bass", "drums", "piano"]) {
      const inst = INSTRUMENTS.find((i) => i.id === id);
      expect(inst, id).toBeDefined();
      expect(inst!.soon, `${id} is selectable`).toBeFalsy();
    }
  });
});
