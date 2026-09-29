/**
 * The playhead between two of the engine's reports.
 *
 * The owner, after his second session (2026-09-21): *"there's a sweep picking
 * section that it's not following note per note in a smooth movement, it's
 * doing blocks at a time"*.
 *
 * ## Why it moved in blocks
 *
 * The engine reports where it is once per CLICK TICK — `BeatEvent.songTick`,
 * pushed from the audio callback on every tick of `song.ticks()`. At 84 BPM
 * that is one report every seven hundred milliseconds. `TabStage` wrote each
 * one straight into `api.tickPosition`, so a run of sixteenth-triplets or a
 * sweep went by entirely BETWEEN two reports and the cursor crossed the whole
 * run in one step. It was never a rendering problem: the line was exactly
 * where it had last been told, seven notes ago.
 *
 * ## What it does now
 *
 * The report is the truth and the webview fills in between: it anchors on
 * each report and advances the tick on `requestAnimationFrame` through the
 * score's own tempo map — tempo steps, tempo percentage and all — so the line
 * travels at sixty frames a second at any note density. Nothing new is asked
 * of the engine and nothing is added to the audio callback.
 *
 * Four properties this is built for, and each is a test:
 *
 * - **No drift.** The anchor is re-set from the engine on every report, so
 *   the error can never accumulate past one report's worth. A five-minute
 *   song ends where the engine says it ends.
 * - **Never backwards.** Extrapolating a few milliseconds past the truth and
 *   then being corrected is normal; a line that twitches back is not. `floor`
 *   holds the furthest the cursor has been shown, and a correction is
 *   absorbed by the cursor standing still for those few milliseconds rather
 *   than by a jump.
 * - **A snap is a snap.** A seek, a loop seam, a new pass — anything that
 *   moves the engine somewhere the tempo map does not lead — puts the cursor
 *   there at once and lets the floor go with it.
 * - **Half speed is half speed.** Everything here is ticks per millisecond
 *   out of the tempo map times the percentage, so a piece at 50 % advances at
 *   half the rate rather than running ahead of what is sounding.
 *
 * ## Where the clock comes from, and why there is no timestamp on the wire
 *
 * The obvious design is for the engine to stamp each report with the instant
 * the tick will be HEARD and for the webview to interpolate against that.
 * `engine.rs` already does the harder half of it: the beat notification
 * carries `ts_ns = now_ns() + output latency`, and the event loop
 * **sleeps for exactly that latency before it emits** (`thread::sleep(
 * Duration::from_micros(notif.delay_us))`). So the moment a `beat` event
 * reaches this side IS, to within the wake-up jitter, the moment the tick
 * sounds — the output latency is already paid for. A timestamp on the wire
 * would have to be translated out of the Rust process's own monotonic epoch
 * into `performance.now()`'s, which is a clock-offset estimator to fix a
 * handful of milliseconds that `floor` already absorbs. Arrival is the
 * anchor, and the audio callback is left alone.
 */
import { tempoAt } from "./schedule";
import { TICKS_PER_QUARTER } from "./types";
import type { SongScore } from "./types";

/**
 * How far a report may sit from where the cursor already is before the cursor
 * is moved there outright rather than eased.
 *
 * Half a quarter note. Below that it is the ordinary disagreement between a
 * prediction and an event that arrived a few milliseconds late or early;
 * above it, something happened that the tempo map does not describe — a seek,
 * a loop seam, a range that was recompiled — and the honest thing is to be
 * where the engine says.
 */
export const SNAP_TICKS = TICKS_PER_QUARTER / 2;

/** Ticks to the quarter for this score, defended against a malformed one. */
function perQuarter(score: SongScore): number {
  return score.ticksPerQuarter > 0 ? score.ticksPerQuarter : TICKS_PER_QUARTER;
}

/**
 * Milliseconds per tick in force at `tick`, at this speed.
 *
 * `tempoAt` is the last step at or before the tick, which is exactly what the
 * engine compiles: `song.rs` gives each unrolled bar the tempo of the last
 * map entry at or before its first tick, and `SONGS.md` fixes tempo steps to
 * bar lines — so the two agree everywhere without this having to know about
 * bars at all.
 */
function msPerTick(score: SongScore, tick: number, percent: number): number {
  const bpm = Math.max(1, (tempoAt(score, tick) * percent) / 100);
  return 60_000 / (bpm * perQuarter(score));
}

/** The first tempo step strictly after `tick`, or the end of time. */
function stepAfter(score: SongScore, tick: number): number {
  for (const step of score.tempoMap) {
    if (step.tick > tick) return step.tick;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Where a cursor standing at `fromTick` has travelled to `ms` later.
 *
 * Segment by segment through the tempo map, because a piece that steps from
 * 100 to 140 at bar nine is not a straight line and a cursor that treats it
 * as one is a bar out by the end of the section.
 */
export function advanceTicks(
  score: SongScore,
  fromTick: number,
  ms: number,
  percent: number,
): number {
  if (!(ms > 0)) return fromTick;
  let tick = fromTick;
  let left = ms;
  // One hop per tempo step at most; the guard is against a map that is not
  // sorted, which `import.ts` does not produce and a hand-written fixture can.
  for (let hop = 0; hop <= score.tempoMap.length; hop++) {
    const per = msPerTick(score, tick, percent);
    const until = stepAfter(score, tick);
    if (!Number.isFinite(until)) return tick + left / per;
    const span = (until - tick) * per;
    if (left <= span) return tick + left / per;
    tick = until;
    left -= span;
  }
  return tick + left / msPerTick(score, tick, percent);
}

/**
 * How long the piece takes to get from one tick to another.
 *
 * The inverse of `advanceTicks`, and the only reason it exists is that a test
 * that asserts on interpolation needs to be able to say "a beat later"
 * without doing the tempo map's arithmetic a second time, differently.
 */
export function ticksToMs(
  score: SongScore,
  fromTick: number,
  toTick: number,
  percent: number,
): number {
  if (toTick <= fromTick) return 0;
  let tick = fromTick;
  let ms = 0;
  for (let hop = 0; hop <= score.tempoMap.length; hop++) {
    const per = msPerTick(score, tick, percent);
    const until = Math.min(stepAfter(score, tick), toTick);
    ms += (until - tick) * per;
    tick = until;
    if (tick >= toTick) return ms;
  }
  return ms + (toTick - tick) * msPerTick(score, tick, percent);
}

/**
 * What the cursor is doing between two reports.
 *
 * Plain data, so the whole of this file is pure and the hook that uses it
 * holds one of these in a ref.
 */
export type CursorMotion = {
  /** The last tick the ENGINE reported. */
  anchorTick: number;
  /** When that report reached the webview, on `performance.now()`'s clock. */
  anchorMs: number;
  /** Which time round the range that report was on — a change is a seam. */
  pass: number;
  /** The furthest the cursor has been drawn since the last snap. */
  floor: number;
};

/** Put the cursor at a tick and forget everything before it. */
export function snapTo(tick: number, atMs: number, pass: number): CursorMotion {
  return { anchorTick: tick, anchorMs: atMs, pass, floor: tick };
}

/**
 * A report arrived. Re-anchor on it — or snap, if it is not where the tempo
 * map was heading.
 *
 * The comparison is against where this motion PREDICTED the engine would be
 * by now, not against the previous anchor: a report one beat later is
 * expected to be a beat further on, and measuring it against the old anchor
 * would call every ordinary beat a seek.
 */
export function onReport(
  score: SongScore,
  motion: CursorMotion | null,
  report: { tick: number; pass: number; atMs: number },
  percent: number,
): CursorMotion {
  if (!motion) return snapTo(report.tick, report.atMs, report.pass);
  if (report.pass !== motion.pass) return snapTo(report.tick, report.atMs, report.pass);
  const expected = advanceTicks(
    score,
    motion.anchorTick,
    report.atMs - motion.anchorMs,
    percent,
  );
  if (Math.abs(report.tick - expected) > SNAP_TICKS) {
    return snapTo(report.tick, report.atMs, report.pass);
  }
  return {
    anchorTick: report.tick,
    anchorMs: report.atMs,
    pass: report.pass,
    // The floor survives an ordinary re-anchor: the correction is worth a few
    // milliseconds of standing still, never a step backwards.
    floor: motion.floor,
  };
}

/** What `cursorTickAt` was asked and what it decided. */
export type CursorFrame = { tick: number; motion: CursorMotion };

/**
 * Where to draw the cursor on this frame.
 *
 * `leadMs` is how far ahead of `nowMs` the answer is wanted. It is not a
 * fudge: alphaTab defers a position change by TWO `requestAnimationFrame`
 * hops before it moves anything — `_onPlayerPositionChanged` schedules
 * `_cursorUpdateTick`, which schedules `_internalCursorUpdateBeat`, which is
 * what finally writes the transform (`alphaTab.core.mjs`, `beginInvoke` is
 * `requestAnimationFrame`). Asking for the position two frames from now is
 * what puts the line on the note at the instant the note sounds. The caller
 * measures the frame interval rather than assuming sixty hertz.
 *
 * `endTick` is the last tick of the bars being played. The cursor waits there
 * rather than walking off the end of a range while the engine gets round to
 * saying it has looped.
 */
export function cursorTickAt(
  score: SongScore,
  motion: CursorMotion,
  nowMs: number,
  options: { percent: number; endTick: number; leadMs: number },
): CursorFrame {
  const raw = advanceTicks(
    score,
    motion.anchorTick,
    nowMs + options.leadMs - motion.anchorMs,
    options.percent,
  );
  const capped = Math.min(raw, options.endTick);
  const tick = Math.max(capped, motion.floor);
  if (tick === motion.floor) return { tick, motion };
  return { tick, motion: { ...motion, floor: tick } };
}

/**
 * The lead, from the frame interval the browser is actually running at.
 *
 * Two frames, because that is what alphaTab defers by; capped, because a tab
 * that has been in the background hands `requestAnimationFrame` a delta of
 * several seconds and a lead of several seconds is a cursor in the next
 * section. Zero until a second frame has been seen.
 */
export const MAX_LEAD_MS = 40;

export function leadFromFrame(frameMs: number): number {
  if (!(frameMs > 0)) return 0;
  return Math.min(MAX_LEAD_MS, frameMs * 2);
}
