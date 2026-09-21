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
 *   node scripts/check-mobile-bundle.mjs --sideload [dist-dir]
 *
 * There are two phone bundles and they are not the same app (M11). The one a
 * store gets must not be able to tell you a newer version exists: a store
 * keeps its own apps current, and both stores refuse an app that points at
 * its own download page. The one people download from yames.app must, because
 * nothing else will. So the flavour is an argument rather than something this
 * script could sniff — a missing `YAMES_SIDELOAD=1` and a deliberate store
 * build produce byte-identical output, and only the person running the build
 * knows which one they meant.
 *
 * Without `--sideload` the two addresses are forbidden. With it they are
 * REQUIRED, so a website build that lost its flag somewhere in the pipeline
 * fails here rather than shipping as a phone app that can never update.
 *
 * Exit 0 = clean, 1 = something survived (or is missing), 2 = nothing to
 * check (which is a failure too — a silent zero here would pass every build).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const sideload = args.includes("--sideload");
const distDir = resolve(args.find((a) => !a.startsWith("--")) ?? join(repoRoot, "dist"));

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

/**
 * The two addresses that only the website's own phone build may carry (M11).
 *
 * Forbidden in a store bundle, required in a sideload one — the same two
 * strings read both ways, because "the flag was set" and "the flag was not
 * set" are the only two things that can be true and each has a wrong answer.
 */
const SIDELOAD_ONLY = [
  [
    "api.github.com/repos/turutupa/yames/releases/latest",
    "the once-a-day check for a newer version",
  ],
  [
    "https://yames.app/#download",
    "the website's own download page — a store build must never point at it",
  ],
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

const forbidden = sideload ? FORBIDDEN : [...FORBIDDEN, ...SIDELOAD_ONLY];
const hits = [];
/** Needles the sideload flavour must CARRY, and where each was seen. */
const found = new Set();

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const [needle, what] of forbidden) {
    if (text.includes(needle)) {
      hits.push({ file: relative(repoRoot, file), needle, what });
    }
  }
  if (sideload) {
    for (const [needle] of SIDELOAD_ONLY) {
      if (text.includes(needle)) found.add(needle);
    }
  }
}

if (sideload) {
  const missing = SIDELOAD_ONLY.filter(([needle]) => !found.has(needle));
  if (missing.length > 0) {
    console.error(
      "This was built as the website's phone app, and it cannot tell anyone a\n" +
        "newer version exists — the following is not in the bundle:\n",
    );
    for (const [needle, what] of missing) console.error(`  ${needle}  — ${what}`);
    console.error(
      "\nThe build was missing YAMES_SIDELOAD=1, or a call site stopped being\n" +
        "guarded by `SAYS_WHEN_NEWER ? … :` and got folded away with it.",
    );
    process.exit(1);
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
  `Mobile bundle is clean (${sideload ? "the website's build" : "a store's build"}): ` +
    `${files.length} file${files.length === 1 ? "" : "s"} checked, ` +
    `none of the ${forbidden.length} cut features found` +
    (sideload
      ? `, and both of the ${SIDELOAD_ONLY.length} things only this build may carry are present.`
      : "."),
);
