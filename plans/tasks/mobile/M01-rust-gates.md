# M01 — Rust: compile the crate for Android and iOS without the coach

Size: M. Branch: `mobile/m01-rust-gates`, from `mobile`. Blocks: M00's
proper build, M04. Parallel-safe with M02, M03a, M05a (they do not
touch `src-tauri/`).

## Goal

`src-tauri` compiles for `aarch64-linux-android` and `aarch64-apple-ios`
with no coach, no mic evaluation, no TTS, no MIDI handlers, no window
management — and desktop builds and tests do not change at all.

## Why (context you would otherwise lack)

- Read `plans/MOBILE_IMPLEMENTATION_PLAN.md` §1–§3 first. The owner's
  decision is final: nothing coach-related exists in a mobile binary.
- Modules that must not compile on mobile: `coach.rs`, `models.rs`,
  `tts.rs`, `audio_input.rs`, `onset.rs`, `session.rs`,
  `session_audio.rs`, `session_log.rs`, `calibration_cache.rs`.
  Dependencies that must not be pulled: `aubio`, `llama-cpp-2`,
  `encoding_rs`, `num_cpus`.
- `engine.rs` imports `onset::SharedTempoContext` (8 uses) and
  `timing::{BeatLog, BeatTick}`. `TempoContext` (`onset.rs:40`) is
  three atomics. Move it to `src-tauri/src/tempo_context.rs` and
  re-export it from `onset` so nothing else changes. `timing.rs` is pure
  Rust and stays compiled everywhere; check what it imports from
  `onset` / `instrument` and keep only the pure parts on the mobile
  path. `instrument.rs` is data used by `state.rs`; it stays.
- Desktop-only pieces in `lib.rs` and `commands.rs`: tray
  (`TrayIconBuilder`, the `tray-icon` Tauri feature), `macos-private-api`,
  `tauri-plugin-global-shortcut`, `tauri-plugin-updater`,
  `tauri-plugin-decorum`, `tauri-plugin-process`, the `floating` window,
  `set_always_on_top`, `set_widget_always_on_top`, `set_widget_mode`,
  `show_floating`, `show_main`, `save_window_position`, the
  `WindowEvent::Moved` handler, `app_ready`'s positioning half. `midir`
  compiles on Android to a dummy backend; its commands stay compiled
  but are desktop-only in v1.
- tauri-build defines `desktop` and `mobile` cfgs. Use `#[cfg(desktop)]`
  / `#[cfg(mobile)]`, not hand-rolled `target_os` lists, except in
  `Cargo.toml` where you must spell out
  `cfg(not(any(target_os = "android", target_os = "ios")))`.
- `tauri::generate_handler!` takes one flat list and cannot cfg
  individual entries. Do **not** fight it. Keep every command
  registered on every platform and gate the *bodies*: a desktop-only or
  coach-only command on mobile returns
  `Err("not available on this platform".into())`. The frontend never
  calls them on mobile (M02); the error is a safety net, not UX.
- **Feature vs target gating — decide, then document.** The plan says
  a Cargo feature `practice-coach`, on by default, with mobile builds
  passing `--no-default-features`. That only works if the Tauri CLI
  forwards `--no-default-features` for `tauri android build` / `dev`
  and `tauri ios …`. Check with `npx tauri android build --help` and
  read `scripts/tauri.mjs`. If it does not, use target-specific
  dependency blocks in `Cargo.toml` plus `#[cfg(desktop)]` on the
  modules, and say so in the PR. Either way desktop builds keep the
  coach with **no flag changes**, and `coach-llm*` features stay
  exactly as they are on desktop.
- `scripts/tauri.mjs` injects `--features coach-llm-vulkan` (Windows)
  / `coach-llm-metal` (macOS) unless `YAMES_DEV_NO_LLM=1`. Teach it:
  when the Tauri subcommand is `android` or `ios`, inject nothing LLM
  related, set `YAMES_MOBILE=1` in the child environment (M02 reads
  it), and pass whatever feature flags your gating approach needs.
- `package.json` `test:rust` runs `--no-default-features`. If you add a
  default feature, that script must keep testing the coach path on
  desktop (`--no-default-features --features practice-coach`, or drop
  the flag). Do not let the desktop test surface shrink.
- Android cross-compiling: `cargo check --target aarch64-linux-android`
  needs the Rust target (`rustup target add aarch64-linux-android`) and,
  for pure-Rust dependency graphs, nothing else. It needs the NDK only
  if a C dependency is still on the mobile path — which after this task
  there should not be (`cpal` on Android uses the `oboe` crate, which
  bundles prebuilt libs and does not need cmake). If `cargo check`
  wants a linker or NDK, something C-based is still being pulled in;
  find it with `cargo tree --target aarch64-linux-android -e normal`.
- The iOS check needs the `aarch64-apple-ios` target. On Windows that
  target's std is installable and `cargo check` works for pure-Rust
  crates; `coreaudio-sys` (via cpal) is bindgen-based and may fail on a
  non-Mac host. If it does, record it and let the Mac run that gate.
- The click is sacred: nothing about the engine's callback changes.

## Steps

1. Worktree sanity: `git log --oneline -1` must be the tip of `mobile`.
   If not, `git checkout -B mobile/m01-rust-gates mobile`.
2. `rustup target add aarch64-linux-android aarch64-apple-ios` (may
   already be there).
3. Extract `TempoContext` → `tempo_context.rs`. Desktop gates green.
4. Decide feature vs target gating (see above). Apply it to the module
   list and dependencies. Gate command bodies. Gate the plugins and the
   window setup in `lib.rs`.
5. Move `tray-icon` and `macos-private-api` off the base `tauri`
   dependency onto a desktop-only target block.
6. Update `scripts/tauri.mjs` and, if needed, `package.json`.
7. Add `tauri.android.conf.json` and `tauri.ios.conf.json` next to
   `tauri.conf.json`: a single `main` window, URL `index.html`, no
   `floating`, `alwaysOnTop` off, no `trayIcon`, no updater plugin
   config. Add `src-tauri/capabilities/mobile.json` with
   `"platforms": ["android", "iOS"]` and only `core:default`,
   `core:event:default`, `store:allow-get/set/save/load`. Set
   `"platforms": ["linux", "macOS", "windows"]` on `default.json`.
8. Gates.

## Acceptance gate (all of these, in the report with output)

- `cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-linux-android` clean (with the mobile flags your approach needs).
- `cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-apple-ios` clean, or the exact bindgen/host error recorded.
- `cargo tree --target aarch64-linux-android` (mobile flags) shows no `aubio`, `llama-cpp-2`, `tauri-plugin-global-shortcut`, `tauri-plugin-updater`, `tauri-plugin-decorum`.
- Desktop: `cargo build --manifest-path src-tauri/Cargo.toml` (defaults) builds the same feature set as before; `npm run test:rust`, `npm run test:dsp`, `npm run test:highbpm` green; `bun run tsc --noEmit` untouched.
- `git diff --stat main -- src` is empty: this task does not touch the frontend.

## Environment (Windows)

Export before any cargo command:
`LIBCLANG_PATH=C:\Program Files\LLVM\bin`, `VULKAN_SDK=C:\VulkanSDK\1.4.357.0`,
`CARGO_TARGET_DIR=C:\ym01` (short path; MAX_PATH). MSVC toolchain only.
Never `npm install` in the worktree; `node_modules` is already copied.
Never run `npm run tauri dev` — the owner is releasing today and the
desktop store and port 1420 are theirs.

## Report

What was done, the gating approach chosen and why, exact commands and
results, which gates could not run on Windows, open questions for M02
and M04. Never say "done" for a gate you did not run. Open a PR against
`mobile`; do not merge; do not push to `main`.
