// A vibe tile is a promise: one tap and the whole band is set. The promise
// breaks silently — a bundle naming a groove that does not exist gets the
// default groove, a bundle naming a kit that does not exist gets whatever the
// engine falls back to — so the checks that matter are the boring ones: does
// every id in every bundle name something real, and does every one of them
// compile into a config the engine would accept.
import { describe, expect, it } from "vitest";
import { compileJam, jamGroove } from "./compile";
import { GROOVES, grooveById, grooveTickCount } from "./grooves";
import { formBars } from "./forms";
import { parseKey } from "./harmony";
import { createJam } from "./jams";
import {
  applyVibe,
  DEFAULT_VIBE_ID,
  isKnownGrooveId,
  JAM_KIT_IDS,
  VIBES,
  variationOf,
  vibeBundle,
  vibeById,
  vibeGrooveIds,
  vibeIsEdited,
  vibeOf,
} from "./vibes";
import { JAM_FORM_BARS, JAM_LANES } from "./types";
import type { JamBassVoice, JamKeysVoice, JamVibeBundle } from "./index";

const BASS_VOICES: readonly JamBassVoice[] = [
  "fingered",
  "picked",
  "upright",
  "slap",
  "synth",
];
const KEYS_VOICES: readonly JamKeysVoice[] = ["epiano", "organ", "clav", "pad"];

/** Every bundle in the file — the vibes' own and every variation's, resolved. */
function everyBundle(): { label: string; bundle: JamVibeBundle }[] {
  const out: { label: string; bundle: JamVibeBundle }[] = [];
  for (const vibe of VIBES) {
    out.push({ label: vibe.id, bundle: vibe.bundle });
    for (const variation of vibe.variations) {
      out.push({
        label: `${vibe.id}/${variation.id}`,
        bundle: vibeBundle(vibe, variation.id),
      });
    }
  }
  return out;
}

describe("the nine vibes", () => {
  it("ships the nine the boards drew, in the order they are drawn", () => {
    expect(VIBES.map((v) => v.id)).toEqual([
      "rock",
      "hardRock",
      "blues",
      "funk",
      "jazz",
      "latin",
      "pop",
      "metal",
      "country",
    ]);
  });

  it("names every vibe and every variation through a key", () => {
    // The tiles are translated, so every visible word is a key and none is a
    // literal. The keys themselves live in `src/locales/*/jam.json`.
    for (const vibe of VIBES) {
      expect(vibe.nameKey).toBe(`jam.vibe.${vibe.id}`);
      for (const variation of vibe.variations) {
        expect(variation.nameKey).toBe(`jam.variation.${variation.id}`);
      }
    }
  });

  it("gives every vibe three to six variations with unique ids", () => {
    for (const vibe of VIBES) {
      expect(vibe.variations.length, vibe.id).toBeGreaterThanOrEqual(3);
      expect(vibe.variations.length, vibe.id).toBeLessThanOrEqual(6);
      const ids = vibe.variations.map((v) => v.id);
      expect(new Set(ids).size, vibe.id).toBe(ids.length);
    }
  });

  it("opens on a variation that is the vibe itself", () => {
    // The first variation adds nothing, so the row reads as a row rather than
    // as "the vibe, and then some alternatives to it".
    for (const vibe of VIBES) {
      expect(vibe.variations[0].bundle, vibe.id).toEqual({});
    }
  });

  it("defaults to rock, because rock is what nothing said", () => {
    expect(DEFAULT_VIBE_ID).toBe("rock");
    expect(vibeById(DEFAULT_VIBE_ID)).not.toBeNull();
  });
});

describe("every bundle names something real", () => {
  it("names a groove that exists", () => {
    for (const id of vibeGrooveIds()) {
      expect(isKnownGrooveId(id), `no groove "${id}"`).toBe(true);
    }
    for (const { label, bundle } of everyBundle()) {
      expect(GROOVES.some((g) => g.id === bundle.grooveId), label).toBe(true);
      // `grooveById` falls back to the first groove rather than throwing, so
      // a typo would be silent without this: check the id round-trips.
      expect(grooveById(bundle.grooveId).id, label).toBe(bundle.grooveId);
    }
  });

  it("names a kit, a bass voice and a keys voice that exist", () => {
    for (const { label, bundle } of everyBundle()) {
      expect(JAM_KIT_IDS, label).toContain(bundle.kit);
      expect(BASS_VOICES, label).toContain(bundle.bassVoice);
      expect(KEYS_VOICES, label).toContain(bundle.keysVoice);
    }
  });

  it("names a form that has a bar count", () => {
    for (const { label, bundle } of everyBundle()) {
      expect(JAM_FORM_BARS[bundle.form], label).toBeGreaterThan(0);
    }
  });

  it("writes a key the record can read back", () => {
    // One encoding, `keyName`'s. A second would disagree with it by Tuesday.
    for (const { label, bundle } of everyBundle()) {
      expect(parseKey(bundle.key), `${label}: "${bundle.key}"`).not.toBeNull();
    }
  });

  it("sets a tempo a human would play at", () => {
    for (const { label, bundle } of everyBundle()) {
      expect(bundle.bpm, label).toBeGreaterThanOrEqual(40);
      expect(bundle.bpm, label).toBeLessThanOrEqual(240);
    }
  });

  it("starts the band on drums alone, every time", () => {
    // B1. What the vibe contributes is WHICH bass and WHICH keys wait behind
    // the band row's taps, not that they are already playing.
    for (const { label, bundle } of everyBundle()) {
      expect(bundle.band, label).toEqual({ drums: true, bass: false, keys: false });
    }
  });
});

describe("every variation compiles", () => {
  it("gives the engine a table of the right width, with a bass line in it", () => {
    for (const vibe of VIBES) {
      for (const variation of vibe.variations) {
        const label = `${vibe.id}/${variation.id}`;
        // The band is forced on for this check: a drums-only config has a
        // silenced table and no bass, which would pass the widths without
        // ever exercising the voices the bundle picked.
        const jam = {
          ...applyVibe(createJam("check"), vibe.id, variation.id),
          band: { drums: true, bass: true, keys: true },
        };
        const config = compileJam(jam, { formBar: 0 });
        const ticks = config.beatsPerBar * config.ticksPerBeat;

        expect(ticks, label).toBeGreaterThan(0);
        for (const lane of JAM_LANES) {
          expect(config.bar[lane], `${label} bar.${lane}`).toHaveLength(ticks);
          if (config.fill) expect(config.fill[lane], `${label} fill.${lane}`).toHaveLength(ticks);
        }
        expect(config.bass, label).not.toBeNull();
        expect(config.bass!.pitches, `${label} bass`).toHaveLength(ticks);
        expect(config.keys, label).not.toBeNull();
        expect(config.keys!.voicings, `${label} keys`).toHaveLength(ticks);
        expect(config.formBars, label).toBe(formBars(jam.form));
        expect(config.kit, label).toBe(vibeBundle(vibe, variation.id).kit);
      }
    }
  });

  it("plays the groove the bundle named, in the meter that groove is written in", () => {
    for (const vibe of VIBES) {
      for (const variation of vibe.variations) {
        const label = `${vibe.id}/${variation.id}`;
        const bundle = vibeBundle(vibe, variation.id);
        const jam = applyVibe(createJam("check"), vibe.id, variation.id);
        const groove = jamGroove(jam);
        const written = grooveById(bundle.grooveId);
        // The feel may move it onto a triplet grid; the BAR never changes.
        expect(groove.beatsPerBar, label).toBe(written.beatsPerBar);
        expect(grooveTickCount(groove), label).toBe(
          groove.beatsPerBar * groove.ticksPerBeat,
        );
      }
    }
  });
});

describe("applying a vibe", () => {
  it("sets everything the bundle names and says which vibe it came from", () => {
    const jam = applyVibe(createJam("mine"), "metal", "thrash");
    const bundle = vibeBundle(vibeById("metal")!, "thrash");
    expect(jam.vibe).toBe("metal");
    expect(jam.variation).toBe("thrash");
    expect(jam.grooveId).toBe("hardRock");
    expect(jam.bpm).toBe(190);
    expect(jam.kit).toBe(bundle.kit);
    expect(jam.intensity).toBe("loud");
    expect(jam.bassVoice).toBe(bundle.bassVoice);
    expect(jam.keysVoice).toBe(bundle.keysVoice);
    expect(jam.key).toBe(bundle.key);
    expect(jam.form).toEqual({ kind: "loop8", bars: 8 });
  });

  it("keeps the name, the id and the date — a vibe is not a new jam", () => {
    const before = createJam("Tuesday night");
    const after = applyVibe(before, "jazz");
    expect(after.id).toBe(before.id);
    expect(after.name).toBe("Tuesday night");
    expect(after.createdAt).toBe(before.createdAt);
  });

  it("does not mutate the jam it was given", () => {
    const before = createJam("mine");
    const snapshot = JSON.stringify(before);
    applyVibe(before, "funk", "newOrleans");
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("takes the vibe on its own, and then clears the variation", () => {
    const withVariation = applyVibe(createJam("mine"), "rock", "punk");
    expect(withVariation.variation).toBe("punk");
    const plain = applyVibe(withVariation, "rock");
    expect(plain.variation).toBeUndefined();
    expect("variation" in plain).toBe(false);
    expect(plain.bpm).toBe(120);
  });

  it("ignores a variation that is not this vibe's", () => {
    const jam = applyVibe(createJam("mine"), "rock", "samba");
    expect(jam.vibe).toBe("rock");
    expect(jam.variation).toBeUndefined();
    expect(jam.grooveId).toBe("rock8");
  });

  it("gives the jam straight back when the vibe id is unknown", () => {
    const before = createJam("mine");
    expect(applyVibe(before, "skiffle")).toBe(before);
  });

  it("throws away a custom groove, because it would win over the vibe's", () => {
    const drawn = {
      name: "Yours",
      beatsPerBar: 4,
      ticksPerBeat: 2 as const,
      bar: {
        kick: [1, 0, 0, 0, 0, 0, 0, 0],
        snare: [0, 0, 0, 0, 0, 0, 0, 0],
        hat: [0, 0, 0, 0, 0, 0, 0, 0],
        ride: [0, 0, 0, 0, 0, 0, 0, 0],
        crash: [0, 0, 0, 0, 0, 0, 0, 0],
      },
      fill: null,
    };
    const jam = applyVibe(createJam("mine", { customGroove: drawn }), "metal");
    expect(jam.customGroove).toBeUndefined();
    // And it really plays the vibe's groove, not the drawing.
    expect(jamGroove(jam).ticksPerBeat).toBe(4);
  });

  it("drops a kit of your own samples, the way it drops a drawn groove", () => {
    // The folder wins over the bundle's `kit` wherever it is set, so a vibe
    // that left it on would look applied and sound like the kit before it —
    // and a vibe is a sound set (B8), so the kit is half of what was tapped.
    const mine = createJam("mine", { customKit: { dir: "C:/samples/mine", name: "mine" } });
    const jam = applyVibe(mine, "jazz");
    expect(jam.customKit).toBeUndefined();
    expect(jam.kit).toBe("brushes");
  });

  it("throws away a meter override, so the waltz is allowed to be in three", () => {
    const inSeven = createJam("mine", { meter: { beatGroups: [3, 2, 2], ticksPerBeat: 2 } });
    const jam = applyVibe(inSeven, "country", "waltz");
    expect(jam.meter).toBeUndefined();
    expect(jamGroove(jam).beatsPerBar).toBe(3);
  });

  it("carries the count-in as bars, not as beats", () => {
    // One bar of four counted in, then a waltz: one bar, which is now three.
    const inFour = createJam("mine", { grooveId: "rock8", countIn: 4 });
    expect(applyVibe(inFour, "country", "waltz").countIn).toBe(3);
    // Nothing counted in stays nothing counted in.
    const none = createJam("mine", { grooveId: "rock8", countIn: 0 });
    expect(applyVibe(none, "country", "waltz").countIn).toBe(0);
  });

  it("refits your own changes to the new form, or drops them", () => {
    // Eight bars of changes into a twelve-bar blues: the record must never
    // hold a progression that is not exactly `form.bars` long.
    const eight = createJam("mine", {
      form: { kind: "loop8", bars: 8 },
      progression: ["C", "C", "F", "F", "G", "G", "C", "C"],
    });
    const blues = applyVibe(eight, "blues");
    expect(blues.form.bars).toBe(12);
    expect(blues.progression).toHaveLength(12);
    // And a jam that never had changes still does not.
    expect(applyVibe(createJam("mine"), "blues").progression).toBeUndefined();
  });
});

describe("what the sheet says above the controls", () => {
  it("reads the vibe and the variation back off the record", () => {
    const jam = applyVibe(createJam("mine"), "blues", "texas");
    const on = vibeOf(jam);
    expect(on?.vibe.id).toBe("blues");
    expect(on?.variation?.id).toBe("texas");
    expect(vibeOf(createJam("mine"))).toBeNull();
  });

  it("finds a variation by id, and null for one that is not there", () => {
    const blues = vibeById("blues")!;
    expect(variationOf(blues, "boogie")?.id).toBe("boogie");
    expect(variationOf(blues, "thrash")).toBeNull();
    expect(variationOf(blues, undefined)).toBeNull();
  });

  it("says a freshly applied vibe is not edited", () => {
    for (const vibe of VIBES) {
      for (const variation of vibe.variations) {
        const jam = applyVibe(createJam("check"), vibe.id, variation.id);
        expect(vibeIsEdited(jam), `${vibe.id}/${variation.id}`).toBe(false);
      }
    }
  });

  it("says it is edited once a control the vibe set has moved", () => {
    const jam = applyVibe(createJam("mine"), "rock", "punk");
    expect(vibeIsEdited({ ...jam, intensity: "soft" })).toBe(true);
    expect(vibeIsEdited({ ...jam, kit: "brushes" })).toBe(true);
    expect(vibeIsEdited({ ...jam, bpm: 100 })).toBe(true);
    expect(vibeIsEdited({ ...jam, bassVoice: "upright" })).toBe(true);
    // But typing your own changes over a rock jam does not stop it rocking.
    expect(vibeIsEdited({ ...jam, progression: ["A", "A", "D", "A"] })).toBe(false);
    expect(vibeIsEdited({ ...jam, name: "Louder" })).toBe(false);
  });

  it("says nothing about a jam that never had a vibe", () => {
    expect(vibeIsEdited(createJam("mine"))).toBe(false);
  });
});
