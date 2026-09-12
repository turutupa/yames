// The sections are what turns twelve cells into three fours. If they ever
// stop summing to the bar count, the timeline draws a form that is not the
// form the engine is counting.
import { describe, expect, it } from "vitest";
import {
  JAM_FORM_KINDS,
  clampFormBars,
  formBars,
  formSectionNames,
  formSections,
  sectionStarts,
} from "./forms";
import { JAM_FORM_BARS, JAM_MAX_FORM_BARS } from "./types";
import type { JamFormKind } from "./types";

describe("forms", () => {
  it("offers every shape the record can hold", () => {
    expect([...JAM_FORM_KINDS].sort()).toEqual(
      ["aaba32", "bars16", "blues12", "custom", "loop8", "one"].sort(),
    );
  });

  it("takes the fixed forms' lengths from the contract, not from a second copy", () => {
    for (const [kind, bars] of Object.entries(JAM_FORM_BARS)) {
      expect(formBars({ kind: kind as JamFormKind, bars: 99 }), kind).toBe(bars);
    }
  });

  it("lets a custom form carry its own length", () => {
    expect(formBars({ kind: "custom", bars: 24 })).toBe(24);
  });

  it("holds a custom form to 1..64 whole bars", () => {
    expect(clampFormBars(0)).toBe(1);
    expect(clampFormBars(-9)).toBe(1);
    expect(clampFormBars(999)).toBe(JAM_MAX_FORM_BARS);
    expect(clampFormBars(7.4)).toBe(7);
    expect(formBars({ kind: "custom", bars: 200 })).toBe(JAM_MAX_FORM_BARS);
  });

  it("sums every form's sections to its bar count", () => {
    for (const kind of JAM_FORM_KINDS) {
      const form = { kind, bars: 13 } as const;
      const total = formSections(form).reduce((a, b) => a + b, 0);
      expect(total, kind).toBe(formBars(form));
    }
  });

  it("counts a blues as three fours and a standard as four eights", () => {
    expect(formSections({ kind: "blues12", bars: 12 })).toEqual([4, 4, 4]);
    expect(formSections({ kind: "aaba32", bars: 32 })).toEqual([8, 8, 8, 8]);
    expect(formSections({ kind: "bars16", bars: 16 })).toEqual([8, 8]);
    expect(formSections({ kind: "loop8", bars: 8 })).toEqual([8]);
    expect(formSections({ kind: "one", bars: 4 })).toEqual([4]);
  });

  it("letters AABA and leaves every other form's sections unnamed", () => {
    // The letters are AABA's own name. A, B, C over the three fours of a blues
    // would be a label no musician uses for that music.
    expect(formSectionNames({ kind: "aaba32", bars: 32 })).toEqual(["A", "A", "B", "A"]);
    expect(formSectionNames({ kind: "blues12", bars: 12 })).toEqual(["", "", ""]);
    expect(formSectionNames({ kind: "loop8", bars: 8 })).toEqual([""]);
  });

  it("gives every section a name slot, however many there are", () => {
    for (const kind of JAM_FORM_KINDS) {
      const form = { kind, bars: 20 } as const;
      expect(formSectionNames(form), kind).toHaveLength(formSections(form).length);
    }
  });

  it("gives the timeline the bar each section starts on", () => {
    expect(sectionStarts({ kind: "blues12", bars: 12 })).toEqual([0, 4, 8]);
    expect(sectionStarts({ kind: "aaba32", bars: 32 })).toEqual([0, 8, 16, 24]);
    expect(sectionStarts({ kind: "custom", bars: 5 })).toEqual([0]);
  });
});
