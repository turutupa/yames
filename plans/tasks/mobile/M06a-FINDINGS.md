# M06a findings — 2026-09-20, the iPhone build, made by a machine nobody owns

> **Device status: there is no iPhone, and there is no longer a Mac.** The
> owner said on 2026-09-20 that the Mac is going away, so this task was done
> the only way that survives that: every Xcode command in it ran on a GitHub
> `macos-latest` runner, driven from Windows by pushing a branch. Nothing
> here was built, signed or looked at on a machine anyone owns.
>
> What that buys and what it does not is the last section.

---

## What M06a produced

| | |
|---|---|
| `.github/workflows/ios.yml` | Generates, type-checks, compiles, boots and photographs the app. Triggered on push to `mob/m06-ios` and by hand. |
| `src-tauri/gen/apple` | The Xcode project, generated on the runner and committed, with the Yames icon, `com.yames.metronome`, portrait, iOS 15. |
| `src-tauri/plugins/yames-mobile/ios/` | The Swift half of the plugin: the audio session, the interruptions, the idle timer, the links. |
| `src-tauri/ios-project.yml` | The Xcode project as a template: portrait, background audio, manual signing with no identity, and the one Xcode 26 workaround the app cannot link without. |
| `src-tauri/Info.ios.plist` | The same two keys through Tauri's own plist merge — and, the interesting half, nothing else. |
| Screenshots | `plans/tasks/mobile/m06/` |
| `M06b-OWNER-STEPS.md` | Everything the owner has to do, and which of it needs a Mac (none of it). |

---

## The Swift half

`src-tauri/plugins/yames-mobile/ios/Sources/YamesMobilePlugin.swift`, against
the same five commands and the same `audio_interrupted` event the Kotlin half
answers, so `src/mobile/native.ts` and `useAndroidNative.ts` are shared
unchanged and no frontend code asks which phone it is on.

| Command | Android | iPhone |
|---|---|---|
| `set_background_audio` | start/stop a `mediaPlayback` foreground service and take audio focus | activate/deactivate `AVAudioSession` |
| `keep_awake` | `FLAG_KEEP_SCREEN_ON` | `isIdleTimerDisabled` |
| `open_url` | `Intent.ACTION_VIEW`, http/https only | `UIApplication.open`, http/https only |
| `set_back_intercept` | whether Back should close a layer | **nothing.** There is no Back on iOS. It exists so the shared code does not branch. |
| `set_event_channel` | one channel for every event | the same |

Three things are worth writing down because they are decisions, not
transcription.

**The notification text has nowhere to go.** Android's
`set_background_audio` carries the words for the row in the shade;
iOS has no equivalent that costs nothing. Its nearest thing is the Now Playing
control, and that is not a label — it is a contract to answer play, pause,
next and previous remote commands, which a metronome with one transport
either has to fake or has to leave broken on the lock screen. So the Swift
side decodes the strings and ignores them, and the payload stays one shape for
both phones.

**The session is configured at plugin construction, not on the first play.**
`setPreferredSampleRate(48000)` and `setPreferredIOBufferDuration(0.005)` only
mean anything to an audio unit that has not opened yet, and the engine's cpal
stream is built during Tauri's setup. Activation still happens on play and
deactivation on stop, which is the rule the plan sets — what moves earlier is
the *configuration*, so the stream is opened into a session that already knows
what it wants.

**Three interruption kinds, the same three as Android.** An
`AVAudioSession.interruptionNotification` with `.began` is `focus_lost`;
`.ended` carrying `.shouldResume` is `focus_gained`; `.ended` without it is
neither, and the click stays paused until the user presses play. On top of
that, a `routeChangeNotification` whose reason is `.oldDeviceUnavailable` —
headphones pulled out — is also `focus_lost`, because that is what every music
app does and what a player expects. `focus_lost_permanently` has no iOS
trigger: iOS does not tell an app that another app has taken playback for
good, it just interrupts, so that arm is dead on this platform and the
frontend handles it either way.

## What the app asks a phone for

Nothing.

`src-tauri/Info.ios.plist` adds exactly two keys: `UIBackgroundModes: audio`
and the portrait lock. No `NSMicrophoneUsageDescription` — the mic evaluation
does not ship on a phone — and no camera, Bluetooth, local network, location,
photo library or tracking string.

That is checked rather than claimed. `scripts/ci/ios-check-plist.sh` reads the
**built** app's `Info.plist`, fails if any of fifteen usage-description keys
is present, fails if `UIBackgroundModes` does not contain `audio`, and fails
if any orientation other than portrait is allowed.

---

## How the pictures were taken

Nobody is in front of a CI simulator, so nothing can tap a tab bar.

Three of the five screens need no app code at all: the tab the app was last on
is already persisted (`setActiveTab` / `getActiveTab`, the same store the
settings live in), so writing `activeTab` into `settings.json` between two
launches lands the next one on the metronome, the drill or the setlist.

The settings pane and zen are not tabs and are not persisted. Those two use
two marker values — `debug:settings` and `debug:zen` — read in exactly two
places (`useTabRouting.ts` and `useFullscreenLifecycle.ts`) and only when
`MOBILE_DEBUG_SCREENS` is true. That constant comes from
`__YAMES_MOBILE_DEBUG__`, a Vite define set by nothing except the simulator
job, so in any other build the branches fold away and the marker strings are
not in `dist/` at all.

"Not in `dist/` at all" is also checked rather than claimed:
`scripts/ci/ios-check-no-debug-hooks.sh` greps the bundle that goes into the
device archive and fails if either string survives. The workflow builds the
frontend twice for that reason — once with the hooks for the simulator, once
without them for the archive.

---

## Files M08 also owns

M08 was merging `main` v1.2.1 into `mobile` at the same time. Two of its files
had to move, and both changes are small enough to replay by hand:

**`src-tauri/src/lib.rs`** — one line, the plugin registration:

```rust
-    #[cfg(target_os = "android")]
+    #[cfg(mobile)]
     let builder = builder.plugin(tauri_plugin_yames_mobile::init());
```

(plus the comment above it, which said "Android only until M06 writes the
Swift side").

**`src-tauri/Cargo.toml`** — a new target block, appended after the existing
Android one rather than edited into it, so it merges cleanly:

```toml
[target.'cfg(target_os = "ios")'.dependencies]
tauri-plugin-yames-mobile = { path = "plugins/yames-mobile" }
```

plus two comment lines inside the Android block that said iOS would come
later.

Nothing else of M08's was touched: not `engine.rs`, not `commands.rs`, not
`src/ipc.ts`, not `MainWindow.tsx`, not the settings views. iOS needed no
engine change at all — M01's `cfg(not(target_os = "android"))` already sends
every non-Android platform down the cpal path, and cpal's CoreAudio backend is
the one iOS is supposed to use.

The files outside M08's set that changed are the plugin crate
(`plugins/yames-mobile/{Cargo.toml,build.rs,src/lib.rs,ios/**}`),
`tauri.ios.conf.json`, `Info.ios.plist`, `platform.ts`, `vite.config.ts`,
`useTabRouting.ts`, `useFullscreenLifecycle.ts`, `.gitignore`,
`.github/workflows/ios.yml` and `scripts/ci/`.

---

## Gates

### On the runner — GitHub `macos-latest`, Xcode 26.6, iPhone 15 simulator

Green, every step:
<https://github.com/turutupa/yames/actions/runs/35550530399>

| Gate | Result |
|---|---|
| `cargo check --lib --target aarch64-apple-ios` | **Pass.** Builds the Swift package on the way through, so this is also the first check that the plugin's iPhone half compiles. |
| `cargo check --lib --target aarch64-apple-ios-sim` | **Pass.** |
| `tauri ios init` reproduces `src-tauri/gen/apple` | **Pass**, from a clean tree. |
| Phone bundle free of the cut features (`check-mobile-bundle.mjs`) | **Pass**, both times it is built. |
| The screenshot hooks are absent from the shipping bundle | **Pass.** Neither marker string is in the `dist/` that goes into the device archive. |
| `tauri ios build --target aarch64-sim` | **Pass.** |
| The app boots on an iPhone 15 simulator and reaches its own interface | **Pass.** Six screenshots, below. |
| A changed setting survives a relaunch | **Pass**, read-back half only — see the note under the screenshots. |
| `tauri ios build --target aarch64` archives for a real iPhone, unsigned | **Pass.** `Yames.app`, arm64, `iPhoneOS`, minimum iOS 15.0, `com.yames.metronome`, 1.1.0. The export that follows fails for want of a signature, which is the point. |
| The built app asks a phone for nothing (`ios-check-plist.sh`) | **Pass.** Zero `NS*UsageDescription` keys of the fifteen checked; `UIBackgroundModes` is `[audio]`; the only orientation is portrait. |

**The app, unsigned, for a real iPhone:** `Yames.app` is **6.2 MB** on disk and
the binary inside it is **4.8 MB**. For scale, ROADMAP §5.0.1 budgets 80 MB
per platform and the Android arm64 APK is 12.8 MB (M05). Neither number is a
download size: the App Store re-packages and thins the app, and this one has
never been through that.

### The screenshots — `plans/tasks/mobile/m06/`

| File | What it shows |
|---|---|
| `00-first-launch-onboarding.png` | A fresh install, first launch: the phone's three-step setup — "Set me up (about a minute)" / "Just give me the click". Not a white WebView, and not the desktop wizard: no instrument step, no coach, no microphone. |
| `01-metronome.png` | The metronome at **143 BPM** in the **neon** theme with triplets (`12 clicks/bar`) — none of which is a default. All three were written into the settings store while the app was shut, so this picture is the app reading them back on a cold launch. |
| `02-drill.png` | The drill: the 80 → 120 plan, +5 BPM every 12 bars, Linear/Zigzag/Adaptive, "9 steps · 108 bars · about 4m 23s", and the climb chart. |
| `03-setlist.png` | The setlist tab, empty, with its explanation and "New setlist". |
| `04-settings.png` | Settings, General. Language, Button flash, Active border, Drill auto-collapse, Run setup again — and no coach, no hotkeys, no devices, no microphone. The mobile cut, seen rather than asserted. |
| `05-zen.png` | Zen, with the × exit button and the hint that names it (M05's fix, now confirmed on the other phone), the transport row, and 143 BPM. |
| `06-metronome-again.png` | The metronome again after five more launches: still 143, still neon. |

**What the tab bar and the notch say.** The app's header clears the status bar
and Dynamic Island, and the bottom tab labels clear the home indicator, on all
six. The gap at the bottom measures ~34 pt at 3x, which is exactly
`safe-area-inset-bottom` on an iPhone 15 — so **WKWebView's
`env(safe-area-inset-*)` tells the truth and iOS needs none of the
insets-from-native workaround Android needed in M05b.** That was the open
question the brief asked to answer with the shots rather than assume, and the
answer is no: the Swift half sends no insets and no `window_insets` event.

**What "a changed setting survives a relaunch" does and does not prove here.**
Every screen above is a cold launch against a store written while the app was
shut, so the *read* half — store → Rust → interface — is proven six times
over. The *write* half is not: nothing in CI taps a control, so no setting was
ever changed from inside the app on iOS. It is the same Rust store code
Android exercised end to end in M05, but on iOS it has only been read.

### On Windows, locally

| Gate | Result |
|---|---|
| `npm run build` | **Pass** |
| `npm run test` | **Pass.** 110 files, 2952 tests. |
| `YAMES_MOBILE=1 npm run build` + `scripts/check-mobile-bundle.mjs` | **Pass.** 2 files checked, none of the 11 cut features present. |
| Neither marker string in a mobile build without `YAMES_MOBILE_DEBUG` | **Pass**, and both present with it — checked both ways. |
| `DOCS_RS=1 cargo check --lib --target aarch64-linux-android` | **Pass.** The shared plugin crate still compiles for the other phone. |

Not run here, on purpose (the brief, and two other workers on the machine):
the full Rust test suite, any Android build, the emulator.

---

## Two things that cost a CI round each, and would cost anyone else one too

**Nothing with Swift in it links, out of the box, under Xcode 26.** The
generated Xcode project sends the linker to
`$(TOOLCHAIN_DIR)/usr/lib/swift/$(PLATFORM_NAME)` for Swift's static
back-deployment libraries. On the GitHub runner `TOOLCHAIN_DIR` resolves to
the **Metal** toolchain, which has no Swift libraries in it at all:

```
ld: warning: search path '/var/run/com.apple.security.cryptexd/mnt/
    …Metal.xctoolchain/usr/lib/swift/iphonesimulator' not found
ld: warning: Could not find or use auto-linked library 'swiftCompatibility56'
Undefined symbols for architecture arm64:
  "__swift_FORCE_LOAD_$_swiftCompatibility56", referenced from:
    …_$_tauri_plugin_yames_mobile in libapp.a[29](YamesMobilePlugin.swift.o)
```

Which is every build from M06a onwards, because M06a is what put Swift in the
app. `scripts/ci/ios-xcode-env.sh` overrides `LIBRARY_SEARCH_PATHS` through
the environment — xcodebuild reads build settings from there — with the
default toolchain spelled out absolutely from `xcode-select -p`. It cannot be
fixed in the project itself: `gen/apple` is generated, and a hand edit would
be undone by the next `ios init` and caught by the drift check.

**`xcodebuild` cannot build this project on its own.** The obvious fallback —
drive Xcode directly and skip the Tauri CLI — does not exist. The project's
"Build Rust Code" phase runs `tauri ios xcode-script`, and that command reads
its options over a **local WebSocket** from the `tauri` process that started
the build (`crates/tauri-cli/src/mobile/mod.rs`, `write_options` /
`read_options`). Run `xcodebuild` by hand and the phase dies with

```
failed to read CLI options: Context("failed to build WebSocket client",
  Io(Os { code: 61, kind: ConnectionRefused, … }))
```

before compiling a line. So every build goes through `npm run tauri -- ios
build`, and anything Xcode needs to be told is told through the environment.
That is also why the unsigned device build is expressed as "archive, expect
the export to fail, then check the archive": the CLI archives and then
exports, and exporting is the only step that genuinely needs an identity.

## Things worth knowing that are not gates

* **`tauri icon` cannot be run in place.** It rewrites the Windows, macOS,
  Linux *and* Android icons as well as the iOS set — fifteen committed
  Android mipmaps, six committed desktop icons, and ten new Windows ones —
  none of which has anything to do with the iPhone. `ios-generate-project.sh`
  points it at a scratch directory and copies only `ios/*.png` out.
* **The Xcode project's `assets` is a symlink and is not committed.** `tauri
  ios init` creates `gen/apple/assets` as a relative symlink to the built
  frontend; git on Windows does not carry those, and it would be dangling in a
  fresh clone anyway. `scripts/ci/ios-ensure-assets.sh` remakes it from
  `frontendDist` before each build.
* **The development team id is in the workflow, in the clear, and is not a
  secret.** Xcode will not open an iOS project without one; the value is the
  same `BBG489SR42` that `tauri.conf.json`'s macOS signing identity has
  carried publicly for months, and every build in this workflow overrides it
  with `CODE_SIGNING_ALLOWED=NO`.
* **The `push` trigger on `ios.yml` is scaffolding.** It exists so this task
  could iterate. When `mobile` reaches `main`, drop it and keep
  `workflow_dispatch` — which only becomes usable at that point anyway,
  because GitHub looks for dispatchable workflows on the default branch.
* **A failed run does not save the cargo cache**, so every failure pays a cold
  iOS dependency build. That is the reason the workflow puts both `cargo
  check`s first: they are the cheapest things in it that can fail.
* **Nothing in CI presses play**, so the audio session is never activated,
  none of the interruption handlers ever fires, and no click is ever rendered.
  The plugin says one line at startup (`[YamesMobile] audio session
  configured: .playback/.default, asked 48000 Hz / 5.0 ms`) precisely because
  that is otherwise the only sign from outside the app that its native half is
  running at all — and it is there, on every launch:

  ```
  Yames[19281] (Foundation) [YamesMobile] audio session configured:
    .playback/.default, asked 48000 Hz / 5.0 ms
  Yames[19281] [stderr] [yames] Using audio output device: "Default Device"
  Yames[19281] [stderr] [yames] CoreAudio output latency: 0 frames
  ```

  Twice per launch, from `init()` and again from `load(webview:)`, which is
  deliberate: the category can be reset out from under an app by a
  media-services reset, and setting it twice costs nothing. Alongside it,
  CoreAudio opens a `RemoteIO` stream at 48 000 Hz, 2 channels, Float32, with
  a 512-frame buffer — cpal's backend doing its job. The `0 frames` latency is
  the simulator having nothing to report, exactly as on the Android emulator.
* **The drift check regenerates from an empty directory.** Checking after a
  build compares the wrong thing twice over: `Externals/` fills with the
  compiled Rust library and the next `xcodegen` pass adds forty lines of file
  references for it, and `yames_iOS/Info.plist` is rewritten during the build
  (that is where `Info.ios.plist` merges in) while `ios init` leaves an
  existing one alone.
* **`Info.ios.plist` is belt to the template's braces.** The keys that matter
  — background audio and the portrait lock — are in `src-tauri/ios-project.yml`
  and therefore in the generated project itself, which is what the check reads
  off the built app. `src-tauri/Info.ios.plist` says the same thing through
  Tauri's own merge. Either alone would do; both is deliberate, because the
  one that is easy to lose in a CLI upgrade is the template.

---

## What only a real iPhone can prove

None of this is a blocker for a TestFlight build; all of it is a blocker for
calling iOS done.

1. **Whether the click is audible, and at a useful volume beside an
   instrument.** A simulator's audio is the host Mac's.
2. **Output latency, and what the audio session actually granted.** The plugin
   logs `asked 48000 Hz / 5.0 ms, got …` when it activates the session; on a
   device that one line is the whole answer, the same way the Oboe log line is
   on Android. A simulator's numbers are meaningless.
3. **That the click survives a locked screen.** `UIBackgroundModes: audio` is
   in the bundle and checked, and the audio session is `.playback`, but a
   simulator does not lock, sleep, or enforce a background-execution policy.
   This is the single most important untested thing, because it is the whole
   reason the plugin exists.
4. **That the silent switch does not silence it.** There is no silent switch
   on a simulator. `.playback` is the category that is supposed to make this
   true.
5. **A real call.** The interruption path is written against
   `AVAudioSession.interruptionNotification` and has never been raised.
6. **Headphones being pulled out.** Same: `routeChangeNotification` with
   `.oldDeviceUnavailable` has never fired.
7. **Whether the whole thing signs.** Everything M06a built is unsigned by
   design. `M06b-OWNER-STEPS.md` is the plan for that, and no certificate,
   key or secret has ever been near this branch.

---

## Open questions for M06b and after

1. **The GPL App Store exception and the PR #8 author's consent** —
   `LICENSE-EXCEPTION.md`. Blocks submission, not TestFlight.
2. **Store screenshots.** The simulator shots here are evidence, not listing
   assets: App Store Connect's required sizes change yearly and have to be
   checked at the time.
3. **`set_audio_output_device`** is inert on Android (M04 open question 7) and
   is equally inert here — iOS routes output itself. The Devices section is
   already gone on a phone (M05), so nothing offers a picker; there is just
   nothing behind the command.
4. **MIDI** is still out. M07 widens midir's cfg to
   `not(target_os = "android")` and turns on its CoreMIDI arm; nothing in this
   task touched it.
