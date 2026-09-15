# W2 — the click on outputs 3-4

Worktree `C:\Users\alber\Dev\yames\.claude\worktrees\feedback-52-w2`,
branch `feedback-52-w2-output-pair` from `feedback-52`. Read the shared
BRIEF, then in `src-tauri/src/engine.rs`: `AudioOutputDevice` and
`list_output_devices`, `set_device` / `set_device_name` / `device_name`,
`ensure_thread` (device pick, `default_output_config()` taken verbatim,
`channels`, `frames = data.len() / channels`), the callback's mix write
(`base = frame_idx * channels`, the `ch % 2` broadcast), the take
playback write and the take recorder's `push_strided`, and the
hot-plug poll that emits `audio-devices-changed`. Then
`src-tauri/src/audio_input.rs`: how `AudioInputDevice.channels` is
computed from the **max over `supported_input_configs()`** (not the
default config — that under-reports on interfaces), how the requested
channel widens `StreamConfig.channels`, and the playback path's
two-attempt clamp with its comment about devices that *claim* four
channels and deliver two. Then `tts.rs::play_wav_path` and
`select_output_device`, `commands.rs::tts_speak` (the dim), `take.rs`
and the engine's take playback (how a decoded buffer is handed to the
callback and how completion is signalled — the `wait_until` counters).
Frontend: `src/ipc.ts` (`listAudioOutputDevices`,
`setAudioOutputDevice`), `src/types.ts` (`AudioOutputDevice`),
`src/test/mocks.ts`, `src/components/ChannelDropdown.tsx`,
`src/components/AudioOutputDropdown.tsx`, `src/containers/settings/
DevicesSettingsSection.tsx`, `src/containers/main-window/hooks/
useAudioOutputDevices.ts` and where it is wired in `SettingsView.tsx`
and `MainWindow.tsx`. The persisted keys live in `commands.rs`
(`audioOutputDevice`) and are restored in `lib.rs`.

## What the user gets
In Settings › Devices, under the output device, a second dropdown
appears **only when the chosen device has more than two outputs**:
"Outputs 1-2", "Outputs 3-4", "Outputs 5-6"… Default 1-2. Everything
the app plays — the click, the jam band, take playback, the coach's
voice — comes out of that pair and nothing else. Changing the pair never
stops the metronome. The choice is remembered **per device**, so
switching back to the interface brings its pair back.

## 1. The engine
- `AudioOutputDevice` gains `channels: u16` computed like the input
  side's (max over `supported_output_configs()`), and the list command
  returns it.
- The engine carries `output_pair` beside `device_name`, in an atomic
  the callback reads **once per buffer** (no lock, no allocation — the
  click is sacred). Setter/getter like the device name's.
- Stream config: when `2 * (pair + 1)` exceeds the default config's
  channel count, search `supported_output_configs()` for a config at
  the default sample rate with at least that many channels (mirror the
  input side). If none, or if the stream fails to build with it, **fall
  back to pair 0 on the default config** and say so: the setter returns
  the pair actually in effect, and the engine emits
  `audio-output-pair-fallback` so the UI can show the dropdown at 1-2
  with a note. Keep the defensive shape `audio_input.rs` uses for
  devices that claim more than they deliver.
- **Changing the pair restarts nothing** when the new pair fits the
  open stream's channel count; when it does not, restart the thread
  the way `set_device` does (and only then).
- The mix write: L and R at `base + 2*pair` and `base + 2*pair + 1`,
  **zeros on every other channel**. Mono devices unchanged. Same for
  the take playback write. The take recorder's read-back must read
  the pair's channel, not channel 0, or a take on 3-4 records silence.
- Unit tests in `engine.rs`: the mix write on 2-, 4- and 6-channel
  buffers for each pair (the pair carries the signal, the rest are
  zero, frames counted right); a pair beyond the buffer's channels is
  clamped to 0; the read-back stride/offset; the config search picks
  a wider config at the same rate and falls back cleanly.

## 2. The coach's voice follows the pair
`play_wav_path` plays speech through rodio's own stream on the device's
default config, and rodio 0.19 offers no channel control. Replace it.
The right shape is **the engine's own stream**: decode the WAV with
`hound` (already a dependency), resample to the engine's rate the way
kit samples are (find the resampler the kit loader uses), and hand the
buffer to the callback the way a take is handed — mixed after the click
bus at the speech volume, on the selected pair, with completion
signalled back through the same counter pattern takes use, so
`play_wav_path` keeps its contract (`PlaybackEnd::Finished` /
`Interrupted`, the 20 ms `should_continue` poll, the dim in
`tts_speak` untouched). One device, one stream, one pair for everything
the app says. Buffers are allocated *before* they reach the callback,
never inside it.

If you find a blocker in the engine path (say what it is), fall back to
a raw cpal stream built from the same config search as §1 with the same
pair write — but the engine path is the one to try first, and the
report says which you shipped and why.

`rodio` may then have no remaining user; if so remove the dependency
and say so. The input tester's playback in `audio_input.rs` is a
diagnostic with its own device and stays as it is.

## 3. Commands and persistence
- `set_audio_output_pair(pair: u16) -> u16` (returns the pair in
  effect). Persisted as `audioOutputPairs`, a map from device name to
  pair, so the choice is per device; on `set_audio_output_device` the
  engine applies the stored pair for that device (0 when none).
  Restored on boot in `lib.rs` next to `audioOutputDevice`.
- `list_audio_output_devices` returns `channels`.
- IPC wrappers, types and `mocks.ts` updated.

## 4. The screen
- A pair dropdown in the same `midi-dropdown` markup as
  `ChannelDropdown` — a sibling component or a mode on it, your call —
  under the output device row in `DevicesSettingsSection`, gated on
  the selected device's `channels > 2`. Options `t("settings.devices.
  outputsPair", { a, b })` → "Outputs {{a}}-{{b}}"; label
  `settings.devices.outputPair` ("Outputs"). On the fallback event the
  dropdown shows 1-2 and a one-line note
  `settings.devices.outputPairFallback` ("This device only delivered
  two outputs, so the click plays on outputs 1-2").
- `useAudioOutputDevices` carries the pair, applies the stored one
  when the device changes, listens for the fallback event, and resets
  on hot-unplug the way it resets the device.
- Locale keys in all fifteen `settings.json` files. Musicians' words:
  outputs, not channels.

## 5. Tests
- Rust: §1's unit tests; the speech path decodes, resamples and
  reports completion in a headless engine (the take tests show how).
- Vitest: the dropdown appears only for a device with more than two
  outputs; the hook applies the per-device pair and handles the
  fallback event; `mocks.ts` shape.

## Gates and honesty
`npm run test:rust` (MSVC runner: export `LIBCLANG_PATH="C:/Program
Files/LLVM/bin"` and a short `CARGO_TARGET_DIR` such as `C:\yt52`; the
repo's rustup override picks MSVC), `npm run test:dsp`, `npm run
test:highbpm`, the jitter probe `bun run yames:jitter-probe -- --no-llm`
on a quiet machine (another worker may be building; note the load if a
number looks off), `npx tsc --noEmit`, `npx vitest run` (restore the
onboarding snapshot). Do not start the app.

This machine has no four-output interface. Say in the report exactly
what the tests prove (the pair write, the config search, the fallback)
and what only the reporter's UMC204HD can prove (that CoreAudio exposes
its four outputs in one device and that they open at the same rate).
