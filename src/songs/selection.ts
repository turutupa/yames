/**
 * The portion of a song you are working on.
 *
 * The owner, 2026-09-20: *"Being able to select a portion of a song so it
 * plays that portion in repeat is super critical for song learning."* It is
 * the centre of the mode — everything else on the stage is a way of adjusting
 * it or a way of hearing it — so the model lives here, pure, and the drawing,
 * the pointer and the engine are three separate files that agree with it.
 *
 * ## One selection, four doors
 *
 * Dragging across the tab, typing two bar numbers, pressing a section chip and
 * pressing a footswitch all write the same thing: a `BarRange`, or nothing.
 * There is no second idea of "what is selected" anywhere, and that is
 * deliberate — a tab that highlighted bars 5–8 while the fields said 1–32 is
 * two features arguing in front of a player who only has one passage in mind.
 *
 * ## Played bars and printed bars
 *
 * The engine, the schedule and the cursor all count PLAYED bars: repeats are
 * unrolled, so a song with a first-time bar 8 has two of them. The engraving
 * on the stage draws each bar ONCE, so it counts printed bars. A selection is
 * kept in played bars, because that is what loops; it is drawn over printed
 * ones, because that is what is on the page.
 *
 * Two functions cross that line and nothing else does:
 * `playedBarOfPrinted` (what did they click on?) and `printedRunsOfRange`
 * (where do I draw it?). Both follow `tabGroups.ts`'s rule for the same
 * reason: a repeated bar is drawn once, and the first played bar to claim it
 * keeps it, so the answer does not depend on which way round the pass went.
 */
import { clampRange, wholeSong } from "./schedule";
import type { BarRange } from "./schedule";
import type { SongScore } from "./types";

export type { BarRange };

/**
 * A selection being dragged out.
 *
 * `anchor` is where the pointer went down and does not move; `focus` follows
 * it. Kept as two ends rather than as a sorted range because dragging back
 * past the anchor has to turn the selection round rather than collapse it —
 * which is what a range sorted on every pointer move would do.
 *
 * `edge` is set when the drag began on one of the two handles: then the
 * anchor is the OTHER end, and the handle is what follows the pointer.
 */
export type SelectionDrag = {
  anchorBar: number;
  focusBar: number;
  /** Which end the pointer took hold of, for a drag that began on a handle. */
  edge: "start" | "end" | null;
  /** True once the pointer has actually moved to a different bar. */
  moved: boolean;
};

/** A portion the player named and kept. Stored per song beside the mix. */
export type SavedPortion = {
  id: string;
  name: string;
  startBar: number;
  endBar: number;
  /** The speed this passage is worked at, 50–100. */
  tempoPercent: number;
};

/** The range a drag currently describes, the right way round. */
export function dragRange(drag: SelectionDrag): BarRange {
  return {
    startBar: Math.min(drag.anchorBar, drag.focusBar),
    endBar: Math.max(drag.anchorBar, drag.focusBar),
  };
}

/**
 * A pointer went down on a bar. What drag does that start?
 *
 * Three gestures, and they are told apart by what was already selected and
 * which modifier is down:
 *
 * - **On a handle** — the drag takes that end and anchors the other, so
 *   pulling the left handle past the right one turns the selection round
 *   rather than snapping it shut.
 * - **Shift** — extend what is there. The anchor is whichever end is further
 *   from the bar pressed, which is what every text editor does and what a
 *   player expects: shift-clicking bar 30 with 5–8 selected gives 5–30, not
 *   8–30.
 * - **Plain** — a new selection starting and ending on that bar. One bar is a
 *   legitimate selection; a player looping one bar of a run is the whole
 *   point of the feature.
 */
export function beginDrag(
  bar: number,
  options: { shiftKey?: boolean; handle?: "start" | "end" | null; current?: BarRange | null } = {},
): SelectionDrag {
  const { shiftKey = false, handle = null, current = null } = options;

  if (handle && current) {
    return {
      anchorBar: handle === "start" ? current.endBar : current.startBar,
      focusBar: bar,
      edge: handle,
      moved: false,
    };
  }

  if (shiftKey && current) {
    const fromStart = Math.abs(bar - current.startBar);
    const fromEnd = Math.abs(bar - current.endBar);
    const anchor = fromStart >= fromEnd ? current.startBar : current.endBar;
    return { anchorBar: anchor, focusBar: bar, edge: null, moved: true };
  }

  return { anchorBar: bar, focusBar: bar, edge: null, moved: false };
}

/**
 * The pointer moved over a bar.
 *
 * `moved` latches on the first bar that is not the one the drag began on, and
 * that is what tells a drag from a click when the pointer comes up. A drag
 * that never left its bar is a click, and a click selects that one bar — so
 * both do the same thing here and the flag only matters to a caller that
 * wants to know which gesture it was.
 */
export function dragTo(drag: SelectionDrag, bar: number): SelectionDrag {
  if (bar === drag.focusBar) return drag;
  return { ...drag, focusBar: bar, moved: true };
}

/** Hold a selection inside the song. A range past the end is the last bar. */
export function clampSelection(score: SongScore, range: BarRange): BarRange {
  return clampRange(score, range);
}

/** Does this range cover the whole song — that is, is nothing chosen? */
export function isWholeSong(score: SongScore, range: BarRange | null): boolean {
  if (!range) return true;
  const all = wholeSong(score);
  return range.startBar <= all.startBar && range.endBar >= all.endBar;
}

/**
 * Slide the selection by whole bars, keeping its length.
 *
 * It stops at the ends rather than shortening: a player nudging a four-bar
 * loop towards the start of the song wants four bars all the way, not a loop
 * that quietly becomes one bar at bar zero.
 */
export function nudgeRange(score: SongScore, range: BarRange, bars: number): BarRange {
  const last = Math.max(0, score.bars.length - 1);
  const length = range.endBar - range.startBar;
  const start = Math.min(Math.max(0, range.startBar + bars), Math.max(0, last - length));
  return { startBar: start, endBar: Math.min(last, start + length) };
}

/** Move one end of the selection to a bar, turning it round if it passes. */
export function setEdge(
  score: SongScore,
  range: BarRange | null,
  edge: "start" | "end",
  bar: number,
): BarRange {
  const base = range ?? { startBar: bar, endBar: bar };
  const next = edge === "start" ? { startBar: bar, endBar: base.endBar } : { startBar: base.startBar, endBar: bar };
  return clampSelection(score, next);
}

/**
 * Which played bar a printed bar means.
 *
 * The first one, which is `tabGroups.ts`'s rule: a bar inside a repeat is
 * drawn once and two played bars point at it, and the first to claim it keeps
 * it so the answer never depends on the direction of travel. Null when the
 * printed bar belongs to no played bar at all, which a score with an empty
 * ending can produce.
 */
export function playedBarOfPrinted(score: SongScore, printedBar: number): number | null {
  for (let i = 0; i < score.bars.length; i++) {
    if (score.bars[i].printedBar === printedBar) return i;
  }
  return null;
}

/** The printed bar a played bar is drawn as. */
export function printedBarOfPlayed(score: SongScore, playedBar: number): number | null {
  return score.bars[playedBar]?.printedBar ?? null;
}

/**
 * The printed bars a played range covers, as contiguous runs.
 *
 * Runs rather than a flat list because the band behind the selection is drawn
 * as rectangles, and a run of printed bars 5..8 is one rectangle per staff
 * system rather than four. A range that crosses a repeat covers the same
 * printed bars twice and is reported once — the page has one of them on it.
 */
export function printedRunsOfRange(
  score: SongScore,
  range: BarRange,
): { from: number; to: number }[] {
  const { startBar, endBar } = clampSelection(score, range);
  const printed = new Set<number>();
  for (let i = startBar; i <= endBar; i++) {
    const bar = score.bars[i];
    if (bar) printed.add(bar.printedBar);
  }
  const sorted = [...printed].sort((a, b) => a - b);
  const runs: { from: number; to: number }[] = [];
  for (const bar of sorted) {
    const last = runs[runs.length - 1];
    if (last && bar === last.to + 1) last.to = bar;
    else runs.push({ from: bar, to: bar });
  }
  return runs;
}

/** A portion's range, clamped to the song it was saved against. */
export function portionRange(score: SongScore, portion: SavedPortion): BarRange {
  return clampSelection(score, { startBar: portion.startBar, endBar: portion.endBar });
}

/** A new id for a saved portion. `crypto.randomUUID` where there is one. */
export function newPortionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `portion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The most a song may keep. Enough for a piece; not a list you scroll. */
export const MAX_SAVED_PORTIONS = 12;

/**
 * Add a portion, or replace the one with the same name.
 *
 * Replacing rather than appending: a player who saves "Solo" twice meant to
 * correct it, and two chips called Solo is a list nobody can use. Oldest goes
 * when the shelf is full, because the useful ones get re-saved.
 */
export function addPortion(
  portions: readonly SavedPortion[],
  portion: SavedPortion,
): SavedPortion[] {
  const name = portion.name.trim().toLowerCase();
  const without = portions.filter((p) => p.name.trim().toLowerCase() !== name);
  const next = [...without, portion];
  return next.slice(Math.max(0, next.length - MAX_SAVED_PORTIONS));
}

export function renamePortion(
  portions: readonly SavedPortion[],
  id: string,
  name: string,
): SavedPortion[] {
  const trimmed = name.trim();
  if (!trimmed) return [...portions];
  return portions.map((p) => (p.id === id ? { ...p, name: trimmed } : p));
}

export function removePortion(portions: readonly SavedPortion[], id: string): SavedPortion[] {
  return portions.filter((p) => p.id !== id);
}
