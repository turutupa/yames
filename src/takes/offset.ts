/**
 * Lining the picture up with the sound.
 *
 * `plans/SONGS.md` A10: the picture is the webview's own file and the sound is
 * the engine's take, so something has to say how far apart they start. This is
 * that something, and it is pure arithmetic over numbers two clocks already
 * produced — no timers, no state, no DOM.
 *
 * ## The two ends, and the one unknown between them
 *
 * **The sound end is exact.** The take's sidecar carries `startOffsetMs`:
 * where beat 0 of the first pass sits inside the WAV, measured by the writer
 * thread, which takes the band as its clock (`take.rs`). Good to one output
 * buffer.
 *
 * **The picture end is not.** All the webview knows is `performance.now()`
 * when the first frame arrived. To turn that into a position in the piece it
 * has to know what `performance.now()` read when beat 0 sounded — and the only
 * evidence of that is the beat events, which arrive after a sleep the engine
 * times to the output latency (`engine.rs`) and then a trip across the IPC
 * boundary.
 *
 * ## Why it is a line through many events and not one reading
 *
 * That trip is NOISY AND ONE-SIDED. An event can be late — the sleep
 * overshoots, the event loop is busy, a garbage collection lands — and it can
 * never be early: there is no mechanism by which the webview learns about a
 * beat before the engine sends it. So the cloud of `(arrival, position)` pairs
 * sits at or BELOW the truth and never above it, and the two estimators a
 * person reaches for first are both wrong:
 *
 * * One event is one sample of a delay distribution with a tail. A single
 *   unlucky arrival moves the whole video by however long the hiccup was.
 * * The mean of all of them is biased late by the MEAN delay, which on a
 *   loaded laptop is tens of milliseconds and always in the same direction.
 *
 * So: a least-squares line through the pairs to find the rate and the rough
 * offset, and then the line is lifted to a high quantile of its own residuals,
 * because the top edge of a one-sided distribution is where the truth is. The
 * quantile rather than the maximum, because the maximum is one event again.
 *
 * ## What this is worth, honestly
 *
 * A few tens of milliseconds. It cannot be better: nothing here knows the
 * camera's own capture-to-callback latency, which is the camera's business and
 * differs by an order of magnitude between a built-in webcam and a capture
 * card. That is why the review has a nudge beside the picture, why the nudge
 * is remembered per camera, and why measuring a real camera's latency is a
 * hardware session with a clap in it (spike K3) rather than a number this file
 * pretends to know.
 */
import { beatAtSongTick, rangeTempoSteps } from "../songs/schedule";
import type { BarRange, RangeTempoStep } from "../songs/schedule";
import type { SongScore } from "../songs/types";
import type { BeatPosition } from "../songs/position";

/** One beat event: when it arrived here, and where the piece was. */
export type ClockSample = {
  /** `performance.now()` when the webview received the event. */
  arrivalMs: number;
  /** Milliseconds since beat 0 of the first pass of the played range. */
  transportMs: number;
};

/** The webview's clock, expressed as a position in the piece. */
export type ClockFit = {
  /** Transport milliseconds per millisecond of `performance.now()`. */
  slope: number;
  /** Where the piece was when `performance.now()` read zero. */
  interceptMs: number;
  /** How many events went into it, so a caller can say "not yet". */
  samples: number;
};

/**
 * The fewest events worth a line.
 *
 * Eight, because the lift below is a quantile and a quantile of four numbers
 * is the largest of four numbers — which is the one-event estimator this whole
 * file exists to avoid. Eight beat events is two bars of four, or one bar with
 * the subdivision on.
 */
export const MIN_CLOCK_SAMPLES = 8;

/**
 * Where the line is lifted to.
 *
 * The 90th percentile of the residuals. Higher trusts fewer events; lower
 * leaves more of the delivery delay in. At 0.9 an eight-event fit uses the
 * second-largest residual, which is a real reading rather than an outlier.
 */
const LIFT_QUANTILE = 0.9;

/**
 * How far the rate may stray from one before it is not believed.
 *
 * Both clocks count real milliseconds, so the slope IS one; what a fit
 * produces instead is the noise, amplified by however short the pass was. Two
 * per cent is far outside anything a real pair of clocks does and well inside
 * what a handful of jittered events over three seconds can produce, so a slope
 * outside it is thrown away and one is used.
 */
const SLOPE_TOLERANCE = 0.02;

/**
 * Where a beat inside the range falls in time, at the click's own tempo.
 *
 * Integrated over the tempo steps rather than divided by one BPM: a song that
 * steps from 100 to 140 at bar nine is not a straight line, and treating it as
 * one puts every beat after the step seconds out — see `useSongTakePitch.ts`,
 * where the same mistake was worth the same warning.
 */
export function msAtBeat(steps: readonly RangeTempoStep[], beat: number): number {
  if (!(beat > 0) || steps.length === 0) return 0;
  let ms = 0;
  for (let i = 0; i < steps.length; i++) {
    const from = steps[i].beat;
    if (from >= beat) break;
    const next = steps[i + 1]?.beat;
    const to = Math.min(next === undefined ? beat : next, beat);
    ms += ((to - from) * 60_000) / steps[i].bpm;
  }
  return ms;
}

/**
 * `msAtBeat` run backwards: which beat of the range a moment falls on.
 *
 * What the review needs to light the note the tape is currently over. A walk
 * over the steps rather than a search, for the same reason `barAtTick` walks:
 * a range has a handful of tempo steps in it, and a walk reads as what it is.
 */
export function beatAtMs(steps: readonly RangeTempoStep[], ms: number): number {
  if (!(ms > 0) || steps.length === 0) return 0;
  let left = ms;
  for (let i = 0; i < steps.length; i++) {
    const bpm = steps[i].bpm;
    const next = steps[i + 1]?.beat;
    const span = next === undefined ? Infinity : (next - steps[i].beat) * (60_000 / bpm);
    if (left <= span) return steps[i].beat + left / (60_000 / bpm);
    left -= span;
  }
  const last = steps[steps.length - 1];
  return last.beat + left / (60_000 / last.bpm);
}

/**
 * How long one time round the range takes, at the click's tempo.
 *
 * A pass's worth of milliseconds, so an event on the second time round can say
 * how far into the take it is rather than how far into the bar.
 */
export function passLengthMs(
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
): number {
  const steps = rangeTempoSteps(score, range, tempoPercent);
  const { start, end } = rangeTicksOf(score, range);
  return msAtBeat(steps, (end - start) / (score.ticksPerQuarter || 960));
}

/** `rangeTicks`, without importing it twice over for one destructure. */
function rangeTicksOf(score: SongScore, range: BarRange): { start: number; end: number } {
  const first = score.bars[Math.max(0, Math.min(range.startBar, score.bars.length - 1))];
  const last = score.bars[Math.max(0, Math.min(range.endBar, score.bars.length - 1))];
  const start = first ? first.startTick : 0;
  const end = last ? last.startTick + last.lengthTicks : start;
  return { start, end: Math.max(start, end) };
}

/**
 * One beat event, turned into a sample — or `null` when it is not one.
 *
 * A count-in tick and a tick with no song on the engine are both dropped
 * rather than clamped: neither has a position in the piece, and a sample that
 * claims beat 0 for four beats running would drag the line to wherever the
 * count-in was.
 */
export function sampleFor(
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
  beat: BeatPosition,
  arrivalMs: number,
): ClockSample | null {
  if (beat.songCountIn || beat.songBar === null) return null;
  if (!Number.isFinite(arrivalMs)) return null;
  const steps = rangeTempoSteps(score, range, tempoPercent);
  const beatInRange = beatAtSongTick(score, range, beat.songTick);
  if (!Number.isFinite(beatInRange) || beatInRange < 0) return null;
  const pass = Math.max(0, beat.songPass);
  const transportMs = pass * passLengthMs(score, range, tempoPercent) + msAtBeat(steps, beatInRange);
  if (!Number.isFinite(transportMs)) return null;
  return { arrivalMs, transportMs };
}

/** The value at a fraction through a sorted list. */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = Math.round(q * (sorted.length - 1));
  return sorted[Math.min(sorted.length - 1, Math.max(0, at))];
}

/**
 * The line, lifted off the delays. `null` when there is not enough to fit.
 *
 * See the header for why it is a line and why it is then moved. The caller
 * that gets `null` has no offset to record, which is the honest answer and the
 * one the review already knows how to draw: the picture starts level with the
 * sound and the nudge is there.
 */
export function fitTransportClock(samples: readonly ClockSample[]): ClockFit | null {
  const usable = samples.filter(
    (s) => Number.isFinite(s.arrivalMs) && Number.isFinite(s.transportMs),
  );
  if (usable.length < MIN_CLOCK_SAMPLES) return null;

  const n = usable.length;
  let sumX = 0;
  let sumY = 0;
  for (const s of usable) {
    sumX += s.arrivalMs;
    sumY += s.transportMs;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxy = 0;
  let sxx = 0;
  for (const s of usable) {
    const dx = s.arrivalMs - meanX;
    sxy += dx * (s.transportMs - meanY);
    sxx += dx * dx;
  }

  let slope = sxx > 0 ? sxy / sxx : 1;
  if (!Number.isFinite(slope) || Math.abs(slope - 1) > SLOPE_TOLERANCE) slope = 1;
  const intercept = meanY - slope * meanX;

  // The lift. The residuals of a one-sided delay sit at or below the line;
  // their top edge is where an event with no delay would have landed.
  const residuals = usable
    .map((s) => s.transportMs - (slope * s.arrivalMs + intercept))
    .sort((a, b) => a - b);

  return {
    slope,
    interceptMs: intercept + quantile(residuals, LIFT_QUANTILE),
    samples: n,
  };
}

/** Where the piece was at a moment on the webview's clock. */
export function transportAt(fit: ClockFit, arrivalMs: number): number {
  return fit.slope * arrivalMs + fit.interceptMs;
}

/**
 * The number that goes in the sidecar: add it to a position in the take's
 * audio to reach the same instant in the picture.
 *
 * Both ends are expressed as a position in the piece and then subtracted:
 *
 * * a moment `p` into the WAV is `p - startOffsetMs` into the piece, because
 *   `startOffsetMs` is where beat 0 sits inside the file (`take.rs`);
 * * a moment `q` into the video is `transportAt(firstFrameAt) + q`, because
 *   the video's own timeline starts at the frame that arrived then.
 *
 * Setting those equal gives `q = p - startOffsetMs - transportAt(firstFrame)`,
 * and the part that does not depend on `p` is this. Positive when the camera
 * was rolling before the recorder was — which is the usual case, since the
 * camera is armed while the count-in runs.
 */
export function videoOffsetMs(args: {
  fit: ClockFit;
  /** `performance.now()` when the first frame was captured. */
  firstFrameAt: number;
  /** The take's own `position.startOffsetMs`, or null when it has none. */
  startOffsetMs: number | null;
}): number | null {
  const { fit, firstFrameAt, startOffsetMs } = args;
  if (startOffsetMs === null || !Number.isFinite(startOffsetMs)) return null;
  // `startOffsetMs` is where beat 0 sits INSIDE the file, so the file's first
  // sample is at minus that much in the piece. Everything else is below.
  return videoOffsetFrom({ fit, firstFrameAt, takeStartMs: -startOffsetMs });
}

/**
 * The same number, for a take whose clock is not a score's (W32).
 *
 * `videoOffsetMs` above is the song's way of saying where the take's first
 * sample falls in the music, and it is the only song-shaped thing about the
 * arithmetic. A jam says it a different way — a bar of the form and a time
 * round it (`jamClock.ts`) — and gets the same answer from here, so the two
 * modes cannot end up with two subtly different alignments.
 *
 * `takeStartMs` is where the take's FIRST SAMPLE sits on whatever clock the
 * fit was made against. Null when the take has no position to say.
 */
export function videoOffsetFrom(args: {
  fit: ClockFit;
  firstFrameAt: number;
  takeStartMs: number | null;
}): number | null {
  const { fit, firstFrameAt, takeStartMs } = args;
  if (takeStartMs === null || !Number.isFinite(takeStartMs)) return null;
  if (!Number.isFinite(firstFrameAt)) return null;
  const offset = takeStartMs - transportAt(fit, firstFrameAt);
  return Number.isFinite(offset) ? offset : null;
}
