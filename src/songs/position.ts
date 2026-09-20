/**
 * Where you are in a song — the one function that answers it.
 *
 * Today the only thing the app knows about position is the engine's beat
 * count: `BeatEvent.beat` counts quarter notes from the moment the transport
 * started, and everything about where that lands in the score — which bar,
 * which tick, which time round a loop — is worked out here from the range
 * that was handed to the engine.
 *
 * **That is a stand-in, and it is deliberately the only one.** W9's engine
 * carries a song of its own (`song.rs`) and the beat event is growing
 * `songBar` / `songTick` fields that say where the engine's own cursor is,
 * which is the truth once a tempo map means the click and the score no longer
 * advance at the same rate. When they arrive, this file is the only place
 * that changes: `songPosition` starts reading them and every caller — the
 * tab's cursor, the review's live lighting, the pass counter — follows.
 * That is why the cursor does not compute its own tick any more.
 *
 * Nothing here reads a clock or holds state. Given a beat count it is a pure
 * function of the score, and it is tested as one.
 */
import { clampRange, rangeTicks } from "./schedule";
import type { BarRange } from "./schedule";
import type { SongScore } from "./types";

/** What the engine tells us, narrowed to the part about position. */
export type BeatPosition = {
  /** Quarter notes since the transport started. */
  beat: number;
  /**
   * The engine's own bar inside the song, when it has one.
   *
   * Absent today — W9 owns the field and the engine does not send it yet —
   * and preferred over the beat count the moment it appears.
   */
  songBar?: number;
  /** The engine's own tick inside the song. Same story as `songBar`. */
  songTick?: number;
};

/** Where the player is, as everything downstream wants it. */
export type SongPosition = {
  /** Ticks from the start of the SONG, which is what the tab cursor takes. */
  tick: number;
  /** Played-bar index — `SongScore.bars[i].index` — never a printed number. */
  bar: number;
  /** Quarter notes from the start of the RANGE, which is what a schedule counts in. */
  beatInRange: number;
  /** Times round the loop, from 0. Always 0 when the range does not loop. */
  pass: number;
};

/**
 * The position a beat count puts you at inside a range.
 *
 * `beat` counts from the transport, so a loop wraps with a modulo rather than
 * by anybody keeping a position of their own, and a range played once stops
 * at its own end rather than walking off it.
 */
export function songPosition(
  score: SongScore,
  range: BarRange,
  beat: BeatPosition | null,
  options: { playing: boolean; loops: boolean },
): SongPosition {
  const { start, end } = rangeTicks(score, range);
  const clamped = clampRange(score, range);
  const ticksPerQuarter = score.ticksPerQuarter || 960;
  const spanBeats = (end - start) / ticksPerQuarter;

  if (beat === null || !options.playing || spanBeats <= 0) {
    return { tick: start, bar: clamped.startBar, beatInRange: 0, pass: 0 };
  }

  // When the engine starts saying where IT is, that is the answer and none of
  // the arithmetic below runs.
  if (typeof beat.songTick === "number") {
    const tick = beat.songTick;
    return {
      tick,
      bar: barAtTick(score, tick, clamped),
      beatInRange: (tick - start) / ticksPerQuarter,
      pass: 0,
    };
  }
  if (typeof beat.songBar === "number") {
    const bar = Math.min(Math.max(beat.songBar, clamped.startBar), clamped.endBar);
    const tick = score.bars[bar]?.startTick ?? start;
    return { tick, bar, beatInRange: (tick - start) / ticksPerQuarter, pass: 0 };
  }

  const elapsed = Math.max(0, beat.beat);
  const pass = options.loops ? Math.floor(elapsed / spanBeats) : 0;
  const beatInRange = options.loops ? elapsed % spanBeats : Math.min(elapsed, spanBeats);
  const tick = start + beatInRange * ticksPerQuarter;
  return { tick, bar: barAtTick(score, tick, clamped), beatInRange, pass };
}

/** Just the tick, for the cursor, which wants nothing else. */
export function songTickAt(
  score: SongScore,
  range: BarRange,
  beat: BeatPosition | null,
  options: { playing: boolean; loops: boolean },
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
 * The bar a beat of the schedule belongs to, as a PLAYED bar index.
 *
 * The review needs the other direction — a finding names bars, an onset names
 * a beat — and this is the same arithmetic run backwards.
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
