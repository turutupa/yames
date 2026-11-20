// The words a moved line gets in its new key. The sentences below were checked
// by hand against the frets; the last block reads every sentence in the three
// harmony packs back against that variant's own notes.
import { describe, expect, it } from "vitest";
import type { Exercise, ExerciseVariant, PathDoc } from "../format";
import { buildPath } from "../generate";
import arpeggiosOverChanges from "./arpeggios-over-changes";
import chordsInAKey from "./chords-in-a-key";
import { chordWords, keyHowTo, keyLines, keyWords } from "./keyText";
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

/** One bar of eighths on a four-string shape: up, and back down to the second string. */
const swept = (strings: readonly number[], frets: readonly number[]) => {
  const [a, b, c, d] = strings.map((s, i) => `${s}:${frets[i]}`);
  return `/8 ${a} ${b} ${c} ${d} ${c} ${b} ${a} ${b}`;
};

describe("a line of shapes in another key", () => {
  it("names the strings once, then every shape by its chord", () => {
    // C, A minor, F, G at fret 5, four frets up: E, C sharp minor, A, B.
    const tab = line([
      [TOP, [9, 9, 7]],
      [TOP, [9, 9, 9]],
      [TOP, [9, 10, 9]],
      [TOP, [8, 7, 7]],
    ]);
    expect(keyLines({ kind: "shapes", key: "E", tab, chords: "E | C#m | A | B", shift: 4, home: "C" })).toEqual([
      "In E, on the G, B and top strings: E is 9, 9, 7. C sharp minor is 9, 9, 9. A is 9, 10, 9. B is 8, 7, 7.",
    ]);
  });

  it("says a chord held for two bars once, with its bars", () => {
    // Two, five, one, one in F.
    const tab = line([
      [TOP, [12, 11, 10]],
      [TOP, [12, 13, 12]],
      [TOP, [14, 13, 13]],
      [TOP, [14, 13, 13]],
    ]);
    expect(keyLines({ kind: "shapes", key: "F", tab, chords: "Gm | C | F | F", shift: 5, home: "C" })).toEqual([
      "In F, on the G, B and top strings: G minor is 12, 11, 10. C is 12, 13, 12. F is 14, 13, 13, for two bars.",
    ]);
  });

  it("says each chord once and then the bars by chord name, when a chord comes back", () => {
    // One, four, five, one in E, the shapes that stay put.
    const one: [number[], number[]] = [TOP, [13, 12, 12]];
    const tab = line([one, [TOP, [14, 14, 12]], [TOP, [11, 12, 11]], one]);
    expect(keyLines({ kind: "shapes", key: "E", tab, chords: "E | A | B | E", shift: 4, home: "C" })).toEqual([
      "In E, on the G, B and top strings: E is 13, 12, 12. A is 14, 14, 12. B is 11, 12, 11.",
      "The four bars are E, A, B and E.",
    ]);
  });

  it("counts the bars of a longer form, and never lists the same name four times running", () => {
    // One, one, four, four, five, four, one, one in B flat.
    const one: [number[], number[]] = [TOP, [3, 3, 1]];
    const four: [number[], number[]] = [TOP, [3, 4, 3]];
    const five: [number[], number[]] = [TOP, [2, 1, 1]];
    expect(
      keyLines({ kind: "shapes", key: "Bb", tab: line([one, one, four, four, five, four, one, one]), chords: "Bb | Bb | Eb | Eb | F | Eb | Bb | Bb", shift: -2, home: "C" }),
    ).toEqual([
      "In B flat, on the G, B and top strings: B flat is 3, 3, 1. E flat is 3, 4, 3. F is 2, 1, 1.",
      "The form is two bars of B flat, two of E flat, one bar each of F and E flat, then two of B flat.",
    ]);
    // Twelve bars: four of one, two of four, two of one, then five, four, one, five.
    expect(
      keyLines({
        kind: "shapes",
        key: "Bb",
        tab: line([one, one, one, one, four, four, one, one, five, four, one, five]),
        chords: "Bb | Bb | Bb | Bb | Eb | Eb | Bb | Bb | F | Eb | Bb | F",
        shift: -2,
        home: "C",
      }),
    ).toEqual([
      "In B flat, on the G, B and top strings: B flat is 3, 3, 1. E flat is 3, 4, 3. F is 2, 1, 1.",
      "The form is four bars of B flat, two of E flat, two of B flat, then one bar each of F, E flat, B flat and F.",
    ]);
    // Single bars first, and a single bar between longer ones.
    const form = (chords: string) => {
      const shapes = chords.split(" | ").map((c) => (c === "Bb" ? one : c === "Eb" ? four : five));
      return keyLines({ kind: "shapes", key: "Bb", tab: line(shapes), chords, shift: -2, home: "C" })![1];
    };
    expect(form("Bb | Eb | Bb | Bb")).toBe("The form is one bar each of B flat and E flat, then two bars of B flat.");
    expect(form("Bb | Bb | Eb | Bb | Bb")).toBe("The form is two bars of B flat, one of E flat, then two of B flat.");
    expect(form("F | Bb | Bb | F")).toBe("The form is one bar of F, two of B flat, then one of F.");
  });

  it("names each shape's own strings when they are not the ones just said", () => {
    const tab = line([
      [MID, [7, 6, 5]],
      [TOP, [7, 7, 5]],
      [TOP, [9, 9, 7]],
    ]);
    expect(keyLines({ kind: "shapes", key: "A", tab, chords: "A | D | E", shift: 2, home: "G" })).toEqual([
      "In A: A is D string 7, G string 6, B string 5. D is G string 7, B string 7, top string 5. E is 9, 9, 7.",
    ]);
    // Four-string seventh chords, from the A string and from the low E string in turn.
    const sevenths = [swept([5, 4, 3, 2], [1, 3, 2, 3]), swept([6, 4, 3, 2], [3, 3, 3, 3]), swept([5, 4, 3, 2], [3, 5, 3, 4]), swept([6, 4, 3, 2], [1, 1, 2, 1])].join(" | ");
    expect(keyLines({ kind: "shapes", key: "Bb", tab: sevenths, chords: "Bbmaj7 | Gm7 | Cm7 | F7", shift: -2, home: "C" })).toEqual([
      "In B flat: B flat major seven is A string 1, D string 3, G string 2, B string 3. G minor seven is low E string 3, D string 3, G string 3, B string 3. C minor seven is A string 3, D string 5, G string 3, B string 4. F seven is low E string 1, D string 1, G string 2, B string 1.",
    ]);
  });

  describe("a form whose chords are played in two places", () => {
    const low: Array<[number[], number[]]> = [
      [TOP, [9, 9, 7]],
      [TOP, [8, 7, 7]],
      [TOP, [9, 9, 9]],
      [TOP, [9, 10, 9]],
    ];
    const high: Array<[number[], number[]]> = [
      [TOP, [13, 12, 12]],
      [TOP, [11, 12, 11]],
      [TOP, [13, 14, 12]],
      [TOP, [14, 14, 12]],
    ];
    const chords = "E | B | C#m | A | E | B | C#m | A";

    it("is said four bars at a time, a line for each four", () => {
      expect(keyLines({ kind: "shapes", key: "E", tab: line([...low, ...high]), chords, shift: 4, home: "C" })).toEqual([
        "In E, bars 1 to 4, on the G, B and top strings: E is 9, 9, 7. B is 8, 7, 7. C sharp minor is 9, 9, 9. A is 9, 10, 9.",
        "Bars 5 to 8, higher on the neck: E is 13, 12, 12. B is 11, 12, 11. C sharp minor is 13, 14, 12. A is 14, 14, 12.",
      ]);
      expect(keyLines({ kind: "shapes", key: "E", tab: line([...high, ...low]), chords, shift: 4, home: "C" })).toEqual([
        "In E, bars 1 to 4, on the G, B and top strings: E is 13, 12, 12. B is 11, 12, 11. C sharp minor is 13, 14, 12. A is 14, 14, 12.",
        "Bars 5 to 8, lower on the neck: E is 9, 9, 7. B is 8, 7, 7. C sharp minor is 9, 9, 9. A is 9, 10, 9.",
      ]);
    });

    it("calls the parts what the Exercise calls them", () => {
      expect(keyLines({ kind: "shapes", key: "E", tab: line([...low, ...high]), chords, shift: 4, home: "C", parts: ["the verse", "the chorus"] })).toEqual([
        "In E, the verse, bars 1 to 4, on the G, B and top strings: E is 9, 9, 7. B is 8, 7, 7. C sharp minor is 9, 9, 9. A is 9, 10, 9.",
        "The chorus, bars 5 to 8, higher on the neck: E is 13, 12, 12. B is 11, 12, 11. C sharp minor is 13, 14, 12. A is 14, 14, 12.",
      ]);
      expect(() => keyLines({ kind: "shapes", key: "E", tab: line([...low, ...high]), chords, shift: 4, home: "C", parts: ["the verse"] })).toThrow(
        /1 parts named for 2 sections/,
      );
    });

    it("points at four bars already said, and at a shape already said", () => {
      // A, A, bridge, A in B flat. C minor is in the same place in the bridge; F is not.
      const a: Array<[number[], number[]]> = [
        [TOP, [3, 3, 1]],
        [TOP, [3, 3, 3]],
        [TOP, [5, 4, 3]],
        [TOP, [2, 1, 1]],
      ];
      const bridge: Array<[number[], number[]]> = [
        [TOP, [8, 8, 6]],
        [TOP, [7, 6, 5]],
        [TOP, [5, 4, 3]],
        [TOP, [5, 6, 5]],
      ];
      expect(
        keyLines({
          kind: "shapes",
          key: "Bb",
          tab: line([...a, ...a, ...bridge, ...a]),
          chords: "Bb | Gm | Cm | F | Bb | Gm | Cm | F | Eb | Dm | Cm | F | Bb | Gm | Cm | F",
          shift: -2,
          home: "C",
          parts: ["the A section", "the A section", "the bridge", "the A section"],
        }),
      ).toEqual([
        "In B flat, the A section, bars 1 to 4, on the G, B and top strings: B flat is 3, 3, 1. G minor is 3, 3, 3. C minor is 5, 4, 3. F is 2, 1, 1. Bars 5 to 8 are the same.",
        "The bridge, bars 9 to 12, higher on the neck: E flat is 8, 8, 6. D minor is 7, 6, 5. C minor is 5, 4, 3, as before. F is 5, 6, 5. Bars 13 to 16 are bars 1 to 4 again.",
      ]);
    });

    it("says new strings where a part moves to them, and a last chord held", () => {
      // A verse twice on the middle strings, a chorus up the top strings, in F.
      const verse: Array<[number[], number[]]> = [
        [MID, [3, 2, 1]],
        [MID, [3, 2, 3]],
        [MID, [3, 3, 3]],
        [MID, [5, 5, 5]],
      ];
      const chorus: Array<[number[], number[]]> = [
        [TOP, [3, 3, 1]],
        [TOP, [5, 5, 3]],
        [TOP, [5, 6, 5]],
        [TOP, [7, 6, 5]],
        [TOP, [7, 6, 6]],
        [TOP, [9, 8, 8]],
        [TOP, [10, 10, 8]],
        [TOP, [10, 10, 8]],
      ];
      expect(
        keyLines({
          kind: "shapes",
          key: "F",
          tab: line([...verse, ...verse, ...chorus]),
          chords: "F | Dm | Bb | C | F | Dm | Bb | C | Bb | C | F | Dm | Bb | C | F | F",
          shift: -2,
          home: "G",
          parts: ["the verse", "the verse", "the chorus", "the chorus"],
        }),
      ).toEqual([
        "In F, the verse, bars 1 to 4, on the D, G and B strings: F is 3, 2, 1. D minor is 3, 2, 3. B flat is 3, 3, 3. C is 5, 5, 5. Bars 5 to 8 are the same.",
        "The chorus, bars 9 to 12, on the G, B and top strings: B flat is 3, 3, 1. C is 5, 5, 3. F is 5, 6, 5. D minor is 7, 6, 5.",
        "Bars 13 to 16, higher on the neck: B flat is 7, 6, 6. C is 9, 8, 8. F is 10, 10, 8, for two bars.",
      ]);
    });

    it("is said bar by bar when it is four bars, and not at all when it is not fours", () => {
      // F low, C, F low again, then F high.
      const four: Array<[number[], number[]]> = [
        [MID, [3, 2, 1]],
        [MID, [5, 5, 5]],
        [MID, [3, 2, 1]],
        [TOP, [10, 10, 8]],
      ];
      expect(keyLines({ kind: "shapes", key: "F", tab: line(four), chords: "F | C | F | F", shift: -2, home: "G" })).toEqual([
        "In F: F is D string 3, G string 2, B string 1. C is 5, 5, 5. F is 3, 2, 1, as before. F is G string 10, B string 10, top string 8.",
      ]);
      expect(keyLines({ kind: "shapes", key: "F", tab: line([...four, four[0], four[1]]), chords: "F | C | F | F | F | C", shift: -2, home: "G" })).toBeNull();
    });
  });

  it("never measures from another key", () => {
    const tab = line([
      [TOP, [9, 9, 7]],
      [TOP, [9, 9, 9]],
    ]);
    for (const shift of [4, -8]) {
      expect(keyLines({ kind: "shapes", key: "E", tab, chords: "E | C#m", shift, home: "C" })).toEqual([
        "In E, on the G, B and top strings: E is 9, 9, 7. C sharp minor is 9, 9, 9.",
      ]);
    }
  });

  it("has nothing to say about a bar that is not one shape, an open string, or a chord it cannot name", () => {
    const shapes = line([
      [TOP, [9, 9, 7]],
      [TOP, [9, 9, 9]],
    ]);
    const base = { kind: "shapes" as const, key: "E", shift: 4, home: "C" };
    expect(keyLines({ ...base, tab: `${shapes}`, chords: "E | C#m" })).not.toBeNull();
    expect(keyLines({ ...base, tab: `/8 3:9 2:9 1:7 1:9 3:9 2:9 1:7 2:9 | ${rolled(TOP, [9, 9, 9])}`, chords: "E | C#m" })).toBeNull();
    expect(keyLines({ ...base, tab: `${rolled(TOP, [1, 0, 0])} | ${rolled(TOP, [9, 9, 9])}`, chords: "E | C#m" })).toBeNull();
    expect(keyLines({ ...base, tab: shapes, chords: "E5 | C#m" })).toBeNull();
    expect(keyLines({ ...base, tab: shapes, chords: "E | C#m | A" })).toBeNull();
    expect(keyLines({ ...base, tab: "/8 3:9 2:9 1:7 2:9 3:9 2:9 1:7 2:9 2:9", chords: "E" })).toBeNull();
  });
});

describe("a single-note line in another key", () => {
  it("says where each chord starts, the string once when it is the same one", () => {
    // Four arpeggios with their roots on the D string, in E flat and in E.
    expect(keyLines({ kind: "line", key: "Eb", tab: "/1 4:13 | /1 4:10 | /1 4:6 | /1 4:8", chords: "Eb | Cm | Ab | Bb", shift: 3, home: "C" })).toEqual([
      "In E flat, each chord starts on the D string: E flat at fret 13, C minor at fret 10, A flat at fret 6 and B flat at fret 8.",
    ]);
    expect(keyLines({ kind: "line", key: "E", tab: "/1 4:14 | /1 4:11 | /1 4:7 | /1 4:9", chords: "E | C#m | A | B", shift: 4, home: "C" })).toEqual([
      "In E, each chord starts on the D string: E at fret 14, C sharp minor at fret 11, A at fret 7 and B at fret 9.",
    ]);
  });

  it("says every chord's string when they start on different ones", () => {
    expect(
      keyLines({ kind: "line", key: "B", tab: "/8 4:9 3:8 2:7 1:6 1:7 1:6 2:7 3:8 | /1 3:8 | /1 2:9 | /1 2:7", chords: "Bmaj7 | G#m7 | C#m7 | F#7", shift: -1, home: "C" }),
    ).toEqual([
      "In B: B major seven starts on the D string at fret 9, G sharp minor seven on the G string at fret 8, C sharp minor seven on the B string at fret 9 and F sharp seven on the B string at fret 7.",
    ]);
  });

  it("says a chord held for two bars once, at its first bar", () => {
    const tab = "/8 1:5 1:3 2:4 3:5 4:7 3:5 2:4 1:3 | /1 1:2 | /1 2:3 | /1 4:5";
    expect(keyLines({ kind: "line", key: "G minor", tab, chords: "Am7b5 | D7 | Gm7 | Gm7", shift: -2, home: "A minor" })).toEqual([
      "In G minor: A half-diminished starts on the top string at fret 5, D seven on the top string at fret 2 and G minor seven on the B string at fret 3.",
    ]);
  });

  it("has nothing to say about a chord that starts on an open string", () => {
    expect(keyLines({ kind: "line", key: "E", tab: "/1 4:14 | /1 4:0", chords: "E | D", shift: 4, home: "C" })).toBeNull();
  });
});

describe("the key it is told", () => {
  it("must be where the written line lands: a wrong home or shift is a mistake in the spec", () => {
    const tab = rolled(TOP, [9, 9, 7]);
    expect(() => keyLines({ kind: "shapes", key: "E", tab, chords: "E", shift: 2, home: "C" })).toThrow(/C moved 2 frets is not E/);
    expect(() => keyLines({ kind: "shapes", key: "E minor", tab, chords: "Em", shift: 4, home: "C" })).toThrow();
    expect(keyLines({ kind: "shapes", key: "Bb", tab, chords: "Bb", shift: 3, home: "G" })).toEqual(["In B flat, on the G, B and top strings: B flat is 9, 9, 7."]);
  });
});

describe("keyHowTo", () => {
  const args = { kind: "shapes" as const, key: "E", tab: rolled(TOP, [9, 9, 7]), chords: "E", shift: 4, home: "C" };
  const written = ["Straight eighths, 60 BPM up to a pass at 90.", "In D: G string 7, B string 7, top string 5.", "The frets here are for the first version."];
  const make = (a: typeof args) => (keyHowTo(a) as (own: readonly string[]) => string[])(written);

  it("keeps the Exercise's first line and adds the key's own, and nothing else", () => {
    expect(make(args)).toEqual(["Straight eighths, 60 BPM up to a pass at 90.", "In E, on the G, B and top strings: E is 9, 9, 7."]);
    const back = line([
      [TOP, [9, 9, 7]],
      [TOP, [9, 10, 9]],
      [TOP, [9, 9, 7]],
    ]);
    expect(make({ ...args, tab: back, chords: "E | A | E" })).toEqual([
      "Straight eighths, 60 BPM up to a pass at 90.",
      "In E, on the G, B and top strings: E is 9, 9, 7. A is 9, 10, 9.",
      "The three bars are E, A and E.",
    ]);
  });

  it("is the Exercise's own how-to when there is no line to say", () => {
    expect(make({ ...args, chords: "E5" })).toEqual(written);
  });
});

// ---------------------------------------------------------------------------
// The packs. Each sentence is read back, by a reader that knows nothing of how
// it was made, against the notes of the variant it is on, from the pack and
// not from the tab the sentence was made from.
// ---------------------------------------------------------------------------

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"];
const STRING_NUMBER: Record<string, number> = { top: 1, B: 2, G: 3, D: 4, A: 5, "low E": 6 };

type PackBar = { chord: string; strings: number[]; frets: number[]; first: { string: number; fret: number } };

/** What the variant plays, bar by bar: its chord in words, each string's fret, and its first note. */
function packBars(variant: ExerciseVariant): PackBar[] {
  const bars = new Map<number, { held: Map<number, number>; first: { string: number; fret: number } }>();
  for (const note of [...variant.notes].sort((a, b) => a.tick - b.tick)) {
    const bar = Math.floor(note.tick / 3840);
    if (!bars.has(bar)) bars.set(bar, { held: new Map(), first: { string: note.string, fret: note.fret } });
    bars.get(bar)!.held.set(note.string, note.fret);
  }
  return [...bars.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bar, { held, first }]) => {
      const strings = [...held.keys()].sort((a, b) => b - a);
      return { chord: chordWords(variant.chords![bar])!, strings, frets: strings.map((s) => held.get(s)!), first };
    });
}

type Said = { chord: string; strings: number[]; frets: number[] };
const sameShape = (a: Said, b: Said) => a.chord === b.chord && a.strings.join() === b.strings.join() && a.frets.join() === b.frets.join();

/** "The four bars are E, A, B and E." and "The form is two bars of E, ..., then one bar each of B and A." as a chord a bar. */
function readForm(sentence: string): string[] {
  const plain = /^The (\w+) bars are (.+)\.$/.exec(sentence);
  if (plain) {
    // "E, A, B, A, then E, B, A, E": a form said in two lines of four.
    const names = plain[2].split(/, then | and |, /);
    expect(names.length, sentence).toBe(NUMBER_WORDS.indexOf(plain[1]));
    return names;
  }
  const body = /^The form is (.+)\.$/.exec(sentence);
  if (!body) throw new Error(`cannot read: ${sentence}`);
  const bars: string[] = [];
  let each = false;
  for (const token of body[1].replace(", then ", ", ").split(", ")) {
    const group = /^one bar each of (.+)$/.exec(token);
    const counted = /^(\w+)(?: bars?)? of (.+)$/.exec(token);
    if (group) {
      each = true;
      bars.push(...group[1].split(" and "));
    } else if (counted) {
      each = false;
      for (let n = NUMBER_WORDS.indexOf(counted[1]); n > 0; n -= 1) bars.push(counted[2]);
    } else if (each) {
      bars.push(...token.split(" and "));
    } else {
      throw new Error(`cannot read: ${token} in ${sentence}`);
    }
  }
  return bars;
}

/**
 * Reads a line of shapes back and holds it against the bars: every bar is
 * said, with its own chord, strings and frets; "as before", "the same",
 * "again", "for two bars", "higher on the neck" and the form are all true.
 */
function checkShapes(lines: readonly string[], bars: readonly PackBar[], where: string) {
  const said: Array<Said | undefined> = bars.map(() => undefined);
  let strings: number[] | null = null;
  let form: string[] | null = null;
  let reach: { low: number; high: number } | null = null;
  for (const text of lines) {
    if (/^The (form is|\w+ bars are) /.test(text)) {
      form = readForm(text);
      continue;
    }
    const cut = text.indexOf(": ");
    const head = text.slice(0, cut);
    const span = /bars (\d+) to (\d+)/i.exec(head);
    const on = / on the (.+) strings$/.exec(head);
    if (on) strings = on[1].split(/, | and /).map((name) => STRING_NUMBER[name]);
    let at = span ? Number(span[1]) - 1 : 0;
    const start = at;
    for (const sentence of text.slice(cut + 2).split(/(?<=\.) /)) {
      const again = /^Bars (\d+) to (\d+) are (?:the same|bars (\d+) to \d+ again)\.$/.exec(sentence);
      if (again) {
        const to = Number(again[1]) - 1;
        const from = again[3] ? Number(again[3]) - 1 : to - 4;
        expect(Number(again[2]) - to, `${where}: ${sentence}`).toBe(4);
        for (let i = 0; i < 4; i += 1) said[to + i] = said[from + i];
        continue;
      }
      const is = /^(.+?) is (.+?)(, as before)?(?:, for (\w+) bars)?\.$/.exec(sentence);
      if (!is) throw new Error(`${where}: cannot read: ${sentence}`);
      const items = is[2].split(", ").map((item) => /^(?:(.+) string )?(\d+)$/.exec(item)!);
      if (items[0][1] !== undefined) strings = items.map((item) => STRING_NUMBER[item[1]]);
      else expect(items.every((item) => item[1] === undefined), `${where}: ${sentence}`).toBe(true);
      const claim: Said = { chord: is[1], strings: [...strings!], frets: items.map((item) => Number(item[2])) };
      const length = is[4] ? NUMBER_WORDS.indexOf(is[4]) : 1;
      if (span) {
        // Four bars said in order: this sentence is the next bar, or the next few.
        const earlier = bars.slice(0, at).some((bar) => sameShape(bar, claim));
        expect(earlier, `${where}: "as before" in: ${sentence}`).toBe(is[3] !== undefined);
        for (let n = 0; n < length; n += 1) said[at++] = claim;
      } else {
        // Each chord said once: it is every bar of that chord, one run of them unless a form follows.
        const own = bars.map((bar, i) => (bar.chord === claim.chord ? i : -1)).filter((i) => i >= 0);
        expect(is[3], `${where}: ${sentence}`).toBeUndefined();
        for (const i of own) said[i] = claim;
        if (is[4] !== undefined) expect(own, `${where}: ${sentence}`).toEqual(Array.from({ length }, (_x, n) => own[0] + n));
      }
    }
    if (span) expect(at, `${where}: ${head} says every bar it names`).toBe(Number(span[2]));
    const frets = bars.slice(start, span ? at : bars.length).flatMap((bar) => bar.frets);
    const now = { low: Math.min(...frets), high: Math.max(...frets) };
    const move = /(higher|lower) on the neck/.exec(head);
    if (move && reach) {
      expect(move[1] === "higher" ? now.low > reach.low && now.high > reach.high : now.low < reach.low && now.high < reach.high, `${where}: ${head}`).toBe(true);
    }
    expect(move === null || reach !== null, `${where}: ${head}`).toBe(true);
    reach = now;
  }
  bars.forEach((bar, i) => {
    expect(said[i], `${where}: bar ${i + 1} is not said`).toBeDefined();
    expect(said[i], `${where}: bar ${i + 1}`).toEqual({ chord: bar.chord, strings: bar.strings, frets: bar.frets });
  });
  // The order of the bars is said: by a form, by bars counted in fours, or by each chord having one run of bars.
  if (form) expect(form, where).toEqual(bars.map((bar) => bar.chord));
  else if (!lines.some((text) => /bars \d+ to \d+/i.test(text))) {
    const runs = bars.filter((bar, i) => i === 0 || bar.chord !== bars[i - 1].chord).map((bar) => bar.chord);
    expect(new Set(runs).size, `${where}: a chord comes back and no form says so`).toBe(runs.length);
    const held = lines.join(" ").match(/, for \w+ bars/g)?.length ?? 0;
    expect(held, `${where}: every chord held is said to be`).toBe(runs.filter((chord) => bars.filter((bar) => bar.chord === chord).length > 1).length);
  }
}

/** Reads a single-note line back: each chord, in order, with the string and fret its first bar starts on. */
function checkStarts(lines: readonly string[], bars: readonly PackBar[], where: string) {
  expect(lines.length, where).toBe(1);
  const oneString = /^In .+?, each chord starts on the (.+) string: (.+)\.$/.exec(lines[0]);
  const each = /^In .+?: (.+)\.$/.exec(lines[0]);
  const said = oneString
    ? oneString[2].split(/, | and /).map((item) => {
        const m = /^(.+) at fret (\d+)$/.exec(item)!;
        return { chord: m[1], string: STRING_NUMBER[oneString[1]], fret: Number(m[2]) };
      })
    : each![1].split(/, | and /).map((item, i) => {
        const m = /^(.+?)( starts)? on the (.+) string at fret (\d+)$/.exec(item)!;
        expect(m[2] !== undefined, `${where}: ${item}`).toBe(i === 0);
        return { chord: m[1], string: STRING_NUMBER[m[3]], fret: Number(m[4]) };
      });
  const starts = bars.filter((bar, i) => i === 0 || bar.chord !== bars[i - 1].chord).map((bar) => ({ chord: bar.chord, ...bar.first }));
  expect(said, where).toEqual(starts);
}

describe.each([
  ["triads", triads, 8],
  ["chords-in-a-key", chordsInAKey, 8],
  ["arpeggios-over-changes", arpeggiosOverChanges, 5],
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
        expect(v.howTo?.length, `${ex.id}#${v.id}`).toBeGreaterThanOrEqual(2);
        expect(v.purpose, `${ex.id}#${v.id}`).toBeUndefined();
      }
    }
  });

  it("keeps the tempo sentence, names its own key, and never says 'first version' or measures from another key", () => {
    for (const ex of moved) {
      // Every moved line has its own how-to, so the Exercise no longer says its words are the first version's.
      expect(ex.howTo.join(" "), ex.id).not.toMatch(/for the first version/);
      for (const v of ex.variation!.variants.slice(1)) {
        const [tempo, own] = v.howTo!;
        const where = `${ex.id}#${v.id}`;
        expect(tempo, where).toBe(ex.howTo[0]);
        expect(own.startsWith(`In ${keyWords(v.params.key!)}`), `${where}: ${own}`).toBe(true);
        const text = v.howTo!.join(" ");
        expect(text, where).not.toMatch(/first version/i);
        expect(text, where).not.toMatch(/ than |written|!/);
        // One key is named, the variant's own: "In" is said once.
        expect(text.match(/\bIn [A-G]/g), where).toHaveLength(1);
        expect(new Set(v.howTo).size, where).toBe(v.howTo!.length);
      }
    }
  });

  it("says what that variant plays: every bar's chord and frets, or where each chord starts", () => {
    for (const ex of moved) {
      for (const v of ex.variation!.variants.slice(1)) {
        const own = v.howTo!.slice(1);
        const where = `${ex.id}#${v.id}`;
        if (own[0].includes(" starts on the ")) checkStarts(own, packBars(v), where);
        else checkShapes(own, packBars(v), where);
      }
    }
  });
});
