#!/usr/bin/env node
/**
 * Prove the mobile cut, against the bundle rather than against intent.
 *
 * `plans/MOBILE_IMPLEMENTATION_PLAN.md` §1 says the practice coach, the mic
 * evaluation, the voice, MIDI, the floating widget, the hotkeys and the
 * window APIs are *gone* on a phone — "not greyed out, not 'coming later' in
 * the UI: not compiled, not bundled, not rendered". Gating the UI is easy to
 * get right and easy to quietly get wrong: a single live reference anywhere
 * in the import graph — one prop threaded through a component that no longer
 * renders, one hook called for a value nobody reads — is enough to pull a
 * whole subtree back into `dist/`, and nothing about the running app would
 * look different.
 *
 * So this greps the built assets for command names and identifiers that only
 * exist inside the cut features. It is a smoke alarm, not a proof: a clean
 * run means none of these particular things is there, not that nothing is.
 * When you cut something new, add its most distinctive string here.
 *
 *   node scripts/check-mobile-bundle.mjs [dist-dir]
 *
 * Exit 0 = clean, 1 = something survived, 2 = nothing to check (which is a
 * failure too — a silent zero here would pass every build).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(process.argv[2] ?? join(repoRoot, "dist"));

/**
 * Each entry is a string that must not appear, and what its presence means.
 * The Rust command names are the strongest signals — they exist in exactly
 * one place, `src/ipc.desktop.ts`, and a build that names one is a build that
 * can call it.
 */
const FORBIDDEN = [
  ["coachBrainTier", "the practice coach's brain-tier setting"],
  ["piper", "the Piper voice binary"],
  ["start_evaluation", "the microphone evaluation pipeline"],
  ["tts_speak", "the coach's voice"],
  ["show_floating", "the floating widget window"],
  ["globalShortcut", "OS-level global shortcuts"],
  ["connect_midi_device", "MIDI"],
  ["set_always_on_top", "window management"],
  ["check_update", "the in-app updater"],
  ["practice-coach", "the coach containers"],
  ["CoachCard", "the coach card"],
  // The band ships on a phone (M08). Two halves of it do not, and both fail
  // the same way if a gate slips: a control that answers nothing.
  ["start_take", "recording a take — it records you through the mic, and there is no mic"],
  ["takes_dir_size", "the takes shelf"],
  ["pick_kit_folder", "the folder dialog for a kit of your own samples"],
  ["inspect_kit_folder", "reading a folder of your own samples"],
  // The band's fourth row — you, and whether anything is listening to you.
  // The class name exists in exactly one place (`BandLanes.tsx`) and survives
  // minification, which is what makes it a usable signal; the row itself is
  // about a microphone, and a phone has none (M09).
  ["jam-band-you", "the band's “you” row, which reports a microphone a phone does not have"],
];

/** Every file under `dist/assets`, recursively. */
function assetFiles(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(assetFiles(full));
    else out.push(full);
  }
  return out;
}

const files = assetFiles(join(distDir, "assets"));

if (files.length === 0) {
  console.error(
    `No assets found under ${join(distDir, "assets")}.\n` +
      "Build first: YAMES_MOBILE=1 npm run build  (or: npm run build:mobile)",
  );
  process.exit(2);
}

const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const [needle, what] of FORBIDDEN) {
    if (text.includes(needle)) {
      hits.push({ file: relative(repoRoot, file), needle, what });
    }
  }
}

if (hits.length > 0) {
  console.error(
    `The mobile bundle still contains ${hits.length} thing${hits.length === 1 ? "" : "s"} that should be gone:\n`,
  );
  for (const { file, needle, what } of hits) {
    console.error(`  ${needle}  — ${what}`);
    console.error(`      in ${file}`);
  }
  console.error(
    "\nSomething still references it from the mobile import graph. Look for a\n" +
      "prop still being threaded, a hook still called for a value nobody reads,\n" +
      "or a `?.` where the whole expression needed an `IS_MOBILE` branch — a\n" +
      "dead branch is dropped, an optional chain is not.",
  );
  process.exit(1);
}

console.log(
  `Mobile bundle is clean: ${files.length} file${files.length === 1 ? "" : "s"} checked, ` +
    `none of the ${FORBIDDEN.length} cut features found.`,
);
