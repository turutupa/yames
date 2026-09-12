# Yames Mobile — Implementation Plan

> **Status:** Active. Written 2026-09-11 from a code evaluation of `main`
> at v1.0.4 (commit 2727948). Supersedes the May 2026 version of this
> file, which predated the coach, voice, mic evaluation, setlists and
> MIDI work and estimated the whole port at 2–3 weeks. That estimate is
> void; see §7.
> **Owner decision (2026-09-11):** *the smart coach is completely gone on
> mobile.* Not greyed out, not "coming later" in the UI — not compiled,
> not bundled, not rendered. Everything else the desktop app does
> (metronome, zen mode, drills, setlists, presets, themes, languages)
> ships.
> **Audience:** the owner and the coding agents that implement it. Task
> briefs live in `plans/tasks/mobile/`. Sizes are S / M / L as in
> `ROADMAP.md` (≤1 day, ≤1 week, >1 week of agent-driven work).
> **Status (end of 2026-09-11):** merged into `mobile` and re-verified:
> M01 Rust gates, M02 frontend gates, M03a/b/c/d/e layout and harness,
> M04 Android background audio and direct Oboe stream, M05a release
> prep, M00 findings. Every desktop gate green throughout. Android runs
> on the emulator: exact tempo (120 ticks/60 s), survives 10 min
> screen-off, pauses for a call and resumes, Back behaves. M05 merged:
> signed release build machinery, R8-proven 12.8 MiB arm64 APK, store
> assets, website row. `main` v1.1.0 merged in. M05b in progress:
> system-bar insets (the gesture bar overlapped the tab labels) and
> store shots in the default theme. **Nothing has run on a physical
> phone yet.** Waiting on the owner: the upload keystore
> (`M05-RELEASE-NOTES.md`), the Play developer account and twelve
> testers, the spare phone.
> **Branch policy:** long-lived feature branch `mobile`. Each task gets a
> worktree on `mob/m0N-short-name` and merges into `mobile`; `mobile`
> merges to `main` when Android v1 is releasable. Nothing is committed
> on `main` directly.

---

## 1. Scope

### Ships in mobile v1

| Area | What | Notes |
|---|---|---|
| Metronome ("beat" view) | BPM, subdivision, accents / beat groups, sounds, volume, tap tempo, count-in, free mode | Engine ports as-is (§2) |
| Drills | Speed ramps, drill plan, drill runs history | `save_drill_run` / `get_drill_runs` are plain store commands |
| Setlists | Full setlist mode incl. Save | Pure frontend + store |
| Zen / fullscreen | Fullscreen view with effects | Canvas perf on low-end Android is a risk (§6) |
| Presets | Save, reorder, delete, apply | Sidebar becomes a bottom sheet (§4 M03) |
| Themes, appearance | All themes, reduced motion | CSS variables, unchanged |
| Languages | All 15 locales | i18n unchanged |
| Settings | General, appearance, sound output, about, support | Devices section shrinks to output only |
| Onboarding | Welcome → instrument → sound & look → ready | Coach, input, hands-free and hear-it-work steps are cut |
| What's new | Kept | Trivial |

### Cut on mobile (build-time)

| Cut | Why it cannot or should not ship |
|---|---|
| Coach — LLM and template engine, feed, card, history, session detail, greeting, chips, interventions, brain download, coach settings | Owner decision. Also: Standard tier is Qwen3-4B with a 4 GB RAM floor and Studio is 8B; neither is phone-viable. |
| Mic evaluation — audio input, onset detection (aubio), session accumulator, session logs, timing scoring, calibration cache, drift meter, input level meter, spectrum, last-session card, input test modals | It exists to feed the coach. It also needs mic permission, per-device latency calibration, and it is what links aubio (GPL) into the binary — the one thing that makes an App Store listing legally awkward (§5). |
| Voice / TTS | Piper is a downloaded binary spawned as a subprocess. iOS forbids executing anything; Android forbids executing binaries from app storage. |
| Floating widget, tray icon, always-on-top, saved window position, window controls, drag regions, title bar overlay | Mobile has one fullscreen webview and no window manager. |
| Global shortcuts, hotkeys settings, keybinding modals, shortcuts sheet, gamepad | No OS hotkeys, no keyboard, no gamepad API worth supporting. |
| Updater | Stores update apps. `tauri-plugin-updater` is desktop-only. |
| MIDI (both platforms in v1) | `midir` has no Android backend (it compiles to a dummy). iOS has CoreMIDI and Bluetooth pedals work; that is the first v1.1 item (§4 M07), not v1. |
| Tour, hints, help menu | Written for a desktop layout with hotkeys. Re-evaluate after M03; default is cut. |

"Cut" means three things, all enforced by gates: the Rust code is not
compiled (Cargo feature, §3), the TypeScript is not in the bundle
(build-time constant + lazy imports, §3), and the UI never mentions the
feature (no greyed tiles — the ROADMAP's *honest status* principle, but
stricter: absent, not disabled).

### Non-goals for v1 (decided, do not re-litigate)

- **No coach in any form**, including a "lite" 1.5B model or the
  template coach. Revisit only as a separate plan after v1 ships.
- **No mic evaluation.** Same reason.
- **No PWA / web build instead of native.** iOS Safari suspends audio
  when the screen locks or the tab is backgrounded, and has no Web MIDI.
  A metronome that stops when the phone goes to sleep on a music stand
  is worse than no metronome.
- **No tablet-specific layout.** Phone-first; tablets get whatever the
  ≥ 768 px layout does today, verified but not designed for.
- **No landscape** in v1. Lock to portrait.
- **No Android MIDI, no F-Droid, no Amazon store** in v1.

---

## 2. What the evaluation found (facts the plan rests on)

Verified against the code and the local cargo registry on 2026-09-11.

**Platform support is already there.**
- Tauri 2 (CLI 2.10.1 in `node_modules`) targets iOS and Android;
  `src-tauri/src/lib.rs` already carries
  `#[cfg_attr(mobile, tauri::mobile_entry_point)]`. No `gen/android` or
  `gen/apple` exists yet; `src-tauri/capabilities/default.json` is
  desktop-shaped (two windows, global-shortcut, updater, decorum).
- The per-platform config override pattern already exists
  (`tauri.windows.conf.json`); `tauri.android.conf.json` and
  `tauri.ios.conf.json` follow it.

**The audio engine ports; it does not get rewritten.**
- The May plan assumed a spin-loop engine. Today `engine.rs` renders
  clicks inside the cpal output callback with a sample counter
  (`build_output_stream` at `engine.rs:1771`, "Voice — an active sound
  playing in the audio callback"). That is the pull model mobile needs.
- `cpal 0.15` has a CoreAudio backend for iOS and an Oboe backend
  (AAudio / OpenSL ES) for Android. `audio_thread_priority 0.37`
  supports iOS and Android. `rodio` sits on cpal.
- Still to do on top: iOS `AVAudioSession` category `.playback` and the
  `audio` background mode; Android foreground service so the click
  survives screen-off, plus audio-focus handling; interruption handling
  (calls) on both. That is a small native plugin (§4 M04, M06).
- Open: whether cpal's Oboe backend requests AAudio's low-latency
  performance mode. M00 measures; if callback cadence is poor, the
  fallback is driving the `oboe` crate directly behind
  `cfg(target_os = "android")`.

**The engine's only ties to the evaluation stack are small.**
- `engine.rs` imports `onset::SharedTempoContext` (8 references) and
  `timing::{BeatLog, BeatTick}`. `TempoContext` is three atomics
  (`onset.rs:40`); it moves to its own module so `onset.rs` and the
  aubio dependency can be feature-gated. `timing.rs` is pure Rust and
  stays compiled; only its session-scoring callers go.
- Modules that go behind the feature: `coach.rs`, `models.rs`, `tts.rs`,
  `audio_input.rs`, `onset.rs`, `session.rs`, `session_audio.rs`,
  `session_log.rs`, `calibration_cache.rs`; dependencies `aubio`,
  `llama-cpp-2`, `encoding_rs`, `num_cpus`. `instrument.rs` is pure data
  used by `state.rs` and stays.

**The frontend cut is a gating pass across the tree, not a tab deletion.**
- Views are `beat`, `drill`, `setlist`, `settings`, plus the fullscreen
  overlay. There is no coach tab: the coach is composed into
  `MainWindow.tsx` (CoachCard, useCoachDownload, useEvaluation,
  useSession, CoachVoiceToast, useVoicePrompt), `MetronomeView`
  (LastSession, and AccentControl / MeterPresets via `useSession`),
  `SettingsView` (CoachSettingsSection, CoachDownloadStatus,
  AudioInputTestModal, DevicesSettingsSection input half) and the
  onboarding wizard (CoachStep, AudioInputStep, HearItWorkStep,
  HandsFreeStep, coachRecommendation).
- `src/coach/` (≈20 modules), `src/containers/practice-coach/`,
  `src/hooks/useSession.ts` (2 398 lines), `useEvaluation.ts`,
  `useCoachDownload.ts`, `coachLoader.ts` are coach/evaluation-only.
- Window APIs are used in 8 non-test files: `WindowControls`,
  `FloatingWidget`, `useFullscreenLifecycle`, `MainWindow`,
  `FullscreenView`, `useActionDispatcher`, `useDrag`, `ipc.ts`.
- `src/ipc.ts` wraps 87 Tauri commands; roughly a third are coach,
  evaluation, TTS, MIDI or window commands.

**The layout is close, not done.**
- Desktop window: 800×900, minimum 480×780, single column. Phones are
  360–430 px wide. 16k lines of CSS carry 44 media queries (mostly
  `max-width: 560px` and `prefers-reduced-motion`), 214 `:hover` rules,
  and 24 files with `keydown` handlers.
- Missing: `env(safe-area-inset-*)`, 44 px touch targets, `@media
  (hover: hover)` around hover styling, a bottom-sheet replacement for
  the preset sidebar, and a phone pass over the onboarding wizard and
  settings, the two largest CSS files.

**Distribution facts.**
- iOS: the App Store is the only public path. TestFlight builds expire
  after 90 days. The owner already pays for the Apple Developer Program
  (the release config signs with a Developer ID identity), so there is
  no new cost. iOS builds need Xcode; CI's macOS runners can build and
  upload to App Store Connect.
- Android: a signed APK on GitHub Releases works today for anyone who
  enables "install unknown apps", and Google Play costs a one-time 25 USD.
  New personal Play accounts must run a closed test with at least 12
  testers opted in for 14 continuous days before production access is
  granted. Play requires a privacy-policy URL for every app.
- Licensing: Yames is GPL-3. With aubio out of the mobile binary the
  remaining GPL code is the owner's own plus one external contribution,
  the i18n system from PR #8 (2026-09-02). Putting GPL code on the App
  Store needs an explicit "App Store exception" from every copyright
  holder; the owner can grant it for their code and should ask the
  PR #8 author for a one-line consent. Without aubio, nobody else can
  object.

**Test devices.**
- The owner is swapping phones and keeps the old one as the Android
  test device. Until it is free, the Android emulator (Windows) and the
  iOS Simulator (Mac) carry all build, gating and layout work; only the
  audio measurement (M00 step 6), the screen-off / interruption gates
  (M04) and WebView performance on the zen effects need real hardware.
  If the test phone runs a full-tunnel VPN, `adb reverse tcp:1420
  tcp:1420` over USB replaces Wi-Fi for `tauri android dev`. iOS needs
  an iPhone from M06 on.
- Android development runs on the owner's Windows machine (Android
  Studio + SDK + NDK). iOS development needs the Mac.

---

## 3. Architecture of the cut

### Rust

1. **Target-conditional dependencies, not a Cargo feature** (settled
   by M01, 2026-09-11). The first draft of this plan wanted a
   `practice-coach` feature turned off with `--no-default-features`;
   the Tauri CLI 2.10 has no such flag on any subcommand, so a phone
   build could never have turned it off. Instead the coach, evaluation,
   voice, MIDI and window-manager dependencies live in a
   `[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]`
   block and their modules are `#[cfg(desktop)]`. Cargo never evaluates
   that block for a phone target, so no flag exists to forget. Desktop
   builds, features and `Cargo.lock` are unchanged.
2. **`#[cfg(desktop)]`** (tauri-build defines `desktop` / `mobile`) on:
   tray, `tauri-plugin-global-shortcut`, `tauri-plugin-updater`,
   `tauri-plugin-decorum`, `tauri-plugin-process`, the `floating`
   window, the window commands, `save_window_position`, the `Moved`
   handler, and the `WindowEvent` teardown. Every command stays
   registered on every platform (`generate_handler!` cannot cfg
   entries); the desktop-only bodies are answered by
   `src-tauri/src/commands/mobile.rs` with an error or a no-op. The
   `macos-private-api` / `tray-icon` Tauri features **stay on the base
   `tauri` dependency**: tauri-build's allowlist check only reads
   `[dependencies]`, so splitting `tauri` breaks every desktop build;
   both features are inert off their platform.
3. **MIDI is out of the Android graph entirely.** midir 0.10 has no
   Android backend arm at all, not even a dummy, so it cannot compile
   there. It lives in the desktop block with `src/midi.rs`. Its iOS
   CoreMIDI arm is intact; M07 widens the cfg to
   `not(target_os = "android")`.
   Three types moved out of desktop-only modules so the engine and the
   drills work without them: `TempoContext` → `tempo_context.rs`,
   `BeatLog` / `BeatTick` → `beat_log.rs`, `DrillRun` → `drill.rs`.
   The Android type-check needs no NDK when run as
   `DOCS_RS=1 cargo check --lib --target aarch64-linux-android`
   (`oboe-sys`, cpal's Android backend, skips its C++ build under that
   variable); a real `tauri android build` needs `NDK_HOME`. The four
   DSP dev-tool bins under `src/bin` do not build for a phone; M04
   gates them if `tauri android build` turns out to compile bins.
4. **`src-tauri/src/mobile/`** — a small in-tree Tauri mobile plugin
   with a Kotlin and a Swift side: `keep_awake(bool)`,
   `set_background_audio(bool)` (Android: start/stop a foreground
   service with a media notification; iOS: AVAudioSession activate /
   deactivate), and an `audio_interrupted` event the engine listens to.
5. **Config:** `tauri.android.conf.json` and `tauri.ios.conf.json`
   override `app.windows` to a single `main` window with no
   `?window=` query, and drop the desktop plugins. A
   `capabilities/mobile.json` scoped to `"platforms": ["android", "iOS"]`
   grants only `core:default`, event, and store permissions.

### Frontend

1. **`src/platform.ts`** exports `IS_MOBILE`, backed by a Vite
   `define` of `__YAMES_MOBILE__` from the `YAMES_MOBILE=1` environment
   variable (the `tauri android|ios` scripts set it). Build-time, so
   dead branches tree-shake; tests flip it with `vi.stubGlobal`.
2. **Coach-only and desktop-only subtrees load through `React.lazy`
   behind `if (!IS_MOBILE)`**, so the mobile bundle contains none of
   `src/coach/`, `practice-coach/`, `floating-widget/`, `WindowControls`,
   `TitleBar`, hotkeys UI, or the cut onboarding steps.
3. **`src/ipc.ts` splits:** `ipc.ts` keeps the commands both platforms
   have; `ipc.desktop.ts` holds coach, evaluation, TTS, MIDI, window and
   updater calls and is imported only from desktop-only modules. A test
   asserts nothing under the mobile import graph reaches
   `ipc.desktop.ts`.
4. **`useSession.ts`** is the hard part: `MetronomeView`,
   `AccentControl`, `MeterPresets`, `FullscreenView` and
   `useActionDispatcher` read it. The metronome-state slice it carries
   for those callers is extracted into a coach-free hook; the
   evaluation / coach slice stays desktop-only.
5. **CSS:** `src/styles/mobile.css`, loaded only when `IS_MOBILE`, with
   safe-area padding, touch targets and the sheet layouts; hover rules
   across the existing files get wrapped in `@media (hover: hover)`.
6. **Entry:** `App.tsx` drops the `floating` branch on mobile;
   `index.html` gets `viewport-fit=cover`.

### Gates that prove the cut

- `DOCS_RS=1 cargo check --lib --target aarch64-linux-android` on any
  host and `cargo check --lib --target aarch64-apple-ios` on the Mac
  pass; `cargo tree --target aarch64-linux-android` shows none of
  aubio, llama-cpp-2, midir, global-shortcut, updater, decorum;
  `cargo build` (defaults) and `npm run test:rust` on desktop stay
  green.
- `YAMES_MOBILE=1 npm run build`, then `scripts/check-mobile-bundle.mjs`
  fails if `dist/` contains any of: `coachBrainTier`, `piper`,
  `start_evaluation`, `tts_speak`, `show_floating`, `globalShortcut`.
- Vitest composition tests render `MainWindow`, `MetronomeView`,
  `SettingsView` and `OnboardingWizard` with `IS_MOBILE` both ways.
- The click-jitter probe (or its callback-gap subset) runs on a real
  Android device; the number goes in the task report.
- The desktop manual checklist (`plans/MANUAL_TEST_CHECKLIST.md`) still
  passes on a desktop build from the `mobile` branch before it merges.

---

## 4. Phases and tasks

```
M00 Android spike (throwaway)  ─►  M01 Rust gates  ─►  M02 frontend gates  ─►  M03 responsive pass
                                                            │                          │
                                                            └─►  M04 Android native plugin  ─►  M05 Android release
                                                                                                        │
                                                                                            M06 iOS  ─►  M07 iOS MIDI (v1.1)
```

Full briefs: `plans/tasks/mobile/`. Summary:

| # | Task | Size | Deliverable | Gate |
|---|---|---|---|---|
| M00 | Android spike | M | `tauri android init` scaffold, app booting on a real device with whatever crude gates it takes, callback-cadence measurement, `M00-FINDINGS.md` | Findings file merged; spike branch discarded |
| M01 | Rust: `practice-coach` feature + `cfg(desktop)` + `TempoContext` extraction | M | Desktop unchanged; mobile targets `cargo check` clean | The three cargo gates in §3 |
| M02 | Frontend: `IS_MOBILE`, lazy subtrees, `ipc.desktop.ts`, `useSession` split | L | Mobile bundle free of coach / desktop code | Bundle check script + composition tests |
| M03 | Responsive & touch pass | L | Beat, drill, setlist, settings, presets sheet, trimmed onboarding, zen at 360 / 390 / 430 px | Screenshots at three widths, hover-audit script, manual pass on device |
| M04 | Android native plugin | M | Foreground service + notification, audio focus, wake lock, interruption event | Click keeps time for 10 min screen-off; survives an incoming call |
| M05 | Android release | M | Signing keystore in CI, `release.yml` android job (APK + AAB), APK on Releases, Play listing, privacy policy page, website download section | Closed test running with ≥ 12 testers; APK installs from Releases |
| M06 | iOS | L | `tauri ios init`, AVAudioSession plugin half, background mode, TestFlight from CI, App Store listing, GPL exception text + PR #8 consent | Build on TestFlight; review submitted |
| M07 | iOS Bluetooth MIDI (v1.1) | M | midir CoreMIDI path enabled on iOS, footswitch bindings UI | Pedal starts / stops the click on device |

M00 is not optional and is not to be skipped to "save a week": every
estimate below assumes cpal's Oboe backend gives a stable callback on a
mid-range phone. If it does not, M04 grows by a direct-Oboe engine
backend and the total moves by two to three weeks.

---

## 5. Distribution

| | Android | iOS |
|---|---|---|
| Public path | GitHub Releases APK **and** Google Play | App Store only |
| Cost | 25 USD once | Already paid (Developer Program) |
| Gate before public | Play closed test: ≥ 12 testers, 14 days | App Review (days) |
| Signing | Upload keystore, stored as CI secret | Distribution certificate + provisioning, App Store Connect API key in CI |
| Updates | Play auto-updates; Releases users re-download | App Store |
| Privacy | Privacy-policy URL required by Play; app collects nothing, page says so | Same page; "Data not collected" in App Privacy |
| Licensing | None beyond GPL notice in About | App Store exception added to `LICENSE` notice for owner's code; consent from PR #8 author |
| Build host | Windows (Android Studio, NDK) or Linux CI | macOS only (Xcode); CI `macos-latest` |
| Test device | Dedicated Android phone, no VPN | iPhone |

Order: Android ships first because both its paths are under the owner's
control and the test device is cheap. iOS follows once M05 is out and
the exception text is settled.

**Why the "a lot of downloads" expectation needs tempering.** Mobile
metronomes are a saturated store category with several apps above a
million installs. Yames' desktop differentiators — footswitch control,
the always-on-top widget, the local coach — are exactly the things that
do not ship on mobile. What stands out on a phone is drills and
setlists. Store discoverability, not the build, will decide the
download count; M05 and M06 include listing copy and screenshots for
that reason.

---

## 6. Risks and open questions

| Risk | Where it bites | Mitigation |
|---|---|---|
| cpal's Oboe backend does not request low-latency mode | M00 → M04 | **Confirmed by M00 (2026-09-11):** cpal 0.15.3 sets neither performance nor sharing mode and opens 44.1 kHz on a 48 kHz device. Tempo is exact (120 ticks / 60 s, 0.055 % drift); latency is not. M04 drives the `oboe` crate directly for the output stream. |
| `oboe-sys` never links the C++ runtime; app dies at `System.loadLibrary` | M00 | Fixed on `mobile`: `build.rs` links `c++_shared` on Android |
| System Back gesture kills the process mid-click | M00 → M04 | Back closes a sheet or backgrounds the app; foreground service keeps the click |
| Android kills or throttles the process with the screen off | M04 | Foreground service with media notification; test 10 min screen-off |
| Android System WebView / WKWebView differences (canvas zen effects, `backdrop-filter`, audio autoplay policies do not apply since audio is native) | M03 | Test on a low-end device; reduced-effects fallback already exists via reduced motion |
| aubio-sys / bindgen against the Android NDK toolchain | M00, M01 | Not needed once `practice-coach` is off; M00 may stub it |
| `scripts/tauri.mjs` injects `--features coach-llm-*` | M00, M01 | `YAMES_DEV_NO_LLM=1`; M01 teaches the wrapper about mobile targets |
| `useSession` split regresses desktop metronome state | M02 | Existing vitest suites for MetronomeView / AccentControl / MeterPresets are the gate |
| Versioning: one `version` across five platforms | M05 | Same string everywhere; `release.yml` `release` commit-message trigger unchanged |
| Play closed test needs 12 human testers for 14 days | M05 | Start recruiting the day M05 starts, not when it ends |
| GPL + App Store | M06 | Exception clause + PR #8 consent; aubio already out |
| No physical device until the phone swap | M00 step 6, M04 gates | Everything else runs on the emulator; the two device-only checks wait, they do not block M01–M03 |

Open questions to answer before the phase that needs them:

1. **M03:** does the preset sidebar become a bottom sheet or a separate
   route? Recommendation: bottom sheet, because presets are applied
   mid-practice and a route change loses the beat view.
2. **M03:** keep the tour and hints on mobile? Recommendation: cut in
   v1; the trimmed onboarding is enough.
3. **M04:** haptic pulse on the beat? Cheap on both platforms; ship it
   off by default. Not a v1 blocker.
4. **M05:** package name stays `com.yames.metronome`? Yes unless the
   owner objects; it is what the desktop identifier is.
5. **M06:** App Store exception wording — use the standard one the FSF
   documents for GPL projects and add it to `LICENSE` and `About`.

---

## 7. Effort

Agent-driven work, with the owner testing on a device at the end of
each task. Excludes waiting on Play's 14-day test and App Review.

| Task | Effort |
|---|---|
| M00 Android spike | 1 week |
| M01 Rust gates | 3–5 days |
| M02 Frontend gates | 1–2 weeks |
| M03 Responsive & touch pass | 2 weeks |
| M04 Android native plugin | 1 week |
| M05 Android release plumbing | 1 week |
| **Android v1 total** | **6–8 weeks** |
| M06 iOS | 2 weeks |
| M07 iOS MIDI (v1.1) | 1 week |
| **Both platforms** | **9–11 weeks** |

Ongoing cost after v1: two more targets in the release matrix, each
needing a device pass per release, and store listing maintenance.

---

## 8. Sequencing

1. Install Android Studio, SDK, NDK, an emulator image, and the four
   Android Rust targets on the Windows machine (M00 brief has the
   exact list).
2. Run M00 steps 1–5 and 7 on the emulator now. Step 6 (the audio
   measurement) runs the day the spare phone is free; the findings
   file is written in two passes if needed.
3. Read `M00-FINDINGS.md`. Decide go / no-go on the numbers. M01 and
   M02 may start on the emulator-only findings; the go/no-go on the
   audio path can arrive while they run, since they change nothing
   about the engine.
4. M01 → M02 → M03 in sequence (each depends on the previous). M04 can
   start in parallel with M03 once M01 is merged.
5. M05 as soon as M03 and M04 are merged; recruit the 12 testers on
   day one of M05.
6. Merge `mobile` to `main` when the Android build passes the desktop
   manual checklist on desktop and the M04 gates on device.
7. M06, then M07.
