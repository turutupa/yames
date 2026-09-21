/**
 * The cheat sheet is a promise about theory, so the checks below are written
 * as a musician would check them: not "the function returns an array" but
 * "Dsus2 is D E A, all three of them in C major, so it belongs on the page,
 * and Esus2 is E F# B, so it does not". Every expectation here was worked out
 * on paper first and is stated as chord names, not as pitch-class arithmetic,
 * because a wrong chord on a cheat sheet teaches a player something false and
 * an off-by-one in a test would hide it.
 */
import { describe, expect, it } from "vitest";
import {
  CHORD_FAMILIES,
  CHORD_FLAVOURS,
  chordsAtFlavour,
  defaultFlavour,
  fitsKey,
  keyNoteSet,
  qualitiesInFamily,
  rootNames,
} from "./cheatSheet";
import { CHORD_QUALITIES, chordName, chordsInKey, seventhsInKey } from "./diatonic";
import { nameToPitchClass, parseChordName } from "./harmony";
import type { Chord, ChordQuality, Key, KeyMode, PitchClass } from "./harmony";
import { VIBE_IDS } from "./vibesContract";

const C = 0;
const A = 9;
const ROOTS: PitchClass[] = Array.from({ length: 12 }, (_unused, i) => i);
const MODES: KeyMode[] = ["major", "minor", "blues"];

/** The chords of a page as a player would read them, in the key's spelling. */
function names(root: PitchClass, mode: KeyMode, flavour: (typeof CHORD_FLAVOURS)[number]): string[] {
  const key: Key = { root, mode };
  return chordsAtFlavour(root, mode, flavour).map((c) => chordName(c.root, c.quality, key));
}

/** The degree labels of a page: "I", "ii7", "Vsus4", "bVII5". */
function degrees(
  root: PitchClass,
  mode: KeyMode,
  flavour: (typeof CHORD_FLAVOURS)[number],
): string[] {
  return chordsAtFlavour(root, mode, flavour).map((c) => c.degree);
}

/** "Bb" → 10. */
const pc = (name: string): PitchClass => nameToPitchClass(name) as PitchClass;

/** "Dm6" as a chord, so an expectation can be written the way it is played. */
function chord(name: string): Chord {
  const parsed = parseChordName(name);
  if (!parsed) throw new Error(`not a chord: ${name}`);
  return parsed;
}

describe("the flavours", () => {
  it("offers four, plainest first", () => {
    expect(CHORD_FLAVOURS).toEqual(["triads", "sevenths", "colours", "power"]);
  });

  it("is the key strip at triads and the sevenths toggle at sevenths", () => {
    for (const mode of MODES) {
      for (const root of ROOTS) {
        expect(chordsAtFlavour(root, mode, "triads")).toEqual(chordsInKey(root, mode));
        expect(chordsAtFlavour(root, mode, "sevenths")).toEqual(seventhsInKey(root, mode));
      }
    }
  });

  it("never hands back an empty page, in any key at any flavour", () => {
    for (const flavour of CHORD_FLAVOURS) {
      for (const mode of MODES) {
        for (const root of ROOTS) {
          expect(chordsAtFlavour(root, mode, flavour).length, `${root} ${mode} ${flavour}`)
            .toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps what each chord is doing in the key, whatever the flavour", () => {
    for (const flavour of CHORD_FLAVOURS) {
      for (const chordOfKey of chordsAtFlavour(C, "major", flavour)) {
        expect(["home", "subdominant", "dominant", "passing"]).toContain(chordOfKey.role);
      }
    }
    // The V is the dominant whether it is a triad, a seventh or a power chord.
    for (const flavour of CHORD_FLAVOURS) {
      const onG = chordsAtFlavour(C, "major", flavour).filter((c) => c.root === pc("G"));
      expect(onG.length, flavour).toBeGreaterThan(0);
      for (const c of onG) expect(c.role, flavour).toBe("dominant");
    }
  });
});

describe("the power page", () => {
  it("turns every degree of a major key into a fifth, upper case, with the ° gone", () => {
    expect(degrees(C, "major", "power")).toEqual(["I5", "II5", "III5", "IV5", "V5", "VI5", "VII5"]);
    expect(names(C, "major", "power")).toEqual(["C5", "D5", "E5", "F5", "G5", "A5", "B5"]);
  });

  it("lists a blues as its five chords, flats and all", () => {
    expect(degrees(A, "blues", "power")).toEqual(["I5", "IV5", "V5", "bIII5", "bVII5"]);
    expect(names(A, "blues", "power")).toEqual(["A5", "D5", "E5", "C5", "G5"]);
  });

  it("prints the minor v once, not twice", () => {
    // A minor key lists the natural v and the borrowed V7. As power chords
    // they are the same two notes, so one card, not two.
    const page = degrees(A, "minor", "power");
    expect(page).toEqual(["I5", "II5", "III5", "IV5", "V5", "VI5", "VII5"]);
    expect(new Set(page).size).toBe(page.length);
  });

  it("is nothing but power chords", () => {
    for (const mode of MODES) {
      for (const c of chordsAtFlavour(C, mode, "power")) expect(c.quality).toBe("5");
    }
  });
});

/**
 * The colours of C major, worked out by ear on paper before a line of this
 * was written. C major's notes are C D E F G A B and nothing else, so a
 * colour belongs on the page exactly when all of its notes are among those
 * seven.
 */
describe("the colours page in C major", () => {
  const page = names(C, "major", "colours");

  it("is these eighteen chords, in this order", () => {
    expect(page).toEqual([
      // I: C F G, C D G, C D E G, C E G A
      "Csus4",
      "Csus2",
      "Cadd9",
      "C6",
      // ii: D G A, D E A, and the MINOR sixth D F A B on a minor degree
      "Dsus4",
      "Dsus2",
      "Dm6",
      // iii: E A B, and no more — Esus2 is E F# B and Em6 is E G B C#
      "Esus4",
      // IV: Fsus4 would be F Bb C, so it is not here
      "Fsus2",
      "Fadd9",
      "F6",
      // V: the one degree that gets all five, ninth included
      "Gsus4",
      "Gsus2",
      "Gadd9",
      "G6",
      "G9",
      // vi: A D E and A B E; Aadd9 needs C# and Am6 needs F#
      "Asus4",
      "Asus2",
    ]);
  });

  it("labels them as the degree plus the suffix", () => {
    expect(degrees(C, "major", "colours").slice(0, 7)).toEqual([
      "Isus4",
      "Isus2",
      "Iadd9",
      "I6",
      "iisus4",
      "iisus2",
      "iim6",
    ]);
    expect(degrees(C, "major", "colours")).toContain("Vsus4");
    expect(degrees(C, "major", "colours")).toContain("IV6");
  });

  it("leaves out the chords whose notes are not in the key", () => {
    // The ones the brief names, each checked by its notes rather than by
    // trusting the list above.
    for (const name of ["Esus2", "Bsus4", "C9", "Fsus4", "Aadd9"]) {
      expect(fitsKey(chord(name), C, "major"), name).toBe(false);
      expect(page, name).not.toContain(name);
    }
    for (const name of ["Csus4", "Dsus2", "Cadd9", "C6", "Dm6", "G9"]) {
      expect(fitsKey(chord(name), C, "major"), name).toBe(true);
      expect(page, name).toContain(name);
    }
  });

  it("gives the diminished seventh degree nothing, because nothing fits", () => {
    const onB = chordsAtFlavour(C, "major", "colours").filter((c) => c.root === pc("B"));
    expect(onB).toEqual([]);
  });

  it("offers only colours the key contains, in every key there is", () => {
    for (const mode of MODES) {
      for (const root of ROOTS) {
        for (const c of chordsAtFlavour(root, mode, "colours")) {
          expect(fitsKey({ root: c.root, quality: c.quality }, root, mode)).toBe(true);
        }
      }
    }
  });

  it("stays in degree order, several cards to a degree", () => {
    for (const mode of MODES) {
      const order = chordsInKey(C, mode).map((d) => d.root);
      const seen = chordsAtFlavour(C, mode, "colours").map((c) => c.root);
      let at = 0;
      for (const root of seen) {
        while (at < order.length && order[at] !== root) at += 1;
        expect(at, `${mode} ${root}`).toBeLessThan(order.length);
      }
    }
  });
});

describe("the key's note set", () => {
  it("is exactly the seven scale notes of a major key", () => {
    expect([...keyNoteSet(C, "major")].sort((a, b) => a - b)).toEqual(
      ["C", "D", "E", "F", "G", "A", "B"].map(pc).sort((a, b) => a - b),
    );
  });

  it("is a minor key's seven plus the raised seventh the V7 carries", () => {
    const set = keyNoteSet(A, "minor");
    expect(set.size).toBe(8);
    for (const name of ["A", "B", "C", "D", "E", "F", "G", "G#"]) {
      expect(set.has(pc(name)), name).toBe(true);
    }
  });

  it("is nine notes for a blues, and never Bb, Eb or F", () => {
    const set = keyNoteSet(A, "blues");
    expect(set.size).toBe(9);
    for (const name of ["Bb", "Eb", "F"]) expect(set.has(pc(name)), name).toBe(false);
  });

  it("contains every chord the key strip lists, at both flavours", () => {
    // The point of deriving the set from the listed chords: the sheet cannot
    // mark one of its own in-key chords as out of key.
    for (const mode of MODES) {
      for (const root of ROOTS) {
        for (const c of [...chordsInKey(root, mode), ...seventhsInKey(root, mode)]) {
          const belongs = fitsKey({ root: c.root, quality: c.quality }, root, mode);
          // The sevenths of a blues degree are the one exception, and they
          // are why the set is the triad list rather than both: bIII7 brings
          // a flat seven no blues player calls part of the key.
          if (mode === "blues" && c.quality === "7" && c.degree.startsWith("b")) continue;
          expect(belongs, `${mode} ${c.degree}`).toBe(true);
        }
      }
    }
  });
});

describe("what fits the key", () => {
  it("says yes only when every note is in the key", () => {
    expect(fitsKey(chord("Dm7"), C, "major")).toBe(true);
    expect(fitsKey(chord("D7"), C, "major")).toBe(false); // the F# is not in C
    // The borrowed V7, raised third and all: A minor's set has the G# in it
    // because the V7 the strip already lists put it there.
    expect(fitsKey(chord("E7"), A, "minor")).toBe(true);
    // And in A MAJOR the same E7 fits too, because it is that key's own V7.
    expect(fitsKey(chord("E7"), A, "major")).toBe(true);
    // What does not fit A major is the natural seventh: Em7 wants a G.
    expect(fitsKey(chord("Em7"), A, "major")).toBe(false);
  });

  it("counts the tonic chord of every key as fitting it", () => {
    for (const mode of MODES) {
      for (const root of ROOTS) {
        const tonic = chordsInKey(root, mode)[0];
        expect(fitsKey({ root: tonic.root, quality: tonic.quality }, root, mode)).toBe(true);
      }
    }
  });

  it("moves with the key rather than with the note names", () => {
    // The same relationship, transposed: what fits C major fits D major a
    // whole tone up.
    expect(fitsKey(chord("Gsus4"), C, "major")).toBe(true);
    expect(fitsKey(chord("Asus4"), pc("D"), "major")).toBe(true);
  });
});

describe("the flavour a jam opens on", () => {
  it("opens rock, hard rock and metal on power chords", () => {
    for (const vibe of ["rock", "hardRock", "metal"]) {
      expect(defaultFlavour({ vibe }), vibe).toBe("power");
    }
  });

  it("opens jazz and blues on sevenths", () => {
    for (const vibe of ["jazz", "blues"]) {
      expect(defaultFlavour({ vibe }), vibe).toBe("sevenths");
    }
  });

  it("opens everything else on triads", () => {
    for (const vibe of VIBE_IDS) {
      const flavour = defaultFlavour({ vibe });
      if (["rock", "hardRock", "metal"].includes(vibe)) continue;
      if (["jazz", "blues"].includes(vibe)) continue;
      expect(flavour, vibe).toBe("triads");
    }
  });

  it("falls back to the key when there is no vibe to read", () => {
    expect(defaultFlavour({ key: "A blues" })).toBe("sevenths");
    expect(defaultFlavour({ key: "A" })).toBe("triads");
    expect(defaultFlavour({ key: "Am" })).toBe("triads");
    expect(defaultFlavour({})).toBe("triads");
    // A record from a future version, or one hand-edited into nonsense.
    expect(defaultFlavour({ vibe: "klezmer", key: "A blues" })).toBe("sevenths");
    expect(defaultFlavour({ vibe: "klezmer", key: "not a key" })).toBe("triads");
  });

  it("lets the vibe win over the key, because it is the more specific answer", () => {
    expect(defaultFlavour({ vibe: "metal", key: "A blues" })).toBe("power");
  });
});

describe("the chord families", () => {
  it("holds every chord type the library knows, and none of them twice", () => {
    const listed = CHORD_FAMILIES.flatMap((family) => [...qualitiesInFamily(family)]);
    expect(new Set(listed).size, "no quality is in two families").toBe(listed.length);
    expect([...listed].sort()).toEqual([...CHORD_QUALITIES].sort());
  });

  it("groups the chords by what they ARE, so a reader can find them", () => {
    // They were grouped by when a player MEETS them — basic, sevenths,
    // colours — which teaches well and finds nothing. A guitarist at a chart
    // is asking "where are the minor ones".
    expect(qualitiesInFamily("major")[0]).toBe("maj");
    expect(qualitiesInFamily("minor")[0]).toBe("min");
    expect(qualitiesInFamily("dominant")[0]).toBe("7");

    // Every minor chord is in the minor family and nowhere else. The chart's
    // columns come out in this order, so a stray m9 among the dominants
    // would put it under the wrong heading on every row.
    for (const quality of ["min", "m6", "m7", "m9", "m11", "m13", "madd9"] as ChordQuality[]) {
      expect(qualitiesInFamily("minor"), quality).toContain(quality);
    }
    for (const quality of ["7", "9", "11", "13"] as ChordQuality[]) {
      expect(qualitiesInFamily("dominant"), quality).toContain(quality);
    }
    // A half-diminished is not a minor chord however it is spelled, and a
    // power chord is not a major one.
    expect(qualitiesInFamily("other")).toContain("m7b5");
    expect(qualitiesInFamily("other")).toContain("5");
  });
});

describe("the row of roots", () => {
  it("is the twelve pitch classes in order from C", () => {
    expect(rootNames({ root: C, mode: "major" }).map((r) => r.pc)).toEqual(ROOTS);
  });

  it("spells them the way the key spells them", () => {
    expect(rootNames({ root: pc("F"), mode: "major" })[6].name).toBe("Gb");
    expect(rootNames({ root: pc("D"), mode: "major" })[6].name).toBe("F#");
    // D minor borrows F major's signature, so it is a flat key even though D
    // major is a sharp one.
    expect(rootNames({ root: pc("D"), mode: "minor" })[10].name).toBe("Bb");
  });

  it("names every root in every key, with no blanks", () => {
    for (const mode of MODES) {
      for (const root of ROOTS) {
        const row = rootNames({ root, mode });
        expect(row).toHaveLength(12);
        for (const entry of row) expect(entry.name.length).toBeGreaterThan(0);
      }
    }
  });
});
