/**
 * Where the tab sits in a clip, and whether a phone can read it.
 *
 * `tabPainter.ts` is the half that touches a canvas, and vitest runs in
 * happy-dom where there is no canvas at all — so what is tested here is the
 * arithmetic the drawing is laid out by, which is where every way of getting
 * it wrong lives: a band too short for six strings, a fret number too small to
 * read in a feed, furniture eating the picture, the tab wandering under the
 * Yames mark. What it LOOKS like was checked the only way a picture can be:
 * by making real clips and pulling frames out of them.
 */
import { describe, expect, it } from "vitest";
import { blankStrip } from "./clipStrip";
import {
  TAB_WINDOW_BARS,
  tabBandHeight,
  tabGeometry,
  tabStrip,
  tabWindowMs,
} from "./tabPainter";
import { buildTabTape } from "./tabTape";
import { clipLayout, clipSize } from "../songs/camera/clip";
import type { ClipShape } from "../songs/camera/clip";
import { buildTape } from "../songs/camera/tape";
import { buildSchedule } from "../songs/schedule";
import type { SongScore } from "../songs/types";

const SHAPES: ClipShape[] = ["wide", "tall"];
const RANGE = { startBar: 0, endBar: 1 };

/** Two bars of 4/4 at 120, on as many strings as you ask for. */
function score(strings = 6): SongScore {
  const tuning = [64, 59, 55, 50, 45, 40, 35, 30].slice(0, strings);
  return {
    schema: 1,
    id: "s",
    title: "Two bars",
    artist: "",
    source: { fileName: "f.alphatex", format: "alphatex", trackIndex: 0, trackName: "Lead" },
    tuning,
    capo: 0,
    ticksPerQuarter: 960,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
    bars: [
      { index: 0, startTick: 0, lengthTicks: 3840, printedBar: 0 },
      { index: 1, startTick: 3840, lengthTicks: 3840, printedBar: 1 },
    ],
    notes: [
      {
        id: 0,
        tick: 0,
        durTicks: 960,
        string: 1,
        fret: 12,
        midi: 76,
        tieFromPrevious: false,
        ghost: false,
        dead: false,
        accent: false,
        techniques: [],
      },
    ],
    sections: [],
  };
}

function stripFor(strings = 6) {
  const s = score(strings);
  const schedule = buildSchedule(s, RANGE);
  const tape = buildTape({
    score: s,
    schedule,
    range: RANGE,
    tempoPercent: 100,
    results: [],
    extras: [],
    bands: null,
  });
  const tab = buildTabTape({ score: s, schedule, tape, range: RANGE, tempoPercent: 100 });
  return { score: s, tab, strip: tabStrip({ tab, tape, score: s, range: RANGE, tempoPercent: 100 }) };
}

describe("where the tab sits in a clip", () => {
  it("is a band under the picture in a wide frame and over it in a tall one", () => {
    const { strip } = stripFor();
    const wide = strip.bandFor!("wide", true);
    const tall = strip.bandFor!("tall", true);
    expect(wide.overPicture, "16:9 covers the hands").toBe(false);
    expect(tall.overPicture, "9:16 wastes a third of the frame").toBe(true);
    // ...and over the LOWER THIRD of it, not half of it.
    expect(tall.height).toBeLessThan(clipSize("tall").height / 3);
  });

  it("leaves the picture the most of a wide frame even with six strings under it", () => {
    const { strip } = stripFor();
    const layout = clipLayout("wide", strip.bandFor!("wide", true));
    const size = clipSize("wide");
    // The dots' band could be 56 pixels because a dot carries nothing to read.
    // Six lines of tablature cannot, so the picture gives up some room — but
    // it is still much the largest thing in the frame, which is the rule
    // `clip.test.ts` states and the reason anybody watches a clip at all.
    expect((layout.picture.height * size.width) / (size.width * size.height)).toBeGreaterThan(0.55);
    expect(layout.picture.height).toBeGreaterThan(layout.strip.height * 2);
  });

  it("keeps the whole picture in a tall frame, with the caption above the tab", () => {
    const { strip } = stripFor();
    const layout = clipLayout("tall", strip.bandFor!("tall", true));
    expect(layout.picture.height).toBe(clipSize("tall").height);
    expect(layout.caption.y + layout.caption.height).toBeLessThanOrEqual(layout.strip.y);
    // And the Yames mark, up in the corner, is nowhere near either of them.
    expect(layout.mark.y + layout.mark.height).toBeLessThan(layout.caption.y);
  });

  it("becomes the whole clip when there is no camera", () => {
    const { strip } = stripFor();
    for (const shape of SHAPES) {
      const band = strip.bandFor!(shape, false);
      const layout = clipLayout(shape, band);
      expect(band.overPicture).toBe(false);
      expect(layout.picture.height, `${shape}: a picture that is not there has a box`).toBe(0);
      expect(layout.strip.height).toBeGreaterThan(clipSize(shape).height * 0.7);
    }
  });

  it("reads ahead: the playhead is a third in, not in the middle", () => {
    const { strip } = stripFor();
    for (const shape of SHAPES) {
      expect(clipLayout(shape, strip.bandFor!(shape, true)).head).toBeCloseTo(1 / 3, 6);
    }
    // And a renderer that says nothing still gets the middle.
    expect(clipLayout("wide").head).toBe(0.5);
  });

  it("asks for no band at all when the player wants nothing under the picture", () => {
    const layout = clipLayout(
      "wide",
      blankStrip(() => ({ printedBar: 1, section: null, bpm: 120 })).bandFor!("wide", true),
    );
    expect(layout.strip.height).toBe(0);
    // ...which gives the picture more of the frame than it has ever had.
    expect(layout.picture.height).toBeGreaterThan(clipLayout("wide").picture.height);
  });
});

describe("whether a phone can read it", () => {
  it("draws fret numbers a phone-sized 9:16 clip can be read from", () => {
    const { strip, tab } = stripFor();
    const layout = clipLayout("tall", strip.bandFor!("tall", true));
    const g = tabGeometry(layout.strip, tab.strings, "tall");
    // A 720-wide clip in a phone feed is scaled to about 0.55, so anything
    // under about 20 here lands under 11 points there — smaller than a
    // caption, which is where "legible" stops.
    expect(g.fret, "the fret numbers are too small to read on a phone").toBeGreaterThanOrEqual(20);
    expect(g.gap, "the strings are too close for the numbers between them").toBeGreaterThan(g.fret);
  });

  it("shows fewer bars at once in the narrower frame, so the numbers do not touch", () => {
    // A wide frame is 1228 pixels across and a tall one 692, so the same
    // number of bars would be half as far apart in the tall one — which for
    // sixteenths is eleven pixels and unreadable at any type size.
    expect(TAB_WINDOW_BARS.tall[0]).toBeLessThan(TAB_WINDOW_BARS.wide[0]);
    const s = score();
    // Two bars of 4/4 at 120 is four seconds; three is six.
    expect(tabWindowMs(s, RANGE, 100, "tall")).toBeCloseTo(4000, 6);
    expect(tabWindowMs(s, RANGE, 100, "wide")).toBeCloseTo(6000, 6);
    // Slower music scrolls slower, which is the whole of the sync claim.
    expect(tabWindowMs(s, RANGE, 50, "tall")).toBeCloseTo(8000, 6);
  });

  it("narrows the window rather than shrinking the numbers, when the music is dense", () => {
    const s = score();
    // Quarter notes at 120 are 500 ms apart: everything fits, so the widest
    // window is taken in both shapes.
    expect(tabWindowMs(s, RANGE, 100, "tall", 500)).toBeCloseTo(4000, 6);
    expect(tabWindowMs(s, RANGE, 100, "wide", 500)).toBeCloseTo(6000, 6);
    // Sixteenths at 120 are 125 ms apart. Two bars across 692 pixels puts
    // them 21 pixels apart, which no type size rescues — so a tall clip shows
    // one bar, and a wide one two.
    expect(tabWindowMs(s, RANGE, 100, "tall", 125)).toBeCloseTo(2000, 6);
    expect(tabWindowMs(s, RANGE, 100, "wide", 125)).toBeCloseTo(4000, 6);
    // And it never goes below one bar, however fast the passage is: a window
    // that showed half a bar would scroll faster than anybody reads.
    expect(tabWindowMs(s, RANGE, 100, "tall", 10)).toBeCloseTo(2000, 6);
  });

  it("fits every string, the bar numbers and the row under them inside the band", () => {
    for (const shape of SHAPES) {
      for (const strings of [4, 6, 7, 8]) {
        const { strip, tab } = stripFor(strings);
        const box = clipLayout(shape, strip.bandFor!(shape, true)).strip;
        const g = tabGeometry(box, tab.strings, shape);
        const what = `${shape} with ${String(strings)} strings`;
        expect(g.headerY - g.small, `${what}: the bar numbers are above the band`).toBeGreaterThan(
          box.y - 1,
        );
        expect(g.topY - g.fret / 2, `${what}: the top string is above the band`).toBeGreaterThan(
          box.y,
        );
        expect(
          g.footY + g.small,
          `${what}: the row under the strings falls out of the band`,
        ).toBeLessThanOrEqual(box.y + box.height + 1);
        expect(tab.strings).toBe(strings);
      }
    }
  });

  it("holds an eight-string file to the same band as a six-string one", () => {
    // More lines, not a taller clip: an eight-string tab that grew the band
    // would take the room out of the picture, and the picture is the reason
    // anybody watches.
    for (const shape of SHAPES) {
      const six = tabBandHeight(shape, 6);
      const eight = tabBandHeight(shape, 8);
      expect(eight - six, `${shape}: eight strings cost too much room`).toBeLessThan(16);
    }
  });
});
