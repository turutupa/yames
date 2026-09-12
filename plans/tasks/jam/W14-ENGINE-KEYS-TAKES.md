# W14 — the engine, fourth pass: the keys, the mix, the sticks, and the take

Branch: `jam-w14-engine-keys-takes`, from `jam` AFTER W11 has merged. Your
area is `src-tauri/` only. Read `plans/tasks/jam/BRIEF.md`,
`INTEGRATION-NOTES.md`, the engine briefs W1, W7, W11 for what exists,
`plans/JAM_MODE.md` §3, §4.1, §4.3, §4.4, §6, and the contract in
`src/jam/types.ts` (`JamKeysLine`, `JamMix`, `JamCountInSound`,
`JamTake`) and the take commands at the end of `src/ipc.ts`.

Read the callback's rules before touching it: no allocation, no lock wait,
tables and everything handed to the audio thread go through a handoff and
come back through retirement; every form change lands at the bar line.

## What to build

### 1. The keys

- `keys.voicings[tick]` is up to four MIDI notes (48–84) or empty. A
  synthesised comping voice: soft electric-piano-ish tone (sine
  fundamental, a touch of 2nd and 3rd harmonic decaying faster, ~700 ms
  exponential decay, a 3 ms attack), one bank of 37 notes built at bank
  time. A voicing spawns one voice per note, capped to ring until the next
  non-empty voicing or the end of the bar. Gain `keys.gain × mix.keys ×
  intensity × volume`, and the per-table normalisation includes the keys.
- Keep it under the band: measure and note the keys' level against the
  snare accent through the small-speaker band-pass; it should sit 6 dB or
  more below.

### 2. The mix

`mix.drums`, `mix.bass`, `mix.keys` multiply their lanes when the table is
compiled (resolved into the slots; the audio thread never reads the mix).
Validate 0..1.5, clamp.

### 3. The sticks

`countInSound: "sticks"`: the count-in (the warmup path) plays the loaded
kit's rim voice at the beat-gain instead of `BeepHigh`, on beats only, as
today. With no table loaded the beep stays. Decided when the count-in is
armed or the table changes, never per tick.

### 4. The take

Opt-in, local, private (ROADMAP §4 privacy rule; the
`cfg(debug_assertions)` guard on `session_audio.rs` is for diagnostic
recordings and stays; this is a feature the user turns on per jam).

- `start_take(jam_id)`: begin capturing (a) the mic input the onset
  detector already receives (see `audio_input.rs`: the input stream, its
  ring buffer, and the `start_recording` path the input tester uses, which
  caps at ten seconds — a take needs a growing buffer on the INPUT thread,
  not the audio output callback, written to disk by a writer thread in
  chunks; if input is not running, start it the way the evaluation does,
  or reject with a message the UI can show) and (b) the band: the output
  callback copies its rendered mix into a preallocated lock-free ring
  (allocate once at start_take on the command thread, hand the ring to
  the callback through the same handoff pattern; the callback only writes
  into it and never allocates), drained by the writer thread. The writer
  mixes mic and band at unity into one mono WAV at the output rate
  (resample the input if the rates differ; a simple linear resampler is
  fine) under `<app data>/takes/<jam_id>/<timestamp>.wav`, plus a sidecar
  JSON with the `JamTake` record.
- `stop_take()`: finalise, return the `JamTake`. `list_takes(jam_id)`,
  `delete_take(id)` (removes both files).
- `play_take(id)`: decode the WAV into an `Arc<Vec<f32>>` on the command
  thread, hand it to the callback, which streams it as one voice while the
  band is muted (the click too); emit `take-playback-ended` when it ends;
  `stop_take_playback()`. The Arc retires like a table.
- Storage cap: refuse to start a take over 20 minutes, and report the
  directory size in `list_takes` so the UI can show it.

### 5. Tests and gates

Unit tests for the keys bank (37 notes, fundamentals within a cent, level
under the snare), the mix clamp, the sticks decision, the take writer
(mixes two known signals to the expected WAV, resamples a 44.1 kHz input
against a 48 kHz output within tolerance), and the take-playback voice.
All BRIEF.md gates, plus the probe with `--jam-swap` and with a take
recording during the run (add a flag; say which) — zero missed beats,
zero dropouts.

## Rules

No allocation on the audio thread. No edits under `src/`. Never start
the app. Hyphenated branch. Commit on your branch, do not push or merge.
