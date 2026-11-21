/**
 * A Songs passage that has fallen due, for Today's line (c5a2, judgement call
 * 18; DESIGN 6.1: "Bars 17 to 24 of your song are due today."; said
 * "Bars 17 to 24 of {{song}} are due." since c5a2b, because the passage named
 * is often one that came due days ago, and no locale may say its day was today).
 *
 * What the store holds and nothing more: the passage the coach's "come back to
 * this" wrote down (`score_due`, `listDue`), the day it named, and the song's
 * own name. No streak, no "overdue", no "you forgot": a passage due on Tuesday
 * that is still there on Friday is due, and the sentence says that.
 *
 * - **One passage at most**: the one due longest ago (the lowest `dueDay`;
 *   on a tie, the song and then its bars, so the choice is stable). The order
 *   is Songs' own `compareSongDue`, so the passage named here is the one
 *   opening that song loops.
 * - **Printed bars**: a `ScoreDue` holds PLAYED-bar indices (the transport's
 *   numbering; repeats unrolled), and the sentence quotes the bars on the
 *   page via `printedBarNumber`. Not as `verdict.ts`'s `printedBarsOf` does
 *   (that maps the two endpoints): this takes the lowest and the highest
 *   printed bar over EVERY played bar in the range, so a passage across a
 *   repeat (played 3..6 over a repeat of 1..4) is "bars 2 to 5", and a D.S.
 *   jump from printed 7 to printed 1 is "bars 1 to 7". A range is never said
 *   backwards, at the cost of naming bars between the ends that were not in it.
 * - **A song since deleted is skipped**, and the next one tried; so is a row
 *   whose bars run past the song's current score (re-imported shorter), whose
 *   bar numbers would be made up (`useSongDue.ts`).
 */
import type { ScoreDue } from "../ipc";
import type { Line } from "../session/coachWords";
import { compareSongDue } from "../songs/due";
import { printedBarNumber } from "../songs/position";
import type { SongScore } from "../songs/types";

/** A due passage as the sentence says it: the song's name and printed bars, from 1. */
export type DuePassage = { song: string; from: number; to: number };

/**
 * The passages due on `today` or earlier, the one due longest ago first, of
 * songs still in the library. `today` is a local day number (`songs/due.ts`
 * `dayOf`), the unit `dueDay` is stored in.
 */
export function duePassagesOn(
  rows: readonly ScoreDue[] | null | undefined,
  library: ReadonlySet<string>,
  today: number,
): ScoreDue[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => Number.isFinite(row.dueDay) && row.dueDay <= today && library.has(row.scoreId))
    .sort((a, b) => compareSongDue(asSongDue(a), asSongDue(b)));
}

/** A row in the shape `compareSongDue` (Songs' own order) reads. */
function asSongDue(row: ScoreDue): { scoreId: string; startBar: number; endBar: number; dueDay: number } {
  return { scoreId: row.scoreId, startBar: row.rangeStartBar, endBar: row.rangeEndBar, dueDay: row.dueDay };
}

/** Played-bar indices (inclusive, from 0) as the printed bars they cover, from 1. */
export function printedPassage(score: SongScore, startBar: number, endBar: number): { from: number; to: number } {
  const first = Math.max(0, Math.min(startBar, endBar));
  const last = Math.max(startBar, endBar);
  let from = Infinity;
  let to = -Infinity;
  for (let played = first; played <= last; played += 1) {
    const printed = printedBarNumber(score, played);
    if (printed < from) from = printed;
    if (printed > to) to = printed;
  }
  return { from, to };
}

/** The sentence: "Bars 17 to 24 of {{song}} are due." or "Bar 9 of {{song}} is due." */
export function songDueLine(passage: DuePassage): Line {
  return passage.from === passage.to
    ? { key: "session.today.line.songDue.one", values: { bar: passage.from, song: passage.song } }
    : { key: "session.today.line.songDue.range", values: { from: passage.from, to: passage.to, song: passage.song } };
}
