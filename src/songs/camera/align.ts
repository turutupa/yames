/**
 * Two takes of the same bars, on one axis — and the axis is BARS.
 *
 * `W21-CAMERA.md` addendum 11. Then-and-now plays a run from March beside the
 * one you just did, and the whole difficulty is in one sentence: **their
 * tempos differ**. March was at 70 %, tonight is at 95 %, so bar 19 arrives
 * eleven seconds into one recording and eight into the other. Lock them to
 * seconds and they are two different passages; lock them to bars and they are
 * the same passage twice.
 *
 * So this file is the conversion, both ways, and nothing else: a moment in a
 * take's own milliseconds becomes a fractional played-bar index, and a bar
 * position becomes the moment that take reached it. Pure arithmetic over the
 * score's bar table and the range's own tempo steps, with no clock and no
 * DOM, which is what makes `align.test.ts` able to ask the question that
 * matters — the same bar position lands on the same MUSIC in two passes
 * played at different speeds.
 *
 * ## Fractional, and why
 *
 * `18.5` is the middle of played bar 18. Whole numbers alone would be enough
 * to line the two up at bar lines, which is where the comparison re-syncs —
 * but the playhead has to be drawn somewhere between them, and a mark that
 * jumped a bar at a time would be a mark nobody could read against the music.
 */
import { msAtBeat, beatAtMs } from "../../takes/offset";
import { clampRange, rangeTempoSteps } from "../schedule";
import type { BarRange } from "../schedule";
import type { SongScore } from "../types";

/**
 * Where two runs at a song agree.
 *
 * `null` when they do not overlap at all, which the store's own query makes
 * unlikely and does not make impossible: `bar_range` selects attempts that
 * overlap the REVIEW's range, and a caller could hand this two of them that
 * overlap that range at opposite ends.
 */
export function overlapOf(a: BarRange, b: BarRange): BarRange | null {
  const startBar = Math.max(a.startBar, b.startBar);
  const endBar = Math.min(a.endBar, b.endBar);
  return startBar > endBar ? null : { startBar, endBar };
}

/** The tick a bar position stands for, fractions and all. */
function tickAtBar(score: SongScore, bar: number): number {
  const index = Math.floor(bar);
  const entry = score.bars[Math.max(0, Math.min(score.bars.length - 1, index))];
  if (!entry) return 0;
  const fraction = Math.max(0, Math.min(1, bar - index));
  return entry.startTick + fraction * entry.lengthTicks;
}

/**
 * A moment in one take, as a bar position.
 *
 * `ms` is transport milliseconds for THAT take — time since beat 0 of the
 * first pass of ITS range, at ITS tempo — which is the axis `tape.ts` works
 * in and the one the review's own player reads.
 */
export function barAtMs(
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
  ms: number,
): number {
  const clamped = clampRange(score, range);
  const steps = rangeTempoSteps(score, clamped, tempoPercent);
  const ticksPerQuarter = score.ticksPerQuarter || 960;
  const first = score.bars[clamped.startBar]?.startTick ?? 0;
  const tick = first + beatAtMs(steps, ms) * ticksPerQuarter;

  // Walked rather than searched: a range is bars, not thousands of them, and
  // a linear walk is exact where a binary search over floating ticks has an
  // edge case at every bar line.
  for (let bar = clamped.startBar; bar <= clamped.endBar; bar++) {
    const entry = score.bars[bar];
    if (!entry || entry.lengthTicks <= 0) continue;
    if (tick < entry.startTick + entry.lengthTicks) {
      const fraction = Math.max(0, (tick - entry.startTick) / entry.lengthTicks);
      return bar + Math.min(1, fraction);
    }
  }
  // Past the end of the range: the end of the last bar, and no further.
  return clamped.endBar + 1;
}

/**
 * ...and back: where that take was when it reached this bar position.
 *
 * Clamped to the range, so asking a take about a bar it never played gets the
 * nearest moment it did rather than a negative time or a seek past the end.
 */
export function msAtBar(
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
  bar: number,
): number {
  const clamped = clampRange(score, range);
  const steps = rangeTempoSteps(score, clamped, tempoPercent);
  const ticksPerQuarter = score.ticksPerQuarter || 960;
  const first = score.bars[clamped.startBar]?.startTick ?? 0;
  const held = Math.max(clamped.startBar, Math.min(clamped.endBar + 1, bar));
  // `endBar + 1` is the END of the range and not a bar of it: the bar at that
  // index may not have been played, or may not exist. Anything short of it —
  // 3.99 of a four-bar range — is an ordinary position inside the last bar.
  const tick =
    held >= clamped.endBar + 1
      ? (score.bars[clamped.endBar]?.startTick ?? first) +
        (score.bars[clamped.endBar]?.lengthTicks ?? 0)
      : tickAtBar(score, held);
  return msAtBeat(steps, Math.max(0, (tick - first) / ticksPerQuarter));
}

/**
 * How long one take's crossing of a bar takes — for the follower's snap.
 *
 * The comparison re-syncs at bar lines, and knowing how long a bar lasts on
 * each side is what says whether a snap is a correction of a few milliseconds
 * or a jump a person will hear.
 */
export function barSpanMs(
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
  bar: number,
): number {
  return (
    msAtBar(score, range, tempoPercent, Math.floor(bar) + 1) -
    msAtBar(score, range, tempoPercent, Math.floor(bar))
  );
}
