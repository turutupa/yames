import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { PathDoc, PathTechnique } from "../../../paths/format";
import { findExercise } from "../../../session/packs";
import { buildTake } from "../../../session/take";
import {
  FOLLOW_SEGMENTS,
  FRET_PX,
  FRET_PX_MIN,
  barRel,
  beamsFor,
  currentOnset,
  describePattern,
  followLayout,
  fretPxFor,
  minGapPxFor,
  noteXIn,
  occurrences,
  overviewLayout,
  patternModel,
  resultOfMark,
  resultsFromLights,
  SCROLL_AT,
  scrollLayout,
  segmentNotes,
  segmentPlace,
  staffGeometry,
  tabStripInputOfTake,
} from "./tabStripModel";

const BAR = 3840;
const eighths = (frets: number[], string = 1) =>
  frets.map((fret, i) => ({ string, fret, tick: i * 480, dur: 480 }));

function pack(id: string): PathDoc {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), `src/paths/packs/${id}.json`), "utf8")) as PathDoc;
}

describe("the pattern", () => {
  it("sorts by tick then string, numbers onsets from 1, and a chord shares one", () => {
    const m = patternModel(
      [
        { string: 2, fret: 8, tick: 480, dur: 480 },
        { string: 1, fret: 5, tick: 0, dur: 480 },
        { string: 3, fret: 7, tick: 480, dur: 480 },
      ],
      BAR,
      1,
    );
    expect(m.notes.map((n) => [n.fret, n.index, n.order])).toEqual([
      [5, 0, 1],
      [8, 1, 2],
      [7, 2, 2],
    ]);
    expect(m.onsets).toEqual([0, 480]);
  });

  it("counts the seam in its tightest gap", () => {
    // Quarters, but the last note sits a sixteenth before the loop comes round.
    const m = patternModel(
      [
        { string: 1, fret: 5, tick: 0, dur: 960 },
        { string: 1, fret: 7, tick: 960, dur: 960 },
        { string: 1, fret: 8, tick: 3600, dur: 240 },
      ],
      BAR,
      1,
    );
    expect(m.minGap).toBe(240);
  });

  it("drops a note on no string", () => {
    expect(patternModel([{ string: 7, fret: 1, tick: 0, dur: 480 }], BAR, 1).notes).toEqual([]);
  });

  it("describes itself for a screen reader, bar by bar", () => {
    const m = patternModel(
      [
        ...eighths([5, 7]),
        { string: 3, fret: 7, tick: BAR, dur: 480 },
        { string: 2, fret: 8, tick: BAR, dur: 480 },
      ],
      BAR,
      2,
    );
    expect(describePattern(m)).toBe("e5 e7 | B8+G7");
  });
});

const sixteenths = (bars = 1) =>
  Array.from({ length: 16 * bars }, (_u, i) => ({ string: 1, fret: 12, tick: i * 240, dur: 240 }));

describe("the layout (the approved mock)", () => {
  it("shows two whole bars, now and next, at 34 px, ~65 px a note, for eighths at 1400 wide", () => {
    const m = patternModel(eighths([5, 7, 8, 7, 5, 3, 5, 3]), BAR, 1);
    const l = followLayout(m, 1300);
    expect(l.split).toBe(1);
    expect(l.segTicks).toBe(BAR);
    expect(l.fretPx).toBe(FRET_PX);
    expect(l.ppt * 480).toBeGreaterThanOrEqual(minGapPxFor(FRET_PX) - 0.5);
    expect(l.segWidth * FOLLOW_SEGMENTS + l.geo.letters).toBeCloseTo(1300, 5);
  });

  it("splits a bar of sixteenths in half rather than let them crowd, the numbers still 34 px", () => {
    const m = patternModel(sixteenths(), BAR, 1);
    const l = followLayout(m, 1300);
    expect(l.split).toBe(2);
    expect(l.fretPx).toBe(FRET_PX);
    expect(l.ppt * 240).toBeGreaterThanOrEqual(minGapPxFor(l.fretPx) - 0.5);
  });

  it("keeps the gap on a phone, with smaller numbers and a shorter segment", () => {
    const m = patternModel(eighths([5, 7, 8, 7, 5, 3, 5, 3]), BAR, 1);
    const l = followLayout(m, 340);
    expect(l.fits).toBe(true);
    expect(l.fretPx).toBeLessThan(FRET_PX);
    expect(l.fretPx).toBeGreaterThanOrEqual(18);
    expect(l.ppt * 480).toBeGreaterThanOrEqual(minGapPxFor(l.fretPx) - 0.5);
  });

  it("keeps numbers at 34 px from 760 px wide and shrinks them on a phone", () => {
    expect(fretPxFor(1300)).toBe(34);
    expect(fretPxFor(960)).toBe(34);
    expect(fretPxFor(340)).toBeLessThan(34);
    expect(fretPxFor(340)).toBeGreaterThanOrEqual(18);
  });

  it("puts every number in the middle of its slot, never on a bar line", () => {
    const m = patternModel(eighths([5, 7, 8, 7, 5, 3, 5, 3]), BAR, 1);
    const l = followLayout(m, 1300);
    const first = noteXIn(0, l.ppt, m, l.geo);
    const last = noteXIn(BAR - 480, l.ppt, m, l.geo);
    expect(first).toBeGreaterThan(l.geo.fretPx * 0.6);
    expect(l.segWidth - last).toBeCloseTo(first, 5);
  });

  it("has the high e as the top line and the counts under the staff", () => {
    const g = staffGeometry(34);
    expect(g.bottom - g.top).toBe(5 * g.gap);
    expect(g.labelY).toBeLessThan(g.top - 17);
    expect(g.beatY).toBeGreaterThan(g.bottom + 17);
  });

  it("names a segment by its bar, and its beats when it is part of one", () => {
    const m = patternModel(sixteenths(4), BAR, 4);
    expect(segmentPlace(m, 1, BAR)).toMatchObject({ bar: 2, whole: true });
    expect(segmentPlace(m, 3, BAR / 2)).toMatchObject({ bar: 2, fromBeat: 3, toBeat: 4, whole: false });
    expect(segmentPlace(m, 4, BAR)).toMatchObject({ bar: 1 });
  });

  it("gives a segment its notes, every pass that reaches it", () => {
    const m = patternModel(eighths([5, 7, 8, 7, 5, 3, 5, 3]), BAR, 1);
    expect(segmentNotes(m, 2, BAR).map((n) => n.id)).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
    expect(segmentNotes(m, 1, BAR / 2).map((n) => n.at)).toEqual([1920, 2400, 2880, 3360]);
    expect(segmentNotes(m, -1, BAR)).toEqual([]);
    expect(segmentNotes(m, 3, BAR, 3)).toEqual([]);
  });
});

describe("the overview (ready and paused)", () => {
  const four = patternModel(
    eighths([3, 5, 6, 8, 6, 5, 3, 5, 5, 6, 8, 10, 8, 6, 5, 6, 6, 8, 10, 12, 10, 8, 6, 8, 8, 10, 12, 13, 12, 10, 8, 10]),
    BAR,
    4,
  );

  it("wraps four bars onto even rows, the gap held, inside the height", () => {
    const o = overviewLayout(four, 1300, 470);
    expect(o.fits).toBe(true);
    expect(o.split).toBe(1);
    expect(o.segments).toBe(4);
    expect(o.rows * o.perRow).toBeGreaterThanOrEqual(4);
    expect(o.perRow === 4 || o.perRow === 2).toBe(true);
    expect(o.rows * o.geo.height).toBeLessThanOrEqual(470);
    expect(o.ppt * 480).toBeGreaterThanOrEqual(minGapPxFor(o.fretPx) - 0.5);
  });

  it("takes the largest numbers that fit, and smaller ones in a short panel", () => {
    const tall = overviewLayout(four, 1300, 800);
    const short = overviewLayout(four, 1300, 160);
    expect(short.fretPx).toBeLessThan(tall.fretPx);
    expect(short.fretPx).toBeGreaterThanOrEqual(FRET_PX_MIN);
  });

  it("splits a bar on a phone rather than cram it, and scrolls when nothing fits", () => {
    const dense = patternModel(sixteenths(4), BAR, 4);
    const o = overviewLayout(dense, 340, 300);
    expect(o.ppt * 240).toBeGreaterThanOrEqual(minGapPxFor(o.fretPx) - 0.5);
    expect(o.split).toBeGreaterThan(1);
    expect(overviewLayout(dense, 0, 0)).toBeTruthy();
  });
});

describe("looping", () => {
  const m = patternModel(eighths([5, 7, 8, 7, 5, 3, 5, 3]), BAR, 1);

  it("repeats the pattern pass after pass, with the Take's ids", () => {
    const all = occurrences(m, 0, 2);
    expect(all).toHaveLength(24);
    expect(all[8]).toMatchObject({ id: 8, pass: 1, at: BAR, bar: 1, fret: 5, index: 0 });
    expect(all.map((n) => n.id)).toEqual(all.map((_n, i) => i));
  });

  it("cuts the last pass on the Take's bar line", () => {
    const two = patternModel(eighths([5, 7, 8, 7, 5, 3, 5, 3, 5, 7, 8, 10, 8, 7, 5, 7]), BAR, 2);
    // Three bars of a two-bar pattern: one whole pass, then its first bar.
    const notes = occurrences(two, 0, 5, 3);
    expect(notes).toHaveLength(24);
    expect(notes[notes.length - 1].at).toBeLessThan(3 * BAR);
  });

  it("has no notes before the first pass", () => {
    expect(occurrences(m, -2, 0)).toHaveLength(8);
  });

  it("the current note runs straight over the seam", () => {
    const grace = BAR / 32;
    expect(currentOnset(m, BAR - 480 + grace - 1, grace)).toMatchObject({ pass: 0, index: 7 });
    expect(currentOnset(m, BAR + grace - 1, grace)).toMatchObject({ pass: 1, index: 0, at: BAR });
  });

  it("is the first note through the count-in, and nothing after the Take", () => {
    expect(currentOnset(m, -2000, 0)).toMatchObject({ pass: 0, index: 0 });
    expect(currentOnset(m, 10 * BAR, 0, 10)).toBeNull();
  });

});

describe("note emphasis", () => {
  const m = patternModel(eighths([5, 7, 8, 7]), BAR, 1);

  it("is the note just due, held a thirty-second after", () => {
    const grace = BAR / 32;
    expect(currentOnset(m, 470, grace)?.index).toBe(1);
    expect(currentOnset(m, 480 + grace - 1, grace)?.index).toBe(1);
    expect(currentOnset(m, 480 + grace + 1, grace)?.index).toBe(2);
  });

  it("dims the next bar and what is after it", () => {
    expect([0, 1, 2, 3].map((b) => barRel(b, 1))).toEqual(["past", "now", "next", "later"]);
  });
});

describe("history colours", () => {
  it("maps the analyzer's marks to good, early, late and miss", () => {
    expect(resultOfMark("onTime")).toBe("good");
    expect(resultOfMark("slightlyEarly")).toBe("good");
    expect(resultOfMark("slightlyLate")).toBe("good");
    expect(resultOfMark("early")).toBe("early");
    expect(resultOfMark("late")).toBe("late");
    expect(resultOfMark("missed")).toBe("miss");
    expect(resultOfMark("notAssessed")).toBeNull();
  });

  it("turns lights by onset into results by note, a chord's notes together", () => {
    const schedule = {
      onsets: [
        { id: 0, beat: 0, noteIds: [0], soft: false, accent: false },
        { id: 1, beat: 0.5, noteIds: [1, 2], soft: false, accent: false },
      ],
      lengthBeats: 4,
      loops: false,
    };
    const out = resultsFromLights(
      new Map([
        [0, "early" as const],
        [1, "missed" as const],
      ]),
      schedule,
    );
    expect([...out]).toEqual([
      [0, "early"],
      [1, "miss"],
      [2, "miss"],
    ]);
  });

  it("gives every note of a real Take the id its score gives it", () => {
    for (const [packId, exerciseId] of [
      ["blues-pentatonics", "box-one.first-lick"],
      ["shred", "crossing.outside-pairs"],
      ["shred", "accents.three-against-four"],
    ] as const) {
      const doc = pack(packId);
      const exercise = findExercise(doc, exerciseId)!.exercise;
      const take = buildTake(doc, exercise, 80);
      const input = tabStripInputOfTake(take);
      const m = patternModel(input.notes, input.barTicks, input.patternBars);
      const drawn = occurrences(m, 0, 100, input.takeBars);
      expect(drawn.length, exerciseId).toBe(take.score.notes.length);
      for (const n of drawn) {
        const s = take.score.notes[n.id];
        expect([s.id, s.tick, s.string, s.fret], `${exerciseId} #${n.id}`).toEqual([n.id, n.at, n.string, n.fret]);
      }
    }
  });
});

describe("the rhythm hint", () => {
  it("beams eighths once, sixteenths twice, and quarters not at all", () => {
    expect(beamsFor(960)).toBe(0);
    expect(beamsFor(480)).toBe(1);
    expect(beamsFor(320)).toBe(1);
    expect(beamsFor(240)).toBe(2);
    expect(beamsFor(160)).toBe(2);
    expect(beamsFor(120)).toBe(3);
  });
});

describe("technique marks (card #40)", () => {
  const BAR = 3840;
  const n = (string: number, fret: number, tick: number, tech: PathTechnique[] = [], bend?: number) => ({
    string,
    fret,
    tick,
    dur: 240,
    tech,
    ...(bend !== undefined ? { bend } : {}),
  });

  it("puts h, p and t on the note they arrive at, from the note before on that string", () => {
    const m = patternModel([n(1, 12, 0, ["tap"]), n(1, 5, 320, ["pull"]), n(1, 8, 640, ["hammer"])], BAR, 1);
    expect(m.notes.map((x) => x.link?.mark)).toEqual(["t", "p", "h"]);
    expect(m.notes[1].link?.fromTicks).toBe(320);
    // The first note's tap comes from the last of the pass before, round the seam.
    expect(m.notes[0].link?.fromTicks).toBe(BAR - 640);
  });

  it("moves a slide onto the note it lands on, up or down", () => {
    const m = patternModel([n(3, 5, 0, ["slide"]), n(3, 7, 960), n(3, 7, 1920, ["slide"]), n(3, 5, 2880)], BAR, 1);
    expect(m.notes.map((x) => x.link?.mark)).toEqual([undefined, "/", undefined, "\\"]);
  });

  it("keeps a bend's target fret and vibrato after the number", () => {
    const m = patternModel([n(3, 7, 0, ["bend", "vibrato"], 2), n(2, 5, 960, ["vibrato"])], BAR, 1);
    expect(m.notes[0].after).toEqual({ bendTo: 9, vibrato: true });
    expect(m.notes[1].after).toEqual({ vibrato: true });
  });

  it("marks nothing on a plain note", () => {
    const m = patternModel([n(1, 5, 0), n(1, 7, 960)], BAR, 1);
    expect(m.notes.every((x) => !x.link && !x.after)).toBe(true);
  });
});

describe("the phone's scrolling view (acceptance 2, N-P1-2)", () => {
  const sixteenths = (n: number) => Array.from({ length: n }, (_u, i) => ({ string: 2, fret: 5 + (i % 4), tick: i * 240, dur: 240 }));
  for (const width of [290, 330]) {
    it(`keeps the column a quarter in and at least the rest of a beat and the next beat ahead at ${width} px`, () => {
      for (const notes of [eighths([5, 6, 7, 8, 7, 6, 5, 6]), sixteenths(16)]) {
        const m = patternModel(notes, BAR, 1);
        const l = scrollLayout(m, width, 300);
        expect(l.cursorX / l.windowWidth).toBeCloseTo(SCROLL_AT, 1);
        const aheadTicks = (l.windowWidth - l.cursorX) / l.ppt;
        expect(aheadTicks).toBeGreaterThanOrEqual(m.beatTicks * 1.4);
        // Neighbours never closer than about one and a half numbers.
        expect(m.minGap * l.ppt).toBeGreaterThanOrEqual(l.fretPx * 1.4);
        // x is linear in ticks: no inset at a bar line.
        expect(noteXIn(BAR, l.ppt, m, l.geo) - noteXIn(0, l.ppt, m, l.geo)).toBeCloseTo(l.segWidth, 5);
      }
    });
  }
  it("shows a whole sparse bar ahead, and spreads the lines to a tall panel within reason", () => {
    const m = patternModel(eighths([5, 7]).map((n, i) => ({ ...n, tick: i * 1920, dur: 1920 })), BAR, 1);
    const l = scrollLayout(m, 330, 400);
    expect(l.windowWidth - l.cursorX).toBeGreaterThanOrEqual(l.segWidth - 1);
    expect(l.geo.gap).toBeLessThanOrEqual(Math.round(l.fretPx * 1.9));
    expect(l.geo.gap).toBeGreaterThan(staffGeometry(l.fretPx).gap);
    expect(l.geo.height).toBeLessThanOrEqual(400);
  });
});

describe("a hammer-on from nowhere", () => {
  it("is marked h before its number, with no slur from the string's last note", () => {
    const m = patternModel(
      [
        { string: 6, fret: 8, tick: 0, dur: 160 },
        { string: 5, fret: 5, tick: 160, dur: 160, tech: ["hammer"] },
        { string: 5, fret: 7, tick: 320, dur: 160, tech: ["hammer"] },
      ],
      BAR,
      1,
    );
    const [, nowhere, after] = m.notes;
    expect(nowhere.link).toEqual({ mark: "h", fromTicks: m.passTicks });
    expect(after.link).toEqual({ mark: "h", fromTicks: 160 });
  });
});

describe("a follow panel's numbers fit its height (acceptance 5: cut off at 1024x700)", () => {
  it("are held to the panel, never under 18, and by the width alone when it is unknown", async () => {
    const { followFretPx, staffGeometry, FOLLOW_TOP_PX } = await import("./tabStripModel");
    expect(followFretPx(34, 0)).toBe(34);
    expect(followFretPx(34, 1000)).toBe(34);
    const f = followFretPx(34, 263);
    expect(f).toBeLessThan(34);
    expect(staffGeometry(f).height + FOLLOW_TOP_PX).toBeLessThanOrEqual(263);
    expect(followFretPx(34, 40)).toBe(18);
  });
});
