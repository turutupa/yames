# M04 — Android: the click survives the screen turning off

Size: M. Branch: `mob/m04-android-native`, from `mobile` (after M01 and
M02 merged; M00's scaffold must exist — `src-tauri/gen/android` — or
this task starts with `npx tauri android init` itself). Blocks: M05.

## Goal

On a real Android phone, Yames keeps clicking with the screen off for
ten minutes, pauses cleanly for an incoming call and resumes after,
keeps the screen awake while zen mode or a drill is running, and
opens the About / support links in the system browser.

## Why (context you would otherwise lack)

- Read `plans/MOBILE_IMPLEMENTATION_PLAN.md` §1–§3 and §6, then M01's
  findings recorded in §3 and `plans/tasks/mobile/M00-FINDINGS.md` if
  it exists (callback cadence, what the emulator and the phone did on
  screen-off).
- The engine renders the click inside cpal's Oboe output callback.
  Android will let a backgrounded app's audio thread run only while
  the process is not killed or frozen; without a foreground service
  the process is a candidate for both within minutes of the screen
  turning off. This task is that service.
- Tauri 2 mobile plugins have a Rust half and a Kotlin half. Generate
  the skeleton with `npx tauri plugin new yames-mobile --android` into
  `src-tauri/plugins/yames-mobile/` (or hand-write the same layout);
  register it in `lib.rs` under `#[cfg(mobile)]`. Commands cross the
  bridge as JSON; keep the surface tiny:
  - `set_background_audio(active: bool)` — start / stop a foreground
    service of type `mediaPlayback` with a persistent notification
    ("Yames is playing — 120 BPM"; tap returns to the app; a Stop
    action stops playback). Requires `FOREGROUND_SERVICE`,
    `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and `POST_NOTIFICATIONS`
    (Android 13+, runtime prompt) in the manifest.
  - `keep_awake(active: bool)` — `FLAG_KEEP_SCREEN_ON` on the activity
    window. No permission needed.
  - `open_url(url)` — `Intent.ACTION_VIEW`. M01 found the Rust
    `open_url` command is a no-op on mobile (its arms are macOS,
    Windows, Linux); either route the existing command's mobile body
    through this plugin or add `tauri-plugin-opener` under the mobile
    target block. Pick the smaller diff.
  - Event `audio_interrupted { kind: "focus_lost" | "focus_gained" |
    "call" }` — from an `AudioManager` focus listener
    (`AUDIOFOCUS_GAIN` request when playback starts; on transient loss
    pause, on gain resume; on permanent loss stop). The frontend
    already has a stop / start path; wire the event to it.
- `engine::start_audio_device_polling` runs a 5-second wakeup loop
  forever (M01 noted it). On a phone that is a battery cost with no
  benefit — Android does not hot-swap output devices the way desktop
  does — gate the loop `#[cfg(desktop)]` or make its interval depend
  on `is_playing`.
- `WindowEvent::Destroyed` / `CloseRequested` no longer reach the
  engine on mobile (M01 made the whole handler desktop-only). Use the
  plugin's activity lifecycle (`onDestroy`) or Tauri's `RunEvent::Exit`
  to call the engine's shutdown so the stream is released when the OS
  finishes the process.
- Wake lock and notification copy are user-visible: musicians, not
  developers. Strings go through `src/locales/en.json` on the
  frontend side; the notification text is set from Rust/Kotlin and
  must be passed in already-translated from the frontend.
- The click is sacred: the service must not touch the audio thread;
  it only keeps the process alive.

## What M00 found that changes this task (read `M00-FINDINGS.md` first)

- **cpal's Oboe backend never requests low-latency mode and opens the
  stream at 44 100 Hz on a 48 kHz device** (cpal 0.15.3
  `src/host/oboe/mod.rs` builds the stream with direction and format
  only; no `set_performance_mode`, `set_sharing_mode`, `set_usage`).
  Tempo accuracy is fine (120 ticks in 60 s, 0.055 % drift) but the
  click's *latency* is whatever the default path gives, plus a resample.
  Plan §6's fallback is now the expected path: drive the `oboe` crate
  directly behind `cfg(target_os = "android")` for the output stream,
  requesting `PerformanceMode::LowLatency`, `SharingMode::Exclusive`
  (fall back to Shared), `Usage::Media`, the device's native sample
  rate, and the same F32 interleaved callback the engine already fills.
  Keep the engine's callback body identical; only the stream setup
  changes. Measure with the probe M00 wired
  (`M00-FINDINGS.md` "How the measurement was wired") before and after.
- **The system Back gesture kills the process mid-click**
  (`OnBackInvokedCallback is not enabled` in logcat). Back must: close
  an open sheet if one is open, otherwise move the app to the
  background (`moveTaskToBack`) while the click keeps going under the
  foreground service. Handle it in the plugin's activity or via
  `enableOnBackInvokedCallback` plus a JS bridge event the frontend
  answers.
- **`libc++_shared.so` must be in the APK.** `src-tauri/build.rs` now
  links it on Android (landed on `mobile` from the spike); the Tauri
  CLI copies the NDK's copy into `jniLibs/` once the `.so` declares it.
  Verify it is present in your builds and say so.
- **A debug APK is 264 MB and meaningless**; M05 measures a signed
  release build. Do not spend time on size here.
- `tauri android build` compiles the Rust library twice; budget it.

## Steps

1. Worktree sanity; confirm `src-tauri/gen/android` exists or run
   `npx tauri android init` (needs `ANDROID_HOME`, `NDK_HOME`,
   `JAVA_HOME`; see the README "Owner's machines").
2. Plugin skeleton, registered under `#[cfg(mobile)]`; `cargo check`
   for Android still clean; desktop build untouched.
3. Foreground service + notification; `set_background_audio(true)` on
   play, `(false)` on stop, called from the frontend's existing
   play/stop path behind `IS_MOBILE`.
4. Audio focus listener and the `audio_interrupted` event; frontend
   handler.
5. `keep_awake` bound to: playing, zen fullscreen, an active drill.
6. `open_url`.
7. Device-polling gate and engine teardown.
8. Gates on the emulator, then on the phone.

## Acceptance gate

- Emulator: play at 120 BPM, press power (screen off), wait 10 min,
  screen on — still playing, beat count in the UI consistent with
  elapsed time (no dropouts audible in a recording made from the
  emulator's audio out if available; otherwise the callback-gap
  counter from M00's probe shows no gaps > 2× buffer period).
- Phone: same 10-minute test; then place a call to the phone —
  playback pauses on ring, resumes on hang-up; then start music in
  another app — Yames stops (permanent focus loss).
- Screen stays on during a drill with `keep_awake`; turns off normally
  on the settings screen.
- About links open the system browser.
- Desktop gates unchanged and green (`tsc`, `vitest`, `test:rust`);
  the Android `DOCS_RS=1 cargo check --lib` clean; the mobile bundle
  check clean.

## Report

What was done, the plugin's final command list, exact commands and
device model / Android version for every device gate, anything not
verified, open questions for M05. Commit on your branch; do not push;
do not touch `main`.
