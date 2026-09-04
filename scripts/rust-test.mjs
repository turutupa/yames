#!/usr/bin/env node
// `cargo test` for src-tauri, plus the one Windows-only linker flag the test
// harness needs.
//
// On Windows/MSVC a `cargo test` binary links Tauri code that imports
// `TaskDialogIndirect` but gets none of the application manifest
// `tauri-build` attaches to `yames.exe`, so it dies at load with
// STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) before running a test. The fix is
// one manifest, applied to test links only — never to a build that produces
// `yames.exe`, where it collides with tauri-build's own manifest resource.
// See src-tauri/tests-common-controls-v6.manifest for the full story.
//
// `src-tauri/build.rs` covers integration tests (`--test dsp_fixtures` and
// friends) with `cargo:rustc-link-arg-tests`, which cargo keeps away from
// binary targets. Cargo has no equivalent key for the `--lib` unit-test
// harness, so that one needs `RUSTFLAGS` — which is global, and therefore
// only safe on an invocation that builds no bins. `cargo test --lib` is such
// an invocation; `cargo test --test <name>` is NOT (it builds every bin so
// an integration test can exec them, and the manifest would then collide
// with tauri-build's inside `yames.exe`). Hence the `--lib` gate below.
//
// Every argument is forwarded to `cargo test` unchanged:
//   node scripts/rust-test.mjs --lib --no-default-features
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Cargo's separator for CARGO_ENCODED_RUSTFLAGS (ASCII unit separator).
const UNIT_SEP = "\u001f";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
const cargoArgs = process.argv.slice(2);

if (process.platform === "win32" && cargoArgs.includes("--lib")) {
  const manifest = path.join(repoRoot, "src-tauri", "tests-common-controls-v6.manifest");
  // `CARGO_ENCODED_RUSTFLAGS` rather than `RUSTFLAGS`: cargo splits the
  // latter on whitespace, which would break a checkout under a path with a
  // space in it. Cargo prefers the encoded form when both are set, so flags
  // the developer already had are carried into it rather than dropped.
  const encoded = (env.CARGO_ENCODED_RUSTFLAGS ?? "").split(UNIT_SEP).filter(Boolean);
  const inherited = encoded.length
    ? encoded
    : (env.RUSTFLAGS ?? "").split(/\s+/).filter(Boolean);
  env.CARGO_ENCODED_RUSTFLAGS = [
    ...inherited,
    "-Clink-arg=/MANIFEST:EMBED",
    `-Clink-arg=/MANIFESTINPUT:${manifest}`,
  ].join(UNIT_SEP);
  delete env.RUSTFLAGS;
}

const crateDir = path.join(repoRoot, "src-tauri");
const args = ["test", "--manifest-path", path.join(crateDir, "Cargo.toml"), ...cargoArgs];

// Run from the crate directory so `src-tauri/.cargo/config.toml` applies,
// as it did when `test:rust` was a bare `cd src-tauri && cargo test`.
const child = spawn("cargo", args, { stdio: "inherit", env, cwd: crateDir });
child.on("error", (err) => {
  console.error(`could not run cargo: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
