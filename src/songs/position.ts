/**
 * Where you are in a song — the one function that answers it.
 *
 * The engine says where it is: `BeatEvent.songTick` is its own position in
 * the piece, in the score's own ticks, and `songBar` and `songPass` come with
 * it. Everything here is arithmetic over those — which bar of the range that
 * tick is in, and how many quarter notes into the range it sits, which is the
 * axis a `ScoreSchedule` counts in.
 *
 * **Never `BeatEvent.beat`.** That counts the CLICK's beats, so in 7/8 it
 * counts eighths and the cursor advances at twice the rate the music does;
 * and it counts them at one length, so after a tempo step the cursor and the
 * page drift apart with every bar. `SongsView` learned that the hard way and
 * the comment on its cursor says so; this file is where everything else reads
 * position, so the lesson only has to be learned once.
 *
 * Nothing here reads a clock or holds state. Given a beat event it is a pure
 * function of the score, and it is tested as one.
 */
import { beatAtSongTick, clampRange, rangeTicks } from "./schedule";
import type { BarRange } from "./schedule";
import type { SongScore } from "./types";

/** What the engine tells us, narrowed to the part about position. */
export type BeatPosition = {
  /** Which played bar of the piece, or null with no song and through a count-in. */
  songBar: number | null;
  /** Where inside the piece, in the score's own ticks. */
  songTick: number;
  /** Which time round the range, from 0. The contract's `pass`. */
  songPass: number;
  /** The click is running and the piece has not started. */
  songCountIn: boolean;
};

/** Where the player is, as everything downstream wants it. */
export type SongPosition = {
  /** Ticks from the start of the SONG, which is what the tab cursor takes. */
  tick: number;
  /** Played-bar index — `SongScore.bars[i].index` — never a printed number. */
  bar: number;
  /** Quarter notes from the start of the RANGE, which is what a schedule counts in. */
  beatInRange: number;
  /** Times round the range, from 0. */
  pass: number;
  /** The piece has not started: the click is counting you in. */
  countingIn: boolean;
};

/**
 * The position the engine's beat event puts you at inside a range.
 *
 * Stopped, counting in, or with no song on the engine, the answer is the
 * first bar of the range — a cursor walking through a count-in is a cursor on
 * notes nobody has been asked to play yet.
 */
export function songPosition(
  score: SongScore,
  range: BarRange,
  beat: BeatPosition | null,
  options: { playing: boolean },
): SongPosition {
  const { start } = rangeTicks(score, range);
  const clamped = clampRange(score, range);
  const resting: SongPosition = {
    tick: start,
    bar: clamped.startBar,
    beatInRange: 0,
    pass: 0,
    countingIn: false,
  };

  if (beat === null || !options.playing) return resting;
  if (beat.songCountIn) return { ...resting, countingIn: true };
  if (beat.songBar === null) return resting;

  const tick = beat.songTick;
  return {
    tick,
    bar: Math.min(Math.max(beat.songBar, clamped.startBar), clamped.endBar),
    beatInRange: beatAtSongTick(score, range, tick),
    pass: beat.songPass,
    countingIn: false,
  };
}

/** Just the tick, for a cursor, which wants nothing else. */
export function songTickAt(
  score: SongScore,
  range: BarRange,
  beat: BeatPosition | null,
  options: { playing: boolean },
): number {
  return songPosition(score, range, beat, options).tick;
}

/**
 * Which played bar a tick falls in, held inside the range.
 *
 * A walk rather than a search: a range is bars, not thousands of them, and a
 * walk reads as what it is. The clamp at both ends matters — the very last
 * tick of a range is the bar line of the bar after it, and reporting that bar
 * would light a bar the player was never asked to play.
 */
function barAtTick(score: SongScore, tick: number, range: BarRange): number {
  let found = range.startBar;
  for (let i = range.startBar; i <= range.endBar; i++) {
    const bar = score.bars[i];
    if (!bar) break;
    if (tick >= bar.startTick) found = i;
    else break;
  }
  return found;
}

/**
 * The played bar a tick falls in, anywhere in the piece.
 *
 * `barAtTick` held inside a range answers "where is the player in the bars
 * they asked for"; this answers "which bar of the PAGE is this tick written
 * in", which is what anything drawing on the engraving needs — the tab's
 * follow-scroll asks it on every report, and the tick it is given is the
 * engine's position in the whole song, not in the range.
 */
export function playedBarAtTick(score: SongScore, tick: number): number {
  const last = Math.max(0, score.bars.length - 1);
  return barAtTick(score, tick, { startBar: 0, endBar: last });
}

/**
 * The bar a beat of the schedule belongs to, as a PLAYED bar index.
 *
 * The review needs the other direction — a finding names bars, an onset names
 * a beat — and this is `beatAtSongTick` run backwards.
 */
export function barAtBeatInRange(
  score: SongScore,
  range: BarRange,
  beatInRange: number,
): number {
  const { start } = rangeTicks(score, range);
  const clamped = clampRange(score, range);
  const tick = start + beatInRange * (score.ticksPerQuarter || 960);
  return barAtTick(score, tick, clamped);
}

/**
 * What a bar is called on the page.
 *
 * The player reads printed numbers off the tab, so every sentence and every
 * heading quotes these and never the played index (`COACH_UX.md` B1). One
 * added, because `printedBar` counts from zero and a page does not.
 */
export function printedBarNumber(score: SongScore, playedBar: number): number {
  const bar = score.bars[playedBar];
  return (bar ? bar.printedBar : playedBar) + 1;
}
