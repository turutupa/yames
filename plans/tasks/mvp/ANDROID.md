# MVP on Android (M7, 2026-11-16)

Read `plans/tasks/mvp/PLAN.md` first. The owner's requirement (2026-11-16):
Windows, macOS and Android are the targets, and every MVP feature works on all
three. On a phone the guitar comes in through the built-in mic, a USB-C
class-compliant interface, or an analog TRRS adapter. Bluetooth input is not a
goal: Android only offers it as 8–16 kHz SCO with 100 ms or more of latency.

Branch `mvp-android` = `revamp` + `origin/mobile` (the Android v1 work: the
Tauri Android project, the direct Oboe output stream, the foreground service,
the phone layout, `android.yml`) + the input path and the learning side on a
phone.

## What works on Android

Built and type-checked here; **nothing below has run on a phone or an
emulator from this branch yet** (see "Verified" at the end).

| Area | On a phone |
|---|---|
| First run | Welcome → instrument → **how will I hear you** (mic, USB-C interface or jack adapter, with a level meter; asks for the microphone at this moment) → hear it work → sound & look → ready. Lands on Today. |
| Today | Time choice, the plan and its reasons, Start. |
| Session | The Take screen with the Neck / Runway switch (one picture at a time during a Take), graded from the guitar by the same onset detector, timing analyzer and scorer as a desktop: aubio, `onset.rs`, `timing.rs`, `score/` are all compiled for Android. Results, Find my edge, the recap. |
| Paths, Progress | As on a desktop, in portrait. |
| Tools | Metronome, Drill, Setlist, Jam, Songs, behind the Tools tab (the rail's Tools group). The library is a bottom sheet; Zen is on the tab bar while a tool is open. |
| Settings | General, Appearance, **Devices (the audio input only)**, Support, About. |
| Send feedback | Help menu is desktop-only; Settings › Support carries it on a phone. |
| The click | The mobile branch's direct Oboe output (low latency, the device's own rate), a `mediaPlayback` foreground service so it survives screen-off, audio focus for calls, Back closes a sheet or backgrounds the app. The screen is kept awake while the click runs, which also keeps a Take in the foreground (see Microphone, below). |
| Phone layout | Bottom tab bar (Today, Paths, Progress, Tools, Settings), safe-area insets from Kotlin, 44 px touch targets on the learning screens and the first run (`tests/layout/phone-learning.spec.ts`). |

## What is cut, and why

| Cut | Why |
|---|---|
| The coach's **model** (LLM brain tiers, download) | llama.cpp on a phone: 4–8 GB models, not phone-viable (mobile plan §1). The coach's template text, which the Session uses, is in. |
| Voice (Piper) | A downloaded binary spawned as a subprocess; Android forbids executing binaries from app storage. |
| MIDI and footswitches, hotkeys, gamepad | midir has no Android backend. A phone compiles a no-device stand-in (`src-tauri/src/midi_android.rs`), so no call site needs a cfg. |
| Tray, floating widget, always-on-top, window placement, updater, single instance | One fullscreen webview; the store (or the next APK) updates the app. The commands answer from `src-tauri/src/commands/mobile.rs`. |
| The tour, hints, help menu | Written for a desktop layout with hotkeys. |
| Jam **takes** (recording yourself over the band, with the camera) | A tool feature, not needed by the learning side, untried on a phone; hidden rather than shipped broken. The band itself plays. |
| A custom kit folder | No folder to point at on a phone. |
| The audio **output** picker | Android routes output itself; the Oboe stream ignores a device name. |
| Metronome's drift needle and "last session" card | The tools' coach overlay (mobile v1 cut it); the learning side grades without it. |
| Landscape | Portrait only, as in mobile v1. |
| Instrument and jam-cue settings in Settings | They live in the coach section, which is desktop-only; the instrument is set in the first run (Settings › General › Run setup again). |

## The input path (for the reviewer)

`src-tauri/src/android_input.rs`, a child module of `audio_input` so it fills
the same private ring, take ring, recording buffer and level snapshots; the
desktop's cpal path is untouched (two `cfg(android)` early returns).

- **Devices.** `AudioDeviceInfo::request(Input)` through Oboe's Java interface.
  Offered: built-in mics, USB devices/headsets/accessories, the headset jack
  (`WiredHeadset` — what an iRig 2-style TRRS adapter shows up as), analog and
  digital line in. Not offered: Bluetooth SCO, telephony, FM, remote submix.
  Names are "product (kind)", numbered when two built-in mics share a product
  name; opened by id. "Default" is the one Android routes to first (USB, then
  the jack, then line, then the phone's mic); "System default" lets Android
  choose.
- **The stream.** `PerformanceMode::LowLatency`, `SharingMode::Exclusive`
  (AAudio downgrades rather than refuses), `InputPreset::Unprocessed` (no AGC,
  no noise suppression — those flatten pick attacks), falling back to
  `VoiceRecognition` (the CDD requires it to be unprocessed too) if a device
  will not open Unprocessed. The device's own rate. Mono, or stereo when the
  player picked channel 2 of a two-channel interface. What was granted is
  logged: `[yames][android] oboe input: … got <perf>/<sharing>/<preset>`.
- **Permission.** RECORD_AUDIO in the manifest; asked by `request_microphone`
  (yames-mobile plugin) from `startEvaluation` in `src/ipc.ts`, so the first-run
  input step, a Session and Settings' Test all ask at the moment the input
  opens, never at launch. Refused, it rejects with where to allow it, and the
  input step shows Android's settings path.
- **Real-time.** The callback mixes into a scratch buffer allocated when the
  stream opens (no `Vec` per buffer, unlike the desktop callback); every shared
  slot is a `try_lock` that drops on contention, as on a desktop. The input
  tester's recording buffer and the once-a-second level snapshot still grow a
  `Vec`, exactly as the desktop callback does.
- **Route changes** (from the review). AAudio closes a fast-path stream when
  the route under it changes (headphones, a USB interface or jack adapter,
  Bluetooth). Both Oboe error callbacks only raise a flag and unpark
  `android_route.rs`'s thread: it reopens the output through the engine's own
  device-switch path, and tells the frontend the input was lost;
  `src/mobile/inputRoute.ts` restarts the evaluation on the same device if it
  is still there, or on the one Android routes to now, and shows "The input
  changed. Listening through … now." The Kotlin plugin registers an
  `AudioDeviceCallback`, so a device plugged in refreshes the input picker
  (`refresh_audio_devices`) without anything being reopened. **Not run on a
  device.**
- **Right notes.** The right-notes capture (`take_audio.rs`) is fed by the
  onset detector's thread from the ring this callback fills, so it needs
  nothing of its own on a phone; `ring_drops` (the input-drop counter) is
  counted here as in the cpal callback.
- **Background.** No `FOREGROUND_SERVICE_MICROPHONE`. Android 11+ silences the
  mic for a backgrounded app unless a microphone-type foreground service was
  started in the foreground; the screen is kept on while the click runs, so a
  Take is recorded in the foreground. If the player turns the screen off
  mid-Take, the input goes silent and the Take says "I didn't catch enough".

### Input options, verified vs not

| Input | How it shows up | Verified |
|---|---|---|
| Built-in mic | "<phone> (built-in mic)" | Code path built and linked for aarch64; **not run** |
| USB-C class-compliant interface (iRig HD 2, Focusrite Scarlett via a USB-C OTG adapter, amps with USB audio such as Boss Katana / Fender Mustang) | "<product> (USB)" | **Not run.** Class-compliant USB audio is supported by Android since 5.0; a Scarlett may need a powered hub on phones that limit OTG current. |
| Analog TRRS adapter (iRig 2 and similar) | "<product> (headset jack)" — on USB-C-only phones, through a USB-C to 3.5 mm dongle, which then shows up as USB | **Not run** |
| Bluetooth | not listed | — (not a goal) |

Latency is not yet measured on any device. The timing analyzer's per-device
calibration (the first run's "hear it work") applies as on a desktop.

## Installing a test APK on a phone

1. A push to `mvp-android` builds it (or, once `android.yml` is on `main`,
   **Actions › Android (signed release) › Run workflow** with an empty tag).
   The APK is signed with the repository's **test key** (the `ANDROID_*`
   secrets, alias `yames-test`), so every tester build has the same signature
   and installs over the previous one. It is the workflow artifact
   `yames-android-<version>-<commit>`; nothing goes to Releases. Publishing a
   tag also needs the repository variable `ANDROID_KEY_IS_RELEASE=true`, set
   only once the secrets hold the real upload key. In a fork without the
   secrets, the APK is signed with a key made in the run
   (`*-test-signed.apk`): it installs, but not over another build.
2. Download the artifact zip on a computer and unzip it, or open the run on
   the phone and download it there.
3. On the phone, open the `.apk` (Files › Downloads). Android asks to allow
   installing from that app ("Install unknown apps" for Chrome or Files): allow
   it, go back, Install. Play Protect may warn about an unknown developer:
   "More details › Install anyway".
4. A new build installs over the old one and keeps its progress, as long as
   the version in `package.json` has not gone down (the versionCode comes
   from it). A fork's run-key build cannot: uninstall first, and the
   progress goes with the app's data.
5. First launch: the first run asks for the microphone at the input step, and
   for notifications the first time the click plays (the row in the shade that
   keeps the click alive with the screen off).

For a developer: `adb install -r <apk>`; `adb logcat | grep -i yames` shows
the granted output and input modes.

## Building and checking locally

The Android SDK/NDK has no official linux-arm64 host. On this aarch64 box the
crate is cross-compiled with the system clang/lld 18 against the NDK r26b
sysroot (target files only, taken from the x86_64 NDK zip):

```sh
source ~/android-ndk-dl/env.sh   # wrappers: aarch64-linux-android24-clang(++)
export CFLAGS_aarch64_linux_android='-std=gnu11 -Wno-implicit-function-declaration'
cargo check --manifest-path src-tauri/Cargo.toml --lib --target aarch64-linux-android
cargo build --manifest-path src-tauri/Cargo.toml --lib --target aarch64-linux-android
```

Both pass: aubio (C, bindgen), oboe (C++), SQLite and the whole crate build
and link into `libyames_lib.so` (NEEDED: libc++_shared, libandroid, liblog,
libOpenSLES). Gradle, the Kotlin plugin and the APK are built only in CI.
`YAMES_MOBILE=1 npm run build` + `node scripts/check-mobile-bundle.mjs` check
the phone bundle; `npx playwright test tests/layout/phone-*.spec.ts` measures
it.

## Verified

- Desktop: unchanged gates (see the merge commit and the report).
- Android: the Rust crate checks and links for `aarch64-linux-android`; the
  phone bundle builds and passes the bundle check; the phone layout suite
  passes at 360 and 412 px.
- **Not verified:** the Kotlin (`requestMicrophone`) and gradle build (CI
  only), anything on a device or emulator: the permission prompt, device
  listing, the granted AAudio modes, input latency, grading accuracy from a
  phone mic, USB and TRRS interfaces, WebGL2 of the neck on a real GPU (the
  stage's software-renderer guard is unchanged).

## Next

1. Push `mvp-android` (that triggers `android.yml`: `workflow_dispatch` only works once the file is on `main`); fix what gradle and Kotlin say.
2. On a phone (owner's spare): first run with the built-in mic, then a USB-C
   interface; a Session graded; `logcat` for the granted modes; the click
   jitter with the input open.
3. Decide `FOREGROUND_SERVICE_MICROPHONE` (Play policy asks for a declaration)
   only if screen-off Takes turn out to matter.
