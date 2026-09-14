/**
 * The band under a power chord.
 *
 * A10 says the power chord is a chord type and that the band plays it without
 * a third: bass root and fifth, keys root, fifth and octave. That is a claim
 * about what comes out of the whole chain — a chord typed into a bar, through
 * the progression, through the compiler, into the two lines the engine plays —
 * so it is checked there rather than one table at a time. A third under a
 * guitarist playing fifths is the one wrong note this feature could produce,
 * and it would be the band announcing a major chord the player never asked
 * for.
 */
import { describe, expect, it } from "vitest";
import { bassChordFrom } from "./bandChord";
import { chordFifth, chordThird, chordTones, type BassChordQuality } from "./bassline";
import { jamBassLine, jamKeysLine } from "./compile";
import { chordIntervals, pitchClass } from "./harmony";
import { createJam } from "./jams";
import { withChordAt } from "./progression";
import type { Jam } from "./types";

const ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BARS = 4;

/** The two thirds. Either one under a power chord is the bug. */
function thirdsOf(root: number): number[] {
  return [pitchClass(root + 3), pitchClass(root + 4)];
}

/** A jam whose every bar is the same power chord, with the whole band on. */
function powerJam(name: string): Jam {
  let progression: string[] = [];
  for (let bar = 0; bar < BARS; bar += 1) {
    progression = withChordAt(progression, BARS, bar, name);
  }
  return createJam("power", {
    form: { kind: "one", bars: BARS },
    band: { drums: true, bass: true, keys: true },
    progression,
  });
}

describe("the power chord reaches the bass as two notes", () => {
  it("is not translated into anything with a third in it", () => {
    for (const root of ROOTS) {
      const chord = bassChordFrom({ root, quality: "5" });
      expect(chord.quality).toBe("5");
      expect(chordTones(chord)).toEqual([0, 7]);
      // The two readers the styles use. There is no third to report, so the
      // "third" comes back as the fifth: a figure walks through it twice
      // rather than inventing a major or a minor chord to walk through.
      expect(chordThird(chord)).toBe(7);
      expect(chordFifth(chord)).toBe(7);
    }
  });

  it("leaves the fifth where it was on every chord built out of thirds", () => {
    const stacked: BassChordQuality[] = [
      "maj",
      "min",
      "7",
      "maj7",
      "m7",
      "m7b5",
      "dim7",
      "6",
      "m6",
      "9",
    ];
    for (const quality of stacked) {
      const chord = { rootMidi: 36, quality };
      expect(chordFifth(chord), quality).toBe(chordTones(chord)[2]);
      expect(chordThird(chord), quality).toBe(chordTones(chord)[1]);
    }
  });

  it("puts no third in the bass line, at any root, in any bar", () => {
    for (const root of ROOTS) {
      const name = SHARP[root] + "5";
      const jam = powerJam(name);
      for (let bar = 0; bar < BARS; bar += 1) {
        const line = jamBassLine(jam, bar);
        expect(line, name).not.toBeNull();
        // A zero is a rest, not a note; nothing this low is ever played.
        const played = new Set(
          (line?.pitches ?? []).filter((p) => p !== 0).map((p) => pitchClass(p)),
        );
        expect(played.size, `${name} bar ${bar}`).toBeGreaterThan(0);
        for (const third of thirdsOf(root)) {
          expect(played.has(third), `${name} bar ${bar} third ${third}`).toBe(false);
        }
        for (const note of played) {
          expect([pitchClass(root), pitchClass(root + 7)], `${name} played ${note}`).toContain(note);
        }
      }
    }
  });
});

describe("the power chord reaches the keys as root, fifth and octave", () => {
  it("comps three notes from two pitch classes, at every root", () => {
    for (const root of ROOTS) {
      const name = SHARP[root] + "5";
      const line = jamKeysLine(powerJam(name), 0);
      expect(line, name).not.toBeNull();
      const struck = (line?.voicings ?? []).filter((v) => v.length > 0);
      expect(struck.length, name).toBeGreaterThan(0);
      for (const voicing of struck) {
        const classes = voicing.map((n) => pitchClass(n));
        for (const third of thirdsOf(root)) expect(classes, name).not.toContain(third);
        expect(new Set(classes), name).toEqual(new Set([pitchClass(root), pitchClass(root + 7)]));
        expect(voicing.length, name).toBe(3);
        expect(voicing[voicing.length - 1] - voicing[0], name).toBe(12);
      }
    }
  });
});

describe("a bar holding a power chord is still a bar", () => {
  it("is written down and read back as the chord it was", () => {
    expect(chordIntervals("5")).toEqual([0, 7]);
    expect(powerJam("Bb5").progression).toEqual(["Bb5", "Bb5", "Bb5", "Bb5"]);
  });

  it("leaves the chords the forms already play exactly as they were", () => {
    const plain = createJam("plain", {
      form: { kind: "blues12", bars: 12 },
      band: { drums: true, bass: true, keys: true },
      key: "A",
    });
    const line = jamBassLine(plain, 0);
    // A7 in bar one: the third is there, because on a dominant seventh it
    // belongs there. Only the power chord lost it.
    const played = new Set((line?.pitches ?? []).filter((p) => p !== 0).map((p) => pitchClass(p)));
    expect(played.size).toBeGreaterThan(0);
    expect([...played].every((n) => [9, 1, 4, 7].includes(n))).toBe(true);
  });
});
