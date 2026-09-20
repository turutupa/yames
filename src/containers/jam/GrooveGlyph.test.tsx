// The card's picture is the groove's own table, which is the whole point of
// it — and it is the table's DRUMS, three rows high, not everything the bar
// contains. The fifth pass put a percussionist on fifty-eight of the hundred
// and fifteen, so "the glyph ignores percussion" stopped being true by
// accident and started being a decision worth holding in place.
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { GROOVES, grooveById, grooveTickCount } from "../../jam/grooves";
import { JAM_PERC_LANES } from "../../jam/types";
import { GrooveGlyph } from "./GrooveGlyph";

afterEach(cleanup);

function dots(groove: Parameters<typeof GrooveGlyph>[0]["groove"]) {
  const { container } = render(<GrooveGlyph groove={groove} />);
  return container.querySelectorAll("circle").length;
}

describe("the groove glyph", () => {
  it("draws three rows and no more, percussion or not", () => {
    // Every tick of every row is drawn — a rest is a faint dot, not a gap —
    // so the count is exactly three rows wide.
    for (const id of ["rock8", "bossa", "latinSon", "funkGoGo"]) {
      const groove = grooveById(id);
      expect(dots(groove), id).toBe(3 * grooveTickCount(groove));
    }
  });

  it("draws the same picture for a groove with its percussion taken off", () => {
    // The strongest form of the rule: strip every percussion row and the
    // picture does not move. A glyph that changed would mean the shaker had
    // been getting into it somewhere.
    const groove = grooveById("latinSon");
    const bare = { ...groove.bar };
    for (const lane of JAM_PERC_LANES) delete bare[lane];
    const withRows = render(<GrooveGlyph groove={groove} />).container.innerHTML;
    cleanup();
    const without = render(<GrooveGlyph groove={{ ...groove, bar: bare }} />).container
      .innerHTML;
    expect(without).toBe(withRows);
  });

  it("gives every groove in the library a picture", () => {
    // Cheap, and it catches the one failure mode a data-driven glyph has: a
    // groove whose cymbal rows are both empty drawing nothing at all.
    for (const groove of GROOVES) {
      expect(dots(groove), groove.id).toBe(3 * grooveTickCount(groove));
      cleanup();
    }
  });
});
