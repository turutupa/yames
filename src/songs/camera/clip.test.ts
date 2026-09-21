/**
 * The clip's model: where everything goes, and what the caption says.
 *
 * `clip.ts` is pure arithmetic over a pass the coach has already judged, so
 * it is tested with a hand-made pass rather than a rendered one. What a canvas
 * then draws is checked by making a real clip and looking at a frame of it
 * with `ffmpeg`, which is the only way to check a picture — vitest runs in
 * happy-dom and there is no canvas in it at all.
 *
 * The three things worth guarding here are the ones nobody could check by
 * eye: that the strip's window is centred on the playhead and slides at the
 * rate of the music; that the caption names the bar you are IN rather than
 * the nearest one; and that the chosen bars become the right stretch of
 * transport milliseconds, which is what decides how long the clip is and
 * therefore how long the player waits.
 */
import { describe, expect, it } from "vitest";
import {
  bpmAtMs,
  captionAt,
  clipLayout,
  clipSeconds,
  clipSize,
  clipSpan,
  clipWindowMs,
  visibleBars,
  visibleTicks,
  WINDOW_BARS,
} from "./clip";
import { buildTape } from "./tape";
import type { OnsetResult, ScoreSchedule, SongScore } from "../types";

/** Four bars of 4/4 at 120, with a section name on bar 3 — `tape.test.ts`'s. */
function score(): SongScore {
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
    sections: [{ name: "Chorus", startBar: 2, endBar: 3 }],
  };
}

function schedule(): ScoreSchedule {
  return {
    onsets: Array.from({ length: 16 }, (_, i) => ({
      id: i,
      beat: i,
      noteIds: [i],
      soft: false,
      accent: i % 4 === 0,
    })),
    lengthBeats: 16,
    loops: true,
  };
}

const BANDS = { perfect: 25, good: 50, window: 120 };
const RANGE = { startBar: 0, endBar: 3 };

function results(passes = 1): OnsetResult[] {
  const out: OnsetResult[] = [];
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < 16; i++) out.push({ id: i, state: "hit", deviationMs: 0, pass });
  }
  return out;
}

function tapeOf(passes = 1) {
  return buildTape({
    score: score(),
    schedule: schedule(),
    range: RANGE,
    tempoPercent: 100,
    results: results(passes),
    extras: [],
    bands: BANDS,
  });
}

describe("the clip's shape", () => {
  it("is 720p either way up, and its furniture never leaves the frame", () => {
    for (const shape of ["wide", "tall"] as const) {
      const size = clipSize(shape);
      const layout = clipLayout(shape);
      expect(size.width * size.height).toBe(1280 * 720);
      expect(layout.width).toBe(size.width);

      for (const [name, box] of Object.entries({
        picture: layout.picture,
        strip: layout.strip,
        caption: layout.caption,
        mark: layout.mark,
      })) {
        expect(box.x, `${shape}: ${name} starts off the left`).toBeGreaterThanOrEqual(0);
        expect(box.y, `${shape}: ${name} starts above the frame`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${shape}: ${name} runs off the right`).toBeLessThanOrEqual(
          size.width,
        );
        expect(box.y + box.height, `${shape}: ${name} runs off the bottom`).toBeLessThanOrEqual(
          size.height,
        );
        expect(box.height, `${shape}: ${name} has no height`).toBeGreaterThan(0);
      }
    }
  });

  it("gives the picture the most of the frame, in both shapes", () => {
    for (const shape of ["wide", "tall"] as const) {
      const layout = clipLayout(shape);
      const size = clipSize(shape);
      // `plans/ECHORA.md` E0.7: the picture is the reason anybody watches. A
      // shape whose furniture took half the frame would be a shape nobody
      // would post.
      expect(
        (layout.picture.height * layout.picture.width) / (size.width * size.height),
        `${shape}: the picture is not the frame`,
      ).toBeGreaterThan(0.7);
    }
  });

  it("does not let the strip and the caption overlap", () => {
    for (const shape of ["wide", "tall"] as const) {
      const layout = clipLayout(shape);
      expect(
        layout.strip.y + layout.strip.height,
        `${shape}: the caption is drawn over the strip`,
      ).toBeLessThanOrEqual(layout.caption.y);
    }
  });
});

describe("the scrolling excerpt", () => {
  it("is four bars wide, at the tempo the player chose", () => {
    // Four bars of 4/4 at 120 is eight seconds; at 70 % it is longer, because
    // the window is a number of BARS and the bars last longer.
    expect(clipWindowMs(score(), RANGE, 100)).toBeCloseTo(2000 * WINDOW_BARS, 6);
    expect(clipWindowMs(score(), RANGE, 70)).toBeCloseTo((2000 / 0.7) * WINDOW_BARS, 6);
  });

  it("keeps the playhead in the middle and slides the music past it", () => {
    const tape = tapeOf();
    const windowMs = clipWindowMs(score(), RANGE, 100);

    // At four seconds in, the note that falls exactly there is at the middle.
    const at4s = visibleTicks(tape, 4000, windowMs);
    const middle = at4s.find((t) => Math.round(t.tick.atMs) === 4000);
    expect(middle, "no note at four seconds").toBeDefined();
    expect(middle!.at).toBeCloseTo(0.5, 6);

    // A second later the same note has moved left by exactly one second's
    // worth of the window, which is what "scrolling" has to mean.
    const at5s = visibleTicks(tape, 5000, windowMs);
    const moved = at5s.find((t) => t.tick.onsetId === middle!.tick.onsetId);
    expect(moved, "the note left the window a second later").toBeDefined();
    expect(middle!.at - moved!.at).toBeCloseTo(1000 / windowMs, 6);
  });

  it("shows only what is inside the window", () => {
    const tape = tapeOf();
    const windowMs = clipWindowMs(score(), RANGE, 100);
    const ticks = visibleTicks(tape, 0, windowMs);
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.at).toBeGreaterThanOrEqual(0);
      expect(tick.at).toBeLessThanOrEqual(1);
    }
    // Nothing from the far end of the take is on the strip at the start.
    expect(ticks.some((t) => t.tick.atMs > windowMs / 2)).toBe(false);
  });

  it("puts the bar lines on the same axis as the notes", () => {
    const tape = tapeOf();
    const windowMs = clipWindowMs(score(), RANGE, 100);
    const bars = visibleBars(tape, 4000, windowMs);
    expect(bars.length).toBeGreaterThan(0);
    // Bar 3 (printed 3) opens at four seconds and carries the section name.
    const opening = bars.find((bar) => bar.printedBar === 3);
    expect(opening, "bar 3 is not on the strip at four seconds").toBeDefined();
    expect(opening!.at).toBeCloseTo(0.5, 6);
    expect(opening!.section).toBe("Chorus");
  });
});

describe("the caption", () => {
  it("names the bar you are IN, not the nearest one", () => {
    const tape = tapeOf();
    // Three and a half seconds is the back half of bar 2 (printed 2), which
    // runs 2–4 s. Rounding to the nearest bar line would call it bar 3.
    expect(captionAt(tape, score(), RANGE, 100, 3500).printedBar).toBe(2);
    expect(captionAt(tape, score(), RANGE, 100, 4000).printedBar).toBe(3);
  });

  it("keeps a section's name until another one starts", () => {
    const tape = tapeOf();
    expect(captionAt(tape, score(), RANGE, 100, 1000).section).toBeNull();
    expect(captionAt(tape, score(), RANGE, 100, 4000).section).toBe("Chorus");
    // Still the chorus a bar later, where no line names it again.
    expect(captionAt(tape, score(), RANGE, 100, 6500).section).toBe("Chorus");
  });

  it("names the section a portion OPENS in, even with no line for it", () => {
    // Bars 3–4 of the fixture are the chorus, and a pass over them has no bar
    // line that starts a section — the chorus began before the pass did.
    const range = { startBar: 2, endBar: 3 };
    const tape = buildTape({
      score: score(),
      schedule: schedule(),
      range,
      tempoPercent: 100,
      results: results(),
      extras: [],
      bands: BANDS,
    });
    expect(captionAt(tape, score(), range, 100, 100).section).toBe("Chorus");
  });

  it("says the tempo the player is hearing, not the one on the page", () => {
    const tape = tapeOf();
    expect(captionAt(tape, score(), RANGE, 100, 0).bpm).toBe(120);
    // 70 % of 120 is 84, and that is the number the click is running at — the
    // only honest one to paint on a clip somebody is about to show a friend.
    expect(captionAt(tape, score(), RANGE, 70, 0).bpm).toBe(84);
  });

  it("walks a tempo map rather than reporting its first step for ever", () => {
    // Two seconds at 120, then 60: the first bar lasts 2 s and the second 4 s.
    const steps = [
      { beat: 0, bpm: 120 },
      { beat: 4, bpm: 60 },
    ];
    expect(bpmAtMs(steps, 0)).toBe(120);
    expect(bpmAtMs(steps, 1999)).toBe(120);
    expect(bpmAtMs(steps, 2001)).toBe(60);
    expect(bpmAtMs(steps, 999_999)).toBe(60);
    expect(bpmAtMs([], 0)).toBe(0);
  });
});

describe("how much of the take a clip is of", () => {
  it("defaults to all of it, and one pass when a pass is chosen", () => {
    const tape = tapeOf(3);
    const all = clipSpan({
      tape,
      score: score(),
      range: RANGE,
      tempoPercent: 100,
      bars: null,
      pass: null,
    });
    expect(all).toEqual({ startMs: 0, endMs: tape.lengthMs });
    expect(clipSeconds(all)).toBeCloseTo(24, 6);

    const second = clipSpan({
      tape,
      score: score(),
      range: RANGE,
      tempoPercent: 100,
      bars: null,
      pass: 1,
    });
    expect(second.startMs).toBeCloseTo(8000, 6);
    expect(clipSeconds(second)).toBeCloseTo(8, 6);
  });

  it("turns chosen bars into the stretch of the take they were played over", () => {
    const tape = tapeOf(2);
    // Bars 3–4 of the second go: 4 s into a pass that starts at 8 s, four
    // seconds long.
    const span = clipSpan({
      tape,
      score: score(),
      range: RANGE,
      tempoPercent: 100,
      bars: { startBar: 2, endBar: 3 },
      pass: 1,
    });
    expect(span.startMs).toBeCloseTo(12000, 6);
    expect(span.endMs).toBeCloseTo(16000, 6);
    expect(clipSeconds(span)).toBeCloseTo(4, 6);
  });

  it("stretches with the tempo, because a slower pass lasts longer", () => {
    const tape = buildTape({
      score: score(),
      schedule: schedule(),
      range: RANGE,
      tempoPercent: 50,
      results: results(),
      extras: [],
      bands: BANDS,
    });
    const span = clipSpan({
      tape,
      score: score(),
      range: RANGE,
      tempoPercent: 50,
      bars: { startBar: 0, endBar: 1 },
      pass: 0,
    });
    // Two bars of 4/4 at 60 BPM is eight seconds.
    expect(clipSeconds(span)).toBeCloseTo(8, 6);
  });
});
