import { describe, expect, it } from "vitest";
import { CHORD_QUALITIES, chordTones, mod12, type ChordQuality } from "./diatonic";
import {
  BASS_TUNING,
  GUITAR_TUNING,
  MAX_FRET,
  SHAPES,
  baseFretFor,
  shapesFor,
  spellsChord,
  type Instrument,
  type PlacedShape,
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
  it("finds at least one guitar and one bass shape for every quality at every root", () => {
    const empty: string[] = [];
    for (const instrument of INSTRUMENTS) {
      for (const quality of CHORD_QUALITIES) {
        for (const root of ROOTS) {
          if (shapesFor(root, quality, { instrument }).length === 0) {
            empty.push(instrument + " " + quality + " " + String(root));
          }
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
  const triads = SHAPES.filter((s) => s.size === "triad" && s.instrument === "guitar");

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
