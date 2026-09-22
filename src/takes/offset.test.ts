/**
 * Lining the picture up — the arithmetic, against a truth we planted.
 *
 * The brief's bar: synthetic beat events with jitter, and the fitted offset
 * within 5 ms of the truth. That number is why the estimator is a lifted line
 * rather than a mean — the delivery delay is one-sided, so a mean is biased
 * late by however loaded the machine was, and the two tests at the bottom
 * measure exactly that difference.
 */
import { describe, expect, it } from "vitest";
import {
  beatAtMs,
  fitTransportClock,
  msAtBeat,
  passLengthMs,
  sampleFor,
  transportAt,
  videoOffsetMs,
  MIN_CLOCK_SAMPLES,
} from "./offset";
import type { ClockSample } from "./offset";
import type { SongScore } from "../songs/types";

/** Four bars of 4/4 at 120, the same shape `position.test.ts` uses. */
function fourBarScore(): SongScore {
  return {
    schema: 1,
    id: "s",
    title: "Four bars",
    artist: "",
    source: { fileName: "f.alphatex", format: "alphatex", trackIndex: 0, trackName: "Lead" },
    tuning: [64, 59, 55, 50, 45, 40],
    capo: 0,
    ticksPerQuarter: 960,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: [
      { index: 0, startTick: 0, lengthTicks: 3840, printedBar: 0 },
      { index: 1, startTick: 3840, lengthTicks: 3840, printedBar: 1 },
      { index: 2, startTick: 7680, lengthTicks: 3840, printedBar: 2 },
      { index: 3, startTick: 11520, lengthTicks: 3840, printedBar: 3 },
    ],
    notes: [],
    sections: [],
  };
}

describe("where a beat falls in time", () => {
  it("counts a steady tempo as one length", () => {
    const steps = [{ beat: 0, bpm: 120 }];
    expect(msAtBeat(steps, 0)).toBe(0);
    expect(msAtBeat(steps, 1)).toBeCloseTo(500, 6);
    expect(msAtBeat(steps, 4)).toBeCloseTo(2000, 6);
  });

  /**
   * The failure `useSongTakePitch.ts` warns about, on this axis. A song that
   * steps from 100 to 140 at beat 4 is not a straight line, and dividing by
   * one BPM puts every beat after the step seconds out.
   */
  it("steps where the score steps", () => {
    const steps = [
      { beat: 0, bpm: 100 },
      { beat: 4, bpm: 140 },
    ];
    expect(msAtBeat(steps, 4)).toBeCloseTo(2400, 6);
    expect(msAtBeat(steps, 8)).toBeCloseTo(2400 + (4 * 60_000) / 140, 6);
    // ...and a naive one BPM would have said 4800 for the same beat.
    expect(msAtBeat(steps, 8)).toBeLessThan(4800);
  });

  it("runs backwards to the beat a moment is on", () => {
    const steps = [
      { beat: 0, bpm: 100 },
      { beat: 4, bpm: 140 },
    ];
    for (const beat of [0, 1.5, 4, 6.25, 9]) {
      expect(beatAtMs(steps, msAtBeat(steps, beat))).toBeCloseTo(beat, 6);
    }
  });

  it("a pass of the four-bar fixture is four bars of its own tempo", () => {
    const score = fourBarScore();
    const range = { startBar: 0, endBar: 3 };
    const bpm = score.tempoMap[0].bpm;
    expect(passLengthMs(score, range, 100)).toBeCloseTo((16 * 60_000) / bpm, 3);
    // At seventy per cent the click is slower, so the pass is longer.
    expect(passLengthMs(score, range, 70)).toBeGreaterThan(passLengthMs(score, range, 100));
  });
});

describe("one beat event as a sample", () => {
  const score = fourBarScore();
  const range = { startBar: 0, endBar: 3 };

  it("places a tick of the piece at its own moment", () => {
    const sample = sampleFor(
      score,
      range,
      100,
      { songBar: 1, songTick: 960 * 4, songPass: 0, songCountIn: false },
      1000,
    );
    expect(sample).not.toBeNull();
    expect(sample!.arrivalMs).toBe(1000);
    expect(sample!.transportMs).toBeCloseTo((4 * 60_000) / score.tempoMap[0].bpm, 3);
  });

  it("puts the second time round a pass later", () => {
    const first = sampleFor(
      score,
      range,
      100,
      { songBar: 0, songTick: 0, songPass: 0, songCountIn: false },
      1000,
    )!;
    const second = sampleFor(
      score,
      range,
      100,
      { songBar: 0, songTick: 0, songPass: 1, songCountIn: false },
      1000,
    )!;
    expect(second.transportMs - first.transportMs).toBeCloseTo(
      passLengthMs(score, range, 100),
      3,
    );
  });

  /**
   * A count-in tick has no position in the piece, and neither has a tick with
   * no song on the engine. Dropped rather than clamped: four samples all
   * claiming beat 0 would drag the line to wherever the count-in was.
   */
  it("drops a tick that is not in the piece", () => {
    expect(
      sampleFor(score, range, 100, { songBar: null, songTick: 0, songPass: 0, songCountIn: true }, 1),
    ).toBeNull();
    expect(
      sampleFor(score, range, 100, { songBar: null, songTick: 0, songPass: 0, songCountIn: false }, 1),
    ).toBeNull();
  });
});

/**
 * Beat events as the webview really receives them.
 *
 * `clockAt` is the truth: the moment on the webview's clock at which each
 * transport position was AUDIBLE. `delay` is what the trip from the engine
 * adds, and it is always positive — there is no mechanism by which the webview
 * learns about a beat before the engine sends it.
 */
function synthetic(options: {
  count: number;
  spacingMs: number;
  /** `performance.now()` at transport zero. */
  clockAtZero: number;
  delayMs: (i: number) => number;
}): ClockSample[] {
  const out: ClockSample[] = [];
  for (let i = 0; i < options.count; i++) {
    const transportMs = i * options.spacingMs;
    out.push({
      arrivalMs: options.clockAtZero + transportMs + options.delayMs(i),
      transportMs,
    });
  }
  return out;
}

describe("the clock fit", () => {
  it("will not fit a line through too few events", () => {
    const few = synthetic({
      count: MIN_CLOCK_SAMPLES - 1,
      spacingMs: 500,
      clockAtZero: 10_000,
      delayMs: () => 0,
    });
    expect(fitTransportClock(few)).toBeNull();
  });

  it("finds the clock exactly when nothing was delayed", () => {
    const clean = synthetic({
      count: 32,
      spacingMs: 500,
      clockAtZero: 10_000,
      delayMs: () => 0,
    });
    const fit = fitTransportClock(clean)!;
    expect(fit).not.toBeNull();
    expect(transportAt(fit, 10_000)).toBeCloseTo(0, 6);
    expect(transportAt(fit, 12_000)).toBeCloseTo(2000, 6);
  });

  /**
   * A deterministic pseudo-random sequence. A test that fails one run in fifty
   * is a test nobody trusts.
   */
  function jitter(seedIn: number): () => number {
    let seed = seedIn;
    return () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
  }

  /**
   * The brief's bar. A busy laptop delivers most events within 25 ms and two
   * of them far worse than that; the fit has to land within 5 ms of where the
   * beat actually sounded.
   */
  it("is within 5 ms of the truth through one-sided jitter", () => {
    const random = jitter(20260920);
    const samples = synthetic({
      count: 64,
      spacingMs: 250,
      clockAtZero: 42_000,
      delayMs: (i) => (i === 17 || i === 40 ? 180 : random() * 25),
    });
    const fit = fitTransportClock(samples)!;
    expect(Math.abs(transportAt(fit, 42_000))).toBeLessThan(5);
  });

  /**
   * Why it is not the mean, which is the estimator everybody reaches for
   * first.
   *
   * The delay is one-sided, so the cloud sits BELOW the truth and the average
   * of it sits below the truth by the average delay — an error that does not
   * shrink as more events arrive, and that would go into the video offset as a
   * constant nobody could see. The lift is what removes it.
   */
  it("beats the mean, which the one-sided delay drags late", () => {
    const random = jitter(770077);
    const samples = synthetic({
      count: 64,
      spacingMs: 250,
      clockAtZero: 42_000,
      delayMs: () => random() * 40,
    });
    const fit = fitTransportClock(samples)!;
    const mean =
      samples.reduce((sum, s) => sum + (s.transportMs - s.arrivalMs), 0) / samples.length;
    const meanError = Math.abs(42_000 + mean);
    expect(meanError).toBeGreaterThan(15);
    // Well under half of it, and inside ten milliseconds against forty of
    // jitter. Not zero: a least-squares intercept has its own spread, and a
    // quantile of sixty-four numbers is an estimate rather than an oracle.
    expect(Math.abs(transportAt(fit, 42_000))).toBeLessThan(meanError / 2);
    expect(Math.abs(transportAt(fit, 42_000))).toBeLessThan(10);
  });

  /**
   * The floor, stated as a test so nobody mistakes this file for a solved
   * problem.
   *
   * If EVERY event is exactly twenty milliseconds late, no estimator over
   * these numbers can know it: a constant delivery delay and a clock offset
   * are the same measurement. So the fit is out by that twenty, the video
   * offset inherits it, and the review has a nudge beside the picture — which
   * is the whole reason the nudge exists and why a real camera's latency is a
   * hardware session with a clap in it (spike K3) rather than a number this
   * file pretends to know.
   */
  it("cannot see a delay that never varies, which is what the nudge is for", () => {
    const samples = synthetic({
      count: 64,
      spacingMs: 250,
      clockAtZero: 42_000,
      delayMs: () => 20,
    });
    const fit = fitTransportClock(samples)!;
    expect(transportAt(fit, 42_000)).toBeCloseTo(-20, 3);
  });

  /**
   * Two clocks that count the same milliseconds have a slope of one. A slope
   * the fit produces outside a couple of per cent came from too few events
   * over too short a span, and believing it would throw a long video away by
   * seconds at its far end.
   */
  it("refuses a rate a short noisy pass invented", () => {
    const samples: ClockSample[] = [];
    for (let i = 0; i < 12; i++) {
      samples.push({ arrivalMs: 1000 + i * 10, transportMs: i * 30 });
    }
    expect(fitTransportClock(samples)!.slope).toBe(1);
  });
});

describe("the number that goes in the sidecar", () => {
  /**
   * The worked example from `offset.ts`'s own header, so the sign can never
   * quietly flip: beat 0 sounded at clock 1000, the take's file starts 50 ms
   * after that (`startOffsetMs` is -50), and the camera's first frame landed
   * at clock 900. The picture is therefore 150 ms ahead of the sound.
   */
  it("is positive when the camera was rolling before the recorder", () => {
    const fit = fitTransportClock(
      synthetic({ count: 20, spacingMs: 250, clockAtZero: 1000, delayMs: () => 0 }),
    )!;
    const offset = videoOffsetMs({ fit, firstFrameAt: 900, startOffsetMs: -50 });
    expect(offset).toBeCloseTo(150, 6);
  });

  it("is negative when the camera started after beat zero", () => {
    const fit = fitTransportClock(
      synthetic({ count: 20, spacingMs: 250, clockAtZero: 1000, delayMs: () => 0 }),
    )!;
    expect(videoOffsetMs({ fit, firstFrameAt: 1200, startOffsetMs: -50 })).toBeCloseTo(-150, 6);
  });

  /** A take with no measured start has no offset to record, and says so. */
  it("is null when the take never measured where it began", () => {
    const fit = fitTransportClock(
      synthetic({ count: 20, spacingMs: 250, clockAtZero: 1000, delayMs: () => 0 }),
    )!;
    expect(videoOffsetMs({ fit, firstFrameAt: 900, startOffsetMs: null })).toBeNull();
    expect(videoOffsetMs({ fit, firstFrameAt: Number.NaN, startOffsetMs: -50 })).toBeNull();
  });
});
