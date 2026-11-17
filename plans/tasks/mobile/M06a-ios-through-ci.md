# M06a — iOS, built and booted by CI, with nobody at a Mac

Size: L. Branch: `mob/m06-ios`, from the tip of `mobile`. Written
2026-09-20. Replaces steps 1–3 of `M06-ios.md` (read that first, every
"Decisions already made" line in it still holds); steps 4–7 of that
brief (device gates, signing, TestFlight, the listing) are M06b and wait
for the owner's secrets and iPhone.

## Why this shape

The owner said on 2026-09-20 that the Mac will not be around much
longer. So iOS must not depend on it. GitHub's `macos-latest` runners
have Xcode; the repo is public, so their minutes are free. **The Mac in
this task is CI.** You work on Windows, push your branch, read the run,
fix, push again. It is slow per turn (10–25 min), so make every push
count: batch changes, read the whole log, never push to "see what
happens" twice for the same error.

## The one exception to "workers never push"

You may `git push origin mob/m06-ios` — that branch and no other. Never
`mobile`, never `main`, never a tag, never `--force` onto anything but
your own branch. The owner authorised pushing mobile work on 2026-09-20.

## Deliverables

1. **`.github/workflows/ios.yml`**, triggered `on: push: branches:
   [mob/m06-ios]` and `workflow_dispatch` (dispatch only works once the
   file is on the default branch; the push trigger is what you use now,
   and the report says to drop it when `mobile` reaches `main`). It does
   not touch `release.yml`, `ci.yml`, `android.yml`, `pages.yml`,
   `snap.yml`. Concurrency-cancel superseded runs. Cache cargo and npm.
2. **`src-tauri/gen/apple`** committed as generated. It is generated on
   the runner (`npm run tauri ios init` — `scripts/tauri.mjs` sets
   `YAMES_MOBILE=1`), uploaded as a workflow artifact, downloaded by you
   (`gh run download`) and committed. After that the workflow builds
   from the committed project and fails if `ios init` would change it.
   Bundle id `com.yames.metronome`, portrait only, iOS 15+, display name
   Yames, the app icon from the existing icon set.
3. **`cargo check --lib --target aarch64-apple-ios` and
   `aarch64-apple-ios-sim` clean** on the runner. M01 made the
   desktop-only dependencies target-conditional; `midir`'s iOS arm must
   stay OUT of v1 (M07 owns it). Whatever Android got by `cfg(target_os
   = "android")` that iOS also needs gets `cfg(mobile)` or its own iOS
   arm — read M04's Rust changes before deciding which. iOS keeps cpal's
   CoreAudio backend (the M06 brief says why); do not port the Oboe arm.
4. **The Swift half of the `yames-mobile` plugin**
   (`src-tauri/plugins/yames-mobile/ios/`), same command surface as the
   Kotlin half in `android/` — read it and `M04-FINDINGS.md` "The
   plugin's surface" first:
   - `set_background_audio`: `AVAudioSession` `.playback` / `.default`,
     `setPreferredSampleRate(48000)`,
     `setPreferredIOBufferDuration(0.005)`, activated when playing
     starts and deactivated when it stops; configured **before** the
     cpal stream opens.
   - `AVAudioSession.interruptionNotification` and
     `routeChangeNotification` (headphones pulled = pause, like every
     music app) → the same `audio_interrupted` event and channel the
     frontend already handles. No new frontend handler.
   - `keep_awake` → `isIdleTimerDisabled`; `open_url` →
     `UIApplication.shared.open`, http/https only, same as Android.
   - `set_back_intercept` is a no-op on iOS (there is no Back); it must
     exist and succeed so the shared frontend code does not branch.
   - Safe-area insets: M05b had to push Android's insets from Kotlin
     because its WebView's `env()` lies. WKWebView's `env(safe-area-
     inset-*)` is honest — **verify that in the simulator shots**
     (notch and home indicator on an iPhone 15) rather than assuming,
     and only push insets from Swift if the shots show overlap.
   - `Info.plist`: `UIBackgroundModes: audio`. No
     `NSMicrophoneUsageDescription`, no camera, no Bluetooth, no local
     network string — and a CI step that greps the built app's
     Info.plist and fails if any of those keys appears. The app asks a
     phone for nothing.
5. **A simulator build that boots, in CI:** `tauri ios build` (or
   `xcodebuild`) for `aarch64-apple-ios-sim`, `xcrun simctl boot` an
   iPhone 15, install, launch, wait, `xcrun simctl io booted screenshot`
   → uploaded artifact. Then as much of M00's checklist as a headless
   simulator allows: the app reaches the metronome screen (not a white
   WebView, not the desktop onboarding), a second launch keeps a changed
   setting. Driving the UI on a CI simulator is hard; a deep-link, a
   launch argument or an env var that the *mobile debug build only*
   reads to open a given tab is acceptable if it is compiled out of
   release builds — say exactly what you added. Screenshots committed
   under `plans/tasks/mobile/m06/`: metronome, drill, setlist, settings,
   zen, in the default theme.
6. **An unsigned-but-real device build compiles**: `aarch64-apple-ios`
   archive with `CODE_SIGNING_ALLOWED=NO`, so M06b's only unknown is the
   signing itself. Report the app size.
7. **`plans/tasks/mobile/M06a-FINDINGS.md`** and
   **`plans/tasks/mobile/M06b-OWNER-STEPS.md`**: the second one is for a
   musician who owns an Apple Developer account and is about to lose
   his Mac — exactly what to click in App Store Connect and the
   developer portal (register the bundle id, create the app record,
   create an App Store Connect API key with the role signing needs),
   which three or four secrets to paste into GitHub and under what
   names, and **which of those steps need a Mac and which need only a
   browser**. Research this against current Apple and Tauri docs
   (`https://v2.tauri.app/distribute/app-store/`), do not write it from
   memory: if a distribution certificate can be created without Keychain
   (a CSR from `openssl`, or Xcode cloud-managed signing driven by the
   API key with `-allowProvisioningUpdates`), say which path you
   recommend and why. The private key never passes through a worker.

## What you must not collide with

M08 is merging `main` (v1.2.1, Jam) into `mobile` at the same time and
is rewriting conflict regions of `src-tauri/Cargo.toml`,
`src-tauri/src/engine.rs`, `commands.rs`, `lib.rs`, `src/ipc.ts`,
`MainWindow.tsx` and the settings views. **Stay out of those files as
far as you can.** New files and new `cfg` arms in their own modules
merge cleanly; edits inside `engine.rs` do not. Where you must touch
one, make it a few lines and list them in the report so the
orchestrator can replay them after M08.

## Local gates (Windows)

iOS cannot be checked here (no `xcrun`). What can: `npm run build`,
`npm run test`, `YAMES_MOBILE=1 npm run build && node
scripts/check-mobile-bundle.mjs`, and the Android type-check so the
shared plugin crate still compiles for the other phone:
`DOCS_RS=1 cargo check --manifest-path src-tauri/Cargo.toml --lib
--target aarch64-linux-android` with `CARGO_TARGET_DIR='C:\yt-m06'`
(`rustup override set stable-x86_64-pc-windows-msvc` in the worktree
first). Do **not** run the full Rust test suite or any Android build —
M08 owns the emulator and two other workers are loading the machine.

## Rules

Explicit `git add <paths>`; `git add -A` / `git add .` are banned.
Never start the desktop app, `tauri dev` or `tauri android dev`.
Surgical edits; CRLF files stay CRLF; helper scripts go in a file, not
a heredoc. Commit messages say what changed for the person using the
app and end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
Nothing the user reads says Swift, Xcode, WebView or Rust.

## Report

What runs green in CI (link the run), what each screenshot shows, the
lines you touched in M08's files, app size, what only an iPhone can
prove, and the owner's steps file. Never "done" for a gate you did not
see pass.
