/**
 * WHERE YOU ARE IN THE SONG. One place, and this is it.
 *
 * The owner, after his fourth session (2026-09-21): *"let's say i hit play,
 * and i hit pause when it's on bar 3, if i click on bar 6 and hit play again,
 * it will resume from bar 3 but then immediately go on from bar 6, as if
 * there are 2 states for the current location, one when playing and another
 * one when paused. It's causing many flickers or causing the vertical line to
 * move around a lot"*.
 *
 * He had counted them. There were five:
 *
 * 1. the engine's own cursor, which a stop rewound to the top of the range;
 * 2. `session.playFrom` — W29's "where the NEXT pass begins", in played bars;
 * 3. W36's local post-click snap inside `TabStage`;
 * 4. the interpolator's anchor (W34), re-seeded from whichever of those won;
 * 5. the `tick` prop, worked out from the engine's beat reports.
 *
 * Play started the engine where IT thought it was, the webview corrected it
 * with a seek a click tick later, and the line showed both.
 *
 * ## The rule
 *
 * **One playhead, in the song's own ticks, owned by the session.** Everything
 * reads it. Three things write it:
 *
 * - a click, a key or a portion action, at any time;
 * - the engine's reports, while the transport runs;
 * - "back to the start".
 *
 * A stop is a PAUSE: the last thing the engine said becomes the playhead and
 * stays there, so the next press of Play begins at that exact place — which
 * the engine now does itself, because the playhead is compiled into the table
 * as `SongTransport.startTick` and the callback begins there.
 *
 * ## Why a click is believed before the engine answers
 *
 * W36's finding, kept and made the rule everywhere rather than undone. The
 * engine is the clock and a click is a message to it: the answer comes back
 * one click tick later — seven hundred milliseconds at 84 BPM — and for that
 * whole interval a cursor that waited would go on walking where the music
 * used to be and then teleport. So a click is the playhead at once, and the
 * engine's reports are ignored until one of them agrees with it.
 *
 * "Agrees" is a window rather than an equality, because the report the engine
 * sends after a seek is the first click tick AFTER it. [`AGREE_QUARTERS`] is
 * wider than any first report and narrower than the distance to anywhere
 * somebody would have bothered clicking from, and it is one-sided: a report
 * BEFORE the target is stale whichever direction the click went.
 *
 * Everything here is pure. No clock is read, no state is held: the session
 * keeps one of these and hands it back in.
 */
import { clampRange, rangeTicks } from "./schedule";
import type { BarRange } from "./schedule";
import { playedBarAtTick } from "./position";
import type { SongScore } from "./types";

/**
 * How far past a click a report may land and still count as the engine having
 * arrived there. Six quarter notes — a bar and a half at four-four.
 */
export const AGREE_QUARTERS = 6;

/**
 * How long a click is believed for when no report ever agrees — an engine
 * that refused the seek, a piece that ended. A cursor frozen on a promise
 * nobody kept is worse than a cursor in the wrong bar.
 */
export const BELIEVE_MS = 1500;

/** The first tick of the bars being played. */
export function rangeStartTick(score: SongScore, range: BarRange): number {
  return rangeTicks(score, range).start;
}

/**
 * A tick, held inside the bars that are going to play.
 *
 * The last tick of a range is the bar line of the bar after it, so the far
 * end is one tick short of it: a playhead there is in the last bar of the
 * portion rather than in the first bar outside it.
 */
export function clampTick(score: SongScore, range: BarRange, tick: number): number {
  const { start, end } = rangeTicks(score, range);
  const last = Math.max(start, end - 1);
  if (!Number.isFinite(tick)) return start;
  return Math.min(Math.max(Math.round(tick), start), last);
}

/** The first tick of a played bar, or the start of the range for a bad index. */
export function tickOfBar(score: SongScore, range: BarRange, playedBar: number): number {
  const clamped = clampRange(score, range);
  const bar = score.bars[Math.min(Math.max(playedBar, 0), Math.max(0, score.bars.length - 1))];
  return clampTick(score, clamped, bar ? bar.startTick : rangeStartTick(score, clamped));
}

/** Which played bar the playhead stands in. The mark on the page. */
export function barOfTick(score: SongScore, range: BarRange, tick: number): number {
  const clamped = clampRange(score, range);
  const bar = playedBarAtTick(score, clampTick(score, clamped, tick));
  return Math.min(Math.max(bar, clamped.startBar), clamped.endBar);
}

/**
 * Has the engine arrived where the click asked?
 *
 * One-sided and in quarter notes, so it means the same thing at any tempo and
 * in any meter.
 */
export function reportAgrees(score: SongScore, target: number, report: number): boolean {
  const quarter = score.ticksPerQuarter > 0 ? score.ticksPerQuarter : 960;
  return report >= target && report <= target + quarter * AGREE_QUARTERS;
}

/** What the session keeps. Plain data; the session holds one of these. */
export type PlayheadState = {
  /**
   * Where the player put it, in song ticks, or null for the start of the
   * range. Written by a click, a key, a portion action, "back to the start",
   * and by the pause that ends a pass.
   */
  stored: number | null;
  /**
   * A click the engine has not confirmed yet, or null. It is the playhead
   * while it lasts, and it lasts until a report agrees or [`BELIEVE_MS`]
   * passes.
   */
  pending: number | null;
};

export const NO_PLAYHEAD: PlayheadState = { stored: null, pending: null };

/**
 * THE ONE ANSWER: where the playhead is, in the song's own ticks.
 *
 * `report` is the engine's last word — `BeatEvent.songTick` — or null when it
 * has not spoken. Stopped, the engine is not the authority about anything and
 * the stored place wins outright.
 */
export function playheadTick(
  score: SongScore,
  range: BarRange,
  state: PlayheadState,
  options: { playing: boolean; report: number | null },
): number {
  const clamped = clampRange(score, range);
  if (state.pending !== null) return clampTick(score, clamped, state.pending);
  if (options.playing && options.report !== null) {
    return clampTick(score, clamped, options.report);
  }
  if (state.stored !== null) return clampTick(score, clamped, state.stored);
  return rangeStartTick(score, clamped);
}

/**
 * Somebody went somewhere: a click, an arrow key, a section chip.
 *
 * The click is believed at once — `pending` — and stored, so a stop and a
 * later press of Play begin there too.
 */
export function goTo(tick: number): PlayheadState {
  return { stored: tick, pending: tick };
}

/** Back to the start: the first bar of whatever is being played. No pending. */
export function toStart(): PlayheadState {
  return NO_PLAYHEAD;
}

/**
 * A report arrived. Keep believing the click, or let the engine have it back.
 *
 * Returns the same object when nothing changed, so a session can use it as a
 * state updater without a render per beat.
 */
export function onReport(
  score: SongScore,
  state: PlayheadState,
  report: number,
): PlayheadState {
  if (state.pending === null) return state;
  if (!reportAgrees(score, state.pending, report)) return state;
  return { stored: state.stored, pending: null };
}

/** The click was never confirmed. The engine is the truth again. */
export function giveUpWaiting(state: PlayheadState): PlayheadState {
  return state.pending === null ? state : { stored: state.stored, pending: null };
}

/**
 * The transport stopped. **A stop is a pause**, so the playhead stays where
 * the music stopped and the next press of Play begins there.
 *
 * `tick` is where the line was — the engine's last report, carried forward
 * through the tempo map to the instant of the stop, which is the position the
 * cursor was actually drawn at. Null — no song was reporting — leaves the
 * playhead alone rather than rewinding it.
 */
export function pauseAt(state: PlayheadState, tick: number | null): PlayheadState {
  if (tick === null) return { stored: state.stored, pending: null };
  return { stored: tick, pending: null };
}
