/**
 * The clip's FRAME: where everything goes at each shape.
 *
 * `clip.ts` is pure arithmetic with no score in it (W33 item 4), so this is
 * what a clip looks like before anybody has said what is being recorded.
 * What a canvas then draws is checked by making a real clip and looking at a
 * frame of it with `ffmpeg`, which is the only way to check a picture —
 * vitest runs in happy-dom and there is no canvas in it at all.
 *
 * The song's half of the arithmetic — the window, the excerpt, the caption
 * and the span — is `src/songs/camera/songClip.test.ts` beside its own file.
 */
import { describe, expect, it } from "vitest";
import { clipLayout, clipSeconds, clipSize } from "./clip";
import { buildTape } from "../songs/camera/tape";
import type { OnsetResult, ScoreSchedule, SongScore } from "../songs/types";

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

  /**
   * The Yames mark is a marketing asset, so it is measured like one.
   *
   * The owner asked for the real logo plus "yames.app", legible on a phone —
   * "not a faint 12 px ghost" — in a corner nothing else uses. Every one of
   * those is a fact about the LAYOUT, which is what this file is for; what
   * it looks like is checked by making a clip and extracting a frame.
   */
  it("gives the mark a corner of its own, at a size a phone can read", () => {
    for (const shape of ["wide", "tall"] as const) {
      const layout = clipLayout(shape);
      const size = clipSize(shape);

      // Legible: a 1280-wide clip in a phone feed is scaled to about a
      // third, so anything under about 24 here is under 8 there.
      expect(layout.type.mark, `${shape}: the mark's type is too small`).toBeGreaterThanOrEqual(24);

      // In the picture, at the top, and hard against the right edge.
      expect(layout.mark.y, `${shape}: the mark is not at the top`).toBeLessThan(
        layout.picture.height / 4,
      );
      expect(
        layout.mark.x + layout.mark.width,
        `${shape}: the mark runs off the right`,
      ).toBeLessThanOrEqual(size.width);
      expect(layout.mark.x, `${shape}: the mark is not on the right`).toBeGreaterThan(
        size.width / 2,
      );

      // And clear of the two things that ARE drawn: the excerpt runs the
      // width of the frame along the bottom, and the caption is under it.
      expect(
        layout.mark.y + layout.mark.height,
        `${shape}: the mark is over the excerpt`,
      ).toBeLessThan(layout.strip.y);
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

