import { describe, it, expect } from "vitest";
import {
  KEYS_HIGH,
  KEYS_LOW,
  KEYS_MAX_LEAP,
  KEYS_MAX_NOTES,
  chooseVoicing,
  keysLineFor,
  keysTicks,
  lastVoicing,
} from "./keysline";
import { grooveById, ruleGroove } from "./grooves";
import type { Chord, ChordQuality, PitchClass } from "./harmony";
import type { JamPattern } from "./types";

const ROOTS: PitchClass[] = Array.from({ length: 12 }, (_unused, i) => i);
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

const ROCK8 = grooveById("rock8");
const FOUR_FOUR = { beatsPerBar: 4, ticksPerBeat: 2 };

/** How far `note` is from the nearest note of `from`. */
function nearest(from: readonly number[], note: number): number {
  return Math.min(...from.map((other) => Math.abs(other - note)));
}

describe("the keys voicing", () => {
  it("sits inside the comping range for every chord there is", () => {
    for (const root of ROOTS) {
      for (const quality of QUALITIES) {
        const voicing = chooseVoicing({ root, quality });
        expect(voicing.length, `${root} ${quality}`).toBeGreaterThan(0);
        for (const note of voicing) {
          expect(note, `${root} ${quality}`).toBeGreaterThanOrEqual(KEYS_LOW);
          expect(note, `${root} ${quality}`).toBeLessThanOrEqual(KEYS_HIGH);
        }
      }
    }
  });

  it("is at most four notes, so a ninth loses its fifth rather than clustering", () => {
    for (const root of ROOTS) {
      for (const quality of QUALITIES) {
        expect(chooseVoicing({ root, quality }).length).toBeLessThanOrEqual(KEYS_MAX_NOTES);
      }
    }
  });

  it("doubles nothing — every note of a voicing is a different pitch", () => {
    for (const root of ROOTS) {
      for (const quality of QUALITIES) {
        const voicing = chooseVoicing({ root, quality });
        expect(new Set(voicing).size).toBe(voicing.length);
      }
    }
  });

  it("spells the chord it was asked for", () => {
    const voicing = chooseVoicing({ root: 0, quality: "maj7" });
    expect(new Set(voicing.map((n) => n % 12))).toEqual(new Set([0, 4, 7, 11]));
  });

  /**
   * The property the whole module exists for. Root-position triads leaping
   * round the keyboard is the sound of a MIDI file; a hand that moves a tone
   * or two is the sound of a player.
   */
  it("moves each note by at most a fourth from the voicing before it", () => {
    for (const rootA of ROOTS) {
      for (const qualityA of QUALITIES) {
        const previous = chooseVoicing({ root: rootA, quality: qualityA });
        for (const rootB of ROOTS) {
          for (const qualityB of QUALITIES) {
            const next = chooseVoicing({ root: rootB, quality: qualityB }, previous);
            for (const note of next) {
              expect(
                nearest(previous, note),
                `${rootA}${qualityA} → ${rootB}${qualityB}: ${note} from ${previous}`,
              ).toBeLessThanOrEqual(KEYS_MAX_LEAP);
            }
          }
        }
      }
    }
  });

  it("stays inside the range after a long chain of changes", () => {
    // A random walk through the changes is where a voicing that drifts an
    // octave a bar would show up; the range check is the guard.
    let previous: number[] | null = null;
    for (let bar = 0; bar < 200; bar++) {
      const chord: Chord = {
        root: (bar * 7) % 12,
        quality: QUALITIES[bar % QUALITIES.length],
      };
      const voicing: number[] = chooseVoicing(chord, previous);
      for (const note of voicing) {
        expect(note).toBeGreaterThanOrEqual(KEYS_LOW);
        expect(note).toBeLessThanOrEqual(KEYS_HIGH);
      }
      if (previous) {
        for (const note of voicing) expect(nearest(previous, note)).toBeLessThanOrEqual(KEYS_MAX_LEAP);
      }
      previous = voicing;
    }
  });
});

describe("where the chord is struck", () => {
  it("puts a pad on beat one and nowhere else", () => {
    expect(keysTicks({ style: "pads", groove: ROCK8.bar, meter: FOUR_FOUR })).toEqual([0]);
  });

  it("puts stabs on the and of two and four in a bar of four", () => {
    // Eighths: beat 2 is tick 2, its "and" is tick 3; beat 4 is tick 6, its
    // "and" is tick 7.
    expect(keysTicks({ style: "stabs", groove: ROCK8.bar, meter: FOUR_FOUR })).toEqual([3, 7]);
    // Sixteenths: the same two places, twice as many ticks along.
    expect(
      keysTicks({ style: "stabs", groove: ROCK8.bar, meter: { beatsPerBar: 4, ticksPerBeat: 4 } }),
    ).toEqual([6, 14]);
  });

  it("puts stabs on the snare's own beats in a meter with no two and four", () => {
    const rule = ruleGroove([2, 2, 3], 2);
    const ticks = keysTicks({
      style: "stabs",
      groove: rule.bar,
      meter: { beatsPerBar: 7, ticksPerBeat: 2 },
    });
    // The rule groove backbeats the last beat of each group of two or more:
    // beats 2, 4 and 7, which at two ticks a beat is ticks 2, 6 and 12.
    expect(ticks).toEqual([2, 6, 12]);
  });

  it("comps somewhere even when the groove has no snare at all", () => {
    const silentSnare: JamPattern = { ...ROCK8.bar, snare: ROCK8.bar.snare.map(() => 0) };
    const ticks = keysTicks({
      style: "stabs",
      groove: silentSnare,
      meter: { beatsPerBar: 3, ticksPerBeat: 2 },
    });
    expect(ticks.length).toBeGreaterThan(0);
  });
});

describe("keysLineFor", () => {
  it("is exactly as long as the drum lanes", () => {
    const line = keysLineFor({
      chord: { root: 0, quality: "maj7" },
      groove: ROCK8.bar,
      style: "pads",
      meter: FOUR_FOUR,
    });
    expect(line.voicings).toHaveLength(ROCK8.bar.kick.length);
  });

  it("rests on every tick the style does not strike", () => {
    const line = keysLineFor({
      chord: { root: 0, quality: "maj7" },
      groove: ROCK8.bar,
      style: "stabs",
      meter: FOUR_FOUR,
    });
    const struck = line.voicings.flatMap((v, i) => (v.length > 0 ? [i] : []));
    expect(struck).toEqual([3, 7]);
  });

  it("clamps the gain to what the contract allows", () => {
    const low = keysLineFor({
      chord: { root: 0, quality: "maj" },
      groove: ROCK8.bar,
      style: "pads",
      meter: FOUR_FOUR,
      gain: 0,
    });
    const high = keysLineFor({
      chord: { root: 0, quality: "maj" },
      groove: ROCK8.bar,
      style: "pads",
      meter: FOUR_FOUR,
      gain: 9,
    });
    expect(low.gain).toBe(0.5);
    expect(high.gain).toBe(1.5);
  });

  it("hands the last voicing back so the next bar can lead away from it", () => {
    const line = keysLineFor({
      chord: { root: 0, quality: "maj7" },
      groove: ROCK8.bar,
      style: "stabs",
      meter: FOUR_FOUR,
    });
    expect(lastVoicing(line)).toEqual(line.voicings[7]);
    expect(lastVoicing(null)).toBeNull();
  });
});
