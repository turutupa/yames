#!/usr/bin/env node
/**
 * `npm run build:mobile` — the mobile build, then the proof.
 *
 * Exists because `YAMES_MOBILE=1 npm run build` is not a thing you can type
 * on Windows, which is where the owner builds Android, and pulling in
 * `cross-env` for one environment variable is a dependency for a one-line
 * problem. Running the bundle check straight afterwards is the point: a
 * mobile build nobody checked is worth very little.
 *
 * Same spawn convention as `scripts/tauri.mjs` — each tool's own JS entry
 * rather than the `.bin` shim, so there is no shell in the middle on any
 * platform (a `shell: true` spawn with an argument array is deprecated,
 * DEP0190, and splits an interpreter path that contains a space).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, YAMES_MOBILE: "1" };

const steps = [
  ["type check", join(repoRoot, "node_modules", "typescript", "bin", "tsc")],
  ["build", join(repoRoot, "node_modules", "vite", "bin", "vite.js"), "build"],
  ["bundle check", join(repoRoot, "scripts", "check-mobile-bundle.mjs")],
];

for (const [name, entry] of steps) {
  if (!existsSync(entry)) {
    console.error(`[build:mobile] ${name}: not found at ${entry} — run \`npm install\` first.`);
    process.exit(1);
  }
}

function run([name, entry, ...args]) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [entry, ...args], {
      stdio: "inherit",
      env,
      cwd: repoRoot,
    });
    child.on("error", (err) => {
      console.error(`[build:mobile] ${name}: ${err.message}`);
      process.exit(1);
    });
    child.on("exit", (code, signal) => {
      if (signal) process.exit(1);
      if (code !== 0) process.exit(code ?? 1);
      done();
    });
  });
}

for (const step of steps) await run(step);
