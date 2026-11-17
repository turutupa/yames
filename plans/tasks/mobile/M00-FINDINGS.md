# M00 findings — 2026-09-11, Android emulator (Pixel 6 AVD, API 34, x86_64)

> **Owner verdict:** _(to be written here — go or no-go)_
>
> **Device status:** no physical phone was available. Everything below was
> measured on the emulator. Brief steps 5 and 6-on-hardware are **pending
> device**; step 6 was run on the emulator anyway because it proves the
> probe and the whole measurement pipeline work end to end, and because it
> turned up two facts about the cpal → Oboe path that are properties of the
> code, not of the emulator (see "cpal / Oboe performance mode").

---

## Go / no-go recommendation

**Go.** Yames builds for Android, boots, renders every screen at phone
width, keeps its settings, and plays a click whose *musical* timing is
correct: over a 60 s run at 120 BPM the engine rendered exactly 120 beats,
and the audio clock tracked the wall clock to within 33 ms (0.055 %), with
the engine's sample counter continuous across every one of 2 602 callbacks.
Nothing in the metronome had to be rewritten and nothing had to be stubbed —
M01's target-conditional cut was already sufficient, and all 89 registered
commands answer without a panic. Exactly **one** line of code was needed to
make the whole thing run, and it is a workaround for an upstream bug, not a
design problem: `oboe-sys` 0.6.1 never links the C++ runtime, so the library
would not load at all. The two real risks the plan flagged for M00 both
resolved in the plan's favour: aubio never reaches the Android graph, and
the engine ports as-is.

The caveat that matters, and it is the one §6 predicted: **cpal's Oboe
backend never asks for a low-latency stream, and worse, it opens the device
at 44 100 Hz when the device runs at 48 000 Hz.** That is visible in the
audio server (`flags=0x0`, `sampleRate=44100` into a 48 kHz mixer), it is a
property of cpal's source rather than of the emulator, and it means every
Android user gets a resampled, non-fast-path stream with the extra output
latency that implies. It does not threaten *tempo accuracy* — the numbers
above say the grid holds — but it threatens *how late the click is*, which
is what a musician playing along actually feels. Output latency was not
measurable here (an emulator's latency is meaningless), so this is the one
number that genuinely must come from the phone before M04 closes. Plan for
the §6 fallback — driving the `oboe` crate directly behind
`cfg(target_os = "android")`, where `set_performance_mode(LowLatency)` and
the device's native sample rate are one call each — as **likely**, not as a
contingency. Budget it into M04.

The emulator's callback *cadence* is poor (p99 period 65.7 ms against a
21.4 ms nominal, 762 gaps > 2× nominal in 60 s) but this is the one number
in the table that is pure emulator artefact: the host audio stack hands
buffers over in bursts of wildly varying size (2 to 2 006 frames). Do not
read it as a phone result. Read the drift and the tick count instead, which
are burst-insensitive, and which are clean.

---

## Callback cadence (step 6)

Run: 120 BPM, subdivision 1, 4/4, default `click` sound, volume 0.8, app
built `--debug`. `CallbackProbe` attached to the real `MetronomeEngine` at
app startup; samples pulled out over a temporary `dump_callback_probe`
command called from the WebView. Probe capacity 300 000, **overflow 0** in
every run. "Nominal" is `median frames / sample rate`.

| Window | Sample rate | Frames/callback (med) | Period nominal | mean | p50 | p99 | max | gaps > 2× | screen state |
|---|---|---|---|---|---|---|---|---|---|
| 60 s measurement window (5 s warmup skipped) | 44 100 Hz | 943 | 21.383 ms | 23.050 ms | 24.708 ms | 65.740 ms | 68.097 ms | 762 | on, app foreground |
| 79.7 s soak | 44 100 Hz | 984 | 22.313 ms | 23.290 ms | 25.196 ms | 65.653 ms | 71.906 ms | 892 | **off** (`KEYCODE_POWER`, `mWakefulness=Dozing`) |
| 71.0 s soak | 44 100 Hz | 942 | 21.361 ms | 23.171 ms | 24.853 ms | 65.712 ms | 67.855 ms | 908 | on, app backgrounded (Home, then another app on top) |

Channel count **2**, sample format **F32**, `buffer_size` left at
`BufferSize::Default`. Callback rate ≈ 43 /s in all three windows.

The numbers that actually decide the question — all three windows:

| Window | Callbacks | Wall clock | Audio clock (`sample_pos`/SR) | Drift | Ticks rendered | Ticks expected | `sample_pos` discontinuities |
|---|---|---|---|---|---|---|---|
| Screen on, foreground | 2 602 | 59.953 s | 59.986 s | **+32.7 ms (0.055 %)** | **120** | 119.91 | **0** |
| Screen off | 3 421 | 79.652 s | 79.668 s | **+15.6 ms (0.020 %)** | **160** | 159.30 | **0** |
| Backgrounded | 3 067 | 71.040 s | 71.070 s | **+33.8 ms (0.055 %)** | **143** | 142.08 | **0** |

No buffer was ever skipped, and the beat count is exact in every window.
Screen state made no measurable difference to any statistic.

**Why the period p99 is 65 ms and why it should be discounted.** Frames per
callback on the emulator are not a fixed buffer: the modal value is 2 006
frames (304 of 2 602 callbacks) with a long scattered tail of small odd
sizes — 2, 14, 28, 82, 96, 123, 136, 150 frames. The device consumes a
buffer in `frames / sample_rate` seconds, so a callback asking for 2 006
frames legitimately arrives 45 ms after the previous one. The desktop gate's
jitter metric (`|Δwall − frames_prev/SR|`) sits at 15.1 ms p50 / 47.7 ms p99
here, versus the ROADMAP §4 gate of < 1 ms p99 — but that metric assumes a
device that hands out a *constant* buffer, which the emulator's host audio
path does not. The drift and tick columns above are the burst-insensitive
version of the same question, and they pass. **Re-run this table on the
phone before trusting any cadence figure.**

Not measured, and it needs the phone: **output latency** (how many
milliseconds after the scheduled instant the click actually leaves the
speaker). This is the number the low-latency finding below bears on, and it
is the one an emulator can say nothing about.

---

## What did not compile (step 3)

`DOCS_RS=1 cargo check --manifest-path src-tauri/Cargo.toml --lib --target
aarch64-linux-android` was **already clean** on this branch — M01's
target-conditional dependency block plus `#[cfg(desktop)]` did the whole
job. 1 m 33 s, zero errors, zero warnings. None of the offenders the brief
predicted (decorum, global-shortcut, updater, tray, the `floating` window,
`save_window_position`, midir handlers, aubio / `audio_input` / `onset`,
`tts.rs`) had to be touched. **Nothing was stubbed on this branch.**

One thing did not *link*, which is a different and more interesting failure:

### `oboe-sys` 0.6.1 never links the C++ runtime — the app dies at `System.loadLibrary`

The crate compiles fine, the APK builds fine, and then the app crashes
before a single line of Rust runs:

```
java.lang.UnsatisfiedLinkError: dlopen failed: cannot locate symbol "__cxa_pure_virtual"
  referenced by "/data/app/~~.../base.apk!/lib/x86_64/libyames_lib.so"...
    at java.lang.Runtime.loadLibrary0(Runtime.java:1082)
    at com.yames.metronome.WryActivity.<clinit>(WryActivity.kt:130)
```

`llvm-readelf` on the cdylib shows the C++ ABI symbols undefined with no
`DT_NEEDED` that could supply them — `__cxa_pure_virtual`,
`__cxa_guard_acquire`, `__cxa_begin_catch`, `__cxa_throw`, `_ZSt9terminatev`,
`_ZTVN10__cxxabiv117__class_type_infoE` and about a dozen more. The cause is
upstream and unambiguous; `oboe-sys-0.6.1/build.rs` lines 38-42:

```rust
    /*if cfg!(feature = "shared-stdcxx") {
        add_lib("c++_shared", false);
    } else {
        add_lib("c++_static", false);
    }*/
```

The stdc++ link is commented out, so the Oboe C++ sources get compiled and
then nothing links the runtime they need. `oboe-sys` reaches Yames through
`cpal 0.15` → `oboe 0.6.1`, i.e. through the one dependency the whole
Android audio path rests on.

**What was done to get past it** — one line in `src-tauri/build.rs`:

```rust
if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
    println!("cargo:rustc-link-lib=c++_shared");
}
```

**What M01 should do properly:** exactly this, kept, with the comment
explaining why. Two things make it cheap:

* It is already target-gated, so no desktop build sees it.
* Once the `.so` declares `libc++_shared.so` in `DT_NEEDED`, **the Tauri CLI
  notices and symlinks the NDK's copy into `jniLibs/<abi>/` by itself** —
  the build log prints `Info lib "...libyames_lib.so" requires
  "libc++_shared.so"` and then symlinks it. No gradle change, no manual copy,
  no per-ABI packaging step. (This spike copied the file in by hand first;
  that turned out to be unnecessary and the copies were removed.)

M01 should also consider pinning or vendoring the reason: if `oboe-sys` ever
fixes its build.rs, the extra `-lc++_shared` is harmless (the linker resolves
one `DT_NEEDED` either way), so the line is safe to keep indefinitely.

---

## What rendered wrong (steps 4–5)

Every screen rendered, and M03's phone layout work is clearly already in:
bottom tab bar, full-width play button, presets as a bottom sheet. Viewport
is **412 × 915 CSS px at dpr 2.625** (1080 × 2400 at density 420) — the
412 dp width the plan targets. Nothing was unusable, nothing overflowed
horizontally, no screen needed scrolling to reach its primary action.

| # | Screen | What is wrong | Screenshot |
|---|---|---|---|
| 1 | All | **No `env(safe-area-inset-top)`.** The top control row (Save preset / Finish setup / volume / overflow) sits partly under the status bar; the clock overlaps it. | `m00/beat.png` |
| 2 | All | **No `env(safe-area-inset-bottom)`.** The Android gesture-navigation pill is drawn straight through the tab bar labels — "Setlist" and "Settings" are struck through by it on every screen. | `m00/beat.png`, `m00/settings.png` |
| 3 | Whole app | **The Android Back gesture/button kills the app, mid-click.** Pressing Back while the metronome is playing finishes the activity and the process is gone (`pidof` empty), so the click stops dead. Logcat says why: `WindowOnBackDispatcher: OnBackInvokedCallback is not enabled for the application` / `Set 'android:enableOnBackInvokedCallback="true"' in the application manifest`. A metronome on a music stand must not be one stray edge-swipe from silence. | — |
| 4 | Beat | Cosmetic: the app was left displaying BPM 80 after the backend had been set to 120 over IPC. Probably just that a direct `set_bpm` invoke does not round-trip to the React state the same way the UI's own path does; not reproduced through the UI, so recorded as "unconfirmed", not as a bug. | `m00/beat.png` |

Screens captured and verified: onboarding first screen
(`m00/onboarding-welcome.png`), beat (`m00/beat.png`), drill
(`m00/drill.png`), setlist (`m00/setlist.png`), settings
(`m00/settings.png`), presets/library bottom sheet (`m00/library-sheet.png`),
zen (`m00/zen.png`).

Two things worth calling out as *right*:

* **Settings has no coach section and no input/devices half** — the cut is
  visible in the built artifact, not just in the source.
* **The presets sidebar is already a bottom sheet** on phone width, which is
  what plan §6 open question 1 recommended. It opens over whatever tab you
  are on, so it does not lose the beat view. Consider that question closed.
* Zen renders fullscreen and correctly, on the emulator's software GL. The
  plan's §6 worry about canvas zen effects on a low-end device is untested —
  an emulator says nothing about it.

---

## IPC calls that reject on Android (steps 4–5)

**None unexpectedly.** All 89 registered commands were invoked directly from
the WebView with empty arguments and every one answered; none panicked, none
hung, and the app stayed up throughout. M01's `commands/mobile.rs` is doing
its job.

Commands answering `not available on this platform` (M01's `NOT_AVAILABLE`,
never shown to a musician) — 22:

| Area | Commands |
|---|---|
| MIDI | `connect_midi_device`, `disconnect_midi_device`, `set_midi_binding`, `clear_midi_binding` |
| Mic evaluation | `start_evaluation`, `stop_evaluation`, `start_recording`, `start_playback` |
| Session store | `save_session`, `delete_session`, `clear_all_sessions`, `get_session_log`, `export_session_logs` |
| Coach / models | `get_model_status`, `write_model_chunk`, `get_models_path`, `delete_models`, `start_model_download`, `load_coach_model`, `coach_generate`, `get_coach_capabilities` |
| Voice | `tts_speak`, `start_voice_repair` |

Window-manager commands (`set_widget_mode`, `set_always_on_top`,
`set_widget_always_on_top`, `show_main`, `show_floating`,
`save_window_position`, `app_ready`) are silent no-ops, as designed.

Everything the metronome itself needs works: `get_state`, `set_bpm`,
`set_subdivision`, `set_beat_groups`, `set_sound_type`, `set_volume`,
`toggle_playback`, `set_playing`, `set_theme`, `set_instrument`,
`configure_speed_ramp` / `start_speed_ramp` / `stop_speed_ramp`,
`arm_count_in`, `set_accent_mode`, `set_active_tab` / `get_active_tab`,
`list_presets` / `save_preset` / `delete_preset` / `reorder_presets`,
`save_drill_run` / `get_drill_runs`, `list_audio_output_devices` /
`set_audio_output_device`.

Two small gaps for M01/M02 to decide on, neither a blocker:

* `get_system_memory_mb` returns **0** on Android. Harmless today (it exists
  to size the coach's brain tier, and there is no coach), but if anything
  else ever reads it, 0 is a lie rather than a refusal. Either make it real
  (`/proc/meminfo`) or make it refuse.
* `list_audio_input_devices` returns `[]` and `get_waveform` returns `[]`
  rather than refusing. Fine as long as nothing on the mobile side calls
  them — M02's import-graph test is the real guard.

`list_audio_output_devices` returns real devices from cpal/Oboe, e.g.
`{"name":"sdk_gphone64_x86_64","isDefault":false,...}` — note **no device
reports `isDefault: true`**, which the sound-output settings section may not
expect. Worth a glance in M03.

---

## Background behaviour (step 5) — emulator only

Measured with the probe still recording, so "kept playing" is not an
impression, it is a callback count.

* **App switch / Home:** survives. Home, 40 s, then another app on top for
  30 s: process alive, `isPlaying` still true, 3 067 callbacks recorded in
  71.0 s at the same ≈43 /s as the foreground, exactly 143 ticks. No audible
  or statistical change.
* **Screen off:** survives for at least 80 s. `KEYCODE_POWER`,
  `mWakefulness=Dozing`, and the audio output thread stayed out of standby;
  3 421 callbacks in 79.7 s, 160 ticks, drift 15.6 ms. **This result must not
  be believed for a real phone.** An emulator does not do real Doze, does not
  do app-standby buckets, and has no OEM battery manager. The plan's
  expectation ("expect: no, that is M04's job") is untested, not disproved.
* **Incoming call / audio interruption:** not testable on this AVD. Pending
  device.
* **Back button:** does *not* survive — see "What rendered wrong" item 3.
  This is the one background-behaviour result that is a property of the app
  and not of the emulator, and M04 should own it alongside the foreground
  service.

The audio path, from `dumpsys audio` while playing:

```
AudioPlaybackConfiguration piid:159 deviceId:2 type:AAudio u/pid:10192/7183 state:started
  attr: usage=USAGE_MEDIA content=CONTENT_TYPE_UNKNOWN source=DEFAULT flags=0x0
  FormatInfo{isSpatialized=false, channelMask=0x3, sampleRate=44100}
```

`type:AAudio` confirms Oboe chose AAudio over OpenSL ES on API 34, and
`usage=USAGE_MEDIA` means the click follows the media volume slider, which
is the right stream for a metronome. **Audibility could not be confirmed by
ear** — the emulator routes to the host's sound device and this session had
no way to listen. What can be said is that the audio server reports the
stream `started` and routed to the speaker, the mixer thread is out of
standby, and the engine rendered the exact expected number of clicks into it.
Confirming the click is actually audible, and at a usable volume, is
pending device.

---

## cpal / Oboe performance mode (step 7)

**cpal 0.15.3's Oboe backend never requests AAudio's low-latency mode.** A
grep for `set_performance_mode`, `set_sharing_mode`, `set_usage`,
`PerformanceMode` and `SharingMode` across the whole of
`cpal-0.15.3/src/host/oboe/` returns **nothing**. The stream is built with
only direction and format:

```rust
// cpal-0.15.3/src/host/oboe/mod.rs:436-441
            SampleFormat::F32 => {
                let builder = oboe::AudioStreamBuilder::default()
                    .set_output()
                    .set_format::<f32>();
```

and configured with only device id, sample rate and (optionally) capacity:

```rust
// cpal-0.15.3/src/host/oboe/mod.rs:205-220
fn configure_for_device<D, C, I>(
    builder: oboe::AudioStreamBuilder<D, C, I>,
    device: &Device,
    config: &StreamConfig,
) -> oboe::AudioStreamBuilder<D, C, I> {
    let mut builder = if let Some(info) = &device.0 {
        builder.set_device_id(info.id)
    } else {
        builder
    };
    builder = builder.set_sample_rate(config.sample_rate.0.try_into().unwrap());
    match &config.buffer_size {
        BufferSize::Default => builder,
        BufferSize::Fixed(size) => builder.set_buffer_capacity_in_frames(*size as i32),
    }
}
```

`oboe::AudioStreamBuilder::default()` goes straight to the C++
`AudioStreamBuilder` constructor, whose `mPerformanceMode` default is
`PerformanceMode::None` — documented in the Rust binding as
`/** No particular performance needs. Default. */`
(`oboe-0.6.1/src/definitions.rs:208-222`). The setter exists
(`oboe-0.6.1/src/audio_stream_builder.rs:313`, `set_performance_mode`); cpal
simply never calls it. This is confirmed on the device, not just in the
source: the audio server reports the stream with `flags=0x0` — no
`AUDIO_OUTPUT_FLAG_FAST`, no `RAW`.

**The second finding is worse and was not in the plan.** cpal picks the
sample rate through `default_output_config()`, which sorts the supported
configs by `cmp_default_heuristics` and takes the best. That comparator
prefers stereo, then f32, and then — explicitly —
any range containing 44 100 Hz:

```rust
// cpal-0.15.3/src/lib.rs:730-736
        const HZ_44100: SampleRate = SampleRate(44_100);
        let r44100_in_self = self.min_sample_rate <= HZ_44100 && HZ_44100 <= self.max_sample_rate;
        let r44100_in_other =
            other.min_sample_rate <= HZ_44100 && HZ_44100 <= other.max_sample_rate;
        let cmp_r44100 = r44100_in_self.cmp(&r44100_in_other);
        if cmp_r44100 != Equal {
            return cmp_r44100;
        }
```

The Android backend does not ask the device its native rate at all; it
brute-forces a fixed list of 13 candidate rates through
`AudioTrack.getMinBufferSize` (`mod.rs:35-37`, `default_supported_configs`
at `mod.rs:104`), each becoming its own single-value range. So 44 100 always
wins if it is supported, whatever the device actually runs at. Measured here:

```
[yames][m00] cpal negotiated: 44100 Hz, 2 ch, format F32,
             supported buffer Range { min: 32096, max: 2147483647 }
[yames][m00] cpal stream config: buffer_size Default
```

against a device mixer reported by `dumpsys media.audio_flinger` as
`Sample rate: 48000 Hz, HAL frame count: 1088`. **Yames therefore opens a
44.1 kHz stream into a 48 kHz device and Android resamples every click.**
AAudio will not grant the fast path for a stream that needs resampling, so
this and the missing `PerformanceMode::LowLatency` compound: even if cpal
added the performance-mode call tomorrow, the rate mismatch would still
block the low-latency path.

Note also `min: 32096` — the smallest buffer cpal is willing to report
(`getMinBufferSize` in bytes, i.e. ~4 012 frames of stereo f32, ~91 ms).
`BufferSize::Fixed` through cpal is therefore not a route to a small buffer
either.

**Conclusion.** The §6 fallback — "drive the `oboe` crate directly behind
`cfg(target_os = "android")`" — should be treated as the expected path, not
the contingency. It is not a large change: Yames already renders into a
pull-model callback, so what is needed is an Android-only stream builder that
calls `set_performance_mode(PerformanceMode::LowLatency)`,
`set_sharing_mode(SharingMode::Exclusive)`, and sets the sample rate from
`AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE` / `AAudioStreamBuilder` defaults
(i.e. ask for the device's rate rather than 44 100) and the frames-per-burst
from `PROPERTY_OUTPUT_FRAMES_PER_BUFFER`. `SoundBank::new(sample_rate)`
already decodes at whatever rate the stream opens at, so nothing downstream
of the device open has to change. The decision point is a measurement on the
phone: **measure output latency on hardware with cpal first**; if it is
comfortably under ~20 ms, leave cpal alone, and if it is not, do the above.

---

## Build, packaging and tooling facts

**The commands that worked** (Windows 11, from the worktree; the environment
in the brief exported in every shell):

```sh
# type-check (no NDK needed thanks to DOCS_RS)
DOCS_RS=1 cargo check --manifest-path src-tauri/Cargo.toml --lib \
  --target aarch64-linux-android                                    # 1m33s, clean

# build an installable APK for the emulator
npm run tauri -- android build --apk --debug --target x86_64

adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb shell am start -n com.yames.metronome/.MainActivity
```

Note the `--` after `npm run tauri`: without it npm eats `--apk`.
`scripts/tauri.mjs` did the right thing unprompted — it printed
`[tauri] YAMES_MOBILE=1 for \`tauri android\` (no coach in a phone build)`
and injected no `--features`. `YAMES_DEV_NO_LLM=1` was not needed anywhere,
exactly as the mobile README says.

**`tauri android dev` was never run.** Port 1420 was in use for the whole
session by the owner's own desktop dev server
(`cargo run --features coach-llm-vulkan`, PID 26616 listening on
`[::1]:1420`), and the brief forbids starting a second one. Everything above
was done against installed debug APKs. That also means **the dev-server
workflow on Android is unverified** — including `adb reverse tcp:1420
tcp:1420`, which M03 will want.

**Build times.**

| | Wall clock | What it included |
|---|---|---|
| Cold | **7 m 00 s** | frontend build 3.8 s · Rust x86_64 from scratch 1 m 00 s · a second Rust pass by gradle's `android-studio-script` 23 s · **downloading Gradle 8.14.3** · installing SDK Build-Tools 35 and Platform 36 · gradle configure + Kotlin compile + package |
| Warm (one-line build.rs change + two source edits) | **39 s** | frontend 2.6 s · Rust relink 15.2 s · gradle 0.8 s Rust + package |

Two things inflate the cold number and will not recur: the Gradle
distribution download, and the SDK component installs. A genuinely cold build
on a machine that already has those should be ~2 minutes. Note that
`tauri android build` **compiles the Rust lib twice** — once itself, then
again via the gradle `android-studio-script` task. It is cheap the second
time (cargo is up to date) but it is not free, and M05's CI budget should
know about it.

**APK size.** The debug APK is **264 MB on disk**, which is misleading three
times over:

* `lib/x86_64/libyames_lib.so` is **128 MB** — an unstripped debug cdylib,
  stored uncompressed. `llvm-strip --strip-all` takes the same library to
  **14.5 MB**.
* The zip's central directory only accounts for 137 MB of the 264 MB; the
  rest is an orphaned copy of the previous build's library that gradle's
  incremental packaging left in the file without unlinking it. A clean build
  would not have it.
* It is a `universal` APK containing one ABI, because `--target x86_64` was
  passed; a real release carries four.

So **no meaningful APK size was measured** and none should be quoted from
this document. On the stripped figure, a single-ABI release APK should land
somewhere around 15–20 MB and a four-ABI universal one around 60–80 MB,
which is a guess, not a measurement. **M05 must measure a real signed
release build**; this spike deliberately did not, because a release profile
build would have competed with the owner's release work for the machine.

**Generated project facts** (`src-tauri/gen/android`, as `tauri android init`
made it): `minSdk 24`, `targetSdk 36`, `compileSdk 36`, Gradle 8.14.3,
Kotlin 2.0.21, applicationId `com.yames.metronome`. The manifest requests
only `INTERNET`, declares AndroidTV leanback support (harmless, but M05 may
want it gone), and sets no orientation lock — plan §1 says portrait-only in
v1, so `android:screenOrientation="portrait"` is still to be added.

**Settings persistence: confirmed.** `tauri-plugin-store` writes
`/data/data/com.yames.metronome/settings.json` — note the app data *root*,
not `files/`. Changing BPM to 143, theme to `neon`, subdivision to 3, the
active tab to `drill` and saving a preset, then `am force-stop` and
relaunching, brought all five back exactly:
`{"bpm":143,"theme":"neon","subdivision":3,"tab":"drill","presets":1,"presetName":"M00 spike"}`.
The onboarding state (`onboarding.version`, `whatsNew.seenVersion`) persists
too.

**The WebView** is Chrome/113 on this AVD image (`V8 11.3`) — old. A current
phone ships something far newer, so this emulator is a *pessimistic* CSS/JS
target, which is useful: everything rendered correctly on it. Remote
debugging works and was how all of this was driven:
`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, then the
DevTools protocol. Worth writing into the mobile README as the standard way
to inspect a phone build, since there is no dev console otherwise.

**Logcat — every warning and error the app produced.** No app-level errors
at all; nothing from `RustStdoutStderr` except the engine's own `[yames]`
lines. The complete list, all of it Android/WebView boilerplate:

| Level | Message | Matters? |
|---|---|---|
| W | `WindowOnBackDispatcher: OnBackInvokedCallback is not enabled for the application` + `Set 'android:enableOnBackInvokedCallback="true"' in the application manifest` | **Yes** — the Back-kills-the-click problem above |
| W | `cr_media: BLUETOOTH_CONNECT permission is missing` / `registerBluetoothIntentsIfNeeded: Requires BLUETOOTH permission` | No — Chromium's own media stack, not Yames' audio |
| W | `OpenGLRenderer: Failed to choose config with EGL_SWAP_BEHAVIOR_PRESERVED, retrying without...` + E `Unable to match the desired swap behavior` + W `Failed to initialize 101010-2 format` + W `Unknown dataspace 0` | No — emulator software GL |
| W | `yames.metronome: Unexpected CPU variant for x86: x86_64` | No — ART on an x86_64 emulator |
| W | `ziparchive: Unable to open '.../base.dm': No such file or directory` | No — no dex metadata in a debug APK |
| W | `Accessing hidden method Landroid/os/Trace;->...` (6 lines), `ViewGroup;->makeOptionalFitsSystemWindows` | No — AndroidX reflection, "allowed" |
| W | `chromium: Failed to read DnsConfig` | No |

One cosmetic Rust-side log to clean up: the engine prints
`[yames] CoreAudio output latency: 0 frames (0.0ms) + buffer` on Android.
Harmless and never user-visible, but it will mislead whoever reads a phone
log next. Wrap it in `cfg(target_os = "macos")` in M04.

---

## How the measurement was wired (so M04 can redo it)

Three edits on the spike branch, all temporary except the first:

1. `src-tauri/build.rs` — the `c++_shared` link (see above). **Keep this one.**
2. `src-tauri/src/engine.rs` — two `eprintln!`s after the cpal config is
   negotiated, printing sample rate, channels, format and buffer size.
3. `src-tauri/src/lib.rs` — build the engine with
   `MetronomeEngine::new_with_probe(beat_log, probe)` instead of `new`,
   `app.manage` the probe, and register one command:

```rust
#[tauri::command]
fn dump_callback_probe(probe: tauri::State<'_, M00Probe>) -> serde_json::Value { ... }
```

The probe was sized at 300 000 slots (overflow 0 in every run). **The
callback still allocates nothing and locks nothing** — `CallbackProbe` was
built for exactly this and was used the way `click-jitter-probe` uses it.
The one difference from the desktop probe: the samples are read while the
stream is still live rather than after `shutdown()`, so
`dump_callback_probe` filters slots whose index was claimed by the writer's
`fetch_add` but whose stores have not landed (`entry_ns == 0`).

Calling the command needed no UI: `adb forward` to the WebView's DevTools
socket, then `Runtime.evaluate` of
`window.__TAURI_INTERNALS__.invoke('dump_callback_probe')`. Note for
whoever tries to instrument the frontend this way — **`__TAURI_INTERNALS__.invoke`
is a non-configurable property and cannot be monkey-patched**
(`TypeError: Cannot redefine property: invoke`), so passive IPC tracing from
the console is not possible; call commands directly instead.

---

## Time spent per step

Wall clock, single session, one agent, with the emulator and the owner's
desktop dev build sharing the machine.

| Step | Time | Note |
|---|---|---|
| 1–2 Worktree, scaffold | 0 | Already committed on the branch |
| 3 `cargo check` for Android | ~5 min | Passed first time; M01 had done the work |
| 4a First APK build (cold) + install | ~15 min | Including the Gradle/SDK downloads |
| 4b Diagnosing the `__cxa_pure_virtual` crash | ~20 min | readelf → oboe-sys build.rs → one-line fix |
| 4c Rebuild, boot, screenshots, IPC probe of all 89 commands | ~35 min | DevTools-over-adb harness built here, reusable |
| 5 Physical phone | — | **Pending device** |
| 6 Measurement (3 × 60–80 s windows + analysis) | ~30 min | Instrumentation ~15 min of that |
| 7 cpal/Oboe source reading | ~15 min | Turned up the 44.1 kHz finding as well |
| 8 Findings file | ~25 min | |

**For correcting the plan's estimates:** M00 was budgeted at 1 week and the
emulator half took an afternoon, because M01 had already removed everything
that would have gone wrong. The single blocker (`oboe-sys`) cost 20 minutes
once the error was in hand. M04's estimate of 1 week now looks *light* rather
than generous, because it has acquired three items it did not have:
the back-button/foreground-service interaction, the likely direct-`oboe`
rewrite of the device open, and the real output-latency measurement.

---

## Open questions for M01 / M02

1. **M01 — keep the `c++_shared` link line.** It is the only thing standing
   between a phone build and a crash at `System.loadLibrary`, and it is
   invisible to desktop. Add it with the `oboe-sys` citation.
2. **M01 — is there a gate that would have caught this?** `cargo check` and
   even `cargo build` pass; only `dlopen` on a device fails. The cheapest
   guard is a CI step that runs `llvm-readelf --dyn-syms` on the built
   `.so` and fails on any undefined symbol with no `DT_NEEDED` to supply it.
   Recommend adding it in M05's Android CI draft.
3. **M04 — Back must not kill the click.** Decide the behaviour: Back
   minimises rather than finishes while playing, or Back is consumed by an
   in-app navigation stack. Related manifest flag:
   `android:enableOnBackInvokedCallback="true"`.
4. **M04 — plan for the direct `oboe` device open.** See step 7. The decision
   is a latency measurement on hardware, but the work should be budgeted now.
5. **M02 — `get_system_memory_mb` returns 0 on Android**, and
   `list_audio_input_devices` / `get_waveform` return empty rather than
   refusing. Confirm nothing in the mobile import graph reads them, or make
   them refuse.
6. **M03 — safe-area insets are the single biggest visual gap.** Both edges,
   every screen. `viewport-fit=cover` plus `env(safe-area-inset-*)` padding
   on the header and the tab bar.
7. **M03 — `list_audio_output_devices` reports no device as `isDefault`.**
   Check the sound-output settings section handles that.
8. **M05 — measure a real signed release APK.** Nothing in this document is a
   usable size figure.
9. **Still needed from the phone, and only from the phone:** output latency,
   audibility and usable volume, real Doze / battery-manager behaviour with
   the screen off, interruption by an incoming call, and zen-effect
   performance. Steps 5 and the hardware half of 6 stay **pending device**.
