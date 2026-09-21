/**
 * Eight bars of the band, per style, for listening (2026-09-16).
 *
 * The bass and keys players are judged by ear, and an ear cannot be pointed
 * at a unit test. This writes what the app would send the engine — one
 * compiled config per bar, exactly as `useJamSession` builds them, with the
 * keys' voicing carried from bar to bar — as JSON; the engine's own renderer
 * turns each file into a WAV:
 *
 *     npx tsx scripts/sounds/band_demo.ts <dir>
 *     YAMES_BAND_DEMO=<dir> node scripts/rust-test.mjs --lib --no-default-features \
 *       render_band_demos -- --ignored --nocapture
 *
 * Each demo starts from a vibe, the way a player would, and then sets the
 * bass figure, the keys style or the progression the demo is about.
 */
import fs from "node:fs";
import path from "node:path";
import { applyVibe } from "../../src/jam/vibes";
import { createJam } from "../../src/jam/jams";
import { compileJam } from "../../src/jam/compile";
import { lastVoicing } from "../../src/jam/keysline";
import type { Jam } from "../../src/jam/types";

type Demo = { name: string; vibe: string; variation?: string; edit?: Partial<Jam> };

const band = { drums: true, bass: true, keys: true };

const DEMOS: Demo[] = [
  { name: "01-rock-auto", vibe: "rock", edit: { band: { ...band, perc: false } } },
  { name: "02-rock-eighths-busy", vibe: "rock", edit: { band, bassStyle: "eighths", bassBusy: "busy" } },
  { name: "03-blues-shuffle", vibe: "blues", edit: { band } },
  { name: "04-blues-walking-jazzblues", vibe: "blues", edit: { band, bassStyle: "walking", changes: "jazzBlues", keysStyle: "charleston" } },
  { name: "05-funk", vibe: "funk", edit: { band } },
  { name: "06-jazz-swing", vibe: "jazz", edit: { band, form: { kind: "blues12", bars: 12 }, changes: "jazzBlues" } },
  { name: "07-bossa", vibe: "latin", variation: "bossa", edit: { band } },
  { name: "08-salsa-tumbao-montuno", vibe: "latin", edit: { band, grooveId: "mambo" } },
  { name: "09-reggae", vibe: "rock", edit: { band, grooveId: "oneDrop", key: "Am", changes: "dorianVamp" } },
  { name: "10-country-train", vibe: "country", edit: { band } },
  { name: "11-pop-ballad", vibe: "pop", variation: "ballad", edit: { band } },
  { name: "12-metal-gallop", vibe: "metal", edit: { band, grooveId: "metalGallop" } },
  { name: "13-pop-disco", vibe: "pop", variation: "fourOnFloor", edit: { band } },
  { name: "14-country-walkup-busy", vibe: "country", variation: "twoStep", edit: { band, bassBusy: "busy" } },
];

const out = process.argv[2];
if (!out) {
  console.error("usage: npx tsx scripts/sounds/band_demo.ts <dir>");
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

for (const demo of DEMOS) {
  const jam: Jam = { ...applyVibe(createJam(demo.name), demo.vibe, demo.variation), ...demo.edit };
  const bars = 8;
  const configs = [];
  let previousVoicing: number[] | null = null;
  for (let bar = 0; bar < bars; bar++) {
    const config = compileJam(jam, { formBar: bar, chorus: 1, previousVoicing });
    previousVoicing = lastVoicing(config.keys) ?? previousVoicing;
    configs.push(config);
  }
  fs.writeFileSync(
    path.join(out, `${demo.name}.json`),
    JSON.stringify({ bpm: jam.bpm, bars: configs }),
  );
  console.log(
    `${demo.name}: ${jam.grooveId} ${jam.key} ${jam.form.kind} bpm ${jam.bpm} ` +
      `bass ${jam.bassStyle ?? "auto"} keys ${jam.keysStyle ?? "auto"} changes ${jam.changes ?? "auto"}`,
  );
}
