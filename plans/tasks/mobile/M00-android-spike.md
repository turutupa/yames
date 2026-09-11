# M00 — Android spike: does Yames boot and keep time on a phone?

Size: M. Branch: `mobile/m00-android-spike` (throwaway — never merged).
Deliverable: `plans/tasks/mobile/M00-FINDINGS.md` on its own branch
`mobile/m00-findings`, merged into `mobile`. Blocks: M01.

## Goal

Prove, on a real Android phone, that (1) the Tauri 2 Android scaffold
builds this crate once the desktop-only pieces are crudely stubbed,
(2) the React UI renders in the system WebView, and (3) the existing
cpal callback engine produces a click whose callback cadence is stable
enough to build on. Then write down everything that broke, with the
exact error text, so M01 and M02 are written from facts.

Code quality does not matter on this branch. Comment things out,
`#[cfg]` things away, `todo!()` command bodies — whatever gets to a
number fastest. The findings file is the only artefact that survives.

## Why (context you would otherwise lack)

- `plans/MOBILE_IMPLEMENTATION_PLAN.md` §2 lists what was verified from
  the code and the cargo registry: cpal 0.15 has an Oboe backend,
  `audio_thread_priority` supports Android, midir compiles to a dummy
  backend there. None of that has been *run*. The whole plan's
  estimate assumes the Oboe path gives a stable callback; you are the
  one who finds out.
- The engine renders clicks inside the cpal output callback
  (`src-tauri/src/engine.rs`, `build_output_stream` around line 1771)
  with a sample counter. There is a preallocated callback-timing sink,
  `CallbackProbe` (`engine.rs` ~1201), built for the desktop
  `click-jitter-probe` binary. On Android you cannot run that binary,
  but you can attach the probe to the engine and dump its samples over
  a temporary Tauri command. That is the measurement.
- `scripts/tauri.mjs` wraps the Tauri CLI and injects
  `--features coach-llm-vulkan` on Windows. Set `YAMES_DEV_NO_LLM=1`
  for every mobile command, or call `npx tauri` directly.
- `aubio` is built from C source via cmake + bindgen. It will probably
  not build against the NDK toolchain on the first try. Do not spend
  more than an hour on it: the real plan (M01) removes it from mobile
  builds. Stub `onset.rs` and `audio_input.rs` behind a cfg and move
  on; record what the error was.
- `llama-cpp-2` is optional and off by default; do not enable it.
- `tauri-plugin-decorum`, `tauri-plugin-global-shortcut`,
  `tauri-plugin-updater` and the `tray-icon` / `macos-private-api`
  Tauri features are desktop-only and will fail to compile or panic at
  startup on Android. Gate them with `#[cfg(desktop)]` (tauri-build
  defines it) or comment them out.
- The frontend calls `getCurrentWindow()`, `setAlwaysOnTop`, global
  shortcut registration and the `floating` window from
  `MainWindow.tsx`, `useDrag.ts`, `useActionDispatcher.ts`,
  `FullscreenView.tsx`, `useFullscreenLifecycle.ts` and `ipc.ts`. On
  Android these reject; the UI may render but log errors. Note which
  ones throw; do not fix them properly.
- The owner's own phone is a company device and cannot be used. Use
  the dedicated test phone. It must be on the same Wi-Fi as the
  laptop with no VPN, or `tauri android dev` cannot reach the Vite
  dev server; the emulator is fine for steps 1–4 but useless for
  step 6 (its audio path says nothing about real hardware).

## Environment (Windows 11, owner's machine)

Install once:

- Android Studio with SDK Platform 34, Build-Tools, Platform-Tools,
  and NDK (r26 or newer, side-by-side). Set `ANDROID_HOME`,
  `NDK_HOME` (the versioned NDK directory) and `JAVA_HOME` (the JDK 17
  bundled with Android Studio is fine).
- Rust targets:
  `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`
- Desktop prerequisites still apply because the crate still links
  aubio until you stub it: `LIBCLANG_PATH=C:\Program Files\LLVM\bin`.
- A short `CARGO_TARGET_DIR` (for example `C:\ym00`) to stay under
  MAX_PATH.
- Phone: developer mode, USB debugging, `adb devices` shows it.

## Steps

1. Create the worktree from `mobile`; confirm `git log --oneline -1`
   matches the tip of `mobile`.
2. `YAMES_DEV_NO_LLM=1 npx tauri android init`. Commit the generated
   `src-tauri/gen/android` as-is so the diff of later hand-edits is
   readable.
3. `cargo check --manifest-path src-tauri/Cargo.toml --target aarch64-linux-android`.
   Record every error verbatim in the findings file under "What did
   not compile", then fix or stub the cheapest way until it checks.
   Expected offenders: decorum, global-shortcut, updater, tray, the
   `floating` window setup, `save_window_position`, midir command
   handlers, aubio / audio_input / onset, `tts.rs` (subprocess
   spawning compiles but is pointless — stub it too).
4. `YAMES_DEV_NO_LLM=1 npx tauri android dev` on the emulator. Get to a
   rendered main window. Record: what the UI looks like at 360 px
   (screenshot into the findings branch under
   `plans/tasks/mobile/m00/`), which IPC calls reject in logcat
   (`adb logcat | grep -i yames`), whether the settings store loads.
5. Same on the physical phone. Play the click at 120 BPM, 4 beats,
   default sound. Record whether it is audible, whether it survives
   switching apps, whether it survives screen-off (expect: no, that is
   M04's job — record how long it lasts).
6. **Measure.** Attach `CallbackProbe` to the engine at startup
   (`MetronomeEngine::with_callback_probe` or equivalent — read
   `src-tauri/src/bin/click-jitter-probe.rs` for how the desktop probe
   sizes and reads it). Add a temporary command `dump_callback_probe`
   that returns the recorded `CallbackSample`s as JSON. Run 60 s at
   120 BPM, dump, and compute on the laptop: callback period mean,
   p50, p99, max, and count of gaps > 2× the nominal buffer period.
   Also record the negotiated sample rate, buffer size (frames per
   callback) and channel count that cpal chose. Repeat with the phone
   screen off for the portion Android allows.
7. Check whether cpal's Oboe backend asks for AAudio's low-latency
   performance mode: read the cpal 0.15 source under
   `~/.cargo/registry/src/*/cpal-0.15*/src/host/oboe/` and quote the
   relevant lines. If it does not, and step 6's numbers are poor, note
   that the fallback is driving the `oboe` crate directly.
8. Write `M00-FINDINGS.md` (template below) on `mobile/m00-findings`,
   branched from `mobile`, containing only the findings file and the
   screenshots. Open a PR against `mobile`. Leave the spike branch in
   place, unmerged, for reference.

## Findings file template

```
# M00 findings — <date>, <phone model, Android version>

## Go / no-go recommendation
One paragraph. The numbers that decide it.

## Callback cadence (step 6)
| Sample rate | Frames/callback | Period nominal | p50 | p99 | max | gaps > 2× | screen state |

## What did not compile (step 3)
Per item: crate / file, error text, what was done to get past it,
what M01 should do properly.

## What rendered wrong (steps 4–5)
Per item: screen, what is wrong, screenshot filename.

## IPC calls that reject on Android (steps 4–5)
Command name, error text, which frontend module called it.

## Background behaviour (step 5)
App switch: … Screen off: … Incoming call: … (if testable)

## cpal / Oboe performance mode (step 7)
Quoted lines and conclusion.

## Time spent per step
So M01–M04 estimates can be corrected.

## Open questions for M01 / M02
```

## Acceptance gate

- `M00-FINDINGS.md` merged into `mobile` with every section filled and
  the step-6 table populated from a physical device, not the emulator.
- The owner has read it and written go or no-go at the top.

## Report format

What was done, exact commands and their results, which OS and device,
anything you could not verify, open questions. Never say "done" for a
gate you did not run.
