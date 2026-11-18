import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { PathDoc } from "../../../paths/format";
import { findExercise } from "../../../session/packs";
import { buildTake } from "../../../session/take";
import {
  CURSOR_AT,
  FRET_PX,
  barLinePad,
  barRel,
  beamsFor,
  currentOnset,
  describePattern,
  followScale,
  fretPxFor,
  occurrences,
  passWindow,
  patternModel,
  previewScale,
  resultOfMark,
  resultsFromLights,
  stripOffset,
  tabStripInputOfTake,
  tickX,
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

describe("tick to x", () => {
  it("puts the cursor 30 % in and sizes the rest for this bar and the next", () => {
    const m = patternModel(eighths([5, 7, 8, 7, 5, 3, 5, 3]), BAR, 1);
    const s = followScale(m, 1300);
    expect(s.cursorX).toBe(Math.round(1300 * CURSOR_AT));
    expect(s.ppt * 2 * BAR).toBeCloseTo(1300 - s.cursorX, 5);
    // The tick under the cursor is drawn at the cursor.
    for (const tick of [0, 1234, 7680]) expect(tickX(tick, s) + stripOffset(tick, s)).toBeCloseTo(s.cursorX, 6);
    expect(s.fretPx).toBe(FRET_PX);
  });

  it("zooms in rather than let sixteenths collide", () => {
    const m = patternModel(
      Array.from({ length: 16 }, (_u, i) => ({ string: 1, fret: 5, tick: i * 240, dur: 240 })),
      BAR,
      1,
    );
    const s = followScale(m, 1000);
    expect(s.ppt * 240).toBeGreaterThanOrEqual(s.minGapPx - 1e-9);
  });

  it("keeps numbers at 34 px from 760 px wide and shrinks them on a phone", () => {
    expect(fretPxFor(1300)).toBe(34);
    expect(fretPxFor(960)).toBe(34);
    expect(fretPxFor(340)).toBeLessThan(34);
    expect(fretPxFor(340)).toBeGreaterThanOrEqual(20);
  });

  it("preview fits one pass inside the width, margins included", () => {
    const m = patternModel(eighths([5, 7, 8, 7, 5, 3, 5, 3]), BAR, 2);
    const s = previewScale(m, 1200);
    expect(s.margin + 2 * BAR * s.ppt + s.margin).toBeCloseTo(1200, 5);
    expect(s.fretPx).toBe(34);
  });

  it("preview shrinks the numbers before they collide, never below 15 px", () => {
    const m = patternModel(
      Array.from({ length: 64 }, (_u, i) => ({ string: 1, fret: 12, tick: i * 240, dur: 240 })),
      BAR,
      4,
    );
    const s = previewScale(m, 900);
    expect(s.fretPx).toBeLessThan(34);
    expect(s.fretPx).toBeGreaterThanOrEqual(15);
  });

  it("puts a bar line a little before beat one, never on the note", () => {
    const m = patternModel(eighths([5, 7]), BAR, 1);
    const s = followScale(m, 1300);
    const pad = barLinePad(m, s.ppt);
    expect(pad).toBeGreaterThan(0);
    expect(pad).toBeLessThanOrEqual(28);
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

  it("draws enough passes to fill the view either side of the cursor", () => {
    const s = followScale(m, 1300);
    const w = passWindow(m, 5 * BAR + 100, s, 1300);
    const passPx = BAR * s.ppt;
    expect(w.from * passPx + stripOffset(5 * BAR + 100, s)).toBeLessThanOrEqual(0);
    expect((w.to + 1) * passPx + stripOffset(5 * BAR + 100, s)).toBeGreaterThanOrEqual(1300);
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
