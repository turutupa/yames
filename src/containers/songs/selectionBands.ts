/**
 * Where the band behind the selected bars is drawn.
 *
 * The selection has to be visible all the time — that is the owner's
 * requirement, not a nicety: a portion you cannot see is a portion you cannot
 * trust, and "why is it playing those bars?" is the question a highlight that
 * only appears while you drag invites.
 *
 * A selection is a run of printed bars, and a run of printed bars is one
 * rectangle per STAFF SYSTEM it crosses — bars 7 to 10 of a page that breaks
 * after bar 8 is two rectangles, one ending at the right margin and one
 * starting at the left. This file is the arithmetic for that, kept pure and
 * away from alphaTab so it can be tested without an engraving: the caller
 * hands it a way of asking where a printed bar is, and gets back the
 * rectangles to draw.
 */

/** A box in the engraving's own coordinate space. */
export type Rect = { x: number; y: number; w: number; h: number };

/** Same system, if their tops are within this. Sub-pixel scaling, mostly. */
const SAME_SYSTEM_PX = 2;

/**
 * The rectangles covering a set of printed-bar runs.
 *
 * Bars that sit side by side on one system are merged into one rectangle, so
 * a four-bar selection on one line is one band rather than four with hairline
 * seams down it. A bar the engraving has not drawn — off the end of the
 * score, or a page alphaTab has not laid out — contributes nothing, which is
 * the same rule the note lights keep: a reference that does not resolve draws
 * nothing rather than guessing.
 */
export function selectionBands(
  runs: readonly { from: number; to: number }[],
  boundsOf: (printedBar: number) => Rect | null,
): Rect[] {
  const out: Rect[] = [];
  let open: Rect | null = null;
  /** The printed bar the open rectangle currently ends on. */
  let openBar = -2;

  for (const run of runs) {
    for (let bar = run.from; bar <= run.to; bar++) {
      const box = boundsOf(bar);
      if (!box) continue;
      const joins =
        open !== null &&
        bar === openBar + 1 &&
        Math.abs(box.y - open.y) <= SAME_SYSTEM_PX &&
        box.x >= open.x;
      if (joins) {
        const right = Math.max(open!.x + open!.w, box.x + box.w);
        open!.w = right - open!.x;
        open!.h = Math.max(open!.h, box.h);
        openBar = bar;
        continue;
      }
      if (open) out.push(open);
      open = { x: box.x, y: box.y, w: box.w, h: box.h };
      openBar = bar;
    }
  }
  if (open) out.push(open);
  return out;
}

/**
 * Where the two handles go: the left edge of the first band, the right edge
 * of the last.
 *
 * Only the ends, even when the selection crosses three systems — a handle on
 * every line would be six things to grab for one range with two ends, and the
 * two that mean something are where it starts and where it stops.
 */
export function handleRects(bands: readonly Rect[]): { start: Rect; end: Rect } | null {
  if (bands.length === 0) return null;
  const first = bands[0];
  const last = bands[bands.length - 1];
  /** Wide enough to grab with a mouse; narrow enough not to hide a note. */
  const width = 10;
  return {
    start: { x: first.x - width / 2, y: first.y, w: width, h: first.h },
    end: { x: last.x + last.w - width / 2, y: last.y, w: width, h: last.h },
  };
}
