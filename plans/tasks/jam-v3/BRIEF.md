# Jam, third pass — the drums become a band (shared by every worker)

Read this, then your own file, then `plans/JAM_SOUND.md` in full: it is the
evaluation the owner green-lit on 2026-09-13 ("Green light. You are the
orchestrator, use as many subagents as you may need") and every paragraph
of it is a line item in one of the briefs below. Then `plans/tasks/jam/BRIEF.md`
and `plans/tasks/jam-v2/BRIEF.md` for the rules that still hold: worktree
branch names with hyphens, the gates, the store hazard, no push, no merge,
never start the app, the report format.

## The branch

The feature branch is **`jam-v3`**, from `jam-v2`. Your worktree may start
on a stale branch: run `git log --oneline -1`; if HEAD is not the tip of
`jam-v3`, run `git checkout -B <your-branch> jam-v3`. The orchestrator
merges into `jam-v3`.

## The finding this pass answers

The jam's drums play 9–13 dB quieter than the metronome's own Drum accent,
because the band is peak-scaled so the busiest possible sample never
reaches the ceiling. And every drum is synthesised. Both end here: a
saturating stereo bus replaces the scaling, and recorded kits with
velocity layers and round robins replace the sines. See `JAM_SOUND.md` §1
for the table and §5 for the decision.

## The contract (fixed; every worker builds against it)

### Levels
`JamLevel` becomes `0 | 1 | 2 | 3 | 4`: 0 off, 1 hit, 2 accent, 3 ghost,
**4 peak** (the top of a fill, the crash). Engine gains
`LEVEL_GAIN = [0.0, 0.8, 1.0, 0.45, 1.0]`. Layer choice per level: ghost → 1,
hit → 2, accent → 3, peak → 4, clamped to the layers the voice has.

### Lanes
`JamPattern` rows: `kick`, `snare`, `hat`, `ride`, `crash` (required),
`hatOpen`, **`tomHi`**, **`tomLo`** (optional, absent = silent), as today's
`hatOpen` is. Serde names on the engine side: `hat_open`, `tom_hi`,
`tom_lo`.

### Voices
Eleven, fixed names, in this order:
`kick, snare, rim, hat, hat_open, hat_pedal, ride, ride_bell, crash, tom_hi, tom_lo`.
Lane → voice: kick → kick; snare at level 3 → snare layer 1, at other
levels → snare; hat → hat; hatOpen → hat_open; ride → ride (level 4 →
ride_bell when present); crash → crash; tomHi → tom_hi; tomLo → tom_lo;
`rim` is the cross-stick and is used by the grooves that ask for it
(bossa, ballad) through the snare lane at level 3 **when the groove
declares `snareGhostIsRim: true`** (W28 adds that flag to grooves;
compile passes it as `snare_ghost_is_rim` on the config; W26 reads it).
`hat_pedal` is played by the engine, not by a lane: every hatOpen hit is
followed by a pedal at the next hat hit (choke plus a soft pedal sound at
gain 0.4).

Fallbacks when a kit lacks a voice: rim → snare layer 1; hat_pedal →
hat layer 1 at 0.5; ride_bell → ride; tom_lo → tom_hi → snare layer 2 at
0.8; hat_open → hat with a 4-tick cap (as today).

### The kit format (shipped and custom, one loader)
```
src-tauri/sounds/kits/<kit>/kit.json
src-tauri/sounds/kits/<kit>/<voice>.<layer>.<rr>.wav
```
`layer` 1 = softest … up to 4 = hardest; `rr` 1..3. WAV, 16-bit PCM,
**48 000 Hz, stereo** for recorded kits (mono, 44 100 Hz allowed — the
loader resamples and duplicates mono). Peak ≤ 0.90, first and last sample
at zero, no file longer than 3.0 s, tails intact (a crash is its decay).

`kit.json`:
```json
{
  "id": "club",
  "name": "Club",
  "credit": "Virtuosity Drums — Versilian Studios and Karoryfer Samples, performed by Austin McMahon",
  "licence": "CC0-1.0",
  "rate": 48000,
  "channels": 2,
  "voices": {
    "kick":     { "layers": 4, "rr": 3, "trim_db": 0.0 },
    "snare":    { "layers": 4, "rr": 3, "trim_db": 0.0 },
    "rim":      { "layers": 2, "rr": 2, "trim_db": -2.0 },
    "hat":      { "layers": 4, "rr": 3, "trim_db": 0.0 },
    "hat_open": { "layers": 3, "rr": 2, "trim_db": 0.0, "choked_by": ["hat", "hat_pedal"] },
    "hat_pedal":{ "layers": 2, "rr": 2, "trim_db": -3.0 },
    "ride":     { "layers": 4, "rr": 3, "trim_db": 0.0 },
    "ride_bell":{ "layers": 2, "rr": 2, "trim_db": 0.0 },
    "crash":    { "layers": 3, "rr": 2, "trim_db": 0.0 },
    "tom_hi":   { "layers": 3, "rr": 2, "trim_db": 0.0 },
    "tom_lo":   { "layers": 3, "rr": 2, "trim_db": 0.0 }
  }
}
```
A voice absent from `voices` is absent from the kit (fallbacks above).
`trim_db` is the per-voice balance the render tool measured; the engine
applies it once at bank build. `choked_by` names the voices whose hit
fades this one out over 20 ms.

The five synthesised kits (`room`, `tight`, `brushes`, `electronic`,
`raw`) move into this format with `layers: 1, rr: 1` and their existing
files (`snare_hi` → `snare.1.1.wav`, `snare_lo` → `rim`? no: `snare_lo`
becomes `snare.1.1.wav` and `snare_hi` `snare.2.1.wav`, so `layers: 2`).
W26 does that move, since the embedding is his; W27 does not touch them.

**Embedding:** `src-tauri/build.rs` walks `sounds/kits/*/kit.json` and
writes `$OUT_DIR/kits_generated.rs` with one `include_bytes!` per file and
the manifests; the engine `include!`s it. Adding a kit is adding a folder.

**Custom folders** (`customKit.dir`) use the same names: `snare.wav`
(today's plain form, still valid, = layer 1 rr 1), `snare.3.wav` (layer
3), `snare.3.2.wav` (layer 3, round robin 2); `snare_soft.wav` keeps
meaning snare layer 1 for folders made before this pass. Missing layers
are filled from the nearest present layer. 3 s per file, 96 MB per folder.

### Round robins and drift — deterministic, no state on the audio thread
Round robin for a hit = `(bar * ticks_per_bar + tick + voice_index * 7) mod rr`.
Drift: a hash of `(bar, tick, voice)` gives gain × (1 ± 0.02) and a start
delay of 0–3 ms; the kick on tick 0 of any bar gets no delay. Same input,
same output: a take is reproducible.

### The bus
The band is mixed in stereo on the audio thread into its own pair of
accumulators, then: `tanh(x * drive) / tanh(drive)` with `drive` 1.0 for
recorded kits and 1.6 for `raw`; then a peak compressor (attack 5 ms,
release 80 ms, threshold −6 dBFS, ratio 3:1, fixed coefficients computed
at bank build for the device rate); then added to the click's output
(the click is unchanged and still sacred). The four-bar render and the
gain memo stay only as a safety clamp: a table is scaled only when its
worst tick exceeds **2.5** before the bus. Intensity: soft 0.6, normal
1.0, loud 1.6.

### Kit ids on the TypeScript side
`JamKit` gains `"club"` (Virtuosity Drums) and `"studio"` (DRSKit). The
five synthesised ids stay in the union for now; retiring them is the
owner's call after listening.

## Who owns what

| Worker | Area | Does not touch |
|---|---|---|
| W26 engine | `src-tauri/**` (engine.rs, jam.rs, kit.rs, build.rs, commands.rs, the probe), moving the five synth kits into `sounds/kits/` | `src/`, `sounds/kits/club`, `sounds/kits/studio` |
| W27 render + kits | `scripts/sounds/render_kit.py`, `sounds/kits/club/**`, `sounds/kits/studio/**`, `sounds/KITS.md`, `scripts/sounds/measure_kits.py`, `scripts/sounds/ab.html` | `.rs`, `src/`, the five synth kits |
| W28 grooves + data | `src/jam/**`, `src/locales/*/jam.json` and `settings.json`, the kit list in `src/containers/jam/KitPicker.tsx`, the credits line in Settings › About | `src-tauri/`, sheets and motion |

## Gates (every worker, on their own tree)

`npx tsc --noEmit`, `npx vitest run` (whole suite; then `git checkout --
src/containers/onboarding/__snapshots__/emptyStates.test.tsx.snap`),
`npm run test:rust` (W26; MSVC runner, never bare `cargo test`), `npm run
test:dsp`, `npm run test:highbpm`, the jitter probe `--no-llm --jam
--jam-swap --jam-move --jam-take` and `--jam-kit <a folder in the new
format>` (W26), `python scripts/sounds/measure_kits.py` (W27). Commits
small, subjects in the repository's voice, each ending with
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
