import { describe, it, expect } from "vitest";
import {
  SCALES,
  SCALE_IDS,
  SCALE_NAMES_EN,
  scaleNotes,
  scalesForChord,
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
