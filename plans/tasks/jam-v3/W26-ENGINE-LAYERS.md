# W26 — the engine: layered banks, choke, drift, a stereo bus

Branch `jam-v3-w26-engine-layers` from `jam-v3`. Read the shared BRIEF's
contract first; it is the whole specification of names, numbers and
formats. Area: `src-tauri/**` only. The audio-thread rules are absolute:
no allocation, no lock wait, no free on the callback; everything reaches
it through a handoff and leaves through retirement.

## What to build, in this order

1. **The kit format and the loader.** `src-tauri/build.rs` walks
   `sounds/kits/*/kit.json`, writes `$OUT_DIR/kits_generated.rs`
   (manifests as consts, `include_bytes!` per file). Move the five
   synthesised kits into the format (a small Python script under
   `scripts/sounds/` that copies `kit_<kit>_<voice>.wav` to
   `sounds/kits/<kit>/<voice>.<layer>.1.wav` with `snare_lo` → layer 1,
   `snare_hi` → layer 2, and writes their `kit.json`; delete the old
   forty files and the `include_bytes!` list that named them). `kit.rs`
   decodes a manifest folder — shipped bytes or a custom directory — into
   one `KitBank { voices: [Option<VoiceBank>; 11] }` where a `VoiceBank`
   is `layers × rr` buffers at the device rate, stereo interleaved or two
   planes, trim applied, plus the choke set. Custom folders accept the
   naming in the contract, including today's plain names. 3 s per file,
   96 MB per folder, the 2 s/64 MB constants retired.
2. **Levels, lanes, voices.** `JamPattern` gains `tom_hi`, `tom_lo`; level
   4 is legal everywhere a level is read; `LEVEL_GAIN` per the contract;
   `snare_ghost_is_rim` on the config; the lane → voice table and the
   fallbacks exactly as the contract lists them; `hat_pedal` played by the
   engine after an open hat, at the next hat hit.
3. **Round robin and drift**, deterministic per the contract, computed
   when the tick is scheduled, never stored.
4. **Choke.** A voice whose `choked_by` set contains the voice just
   triggered starts a 20 ms fade. On the audio thread this is a flag and
   a counter on the ringing `Voice`, nothing else.
5. **Stereo and the bus.** The band accumulates into an L/R pair; tanh
   with the kit's drive, the fixed-coefficient compressor, then summed
   into the output. The click's own path is untouched. Mono sources are
   centred. Per-voice pan is a `pan` field in the manifest (−1..1,
   optional, default 0); the render tool sets it for hats and toms.
6. **The scaling rule.** `compile` keeps the four-bar worst-tick render,
   but scales only above 2.5; intensity gains 0.6 / 1.0 / 1.6.
7. **The probe.** `--jam-kit <dir>` accepts a folder in the new format;
   run the full flag set on a kit with 4 × 3 layers (W27's `club` will
   not exist on your branch — make one from the synth kit by copying
   files under layered names, and delete it after). Report p99 and
   dropouts with the bus on. The bus's per-sample cost must show up as
   nothing in the numbers.
8. **Tests.** The manifest parser, the loader's fallbacks and layer
   filling, the round-robin formula, the drift hash's bounds and its
   determinism, the choke fade, the bus's ceiling (a full-scale sum never
   exceeds 1.0 after tanh), the compressor's steady state, level 4 and
   the tom lanes through `jam_play`, and the scaling rule at 2.4 versus
   2.6. Every existing test updated rather than deleted where the contract
   moved it. `npm run test:rust`, dsp, highbpm all green.

## Rules
No `src/` edits. Never start the app. The commands `set_jam`,
`inspect_kit_folder` keep their shape; `inspect_kit_folder` now reports
layers and round robins found per voice. Report the loader's decode time
for a 4 × 3 stereo kit at 48 kHz (it runs on the command thread; say what
the app would feel).
