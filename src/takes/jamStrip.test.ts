/**
 * The jam's bar grid, as a saved video draws it (W30).
 *
 * Every one of these is about a number a viewer would notice: the grid
 * scrolling at the wrong speed, the chord on the wrong bar, the chorus
 * counted from the wrong place, or bar forty-one of a twelve-bar blues.
 */
import { describe, expect, it } from "vitest";
import { barIndexAt, chordAt, jamStrip, jamTapeShape, jamWindowMs, visibleJamBars } from "./jamStrip";
import type { Jam, JamTake } from "../jam/types";

function jam(over: Partial<Jam> = {}): Jam {
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

function take(over: Partial<JamTake> = {}): JamTake {
  return {
    id: "t1",
    jamId: "j1",
    createdAt: 0,
    durationSec: 60,
    path: "C:/takes/t1.wav",
    ...over,
  };
}

describe("the shape of a jam on the tape", () => {
  it("measures a bar off the jam's own tempo and meter", () => {
    // 120 BPM, four beats to the bar: two seconds a bar.
    const shape = jamTapeShape(jam(), take());
    expect(shape.barMs).toBeCloseTo(2000, 6);
    expect(shape.formBars).toBe(12);
    expect(shape.bpm).toBe(120);
  });

  it("opens on the bar the engine says the take opened on", () => {
    // The stamp the audio callback left on the first sample it recorded. A
    // take that began at bar 5 of the form draws its grid there, not at 1.
    const shape = jamTapeShape(jam(), take({ position: { mode: "jam", bar: 4, tick: 0, pass: 2 } }));
    expect(shape.startBar).toBe(4);
  });

  it("opens at the top of the form when there is no stamp to go on", () => {
    // Every take recorded before the engine stamped one, and any recorded
    // with the transport stopped. The honest default, not a guess.
    expect(jamTapeShape(jam(), take()).startBar).toBe(0);
    // ...and a song's position is not a jam's, so it is ignored too.
    expect(
      jamTapeShape(jam(), take({ position: { mode: "song", bar: 9, tick: 0, pass: 0 } })).startBar,
    ).toBe(0);
  });

  it("names a chord for every bar of the form", () => {
    const shape = jamTapeShape(jam(), take());
    expect(shape.chords.length).toBe(12);
    // A blues in F opens on F, whatever the spelling rules do to the rest.
    expect(shape.chords[0].startsWith("F")).toBe(true);
  });

  it("reads a record with no key at all as C rather than refusing", () => {
    const shape = jamTapeShape(jam({ key: undefined }), take());
    expect(shape.chords.length).toBe(12);
  });

  it("carries the vibe and the key into the caption", () => {
    const shape = jamTapeShape(jam(), take(), "Bluesy");
    expect(shape.subtitle).toContain("Bluesy");
    expect(shape.subtitle).toContain("F");
  });
});

describe("what is on the strip at one moment", () => {
  const shape = jamTapeShape(jam(), take({ durationSec: 60 }));

  it("shows four bars at a time", () => {
    expect(jamWindowMs(shape)).toBeCloseTo(8000, 6);
  });

  it("puts the bar being played at the playhead", () => {
    // Two seconds a bar: five seconds in is the middle of bar three.
    expect(barIndexAt(shape, 5000)).toBe(2);
    expect(barIndexAt(shape, 0)).toBe(0);
  });

  it("walks the form round and round", () => {
    // Twelve bars, so bar 12 of the take is bar 0 of the form again — and the
    // chord on it is the one the form opened with.
    expect(chordAt(shape, 12)).toBe(chordAt(shape, 0));
    expect(chordAt(shape, 13)).toBe(chordAt(shape, 1));
  });

  it("draws only the bars inside the window, however long the take is", () => {
    // Four bars across an eight-second window, so at most five bar lines —
    // never a walk of a twenty-minute take.
    const bars = visibleJamBars(shape, 30_000, jamWindowMs(shape));
    expect(bars.length).toBeLessThanOrEqual(6);
    for (const bar of bars) {
      expect(bar.at).toBeGreaterThanOrEqual(0);
      expect(bar.at).toBeLessThanOrEqual(1);
    }
  });

  it("draws nothing before the take starts or after it ends", () => {
    // The window at the very start reaches back past zero, and the window at
    // the very end reaches past the last bar. Neither invents a bar line.
    const opening = visibleJamBars(shape, 0, jamWindowMs(shape));
    expect(opening.every((bar) => bar.barsIn >= 0)).toBe(true);
    const closing = visibleJamBars(shape, 60_000, jamWindowMs(shape));
    expect(closing.every((bar) => bar.barsIn * shape.barMs <= shape.lengthMs)).toBe(true);
  });

  it("counts the chorus from where the take opened, not from bar one", () => {
    const mid = jamTapeShape(jam(), take({ position: { mode: "jam", bar: 10, tick: 0, pass: 0 } }));
    const strip = jamStrip(mid);
    // Opened on bar 11 of twelve, so two bars in the form has come round and
    // the caption is on the second chorus, bar one.
    const caption = strip.captionAt(mid.barMs * 2);
    expect(caption.printedBar).toBe(1);
    expect(caption.section).toContain("2");
  });

  it("numbers bars within the form, which is what a musician counts", () => {
    const strip = jamStrip(shape);
    // Bar forty-one of a twelve-bar blues is a number nobody thinks in.
    expect(strip.captionAt(shape.barMs * 40).printedBar).toBeLessThanOrEqual(12);
    expect(strip.captionAt(shape.barMs * 40).printedBar).toBeGreaterThanOrEqual(1);
  });

  it("says the tempo the jam was actually played at", () => {
    expect(jamStrip(shape).captionAt(0).bpm).toBe(120);
  });
});

describe("a record the renderer cannot make sense of", () => {
  it("still gives a grid, with no names on it", () => {
    // A jam whose progression cannot be read is still a take worth showing.
    const broken = jamTapeShape(jam({ progression: ["???", "???"] as unknown as string[] }), take());
    expect(broken.barMs).toBeGreaterThan(0);
    expect(broken.formBars).toBeGreaterThan(0);
  });

  it("never divides by a tempo of zero", () => {
    const shape = jamTapeShape(jam({ bpm: 0 }), take());
    expect(Number.isFinite(shape.barMs)).toBe(true);
    expect(shape.barMs).toBeGreaterThan(0);
  });
});
