# T05 — Coach voice on Windows and Linux

Size: M. Branch: `phase0/t05-voice-xplat`. Parallel-safe.

## Goal

Piper TTS works on all three platforms and speech is played through
the app's own audio output path, not `afplay`.

## Facts

- `src-tauri/src/tts.rs` runs Piper as a subprocess to write a WAV, then
  plays it with `afplay` (macOS) and falls back to macOS `say`. There is
  no `cfg(target_os)` branching; on Windows/Linux the spawn fails.
- `tts.rs::piper_binary_url()` (~line 748) picks a macOS tarball using
  `uname -m` at runtime.
- `models.rs` downloads the Piper tarball (`MIN_PIPER_TARBALL_BYTES`
  sanity check ~line 285) and voices (`.onnx` + `.onnx.json`, size
  floors `MIN_ONNX_BYTES`, `MIN_ONNX_JSON_BYTES`).
- Metronome volume is dimmed during speech via `TtsDimState` refcount
  in `tts.rs` and `commands.rs::tts_speak`; `ttsSpeak` is called from
  `useSession.ts`. The "speech started" event drives UI text reveal
  (`onTtsSpeechStarted`).
- rodio is already a dependency (`rodio 0.19`, `wav` feature) and the
  engine uses cpal directly; the input tester already plays back
  recorded audio (`audio_input.rs` playback path) — reuse its device
  selection logic so speech goes to the user's chosen output device.
- Piper releases: `rhasspy/piper` 2023.11.14-2 has
  `piper_windows_amd64.zip`, `piper_linux_x86_64.tar.gz`,
  `piper_linux_aarch64.tar.gz`, `piper_macos_*`. Newer builds live at
  `OHF-Voice/piper1-gpl` (GPL-3, compatible with Yames' GPL-3). Linux
  Piper needs `espeak-ng-data`, included in the Piper archive.

## Steps

1. `piper_binary_url()` → per-OS/arch URL table (`cfg!(target_os)` +
   runtime arch check on macOS as today). Windows gets the `.zip`;
   extraction in `models.rs` must handle zip (add the `zip` crate or
   shell out to `tar` — Windows 10+ ships `tar.exe` that reads zip).
   Executable name is `piper.exe` on Windows.
2. Replace `afplay` playback with in-process playback: decode the WAV
   Piper wrote and play it on a dedicated non-audio-callback thread via
   rodio (or the existing playback path in `audio_input.rs` if it fits)
   on the selected output device. Keep the current semantics:
   `on_ready_to_play` fires when playback starts; interruption
   (`ttsStop`, generation counter) stops playback promptly; the dim
   refcount releases when playback ends or errors.
3. macOS `say` remains a fallback only on macOS. On Windows/Linux, when
   Piper is missing or broken, `ttsSpeak` returns an error that the
   frontend already tolerates (the feed shows the text; verify).
4. `ttsVoiceDiagnostics` / `startVoiceRepair` report OS-specific hints
   (e.g. missing `espeak-ng-data` on Linux).
5. Tests: unit test the URL table; a Rust test that plays a 100 ms
   generated sine through the new playback path without panicking
   (skip when no output device).

## Acceptance

- On the OS you are on: download voice via Settings, hear a greeting,
  metronome dims during speech and restores after, `ttsStop` cuts speech
  within ~100 ms.
- State which OSes you could not test; the owner will run the manual
  matrix.
- Existing vitest cases for TTS gating in `useSession`/gatekeeper still
  pass.

## Do not

- Do not touch the metronome engine's cpal stream.
- Do not change voice IDs or the download UI beyond what's needed.
