# M04 findings — 2026-09-11, Android emulator (Pixel 6 AVD, API 34, x86_64)

> **Device status:** still no physical phone. Everything below was measured on
> the emulator, which this time could carry more of the load than M00
> expected: the 10-minute screen-off soak, the incoming-call interruption
> (`adb emu gsm`), the Back gesture and the About link all ran on it. The two
> things it still cannot answer are **output latency** and **audibility**, plus
> real Doze / OEM battery-manager behaviour. Those stay pending device.

---

## What M04 changed

Five things, in the order they matter.

1. **Android opens its own output stream at `oboe`** (`src-tauri/src/
   android_audio.rs`). M00 found cpal 0.15.3's Oboe backend asking for neither
   the low-latency path nor the device's sample rate, and opening 44 100 Hz
   into a 48 kHz device. Yames now asks for `PerformanceMode::LowLatency`,
   `SharingMode::Exclusive` (falling back to Shared), `Usage::Media`, and the
   rate the device itself reports. **The resample is gone and the buffer
   halved** — see the table below.
2. **A `mediaPlayback` foreground service** keeps the process alive with the
   screen off, with a notification that says "Yames / Playing — 120 BPM" and a
   Stop action. Every word of it comes from the frontend already translated.
3. **Audio focus.** A call pauses the click and hanging up resumes it; another
   app taking playback for good stops it and does not bring it back.
4. **The Back gesture** closes an open sheet, leaves zen, closes the settings
   pane, and — with nothing open — sends the app to the background with the
   click still running. M00 found it *finishing the activity mid-click*.
5. **`FLAG_KEEP_SCREEN_ON`** while playing, in zen, or running a drill. Not on
   the settings screen.

Plus three smaller things the brief asked for: the 5-second device-polling
loop no longer exists on a phone, the engine is shut down on
`RunEvent::Exit` (no window event reaches it any more), and the
`CoreAudio output latency: 0 frames` line stops printing into the Android log.

## The plugin's surface

`src-tauri/plugins/yames-mobile` — five commands, three events.

| Command | What it does |
|---|---|
| `set_background_audio { active, title, body, stopLabel, channelName }` | Start/stop the `mediaPlayback` foreground service **and** the `AUDIOFOCUS_GAIN` request. Calling it again while active replaces the notification's text rather than adding a second row, which is how the tempo in the shade stays honest. |
| `keep_awake { active }` | `FLAG_KEEP_SCREEN_ON` on the activity window. |
| `open_url { url }` | `Intent.ACTION_VIEW`; http and https only. |
| `set_back_intercept { active }` | Whether the app has something open that Back should close. False means Back backgrounds the app immediately — no round trip through the webview. |
| `set_event_channel { channel }` | Opens the one channel every event below arrives on. |

| Event | Payload | Frontend does |
|---|---|---|
| `audio_interrupted` | `kind: "focus_lost"` | Pause, and remember that the pause was ours. |
| | `kind: "focus_gained"` | Resume, but only if the pause was ours. |
| | `kind: "focus_lost_permanently"` | Stop, and let the service go. |
| `back_pressed` | — | Close the topmost open layer. |
| `stop_requested` | — | Stop (the notification's own button). |

**Three interruption kinds, not the brief's four.** The brief sketched
`"call"` as its own kind. A call does not arrive as one: the dialer takes
transient focus like any other app, and telling the two apart needs
`READ_PHONE_STATE` — a permission a metronome has no business holding, to draw
a distinction the frontend does not act on. The behaviour the brief asked for
(pause on ring, resume on hang-up) is what `focus_lost` / `focus_gained` give.

**Why one channel and not `addPluginListener`.** That API invokes
`plugin:<name>|registerListener`, which only the Kotlin base class knows about;
a plugin whose Rust half declares its own commands would have to re-declare it
under a name Rust's naming conventions have no room for. One channel opened at
startup is smaller and more predictable, and three events do not need three
subscriptions.

---

## The audio table — before and after

Same AVD, same session, same settings: 120 BPM, quarter notes, 4/4, `click`
sound, app in the foreground, screen on. "Before" is the engine at `e1b4dbe`
(cpal) rebuilt and reinstalled for the measurement; "after" is this branch.
Two consecutive 30-second windows each, warm-up window discarded. Instrumented
the way M00 documented — `CallbackProbe` on the live engine — except that the
summary is printed to logcat every 30 s rather than pulled out over DevTools,
which is what made the 10-minute screen-off window measurable at all.

| | **Before (cpal)** | **After (direct oboe)** |
|---|---|---|
| Stream sample rate | **44 100 Hz** into a 48 kHz device | **48 000 Hz** — the device's own |
| Resampling | yes, every click | **none** |
| Frames per callback (median) | 946 / 984 | **512** |
| Nominal period | 21.451 / 22.313 ms | **10.667 ms** |
| Period p50 | 24.000 / 24.848 ms | **11.077 / 11.094 ms** |
| Period p99 | 65.429 / 65.857 ms | **23.158 / 23.111 ms** |
| Period max | 67.869 / 67.306 ms | 32.685 / 26.628 ms |
| Gaps > 2× nominal (per 30 s) | 374 / 344 | **96 / 91** |
| Wall clock vs audio clock | +19.4 / +9.9 ms | −0.5 / +1.0 ms |
| Ticks per 30 s window | 60 / 60 (exact) | 60 / 60 (exact) |
| `sample_pos` discontinuities | 0 | 0 |
| Probe overflow | 0 | 0 |

Tempo was never the problem and still is not — both count exactly 60 ticks per
30 s at 120 BPM. What changed is the size of the buffer the click is rendered
into and the rate it leaves at: **p99 callback period fell from ~65.5 ms to
~23.1 ms, and the 44.1→48 kHz resample is gone.** Both of those are latency the
player feels, and neither is visible in a tick count.

From the audio server, on the same runs:

```
before:  AudioPlaybackConfiguration ... type:AAudio usage=USAGE_MEDIA flags=0x0
         FormatInfo{... sampleRate=44100}      # mixer: 48000 Hz, HAL frame count 1088
after:   AudioPlaybackConfiguration ... type:AAudio usage=USAGE_MEDIA flags=0x0
         FormatInfo{... sampleRate=48000}
```

### The emulator refuses the fast path, explicitly

```
[yames][android] oboe output: 48000 Hz, 2 ch, f32, api AAudio;
  asked LowLatency/Shared, got None/Shared; burst 960 frames, buffer 1920 frames
```

`flags=0x0` in the audio server — no `FAST`, no `RAW` — matches. This is worth
being precise about, because it bit the first version of this code: **AAudio
does not refuse a sharing or performance mode it cannot give. It opens the
stream anyway and downgrades.** So an open that "succeeds" proves nothing, and
both the format probe and the log now read the granted mode back off the
stream. On this AVD `SharingMode::Exclusive` is not granted and
`PerformanceMode::LowLatency` comes back as `None`; the 960-frame burst (20 ms)
is the emulator's host audio path, not a phone's.

**A phone should behave differently** — a typical burst is 96–240 frames and
`flags` should carry `FAST` — and that is the measurement that still has to
come from hardware. Nothing in this document is an output-latency figure.

---

## Emulator gates, and what each one showed

Commands are in "How to redo this" below.

| Gate | Result | Evidence |
|---|---|---|
| 120 BPM, screen off (`KEYCODE_POWER`), 10 minutes | **Pass.** `mWakefulness=Asleep` throughout; same pid before and after; service still `isForeground=true types=00000002`. Twenty consecutive 30-second windows, **every one exactly 60 ticks**, drift within ±10.6 ms, 0 `sample_pos` discontinuities, 0 probe overflow. Still playing on wake. | `m04/screen-off-10min-after.png` |
| Foreground-service notification in the shade | **Pass.** "Yames / Playing — 120 BPM", one Stop action, channel `yames.playback`, `IMPORTANCE_LOW`, category `transport`. | `m04/notification-shade.png` |
| Incoming call (`adb emu gsm call` → `accept` → `cancel`) | **Pass.** Ring → `AUDIOFOCUS_LOSS_TRANSIENT (-2)` → paused, shade says "Paused", service stays up. Hang-up → `AUDIOFOCUS_GAIN (1)` → resumed. | `m04/incoming-call-paused.png` |
| Back with a sheet open | **Pass.** Sheet count 1 → 0, app still `topResumedActivity`. | `m04/back-1-sheet-open.png`, `m04/back-2-sheet-closed.png` |
| Back with nothing open | **Pass.** App leaves the foreground, **process alive, service still foreground, `isPlaying` still true**. | `m04/back-3-backgrounded-still-playing.png` |
| Back in zen | **Pass.** Leaves zen; does not background the app. | — |
| About link → system browser | **Pass.** `START u0 {act=android.intent.action.VIEW dat=https://github.com/…}` resolved to Chrome. (This AVD has never had Chrome set up, so what is on screen is Chrome's first-run page — the intent is the result, not the page.) | `m04/about-link-opens-browser.png` |
| `keep_awake` | **Pass.** Playing → `fl=KEEP_SCREEN_ON` on the Yames window. Zen with playback stopped → still set. Settings, stopped → gone, and no window in the system holds it. | — |
| `libc++_shared.so` in the APK | **Pass.** `lib/x86_64/libc++_shared.so` (1 632 144 bytes) alongside `libyames_lib.so`. The Tauri CLI symlinks it into `jniLibs/` by itself, exactly as M00 said. | — |
| No app-level errors in logcat | **Pass.** Nothing from Yames at error level across every run. The `OnBackInvokedCallback is not enabled` warning M00 saw is gone. | — |

### Not verified here, and only a phone can

* **Output latency.** The one number the whole `android_audio.rs` change exists
  to improve. An emulator's is meaningless.
* **Audibility and usable volume.**
* **Whether a phone grants `LowLatency` / `Exclusive`,** and its real burst
  size. The log line above prints both halves, so this is one `adb logcat` away
  on hardware.
* **Real Doze, app-standby buckets, and an OEM battery manager** over ten
  minutes — and over an hour, which is the realistic practice session.
* **Whether the notification's small icon looks right.** It is
  `android.R.drawable.ic_media_play` — a system silhouette, because a
  notification's small icon must be flat monochrome and the launcher icon is
  not. M05 should draw a proper one.
* **The POST_NOTIFICATIONS prompt on a phone that denies it.** The service and
  the click are designed to carry on without the notification; that path was
  not exercised.

---

## Things worth knowing that are not gates

* **The permission prompt lands on the first Play.** Android 13+ asks "Allow
  Yames to send you notifications?" the first time `set_background_audio(true)`
  runs. The click starts either way and the service starts once the user
  answers — a denial costs the row in the shade, not the metronome. M05 may
  want the wizard to explain it first; today it arrives unannounced.
* **M00's open question 4 is answered, and its item 4 is closed.** A direct
  `set_bpm` invoke *does* round-trip to the React state — the phone showed 120
  immediately. M00 recorded it as "unconfirmed"; it is not a bug.
* **`tauri android dev` is still unverified.** Port 1420 was in use by the
  owner's desktop dev server for this whole session too (PID 26616), so every
  measurement here was against installed debug APKs.
* **Build times on this branch.** A warm `tauri android build --apk --debug
  --target x86_64` is 45–70 s including the second Rust pass gradle makes.
  The plugin adds one Kotlin library module; its incremental cost is under 5 s.
* **The debug APK is still ~129 MB of unstripped cdylib.** M05 measures a
  signed release build; nothing here is a size figure.

---

## How to redo this

```sh
# build + install (the environment from the brief exported in every shell)
npm run tauri -- android build --apk --debug --target x86_64
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb shell am start -n com.yames.metronome/.MainActivity

# drive the app without a UI: DevTools over adb, then invoke directly
PID=$(adb shell pidof com.yames.metronome | tr -d '\r')
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
# then Runtime.evaluate of window.__TAURI_INTERNALS__.invoke('set_playing', {playing:true})

# the gates
adb shell input keyevent KEYCODE_POWER            # screen off
adb shell dumpsys power | grep mWakefulness
adb shell dumpsys activity services com.yames.metronome | grep isForeground
adb shell dumpsys audio | grep 'u/pid:<uid>'      # stream rate, usage, flags
adb shell dumpsys window | grep -A3 package=com.yames.metronome   # KEEP_SCREEN_ON
adb emu gsm call 5551234 ; adb emu gsm accept 5551234 ; adb emu gsm cancel 5551234
adb logcat -s YamesMobile:I                       # audio focus transitions
unzip -l <apk> | grep lib/                        # libc++_shared.so
```

**The measurement scaffolding is not on the branch.** It was three edits to
`src-tauri/src/lib.rs` — build the engine with `MetronomeEngine::new_with_probe`
against a 1 000 000-slot `CallbackProbe`, and spawn a thread that prints a
windowed summary every 30 s — applied for the runs above and reverted before
the commits. Printing to logcat rather than pulling samples over DevTools is
the one change worth keeping in mind: it is what makes a ten-minute screen-off
window observable, since nothing can call into the webview while the screen is
off.

---

## Open questions for M05

1. **Measure output latency on a phone.** It is the number this whole change
   exists for and the only one the emulator cannot give. The log line prints
   asked-vs-granted performance mode, so the first `adb logcat` on hardware
   says whether the fast path was granted.
2. **Draw a notification icon.** `android.R.drawable.ic_media_play` is a
   placeholder that happens to be the right shape.
3. **Portrait lock is still not set.** Plan §1 says portrait-only in v1;
   `android:screenOrientation="portrait"` is still missing from the manifest,
   and M00 flagged it. It was out of M04's scope but nothing else owns it.
4. **The AndroidTV leanback `uses-feature` is still in the manifest.** Harmless,
   but a metronome is not a TV app and the Play listing will show it.
5. **Should the wizard mention the notification permission?** See above.
6. **R8 and the plugin.** The release build minifies; `proguard-tauri.pro`
   keeps `@TauriPlugin` classes and `@Command` methods, and the service is
   named in the manifest, so this *should* be fine — but nothing has built the
   plugin under R8 yet. First signed release build is the check.
7. **`set_audio_output_device` is now inert on Android.** The direct-Oboe path
   lets the system route output; the saved device name is ignored. The sound-
   output settings section should probably not offer a picker on a phone —
   M03 left it there and M00 noted no device reports `isDefault`.
8. **An hour-long soak on hardware**, not ten minutes. Ten minutes clears Doze's
   first threshold; a practice session does not.
