# W29 — the engine: a bar that waits for the bar line, a form that ends, recorded bass and keys

Branch `jam-v4-w29-engine` from `jam-v4`. Read the shared BRIEF's contract
first. Area: `src-tauri/**`. The audio-thread rules are absolute.

## 1. `applyAt` and `endsForm`
- `JamConfig.apply_at: Option<ApplyAt>` (`"now"` default, `"barLine"`).
  `jam::swap_defers` today holds a bass-only table for the bar line and
  lets a drum change through at once; with `apply_at == BarLine` the whole
  table waits, drums included. The generation handshake, retirement and the
  gain memo are untouched.
- `JamConfig.ends_form: Option<bool>`. When the bar that carries it
  completes, the engine stops as `set_playing(false)` would (count-in
  disarmed, take finished cleanly, `is_playing` false) and the command
  thread emits `jam-ended`. A jump or loop command received before the bar
  completes cancels the ending.
- Tests for both, including "a barLine table sent at the downbeat plays on
  the NEXT downbeat and not this one" measured on the tick grid, and "an
  ending during a take leaves a whole take".

## 2. Melodic banks
- `build.rs` also walks `sounds/voices/*/voice.json` (same generated file).
- A `VoiceBank` for a melodic voice: for every MIDI note the band can ask
  for (the bass range 28–60 and the keys range the keys line uses today),
  `layers × rr` buffers built at load from the nearest sampled note by
  resampling (the kit resampler; never further than ±3 semitones, else the
  next sampled note), `trim_db` applied, level decided on the source peak
  (the rule `kit.rs` now follows), `release_ms` as a raised-cosine fade
  applied when the line's cap ends the note (the caps `jam.rs` already
  applies to bass and keys).
- Voice resolution: `JamBassVoice::Fingered` → recorded `bass_fingered`
  when shipped, else the synthesised recipe (today's); same for picked,
  upright, slap; `JamKeysVoice::Epiano` → `epiano` when shipped. Organ,
  clav, pad, synth: synthesised, unchanged.
- Level match: through the small-speaker band-pass, a recorded bass at the
  line's gain 1.0 lands within 1 dB of where the synthesised fingered bass
  landed; the keys likewise against the synthesised e-piano. Measured in a
  test, printed in the report.
- Until W33's real banks exist, build a temporary `bass_fingered` from the
  synthesised bass recipe (render the 28 notes to files in the format) in
  the scratchpad, never under `src-tauri/sounds/voices/`, and delete it
  before your final commit. Decode time for a 3 × 2 bank of 12 sampled
  notes: report it.

## 3. Gates
`npm run test:rust`, dsp, highbpm, `npx tsc --noEmit`, `npx vitest run
src/ipc.commands.test.ts`, the probe with `--jam --jam-swap --jam-move
--jam-take --jam-kit <club>`; if you add a probe flag for the melodic bank,
say so. Report the export list of the command surface (any new command or
event: `jam-ended`).
