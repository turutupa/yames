# W1 — the engine: a groove table on the tick grid

Branch: `jam/w1-engine`, from `jam`. Your area is `src-tauri/` only. You do
not touch `src/` (the contract files there are already written; the UI is
W2's). Read `plans/tasks/jam/BRIEF.md` first.

## What to build

### 1. `src-tauri/src/jam.rs` — the config and the compiled table

- `JamConfig`: the serde mirror of `JamEngineConfig` in `src/jam/types.ts`,
  `#[serde(rename_all = "camelCase")]`, with `JamPattern { kick, snare, hat,
  ride, crash: Vec<u8> }`. Validate on receipt: every lane in `bar` (and in
  `fill` when present) has exactly `ticks_per_beat × beats_per_bar` entries,
  levels are 0..=3, `form_bars` is 1..=64, `intensity` is clamped to
  0.5..=1.5. A bad config is rejected with a message, not partially applied.
- `JamTable`: what the audio thread reads. Per tick, a fixed-size array of up
  to five `(SoundId, f32 gain)` slots — no `Vec` per tick, no allocation on
  the audio thread, the same discipline as `accent_mask`. Compile it in the
  command handler, store it in `SharedState` behind an `Arc`, and let the
  callback's cached-params refresh swap the `Arc` in (an `Arc` clone is not
  an allocation). Keep `form_bars`, `crash_on_one` and whether a fill table
  exists on the table.
- Level → gain, before intensity and the master volume: hit 0.8, accent 1.0,
  ghost 0.35. Lane → sound:
  - kick → a new `SoundId::Kick`: `DRUM_HIGH` (the kick sample) mixed with
    `DRUM_BODY`, peak-normalised, full ring-out (no cap).
  - snare accent → `SnareHigh`; snare hit and ghost → `SnareLow`, gain as
    above. Full ring-out.
  - hat → `DrumMetal`, capped at 0.9 of a tick like today's beat.
  - ride → `DrumMetal` at 0.6 of the level's gain with a longer cap (there is
    no ride sample yet; say so in a comment, do not synthesise one today).
  - crash → `DrumCrash`, full ring-out.
- Keep the mix inside [-1, 1] the way the accent premix does: the mixer
  clamps, but a kick, a snare accent and a crash on the same tick at
  intensity 1.25 must not turn into a square wave. Measure the worst tick
  and add a gentle per-table normalisation if it clips.

### 2. `engine.rs` — playing the table

In the per-tick path (around the `use_accent` decision and the voice
spawn), when a table is active and `!cached.ramp_warming_up` and
`!cached.ramp_active`:

- The tick index within the bar is `measure_beat × subdivision + sub_count`.
  If the table's tick count differs from `beats_per_measure × subdivision`,
  the table is inactive for this tick: play the click as today and log once
  (not per tick).
- Spawn the table's voices for that tick instead of the click voices. On
  the last bar of the chorus use the fill table when there is one. On tick 0
  of bar 0 of a chorus add the crash when `crash_on_one`.
- `is_accent` on the beat event is true when any lane at this tick is at
  level 2, so the UI's dots flash on the kick and the backbeat.
- Counters: `jam_bar` (0-based, wraps at `form_bars`) and `jam_chorus`
  (1-based) in the callback state. Advance at `bar_complete`. Reset to 0 / 1
  when playback starts, when a new table arrives, and when the table is
  taken away. Emit them on every `BeatEvent` as `formBar` and `chorus`
  (serde names), 0 and 1 when no table is loaded.
- The count-in (`arm_count_in`, the warmup path) keeps playing the beep; the
  table starts on the first real tick.
- The speed ramp is untouched: while `ramp_active` the table is ignored.
  Say so in a comment. Combining them is Jam 2.

### 3. `commands.rs`, `state.rs`, the invoke handler

- `set_jam(config: Option<JamConfig>, state, app_handle)`: compile, store,
  and nudge the engine to refresh its cached params the way `set_accent_mode`
  does. Register it in the invoke handler list.
- `AppState` (the struct serialised to the frontend on every change) does
  NOT gain a jam field. The UI owns the jam record; the engine only holds the
  table.

### 4. The jitter probe

`src-tauri/src/bin/click-jitter-probe.rs` (or wherever `yames:jitter-probe`
points): add a `--jam` flag that loads the busiest plausible table (16 ticks
per bar, kick/snare/hat/ride all active, crash on one, fill on) at 240 BPM,
so the probe's gate covers the band. Run it once with and once without the
flag; report both. Hard gate: zero missed beats and zero dropouts.

### 5. Tests

- `jam.rs` unit tests: a valid config compiles to the expected slots; a lane
  of the wrong length is rejected; levels map to the stated gains; intensity
  clamps.
- `engine.rs` tests, following the existing render harness (see
  `every_accent_is_louder_than_its_beat_on_a_small_speaker` and the `bar`
  closure near it): a 4/4 rock table renders a kick on tick 0 and a snare on
  tick 4; the fill table plays on the last bar of a 4-bar form and not
  before; `formBar` and `chorus` wrap correctly across two choruses; a table
  whose tick count disagrees with the bar plays the click.
- The gates in BRIEF.md, plus `npm run test:rust` must stay green for
  everything that already exists.

## What not to do

- No new WAV files today. No changes to `generate_sounds.py`.
- No changes to `timing.rs`, `onset.rs` or `instrument.rs`. The analyser
  sees the same grid; if you think it must change, stop and say why.
- No frontend edits. If the contract is wrong for the engine, say exactly
  what you need changed and keep going with the closest thing that works.
- Never start the app.

## Report

As in BRIEF.md, plus: the probe's numbers with and without `--jam`, and the
measured peak of the worst-case tick before and after any normalisation.
