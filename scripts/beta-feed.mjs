#!/usr/bin/env node
/**
 * The beta (test-build) feed: the pieces `.github/workflows/beta.yml` needs,
 * in one place so they can be unit-tested (`src/beta/betaFeed.test.ts`).
 *
 * The feed is ONE rolling GitHub pre-release, tagged `beta`. Its assets are
 * replaced on every run, and two of them are read by the apps:
 *
 *   latest.json        tauri-plugin-updater's manifest, for the desktop betas
 *   android-beta.json  { version, versionCode, url, sha256, size, notes }
 *
 * Both are served from `releases/download/beta/<name>`, which GitHub resolves
 * to the release whose tag is `beta` whether or not it is a pre-release (it
 * is how neovim's rolling `nightly` is downloaded). A pre-release is never
 * `releases/latest`, so the stable feed (`releases/latest/download/
 * latest.json`), winget and Homebrew never see any of it.
 *
 *   node scripts/beta-feed.mjs version <stableVersion> <runNumber>
 *   node scripts/beta-feed.mjs overlay <betaVersion> <outFile>
 *   node scripts/beta-feed.mjs collect <label> <betaVersion> <bundleDir> <outDir>
 *   node scripts/beta-feed.mjs latest <betaVersion> <notesFile> <fragmentsDir> <existingLatest|-> <outFile>
 *   node scripts/beta-feed.mjs android <betaVersion> <versionCode> <apk> <notesFile> <outFile>
 *   node scripts/beta-feed.mjs stale <latest.json|-> <android-beta.json|-> <assetNamesFile>
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = "turutupa/yames";
export const BETA_TAG = "beta";
export const BETA_DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download/${BETA_TAG}/`;
export const BETA_LATEST_JSON_URL = `${BETA_DOWNLOAD_BASE}latest.json`;
export const ANDROID_FEED_NAME = "android-beta.json";

/** "1.2.2" -> [1, 2, 2]; anything that is not three numbers throws. */
function parseCore(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-.*)?$/.exec(String(version).trim());
  if (!m) throw new Error(`not a version: ${version}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * The beta version: the minor after the current stable, `-beta.N`.
 * 1.2.2 + run 57 -> 1.3.0-beta.57. N must be a positive integer.
 */
export function betaVersion(stableVersion, runNumber) {
  const [major, minor] = parseCore(stableVersion);
  const n = Number(runNumber);
  if (!Number.isInteger(n) || n < 1 || n > 9999) {
    throw new Error(`beta build number must be 1..9999, got ${runNumber}`);
  }
  return `${major}.${minor + 1}.0-beta.${n}`;
}

/**
 * The Android versionCode a beta carries — the same formula as
 * `gen/android/app/build.gradle.kts` (the workflow checks the built APK
 * against this): stable code of X.Y.Z, times 10000, plus N.
 */
export function betaVersionCode(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$/.exec(String(version).trim());
  if (!m) throw new Error(`not a beta version: ${version}`);
  const [major, minor, patch, n] = m.slice(1).map(Number);
  if (minor >= 100 || patch >= 100 || n < 1 || n > 9999) {
    throw new Error(`beta version out of range: ${version}`);
  }
  const code = (major * 10000 + minor * 100 + patch) * 10000 + n;
  if (code > 2_100_000_000) throw new Error(`versionCode ${code} is over Play's ceiling`);
  return code;
}

/** The `--config` overlay a beta build is made with. Stable's file is never edited. */
export function betaOverlay(version) {
  return {
    version,
    plugins: { updater: { endpoints: [BETA_LATEST_JSON_URL] } },
  };
}

export function assetUrl(name) {
  return BETA_DOWNLOAD_BASE + encodeURIComponent(name);
}

/**
 * What each desktop build label contributes: which bundle file is the
 * updater artifact, what it is uploaded as, and which latest.json keys point
 * at it (`{os}-{arch}-{installer}` first, then `{os}-{arch}`, which is the
 * order tauri-plugin-updater looks them up in). `extra` are installers a
 * tester downloads by hand that the updater does not use.
 */
const LABELS = {
  windows: {
    dir: "nsis",
    match: (f) => f.endsWith("-setup.exe"),
    keys: ["windows-x86_64-nsis", "windows-x86_64"],
  },
  linux: {
    dir: "appimage",
    match: (f) => f.endsWith(".AppImage"),
    keys: ["linux-x86_64-appimage", "linux-x86_64"],
  },
  "macos-aarch64": {
    dir: "macos",
    match: (f) => f.endsWith(".app.tar.gz"),
    // Both macOS builds produce `Yames.app.tar.gz`; one release cannot hold
    // two assets of one name.
    rename: (v) => `Yames_${v}_aarch64.app.tar.gz`,
    keys: ["darwin-aarch64-app", "darwin-aarch64"],
    extra: { dir: "dmg", match: (f) => f.endsWith(".dmg") },
  },
  "macos-x86_64": {
    dir: "macos",
    match: (f) => f.endsWith(".app.tar.gz"),
    rename: (v) => `Yames_${v}_x64.app.tar.gz`,
    keys: ["darwin-x86_64-app", "darwin-x86_64"],
    extra: { dir: "dmg", match: (f) => f.endsWith(".dmg") },
  },
};

export const DESKTOP_LABELS = Object.keys(LABELS);

function only(dir, match, what) {
  const found = existsSync(dir) ? readdirSync(dir).filter(match) : [];
  if (found.length !== 1) {
    throw new Error(`expected exactly one ${what} in ${dir}, found ${found.length}: ${found.join(", ")}`);
  }
  return join(dir, found[0]);
}

/**
 * Copy one build's updater artifact (+ any hand-installable extra) into
 * `outDir` under its release name, and write `fragment-<label>.json` with the
 * latest.json entries for it. The signature is the `.sig` tauri wrote next to
 * the artifact, signed with TAURI_SIGNING_PRIVATE_KEY.
 */
export function collect(label, version, bundleDir, outDir) {
  const spec = LABELS[label];
  if (!spec) throw new Error(`unknown desktop label: ${label}`);
  mkdirSync(outDir, { recursive: true });
  const artifact = only(join(bundleDir, spec.dir), spec.match, `${label} updater artifact`);
  const sigPath = `${artifact}.sig`;
  if (!existsSync(sigPath)) {
    throw new Error(`${artifact} has no .sig: was TAURI_SIGNING_PRIVATE_KEY set?`);
  }
  const name = spec.rename ? spec.rename(version) : basename(artifact);
  if (!name.includes(version)) {
    throw new Error(`${name} does not carry the version ${version}; the --config overlay did not apply`);
  }
  copyFileSync(artifact, join(outDir, name));
  const signature = readFileSync(sigPath, "utf8").trim();
  const platforms = {};
  for (const key of spec.keys) platforms[key] = { signature, url: assetUrl(name) };
  const files = [name];
  if (spec.extra) {
    const extra = only(join(bundleDir, spec.extra.dir), spec.extra.match, `${label} installer`);
    copyFileSync(extra, join(outDir, basename(extra)));
    files.push(basename(extra));
  }
  const fragment = { label, version, platforms, files };
  writeFileSync(join(outDir, `fragment-${label}.json`), JSON.stringify(fragment, null, 2) + "\n");
  return fragment;
}

/**
 * The merged latest.json.
 *
 * Every platform built in this run, plus any entry already in the feed whose
 * version is THIS version (a re-run of a failed job keeps the run number, so
 * the platforms that did succeed the first time are kept). An entry from an
 * older version is dropped: the manifest has one `version`, and pointing it
 * at an older installer would have that platform reinstall the same build
 * on every check.
 */
export function mergeLatest({ version, notes, fragments, existing, now = new Date() }) {
  if (!fragments.length) throw new Error("no desktop platform was built");
  const platforms = {};
  if (existing && existing.version === version && existing.platforms) {
    Object.assign(platforms, existing.platforms);
  }
  for (const f of fragments) {
    if (f.version !== version) {
      throw new Error(`fragment ${f.label} is ${f.version}, this run is ${version}`);
    }
    Object.assign(platforms, f.platforms);
  }
  return {
    version,
    notes: notes || `Test build ${version}`,
    pub_date: now.toISOString(),
    platforms: Object.fromEntries(Object.entries(platforms).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** android-beta.json for one APK. */
export function androidFeed({ version, versionCode, apkName, sha256, size, notes }) {
  const expected = betaVersionCode(version);
  if (Number(versionCode) !== expected) {
    throw new Error(`the APK's versionCode is ${versionCode}, ${version} should be ${expected}`);
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("bad sha256");
  return {
    version,
    versionCode: expected,
    url: assetUrl(apkName),
    sha256,
    size,
    notes: notes || `Test build ${version}`,
  };
}

/** Asset names a feed points at — everything else on the release is stale. */
export function referencedAssets(latest, android) {
  const names = new Set(["latest.json", ANDROID_FEED_NAME]);
  const nameOf = (url) => {
    if (typeof url !== "string" || !url.startsWith(BETA_DOWNLOAD_BASE)) return null;
    return decodeURIComponent(url.slice(BETA_DOWNLOAD_BASE.length));
  };
  for (const entry of Object.values(latest?.platforms ?? {})) {
    const n = nameOf(entry?.url);
    if (n) names.add(n);
  }
  const a = nameOf(android?.url);
  if (a) names.add(a);
  return names;
}

/**
 * Assets on the release that no feed needs any more. Kept: the two feeds,
 * every asset a feed names, and any asset carrying a version a feed is on
 * (the .dmg next to a macOS updater archive, say). Everything else is an
 * older build's and goes.
 */
export function staleAssets(assetNames, latest, android) {
  const keep = referencedAssets(latest, android);
  const live = [latest?.version, android?.version].filter((v) => typeof v === "string" && v);
  return assetNames.filter(
    (name) => !keep.has(name) && !live.some((v) => name.includes(`_${v}_`)),
  );
}

// ---------------------------------------------------------------------------

function readJsonOrNull(path) {
  if (!path || path === "-" || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readText(path) {
  return path && path !== "-" && existsSync(path) ? readFileSync(path, "utf8").trim() : "";
}

function main(argv) {
  const [cmd, ...a] = argv;
  switch (cmd) {
    case "version":
      console.log(betaVersion(a[0], a[1]));
      return;
    case "overlay":
      writeFileSync(a[1], JSON.stringify(betaOverlay(a[0]), null, 2) + "\n");
      console.log(readFileSync(a[1], "utf8"));
      return;
    case "collect":
      console.log(JSON.stringify(collect(a[0], a[1], a[2], a[3]), null, 2));
      return;
    case "latest": {
      const [version, notesFile, fragmentsDir, existingPath, out] = a;
      const fragments = readdirSync(fragmentsDir)
        .filter((f) => /^fragment-.*\.json$/.test(f))
        .map((f) => JSON.parse(readFileSync(join(fragmentsDir, f), "utf8")));
      const merged = mergeLatest({
        version,
        notes: readText(notesFile),
        fragments,
        existing: readJsonOrNull(existingPath),
      });
      writeFileSync(out, JSON.stringify(merged, null, 2) + "\n");
      console.log(JSON.stringify({ ...merged, platforms: Object.keys(merged.platforms) }, null, 2));
      return;
    }
    case "android": {
      const [version, versionCode, apk, notesFile, out] = a;
      const feed = androidFeed({
        version,
        versionCode,
        apkName: basename(apk),
        sha256: sha256File(apk),
        size: statSync(apk).size,
        notes: readText(notesFile),
      });
      writeFileSync(out, JSON.stringify(feed, null, 2) + "\n");
      console.log(JSON.stringify(feed, null, 2));
      return;
    }
    case "stale": {
      const names = readFileSync(a[2], "utf8").split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
      for (const n of staleAssets(names, readJsonOrNull(a[0]), readJsonOrNull(a[1]))) console.log(n);
      return;
    }
    default:
      console.error("usage: see the header of scripts/beta-feed.mjs");
      process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`::error::${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
