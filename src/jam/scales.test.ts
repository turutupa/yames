import { describe, it, expect } from "vitest";
import {
  SCALES,
  SCALE_IDS,
  SCALE_NAMES_EN,
  scaleNotes,
  scalesForChord,
  scalesForKey,
  type ScaleId,
} from "./scales";
import {
  barsForForm,
  chordNotes,
  nameToPitchClass,
  type Chord,
  type ChordQuality,
  type Key,
  type KeyMode,
  type PitchClass,
} from "./harmony";
import type { JamFormKind } from "./types";

const MODES: KeyMode[] = ["major", "minor", "blues"];
const ALL_ROOTS: PitchClass[] = Array.from({ length: 12 }, (_unused, i) => i);
const FORM_KINDS: JamFormKind[] = ["blues12", "loop8", "bars16", "aaba32", "one", "custom"];
/**
 * Every quality in the union, not just the ones a form produces. The key
 * strip offers the vii° of every major key and the ii° of every minor one,
 * and the shape library knows the sus and augmented grips, so a player can
 * land on any of these and the screen still owes them a scale.
 */
const QUALITIES: ChordQuality[] = [
  "maj",
  "min",
  "5",
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

const pc = (name: string): PitchClass => nameToPitchClass(name) as PitchClass;

/** The scale ids of a suggestion list, in the order the UI will show them. */
function ranked(chord: Chord, key: Key): ScaleId[] {
  return scalesForChord(chord, key).map((suggestion) => suggestion.scale);
}

describe("the scales themselves", () => {
  it("is a set of intervals that starts on the root and climbs", () => {
    for (const id of SCALE_IDS) {
      const { intervals } = SCALES[id];
      expect(intervals[0], id).toBe(0);
      expect(intervals.length, id).toBeGreaterThanOrEqual(5);
      for (let i = 1; i < intervals.length; i++) {
        expect(intervals[i], `${id} climbs`).toBeGreaterThan(intervals[i - 1]);
        expect(intervals[i], `${id} stays inside the octave`).toBeLessThan(12);
      }
    }
  });

  it("spells the scales a player would check it against", () => {
    // A minor pentatonic: A C D E G — the first shape every guitarist learns.
    expect(scaleNotes(pc("A"), "minorPentatonic")).toEqual([
      pc("A"),
      pc("C"),
      pc("D"),
      pc("E"),
      pc("G"),
    ]);
    // The blues scale is that, with the flat five wedged in.
    expect(scaleNotes(pc("A"), "blues")).toEqual([
      pc("A"),
      pc("C"),
      pc("D"),
      pc("Eb"),
      pc("E"),
      pc("G"),
    ]);
    expect(scaleNotes(pc("C"), "major")).toEqual([0, 2, 4, 5, 7, 9, 11]);
    // G mixolydian is C major from G: one flat seventh, F natural.
    expect(scaleNotes(pc("G"), "mixolydian")).toEqual(
      [pc("G"), pc("A"), pc("B"), pc("C"), pc("D"), pc("E"), pc("F")],
    );
    // D dorian is C major from D: the natural sixth, B, is what separates it
    // from D natural minor.
    expect(scaleNotes(pc("D"), "dorian")).toContain(pc("B"));
    expect(scaleNotes(pc("D"), "naturalMinor")).toContain(pc("Bb"));
    // A harmonic minor raises the seventh to G#, which is the whole point.
    expect(scaleNotes(pc("A"), "harmonicMinor")).toContain(pc("G#"));
    expect(scaleNotes(pc("A"), "naturalMinor")).not.toContain(pc("G#"));
  });

  it("carries an i18n key and an English fallback for every scale", () => {
    for (const id of SCALE_IDS) {
      expect(SCALES[id].labelKey, id).toBe(`scale.${id}`);
      expect(SCALE_NAMES_EN[id], id).toBeTruthy();
    }
  });
});

describe("which scale over which chord", () => {
  it("puts mixolydian first over the I7 of a blues", () => {
    const aBlues: Key = { root: pc("A"), mode: "blues" };
    const suggestions = scalesForChord({ root: pc("A"), quality: "7" }, aBlues);
    expect(suggestions.map((s) => s.scale)).toEqual(["mixolydian", "minorPentatonic", "blues"]);
    for (const suggestion of suggestions) expect(suggestion.root).toBe(pc("A"));
    expect(suggestions[0].labelKey).toBe("scale.mixolydian");
    expect(suggestions[0].pitchClasses).toEqual(scaleNotes(pc("A"), "mixolydian"));
  });

  it("keeps the blues rub: the first scale spells the chord, the second bends against it", () => {
    const aBlues: Key = { root: pc("A"), mode: "blues" };
    const [mixolydian, pentatonic] = scalesForChord({ root: pc("A"), quality: "7" }, aBlues);
    // A7 has a C#; A mixolydian has it, A minor pentatonic has the C natural
    // you bend up towards it. Both are right, which is why both are listed.
    expect(mixolydian.pitchClasses).toContain(pc("C#"));
    expect(pentatonic.pitchClasses).not.toContain(pc("C#"));
    expect(pentatonic.pitchClasses).toContain(pc("C"));
  });

  it("answers a ii-V in a major key with dorian then mixolydian", () => {
    const c: Key = { root: pc("C"), mode: "major" };
    const ii = scalesForChord({ root: pc("D"), quality: "m7" }, c);
    const v = scalesForChord({ root: pc("G"), quality: "7" }, c);
    expect(ii[0].scale).toBe("dorian");
    expect(ii[0].root).toBe(pc("D"));
    expect(v[0].scale).toBe("mixolydian");
    expect(v[0].root).toBe(pc("G"));
    // Both are C major from a different note, which is the whole idea of a
    // ii-V: one set of notes, two chords.
    expect([...ii[0].pitchClasses].sort()).toEqual([...v[0].pitchClasses].sort());
  });

  it("answers a minor tonic with natural minor, dorian and the pentatonic", () => {
    const am: Key = { root: pc("A"), mode: "minor" };
    expect(ranked({ root: pc("A"), quality: "m7" }, am)).toEqual([
      "naturalMinor",
      "dorian",
      "minorPentatonic",
    ]);
    // A minor blues is pentatonic country first.
    const aBlues: Key = { root: pc("A"), mode: "blues" };
    expect(ranked({ root: pc("A"), quality: "m7" }, aBlues)[0]).toBe("minorPentatonic");
  });

  it("answers the V7 of a minor key with the key's harmonic minor", () => {
    const am: Key = { root: pc("A"), mode: "minor" };
    const suggestions = scalesForChord({ root: pc("E"), quality: "7" }, am);
    expect(suggestions[0].scale).toBe("harmonicMinor");
    // Rooted on A, not on E: that is the phrygian-dominant sound over E7, and
    // it keeps the F natural the rest of the progression is built on.
    expect(suggestions[0].root).toBe(pc("A"));
    expect(suggestions[0].pitchClasses).toContain(pc("G#"));
    expect(suggestions[0].pitchClasses).toContain(pc("F"));
    expect(suggestions[1].scale).toBe("altered");
  });

  it("answers a diminished passing chord with the harmonic minor a semitone up", () => {
    const bb: Key = { root: pc("Bb"), mode: "major" };
    const suggestions = scalesForChord({ root: pc("E"), quality: "dim7" }, bb);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].scale).toBe("harmonicMinor");
    expect(suggestions[0].root).toBe(pc("F"));
  });

  it("never offers more than three, and never offers none", () => {
    for (const quality of QUALITIES) {
      for (const mode of MODES) {
        for (const root of ALL_ROOTS) {
          const key: Key = { root: 0, mode };
          const suggestions = scalesForChord({ root, quality }, key);
          expect(suggestions.length, `${quality} in ${mode}`).toBeGreaterThanOrEqual(1);
          expect(suggestions.length, `${quality} in ${mode}`).toBeLessThanOrEqual(3);
          // No scale is suggested twice from the same root.
          const seen = suggestions.map((s) => `${s.scale}@${s.root}`);
          expect(new Set(seen).size).toBe(seen.length);
        }
      }
    }
  });

  it("offers a first scale that contains every note of the chord, for every chord Jam can play", () => {
    // The safety property a player relies on: whatever the screen puts first,
    // you can land on any chord tone and be right. Later suggestions are
    // allowed to rub (see the blues test above); the first one never does.
    for (const kind of FORM_KINDS) {
      for (const mode of MODES) {
        for (const root of ALL_ROOTS) {
          const key: Key = { root, mode };
          for (const bar of barsForForm(kind, 32, key)) {
            for (const chord of bar.chords) {
              const [first] = scalesForChord(chord, key);
              const notes = new Set(first.pitchClasses);
              for (const tone of chordNotes(chord)) {
                expect(
                  notes.has(tone),
                  `${first.scale}@${first.root} should contain ${tone} of ${chord.quality}@${chord.root} in ${mode}`,
                ).toBe(true);
              }
            }
          }
        }
      }
    }
  });
});

/**
 * The scales a KEY offers, which is what the cheat sheet's chip row draws.
 *
 * Worth its own tests because the list is a judgement about what players
 * reach for rather than a fact about intervals, and because it was silently
 * capped at three for a while — `build` takes a limit meant for the NOW
 * block's single line of text, and a key's chips are not a line of text.
 */
describe("the scales a key offers", () => {
  const key = (root: number, mode: KeyMode): Key => ({ root: root as PitchClass, mode });

  it("offers more than the three a chord's caption has room for", () => {
    // The bug: every key came back with exactly three because `build`'s
    // default limit belongs to a different caller.
    expect(scalesForKey(key(9, "blues")).length).toBeGreaterThan(3);
    expect(scalesForKey(key(9, "minor")).length).toBeGreaterThan(3);
  });

  it("leads with the one a player reaches for without thinking", () => {
    expect(scalesForKey(key(9, "blues"))[0].scale).toBe("minorPentatonic");
    expect(scalesForKey(key(9, "minor"))[0].scale).toBe("minorPentatonic");
    expect(scalesForKey(key(0, "major"))[0].scale).toBe("majorPentatonic");
  });

  it("puts the major pentatonic on a blues key", () => {
    // Mixing it with the minor pentatonic IS the blues guitar sound, and for
    // a long time a blues key offered no way to see it.
    expect(scalesForKey(key(9, "blues")).map((s) => s.scale)).toContain("majorPentatonic");
  });

  it("puts harmonic minor on a minor key", () => {
    // It was in this file from the start and no key ever offered it.
    expect(scalesForKey(key(9, "minor")).map((s) => s.scale)).toContain("harmonicMinor");
  });

  it("names every scale it offers, and plays them all from the key's root", () => {
    for (const mode of ["major", "minor", "blues"] as KeyMode[]) {
      for (let root = 0; root < 12; root++) {
        for (const suggestion of scalesForKey(key(root, mode))) {
          expect(SCALE_NAMES_EN[suggestion.scale], suggestion.scale).toBeTruthy();
          expect(suggestion.root, `${mode} ${root} ${suggestion.scale}`).toBe(root);
          expect(suggestion.pitchClasses.length).toBeGreaterThan(4);
        }
      }
    }
  });

  it("offers each scale once", () => {
    for (const mode of ["major", "minor", "blues"] as KeyMode[]) {
      const ids = scalesForKey(key(9, mode)).map((s) => s.scale);
      expect(new Set(ids).size, `${mode}: ${ids.join(", ")}`).toBe(ids.length);
    }
  });
});

/**
 * What a printed guitar scales poster carries (2026-09-19).
 *
 * The owner asked repeatedly for the list to match the cards people buy,
 * and I kept adding what I reasoned my way to instead of what they print.
 * So this is the published set, written down: the widely sold posters run
 * to seventeen diagrams in five groups — the seven modes of the major
 * scale, the two minor scales, the two pentatonics, the two blues, and
 * FOUR symmetrical scales — and the larger ones add the three bebop scales
 * and the chromatic.
 *
 * The symmetrical group is the one this app kept getting wrong: it had
 * three of the four for a long time, because the augmented scale is the
 * one nobody remembers until they look at a poster.
 *
 * Anything beyond this is ours to choose. Anything INSIDE it is not.
 */
describe("the scales a printed poster carries", () => {
  const POSTER: Record<string, ScaleId[]> = {
    "the modes of the major scale": [
      "major",
      "dorian",
      "phrygian",
      "lydian",
      "mixolydian",
      "naturalMinor",
      "locrian",
    ],
    "the minor scales": ["harmonicMinor", "melodicMinor"],
    "the pentatonics": ["majorPentatonic", "minorPentatonic"],
    "the blues scales": ["blues", "majorBlues"],
    "the symmetrical scales": [
      "diminishedHalfWhole",
      "diminishedWholeHalf",
      "augmentedScale",
      "wholeTone",
    ],
    "the bebop scales": ["bebopDominant", "bebopMajor", "bebopMinor"],
  };

  for (const [group, ids] of Object.entries(POSTER)) {
    it(`has all of ${group}`, () => {
      expect(ids.filter((id) => !SCALE_IDS.includes(id))).toEqual([]);
    });
  }

  it("names every one of them, and spells every one correctly", () => {
    for (const id of SCALE_IDS) {
      expect(SCALE_NAMES_EN[id], id).toBeTruthy();
      const notes = scaleNotes(0, id);
      // Ascending from the root, no note twice, all inside an octave.
      expect(notes[0]).toBe(0);
      expect(new Set(notes).size, `${id} repeats a note`).toBe(notes.length);
      expect([...notes].sort((a, b) => a - b), `${id} is not ascending`).toEqual(notes);
    }
  });
});
