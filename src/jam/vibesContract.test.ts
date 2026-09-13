/**
 * The vibe contract — the shape the screens build against while the data is
 * being written next door (plans/tasks/jam-v2/BRIEF.md).
 *
 * Two things are worth pinning here and nothing else is. **What a vibe writes
 * onto a jam**, because that is the whole of A2 — one tap that sets the
 * drummer, the kit, the voices, the tempo and the key together, and a bundle
 * that forgot one of them would be five controls again. And **that the
 * intensity stub is honest**: identity, so a build without `intensity.ts`
 * plays the groove as written rather than something half-shaped.
 */
import { describe, expect, it } from "vitest";
import { VARIATION_IDS, VIBES, VIBE_IDS, applyIntensity, applyVibe } from "./vibesContract";
import type { ShapedGroove, Vibe } from "./vibesContract";

const ROCK: Vibe = {
  id: "rock",
  grooveId: "rock8",
  kit: "tight",
  feel: "straight",
  intensity: "normal",
  bassVoice: "picked",
  keysVoice: "organ",
  band: { drums: true, bass: false, keys: false },
  fills: true,
  fillEvery: 0,
  bpm: 120,
  key: "E",
  variations: [
    {
      id: "punk",
      grooveId: "rock16",
      kit: "raw",
      feel: "straight",
      intensity: "loud",
      bpm: 180,
    },
  ],
};

describe("applyVibe", () => {
  it("sets the drummer, the kit, the voices, the tempo and the key in one patch", () => {
    expect(applyVibe(ROCK)).toMatchObject({
      vibe: "rock",
      grooveId: "rock8",
      kit: "tight",
      feel: "straight",
      intensity: "normal",
      bassVoice: "picked",
      keysVoice: "organ",
      band: { drums: true, bass: false, keys: false },
      fills: true,
      fillEvery: 0,
      bpm: 120,
      key: "E",
    });
  });

  it("lets a variation win, and names itself on the record", () => {
    const patch = applyVibe(ROCK, "punk");
    expect(patch.variation).toBe("punk");
    expect(patch.grooveId).toBe("rock16");
    expect(patch.kit).toBe("raw");
    expect(patch.intensity).toBe("loud");
    expect(patch.bpm).toBe(180);
    // The voices are the vibe's; a variation is a way of PLAYING it (A9), not
    // a different band.
    expect(patch.bassVoice).toBe("picked");
  });

  it("clears the variation when the tile itself is tapped again", () => {
    // Rock, plain, is not Rock-punk with the label rubbed off.
    expect(applyVibe(ROCK).variation).toBeUndefined();
  });

  it("ignores a variation the vibe does not have rather than half-applying it", () => {
    const patch = applyVibe(ROCK, "songo");
    expect(patch.variation).toBeUndefined();
    expect(patch.grooveId).toBe("rock8");
  });

  it("drops a groove you drew by hand", () => {
    // A custom groove is not "the Rock vibe", and leaving it on would have the
    // tile look applied while the drummer played something else.
    expect(applyVibe(ROCK).customGroove).toBeUndefined();
    expect("customGroove" in applyVibe(ROCK)).toBe(true);
  });

  it("gives the band a copy, not the vibe's own object", () => {
    const patch = applyVibe(ROCK);
    patch.band!.bass = true;
    expect(ROCK.band.bass).toBe(false);
  });
});

describe("applyIntensity, until the shaping lands", () => {
  it("hands the groove back exactly as written", () => {
    const groove: ShapedGroove = {
      beatsPerBar: 4,
      ticksPerBeat: 2,
      bar: {
        kick: [2, 0, 0, 0, 1, 0, 0, 0],
        snare: [0, 0, 2, 0, 0, 0, 2, 0],
        hat: [1, 1, 1, 1, 1, 1, 1, 1],
        ride: [0, 0, 0, 0, 0, 0, 0, 0],
        crash: [0, 0, 0, 0, 0, 0, 0, 0],
      },
      fill: null,
    };
    for (const intensity of ["soft", "normal", "loud"] as const) {
      expect(applyIntensity(groove, intensity)).toBe(groove);
    }
  });
});

describe("the ids the locale files carry", () => {
  it("names eight vibes", () => {
    expect(VIBE_IDS).toHaveLength(8);
    expect(new Set(VIBE_IDS).size).toBe(8);
  });

  it("names every variation once", () => {
    expect(new Set(VARIATION_IDS).size).toBe(VARIATION_IDS.length);
  });

  it("ships no vibes until the data lands, and the sheet says so", () => {
    // The stub. When this fails, `vibes.ts` has been wired in and the sentence
    // in `jam.vibe.unavailable` can go with it.
    expect(VIBES).toHaveLength(0);
  });
});
