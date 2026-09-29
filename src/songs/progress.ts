/**
 * How a passage has gone, over the days it has been played (`COACH_UX.md` C3).
 *
 * The `progress` block asks a question the catalogue deliberately does not
 * answer for itself — "one passage, over the days it has been played" — and
 * W12 left it unsupplied because nothing had decided what a point on that line
 * IS. The orchestrator decided, and this file is that decision written down:
 *
 * **A point is the attempt's stored `score`.** The same number the player is
 * shown at the end of a pass, the same number the history screen shows, the
 * same number `findings.rs` compares when it says something improved. A
 * second, prettier number invented for a chart is a number the player can
 * read off two screens and get two answers from, and the chart is the one
 * they would trust least.
 *
 * **One point per day, and it is the best of that day.** A practice session
 * is five or six goes at the same eight bars, most of them worse than the
 * best, and a chart with all of them on it is a sawtooth that says nothing
 * except that the player was practising. The best of a day is what the day
 * was worth: it is the tempo you can now play it at, not the average of your
 * warm-ups. Days rather than sessions, in the player's own timezone, for the
 * same reason `due.ts` counts days — a calendar is what a person remembers in.
 *
 * **Oldest first**, which is also the order `query_attempts` answers in, so
 * the line reads left to right the way the weeks went.
 *
 * Pure, and tested as such: no store, no React, no clock of its own beyond
 * the timezone the dates are read in.
 */
import { dayOf } from "./due";

/** One reading of a passage, on one day. `percent` is 0–100. */
export type ProgressPoint = { at: string; percent: number };

/**
 * As much of a stored attempt as a line needs.
 *
 * Structural rather than `ipc.ts`'s `Attempt`, so the arithmetic can be
 * tested without a wire type and so a row gaining a field never reaches here.
 */
export type ScoredAttempt = {
  /** Epoch milliseconds. */
  startedAt: number;
  /** Played-bar indices, inclusive. */
  rangeStartBar: number;
  rangeEndBar: number;
  /** The attempt's own score, 0–100. */
  score: number;
};

/** `2026-09-20`, the player's own calendar day. */
export function dayLabel(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Does an attempt have anything to say about these bars?
 *
 * Overlap and not equality, the same rule `AttemptQuery.bar_range` keeps: a
 * full run-through of the song did cover bars 17–24, and a player asking how
 * those eight bars have gone should see it. An attempt at bars 1–8 has
 * nothing to say about bars 17–24 and is not on the line.
 */
function overlaps(attempt: ScoredAttempt, fromBar: number, toBar: number): boolean {
  return attempt.rangeStartBar <= toBar && attempt.rangeEndBar >= fromBar;
}

/**
 * The line, for one passage.
 *
 * `fromBar` and `toBar` are PLAYED bar indices counted from 0 — the
 * transport's numbering, the store's numbering. A block counts its bars from
 * 1 and the caller converts; doing it here would put the conversion in two
 * places and neither would be obviously the wrong one.
 */
export function progressPoints(
  attempts: readonly ScoredAttempt[],
  fromBar: number,
  toBar: number,
): ProgressPoint[] {
  const best = new Map<number, number>();
  for (const attempt of attempts) {
    if (!overlaps(attempt, fromBar, toBar)) continue;
    if (!Number.isFinite(attempt.score)) continue;
    const day = dayOf(new Date(attempt.startedAt));
    const soFar = best.get(day);
    if (soFar === undefined || attempt.score > soFar) best.set(day, attempt.score);
  }
  return [...best.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, percent]) => ({ at: dayLabel(day), percent }));
}
