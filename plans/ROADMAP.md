# Yames Roadmap — Metronome → Practice Coach → Tutor

> **Status:** Active. This is the single planning document for Yames.
> **Written:** 2026-09-02. Supersedes `yames-evolution-roadmap-v10.md`
> (deleted), `DSP_AND_COACH_PLAN_STATUS.md`, `COACH_DSP_POLISH_PLAN.md`,
> `REPORT_UI_CLARITY_1.md` and `ACCENT_PATTERN_PLAN.md` (all deleted —
> their unshipped items are carried in §9). The original DSP/coach design
> spec lives on as `plans/archive/DSP_AND_COACH_PLAN.md` because code
> comments cite it for the *why* of the scoring formula. Mobile is out of
> scope here and tracked in `MOBILE_IMPLEMENTATION_PLAN.md`.
> **Audience:** the human owner and the coding agents that implement it.
> Every phase item has a deliverable, the files it touches, and an
> acceptance gate. Items are sized S / M / L (roughly ≤1 day, ≤1 week,
> >1 week of agent-driven work). Nothing here is calendar-committed;
> ordering is by dependency and blast radius.
> **How to use:** read §1–§4 once. Then work a phase top to bottom. Do
> not start a later phase's items while an earlier phase's gate is red,
> except where an item is explicitly marked *parallel-safe*.

---

## 1. Mission

Yames is a free, local-first practice coach for instrumentalists, guitar
first. It measures your timing honestly against a sacred click, tells
you what to work on and builds the exercises to work on it, and teaches
you the theory behind them — all without your hands leaving the
instrument or your audio leaving the machine.

The tutor is the headline: a coach you can *talk to* about your playing
is the thing no other metronome offers. But a tutor is only as credible
as the measurement underneath it. So the order of work is: make the
number trustworthy on every platform → give the coach a curriculum to
prescribe → let the model explain, plan and teach from those grounded
facts. The model never guesses at what it can compute.

### Principles (load-bearing — do not violate without editing this section)

1. **The click is sacred.** Nothing may add jitter to the metronome.
   Every phase carries an audio-safety gate (§4).
2. **Eyes-free first.** Every coach feature must be usable via MIDI
   footswitch, hotkey or voice. Screens are optional, never required.
3. **Deterministic decides, model narrates.** Scores, classifications,
   exercise content, routine validity and theory facts come from Rust.
   The LLM rephrases, explains, plans within a schema, and answers
   questions using tool results. It never invents a number, a fret, or
   a scale.
4. **Honest status.** The UI never claims a capability the build does
   not have (see §3 — today it does).
5. **Local, free, GPL, license-clean.** No cloud, no accounts, no
   telemetry. Only Apache-2.0 / MIT / GPL-compatible models and libs, so
   a paid tier can exist later without re-licensing anything.
6. **Tiers are hardware tiers, never paywalls.** Standard /
   Studio describe RAM and GPU, not payment.
7. **Test gates over promises.** A feature is done when its fixture,
   scenario or eval passes in CI — not when it demos.

---

## 2. Current state (2026-09-02, v1.0.4)

What actually ships today. Read this before trusting any older doc.

| Area | State |
|---|---|
| Metronome engine | `src-tauri/src/engine.rs` — cpal-direct, sample-accurate, subdivisions 1–6, beat groups (meter editor, PR #10), speed ramp state machine (`advance_ramp`), 6 sound sets. Polished, considered done. |
| Input / onset | `audio_input.rs` + `onset.rs` — aubio SpecFlux, adaptive refractory `max(profile.floor, audible_subdivision_interval × 0.75)`, 10th-percentile noise floor, per-onset confidence, chord-cluster merge before matching, 4 s input ring buffer + record/playback for the input tester. |
| Timing analysis | `timing.rs` (4.2k lines) — Path B multi-hypothesis `RhythmInference` over divisors {1,2,3,4,6} with hysteresis, tempo-aware window `min(0.4×beat, 80 ms)`, four-component score (IC 0.40 / GA 0.20 / HC 0.25 / OE 0.15), MAD-based IC, bias/jitter split, activity state machine, Signal A/B segment boundaries, duration-weighted session score. 23 `d3d_scenario_*` tests. |
| Calibration | Running-median auto-calibration, cached per (instrument, device) with 30-day TTL (`calibration_cache.rs`). |
| Fixtures & tooling | `tests/dsp_fixtures` (post-match layer), `tests/highbpm_fixtures` (raw-onset layer), bins `dump-fixture`, `inspect-session`, `score-playground`, `seed-highbpm-fixtures`, `scripts/debug-bpm.sh`. **No real-audio high-BPM capture fixture yet.** |
| Session persistence | `session.rs` SavedSession history (JSON via tauri-plugin-store) + `session_log.rs` diagnostic JSON logs pruned to 50, paired WAV in debug builds only. |
| Coach (TS) | `src/coach/*` — gatekeeper (12 scenarios, per-channel cooldowns), template catalog (~30 % of planned slots, `generic`/`drums`/`electric-guitar`/`bass`), shuffle-bag + bigram anti-repetition, narrative (2 KB cap), greetings, preset awareness (ceilings, tendencies, stamina), chips (8), interventions (5 of 10), mini-reports, verbosity + voice mode. |
| Coach (Rust) | `coach.rs` — `coach-llm` Cargo feature wraps `llama-cpp-2 0.1.146` (features `["metal"]`). Template fallback otherwise. |
| **LLM in releases** | **Not compiled.** `default = []`, and `.github/workflows/release.yml` passes no `--features`. Every shipped binary is template-only. `load_model` returns `Ok(true)` without the feature, so the UI reports the brain as loaded after the user downloads 1.1–2.4 GB of weights that are never read. Enabling the feature as-is breaks Windows/Linux (`metal`). |
| Models offered | Standard = Qwen2.5-1.5B-Instruct Q4_K_M; Full = Phi-3.5-mini Q4_K_M (`src/hooks/useCoachDownload.ts`). |
| TTS | Piper via subprocess, playback via `afplay`, fallback `say`. **macOS-only.** |
| Adaptive drill | `engine.rs` has deterministic thresholds (`adaptive_thresholds`), but a model decision *overrides* them (`engine.rs:1368`). `useSession.ts` asks the LLM in free text whenever `coachLoadedRef` is true — which template mode also sets — and `parseAdaptiveDecision` turns any template reply into `hold`. Net: anyone who downloaded a brain gets a drill that never moves. |
| MIDI / hotkeys | `midi.rs` + `useActionDispatcher` — 13 actions incl. `toggle-coach`. |
| i18n | 15 locales for the UI. Coach templates, prompts and voice are English-only. |
| Instruments | drums, electric-guitar, acoustic-guitar, bass, piano, other — only calibrated string instruments selectable since v1.0.1. |
| Pitch analysis | None. |
| Tabs | Metronome, Drill, Track (pocket check), Coach card, Settings. |

---

## 3. Hardware & model tiers

| Tier | Model (all Apache-2.0) | Download | RAM while active | Who |
|---|---|---|---|---|
| Off | — | 0 | 0 | Timing feedback + templates only |
| Standard | Qwen3-4B Q4_K_M | ~2.5 GB | ~4 GB | The floor. Any machine with ≥ 8 GB RAM; CPU-only is acceptable (2–4 s per tip) |
| Studio | Qwen3-8B Q4_K_M | ~5 GB | ~8 GB | Offered only when ≥ 16 GB RAM; GPU strongly preferred |

Decision (2026-09-02): no 1.7B tier. A decent experience is prioritised
over reaching very old hardware; machines that cannot run 4B use the
template coach.

Rules:
- Qwen3 replaces Qwen2.5 and Phi-3.5. **Never Qwen2.5-3B** (non-commercial
  Qwen Research License). Run Qwen3 with thinking disabled for latency.
- Inference threads: `n_threads = max(1, physical_cores − 2)`, worker
  thread priority *below normal*. Never touch the cpal callback thread.
- Backends: **always try the GPU first.** macOS builds with `metal`;
  Windows/Linux builds with `vulkan`. llama.cpp falls back to CPU at
  runtime when no usable GPU/driver is present, so one binary serves
  both. CUDA only if a contributor owns the hardware to test it.
- Capabilities are identical across tiers. Bigger models only improve
  prose and planning quality; nothing deterministic is gated.

---

## 4. Cross-cutting gates (apply to every phase)

Run in this order; all must be green before a phase is called done.

```sh
bun run tsc --noEmit
bun run test                       # vitest
bun run test:rust                  # cargo test --lib --no-default-features
bun run test:dsp                   # post-match fixtures
bun run test:highbpm               # raw-onset fixtures
cargo test --manifest-path src-tauri/Cargo.toml --features coach-llm --lib   # once Phase 0 lands
```

- **Audio-safety gate (Phase 0 introduces it):** `cargo run --bin
  click-jitter-probe` runs the engine for 60 s while the LLM generates
  continuously and asserts p99 callback-to-callback jitter < 1 ms and
  zero missed beats. Any phase that adds background compute re-runs it.
- **Scoring gate:** any change to `onset.rs`, `timing.rs` or
  `instrument.rs` re-bakes nothing silently. Golden drift must be
  explained in the commit body and `INSTRUMENT_PROFILE_VERSION` bumped
  when profile values change.
- **LLM eval gate (Phase 3 introduces it):** `bun run eval:coach` replays
  a prompt set against the loaded model and checks tool selection and
  grounding assertions (§7.1).
- **Release hygiene:** `feat:` / `fix:` commit prefixes trigger a
  release. Land phases on branches; squash with the right prefix.
- **Privacy:** audio is never persisted in release builds unless the
  user opts in per feature (Phase 4 record-listen). Keep the
  `cfg(debug_assertions)` guard in `session_audio.rs`.

---

## 5. Phase 0 — Ship the brain everywhere

Goal: a user on macOS, Windows or Linux downloads a model and actually
gets LLM-generated coaching, with a working voice, and the click never
stutters. Nothing else in this roadmap is real until this is.

### 0.1 Compile `coach-llm` into releases, per platform — **L**
- `src-tauri/Cargo.toml`: drop the hardcoded `features = ["metal"]` from
  `llama-cpp-2`. Add Cargo features `coach-llm` (CPU), `coach-llm-metal`,
  `coach-llm-vulkan` mapping to the crate's backend features (verify
  exact names in `llama-cpp-sys-2 0.1.146`'s feature list; upgrade the
  crate if a newer minor fixes a build issue, pin the version).
- `.github/workflows/release.yml`: per-matrix `args` add
  `--features coach-llm-metal` (macOS) and `--features coach-llm-vulkan`
  (Windows/Linux). Install cmake and the Vulkan SDK on the runners.
  Expect Windows to need MSVC + Ninja; Linux needs `libclang` for
  bindgen. Runtime falls back to CPU when no GPU is usable.
- Bundle-size budget: binary growth ≤ 30 MB per platform. Record actual
  sizes in the PR.
- **Gate:** release workflow green on all three; a CI smoke job
  downloads a tiny GGUF (a ~30 MB "stories"-class test model is enough;
  CI only, never offered to users), loads it via `load_coach_model`,
  generates 8 tokens, asserts
  non-empty output on each OS.

### 0.2 Honest brain status — **S**
- `coach.rs`: add `pub fn llm_compiled() -> bool` (cfg-based) and make
  `CoachEngine::is_loaded()` mean "a real model is resident". Template
  mode is a separate, explicit state.
- New IPC `getCoachCapabilities()` → `{ llmCompiled, modelLoaded,
  backend: "metal"|"vulkan"|"cpu", modelName, ramEstimateMb }`. Route
  through `src/ipc.ts`.
- Settings brain section shows the real state: *Template coach* /
  *AI brain active (Qwen3-4B, Metal)* / *Model downloaded but this build
  cannot run it*. i18n keys in every locale (English fallback is fine).
- **Gate:** vitest for the status label mapping; manual on a
  `--no-default-features` build shows "Template coach".

### 0.3 Model refresh to Qwen3 — **S**
- `useCoachDownload.ts` `MODEL_URLS`: Standard → Qwen3-4B Q4_K_M,
  Studio → Qwen3-8B Q4_K_M (bartowski or Qwen official GGUF repos).
  Studio is only offered when total RAM ≥ 16 GB (new IPC returns RAM).
- `coach.rs` LLM path: chat template for Qwen3 (llama.cpp handles it
  from GGUF metadata; verify), `enable_thinking=false` / `/no_think`,
  `n_ctx` 4096, sampler temp 0.7 top-p 0.9, and the thread/priority
  rules from §3. Load once, keep resident, `spawn_blocking` stays.
- Migration: a previously downloaded `model.bin` of the old family is
  detected by size/name and the UI offers "Update brain".
- Update `en.json` tier hints with the new sizes.
- **Gate:** generation latency for a 1-sentence rephrase ≤ 1.5 s on an
  M1 (Standard on Metal) and ≤ 4 s CPU-only on a 4-core laptop
  (Standard, fallback path). Record numbers in the PR.

### 0.4 Voice on Windows and Linux — **M**
- Piper binaries exist for all three OSes (rhasspy/piper 2023.11.14-2
  archives; newer builds at OHF-Voice/piper1-gpl, GPL-3 — compatible
  with Yames' GPL-3). `models.rs::piper_binary_url()` becomes
  per-platform.
- Replace `afplay`/`say` playback with in-process WAV playback through
  the existing output device (rodio `Sink` on a non-audio-callback
  thread, respecting the metronome dim already implemented in
  `tts_speak`). Keep `say` as macOS fallback only.
- Linux: Piper needs `espeak-ng-data`; ship it inside the download
  tarball or document the apt dependency in Settings diagnostics.
- **Gate:** `ttsVoiceDiagnostics` green on all three OSes in a manual
  matrix; the "first 4 beats" TTS floor and interrupt path still pass
  their vitest cases.

### 0.5 Audio-safety probe — **M**
- New bin `src-tauri/src/bin/click-jitter-probe.rs`: starts the engine
  at 200 BPM 16ths on the default output, spawns continuous LLM
  generation for 60 s (CPU-only forced), records callback timestamps,
  prints p50/p99 jitter and missed callbacks, exits non-zero above the
  §4 threshold.
- Apply `audio_thread_priority` (Mozilla crate) to the *analyzer* thread
  in `onset.rs` and the engine event loop — not to the cpal callback,
  which the OS already schedules real-time. Measure before/after; keep
  only if it helps.
- **Gate:** probe passes on CPU-only Windows and Linux VMs with the
  Standard model.

### 0.6 Deterministic adaptive drill — **S** (*parallel-safe*)
- The rule table already exists (`adaptive_thresholds` in `engine.rs`).
  Remove the model override path: delete the `DECISION_*` atomic and
  `set_adaptive_decision`, let the engine always use its thresholds, and
  have the frontend ask the LLM only for a one-sentence *comment* on the
  decision the engine already made (pass the decision in the prompt).
- **Gate:** unit tests for `adaptive_thresholds`; a drill in template
  mode with a downloaded brain moves up and down.

**Phase 0 exit:** a Windows user installs v1.1, downloads Standard
(Qwen3-4B), it runs on their GPU if they have one and on CPU if not,
they hear a Piper voice speak an LLM-rephrased tip, and the jitter probe
is green in CI.

---

## 6. Phase 1 — Trust the number

Goal: the score is right at every tempo and in the "click quarters,
play 16ths" case, every session lands in a queryable store, and the
report explains itself. This is the substrate the curriculum and tutor
stand on.

### 1.1 SQLite store — **L**
- Add `rusqlite` (bundled). New module `src-tauri/src/db.rs` with
  versioned migrations (`PRAGMA user_version`).
- Tables (superset of today's `SavedSession` + `SessionLog` summaries;
  do **not** shrink the existing model):
  - `sessions(id, started_at, ended_at, instrument, preset_id, bpm_start,
    bpm_end, subdivision, beat_groups, score, ic, ga, hc, oe,
    mean_dev_ms, mad_ms, calibration_offset_ms, play_mode, narrative,
    log_path)`
  - `segments(id, session_id, idx, start_ms, end_ms, bpm, inferred_divisor,
    divisor_confidence, score, ic, ga, hc, oe, end_reason, interval_errors_json)`
  - `exercise_ceilings(instrument, exercise_key, comfortable_bpm, peak_bpm,
    last_practiced, next_review_due, ease, interval_days, reps)` — PK
    `(instrument, exercise_key)`
  - `routines(id, name, json, created_at, source)` and
    `routine_runs(id, routine_id, session_id, step_results_json)`
  - `events(id, session_id, ts_ms, kind, payload_json)` for coach
    utterances, interventions, chips (replaces nothing yet; enables §7.4)
- One-time import of existing history on first launch; keep JSON export
  (`exportSessionLogs`) working; diagnostic JSON logs stay as-is.
- IPC: `getSessionHistory`, `saveSession`, `deleteSession`,
  `clearAllSessions` re-implemented on SQLite; add `queryHistory(filter)`
  (by preset/exercise/instrument/date range/bpm band) for §7.
- `presetAwareness.ts` keeps its pure functions; feed them rows from
  `queryHistory`.
- **Gate:** migration test on a fixture history JSON; all
  `presetAwareness`/`greeting` vitest cases pass unchanged; a 500-session
  DB answers `queryHistory` in < 20 ms.

### 1.2 Real high-BPM capture fixture — **S** (carry-over P0-DBG-3)
- Capture one real 180 BPM 16ths electric-guitar session with
  `scripts/debug-bpm.sh 180`, bake via `dump-fixture`, commit as
  `captured_180bpm_16ths` in `tests/dsp_fixtures/` with the audio setup
  in the commit body.
- **Gate:** the fixture is in CI. Do this *before* 1.3 so refractory
  changes are caught.

### 1.3 Refractory keyed to the inferred divisor — **M**
- Today `TempoContext.subdivision` is the *audible* subdivision, so a
  quarter-note click at 100 BPM gives a 450 ms refractory that swallows
  every played 16th before the analyzer sees it. Feed the detector the
  `RhythmInference` locked divisor (fall back to the audible one until
  lock). Keep the instrument floor.
- The engine already emits every audible tick; add *virtual* expected
  ticks for the inferred divisor inside `TimingAnalyzer` so 16ths over a
  quarter click are scored, not marked spurious.
- Track the known ghost band (103–150 ms) separately — it is a
  `cluster_window_ms` concern per the `onset.rs` comments.
- **Gate:** new raw-onset fixture `100bpm_click_quarters_play_16ths`
  scores ≥ 85 with a jittered-5 ms input; `captured_180bpm_16ths` and
  all 23 d3d scenarios unchanged within ±2 points.

### 1.4 Per-beat divisor voting — **M**
- Inside a locked `RhythmInference` window, classify each beat's onsets
  against the candidate set by phase clustering (thirds vs quarters)
  and score that beat on its own divisor. Removes transition latency
  when a player alternates 8ths / triplets / 16ths bar to bar.
- **Gate:** fixture `120bpm_alternating_8ths_triplets` scores ≥ 85; no
  flapping in `InferredGridChanged` events (≤ 2 changes per 8 bars).

### 1.5 Learning mode — **S**
- Not the old "±35 ms". Learning mode = window × 1.5, corrections
  demoted to written tier, encouragement templates preferred. Strict
  mode = today's behaviour. Setting lives next to `coachMode`.
- **Gate:** vitest on tier demotion; d3d scenarios unchanged (learning
  is a presentation layer, scores are still computed strictly and
  stored).

### 1.6 Report clarity carry-over — **S** (from REPORT_UI_CLARITY_1)
- Problems 1–6 from that plan in `CoachFeedMessage.tsx`: stat values
  still render `toFixed(2)` at lines ~378/384 → integer percent; labels
  for IC/GA; timeline "70 %" label; define "semi-structured"/"on beat";
  score ring context; timing-error units. Tooltips, not modals.
- **Gate:** snapshot test of `EndReportSummary`.

### 1.7 Coach polish carry-over — **S each** (*parallel-safe*)
- `preset_ceiling_hit` scenario wired from `detectBpmCeiling`
  (P1-COACH-3); cross-session pace line on 4th attempt at a ceiling
  (P1-DSP-3); `evaluateScore()` consolidation (P3-COACH-3); template
  catalog to ≥ 80 % slot coverage incl. `acoustic-guitar`/`piano`
  vocabularies; deferred interventions `tuning-check` (after 2.7) and
  `preset-recap` (after 1.1).
- Open DSP question carried: the IC = 0.116 / MAD 62 ms burst-practice
  anomaly from 2026-05-22 — verify with `intervalErrors` from a fresh
  session and close or file.

### 1.8 Optional: loopback latency seed — **S**
- Only as a *seed* for the running median, only when output is speakers
  and input is a mic (skip for Hi-Z interface input, where the impulse
  never reaches the input). Button in Devices settings; writes the
  seed into `calibration_cache.rs`. Do this last in Phase 1 or skip.

**Phase 1 exit:** SQLite history live; "click quarters, play 16ths"
scored correctly; report self-explanatory; all fixtures green.

---

## 7. Phase 2 — Curriculum engine (deterministic)

Goal: Yames can *prescribe*: generate a playable, musical exercise for a
skill, score the notes as well as the timing, schedule reviews, and run
a multi-step routine without the model in the loop. Everything here is
pure Rust + React and fully unit-testable.

### 2.1 Theory core — **M**
- `src-tauri/src/theory.rs`: pitch classes, MIDI ↔ note names, 12-bit
  scale bitmasks (major, modes, pentatonics, blues, harmonic/melodic
  minor, chromatic), chord formulas, intervals, tunings (standard, drop
  D, E♭, DADGAD, 5-string bass, 7-string), fretboard map `(string, fret)
  ↔ midi`, position boxes, scale-shape enumeration (CAGED / 3-nps).
- Exposed via IPC `theory.*` read-only queries (used by the UI renderer
  now and the tutor's tools in Phase 3).
- **Gate:** property tests (every generated scale note ∈ bitmask; every
  fretboard position round-trips; shapes never exceed 5 frets).

### 2.2 Exercise generator — **L**
- `src-tauri/src/exercise.rs`. Input `ExerciseParams { focus_area,
  scale, root, tuning, position_box, finger_pattern, string_skip,
  direction, length_bars, subdivision, seed }`. Output `Exercise {
  key, notes: Vec<Note{string, fret, midi, finger, beat_pos, dur}>,
  rhythm_template, display_name, description }`.
- Focus areas v1: linear spider (chromatic), scale-mapped spider
  (fingers → nearest scale degrees inside the box), diagonal shift,
  string skipping, pentatonic box runs, 3-nps runs, arpeggio sweeps.
- Constraint solver: box framing, string eligibility per pitch, nearest-
  string routing unless skipping requested, max stretch 4 frets (5 above
  fret 12), no impossible finger sequences.
- Deterministic per seed. `exercise_key` is stable across seeds for the
  same params (used by SRS).
- **Gate:** 200 random param sets × 5 seeds all satisfy playability
  invariants; snapshot tests for 6 canonical exercises; a `cargo run
  --bin exercise-preview` prints ASCII tab for eyeballing.

### 2.3 Fretboard / tab renderer — **M**
- React SVG component `FretboardView` + `TabStrip` under
  `src/containers/exercise/`. Highlights the current and next note in
  sync with `onBeat`. Eyes-free mode: only speaks exercise name and
  position ("A minor pentatonic, 5th position, 16ths"), nothing visual
  required.
- Exercises attach to presets (a preset may carry an `exercise_key` +
  params) so the existing preset sidebar becomes the exercise library.
- **Gate:** component tests; MIDI/hotkey `exercise-next` /
  `exercise-prev` actions added to `useActionDispatcher`.

### 2.4 Phrase templates — **M**
- `RhythmTemplate` (durations in beats incl. rests, loopable). Loaded
  into `TimingAnalyzer` as an explicit expected-onset schedule; when
  present, matching runs against the schedule instead of the inferred
  grid. Generated exercises always ship one; users can also enter one
  (tap it in on the Track tab, or pick from a catalog: dotted-8th
  gallop, swing 8ths, tresillo, clave, syncopated 16ths).
- Rubato/pocket telemetry: per-phrase mean offset and drift reported as
  *phrasing*, not penalised, when `coachMode` is learning.
- **Gate:** raw-onset fixture `120bpm_dotted8th_16th_phrase` scores
  ≥ 85 when played correctly and correctly flags the dropped note when a
  note is omitted.

### 2.5 Exercise ceilings + spaced repetition — **M**
- After an exercise segment ends: update `exercise_ceilings`
  (comfortable = highest BPM with MAD ≤ 15 ms over ≥ 8 bars; peak =
  max attempted with score ≥ 70). SM-2 variant in Rust (`srs.rs`):
  quality from score bands; intervals capped at 14 days for motor
  skills.
- Coach card shows "Due today" (≤ 3 items) with one-tap load; spoken
  variant on session start ("two reviews due: spider walk at 120,
  pentatonic skips at 96").
- **Gate:** SRS unit tests (schedule monotonicity, cap, reset on fail);
  vitest for the due-list rendering.

### 2.6 Routines — **L**
- Schema (Rust struct, JSON-serialisable, validated):
  ```
  Routine { id, name, description, steps: [ RoutineStep {
    name, bars, bpm, subdivision, beat_groups, coaching_mode,
    sound, exercise: Option<ExerciseParams>, ramp: Option<{to_bpm, step}> } ] }
  ```
- Execution lives in `engine.rs` by generalising the speed-ramp state
  machine: step transitions happen on bar boundaries, tempo/subdivision
  swap mid-stream without stopping the stream (already how the ramp
  works). No React timers.
- Validation in Rust before load: BPM within
  `[0.6 × comfortable, 1.15 × peak]` of the exercise ceiling when one
  exists, bars ≥ 2, total ≤ 90 min.
- UI: a "Routine" panel in the Drill tab (progress, current step, skip /
  extend by footswitch). Coach is silent mid-step (existing drill-ramp
  rule) and speaks a step summary at each boundary.
- Post-routine: one aggregated report across steps, persisted to
  `routine_runs`.
- Built-in routine catalog (5): 10-min warm-up, 15-min alternate-picking
  endurance, 20-min pentatonic positions, 10-min odd-meter groups,
  "review what's due" (auto-built from SRS).
- **Gate:** engine unit tests for step transitions (no dropped beat at
  a boundary — assert via the beat log); routine validation tests; a
  full 3-step routine runs end-to-end under `tauri dev`.

### 2.7 Pitch pipeline (post-session tier only) — **L**
- Per AGENTS.md tiers, pitch analysis never runs on the audio thread.
  On segment end (mid-session report tier) or session end, analyse the
  segment's audio.
- Requires an audio buffer for the *last segment* in release builds:
  keep a bounded in-memory PCM ring (≤ 60 s, never written to disk)
  gated behind an explicit "Analyse notes" opt-in in Coach settings.
- Step A (monophonic, cheap): YIN/pYIN over the buffer → note events.
  Step B (polyphonic, later in the phase): Spotify basic-pitch ONNX via
  the `ort` crate; convert to `.ort` and trim ops; budget ≤ 15 MB added
  to the bundle. Reference ports: `sevagh/basicpitch.cpp`,
  `w-ensink/basic_pitch`.
- Deterministic analysis: pitch-class histogram → scale identification
  by bitmask distance; Needleman–Wunsch alignment of played notes vs the
  loaded exercise's notes → omitted / extra / wrong-string (when
  determinable) / per-note timing; bend and tuning-drift flags (enables
  the deferred `tuning-check` intervention).
- Facts go into the mini-report and the `events` table as structured
  data, then into the coach's context as text.
- **Gate:** WAV fixtures (`tests/pitch_fixtures/`) of a scale run, the
  same run with one omitted note, and a detuned run; assertions on
  scale id, alignment errors and tuning flag. Runtime ≤ 3 s for a 30 s
  segment on CPU.

**Phase 2 exit:** a user picks "A minor pentatonic, position 2, 16ths",
Yames generates the exercise, shows/speaks it, scores timing and notes,
updates the ceiling, and schedules the review — with the model off.

---

## 8. Phase 3 — The tutor (grounded LLM)

Goal: the user can talk to the coach — by text, by chip, by footswitch —
and get answers about *their* playing and about theory, with plans it
can act on, without the model ever fabricating a fact.

### 3.1 Tool-grounded chat — **L**
- Router, in order: (1) rule-based transactional matcher (regex over
  numbers + verbs: "set 115", "16ths", "start drill", "load spider") →
  direct IPC, no model; (2) chip pathway (existing); (3) model with
  tools.
- Tools (JSON, grammar-constrained via llama.cpp GBNF so the model
  cannot emit malformed calls): `get_session_stats()`,
  `query_history({preset?, exercise?, bpm_band?, since?})`,
  `explain_scale({root, scale})`, `list_shapes({root, scale, position?})`,
  `generate_exercise(params)`, `set_metronome({bpm?, subdivision?,
  beat_groups?})`, `load_routine(routine)`, `get_due_reviews()`.
- Loop: model → tool call → Rust executes → compact text result →
  model answers. Max 3 tool calls per turn, 3 s per generation, whole
  turn ≤ 8 s or fall back to a template ("I couldn't get to that in
  time").
- Prompt discipline: system prompt lists tools and forbids fret/scale/
  number content not present in tool results; the existing "keep all
  numbers" rephrase rule stays for tips.
- **Gate (LLM eval harness):** `src-tauri/src/bin/coach-eval.rs` +
  `evals/coach/prompts.jsonl` (≥ 50 prompts with expected tool + args).
  Standard ≥ 80 % and Full ≥ 90 % correct tool selection; grounding
  check: every fret number / note name in the answer appears in a tool
  result (regex assertion), 0 violations allowed.

### 3.2 Routine planning — **M**
- "I have 15 minutes, warm-up then picking" → model fills the `Routine`
  schema (GBNF) using `get_due_reviews`, `query_history` and ceilings →
  Rust validates and clamps (§7.6) → user confirms by tap or footswitch
  → executes. Reject-and-retry once on validation failure, then fall
  back to the closest catalog routine.
- **Gate:** eval prompts for 10 planning requests; 100 % of produced
  routines pass validation after at most one retry.

### 3.3 Theory tutoring — **M**
- Questions about scales, modes, chords, positions are answered from
  `theory.rs` tool outputs; the UI renders `FretboardView` from the
  tool result (never ASCII from the model). "Show me" requests also
  offer "make it an exercise".
- **Gate:** 15 theory prompts in the eval set; fretboard content in the
  answer must match tool output exactly.

### 3.4 Memory — **S**
- No vector store. Long-term memory = SQL summaries: per-exercise
  ceilings, per-preset trends (existing `presetAwareness`), recurring
  issues, last 3 session narratives. Assembled into ≤ 1.5 KB of plain
  text by a `buildTutorContext()` function; measured, not guessed.
- **Gate:** unit test that context never exceeds the cap.

### 3.5 Eyes-free tutor — **M**
- Footswitch/MIDI actions: `ask-what-next`, `ask-explain-last`,
  `accept-suggestion`. Answers go to TTS with the existing cooldown
  rules. Voice input (whisper.cpp) is **deferred** to Phase 4 — decide
  after measuring how often typed chat is used.
- **Gate:** actions in `useActionDispatcher`, bindable in MIDI settings.

### 3.6 Coach localisation — **M**
- Rephrase and chat answers in the UI language (Qwen3 is multilingual;
  add the language to the prompt); templates stay English source and
  are translated by the model with the numbers-lock rule; Piper voice
  per language where one exists (de, es, fr, it, nl, pl, pt-BR, ru, tr,
  vi, zh available), else English voice with a settings note.
- **Gate:** eval prompts in es and de with grounding checks.

**Phase 3 exit:** "Why do I keep rushing at 140 on the spider walk, and
what should I do about it?" gets an answer that cites the user's actual
numbers, proposes a routine, and loads it on a footswitch tap.

---

## 9. Phase 4 — Feel & scale (stretch, pick by demand)

- **Studio tier UI polish:** VRAM/RAM meter and clearer hardware
  guidance for the 8B tier (the tier itself ships in Phase 0).
- **Record-listen loop:** opt-in 10 s ring buffer, footswitch "play that
  back" with the click track overlaid using the engine's beat log for
  alignment. Never touches disk.
- **Peripheral HUD:** transparent, click-through, always-on-top edge
  glow window (macOS + Windows; Wayland unsupported) driven by drift
  bias. The floating widget already proves the window plumbing.
- **Voice input** (whisper.cpp small) if 3.5 shows demand.
- **Teachers & students:** export session/routine reports as Markdown
  or PDF; share routines and exercises as JSON files; multiple local
  profiles. No accounts, no sync.
- **New instrument profiles** (violin, mandolin, ukulele) once the pitch
  pipeline can validate them.
- **Carry-over polish:** P2-DSP-1 confidence-weighted hit completeness;
  P2-DSP-2 per-instrument score weights; P2-DSP-3 grid-correlation soft
  preempt; P3-COACH-1 TTS voice pinning; P3-COACH-2 shuffle-bag sizing;
  click-bleed cancellation stays deferred.

---

## 10. Explicit non-goals

Decided, with reasons, so future sessions don't re-litigate them.

- **No BERT/ONNX intent router.** A classifier does not extract slot
  values, needs a labelled dataset nobody has, and duplicates hotkeys,
  chips and the regex router. Grammar-constrained tool calls do the
  job.
- **No CPU core pinning.** The cpal callback thread is OS-scheduled and
  already real-time; core 0 is the worst core to pin to; the actual
  risk (llama.cpp thread count and memory bandwidth) is handled by §3.
- **No click warping.** Moving the reference corrupts calibration,
  interval consistency and drift bias, and is pedagogically contested.
- **No tatum-grid free quantisation.** A 32nd-note grid makes every
  onset "close" to something; scoring needs a prior (inferred divisor
  or phrase template).
- **No real-time pitch detection on the audio thread.** Post-session
  tier only (AGENTS.md).
- **No vector database.** SQL summaries are enough for one user's
  history.
- **No paywalled capabilities, no cloud, no telemetry, no model
  fine-tuning.**
- **No Qwen2.5-3B** (license).
- **Mobile** is a separate plan and not part of this horizon.

---

## 11. Sequencing

```
Phase 0  ─ 0.1 build ─┬─ 0.2 status ─ 0.3 Qwen3 ─ 0.5 probe
                      └─ 0.4 voice          0.6 drill (parallel-safe)
Phase 1  ─ 1.2 capture ─ 1.3 refractory ─ 1.4 voting
         ─ 1.1 SQLite (parallel) ─ 1.5 learning ─ 1.6/1.7 polish ─ 1.8 optional
Phase 2  ─ 2.1 theory ─ 2.2 generator ─┬─ 2.3 renderer ─ 2.6 routines
                                        ├─ 2.4 templates
                                        └─ 2.5 SRS (needs 1.1)
         ─ 2.7 pitch (after 2.1, parallel with 2.3–2.6)
Phase 3  ─ 3.1 tools (needs 1.1, 2.1, 2.2) ─ 3.2 planning (needs 2.6)
         ─ 3.3 theory ─ 3.4 memory ─ 3.5 eyes-free ─ 3.6 localisation
Phase 4  ─ by demand
```

Rough effort with agent-driven implementation: Phase 0 ≈ 2–3 weeks,
Phase 1 ≈ 3 weeks, Phase 2 ≈ 5–6 weeks, Phase 3 ≈ 4 weeks. Six months
is realistic for Phases 0–3 if Phase 0 starts now and gates are
enforced rather than skipped.

---

## 12. Open questions (answer before the phase that needs them)

1. **Vulkan in CI (0.1):** *Decided:* Windows/Linux builds include
   Vulkan; the GPU is tried first and CPU is the runtime fallback. CI
   must build it (Vulkan SDK on runners). If a runner cannot, that is a
   blocker to fix, not a reason to ship CPU-only.
2. **Piper on Linux (0.4):** *Decided:* use the official Piper archive,
   which already includes `espeak-ng-data`; no system package required.
3. **Audio buffer for pitch (2.7):** is a 60 s in-memory ring acceptable
   privacy-wise with an explicit opt-in? Proposal: yes, with a visible
   indicator while enabled.
4. **Exercise library UX (2.3):** exercises as presets, or a separate
   library tab? Proposal: presets, to avoid a fifth tab.
5. **Tutor surface (3.1):** stay inside the coach card, or a dedicated
   chat view? Proposal: coach card, expandable.
6. **Localisation quality (3.6):** does Qwen3-4B translate templates
   acceptably, or is Studio required for non-English? Measure in the
   eval harness before promising it.
