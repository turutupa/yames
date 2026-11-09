// The templates are pinned to the shapes every guitarist knows. If `boxCells`
// drifts by a fret, the box is wrong in every Exercise that uses it.
import { describe, expect, it } from "vitest";
import { STANDARD_TUNING } from "./format";
import {
  acrossStrings,
  arpeggioCells,
  boxCells,
  inPositions,
  ladder,
  pentatonic,
  repeat,
  shiftFrets,
  sweepLoop,
  threeNps,
} from "./templates";
import { chordPcs, spellChord, spellScale } from "./theory";

const cells = (list: { string: number; fret: number }[]) =>
  list.map((c) => `${c.string}:${c.fret}`).join(" ");

describe("pentatonic boxes", () => {
  it("are the five shapes in A minor", () => {
    expect(cells(boxCells("A", 1, "minorPentatonic"))).toBe("6:5 6:8 5:5 5:7 4:5 4:7 3:5 3:7 2:5 2:8 1:5 1:8");
    expect(cells(boxCells("A", 2, "minorPentatonic"))).toBe("6:8 6:10 5:7 5:10 4:7 4:10 3:7 3:9 2:8 2:10 1:8 1:10");
    expect(cells(boxCells("A", 3, "minorPentatonic"))).toBe("6:10 6:12 5:10 5:12 4:10 4:12 3:9 3:12 2:10 2:13 1:10 1:12");
    expect(cells(boxCells("A", 4, "minorPentatonic"))).toBe("6:12 6:15 5:12 5:15 4:12 4:14 3:12 3:14 2:13 2:15 1:12 1:15");
    expect(cells(boxCells("A", 5, "minorPentatonic"))).toBe("6:15 6:17 5:15 5:17 4:14 4:17 3:14 3:17 2:15 2:17 1:15 1:17");
  });

  it("move with the key", () => {
    expect(cells(boxCells("E", 1, "minorPentatonic"))).toBe("6:0 6:3 5:0 5:2 4:0 4:2 3:0 3:2 2:0 2:3 1:0 1:3");
  });

  it("add the flat five inside the box frets for the blues scale", () => {
    expect(cells(boxCells("A", 1, "blues"))).toBe("6:5 6:8 5:5 5:6 5:7 4:5 4:7 3:5 3:7 3:8 2:5 2:8 1:5 1:8");
  });

  it("sequence", () => {
    expect(pentatonic({ root: "A", box: 1, sequence: "threesDown", strings: [2, 1] })).toBe(
      "1:8 1:5 2:8 1:5 2:8 2:5",
    );
    expect(pentatonic({ root: "A", box: 1, sequence: "updown", strings: [2, 1] })).toBe(
      "2:5 2:8 1:5 1:8 1:5 2:8",
    );
  });
});

describe("three notes per string", () => {
  it("is the usual A minor shape", () => {
    expect(threeNps({ root: "A", scale: "naturalMinor", string: 6, fret: 5, strings: 6, sequence: "up" })).toBe(
      "6:5 6:7 6:8 5:5 5:7 5:8 4:5 4:7 4:9 3:5 3:7 3:9 2:6 2:8 2:10 1:7 1:8 1:10",
    );
  });

  it("refuses a starting note outside the scale", () => {
    expect(() => threeNps({ root: "A", scale: "naturalMinor", string: 6, fret: 6, strings: 3, sequence: "up" })).toThrow(
      /not in A/,
    );
  });
});

describe("sweep shapes", () => {
  it("are the classic arpeggios", () => {
    expect(sweepLoop({ chord: "Am", strings: [3, 2, 1], near: 14 })).toBe("3:14 2:13 1:12 1:17h 1:12p 2:13");
    expect(sweepLoop({ chord: "C", strings: [3, 2, 1], near: 12 })).toBe("3:12 2:13 1:12 1:15h 1:12p 2:13");
    expect(sweepLoop({ chord: "Am", strings: [5, 4, 3, 2, 1], near: 12, doubleLow: true })).toBe(
      "5:12 5:15h 4:14 3:14 2:13 1:12 1:17h 1:12p 2:13 3:14 4:14 5:15",
    );
  });

  it("can slide to a top note a hammer would not reach", () => {
    expect(sweepLoop({ chord: "Em", strings: [5, 4, 3, 2, 1], near: 7, doubleLow: true, slideTop: true })).toBe(
      "5:7 5:10h 4:9 3:9 2:8 1:7s 1:12s 1:7 2:8 3:9 4:9 5:10",
    );
  });

  it("every cell of every shape is a tone of the chord", () => {
    for (const [chord, strings, near] of [
      ["Am", [3, 2, 1], 14],
      ["G#dim7", [3, 2, 1], 13],
      ["F", [5, 4, 3, 2, 1], 8],
      ["Dm", [4, 3, 2, 1], 12],
    ] as const) {
      const { up, top } = arpeggioCells({ chord, strings, near, top: true });
      const pcs = chordPcs(chord);
      for (const c of [...up, top!]) {
        expect(pcs).toContain((STANDARD_TUNING[c.string - 1] + c.fret) % 12);
      }
    }
  });
});

describe("simple helpers", () => {
  it("move a pattern to other positions", () => {
    expect(shiftFrets("5:5h 4:7>", 2)).toBe("5:7h 4:9>");
    expect(inPositions("5:5", [0, 5])).toBe("5:5 | 5:10");
    expect(acrossStrings({ cell: [0, 2], strings: [6, 5], fret: 5, climb: 1 })).toBe("6:5 6:7 5:6 5:8");
    expect(repeat("1:1", 3)).toBe("1:1 1:1 1:1");
    expect(ladder(50, 75, 10)).toEqual([50, 60, 70, 75]);
  });

  it("shift refuses to go below the nut", () => {
    expect(() => shiftFrets("5:1", -2)).toThrow(/below the nut/);
  });
});

describe("spelling", () => {
  it("spells what a lesson has to say", () => {
    expect(spellScale("A", "blues")).toEqual(["A", "C", "D", "Eb", "E", "G"]);
    expect(spellScale("E", "minorPentatonic")).toEqual(["E", "G", "A", "B", "D"]);
    expect(spellChord("E7")).toEqual(["E", "G#", "B", "D"]);
    expect(spellChord("A7")).toEqual(["A", "C#", "E", "G"]);
    expect(spellChord("G#dim7")).toEqual(["G#", "B", "D", "F"]);
    expect(spellChord("Fdim7")).toEqual(["F", "Ab", "Cb", "Ebb"]);
    expect(spellChord("Cm")).toEqual(["C", "Eb", "G"]);
  });
});
