# M05 findings — 2026-09-11, the first release-worthy Android build

> **Device status:** still no physical phone. Everything below is the Pixel 6
> AVD (API 34, x86_64), running a **signed, R8-minified, resource-shrunk
> release APK** — not a debug build. That is the change from M04: every gate
> here was repeated on the artifact people would actually install.
>
> The three things only hardware can answer are unchanged and listed at the
> end.

---

## What shipped

| | |
|---|---|
| Release signing | Four environment variables, read by `gen/android/app/build.gradle.kts`. Nothing about the key is in the repo. Absent, the build still runs and produces an unsigned artifact. |
| versionCode | Derived from the one version string: `major*10000 + minor*100 + patch`. 1.0.4 → **10004**, read back off the installed package. |
| Minification | `isMinifyEnabled` and `isShrinkResources` on for release. No ProGuard rules had to be added — see "R8" below. |
| Portrait lock | `android:screenOrientation="portrait"` on the activity. |
| AndroidTV | The `leanback` `uses-feature` and the `LEANBACK_LAUNCHER` category are gone. |
| Notification icon | `ic_stat_yames`, the brand mark redrawn as a flat monochrome glyph. |
| Output picker | Gone on a phone, and with it the whole Devices section. |
| Onboarding | One sentence on the ready step about the notification permission, in all 15 locales. |
| CI | `.github/workflows/android.yml` builds and signs both artifacts and attaches the APK to a release. |

Four bugs were found by building the release and are fixed on this branch.
They are the substance of this document; the gates are further down.

---

## The four bugs

### 1. The notification prompt landed on the welcome screen

A fresh install of the release APK raised **"Allow Yames to send you
notifications?"** over the first screen of the setup wizard, before the user
had pressed anything. M04 expected it on the first Play and said so.

The wizard demonstrates the app rather than describing it: a soft 80 BPM
click runs while it is open (`useSoftClickPreview`). That click is the
engine's transport, and on a phone the transport is what starts the
`mediaPlayback` foreground service — which is what asks for the permission.
So the first thing a new user met was a permission dialog about playback
they had not started.

`useAndroidNative` is now told the transport is idle while the demo is what
is running it.

### 2. …and then it landed on the way *out* of setup

Half fixed, it moved rather than went away. The demo click is unwound as the
wizard closes: the flag saying "this is only the demo" clears as soon as the
wizard does, but the engine takes another render to report itself stopped.
In between, the transport reads exactly like a user pressing play.

**The foreground service now waits 500 ms before it believes the transport.**
Only on the way up; stopping is immediate, because a service that outlives
playback is what the plan actually forbids. Nobody can tell that the row in
the shade arrives half a second after the first beat, and the app is in the
foreground and in no danger of being killed.

With both fixes, the prompt arrives exactly where the new onboarding sentence
says it will: on the first Play.

### 3. Zen had no visible way out — and M00's screenshot was the evidence

M00 screenshotted zen on the emulator and there was no exit button in it.
Read out of the release build's own WebView over DevTools:

```
(pointer: coarse)   false
(pointer: fine)     true
(hover: hover)      false
(any-hover: hover)  false
(any-pointer: coarse) false
```

`.zen-top-controls` sits at `opacity: 0` and is revealed by hovering the
view; `@media (pointer: coarse)` is what un-hid it for a phone. On this
Android WebView that block never applies. So zen — the one screen that covers
everything, has no Esc key, and spends the double-tap gesture on zoom — had
no visible door, and neither did the hint that names it.

The phone build now says so itself (`.zen-top-controls--touch`, set from
`IS_MOBILE`) instead of asking the device. The media query stays for a
desktop browser on a touchscreen, which is the case it was written for.

**This is bigger than the emulator.** A Chromebook running the app, or a
phone with a mouse paired, reports the same thing. Every other
`@media (pointer: coarse)` rule in the app — M03a's touch targets, the zen
control row's sizing — is still dead on this emulator, which means that whole
class of CSS has never been *seen* working. It is correct on a real phone;
it has not been looked at.

### 4. You could not save a preset on a phone. At all.

Not "it was awkward" — the name field could not be typed into. Found while
trying to stage the presets screenshot for the store listing.

`Sheet` focuses its own panel when it opens and restores the previous focus
when it closes. Both are right. What was wrong is that the effect listed
`onClose` in its dependency array, and every call site passes an inline
arrow — so a new identity arrives on every render of the screen behind the
sheet, which **with the metronome running is twice a second**. The effect
re-ran that often and each run pulled focus back to the panel. The preset
name field appeared, took focus, lost it within a beat, and because it
commits on blur, the empty name cancelled the save. Every time.

Fixed by depending on `open` alone and reading the callback through a ref.
`src/components/Sheet.test.tsx` is the regression test; it fails if the
dependency comes back.

`useBackDismiss` (`src/mobile/backStack.ts`) has the same shape of problem —
it re-registers on every render for the same reason. With one layer open that
is only churn; with two it can reorder the stack so Back closes the wrong
one. Left alone here and flagged separately.

---

## Sizes

Release profile, signed, R8 on, resource shrinking on.

| Artifact | Size |
|---|---|
| **APK, arm64 only** (`--apk --target aarch64`) — the one on Releases | **13 380 209 bytes (12.8 MiB)** |
| APK, x86_64 only — the emulator build every gate below ran on | 12 698 155 bytes (12.1 MiB) |
| **AAB, all four ABIs** — the one Play takes | **17 100 145 bytes (16.3 MiB)** |

The native libraries, uncompressed, per ABI:

| ABI | `libyames_lib.so` | `libc++_shared.so` |
|---|---|---|
| `arm64-v8a` | 9 643 008 | 1 822 720 |
| `armeabi-v7a` | 6 659 964 | 1 524 360 |
| `x86` | 9 329 432 | 1 602 440 |
| `x86_64` | 9 157 568 | 1 632 144 |

Read out of the AAB with `unzip -l`, uncompressed. An installed app carries
exactly one row of that table: Play splits the bundle per device, and the APK
on Releases is the arm64 one.

For scale: M00 measured the **debug** x86_64 library at 128 MB unstripped.
The release profile strips it, which is the whole difference. ROADMAP §5.0.1
budgets 80 MB per platform; nothing here is close to it.

`libc++_shared.so` rides along in every ABI for the `oboe-sys` reason M00
documented: the crate compiles Oboe's C++ and then links none of the runtime
it needs, so `build.rs` asks for `c++_shared` on Android and the Tauri CLI
symlinks the NDK's copy into `jniLibs/` by itself.

Both artifacts were signed with a throwaway 4096-bit RSA key generated for
this task and **deleted afterwards**; `apksigner verify` reports one signer,
v2 scheme, on the arm64 APK. The AAB carries `META-INF/YAMES-TH.RSA`, the
same key. Nothing about the owner's real upload key was ever created, held
or written down by this task.

---

## Emulator gates, on the minified release build

| Gate | Result | Evidence |
|---|---|---|
| Signed APK installs (`adb install` over an uninstalled debug build) | **Pass.** `apksigner verify`: v2 scheme, one signer, RSA 4096. versionCode 10004, versionName 1.0.4, minSdk 24, targetSdk 36. | — |
| First run shows the three-step onboarding | **Pass.** Welcome → Sound & look → You're ready, and nothing else. No instrument step, no coach, no microphone, no footswitch. | `m05/release-01-onboarding-welcome.png`, `02-…`, `03-…` |
| The ready step says what the phone is about to ask for | **Pass.** "The first time you press play, your phone will ask if Yames can show a notification — say yes and the click keeps going with the screen off." | `m05/release-03-onboarding-ready-notification-note.png` |
| No permission prompt anywhere in setup | **Pass.** Focus stayed on `MainActivity` through every step of a fresh install. | — |
| Click plays; the prompt arrives on the first Play | **Pass.** `GrantPermissionsActivity` on the first tap of Play and not before. | `m05/release-05-first-play-permission-prompt.png` |
| Foreground service, with the real icon | **Pass.** "Yames / Playing — 120 BPM", `isForeground=true types=00000002`, channel `yames.playback`, category `transport`, one action. The small icon is the Y mark. | `m05/release-07-notification-shade.png` |
| **10 minutes, screen off, 120 BPM** | **Pass, exactly.** **1242 ticks in 621.01 s of wall clock; 621.01 × 2 = 1242.02.** Twenty samples at 30 s intervals: `mWakefulness=Asleep` in all twenty, same pid throughout, service foreground in all twenty, the AAudio stream `state:started` at 48 000 Hz in all twenty. | `m05/soak` counters below |
| Incoming call | **Pass.** Ring → `audio focus change -2 -> focus_lost` → paused, shade reads "Paused", service stays up. Hang up → `1 -> focus_gained` → playing again. | `m05/release-13-incoming-call-paused.png` |
| Back closes a sheet | **Pass.** Library sheet open → Back → closed, app still foreground, still playing. | `m05/release-10-back-sheet-open.png`, `11-…` |
| Back leaves zen | **Pass.** Returns to the metronome; does not background the app. | `m05/release-09-back-left-zen.png` |
| Back with nothing open | **Pass.** Launcher takes focus, **same pid**, service still foreground, audio stream still `state:started`. | `m05/release-12-back-backgrounded-still-playing.png` |
| About link → system browser | **Pass.** `START u0 {act=android.intent.action.VIEW dat=https://github.com/… cmp=com.android.chrome/…}`. | `m05/release-16-about-link-opens-browser.png` |
| Settings persist across a kill | **Pass.** 143 BPM, triplets, `neon`, volume 0.42, `wood` — set, `am force-stop`, relaunch, all five back exactly. Onboarding did not reappear. | `m05/release-15-settings-persist-after-force-stop.png` |
| Portrait lock | **Pass**, from the shipped manifest: `android:screenOrientation=1` (portrait) on `MainActivity`, and `aapt2 dump badging` reports the implied `uses-feature android.hardware.screen.portrait`. The display stayed `ROTATION_0` with `accelerometer_rotation=1` and after `adb emu rotate`. See the caveat below. | `m05/release-14-portrait-lock-under-forced-landscape.png` |
| No leanback | **Pass.** `aapt2 dump xmltree` on the release APK: zero occurrences of `leanback`; the only launcher category is `android.intent.category.LAUNCHER`. | — |
| Zen shows its exit button | **Pass**, after fix 3. The × in the accent circle, larger than the theme picker beside it, plus the hint naming it. | `m05/store/04-zen.png`, `m05/release-08-zen-exit-button.png` |
| Presets save, load and delete | **Pass**, after fix 4. Three presets created by typing into the name field on the device. | `m05/store/05-presets.png` |
| No app-level errors in logcat | **Pass.** Nothing from Yames at error level across every run. |

**The portrait caveat, stated plainly.** The A/B control for the rotate test
is inconclusive: this AVD's display stayed at `ROTATION_0` for *every* app,
including Settings, under both `adb emu rotate` and a forced
`user_rotation=1`. So "it stayed portrait" is not by itself proof the lock
did anything. What *is* proof is the attribute in the shipped APK's merged
manifest, which is quoted above and which Android does not treat as advisory.

---

## R8 and the plugin

**Nothing broke, and no keep rules were added.** The release build is
minified and resource-shrunk, and on it: the plugin's five commands all
answered, the foreground service started and stopped, audio focus was
requested and released, the Back callback fired, the event channel delivered
`focus_lost` and `focus_gained`, and `ic_stat_yames` — a vector drawable in
the plugin's own `res/`, reached only through `R.drawable` from Kotlin —
survived resource shrinking and renders in the shade.

`proguard-tauri.pro` (generated, applied to the app) keeps `@TauriPlugin`
classes and `@Command` methods, the service is named in the manifest, and
`@InvokeArg` classes are reached by the same reflection the keep rules
already cover. M04's open question 6 is closed: **it is fine.**

---

## Things worth knowing that are not gates

* **WebView DevTools is open in the release build.** `webview_devtools_remote_<pid>`
  is present on a signed, non-debuggable release APK — which is how every
  measurement above was taken, so it is useful, but it is worth the owner
  knowing it is on. It needs USB debugging and adb access to reach, so the
  practical exposure is small.
* **`run-as` does not work on the release build** (not debuggable), so the
  store file could not be read directly. Persistence was verified through the
  app instead, which is the stronger test anyway.
* **Build times, this branch, warm.** A `--apk --target x86_64` release build
  is about 4 minutes cold for the Rust half and around 1 minute warm, plus
  gradle's second Rust pass and R8. The four-ABI AAB is the long one.
* **The "Manuscript" theme label wraps mid-word** in the theme grid at phone
  width. Cosmetic, visible in `m05/store/06-themes.png`, flagged separately.
* **The empty-state "Save your first preset" button** and the header's Save
  button both go through `triggerAdd`. Both work now; before fix 4 neither
  could produce a named preset.

---

## Still needs a phone

Unchanged from M04, and none of it is a blocker for uploading a closed test:

1. **Output latency**, and whether the device grants the fast path. The app
   prints `asked LowLatency/Shared, got …` at startup — the emulator says
   `got None/Shared` with a 960-frame burst, which is the host audio path,
   not a phone's. One `adb logcat` on hardware answers it.
2. **Audibility** at a useful volume beside an instrument.
3. **Real Doze, app-standby and an OEM battery manager over an hour**, not
   ten minutes. Ten clears Doze's first threshold; a practice session does
   not.
4. **The denial path for the notification permission.** The service and the
   click are designed to carry on without it; that path has never been
   exercised.
5. **Every `@media (pointer: coarse)` rule in the app.** See bug 3: they are
   dead on this emulator, so M03a's touch-target work has been reasoned about
   but never observed.
