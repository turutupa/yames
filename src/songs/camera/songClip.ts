/**
 * The song's own arithmetic behind a clip of it (W33 item 4).
 *
 * `src/takes/clip.ts` is where all of this used to live, and W32 said at the
 * time why it stayed: it was in the middle of a `git mv` that had to read as
 * a pure rename so another worker's edits would carry across, and splitting a
 * file is not a rename. Both branches have landed, so here is the split.
 *
 * What is left in `takes/` is the FRAME — how big a clip is, where the
 * picture, the band, the caption and the Yames mark go at each shape. None of
 * that knows what is being recorded, which is the whole reason Jam could use
 * it without a score anywhere near it.
 *
 * This is the other half, and every line of it takes a `SongScore`: how much
 * of a piece is on the strip at once, which notes and bar lines are on it at
 * a given moment, what tempo was in force, what the caption says, and which
 * stretch of the take a clip is of.
 *
 * ## One clock, and it is the tape's
 *
 * Everything here is in **transport milliseconds**, exactly as `tape.ts` is:
 * time since beat 0 of the first pass of the played range, at the click's own
 * tempo. The review, the tape and the clip are then three drawings of one
 * number, and a clip cannot drift from the screen it was made on.
 */
import { barLengthMs } from "./tape";
import type { Tape, TapeTick } from "./tape";
import { msAtBeat } from "../../takes/offset";
import { clampRange, rangeTempoSteps } from "../schedule";
import type { BarRange } from "../schedule";
import { printedBarNumber } from "../position";
import type { SongScore } from "../types";
import type { ClipCaption } from "../../takes/clip";

/**
 * How much of the take is on the strip at once.
 *
 * Four bars, measured off the first bar of the range — a fixed number of
 * MILLISECONDS rather than a window recomputed per tempo step, because a
 * window that breathed with the tempo map would make the notes appear to
 * speed up and slow down independently of the music, which is the one thing a
 * scrolling excerpt must not do. Four is what a guitarist reads ahead.
 */
export const WINDOW_BARS = 4;

export function clipWindowMs(
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
): number {
  const clamped = clampRange(score, range);
  const bar = barLengthMs(score, clamped, tempoPercent, clamped.startBar);
  // A score with one zero-length bar in it is a file, not an impossibility.
  return Math.max(1000, bar * WINDOW_BARS);
}

/** A note on the strip: which mark, and where along it, 0 at the left edge. */
export type ClipTick = { tick: TapeTick; at: number };

/**
 * The notes on the strip right now, with the playhead at the middle.
 *
 * Half a window either side, and the slice is taken from the tape's own
 * ascending order — so a forty-bar loop costs a scan of the ticks and not a
 * sort, once per frame, on a thread that is also encoding video.
 */
export function visibleTicks(tape: Tape, nowMs: number, windowMs: number): ClipTick[] {
  const half = windowMs / 2;
  const out: ClipTick[] = [];
  for (const tick of tape.ticks) {
    if (tick.atMs < nowMs - half) continue;
    if (tick.atMs > nowMs + half) break;
    out.push({ tick, at: (tick.atMs - (nowMs - half)) / windowMs });
  }
  return out;
}

/**
 * The bar lines on the strip right now, same axis.
 *
 * `headAt` is where the playhead is across the strip: the middle for the dots
 * and a jam, a third of the way in for the tab (W31). One axis for all three,
 * because two definitions of "where along the strip" is how a bar line and
 * the note that opens it end up in different places.
 */
export function visibleBars(
  tape: Tape,
  nowMs: number,
  windowMs: number,
  headAt = 0.5,
): { printedBar: number; section: string | null; at: number }[] {
  const from = nowMs - headAt * windowMs;
  return tape.bars
    .filter((bar) => bar.atMs >= from && bar.atMs <= from + windowMs)
    .map((bar) => ({
      printedBar: bar.printedBar,
      section: bar.section,
      at: (bar.atMs - from) / windowMs,
    }));
}

/**
 * The tempo in force at a moment inside one pass.
 *
 * Each step is a beat and a BPM (`rangeTempoSteps`), so the milliseconds a
 * step occupies is the beats it spans at its own BPM, and walking the list
 * accumulating that is the whole of it. The last step runs to the end of the
 * range and is what any moment past the final boundary gets.
 */
export function bpmAtMs(steps: readonly { beat: number; bpm: number }[], ms: number): number {
  if (steps.length === 0) return 0;
  let at = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const next = steps[i + 1];
    if (!next) return step.bpm;
    at += ((next.beat - step.beat) * 60_000) / (step.bpm || 1);
    if (ms < at) return step.bpm;
  }
  return steps[steps.length - 1].bpm;
}

/**
 * Bar, section and tempo, at one moment.
 *
 * The bar is the last bar LINE at or before now, which is the bar you are in
 * — not the nearest, which would call the second half of a bar by the next
 * one's number. The section is the last one named at or before now and
 * persists until another is, because that is what a section is.
 *
 * The tempo is read off the range's own steps rather than off the score's
 * tempo map, so a clip of a passage being practised at 70 % says 77 BPM —
 * the number the player was actually hearing, which is the only honest one to
 * put on a clip they are about to show somebody.
 */
export function captionAt(
  tape: Tape,
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
  nowMs: number,
): ClipCaption {
  const clamped = clampRange(score, range);
  let printedBar = printedBarNumber(score, clamped.startBar);
  let section: string | null = null;
  for (const bar of tape.bars) {
    if (bar.atMs > nowMs + 1) break;
    printedBar = bar.printedBar;
    if (bar.section) section = bar.section;
  }
  // The section a pass OPENS in: the loop's first bar may be in the middle of
  // one the tape never draws a line for.
  if (section === null) {
    for (const named of score.sections) {
      if (named.startBar <= clamped.startBar && clamped.startBar <= named.endBar) {
        section = named.name;
        break;
      }
    }
  }

  const steps = rangeTempoSteps(score, clamped, tempoPercent);
  // Inside one time round the range: a tempo map repeats with the loop.
  const within = tape.passMs > 0 ? nowMs % tape.passMs : nowMs;
  const bpm = bpmAtMs(steps, within);
  return { printedBar, section, bpm: Math.round(bpm) };
}

/**
 * The stretch of the take a clip is of, in transport milliseconds.
 *
 * `bars` is the portion the player chose, counted as played-bar indices — the
 * review's own selection by default, which is the passage they have been
 * working on and the one they would want to show. `pass` picks one time round
 * a loop; a clip of the same four bars played six times is a clip nobody
 * watches to the end.
 */
export function clipSpan(args: {
  tape: Tape;
  score: SongScore;
  range: BarRange;
  tempoPercent: number;
  bars: BarRange | null;
  pass: number | null;
}): { startMs: number; endMs: number } {
  const { tape, score, range, tempoPercent, bars, pass } = args;
  const clamped = clampRange(score, range);
  const base = (pass ?? 0) * tape.passMs;
  if (!bars) {
    return pass === null
      ? { startMs: 0, endMs: tape.lengthMs }
      : { startMs: base, endMs: base + tape.passMs };
  }
  const steps = rangeTempoSteps(score, clamped, tempoPercent);
  const ticksPerQuarter = score.ticksPerQuarter || 960;
  const first = score.bars[clamped.startBar]?.startTick ?? 0;
  const msAt = (bar: number, end: boolean) => {
    const held = score.bars[Math.min(Math.max(bar, clamped.startBar), clamped.endBar)];
    if (!held) return 0;
    const tick = end ? held.startTick + held.lengthTicks : held.startTick;
    return msAtBeat(steps, (tick - first) / ticksPerQuarter);
  };
  return { startMs: base + msAt(bars.startBar, false), endMs: base + msAt(bars.endBar, true) };
}

