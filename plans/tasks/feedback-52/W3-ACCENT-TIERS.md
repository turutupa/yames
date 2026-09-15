# W3 — a bar of 6/8 has a middle

This was parked behind `plans/tasks/jam-v5/W38-CLICK-PRESETS.md`, which
rewrote `SoundKit`, `SoundBank`, the accent-versus-beat loudness floor
and the files behind `high_id()` / `low_id()` — exactly what this brief
changes. W38 landed on `jam-v5` at d18e6ba (2026-09-14) and `feedback-52`
has merged it (9739f97), so this can start on the owner's word. Design
and decisions in `plans/CLICK_ACCENTS.md`. Tune `MEDIUM_GAIN` against
the recorded presets W38 shipped (Wood, Snare, Sticks, Cowbell, Kit), not
the old synthesised ones.

Branch `feedback-52-w3-accent-tiers` from `feedback-52`. Read
`plans/CLICK_ACCENTS.md`, then `src-tauri/src/engine.rs`: `AccentMode`,
`accent_for`, `accent_mask`, `mask_has_accent`, `CachedParams`, the
sound pick in the callback (`high_id()` at 1.0 / `low_id()` at
`BEAT_GAIN` / `low_id()` at `SUB_GAIN`), `BeatNotification.is_accent`
and `BeatEvent.is_accent`, the loudness test `laptop_band_energy` and
the accent-versus-beat floor; `src/utils/meter.ts::accentPositions`
(its comment says it must never drift from the engine); `src/
constants/metronome.ts` (`METER_PRESETS`, `METER_VARIANTS`); `src/
containers/metronome/GroupEditor.tsx` and `AccentControl.tsx`; `src/
styles/metronome.css` (`.group-dot.accent`, `.playing`, the FREE
rules); every consumer of `isAccent` (`FloatingWidget`, drill, the
beat log — `BeatNotification` feeds `beat_log`, the TimingAnalyzer's
only source of beat positions; do not drop or reorder a notification).

## The change
- `accent_for` returns a level — `Strong | Medium | None` — instead of
  a bool. Under `Groups`: the first set bit of `accent_mask` (beat 0)
  is Strong, every other set bit is Medium, the rest None. Under `All`:
  every beat Strong, unchanged in sound from today. Under `None`:
  none. During a ramp: as today (beat 0 of the ramp bar), Strong. FREE
  mode: beat 0 Strong. Sub-ticks never accent, as today.
- The sound pick gains a third tier: Medium is `high_id()` at
  `MEDIUM_GAIN` (start at 0.80; the constant sits beside `BEAT_GAIN`
  with the same kind of comment). The loudness test covers the new
  tier for every kit: Medium must sit audibly between Strong and the
  beat through the laptop band, and never below the beat.
- `is_accent` widens to `accent: u8` (0/1/2) on the notification and
  the event; the frontend type gains `accentLevel: 0 | 1 | 2` and
  keeps `isAccent` as `accentLevel > 0` for one release so no consumer
  breaks (grep them all; update the dots to use the level).
- `accentPositions` in `meter.ts` returns a `Map<number, 1 | 2>`
  mirroring the engine, with a test that walks every `METER_PRESETS`
  entry and every `METER_VARIANTS` grouping and matches the engine's
  rule (there is a Rust fixture list of all meters — keep the two lists
  the same).
- Dots: `.group-dot.accent` (Strong) keeps ring and glow;
  `.group-dot.accent-medium` gets the ring at the same colour with no
  glow; playing states for both. FREE mode dots follow.
- `METER_VARIANTS` gains `"6/8": [[3, 3], [2, 2, 2]]` — the meter row
  shows the two grouping chips as it does for 7/8.
- No new persisted field, no change to presets or setlist steps.

## Tests
Rust: `accent_for` levels per mode for `[3]`, `[3,3]`, `[3,2,2]`,
`[2,2,2]`, FREE and a ramp; the loudness tier for every kit; a
notification still fires per beat. Vitest: `accentPositions` mirror,
`GroupEditor` renders three dot classes, `AccentControl` unchanged,
the 6/8 variant chips.

## Gates
`npm run test:rust`, dsp, highbpm, the probe `--no-llm`, tsc, vitest.
Report the per-kit loudness numbers for Strong / Medium / beat.
