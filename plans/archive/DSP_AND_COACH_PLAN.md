# DSP & Coach Intelligence Plan

> **Status:** Active implementation spec.
> **Authored:** 2026-05-15. Consolidates prior drafts under
> `plans/dsp_and_coach_intelligence_plan/` into a single source of truth.
> **Depends on:** `PLAYING_EVALUATION_PLAN.md` (Phases 1–7, already shipped).
> **Audience:** This document is written for the Claude session that
> implements it (potentially across many sessions). It is dense, explicit,
> and assumes you will read top-to-bottom on first contact and search-jump
> on later sessions. Critical premises that are easy to violate by accident
> are marked **PREMISE** and called out in the *Critical UX Premises*
> section at the top. The *Design Rationale Appendix* at the bottom
> captures the *why* for non-obvious decisions so future sessions don't
> reverse them without understanding the consequences.

---

## How to Read This Document

1. **First contact:** read top-to-bottom. The premises section is
   load-bearing — every later section depends on them.
2. **Returning sessions:** read *Current State* (what's shipped) and *Phase
   Sequencing* to orient. Then jump to the active phase.
3. **When confused or tempted to deviate:** read the *Design Rationale
   Appendix*. It explains *why* decisions were made, particularly the
   non-obvious ones (e.g. "why is TTS the primary channel, not the
   secondary one?").
4. **Source of truth:** this document wins over anything in
   `plans/dsp_and_coach_intelligence_plan/`. Those drafts can be deleted
   once this is verified.
5. **Don't touch:** `ACCENT_PATTERN_PLAN.md`, `MOBILE_IMPLEMENTATION_PLAN.md`,
   `FEATURE_ROADMAP.md`, `PRACTICE_COACH_UX_PLAN.md`,
   `PLAYING_EVALUATION_PLAN.md`. They're out of scope.

---

## The Two Pillars

In order of importance:

1. **Great scoring (DSP).** Onset detection, beat matching, and scoring
   must be accurate across all tempos, instruments, and playing styles. If
   the score feels wrong, users lose trust in everything else.
2. **Life-like coach.** Speaks when it matters, gives productive feedback,
   references history, doesn't repeat itself, knows when to stay silent.
   If the coach feels hardcoded, users disengage.

These reinforce each other: the coach can only be as smart as the DSP data
it consumes, and the DSP data is only useful if the coach interprets it
well.

---

## Critical UX Premises (READ BEFORE TOUCHING ANY COACH WORK)

These are load-bearing assumptions. If you find yourself designing
something that violates one of them, stop and re-read the *Design
Rationale Appendix* before proceeding. They were earned through multiple
review rounds.

### PREMISE 1: TTS is the primary feedback channel during active play.

This app is **a metronome.** The user's eyes are on their instrument
(hands, sheet music, drum kit, fretboard). The screen is peripheral. The
audio output is the only channel the user can consume *while playing.*

- **Spoken (TTS) output** is the coach's *voice.* Scarce. Intervention-grade.
  Fires during active play when something is worth interrupting the
  player for. This is the **primary** feedback channel during a session.
- **Written output** is the coach's *notebook.* Silent. Generous. Granular.
  Accumulates continuously and is read during pauses, exercise transitions,
  and end-of-session review. This is the **secondary** channel.

**Common mistake to avoid:** designing around the screen as the primary
surface (because that's how most apps work). It is not. Written messages
during active play are effectively invisible — the user only sees them
when they pause and look up.

### PREMISE 2: The coach should speak frequently *at the right moments*, not constantly.

The fatigue mechanic is NOT "talks too much." It is "says the same thing
too many times." A real coach in a practice room *does* talk frequently —
they just talk at the natural punctuation points of a session (exercise
boundaries, BPM changes, milestones, struggle stretches, return-from-rest)
and they vary the *substance* of what they say, not just the phrasing.

**The variety lever is event-driven gating, not time-throttled silence.**
Earlier drafts of this plan recommended "default to silence." That was
wrong for a paid AI feature in a music app. Silence makes the feature
feel dead; users expect the AI to show up.

### PREMISE 3: 100% local. No telemetry. Ever.

- All DSP runs on-device.
- Coach LLM is local (Phi-3, Gemma-2B, Llama-3.2-3B, Mistral-7B-class).
- Session logs and history live in the app data dir, never leave.
- Privacy is the moat.

This constrains every coach decision:
- LLM context is scarce (4–8K tokens usable).
- Inference quality is lower than Sonnet/GPT-4 class.
- First-token latency varies wildly (0.5–4s).
- "The model will naturally infer X" is *not* a safe assumption.

### PREMISE 4: The coach's intelligence lives in three authoring catalogs, not in the LLM.

- **Template catalog (~450 slots):** what the coach can *observe.*
- **Chip catalog (~50 chips):** what the coach can *answer.*
- **Intervention catalog (~10–15 interventions):** what the coach can
  *suggest and act on.*

The local LLM exists only to **paraphrase** template-filled observations
for variety and to handle the long-tail of free-text Q&A. It does not
analyze, decide what to say, or compute metrics. Skimping on any catalog
and overinvesting in prompt engineering is the most likely way this
project fails to feel "smart."

### PREMISE 5: Instrument is a first-class input to every DSP and coach decision.

Drums, electric guitar, acoustic guitar, bass, piano. Every "magic constant"
in DSP (refractory floor, cluster window, max onsets per beat, expected
onset density) and every "generic phrasing" in the coach is wrong for at
least one of the five instruments. The `InstrumentProfile` struct
(Phase D0) is the single source of these constants.

### PREMISE 6: Chips first, free-text always available.

User-initiated Q&A is **first-class.** The user can ask anything.

- **Chips** (the primary surface) are pre-curated, context-aware questions
  shown at every boundary event. They handle the 80% common case with
  deterministic template-filled answers (sub-100ms, never hallucinate).
- **Free-text Q&A** is *always available* — via the "Ask something else…"
  chip and a dedicated mid-session affordance. It opens a text input,
  routes to the local LLM with a tight system prompt, and falls back
  gracefully when out-of-scope.

**Both** are present. Chips are the discovery + fast-path layer; free-text
is the escape hatch. Voice input is **deferred to v2** — the metronome
audio environment is too hostile for reliable on-device ASR.

### PREMISE 7: The "did great then stopped" moment is sacred.

When a player sustains ≥30s of playing at ≥85% accuracy and then stops
for ≥4s, that's a Signal B boundary event with a high score. It's the
single highest-leverage coach moment in the entire product — the moment
the player is most likely to feel *seen.* It should **always** cross the
TTS threshold, regardless of normal cooldown rules (within reason — see
gatekeeper section). Missing this moment is worse than over-talking.

---

## Current State (as of 2026-05-15)

### What's shipped

- Audio input capture (cpal, ring buffer, 16-band spectrum).
- Onset detection (spectral flux + Goertzel, adaptive threshold).
- Auto-calibration (running median, 16-sample window, ~8 beat convergence).
- Beat matching (±200ms window, calibration-adjusted).
- Grid correlation (continuous 0–1, subdivision-aware).
- Per-beat feedback (perfect/good/ok/miss/skipped).
- Session accumulator → `SessionReport` (grade S–F, score 0–100, insights).
- Session history (last 30 sessions, `tauri-plugin-store`).
- Practice Coach card (floating panel, feed, chat, history tab).
- Template-based coach (greeting, mini-report, summary, chat).
- TTS with 3 Piper voices + chime mode.
- Adaptive drill (model-driven or heuristic tempo).
- Async Tauri commands (no UI freeze).
- **Instrument selection UI** (drums, electric guitar, acoustic guitar,
  bass, piano, other) in settings, persisted via `tauri-plugin-store`,
  passed to every coach context string.

### What's broken (this plan fixes)

1. **Beat matching breaks at fast tempos.** ±50ms window overlaps adjacent
   beats at 200 BPM 16ths (75ms inter-beat). Random onsets always match
   something. Matching is not tempo-aware.
2. **Scoring rewards random playing.** Current formula
   (`hit_rate * 0.3 + accuracy * 0.5 + consistency * 0.2`) gives free
   points to noodling because some onsets always land near beats by
   chance. No spurious-onset penalty.
3. **Interval analysis underweighted.** The architectural insight
   ("spacing matters more than absolute position") is not reflected in the
   formula.
4. **No diagnostic visibility.** Can't see what the DSP detected, how
   onsets matched to beats, or why a score feels wrong. Formula tuning is
   guesswork.
5. **Coach has no session narrative.** Model sees a snapshot of metrics
   at query time, not the session arc.
6. **Coach has no cross-session memory.** Greetings are generic. No
   awareness of past sessions, presets, or trends.
7. **No instrument-aware DSP.** Refractory, onset density expectations,
   spurious tolerance, and chord/strum merging are all global constants
   that fit no single instrument well.
8. **No coach UX channel model.** Earlier drafts treated written and
   spoken output as parallel; they're not. TTS is primary during play.
9. **No exercise-boundary detection.** Coach can't tell when an exercise
   ended naturally vs. when the user is mid-exercise.
10. **No user-initiated Q&A.** Coach is one-way. The user can't ask
    questions about their just-finished segment.
11. **No actionable interventions.** Coach observes but doesn't suggest
    + offer affordance ("you're at 150 and struggling — drop to 140?").

---

## Phase Sequencing

The order to build in. Each phase is independently shippable in the sense
that the app still works after each merge, but the *value* of phases 4–6
depends on phases 0–3 being correct.

```
Phase 0: D0 (Instrument Profiles)
         └── struct + dropdown wiring + default values
              └── unblocks D2, D3, D4, C5 (every downstream phase consumes it)

Phase 1: D1 (Diagnostic Logging)
         └── SessionLog struct + synthetic test helpers + storage
              ↕ parallel
         C2 (Context-Aware Greetings)
         └── quick win, no DSP dependency, builds on shipped instrument UI

Phase 2: D2 (Onset Detection Hardening) + D4 (Activity Detection)
         └── D2 consumes D0; D4 emits Signal B events used by Phase 5–6
              both before D3 because D3 depends on:
                - D2's confidence scoring + refractory + cluster window
                - D4's activity detection (for hit_completeness)

Phase 3: D3 (Scoring Architecture Overhaul)
         └── 3a tempo-aware windows
              3b spurious onset tracking (instrument-aware cap)
              3c interval-first scoring (Gaussian decay, weights validated)
              3d test matrix passes all 12 scenarios

Phase 4: C1 (Session Narrative) + C3 (Preset Awareness)
         └── coach gets full session context + per-preset summaries

Phase 5: C4 (Smart Coaching Timing) + Coach UX Architecture
         └── heuristic gatekeeper + template/LLM content layer
              two-tier notification routing
              exercise-boundary detection consumed (Signals A + B)
              chip catalog + selection algorithm
              intervention catalog + trigger detection

Phase 6: C5 (Coach Personality) + Catalogs Authored
         └── shuffle-bag + last-N tracking + instrument vocabulary
              template catalog (~450 slots)
              chip catalog (~50 chips)
              intervention catalog (~10-15 interventions)
              polish pass on UX
```

**Critical sequencing rules:**

- **D0 must ship first.** Every later phase consumes the profile.
  Reordering means re-deriving instrument-specific constants twice.
- **D4 ships *with* D2, not after D3.** D3's `hit_completeness` depends
  on activity detection; if D4 lands later, the D3 test matrix has to be
  re-run.
- **C2 can ship in Phase 1** because it only depends on session history
  (already shipped), not on the DSP improvements.
- **The three catalogs (template, chip, intervention) are authored in
  Phase 6** but their *structure* must be defined in Phase 5 so the
  runtime knows how to consume them. Authoring is hours-to-days of
  writing work; the spec is a fraction of that.

---

## D0 — Instrument Profiles (Phase 0)

The single highest-leverage architectural lever. A struct, a dropdown
(already shipped), and a starting-values table. Every subsequent phase
consumes it.

### The enum

```rust
pub enum Instrument {
    Drums,
    ElectricGuitar,
    AcousticGuitar,
    Bass,
    Piano,
    Other,  // fallback; uses moderate defaults
}
```

### The struct

```rust
pub struct InstrumentProfile {
    /// Minimum time between distinct onsets (instrument physics floor).
    /// Replaces the global 20ms in D2. Drum rolls require ~15ms; acoustic
    /// guitar fingerpicking can run as tight as 50ms but legato is wider.
    pub refractory_floor_ms: u32,

    /// Onsets within this window collapse into one "musical event"
    /// before matching. Handles chord voicings, strums, polyphonic piano.
    /// Drums = 0 (each hit is a distinct event including simultaneous
    /// hi-hat + snare). Bass mostly monophonic. Piano needs 25ms for
    /// chord voicings.
    pub cluster_window_ms: u32,

    /// Cap on onsets per beat that count as "near the beat." Onsets
    /// beyond this become spurious. Replaces the magic number in the
    /// tremolo/roll exploit. Drum buzz rolls hit ~6; guitar ~3 (legit
    /// strums); piano ~8 (chord + ornaments); bass ~2.
    pub max_onsets_per_beat: u8,

    /// Expected typical onset density. Used to scale onset_efficiency
    /// so a drummer producing 2.5 onsets/beat (ghost notes, hat work)
    /// isn't over-penalized.
    pub expected_onsets_per_beat: RangeInclusive<f32>,

    /// 16-band spectrum weight emphasis for spectral flux. Drums =
    /// broadband; bass = low; guitar = mid; piano = broadband.
    pub spectral_weights: [f32; 16],

    /// Beats of silence before transitioning to Resting state.
    /// Drums + piano tolerate longer rests (musical phrasing);
    /// bass + guitar shorter.
    pub activity_silence_beats: u8,

    /// Coach vocabulary hint for LLM system prompt + template pool
    /// selector key. Drums = "kick/snare/hat/ghost notes/rim";
    /// guitar = "downstroke/upstroke/picking/palm mute"; etc.
    pub vocabulary: InstrumentVocabulary,
}
```

### Starting values (first pass — must be empirically tuned in Phase 3 validation)

| Param                       | Drums | E-Guitar | A-Guitar | Bass | Piano | Other |
|-----------------------------|-------|----------|----------|------|-------|-------|
| `refractory_floor_ms`       | 15    | 40       | 50       | 35   | 20    | 30    |
| `cluster_window_ms`         | 0     | 20       | 25       | 5    | 25    | 15    |
| `max_onsets_per_beat`       | 6     | 3        | 4        | 2    | 8     | 4     |
| `expected_onsets_per_beat`  | 1.0–3.0 | 0.5–2.0 | 0.5–2.0 | 0.5–1.5 | 1.0–4.0 | 0.5–2.0 |
| `activity_silence_beats`    | 8     | 4        | 4        | 4    | 8     | 5     |
| `spectral_weights` emphasis | broadband, low+high | mid (200Hz–4kHz) | mid+high (200Hz–8kHz) | low (40Hz–1kHz) | broadband (80Hz–4kHz) | moderate broadband |

**Tuning protocol:** these values must be revisited at the end of Phase 3
once the test matrix runs against real recordings of each instrument. The
table is a starting point, not the final calibration.

### Where the profile is consumed

- **D2 refractory period:** `max(profile.refractory_floor_ms, subdivision_interval × 0.35)`. The grid-subdivision multiplier is *added on top of* the floor, not in place of it. A grid of quarter notes doesn't physically prevent the player from playing 16ths; the floor is what protects fast articulations.
- **D2 chord/strum merging:** collapse onsets within `profile.cluster_window_ms` into one event before matching.
- **D3 spurious-onset cap:** the per-beat cap on "near a beat" onsets uses `profile.max_onsets_per_beat`.
- **D3 onset_efficiency scaling:** the metric uses `profile.expected_onsets_per_beat` to avoid over-penalizing drummers or under-penalizing bassists.
- **D4 activity detection:** silence threshold = `profile.activity_silence_beats × beat_interval_ms`.
- **C5 template selection:** `templates[profile.vocabulary][scenario][index]` keys the template pool. "Lock your kick on beat 1" never appears for a guitarist.
- **LLM system prompt:** prefix with vocabulary hint ("the player is on bass; use terms like fretting hand, root, octave").

### First-launch UX

- On first launch (no instrument saved): present an instrument-picker as a modal. Do **not** silently default to "Other" — every default is a compromise that fits no single instrument well.
- If the user dismisses without choosing, default to **electric guitar** (statistically the most likely user) and offer a settings reminder.
- Auto-detection (Phase 6+ backlog): onset density + spectral centroid over the first 16 beats can suggest an instrument as a soft "looks like you might be playing drums — switch?" prompt. Never a silent override.

### Multi-instrument users (mid-session switch)

- DSP profile swap is immediate for the *next* segment. Current segment completes with original profile.
- Coach briefly acknowledges: "Switched to piano — different vocabulary now."
- Calibration is NOT carried across instruments (different attack envelopes, mic placement, room).

### Per-instrument calibration cache

Store latency offset per `(instrument, audio_device)` pair. Don't repeat
the ~8-beat convergence period every session for the same combination.

---

## D1 — Diagnostic Logging (Phase 1)

You can't fix what you can't see. This unblocks every later phase.

### What to capture per session

```rust
pub struct SessionLog {
    pub bpm: u16,
    pub time_signature: u8,
    pub subdivision: u8,
    pub timestamp: u64,
    pub duration_ms: u64,
    pub instrument: Instrument,             // NEW (D0)
    pub instrument_profile_version: u32,    // for migration if profile defaults change

    // Ground truth: when beats were expected
    pub expected_beats: Vec<ExpectedBeat>,

    // Raw detections: what the onset detector found
    pub detected_onsets: Vec<DetectedOnset>,

    // Matching decisions: how onsets were paired to beats
    pub matches: Vec<MatchDecision>,

    // Unmatched onsets: detected but not near any beat
    pub spurious_onsets: Vec<u32>,  // indices into detected_onsets

    // Activity state transitions
    pub activity_transitions: Vec<ActivityTransition>,

    // Practice segments (D4 emits these)
    pub segments: Vec<PracticeSegment>,

    // Final report
    pub report: SessionReport,
}

pub struct ExpectedBeat {
    pub index: u32,
    pub timestamp_ms: u64,
    pub is_accent: bool,
    pub expected_bpm: u16,  // updated per-beat during adaptive drill ramps
}

pub struct DetectedOnset {
    pub timestamp_ms: u64,
    pub amplitude: f32,
    pub centroid: f32,         // spectral centroid (Hz)
    pub confidence: f32,       // 0.0–1.0, see D2
}

pub struct MatchDecision {
    pub beat_index: u32,
    /// Multiple onsets per beat are allowed (chord voicings, ghost notes).
    /// First entry is the "best match"; rest are accepted-but-not-scored.
    pub onset_indices: Vec<u32>,
    pub deviation_ms: i32,     // best-match deviation, signed (negative = early)
    pub classification: Classification,
    pub reason: MatchReason,
}

pub enum Classification {
    Perfect, Good, Ok, Miss, Skipped,
}

pub enum MatchReason {
    InsideWindow,
    OutsideWindow,
    NoActivity,
    BelowConfidence,
    ChordCluster,  // collapsed via D0.cluster_window_ms
}

pub struct PracticeSegment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub start_bpm: u16,
    pub end_bpm: u16,
    pub score: f32,
    pub component_scores: ComponentScores,
    pub end_reason: SegmentEndReason,
}

pub enum SegmentEndReason {
    SettingsChange,    // Signal A
    ActivityGap,       // Signal B
    SessionEnd,
    UserStopped,
}
```

### Synthetic test helpers (Phase 1 deliverable)

Two layers of helpers are needed. The original plan only had one — that
was insufficient (it bypassed the matching layer, which is what Phase 3
changes most).

```rust
// Layer 1: post-match (cheap, fast, for scoring-formula iteration)
pub fn score_feedbacks(feedbacks: &[BeatFeedback]) -> SessionReport;
pub fn generate_perfect_beats(count: u32, bpm: u16) -> Vec<BeatFeedback>;
pub fn generate_random_onsets(count: u32, bpm: u16, onset_density: f32) -> Vec<BeatFeedback>;

// Layer 2: raw-onset (exercises the matching pipeline, REQUIRED for D3a validation)
pub fn score_raw_onsets(onsets: &[DetectedOnset], expected: &[ExpectedBeat], profile: &InstrumentProfile) -> SessionReport;
pub fn generate_raw_onsets_perfect(beats: u32, bpm: u16, profile: &InstrumentProfile) -> (Vec<DetectedOnset>, Vec<ExpectedBeat>);
pub fn generate_raw_onsets_jittered(beats: u32, bpm: u16, jitter_std_ms: f32, seed: u64) -> (Vec<DetectedOnset>, Vec<ExpectedBeat>);
pub fn generate_raw_onsets_random(duration_ms: u64, onset_rate_per_sec: f32, seed: u64) -> Vec<DetectedOnset>;
```

**Determinism requirement:** every synthetic helper takes an explicit
`seed: u64`. No `rand::random()` calls. Test failures must be reproducible.

### Storage

- JSON in app data dir under `session_logs/`.
- Auto-prune to last 50 logs.
- Add `export_session_logs` Tauri command for analysis (dumps to a
  user-chosen file).
- **Privacy:** logs are local-only. Export is a deliberate user action
  with a clear "this includes audio metadata, no audio itself" disclosure.
- Estimated size: 30-minute session ≈ 1–2 MB. 50 logs ≈ 50–100 MB. State
  the trade-off in code comments; this is dev/debug data, not user-facing.

### What this unblocks

- D2 tuning (visualize what the detector caught vs. missed).
- D3 formula iteration (Rust unit tests with known inputs).
- D4 segment boundary tuning.
- C1 narrative authoring (real data to base entries on).
- Bug reports from real users (can attach a session log).

---

## D2 — Onset Detection Hardening (Phase 2)

Fix detection *before* tuning the formula. Bad detection data makes
formula tuning pointless — you'd compensate for detection errors, then
when you fix detection later, the formula is wrong.

### Adaptive refractory period

- **Old global:** fixed 50ms minimum.
- **New formula:** `refractory_ms = max(profile.refractory_floor_ms, subdivision_interval_ms × 0.35)`.
- **At 120 BPM quarters:** `max(20, 500 × 0.35) = max(20, 175) = 175ms`. Generous, prevents double-counting.
- **At 200 BPM 16ths:** `max(20, 75 × 0.35) = max(20, 26) = 26ms`. Tight but real.
- **Drum override** (profile-driven, not phase-specific): `max(15, 75 × 0.25) = 18ms` at 200 BPM 16ths. Drum rolls need this.
- **DO NOT key refractory off the grid subdivision alone.** A grid of quarter notes doesn't physically prevent the player from playing 16ths. The floor (from `InstrumentProfile`) is what protects fast articulations. The grid-subdivision factor is additive context, not a hard cap.

### Adaptive noise floor

- **Old:** hardcoded RMS threshold of 0.01.
- **New:**
  - Measure ambient RMS using a **continuously-updated 10th-percentile rolling window** (e.g. last 5 seconds of audio). This avoids the "user struck a note in the first 2 seconds" failure mode.
  - Set noise floor to `ambient_rms × 3`.
  - Use a **separate (lower) detection threshold for "playing has stopped"** to avoid circularity. The "stopped" threshold should be `noise_floor / 2`.

**Avoid the circular logic** in earlier drafts: "re-measure noise floor
when signal drops below threshold for >5s" — *the threshold is what we're
trying to set.* The rolling 10th-percentile fix eliminates the need for
discrete re-measurement.

### Onset confidence

- Add `confidence: f32` (0.0–1.0) to each `DetectedOnset`.
- Derived from: amplitude-to-noise ratio, spectral flux peak sharpness, distance above adaptive threshold.
- **How confidence flows downstream (this MUST be specified in D2, not left vague):**
  - D3 `onset_efficiency`: each onset contributes its confidence as a multiplier when counting "near a beat."
  - D3 `grid_alignment`: each match's classification score is multiplied by confidence before averaging.
  - C5 coach: if mean session confidence < 0.5, the coach adds a one-time caveat ("hard to hear you clearly — try moving closer to the mic"). Once per session, only if low confidence persists for 30+ seconds.

### Click cancellation — DEFERRED

Most practice setups (headphones, audio interfaces) have zero click bleed.
The case where it matters (laptop mic + laptop speakers) is the weakest
evaluation setup. Adaptive noise floor + amplitude threshold handle most
bleed in practice. **Revisit only if users report it as a problem.**

### Chord / strum merging

- Already covered by D0's `cluster_window_ms`.
- In D2, after onset detection but **before matching**, collapse any
  onsets within `profile.cluster_window_ms` of each other into a single
  event. Keep the loudest onset's timestamp; sum amplitudes.
- **Why this prevents the false-spurious penalty:** a 6-string strum produces 6 near-simultaneous transients. Without merging, 5 of them register as spurious. With merging, the strum is one musical event matched to one beat.
- **Drums explicitly skip merging** (`cluster_window_ms = 0`). Simultaneous hi-hat + snare are distinct intentional hits.

---

## D3 — Scoring Architecture Overhaul (Phase 3)

This is the critical phase. The current scoring has three fundamental
flaws: fixed-width matching windows, no spurious-onset tracking, and
underweighted interval analysis. All three must be addressed together,
along with the under-play loophole identified in review.

### D3a — Tempo-Aware Matching Windows

| Tempo | Subdivision | Beat interval | Old ±50ms coverage |
|-------|-------------|--------------|---------------------|
| 60 BPM | Quarter | 1000ms | 10% — fine |
| 120 BPM | Quarter | 500ms | 20% — acceptable |
| 120 BPM | 8th | 250ms | 40% — generous |
| 180 BPM | 16th | 83ms | 120% — windows overlap |
| 200 BPM | 16th | 75ms | 133% — completely broken |

**Fix — matching window is a fraction of beat interval, capped:**

```
window_ms = min(beat_interval_ms × 0.4, 80ms)
```

- At 120 BPM quarters: `min(200, 80) = 80ms` (similar to today).
- At 200 BPM 16ths: `min(30, 80) = 30ms` (tight, no overlap).

**Classification thresholds scale with the window:**

```
perfect = max(8ms, window_ms × 0.20)   // floor at 8ms — onset detection jitter
good    = window_ms × 0.50
ok      = window_ms × 0.80
miss    = outside window
```

The **8ms floor** on "perfect" is necessary because spectral-flux onset
detection has ~5–10ms inherent jitter. Without the floor, no one would
ever score "perfect" at 200 BPM 16ths, which test matrix scenario 9
(perfect 16ths at 180 BPM) requires.

**Greedy assignment for double-strikes near beat boundaries:**
For each onset, assign to its **nearest expected beat.** Then for each
beat, keep only the closest onset as the "best match." Additional onsets
near the same beat are accepted-but-not-scored (recorded in
`MatchDecision.onset_indices[1..]`, not penalized). Onsets that are not
the closest to *any* beat AND are outside any beat's window become
spurious (penalized in D3b).

### D3b — Spurious Onset Tracking

**The core insight:** a disciplined player produces roughly as many onsets
as there are beats. A random noodler produces many more. This ratio is
the single most powerful signal distinguishing structured from random play.

```
onset_efficiency = matched_onsets / max(total_detected_onsets, expected_onsets_floor)
```

where `expected_onsets_floor = ceil(profile.expected_onsets_per_beat.start × expected_beats)`. This prevents the metric from becoming nonsensical when the user plays very few notes (it stops being "ratio of nothing").

**Amplitude weighting:** loud spurious onsets penalize more than quiet
ones. For each spurious onset:
```
penalty_weight = clamp(amplitude / mean_amplitude, 0.3, 2.0)
```

**Per-beat cap (the tremolo/roll fix):**
At most `profile.max_onsets_per_beat` onsets per beat count as "near the
beat." Beyond that, the extras become spurious. This prevents the exploit
where 8 tremolo onsets near a single beat all count as legitimate.

**Quiet-noise spam is low-severity** because D2's adaptive noise floor
already filters most low-amplitude artifacts. A density-cap safety net
(penalize when onset density > 2× expected, regardless of amplitude) is
worth adding but not day-one critical.

### D3c — Interval-First Scoring

**The fundamental insight (from the original architecture):** latency
doesn't matter, spacing does. A player with perfectly even spacing but a
fixed offset is playing well. A player with erratic spacing where some
notes land on the grid by chance is playing poorly.

**Four components, weights PROVISIONAL until validated against the test matrix:**

```
score = interval_consistency  × W1
      + grid_alignment        × W2
      + hit_completeness      × W3
      + onset_efficiency      × W4
```

**Starting weights:** `W1=0.35, W2=0.25, W3=0.20, W4=0.20`.

**CRITICAL:** these weights produced wrong totals against the test matrix
in the review (scenarios 2, 5, 11 misalign). The weights must be
**spreadsheeted against all 12 scenarios in D3d** and either the weights
or the scenario targets adjusted *before* this ships. Do not bake the
provisional weights into production. The review found:

- Scenario 2 (perfect, miss every other beat) target 45–55. Formula gives ~90 with starting weights. Indicates W3 needs to be higher OR `hit_completeness` denominator needs the fix below.
- Scenarios 5 and 11 (constant offset) target 75–85. Formula gives ~95.
- "Interval dominates" claim for scenario 11 implies weights closer to `0.55/0.15/0.15/0.15` than `0.35/0.25/0.20/0.20`.

**The fix loop:** plug each scenario into a spreadsheet (or a Rust unit
test that prints scenario totals), iterate weights until all 12 land in
their target bands. Document the final weights in this section as a
follow-up edit.

#### Component definitions

**`interval_consistency` (0–100) — Gaussian decay, tempo-aware:**

```
σ = standard deviation of (actual_interval_i − expected_interval_i) across all i
k = window_ms × 0.4    // tempo-aware: tighter at fast tempos
score = 100 × exp(−σ² / (2k²))
```

This is completely latency-independent. Reuse `window_ms` from D3a so
strictness scales with tempo the same way the matching windows do.

**`grid_alignment` (0–100) — weighted average of classification scores:**

```
classification_score = match c {
    Perfect => 100,
    Good    => 80,
    Ok      => 50,
    Miss    => 0,
    Skipped => 0,
}
weighted_avg = Σ(classification_score_i × confidence_i) / Σ(confidence_i)
```

Same idea as today's `accuracy_score` but with tempo-aware thresholds
from D3a and confidence-weighted from D2.

**`hit_completeness` (0–100) — TOTAL expected beats, not just active beats:**

```
hit_completeness = (matched_beats / total_expected_beats) × 100
```

**CRITICAL FIX (under-play loophole):** the denominator is *total expected
beats over the whole session,* not "beats where the player was active."
Earlier definitions used active-only beats, which let players game the
formula by playing 25% of beats perfectly and letting activity detection
mask the rest. The active-vs-total distinction belongs to **session-level
"active time" statistics**, not to scoring.

The "they legitimately rested" case is handled differently:
- If the player rests for ≥`profile.activity_silence_beats × beat_interval`, D4 emits a `SegmentBoundary`. Each segment is scored independently.
- The session score is a duration-weighted average of segment scores.
- Beats during inter-segment rest don't count toward any segment's expected beats.

So the "rested" case becomes "shorter total expected beats in this
segment," not "high score on partial coverage." This closes the loophole
without punishing legitimate breaks.

**`onset_efficiency` (0–100):** defined in D3b, scaled to 0–100.

### D3d — Validation Test Matrix

Every formula change must pass these. Implemented as Rust unit tests
using the Layer 2 synthetic helpers from D1. Each test fixes a seed.

| # | Scenario | Expected score | What breaks if wrong |
|---|----------|----------------|----------------------|
| 1 | Perfect on every beat, 120 BPM, drums | 95–100 | Baseline sanity |
| 2 | Perfect placement, miss every other beat | 45–55 | hit_completeness weight / under-play fix |
| 3 | Random onsets, 3× beat count | < 25 | onset_efficiency + interval |
| 4 | Random onsets, accent on beat 1 only | < 35 | The known bug |
| 5 | All beats hit, consistently 30ms late, **calibration disabled** | 75–85 | Calibration tolerance |
| 6 | Perfect for 8 bars, then 8 bars rest, then perfect 8 bars | 85–95 | Activity detection segmenting |
| 7 | Double-time (2 onsets per beat, both inside windows) | 75–85 | Multi-onset-per-beat handling |
| 8 | < 8 beats total | No grade (preliminary flag) | Minimum data gate |
| 9 | Perfect 16ths at 180 BPM | 85–95 | Fast-tempo window scaling + 8ms floor on perfect |
| 10 | Random 16ths at 180 BPM | < 25 | Fast-tempo discrimination |
| 11 | Even spacing, +25ms offset from grid | 70–80 | Interval vs grid separation |
| 12 | Grid-aligned mean, σ=40ms erratic spacing | 50–60 | Interval consistency weight |

**Additional scenarios required (not in original plan, added from review):**

| # | Scenario | Expected score |
|---|----------|----------------|
| 13 | Drum buzz roll (6 onsets/beat) at 120 BPM, on grid | 85+ — accepted, not penalized |
| 14 | Same buzz roll but on E-Guitar profile | < 50 — guitar can't legitimately do this |
| 15 | Guitar chord strum: 6 onsets within 15ms, on beat, 120 BPM | 90+ — merged via cluster_window |
| 16 | Same strum but on Drums profile (cluster_window=0) | varies; documents the merge difference |
| 17 | Adaptive drill ramp 120→160 BPM with perfect playing throughout | 95+ — expected_interval updates per-beat |
| 18 | Manual BPM change mid-session 120→160 | New segment starts at change; both segments score independently |

**Tuning protocol:**
1. Implement all 18 scenarios as Rust unit tests with explicit seeds.
2. Run with starting weights `W1=0.35, W2=0.25, W3=0.20, W4=0.20`.
3. Identify failing scenarios.
4. Adjust weights (within reasonable bounds) until ≥16 of 18 pass.
5. For any that still fail, the scenario *target* may need adjustment if
   the formula is correct on first principles. Document each change with
   a rationale.
6. Re-run all 18 tests after every code change.

---

## D4 — Activity Detection Refinement (Phase 2, alongside D2)

### Pause tolerance

- Allow N beats of silence before transitioning to `Resting`. N comes
  from `profile.activity_silence_beats`.
- **Tempo-scaled threshold:** silence duration = `N × beat_interval_ms`.
  A 4-bar rest at 60 BPM is 12 seconds; at 200 BPM it's 3.6 seconds. The
  same N feels different at different tempos; that's correct.

### Segment boundaries

D4 owns segment detection. Boundaries fire on:

1. **Grid correlation discontinuity:** correlation drops from ≥0.7 to ≤0.3 sustained over ≥4 beats. The 0.3 threshold gap prevents flapping.
2. **BPM change:** any explicit BPM change from user UI or adaptive drill ramp transition.
3. **Activity gap:** sustained silence per the pause-tolerance rule above.
4. **Preset change:** explicit UI event.

When a boundary fires, D4 emits a `PracticeSegmentEnded` event consumed
by the coach UX architecture (Signal A/B paths — see *Exercise-Boundary
Detection* section).

### Signal B emission (the load-bearing coach event)

```rust
pub struct PracticeSegmentEnded {
    pub start_ms: u64,
    pub end_ms: u64,
    pub score: f32,
    pub component_scores: ComponentScores,
    pub bpm: u16,
    pub instrument: Instrument,
    pub preset_id: Option<String>,
    pub end_reason: SegmentEndReason,
    pub onset_count: u32,
    pub beat_count: u32,
}
```

**Signal B trigger (must be implemented in D4):**
```
if sustained_play_seconds >= 30
   AND silence_since_last_onset_ms >= 4000
   AND end_reason != SettingsChange:    // SettingsChange goes via Signal A
    emit PracticeSegmentEnded { ... }
```

The 4-second threshold filters out micro-pauses (breath, repositioning).
The 30-second minimum prevents firing on quick warmup attempts.

### Per-segment scoring weighting

The session score is a **duration-weighted average** of segment scores,
not equal-weighted. A 10-second segment shouldn't have the same impact
as a 5-minute segment.

```
session_score = Σ(segment_score_i × segment_duration_i) / Σ(segment_duration_i)
```

---

## C1 — Session Narrative (Phase 4)

### What it is

A compact running text log maintained on the JS side, included in every
LLM query.

### Example

```
Session timeline:
0:00 — Started at 120 BPM (preset: Spider Exercise, last session: 88% at 135 BPM, electric guitar)
2:30 — Segment 1 ended: 91% accuracy, solid pocket, slight rushing on beat 3
3:00 — Drill started, linear ramp 120→160
5:15 — Segment 2 ended: accuracy dropped to 68% above 140 BPM
5:20 — [Coach said]: "Consistency drops above 140 — try isolating beats 2-3 slower."
7:00 — Segment 3 ended: 84% accuracy at 135 BPM, beat 3 improved
```

### Size budget

- **Hard cap: 2KB** (~ 50–60 lines, well within any local model's context budget).
- When approaching cap: truncate the *middle* of the narrative. Always preserve:
  - The session-start line.
  - The first segment's summary.
  - The last 3 segments' summaries.
  - The most recent coach utterance.

This preserves the session *arc* (start → recent history → now) without
unbounded growth.

### Update triggers

Append a new line on:
- Session start.
- Segment end (`PracticeSegmentEnded` from D4).
- Adaptive drill milestone (BPM crossed a threshold).
- Coach utterance (with `[Coach said]:` prefix).
- Manual user action (preset change, BPM change, instrument switch).
- Activity transition (Active → Resting → Active).

### Coach's prior utterances

Include them, but **prefix with `[Coach said]:`** so the LLM doesn't echo
them as if they were its own. For local models specifically, this prevents
the "as I said before…" loop. If narrative size pressure requires
truncation, coach lines can be summarized as `[Coach gave N tips, last:
"…"]`.

### Where it's used

- Mini-report generation at Signal B.
- End-of-session summary.
- Chat answers (chip-driven or free-text).
- Smart-timing decisions in C4 (gatekeeper sees recent narrative as context).

---

## C2 — Context-Aware Greetings (Phase 1)

Quick win, no DSP dependency. Builds on shipped instrument selector and
session history.

### 4-tier hierarchy

1. **Preset with history (≥3 sessions):** reference their trend, last score, suggest a target.
   - Example: "Back at Spider Exercise — you hit 88% at 135 BPM last time. Let's see if 140 is within reach."
2. **Preset, first/second time:** reference the preset by name, set expectations.
   - Example: "Second session with Spider Exercise. Let's see if we can get past last time's 76%."
3. **No preset, has recent sessions (≥1 in last 7 days):** reference recent work without naming exercises.
   - Example: "Welcome back. You've been putting in solid work this week."
4. **No preset, no recent history:** simple, warm, no assumptions.
   - Example: "Play when you're ready — I'll track your timing."

### Definitions for "vague" terms

- **"Putting in solid work this week"** = ≥3 sessions in the rolling 7-day window AND median session score ≥75.
- **"Last week you struggled with this tempo"** = the prior session at this preset within the last 14 days scored <70 at this BPM ±5.
- **"Suggest a target"** = `min(personal_best_at_this_preset, last_session_score + 3)`. Capped at +3 to avoid demoralizing requests on a known-bad day. If the user has played within the last 4 hours and is on a downtrend, suggest *matching* last attempt rather than beating it.

### Async race condition

Session history is loaded asynchronously from `tauri-plugin-store`. The
greeting builder must:
1. Await store load with a 500ms timeout.
2. If timeout: emit a tier-4 ("history-light") greeting immediately.
3. If load completes after the greeting: do NOT replace the greeting. Surface a small "history loaded" log line in the written feed only.

This avoids a "greeting flicker" bug.

### Preset-name semantics

- **Template engine:** does NOT parse preset name strings. Treats the name as an opaque label.
- **LLM (when active):** receives the name in context; if it's meaningful ("Warm Up", "Speed Challenge") the model uses it naturally. If meaningless ("Groove 3"), the model ignores it. No keyword-matching heuristics.

---

## C3 — Preset Awareness (Phase 4)

### Per-preset summaries (extends shipped `compactPresetSummary`)

For each preset, compute on the fly from `session_logs/`:
- Session count.
- Median score.
- BPM range played.
- Best score at each BPM band (in 10-BPM buckets).
- Mean timing offset (rushing vs dragging tendency).

### Recurring-issue detection

- **BPM threshold where accuracy drops:** the lowest BPM bucket where median score < 70% across ≥3 sessions at this preset. If no such BPM exists, the user's ceiling is fine.
- **Timing tendency:** mean signed deviation across all sessions at this preset. If `|mean| > 8ms` consistently, the coach can frame feedback around it.
- **Stamina pattern:** is later-in-session score lower than early-in-session score? **Must control for tempo** — adaptive drill ramps to harder tempos, which is not stamina degradation. Stamina is "score dropped at *constant* BPM late in the session."

### Minimum data gate

- Require **≥3 sessions** at a preset before surfacing recurring patterns.
- Require **≥5 sessions OR ≥30 cumulative minutes** before surfacing stamina patterns (they're noisier).
- Below thresholds: report only single-session observations, not "patterns."

### Preset change mid-session

- Inject `[Preset changed: <name>]` line in session narrative.
- Coach should briefly acknowledge in the written feed (not necessarily TTS).
- If history exists for the new preset: "Your best here is 92% at 130 BPM."
- The session log records two preset entries; per-preset analytics see this as two separate practice slices.

---

## C4 — Smart Coaching Timing (Phase 5)

The **architectural heart of the coach.** Heuristic gatekeeper decides
WHEN to speak; template or LLM decides WHAT.

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Heuristic Gatekeeper                                        │
│  - runs every N beats (cheap)                                │
│  - reads recent metrics + session narrative                  │
│  - decides "is a comment warranted now?"                     │
│  - if yes, picks scenario tag (e.g. "accuracy_drop_at_tempo")│
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼  (scenario tag + structured context)
┌──────────────────────────────────────────────────────────────┐
│  Content Layer                                               │
│  - Template path: shuffle-bag draw from templates[instrument]│
│    [scenario], fill placeholders from structured context     │
│  - LLM path (if available): same template-filled string sent │
│    to LLM with instruction "rephrase for variety, preserve   │
│    all numbers and facts"                                    │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼  (final utterance + tier tag)
┌──────────────────────────────────────────────────────────────┐
│  Channel Router                                              │
│  - tier=spoken → TTS + on-screen banner + written feed       │
│  - tier=written → written feed only                          │
└──────────────────────────────────────────────────────────────┘
```

The LLM is **paraphrasing a filled template,** never deciding what to
say. If the LLM is unavailable or times out, the filled template ships
as-is. Every template must be a complete, accurate, specific message on
its own.

### Notable events the gatekeeper watches for

Each event has: `scenario_tag`, `tier (spoken|written)`, `cooldown_ms_override?`.

| Event | Tag | Tier | Notes |
|-------|-----|------|-------|
| Accuracy dropped >20% over last 16 beats vs prior 16 | `accuracy_drop` | spoken if BPM ≥100; written below | Trigger intervention if sustained ≥16 more beats |
| New personal best streak (≥8 perfect beats at this BPM) | `personal_best_streak` | spoken | Always |
| Rushing trend developing (last 16 beats mean offset < −5ms, prior 16 ≥ −2ms) | `rushing_trend` | written initially; spoken on second confirmation | |
| Dragging trend developing (mirror of rushing) | `dragging_trend` | written initially; spoken on second confirmation | |
| Recovery after a rough patch (score went <60 then back to ≥80 within 32 beats) | `recovery` | spoken | High-engagement moment |
| Fatigue signal (accuracy declining >10% over 3 consecutive minutes, BPM constant) | `fatigue` | spoken | Triggers rest-suggestion intervention |
| Tempo milestone in adaptive drill (BPM crossed a 10-BPM boundary upward) | `tempo_milestone` | spoken if accuracy held; written if not | |
| Sustained ≥85% accuracy for 60+ seconds at a new BPM band | `new_band_locked` | spoken | Often triggers "ready for faster?" chip on next boundary |
| Confidence dropped (D2 mean confidence < 0.5 for 30s) | `low_confidence` | written; spoken once per session | Adds caveat |

### Gatekeeper cooldown

- **Base cooldown after a spoken event:** `min(60s, max(20s, time_since_session_start × 0.1))`.
- **Cooldown is per-channel:**
  - Spoken cooldown: as above.
  - Written cooldown: `min(10s, ...)`. Written notes can run hot.
- **Reset cooldown** if the user types in chat (they're engaged, keep talking).
- **Streak suppression (mid-segment only):** while sustained ≥85% accuracy, suppress *spoken* events EXCEPT:
  - Personal best events.
  - Milestones.
  - Boundary events (Signal A/B). These ALWAYS speak.
  - Interventions (when their trigger fires).

### Latency policy

- LLM call has a **hard 3-second timeout.** After 3s, ship the filled
  template directly. The user never waits for the model.
- Queue policy: if a new event fires while the LLM is still generating
  for a previous event, **drop the queued one** (latest replaces queued).
  Generate-and-skip beats generate-and-stack.

### Adaptive cooldown floor (anti-silence)

- Even with cooldowns and suppression, if **no spoken event fires for 5
  minutes of continuous active playing,** trigger a low-priority
  `check_in` event. This is a written-or-spoken-depending-on-context tap
  on the shoulder. Prevents the "coach is asleep" feeling for long
  uneventful stretches.

### Adaptive drill staleness

During drill ramps, BPM changes every 4–8 bars. A "your timing improved at 130" comment can land at 140. Mitigation:
- Comments that reference a specific BPM are tagged with the BPM when generated.
- If the current BPM has moved by >5 from the comment's BPM at delivery time, drop the comment.

---

## C5 — Coach Personality & Templates (Phase 6)

### Template pool structure

Already specified in `InstrumentProfile.vocabulary` (D0). Templates are
keyed by:

```
templates[instrument_vocabulary][scenario_tag][severity] → Vec<String>
```

- **~5 instruments × ~30 scenarios × ~3 severities = ~450 template slots.**
- Each slot has **3–5 phrasing variants.**
- See *The Three Authoring Catalogs* section for the full authoring spec.

### Shuffle-bag selection

- Per session, per scenario+severity slot, maintain a shuffle bag.
- On selection: draw without replacement. Refill the bag from the slot's
  variants when empty.
- This guarantees maximum variety before any repetition.

### Last-N tracking (cross-scenario similarity)

- Maintain a per-session ring buffer of the last 6 utterances.
- Before emitting a new utterance, compute simple bigram-overlap with the
  ring. If overlap > 0.5, re-roll (up to 2 retries, then ship anyway).
- This catches the case where two different scenarios produce
  near-identical wording.

### LLM mode

When LLM is active, the system prompt prefix is:

```
You are a metronome practice coach. Rephrase the provided observation
for variety, preserving every number, percentage, BPM value, and
specific term. Do not add new facts. Do not analyze. The user is
practicing on {instrument}; use appropriate vocabulary: {vocabulary}.

OBSERVATION: {filled_template}
```

The LLM never receives raw metrics — only the filled template. This
keeps the model on the "rephrase only" rail.

### Coach voice rules (apply to all templates)

- **Coach voice, not chatbot voice.** "Tighten your downstroke on beat 3"
  not "I noticed that your timing on beat 3 could be improved."
- **Specific metrics, not generic encouragement.** "Your beat 3 improved
  12ms today" not "keep it up."
- **Instrument-appropriate vocabulary** baked into the template at
  authoring time. Drums never says "downstroke"; guitar never says "ghost
  note on snare."
- **Severity-graded.** Each scenario has 3 severities (encouragement,
  neutral observation, technical correction). Same observation, different
  tone.

---

## Coach UX Architecture (cross-cuts C1–C5)

This is the design layer that sits *above* the phase-based work. It
defines how outputs are *routed* and *triggered.* The phases produce
content; this architecture decides what the user actually sees and hears.

### Two-Tier Notification System

**Restate PREMISE 1:** TTS is the primary channel during active play.
Written is the notebook.

- **Spoken (TTS) output:** audible, scarce, intervention-grade. Fires
  during active play when a notable event clears the gatekeeper threshold.
  Hard cooldown 20s minimum unless a milestone or boundary event.
- **Written output:** silent, generous, granular. Accumulates continuously.
  Consumed at pauses, exercise transitions, and post-session review.

**What crosses the TTS threshold (in addition to the C4 events table):**

- Boundary events (Signal A + Signal B) — always.
- Milestones — always.
- Actionable interventions when their trigger fires — always.
- User-initiated questions (chip taps or free-text answers) — always.
- "Did great then stopped" (Signal B with segment score ≥85%) — always (PREMISE 7).

**Hard gatekeeper rules for TTS:**

- 20s minimum cooldown between spoken events except milestones/boundaries/interventions.
- No TTS during the first 4 beats of any segment (let the player settle in).
- No TTS in the last 4 beats of a *known-bounded* segment (don't talk over a natural ending).
- Streak suppression mid-segment only (see C4).
- User verbosity setting scales TTS frequency. "Silent" mode keeps the written feed running.

**What the written feed catches:**

- Everything that didn't clear the TTS bar but is still worth recording.
- Per-bar micro-stats.
- Trend notes that fire too often to speak.
- Mini-report summaries at exercise boundaries.
- Chip-driven Q&A answers (when a chip is tapped, the answer lands here).
- Coach's prior utterances (so the user can scroll back).

### Exercise-Boundary Detection

Practice has natural punctuation. The coach should speak at these
moments. D4 emits the underlying events; this section is the routing
layer.

**Signal A — Explicit UI change (highest confidence):**

- User changed BPM, time signature, preset, sound, or metronome pattern.
- Emitted by the settings store, not by D4. D4 just receives a `SettingsChanged` notification.
- Coach response: always has something to say.
  - BPM increase: "let's see how 140 goes."
  - BPM decrease: "smart — let's lock 130 in first."
  - Preset change: "switching to a tighter click."
  - Time sig change: setup framing.
- Crosses TTS threshold.

**Signal B — Activity gap after sustained play (high confidence):**

- D4 emits `PracticeSegmentEnded` per the trigger above.
- Mini-report renders on screen with:
  - Segment score + grade band.
  - Per-component breakdown.
  - Headline observation (template-filled, most-actionable insight).
  - 1–3 micro-stats selected from the written feed for that segment.
  - **Suggestion chips** (3 + "Ask something else…" — see *User-Initiated Q&A*).
  - BPM/preset display.
- Concurrent short TTS clip (~5–10 words): "nice, 92% on that one."
- "Did great then stopped" sub-event = Signal B with score ≥85% = ALWAYS speaks (PREMISE 7).

**Signal C — Rolling score discontinuity (medium confidence, V2):**

- Score jumps dramatically without an activity gap → probably a
  mid-exercise pattern switch.
- False-positive cost is high (coach saying "nice switch!" when player
  was just struggling).
- **Deferred to v2.** Don't implement in this plan. Signals A + B cover
  ~85% of real boundaries.

### Actionable Interventions

A category of coach event distinct from observation: the coach **suggests
a specific change and offers an affordance to act on it.**

**Canonical pattern: BPM drop**

```
Trigger:        sustained score < 70% for ≥16 beats AND bpm >= 100
Spoken:         "You're at 150 and struggling a bit — want to drop to 140?"
Written:        same text + structured affordance
Affordance:     [Drop to 140 BPM]  [Stay at 150]
Acceptance UX:  one-tap, large click target, OR keyboard shortcut (displayed)
                — user does NOT have to leave the instrument
```

**Other intervention types (Phase 6 authoring deliverable):**

- **Subdivision simplification.** "You're catching the click but missing the off-beats. Halve the subdivision?" → button.
- **Click placement.** "Try the click on 2 and 4 only." → toggle.
- **Rest suggestion.** "12 minutes in — pause for 30 seconds?" → start a rest timer.
- **Calibration retry.** "Latency feels off this session — recalibrate?" → triggers D2 calibration flow.
- **BPM bump up.** "Locked at 130. Try 140?" → button. (The mirror of BPM drop, fires on high sustained score.)

**Intervention design rules:**

- Grounded in metric, never generic. The trigger MUST reference a specific measurable.
- Reversible. Every intervention has a one-tap undo.
- Cooldown after declined intervention: ≥90s for the same intervention type.
- Hard cap: max 2 interventions per 5-minute window.
- Always crosses TTS threshold.

### User-Initiated Q&A — Chip-First, Free-Text Always Available

**Restate PREMISE 6:** the user can always ask anything. Chips are the
fast path; free-text is the escape hatch. Both are present.

#### Surface 1: chips at every Signal B mini-report

After the mini-report renders, display **3 context-aware chips + 1
"Ask something else…" chip.** Each chip is a pre-curated question.
Tapping a chip → answer renders in the written feed.

#### Surface 2: mid-session "ask coach" affordance

A dedicated button OR keyboard shortcut (display the shortcut in the UI)
that:
1. Pauses the metronome.
2. Renders the chip menu against current session state.
3. Resumes the metronome when the user dismisses the menu (chip tap or
   close).

Same chip catalog, same selection algorithm — just user-triggered
instead of Signal-B-triggered.

#### Chip catalog architecture

```rust
pub struct Chip {
    pub id: ChipId,
    pub label: &'static str,
    pub trigger_predicates: Vec<Predicate>,
    pub answer_pathway: AnswerPathway,
    pub answer_template: &'static str,
    pub follow_up_affordances: Vec<Affordance>,
    pub category: ChipCategory,  // for diversity constraint
    pub recency_weight: f32,     // 1.0 default; updated post-render
}

pub enum AnswerPathway {
    Canned,         // pure string lookup, no data substitution
    TemplateFill,   // template + session-data substitution
    LLM,            // routes to free-text Q&A pathway
}

pub enum ChipCategory {
    BpmAdvice,
    TimingPattern,
    Comparison,        // current session vs past
    NextStep,          // what to work on
    Diagnostic,        // why am I struggling
    Escape,            // "Ask something else"
}
```

#### Example chips (full catalog authored in Phase 6, target ~50)

```
chip: "Should I drop the BPM?"
  category: BpmAdvice
  triggers when: last_segment_score < 70 AND bpm > 100
  pathway: TemplateFill
  template: "You scored {score}% at {bpm} BPM — your best at this BPM
             is {personal_best}%. Try {bpm-10}?"
  affordance: [Drop to {bpm-10} BPM]

chip: "Ready for faster?"
  category: BpmAdvice
  triggers when: last_segment_score > 90 AND bpm < 180
  pathway: TemplateFill
  template: "You're locked in at {bpm}. Bump to {bpm+10}?"
  affordance: [Bump to {bpm+10} BPM]

chip: "How does this compare to last session?"
  category: Comparison
  triggers when: previous_session_exists_for_this_preset
  pathway: TemplateFill
  template: "Last session at {bpm} BPM you averaged {prev_score}%.
             Today you're at {today_score}%. {delta_direction} by
             {delta}%."

chip: "What was my best run today?"
  category: Comparison
  triggers when: segments_completed >= 3
  pathway: TemplateFill
  template: "Your tightest run was segment {n} at {bpm} BPM —
             {score}% with σ={sigma}ms."

chip: "Why do I keep rushing?"
  category: Diagnostic
  triggers when: mean_offset_ms < -5 sustained over last 3 segments
  pathway: TemplateFill
  template: "You're averaging {abs_offset}ms ahead of the click —
             most noticeable on beat {worst_beat}. Try emphasizing
             the *back* of the beat for a minute."

chip: "What should I work on?"
  category: NextStep
  triggers when: always (lowest priority, fallback)
  pathway: TemplateFill
  template: "{worst_component} is your weakest component this session
             ({score}). Most likely fix: {remediation}."

chip: "Ask something else…"
  category: Escape
  triggers when: always (last position)
  pathway: LLM
  affordance: text input field
```

#### Chip selection algorithm

When a mini-report renders (or the mid-session affordance opens):

1. **Hard filter.** Drop chips whose `trigger_predicates` don't qualify against current state.
2. **Relevance score.** Rank qualifying chips by relevance to the most-recent segment. Concrete: each chip carries a baseline relevance score per category, multiplied by a context bonus (e.g. BpmAdvice category gets +0.3 if last segment had a sustained BPM-related struggle).
3. **Recency penalty.** Chips shown in the previous session get their score multiplied by 0.7. Prevents the same three chips appearing every time. Persist `last_shown_session_id` in app data.
4. **Diversity constraint.** No two chips of the same category. (Except: the "Escape" chip is always present and doesn't conflict with anything.)
5. **Final selection.** Top 3 scoring + "Ask something else…" as slot 4.

#### Free-text Q&A pathway (the LLM escape)

When the user taps "Ask something else…" or types in the affordance:

1. Open text input.
2. On submit, build LLM context:
   - **System prompt:** "You are a metronome coach for the session that just ended. Answer only based on the session data provided. If asked about anything outside this scope, say you can only help with the current practice session."
   - **Context payload:** just-finished segment summary + last 60 seconds of bar-level data + current settings. ~1–2KB.
   - **User question.**
3. Show "Thinking…" indicator.
4. 3s hard timeout. If timeout: emit fallback ("I'm not sure — try one of the suggested questions above or ask about your last exercise").
5. Render LLM answer in the written feed.
6. Append to session narrative as `[Coach answered]: {question} → {answer}`.

#### Multi-session Q&A — DEFERRED TO V2

Questions like "how am I doing this week?" cross out of current-session
context. In v1, return a graceful "I can only see today's session right
now — your trend graph in the history view shows the bigger picture."

#### Voice input — DEFERRED TO V2

On-device transcription in a metronome environment is the worst-case ASR
setting (click + own playing + room reverb). Voice activation false
positives in a music app would be catastrophic (a rim shot looks like a
phoneme to a wake-word model). v1 = chips + typed free-text only.

---

## The Three Authoring Catalogs

The coach's intelligence lives here. These are P0 deliverables, not
polish. Each is hours-to-days of writing work — single-handedly cheaper
than any prompt-engineering investment, and infinitely more reliable.

### Template Catalog (~450 slots, Phase 6 authoring)

- Key: `templates[instrument_vocabulary][scenario_tag][severity]`.
- 5 vocabularies × ~30 scenarios × 3 severities = ~450 slots.
- 3–5 phrasing variants per slot for the shuffle-bag.

**Placeholder vocabulary (all templates use these):**

```
{beat_n}           e.g. "beat 3"
{drum}             e.g. "snare", "kick", "hi-hat" (drum vocab only)
{string_or_hand}   e.g. "fretting hand" (guitar/bass), "right hand" (piano)
{bpm}              numeric, e.g. 140
{delta_ms}         numeric, signed; positive = late, negative = early
{personal_best}    numeric score
{streak_length}    numeric beats
{tempo_band}       e.g. "above 140"
{worst_component}  one of: interval_consistency, grid_alignment, hit_completeness, onset_efficiency
{remediation}      a short phrase from a small remediation pool
```

**Severity grades:**

- `encouragement` — light, warm. Used for streaks, recoveries, small wins.
- `neutral` — observation tone. Used for trends, milestones.
- `correction` — technical, slightly more direct. Used for sustained issues, fatigue.

### Chip Catalog (~50 chips, Phase 6 authoring)

- See *User-Initiated Q&A* for the struct and selection algorithm.
- Aim for **balance across categories**: ~12 BpmAdvice, ~10 TimingPattern, ~10 Comparison, ~8 NextStep, ~8 Diagnostic, +1 Escape (always-present). Adjust based on what feels natural during authoring.
- Each chip should have a clear, deterministic answer pathway for the common case.

### Intervention Catalog (~10–15 interventions, Phase 6 authoring)

- See *Actionable Interventions* for the structure.
- Each intervention defines: trigger predicate, spoken text, written text, affordance(s), cooldown override.
- Initial 10:
  1. BPM drop (sustained low score).
  2. BPM bump (sustained high score).
  3. Subdivision simplification.
  4. Click placement (2-and-4).
  5. Rest suggestion (fatigue).
  6. Calibration retry (low confidence).
  7. Instrument switch suggestion (rare; only on first launch with unconfigured input).
  8. Section isolation ("just play beats 2–3 slower for a minute").
  9. Tempo isolation ("loop at 130 for 90s").
  10. Posture/breath reset (long session, declining accuracy).

**Authoring quality bar:** each intervention must read like a coach who
just leaned over, not like a UI prompt. "Want to drop to 140?" beats
"Click here to reduce tempo by 10 BPM."

---

## Local Model Considerations

The plan assumes a small local LLM (Phi-3, Gemma-2B, Llama-3.2-3B,
Mistral-7B-class) on consumer hardware. Every coach decision is
constrained by this.

### Constraints

1. **Context is scarce.** 4–8K usable tokens. System prompt + chat
   history already consume ~1–2K. Session narrative cap of 2KB
   (~500 tokens) leaves room.
2. **Inference quality is lower.** Phrasings repeat. Subtle context cues
   (preset name semantics, sentiment) are missed. "The model naturally
   infers X" is not load-bearing — always provide a deterministic
   fallback.
3. **First-token latency varies wildly.** 0.5–4s on mid-range hardware.
   The 3s hard timeout in C4 is essential.
4. **Templates are co-equal, not fallback.** Some users will run with no
   LLM (no compatible hardware, conscious skip). For those users,
   templates *are* the coach. Author the catalog to that quality bar.
5. **Repetition mitigation matters more.** Small models lock onto
   phrasings. Last-N bigram-overlap check (C5) plus shuffle-bag handles it.
6. **Streaming vs blocking.** Generate the whole comment server-side,
   then deliver to the UI as one chunk. No token-by-token streaming for
   coach output — looks worse than batched on small models.

### Pre-warm the model

- First inference call after app launch is slow (model load). Trigger a
  no-op inference during the splash screen / first idle window. Don't
  make the user pay model-load latency mid-session.

### Per-platform LLM availability

- Compatible hardware detection on first launch.
- If incompatible: gracefully degrade to templates-only mode. Don't
  surface "LLM disabled" as an error; surface "Coach is in lightweight
  mode" as a status.

---

## The Variety Budget Strategy

Restate the analysis to keep it in scope. The risk is **"the coach feels
repetitive by month 2."** Fixed via:

### Two budgets, not one

- **Phrasing budget** (small, exhausts fast): how many ways to say "your
  beat 3 improved." Local models exhaust this in weeks.
- **Substance budget** (large, grows with data): how many *different
  things* to talk about. Grows with the user's history.

**Strategic insight:** users don't notice phrasing repetition if the
*substance* is different. Substance is the lever.

### Mitigation levers (in priority order)

1. **Two-tier channel split.** Spoken stays scarce + varied (small budget, easy to maintain). Written runs hot + granular (large budget, repetition tolerated).
2. **Event-driven coach moments.** Practice has punctuation; each event is intrinsically different content.
3. **Substance growth via progressive disclosure.** Week 1: basic timing. Week 2: consistency. Week 3: tempo-band. Each new metric unlocks fresh content.
4. **Milestone & achievement events.** Inherently scarce; always feel earned.
5. **Comparative time-window framing.** Same metric, different reference frame ("first time this week at 130", "best 30 seconds today").
6. **Suggestion chips as substance multiplier.** ~50 chips × context-aware selection = different menu each session.
7. **Streak hysteresis on TTS only.** Written feed annotates during streaks.
8. **Question prompts instead of statements.** Sparingly.
9. **Periodic summary digests** (Sunday weekly, end-of-month).
10. **User-tunable verbosity** ("Less / Default / More / Silent" — scales TTS budget; written feed always available).
11. **Don't fake substance variety with phrasing variety.** Anti-pattern. The catalog must have real different *things to say*, not just different ways to say the same thing.

### Honest acknowledgment

A daily user will feel some repetition by month 12. That's unavoidable —
this is a metronome coach, not a music coach. Win condition:

- Enough variety to feel fresh through month 3.
- Enough substance growth to keep new things appearing through month 6.
- A graceful "background companion" mode by month 12 — reliable, helpful,
  speaks at the right moments, leaves you alone otherwise.

---

## Future AI Features (Backlog)

Only pursue if DSP can't solve it AND there's clear user demand.

| Feature | What | When |
|---------|------|------|
| Voice input | User asks coach questions by speaking | After v1 ships; needs noise-robust ASR |
| Multi-session Q&A | "How am I doing this week?" | After C3 is mature |
| Multi-drum classification | Identify kick/snare/hat per onset | When drummer users ask |
| Technique classification | Detect picking styles, articulations | After user base grows |
| Note pitch detection | Polyphonic transcription | Different product scope |
| Click cancellation | Remove metronome bleed from input | If users report bleed issues |
| Signal C boundary detection | Mid-exercise switch detection without rest gap | Only if Signals A+B prove insufficient |
| Auto-instrument detection | Suggest instrument from onset signature | After D0 is stable |

---

## Open Questions (Unresolved Decisions)

These need answers *during* implementation, ideally before the relevant
phase ships. Numbered so future sessions can resolve them by reference.

**OQ1: Calibration carry-over between presets.**
On preset switch, do we (a) reset calibration (accurate but 8 beats of
noise) or (b) keep calibration if same audio device (assumes similar
latency)? **Recommendation:** reset + exclude the 8-beat convergence
period from scoring. Implement (a) but flag this in the test matrix —
scenario "convergence beats excluded from score."

**OQ2: Subdivision playing vs onset efficiency.**
If the grid is quarter notes but the player plays 8ths, every off-beat
is "spurious." When grid correlation at a harmonic subdivision exceeds
0.7, adjust `expected_onsets` to include that subdivision. Open: what
counts as "exceeds 0.7"? Sustained over how many beats? **Best guess:**
≥8 beats. Validate against scenarios 7 and 13–16.

**OQ3: Swing/shuffle support.**
Interval consistency assumes evenly spaced subdivisions. Swing alternates
long-short 8ths. Solution: `interval_consistency` compares against an
`expected_interval[]` array, not a single value. Straight time = all
equal. Swing = alternating. The formula works unchanged. Open: when does
this ship? **Recommendation:** scaffold the array form in Phase 3 (so
the formula isn't repainted later), implement actual swing presets in a
later phase as a backlog item.

**OQ4: Minimum data gate thresholds.**
- < 16 beats: "preliminary" flag, no grade.
- 16–32 beats: show score, flag preliminary.
- ≥32 beats: full confidence.
Open: are these the right thresholds? Validate empirically during Phase 3.

**OQ5: Confidence threshold for coach caveat.**
"If mean session confidence < 0.5, coach mentions unclear signal." Open:
should the threshold be lower (0.4)? Should it require sustained
duration (30s) before firing? **Recommendation:** 0.5 sustained for 30s,
one-shot caveat per session.

**OQ6: Drill ramp staleness window.**
"If current BPM has moved by >5 from the comment's BPM at delivery, drop
the comment." Open: is 5 the right delta? May need to be tempo-relative
(±3% of current BPM).

**OQ7: Chip recency penalty decay.**
"Chips shown last session get 0.7× score." Open: does this decay back to
1.0 after N sessions of not being shown? **Recommendation:** yes, linear
recovery of 0.05 per session, capped at 1.0.

**OQ8: Mid-session "ask coach" affordance — keyboard shortcut choice.**
Open: which key? Spacebar conflicts with metronome start/stop. Slash key
(`/`) is conventional for chat. **Recommendation:** `/` opens the chip
menu while paused; `?` while playing pauses+opens. Document in onboarding.

**OQ9: Adaptive cooldown floor (5-minute check-in).**
Open: what does the check-in actually say? Generic ("how's it feeling?")
is bad. **Recommendation:** template-driven, references the most recent
meaningful metric ("steady at 130 — your interval consistency is at 88").

**OQ10: Per-instrument calibration cache eviction.**
Open: when does a cached `(instrument, audio_device)` calibration expire?
Hardware can drift, drivers can change. **Recommendation:** 30-day TTL +
explicit "recalibrate" button in settings.

**OQ11: Instrument-specific test scenarios — coverage.**
Scenarios 13–18 cover drum buzz rolls, guitar chord strums, and drill
ramps. Open: do we need a piano-specific scenario (sustain pedal? chord
voicings with timing offsets between voices)? **Recommendation:** add
one in Phase 3 if piano users surface issues.

**OQ12: Session log size budget.**
50 logs × 1–2 MB = 50–100 MB on disk. Open: too much for users with
small SSDs? **Recommendation:** 50 logs is fine for desktop; ship as-is,
revisit on user complaint. Add a "clear logs" settings option.

---

## Principles

1. **Scoring accuracy is existential.** If the score feels wrong, users lose trust in everything.
2. **The coach is a translator, not an analyst.** DSP does all analysis. The coach (templates + LLM rephrasing) translates structured metrics into human language with personality.
3. **Interval consistency is the north star DSP metric.** Robust, latency-immune, directly measures musicianship.
4. **A coach that remembers is a coach that feels real.** Session narratives and history summaries are the difference between "stats that talk" and "a person who knows you."
5. **Privacy is the moat.** 100% local. No cloud. No telemetry. Ever.
6. **Test with synthetic data first.** Rust unit tests with known inputs make formula iteration fast and deterministic. Real-world testing validates, doesn't drive, the tuning.
7. **TTS during play; written is the notebook.** The user is looking at the instrument. Design audio-first.
8. **Speak at events, not on a clock.** Practice has natural punctuation; speak there. Don't gate with silence.
9. **Three catalogs > one clever model.** Invest in template, chip, and intervention authoring. Better catalogs beat better prompts every time.
10. **The "did great then stopped" moment is sacred.** Highest-leverage event in the entire product. Never miss it.

---

# Design Rationale Appendix

This appendix exists so future sessions don't reverse load-bearing
decisions without understanding *why* they were made. Each entry
captures: the decision, the alternative that was rejected, and the
reason. Read this when you find yourself tempted to deviate.

## Why event-driven gating, not default-to-silence

**Decision:** the coach speaks at *events* (boundaries, struggles,
milestones), not on a time clock and not with silence as the default.

**Rejected alternative:** "default to silence; speak only every 8–10
minutes." This was an earlier draft recommendation.

**Why it was wrong:**
- This is a paid AI feature. If the AI is silent most of the time, the
  user feels they're not leveraging the paid feature.
- A real coach in a practice room talks frequently. They just talk at
  the right moments. The fatigue mechanic is *repetition*, not
  *frequency*.
- Silence isn't the right lever. Event diversity is. Each event (BPM
  change, segment end, milestone) is intrinsically different content;
  the variety solves itself if you trigger on events.

## Why TTS is the primary channel during play, not the screen

**Decision:** TTS is the *primary* feedback channel during active
practice. Written output is the notebook.

**Rejected alternative:** the original draft treated written as primary
and TTS as a secondary "callout" mode. That's the conventional pattern
for most apps.

**Why it was wrong:**
- This is a *metronome.* The user's eyes are on their instrument
  (hands, fretboard, drum kit). The screen is peripheral.
- Written notifications during active play are effectively invisible —
  the user only sees them when they pause and look up.
- The only channel the user can consume *while playing* is audio.
- Inverting the channel hierarchy from rev 3 → rev 4 of the review is
  what unblocked the "actionable interventions" pattern (the BPM-drop
  suggestion) — that pattern only makes sense if TTS is the spoken
  layer.

## Why three catalogs (template + chip + intervention), not LLM cleverness

**Decision:** invest authoring effort in three structured catalogs.
Use the LLM only for paraphrasing and free-text Q&A escape.

**Rejected alternative:** rely on the LLM to "figure out what to say"
given session context. Saves authoring effort.

**Why it was wrong:**
- Local LLMs (Phi-3, Gemma-2B, Llama-3.2-3B) cannot analyze. They can
  paraphrase. Asking them to decide what to say produces generic,
  inconsistent, occasionally wrong output.
- The user-perceived "intelligence" of the coach is a function of the
  *menu of things it can say.* A 50-chip catalog with deterministic
  answer pathways feels smarter than a clever LLM prompt every time.
- Catalog authoring is hours-to-days of work, done once. Prompt
  engineering is weeks of work with unreliable results.
- Catalogs degrade gracefully on no-LLM platforms (templates *are* the
  coach in that case).

## Why chips + free-text Q&A, not chips-only

**Decision:** chips are the primary discovery surface; free-text Q&A is
*always* available via the "Ask something else…" chip and the
mid-session affordance.

**Rejected alternative:** chips-only. Simpler, lower hallucination risk.

**Why it was wrong:**
- Users will inevitably want to ask things outside the chip catalog.
  Refusing them ("only these questions are supported") makes the coach
  feel dumb.
- The LLM is a reasonable long-tail escape hatch with a tight system
  prompt + canned-answer fallback. The hallucination risk is bounded.
- Chips handle the 80% case fast and reliably. Free-text handles the
  20% long tail. Both/and.

## Why D0 (instrument profiles) is Phase 0, not Phase 6

**Decision:** instrument profiles ship first. Every later phase consumes them.

**Rejected alternative:** ship D2/D3 with global constants, retrofit
instrument awareness later.

**Why it was wrong:**
- Every "magic constant" in D2/D3 is wrong for at least one of the five
  instruments. Refractory, max onsets per beat, expected density,
  cluster window — all of these need per-instrument values.
- Retrofitting means re-deriving those constants twice and re-running
  the D3 test matrix.
- Doing D0 first is cheap (a struct, a dropdown, default values) and
  every downstream phase consumes it cleanly.

## Why D4 ships alongside D2, not after D3

**Decision:** D4 (activity detection + segment boundary events) ships in
Phase 2 with D2, before D3.

**Rejected alternative:** original plan had D4 in Phase 6 (polish).

**Why it was wrong:**
- D3's `hit_completeness` and segment-weighted session scoring depend
  on D4's activity detection.
- If D4 lands after D3, the D3 test matrix has to be re-run, and any
  user-facing score calibration shifts.
- D4 also emits the Signal B events that the Phase 5 coach UX
  architecture consumes. Late D4 = blocked Phase 5.

## Why `hit_completeness` uses total expected beats, not active beats

**Decision:** the denominator is total expected beats over the whole
session (or segment), not "beats where the player was active."

**Rejected alternative:** original plan used active-beats denominator.

**Why it was wrong:**
- The active-beats denominator allowed gaming: play 4 perfect beats,
  stop for 4 beats (activity detection masks them as resting), repeat.
  Player gets an A grade for 25% coverage.
- The active-vs-total distinction belongs to session-level "active time"
  statistics, not to scoring.
- Legitimate rests are handled by segment boundaries (D4 emits a
  segment end on sustained silence). Each segment is scored
  independently with its own total expected beats; the session score
  is duration-weighted.

## Why no voice input on MVP

**Decision:** chips + typed free-text only. Voice input is v2.

**Rejected alternative:** ship voice input with on-device ASR
(Whisper-small or similar).

**Why it was wrong:**
- The audio environment is hostile: click + own playing + room reverb
  is close to worst-case for any ASR.
- Voice activation false positives in a music app would be catastrophic
  — a rim shot looks like a phoneme to a wake-word model.
- Push-to-talk would work but requires the user to grab the mouse or
  use a hotkey, removing voice's main UX advantage.
- Defer until after v1 ships and there's data on actual user demand.

## Why mid-session Q&A is in scope, not just end-of-session

**Decision:** mid-session Q&A is allowed via a dedicated affordance that
pauses the metronome.

**Rejected alternative:** Q&A only at session end.

**Why it was wrong:**
- The user already interrupts their own flow to ask the question.
  Latency interruption isn't a concern when *they* initiated the pause.
- Most natural mid-session questions ("how was that?", "should I drop
  the BPM?") have fresh-data answers right after the segment, not at
  session end.
- The chip catalog already exists; reusing it mid-session is near-zero
  marginal effort.

## Why multi-session Q&A is deferred to v2

**Decision:** v1 Q&A is bounded to the current session.

**Rejected alternative:** allow "how am I doing this week?" questions.

**Why it was wrong (for now):**
- Multi-session Q&A requires retrieval over historical session logs,
  which adds context-size and latency pressure on the local model.
- The history view + trend graphs already surface most multi-session
  insights visually.
- Defer until v1 telemetry shows users asking these questions.

## Why the 8ms floor on "perfect" classification

**Decision:** `perfect = max(8ms, window_ms × 0.20)`.

**Rejected alternative:** no floor, perfect scales with window unboundedly tight.

**Why it was wrong without the floor:**
- Spectral-flux onset detection has 5–10ms inherent jitter on
  consumer-grade audio hardware.
- Without an 8ms floor, "perfect" at 200 BPM 16ths requires <6ms
  accuracy, which is below detection resolution.
- Effectively nobody would ever score "perfect" at fast tempos, even
  with deterministic playback. Test scenario 9 (perfect 16ths at 180
  BPM, target 85+) would fail.

## Why the LLM never receives raw metrics, only filled templates

**Decision:** the LLM's input is a fully-formed template-filled
sentence; it rephrases for variety.

**Rejected alternative:** send the LLM raw metrics + system prompt,
have it compose the sentence.

**Why it was wrong:**
- Local models inconsistently format numbers ("twelve milliseconds" vs
  "12ms" vs "12 ms").
- Local models occasionally fabricate metric values that weren't in the
  input.
- Local models conflate metrics (mixing up beat 3 timing with beat 2
  timing).
- Pre-filling the template eliminates all of these. The LLM's only
  remaining job is paraphrasing — which is the one thing it does
  reliably well.

## Why the per-beat cap on "near a beat" onsets

**Decision:** at most `profile.max_onsets_per_beat` onsets count as
"near a beat"; the rest become spurious.

**Rejected alternative:** allow unlimited onsets per beat as long as
each is "near."

**Why it was wrong:**
- A guitarist doing a fast tremolo near a beat produces 6–8 onsets all
  within ±40ms. All 8 are "near a beat"; under the unbounded rule,
  `onset_efficiency` stays at 1.0 and the playing scores like clean
  technique.
- The per-beat cap (drums=6, guitar=3, etc.) makes the metric reflect
  what's physically plausible for each instrument.
- The exploit collapses: a guitarist playing 8 tremolo onsets at one
  beat has 3 counted near the beat + 5 spurious, which correctly
  penalizes them.

---

## Closing

This plan is the single source of truth for DSP scoring and coach
intelligence work. It supersedes everything in
`plans/dsp_and_coach_intelligence_plan/`. Read the *Critical UX Premises*
section before touching any coach code. Read the *Design Rationale
Appendix* before deviating from any architectural decision.

When in doubt: **DSP is the foundation, templates+chips+interventions
are the surface, the LLM is decoration, and the user is looking at their
instrument — not at the screen.**
