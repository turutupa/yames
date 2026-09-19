import { describe, expect, it } from "vitest";
import { CHORD_QUALITIES, chordTones, mod12, type ChordQuality } from "./diatonic";
import {
  BASS_TUNING,
  GUITAR_TUNING,
  MAX_FRET,
  SHAPES,
  baseFretFor,
  shapeCount,
  shapesFor,
  spellsChord,
  type Instrument,
  type PlacedShape,
  GUITAR_ONLY_QUALITIES,
} from "./chordShapes";

const INSTRUMENTS: Instrument[] = ["guitar", "bass"];
const ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function every(fn: (shape: PlacedShape, quality: ChordQuality, root: number, instrument: Instrument) => void) {
  for (const instrument of INSTRUMENTS) {
    for (const quality of CHORD_QUALITIES) {
      for (const root of ROOTS) {
        for (const shape of shapesFor(root, quality, { instrument })) {
          fn(shape, quality, root, instrument);
        }
      }
    }
  }
}

/**
 * The one test that matters.
 *
 * A chord diagram is a promise: put your fingers here and this chord comes
 * out. Every shape in the library is slid to all twelve roots and the notes
 * it sounds are compared with the notes the chord is made of. A wrong note
 * or a missing third is a shape that teaches a player something false — the
 * one bug in this feature that a musician would never forgive.
 *
 * The perfect fifth is the single exception, and it is not a fudge: it is
 * the note that says nothing about a chord's quality, which is why players
 * drop it and why `m7b5` shapes must still keep their flat five.
 */
describe("every shape spells its chord", () => {
  it("sounds only chord tones, at every root, on both instruments", () => {
    const wrong: string[] = [];
    every((shape, quality, root, instrument) => {
      if (!spellsChord(quality, root, shape.pitches)) {
        wrong.push(instrument + " " + shape.shapeId + " " + quality + " root " + String(root));
      }
    });
    expect(wrong).toEqual([]);
  });

  it("always sounds the root itself", () => {
    const rootless: string[] = [];
    every((shape, _quality, root) => {
      if (!shape.pitches.includes(root)) rootless.push(shape.id);
    });
    expect(rootless).toEqual([]);
  });

  it("names the string the root is on", () => {
    every((shape) => {
      expect(shape.rootString).not.toBeNull();
      const index = shape.pitches.length - (shape.rootString as number);
      expect(shape.pitches[index]).toBe(shape.root);
    });
  });

  it("checks a real number of shapes, so none of the above passes vacuously", () => {
    let count = 0;
    every(() => {
      count += 1;
    });
    expect(count).toBeGreaterThan(1000);
  });
});

describe("the library itself", () => {
  it("has no two shapes with the same id", () => {
    const ids = SHAPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a fret and a finger for every string, and a finger wherever a fret is", () => {
    for (const shape of SHAPES) {
      const strings = shape.instrument === "bass" ? BASS_TUNING.length : GUITAR_TUNING.length;
      expect(shape.frets.length).toBe(strings);
      expect(shape.fingers.length).toBe(strings);
      shape.frets.forEach((fret, i) => {
        if (fret === null || fret === 0) return;
        expect(shape.fingers[i]).toBeGreaterThanOrEqual(1);
        expect(shape.fingers[i]).toBeLessThanOrEqual(4);
      });
    }
  });

  it("stores a base fret that matches the frets it stores", () => {
    for (const shape of SHAPES) {
      expect(shape.baseFret).toBe(baseFretFor(shape.frets));
    }
  });

  it("keeps every movable shape off the nut, so sliding it never goes negative", () => {
    for (const shape of SHAPES) {
      if (!shape.movable) continue;
      const fretted = shape.frets.filter((f): f is number => f !== null);
      expect(Math.min(...fretted)).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps a shape inside five frets, because that is the box a diagram draws", () => {
    for (const shape of SHAPES) {
      const fretted = shape.frets.filter((f): f is number => f !== null && f > 0);
      if (fretted.length === 0) continue;
      expect(Math.max(...fretted) - shape.baseFret).toBeLessThanOrEqual(4);
    }
  });

  it("keeps a barre on a fret the shape actually uses", () => {
    for (const shape of SHAPES) {
      if (!shape.barre) continue;
      expect(shape.frets).toContain(shape.barre.fret);
      expect(shape.barre.from).toBeGreaterThan(shape.barre.to);
    }
  });
});

describe("the shapes a player already knows", () => {
  it("has open C as x32010", () => {
    const open = shapesFor(0, "maj").find((s) => s.shapeId === "open-c");
    expect(open?.frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(open?.baseFret).toBe(1);
    expect(open?.size).toBe("open");
  });

  it("has the E-form barre for F as 133211 at fret 1", () => {
    const barre = shapesFor(5, "maj").find((s) => s.shapeId === "maj-e-form");
    expect(barre?.frets).toEqual([1, 3, 3, 2, 1, 1]);
    expect(barre?.baseFret).toBe(1);
    expect(barre?.barre).toEqual({ fret: 1, from: 6, to: 1 });
  });

  it("slides the same E-form up to fret 5 for A", () => {
    const barre = shapesFor(9, "maj").find((s) => s.shapeId === "maj-e-form");
    expect(barre?.frets).toEqual([5, 7, 7, 6, 5, 5]);
    expect(barre?.baseFret).toBe(5);
    expect(barre?.barre).toEqual({ fret: 5, from: 6, to: 1 });
  });

  it("offers the open shapes only for their own chord", () => {
    expect(shapesFor(0, "maj").some((s) => s.shapeId === "open-c")).toBe(true);
    expect(shapesFor(1, "maj").some((s) => s.shapeId === "open-c")).toBe(false);
  });

  it("puts the diminished seventh grip on every minor third up the neck", () => {
    const positions = shapesFor(2, "dim7").map((s) => s.position);
    expect(positions.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i] - positions[i - 1]).toBe(3);
    }
  });
});

describe("shapesFor", () => {
  it("finds at least one shape for every quality at every root", () => {
    // Both instruments, except for the extended chords: a bassist does not
    // play a thirteenth, they play the shell of the seventh under it, and
    // `bandChord.ts` maps each of them to that seventh for the same reason.
    // There is nothing to draw, rather than something missing.
    const empty: string[] = [];
    for (const instrument of INSTRUMENTS) {
      for (const quality of CHORD_QUALITIES) {
        if (instrument === "bass" && GUITAR_ONLY_QUALITIES.includes(quality)) continue;
        for (const root of ROOTS) {
          if (shapesFor(root, quality, { instrument }).length === 0) {
            empty.push(instrument + " " + quality + " " + String(root));
          }
        }
      }
    }
    expect(empty).toEqual([]);
  });

  it("gives the guitar a grip for every chord type the chart prints", () => {
    // The chart is the whole point, and a blank cell in it is the thing the
    // owner objected to. Every quality, every root, a shape.
    const empty: string[] = [];
    for (const quality of CHORD_QUALITIES) {
      for (const root of ROOTS) {
        if (shapesFor(root, quality, { instrument: "guitar" }).length === 0) {
          empty.push(quality + " at " + String(root));
        }
      }
    }
    expect(empty).toEqual([]);
  });

  it("orders shapes along the neck, low to high", () => {
    every(() => {});
    for (const instrument of INSTRUMENTS) {
      for (const quality of CHORD_QUALITIES) {
        for (const root of ROOTS) {
          const positions = shapesFor(root, quality, { instrument }).map((s) => s.position);
          const sorted = [...positions].sort((a, b) => a - b);
          expect(positions).toEqual(sorted);
        }
      }
    }
  });

  it("never draws a shape past fret 15", () => {
    every((shape) => {
      for (const fret of shape.frets) {
        if (fret === null) continue;
        expect(fret).toBeLessThanOrEqual(MAX_FRET);
      }
    });
  });

  it("returns no two shapes with the same frets", () => {
    for (const instrument of INSTRUMENTS) {
      for (const quality of CHORD_QUALITIES) {
        for (const root of ROOTS) {
          const keys = shapesFor(root, quality, { instrument }).map((s) => s.frets.join(","));
          expect(new Set(keys).size).toBe(keys.length);
        }
      }
    }
  });

  it("defaults to the guitar", () => {
    expect(shapesFor(0, "maj")).toEqual(shapesFor(0, "maj", { instrument: "guitar" }));
  });

  it("keeps bass shapes on four strings", () => {
    for (const quality of CHORD_QUALITIES) {
      for (const root of ROOTS) {
        for (const shape of shapesFor(root, quality, { instrument: "bass" })) {
          expect(shape.frets.length).toBe(4);
          expect(shape.pitches.length).toBe(4);
          expect(shape.rootString).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it("offers the triads, the open shapes and the fuller grips a guitarist expects", () => {
    const sizes = new Set(shapesFor(9, "maj").map((s) => s.size));
    expect(sizes.has("triad")).toBe(true);
    expect(sizes.has("open")).toBe(true);
    expect(sizes.has("barre")).toBe(true);
    const seventh = new Set(shapesFor(9, "7").map((s) => s.size));
    expect(seventh.has("seventh")).toBe(true);
  });

  it("counts a root as the same chord however you spell the number", () => {
    expect(shapesFor(14, "maj").map((s) => s.id)).toEqual(shapesFor(2, "maj").map((s) => s.id));
    expect(shapesFor(-1, "maj").map((s) => s.id)).toEqual(shapesFor(11, "maj").map((s) => s.id));
  });
});

describe("three-string triads", () => {
  // The generated ones, by id. `size: "triad"` means "the small grips" and the
  // power chords wear it too, so the size alone no longer names this family.
  const triads = SHAPES.filter((s) => s.instrument === "guitar" && s.id.startsWith("triad-"));

  it("covers three string sets and three inversions for four qualities", () => {
    expect(triads.length).toBe(36);
  });

  it("sounds exactly three strings", () => {
    for (const shape of triads) {
      expect(shape.frets.filter((f) => f !== null).length).toBe(3);
    }
  });

  it("puts the right chord tone in the bass for each inversion", () => {
    for (const shape of triads) {
      const inversion = Number(shape.id.slice(-1));
      const lowest = shape.frets.findIndex((f) => f !== null);
      const bass = mod12(GUITAR_TUNING[lowest] + (shape.frets[lowest] as number));
      expect(bass).toBe(mod12(shape.root + chordTones(shape.quality)[inversion]));
    }
  });
});

/**
 * Power chords.
 *
 * The first chord a rock player learns and, until now, the one the library
 * could not draw. Two notes: the root and the fifth. A power chord with a
 * third in it is a major or a minor chord and no longer the thing the
 * guitarist asked for, and a power chord with the FIFTH missing is one note,
 * so the checks below run in both directions.
 */
describe("power chords", () => {
  const ROOT_AND_FIFTH = (root: number) => new Set([mod12(root), mod12(root + 7)]);

  it("sounds the root and the fifth and nothing else, at every root, on both instruments", () => {
    for (const instrument of INSTRUMENTS) {
      for (const root of ROOTS) {
        for (const shape of shapesFor(root, "5", { instrument })) {
          const want = ROOT_AND_FIFTH(root);
          const got = new Set(shape.pitches.filter((p): p is number => p !== null));
          expect([...got].sort(), shape.id).toEqual([...want].sort());
        }
      }
    }
  });

  it("keeps the fifth, because on this chord it is not the note you drop", () => {
    // The rule lives in `spellsChord`, not in the shape builder: the fifth is
    // droppable while some other note still says what the chord is, and a
    // power chord has no other note.
    expect(spellsChord("5", 0, [0, 7, null, null, null, null])).toBe(true);
    expect(spellsChord("5", 0, [0, null, null, null, null, null])).toBe(false);
    // The same lone root IS an acceptable major triad shell nowhere either,
    // but a major chord may lose its fifth and keep its third.
    expect(spellsChord("maj", 0, [0, 4, null, null, null, null])).toBe(true);
  });

  it("gives every root three guitar grips and two bass shapes at the very least", () => {
    expect(shapeCount("5", "guitar")).toBeGreaterThanOrEqual(3);
    expect(shapeCount("5", "bass")).toBeGreaterThanOrEqual(2);
    for (const root of ROOTS) {
      expect(shapesFor(root, "5").length, `guitar ${root}`).toBeGreaterThanOrEqual(3);
      expect(
        shapesFor(root, "5", { instrument: "bass" }).length,
        `bass ${root}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("offers the two-string grip and the one with the octave, on each of three strings", () => {
    const ids = new Set(SHAPES.filter((s) => s.quality === "5").map((s) => s.id));
    for (const id of [
      "power-e-string",
      "power-e-string-octave",
      "power-a-string",
      "power-a-string-octave",
      "power-d-string",
      "power-d-string-octave",
      "bass-power-root4",
      "bass-power-root3",
      "bass-power-octave-root4",
      "bass-power-octave-root3",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("has E5, A5 and D5 at the nut, where a player actually plays them", () => {
    // A movable grip is written at fret 1 and only slides up, so without these
    // the first three power chords anybody learns would be drawn at fret 12.
    const nut: [number, string, (number | null)[]][] = [
      [4, "open E5", [0, 2, 2, null, null, null]],
      [9, "open A5", [null, 0, 2, 2, null, null]],
      [2, "open D5", [null, null, 0, 2, 3, null]],
    ];
    for (const [root, name, frets] of nut) {
      const open = shapesFor(root, "5").find((s) => s.name === name);
      expect(open?.frets, name).toEqual(frets);
      expect(open?.position, name).toBe(0);
    }
  });

  it("names them the way a player names them, by the string the root is on", () => {
    const names = SHAPES.filter((s) => s.quality === "5" && s.instrument === "guitar").map(
      (s) => s.name,
    );
    expect(names).toContain("E-string power chord");
    expect(names).toContain("A-string power chord, with the octave");
  });
});
