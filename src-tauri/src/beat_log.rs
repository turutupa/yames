//! The metronome's beat log — the one piece of `timing.rs` the audio engine
//! needs.
//!
//! Extracted from `timing.rs` for the mobile build (M01). `timing.rs` is the
//! scoring pipeline: it pulls `onset` (aubio), `session`, `session_log` and
//! `models`, none of which exist in a mobile binary. `engine.rs` only ever
//! used `BeatTick`, `BeatLog` and `create_beat_log`, so those live here and
//! are re-exported from `timing` — every existing `timing::BeatTick` path
//! still resolves.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

/// A logged beat tick from the metronome engine.
///
/// Path B — every audible tick (downbeat AND every subdivision in
/// between) is logged. The matcher's rhythm-inference picks which
/// ticks are "active" for scoring based on what the player is
/// actually playing — see `RhythmInference` below.
#[derive(Debug, Clone, serde::Serialize)]
pub struct BeatTick {
    /// Monotonic timestamp in nanoseconds (shared clock)
    #[serde(rename = "tsNs")]
    pub ts_ns: u64,
    /// Sequential beat index (0-based, resets each play session).
    /// Same beat_index repeats for each subdivision within the beat —
    /// `subdivision_index` disambiguates.
    #[serde(rename = "beatIndex")]
    pub beat_index: u32,
    /// Whether this is the first beat of a measure (only true on
    /// subdivision_index == 0 of the bar's first quarter).
    #[serde(rename = "isDownbeat")]
    pub is_downbeat: bool,
    /// Expected interval BETWEEN quarter-note beats in ms. All
    /// subdivision ticks for the same beat carry the SAME value
    /// (the quarter-note interval). The per-tick interval is
    /// `expected_interval_ms / subdivision_total`.
    #[serde(rename = "expectedIntervalMs")]
    pub expected_interval_ms: f64,
    /// Path B — which subdivision within the beat this tick represents.
    /// 0 = on the quarter; 1..subdivision_total-1 = subdivision ticks.
    /// Used by `RhythmInference` to decide whether to score this tick
    /// against the inferred grid.
    #[serde(rename = "subdivisionIndex")]
    pub subdivision_index: u8,
    /// Path B — the user-configured subdivision (1 = quarters only,
    /// 2 = eighths, 3 = triplets, 4 = sixteenths, 6 = sextuplets).
    /// Together with `subdivision_index`, this lets the matcher map
    /// each tick to its absolute phase within the beat.
    #[serde(rename = "subdivisionTotal")]
    pub subdivision_total: u8,
    /// Beats per bar the engine wrapped `measure_beat` against for this
    /// tick — the ramp's `beats_per_bar` while a speed ramp is running,
    /// otherwise the meter total (sum of `beat_groups`).
    ///
    /// The segment's `time_sig` is seeded from this instead of a
    /// hard-coded 4, so accent buckets bin against the bar the user is
    /// actually playing.
    #[serde(rename = "beatsPerBar")]
    pub beats_per_bar: u8,
}

/// Shared beat log — engine writes, timing analyzer reads.
pub type BeatLog = Arc<Mutex<VecDeque<BeatTick>>>;

pub fn create_beat_log() -> BeatLog {
    Arc::new(Mutex::new(VecDeque::with_capacity(64)))
}
