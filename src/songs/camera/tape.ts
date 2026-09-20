/**
 * The tape: the whole pass laid out in time, with the verdict painted on it.
 *
 * `W21-CAMERA.md` item 6. Under the picture there is a strip the width of the
 * take, and on it is every note the player was asked for, in the colour and
 * the glyph the review already uses for it (`review/marks.ts`), the notes they
 * played that were not asked for, the bar lines, the section names and the
 * joins between passes. Drag it and the picture moves; press "next slip" and
 * the picture jumps to half a bar before the next mistake.
 *
 * This file is the model for all of that and nothing else: pure arithmetic
 * over the review the coach already produced, with no React, no clock and no
 * DOM. One function in, one object out, and it is tested as one.
 *
 * ## One clock, and which one it is
 *
 * Everything here is in **transport milliseconds**: time since beat 0 of the
 * first pass of the played range, at the click's own tempo, integrated over
 * the score's tempo steps. That is the axis the picture, the tape, the moving
 * mark on the excerpt and the take's own audio are all converted to and from
 * (`TakeVideoView`), because the alternative — each of the four holding its
 * own idea of "now" — is four things that agree until the first tempo step.
 */
import { markFor } from "../../containers/songs/review/marks";
import type { TimingMark } from "../../containers/songs/review/marks";
import { isWrong } from "../../containers/songs/review/marks";
import { msAtBeat, passLengthMs } from "./offset";
import { barAtBeatInRange, printedBarNumber } from "../position";
import { clampRange, rangeTempoSteps } from "../schedule";
import type { BarRange } from "../schedule";
import type { ScoreSchedule, SongScore } from "../types";
import type { OnsetResult } from "../types";
import type { TimingBands } from "../../ipc";

/** One note of the score, where it fell and how it went. */
export type TapeTick = {
  onsetId: number;
  /** Transport milliseconds from beat 0 of the first pass. */
  atMs: number;
  pass: number;
  /** Played bar index, and what the page calls it. */
  bar: number;
  printedBar: number;
  mark: TimingMark;
  /** How early or late, in milliseconds. `null` when it was not played. */
  deviationMs: number | null;
};

/** A note that was played and not asked for. */
export type TapeExtra = { atMs: number; pass: number };

/** A bar line, and the section it opens when it opens one. */
export type TapeBar = {
  atMs: number;
  pass: number;
  printedBar: number;
  /** The section starting here, or null. */
  section: string | null;
  /** This bar opens a pass. */
  passStart: boolean;
};

export type Tape = {
  /** How long the whole attempt was, in transport milliseconds. */
  lengthMs: number;
  /** One time round the range. */
  passMs: number;
  passes: number[];
  ticks: TapeTick[];
  extras: TapeExtra[];
  bars: TapeBar[];
  /**
   * Where the mistakes are, ascending — what "next slip" walks.
   *
   * A slip is a note the review would have the player look at: missed, or far
   * enough either side of the beat to have earned a double caret. A note that
   * was a little early is not a slip; a tape that stopped at every one of
   * those would stop at half the notes in the piece and mean nothing.
   */
  slips: number[];
};

/** The tape for one attempt. */
export function buildTape(args: {
  score: SongScore;
  schedule: ScoreSchedule;
  range: BarRange;
  tempoPercent: number;
  results: readonly OnsetResult[];
  extras: readonly { beat: number; pass: number }[];
  bands: TimingBands | null;
}): Tape {
  const { score, schedule, range, tempoPercent, results, extras, bands } = args;
  const steps = rangeTempoSteps(score, range, tempoPercent);
  const passMs = passLengthMs(score, range, tempoPercent);
  const clamped = clampRange(score, range);

  const beatOf = new Map(schedule.onsets.map((onset) => [onset.id, onset.beat]));

  let maxPass = 0;
  for (const r of results) if (r.pass > maxPass) maxPass = r.pass;
  for (const e of extras) if (e.pass > maxPass) maxPass = e.pass;
  const passes = Array.from({ length: maxPass + 1 }, (_, i) => i);

  const at = (pass: number, beat: number) => pass * passMs + msAtBeat(steps, beat);

  const ticks: TapeTick[] = [];
  for (const result of results) {
    const beat = beatOf.get(result.id);
    if (beat === undefined) continue;
    const bar = barAtBeatInRange(score, clamped, beat);
    ticks.push({
      onsetId: result.id,
      atMs: at(result.pass, beat),
      pass: result.pass,
      bar,
      printedBar: printedBarNumber(score, bar),
      mark: markFor(result, bands),
      deviationMs: result.deviationMs,
    });
  }
  ticks.sort((a, b) => a.atMs - b.atMs);

  const tapeExtras: TapeExtra[] = extras
    .map((extra) => ({ atMs: at(extra.pass, extra.beat), pass: extra.pass }))
    .sort((a, b) => a.atMs - b.atMs);

  /** Where each section starts, by played bar. */
  const sectionAt = new Map<number, string>();
  for (const section of score.sections) sectionAt.set(section.startBar, section.name);

  const bars: TapeBar[] = [];
  for (const pass of passes) {
    for (let bar = clamped.startBar; bar <= clamped.endBar; bar++) {
      const entry = score.bars[bar];
      if (!entry) continue;
      const beat =
        (entry.startTick - (score.bars[clamped.startBar]?.startTick ?? 0)) /
        (score.ticksPerQuarter || 960);
      bars.push({
        atMs: at(pass, beat),
        pass,
        printedBar: printedBarNumber(score, bar),
        section: sectionAt.get(bar) ?? null,
        passStart: bar === clamped.startBar,
      });
    }
  }

  const slips = ticks.filter((tick) => isWrong(tick.mark)).map((tick) => tick.atMs);

  return {
    lengthMs: Math.max(passMs * passes.length, ticks.length ? ticks[ticks.length - 1].atMs : 0),
    passMs,
    passes,
    ticks,
    extras: tapeExtras,
    bars,
    slips,
  };
}

/** How long one bar of the range lasts, for the "half a bar before" jump. */
export function barLengthMs(
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
  bar: number,
): number {
  const steps = rangeTempoSteps(score, range, tempoPercent);
  const clamped = clampRange(score, range);
  const entry = score.bars[Math.min(Math.max(bar, clamped.startBar), clamped.endBar)];
  const start = score.bars[clamped.startBar]?.startTick ?? 0;
  if (!entry) return 0;
  const ticksPerQuarter = score.ticksPerQuarter || 960;
  const from = (entry.startTick - start) / ticksPerQuarter;
  const to = (entry.startTick + entry.lengthTicks - start) / ticksPerQuarter;
  return msAtBeat(steps, to) - msAtBeat(steps, from);
}

/**
 * The next mistake after this moment, or the one before it.
 *
 * Two numbers come back, and the difference between them is the whole point:
 * `slipMs` is where the wrong note IS, and `atMs` is where to put the picture
 * — half a bar earlier, because a teacher rewinding to a mistake rewinds to
 * just before it, so the player sees the hand arrive at it. Landing exactly on
 * the note shows the consequence and hides the cause.
 *
 * The caller searches from the last SLIP it landed on rather than from where
 * the picture now is, and that is not a detail: the lead puts the playhead
 * before the note it just jumped to, so a search from the playhead would find
 * the same mistake for ever and "next slip" would be a button that does
 * nothing the second time it is pressed. A scrub or a stretch of playback
 * clears the memory, and the search starts from where the player actually is.
 */
export function slipJump(
  tape: Tape,
  fromMs: number,
  direction: 1 | -1,
  leadMs: number,
): { slipMs: number; atMs: number } | null {
  const found =
    direction === 1
      ? tape.slips.find((at) => at > fromMs + 1)
      : [...tape.slips].reverse().find((at) => at < fromMs - 1);
  if (found === undefined) return null;
  return { slipMs: found, atMs: Math.max(0, found - leadMs) };
}
