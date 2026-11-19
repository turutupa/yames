// The words a moved line gets in its new key. The sentences below were checked
// by hand against the frets; the last block checks every sentence in the three
// harmony packs against that variant's own notes.
import { describe, expect, it } from "vitest";
import type { Exercise, ExerciseVariant, PathDoc } from "../format";
import { buildPath } from "../generate";
import arpeggiosOverChanges from "./arpeggios-over-changes";
import chordsInAKey from "./chords-in-a-key";
import { chordWords, keyHowTo, keyLine, keyWords } from "./keyText";
import triads from "./triads";

/** One bar of eighths rolling a three-string shape: low, middle, high, middle, twice. */
const rolled = (strings: readonly number[], frets: readonly number[]) => {
  const [l, m, h] = strings.map((s, i) => `${s}:${frets[i]}`);
  return `/8 ${l} ${m} ${h} ${m} ${l} ${m} ${h} ${m}`;
};
const TOP = [3, 2, 1];
const MID = [4, 3, 2];
const line = (shapes: ReadonlyArray<readonly [readonly number[], readonly number[]]>) =>
  shapes.map(([strings, frets]) => rolled(strings, frets)).join(" | ");

describe("chord and key names", () => {
  it("are said the way the Paths say them", () => {
    expect(["Bm", "F#m", "Bb", "C#m", "Eb", "G"].map(chordWords)).toEqual([
      "B minor",
      "F sharp minor",
      "B flat",
      "C sharp minor",
      "E flat",
      "G",
    ]);
    expect(["Dmaj7", "Bm7", "A7", "Em7b5", "Bbmaj7", "G#m7", "C#dim"].map(chordWords)).toEqual([
      "D major seven",
      "B minor seven",
      "A seven",
      "E half-diminished",
      "B flat major seven",
      "G sharp minor seven",
      "C sharp diminished",
    ]);
    expect(["Bb", "E", "D minor", "F# minor"].map(keyWords)).toEqual(["B flat", "E", "D minor", "F sharp minor"]);
  });

  it("are not guessed: a symbol they do not know has no words", () => {
    expect(chordWords("A5")).toBeNull();
    expect(chordWords("Csus4")).toBeNull();
    expect(chordWords("H")).toBeNull();
    expect(keyWords("E dorian")).toBeNull();
  });
});

describe("a line of shapes in another key", () => {
  it("says each bar's shape, low string first, the strings once", () => {
    // C, A minor, F, G at fret 5, four frets up: E, C sharp minor, A, B.
    const tab = line([
      [TOP, [9, 9, 7]],
      [TOP, [9, 9, 9]],
      [TOP, [9, 10, 9]],
      [TOP, [8, 7, 7]],
    ]);
    expect(keyLine({ kind: "shapes", key: "E", tab, chords: "E | C#m | A | B", shift: 4, home: "C" })).toBe(
      "In E: G string 9, B string 9, top string 7; then 9, 9, 9; then 9, 10, 9; then 8, 7, 7.",
    );
  });

  it("says each chord once and then the form, when bars come back", () => {
    // One, one, four, four, five, four, one, one in B flat.
    const one: [number[], number[]] = [TOP, [3, 3, 1]];
    const four: [number[], number[]] = [TOP, [3, 4, 3]];
    const five: [number[], number[]] = [TOP, [2, 1, 1]];
    const tab = line([one, one, four, four, five, four, one, one]);
    expect(
      keyLine({ kind: "shapes", key: "Bb", tab, chords: "Bb | Bb | Eb | Eb | F | Eb | Bb | Bb", shift: -2, home: "C" }),
    ).toBe(
      "In B flat: B flat is G string 3, B string 3, top string 1. E flat is 3, 4, 3. F is 2, 1, 1. The form is B flat, B flat, E flat, E flat, F, E flat, B flat, B flat, one bar each.",
    );
  });

  it("names the strings again when a shape is on other strings", () => {
    const tab = line([
      [MID, [7, 6, 5]],
      [TOP, [7, 7, 5]],
      [TOP, [9, 9, 7]],
    ]);
    expect(keyLine({ kind: "shapes", key: "A", tab, chords: "A | D | E", shift: 2, home: "G" })).toBe(
      "In A: D string 7, G string 6, B string 5; then G string 7, B string 7, top string 5; then 9, 9, 7.",
    );
  });

  it("says only where it starts and how far it moved, when bars come back and a chord is in two places", () => {
    // F low, C, F low again, then F high: "F is ..." would be true of one of them only.
    const tab = line([
      [MID, [3, 2, 1]],
      [MID, [5, 5, 5]],
      [MID, [3, 2, 1]],
      [TOP, [10, 10, 8]],
    ]);
    expect(keyLine({ kind: "shapes", key: "F", tab, chords: "F | C | F | F", shift: -2, home: "G" })).toBe(
      "In F, everything is two frets lower than in G: the first shape is D string 3, G string 2, B string 1.",
    );
  });

  it("has nothing to say about a bar that is not one shape, an open string, or a chord it cannot name", () => {
    const shapes = line([
      [TOP, [9, 9, 7]],
      [TOP, [9, 9, 9]],
    ]);
    const base = { kind: "shapes" as const, key: "E", shift: 4, home: "C" };
    expect(keyLine({ ...base, tab: `${shapes}`, chords: "E | C#m" })).not.toBeNull();
    expect(keyLine({ ...base, tab: `/8 3:9 2:9 1:7 1:9 3:9 2:9 1:7 2:9 | ${rolled(TOP, [9, 9, 9])}`, chords: "E | C#m" })).toBeNull();
    expect(keyLine({ ...base, tab: `${rolled(TOP, [1, 0, 0])} | ${rolled(TOP, [9, 9, 9])}`, chords: "E | C#m" })).toBeNull();
    expect(keyLine({ ...base, tab: shapes, chords: "E5 | C#m" })).toBeNull();
    expect(keyLine({ ...base, tab: shapes, chords: "E | C#m | A" })).toBeNull();
    expect(keyLine({ ...base, tab: "/8 3:9 2:9 1:7 2:9 3:9 2:9 1:7 2:9 2:9", chords: "E" })).toBeNull();
  });
});

describe("a single-note line in another key", () => {
  // Two bars are enough: the sentence names the chords, the first note and the move.
  const tab = "/8 1:5 1:3 2:4 3:5 4:7 3:5 2:4 1:3 | /1 4:5";

  it("says the chords by name, where the line starts, and how far it moved", () => {
    expect(keyLine({ kind: "line", key: "G minor", tab, chords: "Am7b5 | Gm7", shift: -2, home: "A minor" })).toBe(
      "In G minor the chords are A half-diminished and G minor seven, and the line starts on the top string at fret 5. Everything is two frets lower than in A minor.",
    );
    expect(
      keyLine({ kind: "line", key: "B", tab: "/8 4:9 3:8 2:7 1:6 1:7 1:6 2:7 3:8 | /1 3:8 | /1 2:9 | /1 2:7", chords: "Bmaj7 | G#m7 | C#m7 | F#7", shift: -1, home: "C" }),
    ).toBe(
      "In B the chords are B major seven, G sharp minor seven, C sharp minor seven and F sharp seven, and the line starts on the D string at fret 9. Everything is one fret lower than in C.",
    );
  });

  it("names a chord once, however many bars it has", () => {
    expect(keyLine({ kind: "line", key: "G minor", tab: `${tab} | /1 4:5`, chords: "Am7b5 | Gm7 | Gm7", shift: -2, home: "A minor" })).toContain(
      "the chords are A half-diminished and G minor seven,",
    );
  });
});

describe("the key it is told", () => {
  it("must be where the written line lands: a wrong home or shift is a mistake in the spec", () => {
    const tab = rolled(TOP, [9, 9, 7]);
    expect(() => keyLine({ kind: "shapes", key: "E", tab, chords: "E", shift: 2, home: "C" })).toThrow(/C moved 2 frets is not E/);
    expect(() => keyLine({ kind: "shapes", key: "E minor", tab, chords: "Em", shift: 4, home: "C" })).toThrow();
    expect(keyLine({ kind: "shapes", key: "Bb", tab, chords: "Bb", shift: 3, home: "G" })).toBe("In B flat: G string 9, B string 9, top string 7.");
  });
});

describe("keyHowTo", () => {
  const args = { kind: "shapes" as const, key: "E", tab: rolled(TOP, [9, 9, 7]), chords: "E", shift: 4, home: "C" };
  const written = ["Straight eighths, 60 BPM up to a pass at 90.", "In D: G string 7, B string 7, top string 5.", "The frets here are for the first version."];
  const make = (a: typeof args) => (keyHowTo(a) as (own: readonly string[]) => string[])(written);

  it("keeps the Exercise's first line and adds the key's own, and nothing else", () => {
    expect(make(args)).toEqual(["Straight eighths, 60 BPM up to a pass at 90.", "In E: G string 9, B string 9, top string 7."]);
  });

  it("is the Exercise's own how-to when there is no line to say", () => {
    expect(make({ ...args, chords: "E5" })).toEqual(written);
  });
});

// ---------------------------------------------------------------------------
// The packs. Each sentence is read back against the notes of the variant it is
// on, from the pack and not from the tab the sentence was made from.
// ---------------------------------------------------------------------------

type BarShape = { chord: string; frets: number[] };

function barShapes(variant: ExerciseVariant): BarShape[] {
  const bars = new Map<number, Map<number, number>>();
  for (const note of variant.notes) {
    const bar = Math.floor(note.tick / 3840);
    if (!bars.has(bar)) bars.set(bar, new Map());
    bars.get(bar)!.set(note.string, note.fret);
  }
  return [...bars.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bar, held]) => ({
      chord: variant.chords![bar],
      frets: [...held.entries()].sort((a, b) => b[0] - a[0]).map(([, fret]) => fret),
    }));
}

/** The fret numbers a sentence should name, in order, from the notes. */
function expectedNumbers(sentence: string, variant: ExerciseVariant): number[] {
  const shapes = barShapes(variant);
  if (sentence.includes("the line starts on")) return [variant.notes[0].fret];
  if (sentence.includes("the first shape is")) return shapes[0].frets;
  if (sentence.includes("The form is")) {
    const seen = new Set<string>();
    return shapes.filter((s) => !seen.has(s.chord) && seen.add(s.chord)).flatMap((s) => s.frets);
  }
  return shapes.flatMap((s) => s.frets);
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

describe.each([
  ["triads", triads, 7],
  ["chords-in-a-key", chordsInAKey, 8],
  ["arpeggios-over-changes", arpeggiosOverChanges, 4],
] as const)("%s: every line moved to other keys", (_id, spec, count) => {
  const doc: PathDoc = buildPath(spec);
  const moved: Exercise[] = doc.steps
    .flatMap((s) => s.exercises)
    .filter((e) => e.variation?.variants.every((v) => v.label.startsWith("In ")));

  it("is found, and every key after the first has its own how-to", () => {
    expect(moved.length).toBe(count);
    for (const ex of moved) {
      const [first, ...rest] = ex.variation!.variants;
      expect(first.howTo, ex.id).toBeUndefined();
      expect(rest.length, ex.id).toBe(2);
      for (const v of rest) {
        expect(v.howTo?.length, `${ex.id}#${v.id}`).toBe(2);
        expect(v.purpose, `${ex.id}#${v.id}`).toBeUndefined();
      }
    }
  });

  it("keeps the tempo sentence, names its own key, and never says 'first version'", () => {
    for (const ex of moved) {
      expect(ex.howTo[ex.howTo.length - 1], ex.id).toMatch(/for the first version/);
      for (const v of ex.variation!.variants.slice(1)) {
        const [tempo, own] = v.howTo!;
        expect(tempo, `${ex.id}#${v.id}`).toBe(ex.howTo[0]);
        expect(own.startsWith(`In ${keyWords(v.params.key!)}`), `${ex.id}#${v.id}: ${own}`).toBe(true);
        expect(v.howTo!.join(" "), `${ex.id}#${v.id}`).not.toMatch(/first version/i);
      }
    }
  });

  it("names the frets that variant plays, in order, and its chords", () => {
    for (const ex of moved) {
      const base = ex.variation!.variants[0];
      for (const v of ex.variation!.variants.slice(1)) {
        const own = v.howTo![1];
        const where = `${ex.id}#${v.id}: ${own}`;
        expect((own.match(/\d+/g) ?? []).map(Number), where).toEqual(expectedNumbers(own, v));
        // A sentence that names chords names this variant's, all of them, and no other.
        if (own.includes("The form is") || own.includes("the chords are")) {
          for (const chord of new Set(v.chords)) expect(own.includes(chordWords(chord)!), `${where} (${chord})`).toBe(true);
        }
        // "N frets higher": every note is the same distance from the first key's, and two keys'
        // sentences differ by exactly what their notes differ by.
        const far = /(\w+) frets? (higher|lower) than in/.exec(own);
        if (far) {
          const perNote = v.notes.map((n, i) => n.fret - base.notes[i].fret);
          expect(new Set(perNote).size, where).toBe(1);
          const said = NUMBER_WORDS.indexOf(far[1]) * (far[2] === "higher" ? 1 : -1);
          const others = ex.variation!.variants.slice(1).filter((o) => o !== v);
          for (const other of others) {
            const otherFar = /(\w+) frets? (higher|lower) than in/.exec(other.howTo![1])!;
            const otherSaid = NUMBER_WORDS.indexOf(otherFar[1]) * (otherFar[2] === "higher" ? 1 : -1);
            expect(said - otherSaid, where).toBe(v.notes[0].fret - other.notes[0].fret);
          }
        }
      }
    }
  });
});
