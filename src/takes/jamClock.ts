/**
 * Where a jam is, in milliseconds, so the picture can be lined up with it.
 *
 * `offset.ts` fits a line from the webview's clock to "how far into the music
 * we are". Songs measures that off the score, in the score's own ticks. A jam
 * has no score: what it has is a FORM that comes round, and the engine tells
 * the webview which bar of it and which time round on every beat event. So
 * this is the jam's answer to the same question, and it is the same shape —
 * pure arithmetic over numbers two clocks already produced.
 *
 * ## The origin is the form, not the transport
 *
 * Time here is measured from **bar one of the first chorus**, not from when
 * play was pressed. That matters because the OTHER end of the join —
 * `TakePosition`, stamped by the writer thread on the take's first sample —
 * is also a form position (`bar`, `pass`), and two measurements with two
 * different origins cannot be subtracted. A count-in therefore sits at a
 * negative time and is dropped rather than clamped, for the reason
 * `sampleFor` drops a song's: a handful of samples all claiming bar one would
 * drag the line to wherever the count-in was.
 *
 * ## One tempo for the length of a take
 *
 * A jam runs at one tempo and one meter, so a bar is a fixed number of
 * milliseconds and the whole of this file is two multiplications. The
 * exception is a rising speed ramp, and `jamStrip.ts` already says what is
 * done about it and why: the grid is drawn at the tempo the take STARTED at
 * rather than pretending to know where the ramp had got to. The same honesty
 * applies here, and the review's nudge is what a player has if it is wrong.
 */
import { jamMeter } from "../jam/compile";
import type { Jam, JamTake } from "../jam/types";
import type { BeatEvent } from "../types";
import type { ClockSample } from "./offset";

/** A jam's grid, in milliseconds, worked out once per pass. */
export type JamClockShape = {
  /** One bar at this jam's tempo and meter. */
  barMs: number;
  /** One beat of the click. */
  beatMs: number;
  /** Bars in one time round the form. */
  formBars: number;
};

export function jamClockShape(jam: Jam): JamClockShape {
  const beats = Math.max(1, jamMeter(jam).beatsPerBar);
  const bpm = Math.max(1, jam.bpm);
  const beatMs = 60_000 / bpm;
  return { barMs: beats * beatMs, beatMs, formBars: Math.max(1, jam.form?.bars ?? 1) };
}

/**
 * Milliseconds from bar one of the first chorus to this tick.
 *
 * `chorus` is one-based and `formBar` is zero-based — the engine's own
 * convention, and the reason this is the only place in the camera path that
 * has to remember it.
 */
export function jamTransportMs(shape: JamClockShape, beat: BeatEvent): number {
  const bars = (Math.max(1, beat.chorus) - 1) * shape.formBars + Math.max(0, beat.formBar);
  return bars * shape.barMs + Math.max(0, beat.measureBeat) * shape.beatMs;
}

/**
 * Where the take's FIRST SAMPLE sits on that same clock, or null.
 *
 * `take.position` is the engine's answer, stamped by the writer thread on the
 * first chunk of band it saw (`take.rs`) — so it is exact to one output
 * buffer, which is better than anything the webview could work out for
 * itself. `pass` is the chorus less one, which is why this reads the two
 * fields in the opposite order from `jamTransportMs` above.
 *
 * Null for a take with no position: every take recorded before `TakePosition`
 * existed, and any recorded with the transport stopped. The review then
 * starts the picture level with the sound, which is the honest state.
 */
export function jamTakeStartMs(shape: JamClockShape, take: JamTake): number | null {
  const at = take.position;
  if (!at || at.mode !== "jam") return null;
  const bars = Math.max(0, at.pass) * shape.formBars + Math.max(0, at.bar);
  return bars * shape.barMs;
}

/**
 * A sampler for one pass: beat events in, clock samples out.
 *
 * It holds the last form position it saw, which is what makes a SUBDIVIDED
 * click safe. A jam's beat event carries the bar and the beat inside it but
 * not which subdivision of that beat it is, so with eighths on, three ticks
 * arrive claiming one instant — three different arrival times against one
 * transport reading, which is noise the fit would take for delay. Only the
 * first tick of each beat becomes a sample; the rest are dropped.
 *
 * `countingIn` is asked on every tick rather than captured, because a pass
 * starts in the count-in and comes out of it while this closure lives.
 */
export function jamSampler(
  jam: Jam,
  countingIn: () => boolean,
): (beat: BeatEvent, arrivalMs: number) => ClockSample | null {
  const shape = jamClockShape(jam);
  let last = -1;
  return (beat, arrivalMs) => {
    if (countingIn()) return null;
    if (!Number.isFinite(arrivalMs)) return null;
    const bars = (Math.max(1, beat.chorus) - 1) * shape.formBars + Math.max(0, beat.formBar);
    const mark = bars * 1000 + Math.max(0, beat.measureBeat);
    if (mark === last) return null;
    last = mark;
    const transportMs = jamTransportMs(shape, beat);
    if (!Number.isFinite(transportMs)) return null;
    return { arrivalMs, transportMs };
  };
}
