/**
 * Where the band behind the selected bars is drawn.
 *
 * The one case that is easy to get wrong and impossible to see in a unit test
 * that does not draw: a selection that crosses a line break. Bars 7 to 10 of a
 * page that breaks after bar 8 is TWO rectangles — one ending at the right
 * margin, one starting at the left — and a single rectangle spanning both
 * would be a box drawn across the whole page and through the music between.
 */
import { describe, expect, it } from "vitest";
import { handleRects, selectionBands } from "./selectionBands";
import type { Rect } from "./selectionBands";

/** A page: four bars of 100px on one line, then four on the next. */
const PAGE: Record<number, Rect> = {
  0: { x: 0, y: 0, w: 100, h: 60 },
  1: { x: 100, y: 0, w: 100, h: 60 },
  2: { x: 200, y: 0, w: 100, h: 60 },
  3: { x: 300, y: 0, w: 100, h: 60 },
  4: { x: 0, y: 80, w: 100, h: 60 },
  5: { x: 100, y: 80, w: 100, h: 60 },
  6: { x: 200, y: 80, w: 100, h: 60 },
  7: { x: 300, y: 80, w: 100, h: 60 },
};

const boundsOf = (bar: number) => PAGE[bar] ?? null;

describe("the band behind a selection", () => {
  it("merges bars that sit side by side into one rectangle", () => {
    expect(selectionBands([{ from: 1, to: 3 }], boundsOf)).toEqual([
      { x: 100, y: 0, w: 300, h: 60 },
    ]);
  });

  it("is one rectangle per system when the selection crosses a line break", () => {
    const bands = selectionBands([{ from: 2, to: 5 }], boundsOf);
    expect(bands).toHaveLength(2);
    expect(bands[0]).toEqual({ x: 200, y: 0, w: 200, h: 60 });
    expect(bands[1]).toEqual({ x: 0, y: 80, w: 200, h: 60 });
  });

  it("covers three systems when it crosses two breaks", () => {
    const page = { ...PAGE, 8: { x: 0, y: 160, w: 100, h: 60 } };
    const bands = selectionBands([{ from: 3, to: 8 }], (bar) => page[bar] ?? null);
    expect(bands.map((b) => b.y)).toEqual([0, 80, 160]);
  });

  it("draws one bar as one rectangle", () => {
    expect(selectionBands([{ from: 5, to: 5 }], boundsOf)).toEqual([
      { x: 100, y: 80, w: 100, h: 60 },
    ]);
  });

  it("draws nothing for a bar the engraving does not have", () => {
    // A page alphaTab has not laid out, or a bar off the end of the score.
    // Nothing rather than a guess — the same rule the note lights keep.
    expect(selectionBands([{ from: 40, to: 42 }], boundsOf)).toEqual([]);
  });

  it("skips a missing bar without joining the two either side of it", () => {
    const holed = (bar: number) => (bar === 2 ? null : boundsOf(bar));
    const bands = selectionBands([{ from: 1, to: 3 }], holed);
    expect(bands).toEqual([
      { x: 100, y: 0, w: 100, h: 60 },
      { x: 300, y: 0, w: 100, h: 60 },
    ]);
  });

  it("keeps separate runs separate", () => {
    const bands = selectionBands([{ from: 0, to: 0 }, { from: 2, to: 2 }], boundsOf);
    expect(bands).toHaveLength(2);
  });
});

describe("the handles", () => {
  it("are at the two ends of the whole selection, not of every system", () => {
    // A handle on every line would be six things to grab for one range with
    // two ends.
    const bands = selectionBands([{ from: 2, to: 5 }], boundsOf);
    const handles = handleRects(bands)!;
    expect(Math.round(handles.start.x + handles.start.w / 2)).toBe(200);
    expect(Math.round(handles.end.x + handles.end.w / 2)).toBe(200);
    expect(handles.start.y).toBe(0);
    expect(handles.end.y).toBe(80);
  });

  it("are wide enough to grab", () => {
    const handles = handleRects(selectionBands([{ from: 1, to: 1 }], boundsOf))!;
    expect(handles.start.w).toBeGreaterThanOrEqual(8);
  });

  it("are nothing when nothing is selected", () => {
    expect(handleRects([])).toBeNull();
  });
});
