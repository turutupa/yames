import { describe, expect, it } from "vitest";
import {
  CHORD_QUALITIES,
  chordName,
  chordPitchClasses,
  chordTones,
  chordsInKey,
  mod12,
  noteName,
  seventhsInKey,
} from "./diatonic";

/**
 * The chords in a key are the first thing a player checks, so they have to be
 * right for every key, not just the one the developer tried.
 */
describe("chordsInKey", () => {
  it("gives A major its seven chords", () => {
    const chords = chordsInKey(9, "major");
    expect(chords.map((c) => chordName(c.root, c.quality, 9))).toEqual([
      "A",
      "Bm",
      "C#m",
      "D",
      "E",
      "F#m",
      "G#dim",
    ]);
    expect(chords.map((c) => c.degree)).toEqual(["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
  });

  it("starts an A blues on A7 D7 E7", () => {
    const chords = chordsInKey(9, "blues");
    expect(chords.slice(0, 3).map((c) => chordName(c.root, c.quality, 9))).toEqual(["A7", "D7", "E7"]);
    expect(chords.map((c) => c.degree)).toEqual(["I7", "IV7", "V7", "bIII", "bVII"]);
  });

  it("lists the borrowed V7 beside the minor v", () => {
    const chords = chordsInKey(9, "minor");
    const dominants = chords.filter((c) => c.root === mod12(9 + 7));
    expect(dominants.map((c) => c.quality)).toEqual(["min", "7"]);
    expect(dominants.map((c) => c.degree)).toEqual(["v", "V7"]);
  });

  it("keeps every root inside the octave for every key and mode", () => {
    for (const mode of ["major", "minor", "blues"] as const) {
      for (let root = 0; root < 12; root++) {
        for (const chord of chordsInKey(root, mode)) {
          expect(chord.root).toBeGreaterThanOrEqual(0);
          expect(chord.root).toBeLessThan(12);
        }
      }
    }
  });

  it("transposes as a whole: every key is the same shape of key", () => {
    for (const mode of ["major", "minor", "blues"] as const) {
      const c = chordsInKey(0, mode);
      for (let root = 1; root < 12; root++) {
        const moved = chordsInKey(root, mode);
        expect(moved.map((x) => x.quality)).toEqual(c.map((x) => x.quality));
        expect(moved.map((x) => mod12(x.root - root))).toEqual(c.map((x) => x.root));
      }
    }
  });

  it("gives every major degree a seventh a player would actually add", () => {
    const sevenths = seventhsInKey(0, "major");
    expect(sevenths.map((c) => c.quality)).toEqual([
      "maj7",
      "m7",
      "m7",
      "maj7",
      "7",
      "m7",
      "m7b5",
    ]);
    // The seventh sits on the same root as the triad it came from.
    expect(sevenths.map((c) => c.root)).toEqual(chordsInKey(0, "major").map((c) => c.root));
  });
});

describe("chordTones", () => {
  it("knows a third from a flat third and a seventh from a major seventh", () => {
    expect(chordTones("maj")).toEqual([0, 4, 7]);
    expect(chordTones("min")).toEqual([0, 3, 7]);
    expect(chordTones("7")).toEqual([0, 4, 7, 10]);
    expect(chordTones("maj7")).toEqual([0, 4, 7, 11]);
    expect(chordTones("m7b5")).toEqual([0, 3, 6, 10]);
    expect(chordTones("dim7")).toEqual([0, 3, 6, 9]);
  });

  it("has an entry for every quality, all of them distinct and in the octave", () => {
    for (const quality of CHORD_QUALITIES) {
      const tones = chordTones(quality);
      expect(tones.length).toBeGreaterThanOrEqual(3);
      expect(new Set(tones).size).toBe(tones.length);
      expect(tones[0]).toBe(0);
      for (const t of tones) expect(t).toBeLessThan(12);
    }
  });

  it("hands back a copy, so a caller cannot bend the theory", () => {
    const tones = chordTones("maj");
    tones.push(99);
    expect(chordTones("maj")).toEqual([0, 4, 7]);
  });

  it("spells a chord at any root", () => {
    expect(chordPitchClasses({ root: 9, quality: "7" })).toEqual([9, 1, 4, 7]);
  });
});

describe("chordName", () => {
  it("follows the key's accidentals", () => {
    expect(noteName(6, 2)).toBe("F#"); // in D, a sharp key
    expect(noteName(6, 5)).toBe("Gb"); // in F, a flat key
    expect(chordName(3, "maj7", 10)).toBe("Ebmaj7"); // in Bb
    expect(chordName(1, "min")).toBe("C#m"); // no key given
  });

  it("writes the suffixes a player reads", () => {
    expect(chordName(9, "maj")).toBe("A");
    expect(chordName(2, "m7")).toBe("Dm7");
    expect(chordName(11, "m7b5")).toBe("Bm7b5");
    expect(chordName(4, "sus4")).toBe("Esus4");
    expect(chordName(0, "add9")).toBe("Cadd9");
  });
});
