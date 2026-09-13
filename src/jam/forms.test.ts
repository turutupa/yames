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
  sectionRanges,
  sectionIndexAt,
  stepSection,
  barHasFill,
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

// A loop is a pair of bar numbers sent to the engine, and inclusive at both
// ends. Every off-by-one here is a loop that plays three bars of a four-bar
// bridge and gets blamed on the audio thread.
describe("a section as a range", () => {
  it("covers every bar of the form exactly once, inclusive at both ends", () => {
    for (const kind of JAM_FORM_KINDS) {
      const form = { kind, bars: 20 } as const;
      const ranges = sectionRanges(form);
      expect(ranges[0].start, kind).toBe(0);
      expect(ranges[ranges.length - 1].end, kind).toBe(formBars(form) - 1);
      for (let i = 1; i < ranges.length; i += 1) {
        expect(ranges[i].start, kind).toBe(ranges[i - 1].end + 1);
      }
    }
  });

  it("names the four bars of a blues's first section, not three", () => {
    expect(sectionRanges({ kind: "blues12", bars: 12 })).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ]);
  });

  it("says which section a bar is in", () => {
    const blues = { kind: "blues12", bars: 12 } as const;
    expect(sectionIndexAt(blues, 0)).toBe(0);
    expect(sectionIndexAt(blues, 3)).toBe(0);
    expect(sectionIndexAt(blues, 4)).toBe(1);
    expect(sectionIndexAt(blues, 11)).toBe(2);
    // A bar past the end clamps rather than throwing: the engine is the one
    // counting bars, and a build that reports one we do not have must not
    // take the screen down.
    expect(sectionIndexAt(blues, 99)).toBe(2);
  });

  it("wraps when it steps past either end", () => {
    // The form is a circle, and the footswitch that walks it should be too.
    const aaba = { kind: "aaba32", bars: 32 } as const;
    expect(stepSection(aaba, 0, 1)).toEqual({ start: 8, end: 15 });
    expect(stepSection(aaba, 24, 1)).toEqual({ start: 0, end: 7 });
    expect(stepSection(aaba, 0, -1)).toEqual({ start: 24, end: 31 });
    // From the middle of a section, "previous" means the one before this one,
    // not the top of the one you are in. Both are defensible; this is the one
    // that lets two presses reach two different places.
    expect(stepSection(aaba, 12, -1)).toEqual({ start: 0, end: 7 });
  });
});

describe("which bars carry a fill", () => {
  const blues = 12;

  it("marks nothing at all when fills are off", () => {
    for (let i = 0; i < blues; i += 1) {
      expect(barHasFill({ index: i, total: blues, fills: false, fillEvery: 4 })).toBe(false);
    }
  });

  it("marks the last bar of the chorus and nothing else by default", () => {
    const marked = [];
    for (let i = 0; i < blues; i += 1) {
      if (barHasFill({ index: i, total: blues, fills: true })) marked.push(i + 1);
    }
    expect(marked).toEqual([12]);
  });

  it("counts from one, the way a player counts", () => {
    // "A fill every four bars" means bars 4, 8 and 12 — not 5, 9 and 13.
    const marked = [];
    for (let i = 0; i < blues; i += 1) {
      if (barHasFill({ index: i, total: blues, fills: true, fillEvery: 4 })) marked.push(i + 1);
    }
    expect(marked).toEqual([4, 8, 12]);
  });

  it("keeps the chorus end even when it is not a multiple", () => {
    // Eight into twelve does not go, and the fill that answers the crash on
    // the one still has to be there.
    const marked = [];
    for (let i = 0; i < blues; i += 1) {
      if (barHasFill({ index: i, total: blues, fills: true, fillEvery: 8 })) marked.push(i + 1);
    }
    expect(marked).toEqual([8, 12]);
  });
});
