# W7 — the engine, second pass: kits, the bass, practice windows

Branch: `jam/w7-engine-band`, from `jam` AFTER W1 (the groove table) and W3
(the kit sounds) have merged. Your area is `src-tauri/` only. Read
`plans/tasks/jam/BRIEF.md` first, then `W1-ENGINE.md` for what already
exists, `src-tauri/sounds/KITS.md` for the files W3 made, and the contract
in `src/jam/types.ts`: `JamEngineConfig.kit`, `bass` (`JamBassLine`),
`practice` (`JamPracticeConfig`), and `BeatEvent.bandState`.

## What to build

### 1. Kits

- Embed the 32 kit WAVs from `KITS.md` with `include_bytes!` and decode them
  into the `SoundBank` at the sample rate, the way the existing files are.
- `kit` on the config selects which set the lanes map to: kick, snare_hi,
  snare_lo, hat, hat_open, ride, rim, crash. The `SoundId` per lane and
  level is resolved when the table is compiled (in the command handler),
  never on the audio thread. Unknown kit name → "room".
- The `ride` lane now plays the kit's ride; `hat_open` and `rim` are wired
  as sounds so a later editor can use them, even if no groove today does.
- Peak-normalise the compiled table as W1 did, per kit, and keep the
  small-speaker accent test green for every kit (parametrise the existing
  test over the four kits).

### 2. The bass

- A pitched voice. Synthesise a bank of 28 notes (MIDI 28–55) at bank build
  time (allocation there is fine; none on the audio thread): a plucked-bass
  tone — a sine fundamental with a touch of second harmonic and a short
  saw-ish attack, exponential decay ~450 ms, sample-accurate start. Tune to
  A4 = 440. Keep it simple and clean; it has to sit under drums, not solo.
- `bass.pitches[tick]` non-zero → spawn that note's voice at
  `bass.gain × intensity × volume`, capped to ring until the next non-zero
  pitch or the end of the bar, whichever first (so a walking line does not
  smear). Rests (0) spawn nothing.

### 3. Practice windows

- From `practice` and the engine's own `jam_bar` / `jam_chorus` counters,
  decide the band state per bar exactly as `src/jam/practice.ts` specifies
  (read its tests; the two must agree): absolute bar `(chorus − 1) ×
  form_bars + form_bar`; drop-out windows of `bars` starting at every
  multiple of `everyBars` except bar 0; trading alternates `bandBars` full
  and `youBars` hats-only from bar 0; drop-out wins.
- `silent`: no table voices at all (the click is NOT played either; the
  point is silence). `hatsOnly`: only the hat lane, and no bass. `full`:
  everything. Decide the state once per bar at the bar line, never mid-bar.
- Emit `bandState` on every `BeatEvent` (`"full"` when no jam).

### 4. Tests and gates

- Unit tests for the bass bank (28 notes, correct fundamental within 1 cent
  measured by zero crossings or autocorrelation, peaks ≤ 0.9), the bass cap
  rule, the band-state rule (mirror the TS tests), each kit's lane mapping.
- The render-harness tests from W1 extended: a bar with a bass line renders
  energy in the bass band on the right ticks; a drop-out bar renders
  silence; a trading bar renders only hats.
- All gates in BRIEF.md, and the jitter probe with `--jam` extended to
  include the bass and the busiest kit.

## Rules

No allocation on the audio thread. The click stays sample-accurate. No
edits under `src/`. Never start the app.
