#!/usr/bin/env node
/**
 * Wrapper around the Tauri CLI that makes `npm run tauri dev` build the
 * same thing users actually run.
 *
 * `src-tauri/Cargo.toml` has `default = []`, so llama.cpp is opt-in at
 * compile time. Without a feature flag `coach::llm_compiled()` is false,
 * the onboarding wizard greys out both brain tiers ("this build can't run
 * a model"), and the whole coach path goes untested in dev — while every
 * shipped binary is built `coach-llm-metal` / `coach-llm-vulkan` by
 * `release.yml`. Dev and production were exercising different code.
 *
 * So for `dev` and `build` this injects the same feature the release
 * workflow uses for the host platform, unless the caller already passed
 * `--features` / `-f`.
 *
 * Escape hatch: `YAMES_DEV_NO_LLM=1` skips the injection. The LLM build
 * needs cmake, libclang and (off macOS) the Vulkan SDK, and costs a long
 * first compile — someone changing only CSS should not have to pay that.
 *
 * CI is unaffected: `release.yml` runs `tauriScript: npx tauri` and
 * passes its own `--features`, so it never goes through this file.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);

// ROADMAP §3: always try the GPU first; llama.cpp falls back to the CPU
// at runtime when it finds no usable device, so one feature serves both.
const FEATURE = process.platform === "darwin" ? "coach-llm-metal" : "coach-llm-vulkan";

const subcommand = argv.find((a) => !a.startsWith("-"));
const wantsFeatureInjection =
  (subcommand === "dev" || subcommand === "build") &&
  process.env.YAMES_DEV_NO_LLM !== "1" &&
  !argv.some((a) => a === "-f" || a === "--features" || a.startsWith("--features="));

const args = [...argv];
const env = { ...process.env };

if (wantsFeatureInjection) {
  // Insert straight after the subcommand: everything after a `--` is
  // forwarded to cargo by the CLI, so appending would land in the wrong
  // argument list.
  args.splice(args.indexOf(subcommand) + 1, 0, "--features", FEATURE);
  console.log(`[tauri] building with --features ${FEATURE} (YAMES_DEV_NO_LLM=1 to skip)`);

  if (process.platform === "win32") {
    // Both discovered the hard way in T01 and encoded in
    // .github/actions/llm-build-env. The Visual Studio generator's CL
    // tracker blows past MAX_PATH inside llama.cpp's shader tree, and
    // `vulkan-shaders-gen` nests a second CMake tree inside the first
    // one's build dir — which the default `src-tauri/target/...` cannot
    // survive either. Only set when the caller has not chosen.
    if (!env.CMAKE_GENERATOR) {
      env.CMAKE_GENERATOR = "Ninja";
      console.log("[tauri] CMAKE_GENERATOR=Ninja (llama.cpp shader tree vs MAX_PATH)");
    }
    if (!env.CARGO_TARGET_DIR) {
      env.CARGO_TARGET_DIR = "C:\\yames-target";
      console.log(
        `[tauri] CARGO_TARGET_DIR=${env.CARGO_TARGET_DIR} — a short path is required for the` +
          " llama.cpp build on Windows; set it yourself to override",
      );
    }

    // `llama-cpp-sys-2`'s build script panics with "Please install Vulkan
    // SDK and ensure that VULKAN_SDK env variable is set: NotPresent" — and
    // it does so several minutes into the build, after cargo has already
    // compiled a pile of unrelated crates. The SDK's installer sets
    // VULKAN_SDK machine-wide, but a shell opened before the install
    // inherited the old environment and will never see it, which is exactly
    // how this bites: the machine is set up correctly and the build still
    // fails. Recover it from disk, and if we genuinely cannot find one,
    // say so now with a usable instruction instead of panicking later.
    if (!env.VULKAN_SDK) {
      const root = "C:\\VulkanSDK";
      const versions = existsSync(root)
        ? readdirSync(root, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            // Newest first, comparing version components numerically so
            // 1.4.357 sorts above 1.4.99 (a plain string sort would not).
            .map((e) => e.name)
            .sort((a, b) => {
              const pa = a.split(".").map(Number);
              const pb = b.split(".").map(Number);
              for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const d = (pb[i] ?? 0) - (pa[i] ?? 0);
                if (d) return d;
              }
              return 0;
            })
        : [];
      const found = versions.find((v) => existsSync(join(root, v, "Include", "vulkan")));
      if (found) {
        env.VULKAN_SDK = join(root, found);
        console.log(`[tauri] VULKAN_SDK=${env.VULKAN_SDK} (found on disk; your shell did not have it)`);
      } else {
        console.error(
          "[tauri] The Vulkan SDK is required for the coach-llm-vulkan build and was not found.\n" +
            "        Install it from https://vulkan.lunarg.com/sdk/home#windows, then open a NEW\n" +
            "        terminal so it picks up VULKAN_SDK.\n" +
            "        To build without the coach instead:  YAMES_DEV_NO_LLM=1 npm run tauri dev",
        );
        process.exit(1);
      }
    }

    // Same failure shape, different crate: aubio-sys' bindgen needs
    // libclang and reports its absence just as unhelpfully.
    if (!env.LIBCLANG_PATH) {
      const llvm = "C:\\Program Files\\LLVM\\bin";
      if (existsSync(join(llvm, "libclang.dll"))) {
        env.LIBCLANG_PATH = llvm;
        console.log(`[tauri] LIBCLANG_PATH=${llvm} (found on disk; your shell did not have it)`);
      }
    }
  }
}

// The package's own JS entry rather than the `.bin` shim: running the
// shim on Windows would need `shell: true`, which Node deprecates for
// spawns that pass an argument array (DEP0190) because the args are
// concatenated rather than escaped. Going straight to the .js keeps one
// code path on every platform and no shell in the middle.
const cli = join(repoRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
if (!existsSync(cli)) {
  console.error(`[tauri] CLI not found at ${cli} — run \`npm install\` first.`);
  process.exit(1);
}

const child = spawn(process.execPath, [cli, ...args], {
  stdio: "inherit",
  env,
  cwd: repoRoot,
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
child.on("error", (err) => {
  console.error(`[tauri] failed to start the CLI: ${err.message}`);
  process.exit(1);
});
