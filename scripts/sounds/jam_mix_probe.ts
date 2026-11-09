/**
 * Every bass and keys voice, alone, beside the kit it has to sit in (2026-09-20).
 *
 * The owner heard it first, making a clip for the website: "what I can hear is
 * mostly drum sound, the keys and bass is very low in comparison". A balance
 * claim is only worth what it was measured on, so this writes the demos that
 * measure it — one JSON per (vibe, intensity, lane), with the OTHER lanes'
 * mix at zero so a render is one player alone:
 *
 *     npx vite-node scripts/sounds/jam_mix_probe.ts <dir>
 *     YAMES_BAND_DEMO=<dir> node scripts/rust-test.mjs --release --lib \
 *       --no-default-features render_band_demos -- --ignored --nocapture
 *
 * Then `ffmpeg -i <wav> -af ebur128 -f null -` for each, and the bass a
 * second time through `highpass=f=120` — which is the band a laptop speaker
 * actually radiates, and the reason a slap bass that measures fine is not
 * there in the room.
 *
 * Soloing with the mix and not with the band toggles is deliberate: the band
 * toggles change what the OTHER players write (a bassless jam gets rootless
 * keys grips), and the arrangement has to be the same arrangement in all
 * three renders for the three numbers to be comparable.
 */
import fs from "node:fs";
import path from "node:path";
import { applyVibe } from "../../src/jam/vibes";
import { createJam } from "../../src/jam/jams";
import { compileJam } from "../../src/jam/compile";
import { lastVoicing } from "../../src/jam/keysline";
import type { Jam, JamBassVoice, JamIntensity, JamKeysVoice } from "../../src/jam/types";

/** The four vibes the owner's first measurement used, so the rows line up. */
const VIBES: { label: string; vibe: string; variation?: string }[] = [
  { label: "rock", vibe: "rock" },
  { label: "blues", vibe: "blues" },
  { label: "funk", vibe: "funk" },
  { label: "disco", vibe: "pop", variation: "fourOnFloor" },
];

const INTENSITIES: JamIntensity[] = ["soft", "normal", "loud"];
const BASS_VOICES: JamBassVoice[] = ["fingered", "picked", "upright", "slap", "synth"];
const KEYS_VOICES: JamKeysVoice[] = ["epiano", "organ", "clav", "pad"];

/** Everybody is hired in every render; only the mix decides who is heard. */
const band = { drums: true, bass: true, keys: true, perc: false };

/**
 * The probe loops; it does not build.
 *
 * A new jam is created in `build` mode, and the arrangement's first chorus is
 * deliberately A RUNG DOWN from the record ( `chorusStep` in
 * `src/jam/arrangement.ts` ). Measured at chorus 1, "soft" and "normal" are
 * therefore the same eight bars to the sample, which is a measurement of the
 * arrangement rather than of the dial. `loop` is every bar at the record's own
 * intensity with everybody full, which is the one that answers "how loud is
 * the bass at Loud".
 */
const arrangement = { mode: "loop" } as const;

/**
 * The six the owner listens to, before and after.
 *
 * Between them they use every bass voice and every keys voice, each in the
 * vibe that chose it — because a trim is only worth what it does to a band
 * somebody would actually start. The band is the vibe's own, at the vibe's
 * own intensity, with NO mix set: what a player gets on the first press.
 */
const CLIPS: { label: string; vibe: string; variation?: string }[] = [
  { label: "1-rock", vibe: "rock" }, //            picked bass, organ
  { label: "2-blues", vibe: "blues" }, //          fingered bass, organ
  { label: "3-funk", vibe: "funk" }, //            slap bass, clav
  { label: "4-jazz", vibe: "jazz" }, //            upright bass, epiano
  { label: "5-disco", vibe: "pop", variation: "fourOnFloor" }, // synth bass, pad
  { label: "6-bossa", vibe: "latin", variation: "bossa" }, //    fingered bass, pad
];

const out = process.argv[2];
const clipsOnly = process.argv.includes("--clips");
if (!out) {
  console.error("usage: npx vite-node scripts/sounds/jam_mix_probe.ts <dir> [--clips]");
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const BARS = 8;

function write(name: string, jam: Jam, chorus = 1) {
  const configs = [];
  let previousVoicing: number[] | null = null;
  for (let bar = 0; bar < BARS; bar++) {
    const config = compileJam(jam, { formBar: bar, chorus, previousVoicing });
    previousVoicing = lastVoicing(config.keys) ?? previousVoicing;
    configs.push(config);
  }
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ bpm: jam.bpm, bars: configs }));
}

let count = 0;
if (clipsOnly) {
  for (const c of CLIPS) {
    const vibed = applyVibe(createJam(c.label), c.vibe, c.variation);
    // A VIBE HIRES DRUMS AND NOBODY ELSE (`DRUMS_ONLY` in `src/jam/vibes.ts`),
    // so a clip built straight off one is a drum machine: `bass` and `keys`
    // come back null from the compiler and the mix has nothing to balance.
    // The complaint this pass is about is a band with all three rows on, so
    // all three rows go on here. The percussionist stays the vibe's own.
    const jam = {
      ...vibed,
      band: { ...vibed.band, drums: true, bass: true, keys: true },
    } as Jam;
    // THE SECOND CHORUS, because the first is a rung down and nobody judges a
    // balance on an introduction. This is the band at the intensity the vibe
    // chose, with the fills the arrangement writes.
    write(c.label, jam, 2);
    count++;
    console.log(
      `${c.label}: ${jam.grooveId} ${jam.key} ${jam.kit} bpm ${jam.bpm} ` +
        `${jam.intensity} bass ${jam.bassVoice} keys ${jam.keysVoice}`,
    );
  }
  console.log(`${count} clips in ${out}`);
  process.exit(0);
}
for (const v of VIBES) {
  for (const intensity of INTENSITIES) {
    const base: Jam = {
      ...applyVibe(createJam(`${v.label}-${intensity}`), v.vibe, v.variation),
      band,
      intensity,
      arrangement,
    };
    write(`${v.label}-${intensity}-drums`, {
      ...base,
      mix: { drums: 1, bass: 0, keys: 0, perc: 0 },
    });
    count++;
    for (const voice of BASS_VOICES) {
      write(`${v.label}-${intensity}-bass-${voice}`, {
        ...base,
        bassVoice: voice,
        mix: { drums: 0, bass: 1, keys: 0, perc: 0 },
      });
      count++;
    }
    for (const voice of KEYS_VOICES) {
      write(`${v.label}-${intensity}-keys-${voice}`, {
        ...base,
        keysVoice: voice,
        mix: { drums: 0, bass: 0, keys: 1, perc: 0 },
      });
      count++;
    }
    console.log(
      `${v.label} ${intensity}: ${base.grooveId} ${base.key} ${base.kit} bpm ${base.bpm}`,
    );
  }
}
console.log(`${count} demos in ${out}`);
