/**
 * The jam's clock: where the music is, so the picture can be put beside it.
 *
 * Everything here is arithmetic over numbers two clocks produced, so all of it
 * is testable without a camera, a jam or a canvas — which is the whole reason
 * `jamClock.ts` is a file of its own rather than lines inside a hook.
 */
import { describe, expect, it } from "vitest";
import { jamClockShape, jamSampler, jamTakeStartMs, jamTransportMs } from "./jamClock";
import { fitTransportClock, transportAt, videoOffsetFrom } from "./offset";
import type { Jam, JamTake } from "../jam/types";
import type { BeatEvent } from "../types";

/** A twelve-bar blues in 4/4 at 120: a bar is two seconds, a beat half of one. */
function blues(over: Partial<Jam> = {}): Jam {
  return {
    id: "j1",
    name: "Blues in F",
    createdAt: 0,
    bpm: 120,
    grooveId: "swing",
    feel: "swing",
    intensity: "normal",
    kit: "brushes",
    form: { kind: "blues12", bars: 12 },
    countIn: 0,
    fills: true,
    key: "F",
    ...over,
  } as Jam;
}

function tick(over: Partial<BeatEvent> = {}): BeatEvent {
  return {
    beat: 0,
    measureBeat: 0,
    subdivision: 1,
    isDownbeat: true,
    accentLevel: 2,
    isAccent: true,
    formBar: 0,
    chorus: 1,
    bandState: "full",
    songBar: null,
    songTick: 0,
    songPass: 0,
    songCountIn: false,
    ...over,
  };
}

function take(over: Partial<JamTake> = {}): JamTake {
  return {
    id: "t1",
    jamId: "j1",
    createdAt: 0,
    durationSec: 48,
    path: "x.wav",
    ...over,
  } as JamTake;
}

describe("the shape of a jam's grid", () => {
  it("is the meter and the tempo, and nothing else", () => {
    const shape = jamClockShape(blues());
    expect(shape.beatMs).toBe(500);
    expect(shape.barMs).toBe(2000);
    expect(shape.formBars).toBe(12);
  });

  it("survives a record with no form and an impossible tempo", () => {
    const shape = jamClockShape(blues({ bpm: 0, form: undefined }));
    expect(shape.formBars).toBe(1);
    expect(Number.isFinite(shape.barMs)).toBe(true);
    expect(shape.barMs).toBeGreaterThan(0);
  });
});

describe("where a tick falls", () => {
  const shape = jamClockShape(blues());

  it("counts from bar one of the first chorus", () => {
    expect(jamTransportMs(shape, tick())).toBe(0);
    expect(jamTransportMs(shape, tick({ formBar: 1 }))).toBe(2000);
    expect(jamTransportMs(shape, tick({ formBar: 0, measureBeat: 3 }))).toBe(1500);
  });

  it("carries on through the form coming round", () => {
    // Chorus two, bar one: twelve bars of two seconds have gone by.
    expect(jamTransportMs(shape, tick({ chorus: 2, formBar: 0 }))).toBe(24_000);
    expect(jamTransportMs(shape, tick({ chorus: 3, formBar: 5, measureBeat: 2 }))).toBe(
      (24 + 5) * 2000 + 1000,
    );
  });
});

describe("where the take's first sample falls", () => {
  const shape = jamClockShape(blues());

  it("is the position the writer thread stamped", () => {
    const t = take({ position: { mode: "jam", bar: 2, tick: 0, pass: 1 } });
    // One whole chorus, then two bars.
    expect(jamTakeStartMs(shape, t)).toBe((12 + 2) * 2000);
  });

  it("is null for a take that has no position, rather than a guess at zero", () => {
    expect(jamTakeStartMs(shape, take())).toBeNull();
    expect(
      jamTakeStartMs(shape, take({ position: { mode: "song", bar: 0, tick: 0, pass: 0 } })),
    ).toBeNull();
  });
});

describe("the sampler", () => {
  it("drops the extra ticks a subdivided click sends", () => {
    const sample = jamSampler(blues(), () => false);
    // Three ticks inside one beat: the engine sends the beat and its two
    // eighths, all reporting the same bar and the same beat in it.
    expect(sample(tick({ measureBeat: 1 }), 1000)).toEqual({
      arrivalMs: 1000,
      transportMs: 500,
    });
    expect(sample(tick({ measureBeat: 1 }), 1167)).toBeNull();
    expect(sample(tick({ measureBeat: 1 }), 1333)).toBeNull();
    // ...and the next beat is a sample again.
    expect(sample(tick({ measureBeat: 2 }), 1500)).toEqual({
      arrivalMs: 1500,
      transportMs: 1000,
    });
  });

  it("drops the count-in, which has no place in the form", () => {
    let counting = true;
    const sample = jamSampler(blues(), () => counting);
    expect(sample(tick(), 100)).toBeNull();
    counting = false;
    expect(sample(tick(), 600)).not.toBeNull();
  });

  it("refuses a reading with no clock behind it", () => {
    const sample = jamSampler(blues(), () => false);
    expect(sample(tick(), Number.NaN)).toBeNull();
  });
});

describe("the whole join, end to end", () => {
  /**
   * The thing this file exists for: beat events that arrive LATE by a varying
   * amount, a take that began two bars into the second chorus, and a first
   * frame captured at a known moment — and the offset that comes out has to
   * point at the same instant in the picture as in the sound.
   */
  it("lines a jam's picture up against its sound within a few milliseconds", () => {
    const jam = blues();
    const shape = jamClockShape(jam);
    const sample = jamSampler(jam, () => false);

    // The truth: `performance.now()` read 10_000 when bar one of chorus one
    // sounded, so transport `m` happened at 10_000 + m.
    const TRUTH = 10_000;
    // Delivery is late and never early — the one-sided delay `offset.ts` is
    // built around. A repeating pattern rather than a random one so the test
    // fails for a reason rather than on a seed.
    const lateness = [7, 21, 4, 35, 12, 3, 48, 9, 17, 6, 26, 11];
    const samples = [];
    for (let i = 0; i < 12; i++) {
      const beat = tick({ formBar: Math.floor(i / 4), measureBeat: i % 4 });
      const at = TRUTH + jamTransportMs(shape, beat) + lateness[i];
      const got = sample(beat, at);
      if (got) samples.push(got);
    }
    expect(samples).toHaveLength(12);

    const fit = fitTransportClock(samples);
    expect(fit).not.toBeNull();
    // The line, lifted off the delays, reads the truth back to within the
    // smallest delay in the set.
    expect(transportAt(fit!, TRUTH)).toBeGreaterThan(-10);
    expect(transportAt(fit!, TRUTH)).toBeLessThan(10);

    // The camera's first frame landed a second before the transport started.
    const firstFrameAt = TRUTH - 1000;
    // The take began two bars into the second chorus.
    const t = take({ position: { mode: "jam", bar: 2, tick: 0, pass: 1 } });
    const offset = videoOffsetFrom({
      fit: fit!,
      firstFrameAt,
      takeStartMs: jamTakeStartMs(shape, t),
    });
    expect(offset).not.toBeNull();
    // Add it to a position in the take's audio to reach the same instant in
    // the picture: the take opens at 28 s into the form, the video opens at
    // −1 s, so the picture is 29 s ahead of the audio's zero.
    expect(offset!).toBeGreaterThan(29_000 - 15);
    expect(offset!).toBeLessThan(29_000 + 15);
  });

  it("has no offset to give when the take never said where it began", () => {
    const jam = blues();
    const shape = jamClockShape(jam);
    const sample = jamSampler(jam, () => false);
    const samples = [];
    for (let i = 0; i < 12; i++) {
      const got = sample(tick({ formBar: Math.floor(i / 4), measureBeat: i % 4 }), 1000 + i * 500);
      if (got) samples.push(got);
    }
    const fit = fitTransportClock(samples);
    expect(
      videoOffsetFrom({ fit: fit!, firstFrameAt: 900, takeStartMs: jamTakeStartMs(shape, take()) }),
    ).toBeNull();
  });
});
