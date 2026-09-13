import { describe, it, expect } from "vitest";
import {
  barsForForm,
  chordName,
  chordNotes,
  chordsForForm,
  displayTransposition,
  keyName,
  midiToName,
  nameToMidi,
  nameToPitchClass,
  noteName,
  parseChordName,
  parseKey,
  pitchClass,
  romanToChord,
  spellingForKey,
  tonicChord,
  transposeChord,
  transposeKey,
  transposePitchClass,
  transpositionForInstrument,
  type Chord,
  type ChordQuality,
  type Key,
  type KeyMode,
  type PitchClass,
} from "./harmony";
import { JAM_FORM_BARS, type JamFormKind } from "./types";

const MODES: KeyMode[] = ["major", "minor", "blues"];
const ALL_ROOTS: PitchClass[] = Array.from({ length: 12 }, (_unused, i) => i);
/** Every quality the union has, so a new one fails the round trip rather than skipping it. */
const ALL_QUALITIES: ChordQuality[] = [
  "maj",
  "min",
  "dim",
  "aug",
  "7",
  "maj7",
  "m7",
  "m7b5",
  "dim7",
  "sus2",
  "sus4",
  "6",
  "m6",
  "add9",
  "9",
];
const FORM_KINDS: JamFormKind[] = ["blues12", "loop8", "bars16", "aaba32", "one", "custom"];

/** The chord symbols of a form, as they would be printed on the timeline. */
function symbols(kind: JamFormKind, bars: number, key: Key): string[] {
  return chordsForForm(kind, bars, key).map((chord) => chordName(chord, key));
}

describe("pitch classes and names", () => {
  it("wraps any integer into 0..11, negatives included", () => {
    expect(pitchClass(0)).toBe(0);
    expect(pitchClass(12)).toBe(0);
    expect(pitchClass(13)).toBe(1);
    expect(pitchClass(-1)).toBe(11);
    expect(pitchClass(-13)).toBe(11);
  });

  it("names a pitch class under both spellings", () => {
    expect(noteName(10, "flat")).toBe("Bb");
    expect(noteName(10, "sharp")).toBe("A#");
    expect(noteName(6, "sharp")).toBe("F#");
    expect(noteName(6, "flat")).toBe("Gb");
    // The naturals are the naturals whatever the policy says.
    expect(noteName(0, "flat")).toBe("C");
    expect(noteName(4, "sharp")).toBe("E");
  });

  it("round-trips every MIDI note through its name, in both spellings", () => {
    for (let midi = 0; midi <= 127; midi++) {
      for (const spelling of ["sharp", "flat"] as const) {
        const name = midiToName(midi, spelling);
        expect(nameToMidi(name), `${name} (${spelling}) should read back as ${midi}`).toBe(midi);
      }
    }
  });

  it("round-trips every pitch class through its name", () => {
    for (const pc of ALL_ROOTS) {
      expect(nameToPitchClass(noteName(pc, "sharp"))).toBe(pc);
      expect(nameToPitchClass(noteName(pc, "flat"))).toBe(pc);
    }
  });

  it("puts middle C at 60 and concert A at 69, as every tuner does", () => {
    expect(midiToName(60, "sharp")).toBe("C4");
    expect(midiToName(69, "sharp")).toBe("A4");
    // The guitar's low E and the bass's low E.
    expect(midiToName(40, "sharp")).toBe("E2");
    expect(midiToName(28, "sharp")).toBe("E1");
  });

  it("reads a name written with the other spelling, and refuses what is not a note", () => {
    expect(nameToMidi("Bb3")).toBe(58);
    expect(nameToMidi("A#3")).toBe(58);
    expect(nameToMidi("F#2")).toBe(42);
    expect(nameToMidi("H4")).toBeNull();
    expect(nameToMidi("")).toBeNull();
    expect(nameToPitchClass("Dm")).toBeNull();
  });
});

describe("the spelling policy", () => {
  it("uses sharps for G D A E B F# and flats for F Bb Eb Ab Db", () => {
    const sharpKeys = ["G", "D", "A", "E", "B", "F#"];
    const flatKeys = ["F", "Bb", "Eb", "Ab", "Db"];
    for (const name of sharpKeys) {
      const root = nameToPitchClass(name) as PitchClass;
      expect(spellingForKey({ root, mode: "major" }), `${name} major`).toBe("sharp");
    }
    for (const name of flatKeys) {
      const root = nameToPitchClass(name) as PitchClass;
      expect(spellingForKey({ root, mode: "major" }), `${name} major`).toBe("flat");
    }
  });

  it("gives a minor key the accidentals of its relative major", () => {
    // D minor is a flat key even though D major is a sharp one: one flat,
    // Bb, borrowed from F major. Getting this wrong spells the Andalusian
    // cadence in D minor as "A#".
    expect(spellingForKey({ root: 2, mode: "minor" })).toBe("flat");
    expect(spellingForKey({ root: 7, mode: "minor" })).toBe("flat"); // G minor
    expect(spellingForKey({ root: 4, mode: "minor" })).toBe("sharp"); // E minor
    expect(spellingForKey({ root: 11, mode: "minor" })).toBe("sharp"); // B minor
  });

  it("breaks the tie in the keys with no accidentals by mode", () => {
    // C major's one chromatic chord is the raised fourth of #ivdim7.
    expect(spellingForKey({ root: 0, mode: "major" })).toBe("sharp");
    // C minor and A minor want the flat third, sixth and seventh.
    expect(spellingForKey({ root: 9, mode: "minor" })).toBe("flat");
  });
});

describe("chord symbols", () => {
  it("writes a chord the way it is written on a chart", () => {
    const aBlues: Key = { root: 9, mode: "blues" };
    expect(chordName({ root: 9, quality: "7" }, aBlues)).toBe("A7");
    expect(chordName({ root: 2, quality: "m7" }, aBlues)).toBe("Dm7");
    const fMajor: Key = { root: 5, mode: "major" };
    expect(chordName({ root: 10, quality: "maj" }, fMajor)).toBe("Bb");
    expect(chordName({ root: 7, quality: "m7b5" }, fMajor)).toBe("Gm7b5");
    expect(chordName({ root: 0, quality: "dim7" }, fMajor)).toBe("Cdim7");
    expect(chordName({ root: 5, quality: "maj7" }, fMajor)).toBe("Fmaj7");
    expect(chordName({ root: 5, quality: "6" }, fMajor)).toBe("F6");
    expect(chordName({ root: 2, quality: "m6" }, fMajor)).toBe("Dm6");
    expect(chordName({ root: 0, quality: "9" }, fMajor)).toBe("C9");
    expect(chordName({ root: 2, quality: "min" }, fMajor)).toBe("Dm");
  });

  it("spells the notes of a chord, root first", () => {
    expect(chordNotes({ root: 9, quality: "7" })).toEqual([9, 1, 4, 7]); // A C# E G
    expect(chordNotes({ root: 2, quality: "m7" })).toEqual([2, 5, 9, 0]); // D F A C
    expect(chordNotes({ root: 11, quality: "dim7" })).toEqual([11, 2, 5, 8]); // B D F Ab
    expect(chordNotes({ root: 0, quality: "9" })).toEqual([0, 4, 7, 10, 2]); // C E G Bb D
  });
});

describe("roman numerals", () => {
  it("reads case as quality: V7 is a dominant, v7 is a minor seventh", () => {
    const c: Key = { root: 0, mode: "major" };
    expect(romanToChord("V7", c)).toEqual({ root: 7, quality: "7" });
    expect(romanToChord("v7", c)).toEqual({ root: 7, quality: "m7" });
    expect(romanToChord("V", c)).toEqual({ root: 7, quality: "maj" });
    expect(romanToChord("v", c)).toEqual({ root: 7, quality: "min" });
  });

  it("measures every degree from the major scale and writes accidentals out", () => {
    const c: Key = { root: 0, mode: "minor" };
    // In a minor key the third is still written bIII, so there is never a
    // question of what III means.
    expect(romanToChord("bIII7", c).root).toBe(3);
    expect(romanToChord("III7", c).root).toBe(4);
    expect(romanToChord("bVI7", c).root).toBe(8);
    expect(romanToChord("#ivdim7", c)).toEqual({ root: 6, quality: "dim7" });
    expect(romanToChord("iim7b5", c)).toEqual({ root: 2, quality: "m7b5" });
  });

  it("throws on a numeral it cannot read, so a typo in a table fails loudly", () => {
    const c: Key = { root: 0, mode: "major" };
    expect(() => romanToChord("viii", c)).toThrow();
    expect(() => romanToChord("X7", c)).toThrow();
    expect(() => romanToChord("Ixyz", c)).toThrow();
  });
});

describe("the forms", () => {
  it("returns exactly the bars asked for, for every form, key and mode", () => {
    for (const kind of FORM_KINDS) {
      for (const mode of MODES) {
        for (const root of ALL_ROOTS) {
          const key: Key = { root, mode };
          for (const bars of [1, 3, 4, 8, 12, 13, 16, 32, 64]) {
            expect(chordsForForm(kind, bars, key), `${kind} ${root} ${mode} ${bars}`).toHaveLength(
              bars,
            );
          }
          // Every chord of a full chorus is a chord someone can read: a root
          // in range, and a name that starts on a letter.
          for (const chord of chordsForForm(kind, 64, key)) {
            expect(chord.root).toBeGreaterThanOrEqual(0);
            expect(chord.root).toBeLessThan(12);
            expect(chordName(chord, key)).toMatch(/^[A-G][#b]?/);
          }
        }
      }
    }
  });

  it("plays the twelve-bar blues in A", () => {
    expect(symbols("blues12", 12, { root: 9, mode: "blues" })).toEqual([
      "A7",
      "A7",
      "A7",
      "A7",
      "D7",
      "D7",
      "A7",
      "A7",
      "E7",
      "D7",
      "A7",
      "E7",
    ]);
  });

  it("plays the minor blues in A minor, with its bVI7 in bar nine", () => {
    expect(symbols("blues12", 12, { root: 9, mode: "minor" })).toEqual([
      "Am7",
      "Am7",
      "Am7",
      "Am7",
      "Dm7",
      "Dm7",
      "Am7",
      "Am7",
      "F7",
      "E7",
      "Am7",
      "E7",
    ]);
  });

  it("plays the pop four and the Andalusian cadence over eight bars", () => {
    expect(symbols("loop8", 8, { root: 0, mode: "major" })).toEqual([
      "C",
      "G",
      "Am",
      "F",
      "C",
      "G",
      "Am",
      "F",
    ]);
    // D minor, correctly spelled: the bVI is Bb, never A#.
    expect(symbols("loop8", 8, { root: 2, mode: "minor" })).toEqual([
      "Dm",
      "C",
      "Bb",
      "A",
      "Dm",
      "C",
      "Bb",
      "A",
    ]);
    expect(symbols("loop8", 8, { root: 4, mode: "blues" })).toEqual([
      "E7",
      "A7",
      "E7",
      "A7",
      "E7",
      "A7",
      "E7",
      "A7",
    ]);
  });

  it("plays sixteen bars in C, turning round on the V", () => {
    expect(symbols("bars16", 16, { root: 0, mode: "major" })).toEqual([
      "C",
      "Am",
      "Dm",
      "G",
      "C",
      "Am",
      "Dm",
      "G",
      "F",
      "G",
      "C",
      "C",
      "F",
      "G",
      "C",
      "G",
    ]);
  });

  it("plays rhythm changes in Bb: the A section, and a bridge of D7 G7 C7 F7", () => {
    const bb: Key = { root: 10, mode: "major" };
    const bars = barsForForm("aaba32", 32, bb);
    expect(bars).toHaveLength(32);
    const names = bars.map((bar) => bar.chords.map((chord) => chordName(chord, bb)).join(" "));

    // The A section, two chords to the bar where it has two.
    expect(names.slice(0, 8)).toEqual([
      "Bb Gm",
      "Cm F",
      "Bb Gm",
      "Cm F",
      "Bb Bb7",
      "Eb Edim7",
      "Bb F",
      "Bb",
    ]);
    // AABA: the second and last A are the same eight bars.
    expect(names.slice(8, 16)).toEqual(names.slice(0, 8));
    expect(names.slice(24, 32)).toEqual(names.slice(0, 8));
    // The bridge: four dominants a fifth apart, two bars each.
    expect(names.slice(16, 24)).toEqual(["D7", "D7", "G7", "G7", "C7", "C7", "F7", "F7"]);
  });

  it("gives the minor bridge a cycle of dominants on the flat side", () => {
    const cm: Key = { root: 0, mode: "minor" };
    const names = barsForForm("aaba32", 32, cm).map((bar) =>
      bar.chords.map((chord) => chordName(chord, cm)).join(" "),
    );
    expect(names.slice(16, 24)).toEqual(["Eb7", "Eb7", "Ab7", "Ab7", "Db7", "Db7", "G7", "G7"]);
  });

  it("blows on one chord for four bars, in the key's own flavour", () => {
    expect(symbols("one", 4, { root: 7, mode: "blues" })).toEqual(["G7", "G7", "G7", "G7"]);
    expect(symbols("one", 4, { root: 7, mode: "major" })).toEqual(["G", "G", "G", "G"]);
    expect(symbols("one", 4, { root: 7, mode: "minor" })).toEqual(["Gm", "Gm", "Gm", "Gm"]);
  });

  it("fills a custom bar count with the tonic", () => {
    const key: Key = { root: 5, mode: "minor" };
    const chords = chordsForForm("custom", 7, key);
    expect(chords).toHaveLength(7);
    for (const chord of chords) expect(chord).toEqual(tonicChord(key));
  });

  it("repeats a short form and cuts off a long one to reach the bar count", () => {
    const key: Key = { root: 9, mode: "blues" };
    const twice = symbols("blues12", 24, key);
    expect(twice.slice(0, 12)).toEqual(twice.slice(12));
    // Asked for fewer bars than the form has, it stops where it is told.
    expect(symbols("blues12", 4, key)).toEqual(["A7", "A7", "A7", "A7"]);
    expect(chordsForForm("aaba32", 0, key)).toEqual([]);
    expect(chordsForForm("aaba32", -4, key)).toEqual([]);
  });

  it("shows the downbeat chord of a bar that holds two", () => {
    const bb: Key = { root: 10, mode: "major" };
    const bars = barsForForm("aaba32", 32, bb);
    const chords = chordsForForm("aaba32", 32, bb);
    expect(chords).toHaveLength(bars.length);
    bars.forEach((bar, index) => {
      expect(bar.chords.length).toBeGreaterThanOrEqual(1);
      expect(bar.chords.length).toBeLessThanOrEqual(2);
      expect(chords[index]).toEqual(bar.chords[0]);
    });
  });

  it("agrees with the contract about how long each form is", () => {
    // A form asked for twice its own length plays through twice, which is
    // only true if the table is exactly as long as the contract says.
    for (const [kind, length] of Object.entries(JAM_FORM_BARS)) {
      const key: Key = { root: 0, mode: "major" };
      const doubled = symbols(kind as JamFormKind, length * 2, key);
      expect(doubled.slice(0, length), kind).toEqual(doubled.slice(length));
    }
  });
});

describe("transposition", () => {
  it("wraps past B and below C", () => {
    expect(transposePitchClass(11, 2)).toBe(1);
    expect(transposePitchClass(0, -3)).toBe(9);
    expect(transposePitchClass(0, 24)).toBe(0);
    expect(transposePitchClass(5, -17)).toBe(0);
    expect(transposeChord({ root: 11, quality: "m7b5" }, 2)).toEqual({ root: 1, quality: "m7b5" });
    expect(transposeChord({ root: 0, quality: "7" }, -1)).toEqual({ root: 11, quality: "7" });
    expect(transposeKey({ root: 10, mode: "minor" }, 5)).toEqual({ root: 3, mode: "minor" });
  });

  it("writes a concert blues in A as a blues in B for a Bb horn", () => {
    const concert: Key = { root: 9, mode: "blues" };
    const written = transposeKey(concert, displayTransposition("bb"));
    expect(keyName(written)).toBe("B blues");
    const chords = chordsForForm("blues12", 12, concert)
      .map((chord) => transposeChord(chord, displayTransposition("bb")))
      .map((chord) => chordName(chord, written));
    expect(chords.slice(0, 5)).toEqual(["B7", "B7", "B7", "B7", "E7"]);
  });

  it("knows the two horn transpositions and leaves everyone else at concert", () => {
    expect(displayTransposition("concert")).toBe(0);
    expect(displayTransposition("bb")).toBe(2);
    expect(displayTransposition("eb")).toBe(9);
    for (const instrument of [
      "electric-guitar",
      "acoustic-guitar",
      "bass",
      "drums",
      "piano",
      "other",
    ] as const) {
      expect(transpositionForInstrument(instrument)).toBe("concert");
    }
  });
});

describe("the key as a saved string", () => {
  it("round-trips through the store's string field", () => {
    for (const mode of MODES) {
      for (const root of ALL_ROOTS) {
        const key: Key = { root, mode };
        expect(parseKey(keyName(key)), keyName(key)).toEqual(key);
      }
    }
  });

  it("reads a bare root as major and refuses what is not a key", () => {
    expect(keyName({ root: 9, mode: "major" })).toBe("A");
    expect(keyName({ root: 2, mode: "minor" })).toBe("Dm");
    expect(parseKey("A")).toEqual({ root: 9, mode: "major" });
    expect(parseKey("Dm")).toEqual({ root: 2, mode: "minor" });
    expect(parseKey("Bb minor")).toEqual({ root: 10, mode: "minor" });
    expect(parseKey("")).toBeNull();
    expect(parseKey("banana")).toBeNull();
  });
});

describe("parseChordName", () => {
  /**
   * The round trip is the contract: a progression is stored as the text
   * `chordName` writes and read back through `parseChordName`. Anything this
   * loop misses is a chord that would come back as "as the form" the next
   * time the jam was opened.
   */
  it("reads back every chord chordName can write, in every key", () => {
    for (const mode of MODES) {
      for (const keyRoot of ALL_ROOTS) {
        const key: Key = { root: keyRoot, mode };
        for (const quality of ALL_QUALITIES) {
          for (const root of ALL_ROOTS) {
            const chord: Chord = { root, quality };
            const written = chordName(chord, key);
            expect(parseChordName(written), written).toEqual(chord);
          }
        }
      }
    }
  });

  it("takes either spelling of an accidental", () => {
    expect(parseChordName("Bb")).toEqual({ root: 10, quality: "maj" });
    expect(parseChordName("A#")).toEqual({ root: 10, quality: "maj" });
    expect(parseChordName("B♭m7")).toEqual({ root: 10, quality: "m7" });
    expect(parseChordName("A♯m7")).toEqual({ root: 10, quality: "m7" });
  });

  it("takes the spellings a chart uses, not only the ones we write", () => {
    expect(parseChordName("CΔ")).toEqual({ root: 0, quality: "maj7" });
    expect(parseChordName("CΔ7")).toEqual({ root: 0, quality: "maj7" });
    expect(parseChordName("CM7")).toEqual({ root: 0, quality: "maj7" });
    expect(parseChordName("C-7")).toEqual({ root: 0, quality: "m7" });
    expect(parseChordName("Cmin7")).toEqual({ root: 0, quality: "m7" });
    expect(parseChordName("C°")).toEqual({ root: 0, quality: "dim" });
    expect(parseChordName("C°7")).toEqual({ root: 0, quality: "dim7" });
    expect(parseChordName("Cø")).toEqual({ root: 0, quality: "m7b5" });
    expect(parseChordName("C+")).toEqual({ root: 0, quality: "aug" });
    expect(parseChordName("Csus")).toEqual({ root: 0, quality: "sus4" });
  });

  it("reads a slash chord as the chord over the slash", () => {
    expect(parseChordName("D/F#")).toEqual({ root: 2, quality: "maj" });
    expect(parseChordName("Dm7/G")).toEqual({ root: 2, quality: "m7" });
  });

  it("is tolerant of the space either side, and of nothing at all", () => {
    expect(parseChordName("  A7 ")).toEqual({ root: 9, quality: "7" });
    expect(parseChordName("")).toBeNull();
    expect(parseChordName("   ")).toBeNull();
  });

  it("returns null rather than a guess for anything unreadable", () => {
    expect(parseChordName("H")).toBeNull();
    expect(parseChordName("banana")).toBeNull();
    expect(parseChordName("A7?")).toBeNull();
    expect(parseChordName("7")).toBeNull();
  });
});

describe("every chord a form can produce", () => {
  it("is a chord whose notes include its own root", () => {
    for (const kind of FORM_KINDS) {
      for (const mode of MODES) {
        for (const root of ALL_ROOTS) {
          const key: Key = { root, mode };
          const bars = barsForForm(kind, JAM_FORM_BARS.aaba32, key);
          for (const bar of bars) {
            for (const chord of bar.chords) {
              const notes = chordNotes(chord as Chord);
              expect(notes[0]).toBe(chord.root);
              expect(new Set(notes).size).toBe(notes.length);
            }
          }
        }
      }
    }
  });
});
