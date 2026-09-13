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
import { createJam } from "./jams";
import type { Jam } from "./types";

const ROCK = VIBES.find((v) => v.id === "rock")!;
const jamOf = (overrides: Partial<Jam> = {}): Jam => ({ ...createJam("check"), ...overrides });

describe("applyVibe", () => {
  it("sets the drummer, the kit, the voices, the tempo and the key in one patch", () => {
    expect(applyVibe(jamOf(), ROCK)).toMatchObject({
      vibe: "rock",
      grooveId: ROCK.grooveId,
      kit: ROCK.kit,
      feel: ROCK.feel,
      intensity: ROCK.intensity,
      bassVoice: ROCK.bassVoice,
      keysVoice: ROCK.keysVoice,
      band: { ...ROCK.band },
      fills: ROCK.fills,
      fillEvery: ROCK.fillEvery,
      bpm: ROCK.bpm,
      key: ROCK.key,
    });
  });

  it("lets a variation win, and names itself on the record", () => {
    const punk = ROCK.variations.find((v) => v.id === "punk")!;
    const patch = applyVibe(jamOf(), ROCK, "punk");
    expect(patch.variation).toBe("punk");
    expect(patch.grooveId).toBe(punk.grooveId);
    expect(patch.kit).toBe(punk.kit);
    expect(patch.intensity).toBe(punk.intensity);
    expect(patch.bpm).toBe(punk.bpm);
    // The voices are the vibe's; a variation is a way of PLAYING it (A9), not
    // a different band.
    expect(patch.bassVoice).toBe(ROCK.bassVoice);
  });

  it("clears the variation when the tile itself is tapped again", () => {
    // Rock, plain, is not Rock-punk with the label rubbed off.
    const punked = jamOf(applyVibe(jamOf(), ROCK, "punk"));
    expect(applyVibe(punked, ROCK).variation).toBeUndefined();
  });

  it("ignores a variation the vibe does not have rather than half-applying it", () => {
    const patch = applyVibe(jamOf(), ROCK, "chaCha");
    expect(patch.variation).toBeUndefined();
    expect(patch.grooveId).toBe(ROCK.grooveId);
  });

  it("drops a groove you drew by hand", () => {
    // A custom groove is not "the Rock vibe", and leaving it on would have the
    // tile look applied while the drummer played something else.
    const drawn: Jam["customGroove"] = {
      name: "mine",
      beatsPerBar: 4,
      ticksPerBeat: 2,
      bar: {
        kick: [1, 0, 0, 0, 0, 0, 0, 0],
        snare: [0, 0, 0, 0, 1, 0, 0, 0],
        hat: [0, 0, 0, 0, 0, 0, 0, 0],
        ride: [0, 0, 0, 0, 0, 0, 0, 0],
        crash: [0, 0, 0, 0, 0, 0, 0, 0],
      },
      fill: null,
    };
    const patch = applyVibe(jamOf({ customGroove: drawn }), ROCK);
    expect(patch.customGroove).toBeUndefined();
    expect("customGroove" in patch).toBe(true);
  });

  it("drops a kit of your own samples with it", () => {
    // Same rule, same reason: the folder wins over the bundle's kit, so a
    // tile that left it on would look applied and sound like the kit before.
    const patch = applyVibe(jamOf({ customKit: { dir: "C:/s/mine", name: "mine" } }), ROCK);
    expect(patch.customKit).toBeUndefined();
    expect("customKit" in patch).toBe(true);
  });

  it("clears a meter override, so the vibe's own groove fits", () => {
    // The finding this delegation exists for: with the override left on, a
    // jam that had ever been given a meter landed on the RULE groove for
    // every tile after it.
    const patch = applyVibe(jamOf({ meter: { beatGroups: [7], ticksPerBeat: 4 } }), ROCK);
    expect(patch.meter).toBeUndefined();
    expect("meter" in patch).toBe(true);
  });

  it("carries the count-in as BARS rather than copying a beat count", () => {
    // A waltz is three beats to the bar. One bar of count-in stays one bar,
    // which is 3 — not the 4 the four-beat jam counted, which is a number the
    // count-in dropdown cannot name and used to draw as its own id.
    const country = VIBES.find((v) => v.id === "country")!;
    const inFour = jamOf({ grooveId: "rock8", countIn: 4 });
    expect(applyVibe(inFour, country, "waltz").countIn).toBe(3);
  });

  it("refits the progression to the form the vibe brings", () => {
    // A progression that is not exactly `form.bars` long is the one thing the
    // record must never hold.
    const blues = VIBES.find((v) => v.id === "blues")!;
    const eight = jamOf({
      form: { kind: "loop8", bars: 8 },
      progression: ["C", "C", "F", "F", "G", "G", "C", "C"],
    });
    const patch = applyVibe(eight, blues);
    expect(patch.progression).toHaveLength(patch.form!.bars);
  });

  it("hands back no patch at all for an id the data does not have", () => {
    const made: Vibe = { ...ROCK, id: "skiffle" as Vibe["id"] };
    expect(applyVibe(jamOf(), made)).toEqual({});
  });

  it("gives the band a copy, not the vibe's own object", () => {
    const patch = applyVibe(jamOf(), ROCK);
    patch.band!.bass = true;
    expect(ROCK.band.bass).toBe(false);
  });

  it("adds nothing to the bundle the data does not already carry", () => {
    // Which is what makes delegating to `vibes.ts` safe. Every field on the
    // screen's flat `Vibe` — and on its variations — has to come back in the
    // patch with the value the data gave it, or the flat shape has grown a
    // field the delegation silently drops.
    for (const vibe of VIBES) {
      const patch = applyVibe(jamOf(), vibe);
      expect([patch.vibe, patch.grooveId, patch.kit, patch.feel, patch.intensity], vibe.id).toEqual(
        [vibe.id, vibe.grooveId, vibe.kit, vibe.feel, vibe.intensity],
      );
      expect([patch.bassVoice, patch.keysVoice, patch.bpm, patch.key], vibe.id).toEqual([
        vibe.bassVoice,
        vibe.keysVoice,
        vibe.bpm,
        vibe.key,
      ]);
      expect([patch.fills, patch.fillEvery, patch.band], vibe.id).toEqual([
        vibe.fills,
        vibe.fillEvery,
        { ...vibe.band },
      ]);
      if (vibe.form) expect(patch.form?.kind, vibe.id).toBe(vibe.form);
      for (const variation of vibe.variations) {
        const one = applyVibe(jamOf(), vibe, variation.id);
        expect(
          [one.variation, one.grooveId, one.kit, one.feel, one.intensity, one.bpm],
          `${vibe.id}/${variation.id}`,
        ).toEqual([
          variation.id,
          variation.grooveId,
          variation.kit,
          variation.feel,
          variation.intensity,
          variation.bpm,
        ]);
      }
    }
  });
});

describe("applyIntensity, now that the shaping is wired", () => {
  const groove: ShapedGroove = {
    beatsPerBar: 4,
    ticksPerBeat: 2,
    bar: {
      kick: [2, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 2, 0, 0, 0, 3, 0],
      hat: [1, 1, 1, 1, 1, 1, 1, 1],
      ride: [0, 0, 0, 0, 0, 0, 0, 0],
      crash: [0, 0, 0, 0, 0, 0, 0, 0],
    },
    fill: null,
  };

  it("hands a normal groove back exactly as written", () => {
    expect(applyIntensity(groove, "normal")).toBe(groove);
  });

  it("makes loud a different drummer, not a louder one, and keeps the grid", () => {
    const loud = applyIntensity(groove, "loud");
    expect(loud).not.toBe(groove);
    expect(loud.bar.snare).toHaveLength(8);
    // The ghost on the snare is gone.
    expect(loud.bar.snare[6]).not.toBe(3);
    // The off-beat hats open (accent level, the engine's open-hat convention).
    expect(loud.bar.hat[1]).toBe(2);
  });

  it("makes soft quieter in the pattern, on the same grid", () => {
    const soft = applyIntensity(groove, "soft");
    expect(soft.bar.hat).toHaveLength(8);
    expect(soft.bar.kick).toHaveLength(8);
  });
});

describe("the ids the locale files carry", () => {
  it("names nine vibes, one per tile and country", () => {
    expect(VIBE_IDS).toHaveLength(9);
    expect(new Set(VIBE_IDS).size).toBe(9);
  });

  it("names every variation once", () => {
    expect(new Set(VARIATION_IDS).size).toBe(VARIATION_IDS.length);
  });

  it("ships every vibe the data carries, each with an id the locales know", () => {
    expect(VIBES.length).toBe(9);
    for (const v of VIBES) {
      expect(VIBE_IDS).toContain(v.id);
      for (const x of v.variations) expect(VARIATION_IDS).toContain(x.id);
    }
  });
});
