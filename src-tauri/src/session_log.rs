//! D1 — Diagnostic Logging
//!
//! Comprehensive per-session capture: ground truth (expected beats),
//! raw detections (onsets), matching decisions, activity transitions,
//! practice segments, and the final report. Stored as JSON in
//! `app_data_dir/session_logs/` and auto-pruned to the last
//! `MAX_SESSION_LOGS` files.
//!
//! "You can't fix what you can't see." This module unblocks D2 (onset
//! hardening), D3 (scoring formula iteration), D4 (segment tuning), and
//! C1 (narrative authoring). The wider pipeline (engine → eval → log)
//! is wired in later phases; D1 ships the types + storage + synthetic
//! test helpers so the subsequent phases have a stable foundation.
//!
//! Two layers of synthetic helpers (the plan emphasizes both):
//!   * **Layer 1** (post-match): operates on `BeatFeedback` to iterate
//!     the scoring formula in isolation. Fast, deterministic.
//!   * **Layer 2** (raw-onset): operates on `DetectedOnset` +
//!     `ExpectedBeat` and exercises the matching pipeline. Required
//!     for D3a validation — the matcher is what Phase 3 changes most.
//!
//! Determinism: every synthetic helper takes an explicit `seed: u64`.
//! No `rand::random()` calls. Test failures must be reproducible.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::instrument::{Instrument, InstrumentProfile, INSTRUMENT_PROFILE_VERSION};
use crate::session::SessionReport;
use crate::timing::{tempo_aware_window_ms, window_thresholds, BeatFeedback};

/// Maximum number of session logs to retain on disk. ~30-min sessions
/// average 1–2 MB so 50 logs ≈ 50–100 MB. This is dev/debug data, not
/// user-facing — the trade-off is explicit (storage vs. ability to
/// debug regressions retroactively).
pub const MAX_SESSION_LOGS: usize = 50;

/// Subdirectory under app_data_dir for session log JSON files.
pub const SESSION_LOGS_DIR: &str = "session_logs";

// ---------------------------------------------------------------------------
// Data types — mirror plan D1 §"What to capture per session"
// ---------------------------------------------------------------------------

/// Full per-session diagnostic log. Persisted as one JSON file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLog {
    pub bpm: u16,
    #[serde(rename = "timeSignature")]
    pub time_signature: u8,
    /// Accent grouping of the bar (e.g. `[3, 2, 2]` for 7/8). Sums to
    /// `time_signature`. `#[serde(default)]` — logs written before beat
    /// grouping existed load with an empty vec rather than failing.
    #[serde(rename = "beatGroups", default)]
    pub beat_groups: Vec<u8>,
    pub subdivision: u8,
    /// Seconds since UNIX epoch (session start).
    pub timestamp: u64,
    /// Human-readable session start time in RFC 3339 / ISO 8601 format (UTC).
    /// Example: "2026-05-22T13:13:41Z".  Added alongside the numeric
    /// `timestamp` field so logs are readable without a Unix-epoch converter.
    /// Defaults to an empty string for old logs that pre-date this field.
    #[serde(rename = "startedAt", default)]
    pub started_at: String,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    pub instrument: Instrument,
    /// Version of the `InstrumentProfile` defaults this log was
    /// produced with. Allows migration if profile defaults change.
    #[serde(rename = "instrumentProfileVersion")]
    pub instrument_profile_version: u32,

    /// Ground truth — when beats were expected.
    #[serde(rename = "expectedBeats")]
    pub expected_beats: Vec<ExpectedBeat>,

    /// Raw detections — what the onset detector found.
    #[serde(rename = "detectedOnsets")]
    pub detected_onsets: Vec<DetectedOnset>,

    /// How onsets were paired to beats.
    pub matches: Vec<MatchDecision>,

    /// Indices into `detected_onsets` for onsets that didn't pair with
    /// any beat (i.e. didn't fall inside any beat's matching window).
    #[serde(rename = "spuriousOnsets")]
    pub spurious_onsets: Vec<u32>,

    /// State transitions of the activity detector (D4 will populate
    /// this; D1 reserves the field).
    #[serde(rename = "activityTransitions")]
    pub activity_transitions: Vec<ActivityTransition>,

    /// Practice segments (D4 emits these; D1 reserves the field).
    pub segments: Vec<PracticeSegment>,

    /// Per-second input-level snapshots from the cpal callback.
    /// Empty for legacy logs (`#[serde(default)]` keeps deserialization
    /// of pre-monitoring logs working). Populated during live sessions
    /// to make stalled-stream / silent-input regressions debuggable from
    /// the JSON alone — without needing the paired WAV (which itself can
    /// go silent if the stream stalls).
    #[serde(rename = "audioLevels", default)]
    pub audio_levels: Vec<AudioLevelSnapshot>,

    /// Final aggregate report.
    pub report: SessionReport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpectedBeat {
    pub index: u32,
    #[serde(rename = "timestampMs")]
    pub timestamp_ms: u64,
    #[serde(rename = "isAccent")]
    pub is_accent: bool,
    /// May change per-beat under an adaptive drill ramp.
    #[serde(rename = "expectedBpm")]
    pub expected_bpm: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedOnset {
    #[serde(rename = "timestampMs")]
    pub timestamp_ms: u64,
    pub amplitude: f32,
    /// Spectral centroid (Hz).
    pub centroid: f32,
    /// 0.0–1.0. D1 fills with `1.0` for synthetic data; D2 will
    /// produce real values once confidence enters the detector.
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchDecision {
    #[serde(rename = "beatIndex")]
    pub beat_index: u32,
    /// First entry is the "best match"; rest are accepted-but-not-scored
    /// (chord voicings, ghost notes).
    #[serde(rename = "onsetIndices")]
    pub onset_indices: Vec<u32>,
    /// Best-match deviation in ms (signed — negative = early).
    #[serde(rename = "deviationMs")]
    pub deviation_ms: i32,
    pub classification: Classification,
    pub reason: MatchReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Classification {
    Perfect,
    Good,
    Ok,
    Miss,
    Skipped,
}

// `from_str`/`as_str` are part of the synthetic-test surface in
// `timing.rs::tests` and `session_log.rs::tests`; lib-only builds
// don't reach them so cargo flags the items as never used. The
// allow-attr keeps the default build warning-clean without losing
// the helpers (they're plan-mandated for D1 fixture generation).
#[allow(dead_code)]
impl Classification {
    /// Map the legacy `String` classification (from `BeatFeedback`) to
    /// the enum. Unknown values map to `Skipped` defensively.
    pub fn from_str(s: &str) -> Self {
        match s {
            "perfect" => Classification::Perfect,
            "good" => Classification::Good,
            "ok" => Classification::Ok,
            "miss" => Classification::Miss,
            _ => Classification::Skipped,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Classification::Perfect => "perfect",
            Classification::Good => "good",
            Classification::Ok => "ok",
            Classification::Miss => "miss",
            Classification::Skipped => "skipped",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MatchReason {
    /// Onset landed within the per-class matching window.
    InsideWindow,
    /// Onset(s) existed near the beat but outside the matching window.
    OutsideWindow,
    /// Activity detector said the user wasn't playing (warmup/idle).
    NoActivity,
    /// Onset existed but the detector's confidence was below the floor.
    BelowConfidence,
    /// Multiple onsets within `cluster_window_ms` collapsed into one.
    ChordCluster,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityTransition {
    #[serde(rename = "timestampMs")]
    pub timestamp_ms: u64,
    /// e.g. "idle→active", "active→resting". Free-form to keep D4 nimble.
    pub transition: String,
}

/// A one-second snapshot of cpal callback input levels.
///
/// Logged so that "the WAV went silent for 9 minutes while the DSP kept
/// detecting onsets" regressions are debuggable without re-running the
/// session. If `peak` drops to near-zero while `frames` keeps incrementing,
/// the stream is alive but the input is silent (user muted their guitar
/// or the interface disconnected). If `frames` stops incrementing, the
/// cpal callback itself stalled (Core Audio xrun, device reroute, OS
/// power management) and the WAV recorder genuinely lost data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioLevelSnapshot {
    /// Wall-clock timestamp (ms since session start) when this window closed.
    #[serde(rename = "timestampMs")]
    pub timestamp_ms: u64,
    /// Peak absolute sample value across the window. 0.0 = digital silence.
    pub peak: f32,
    /// Mean absolute sample value across the window (RMS-ish but cheap).
    pub mean: f32,
    /// Number of samples in this window. Below `sample_rate` means the
    /// cpal callback fired less than expected — possible stall / xrun.
    pub frames: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PracticeSegment {
    #[serde(rename = "startMs")]
    pub start_ms: u64,
    #[serde(rename = "endMs")]
    pub end_ms: u64,
    #[serde(rename = "startBpm")]
    pub start_bpm: u16,
    #[serde(rename = "endBpm")]
    pub end_bpm: u16,
    /// Composite D3 score in **0–100** range.
    ///
    /// Produced by `timing::score_segment` which weights its four
    /// [0, 1] sub-components and multiplies by 100 at the bottom. Do
    /// not confuse with `component_scores.*`, which are individual
    /// 0–1 fractions. `SessionAccumulator::report` consumes this
    /// field directly via `duration_weighted_session_score` (scale
    /// preserving) so any tests that synthesise segments must use
    /// 0–100 here too — passing 0.75 by accident here produces a
    /// session score of `1` instead of `75` (v0.9 regression).
    pub score: f32,
    #[serde(rename = "componentScores")]
    pub component_scores: ComponentScores,
    #[serde(rename = "endReason")]
    pub end_reason: SegmentEndReason,
    /// Path B — divisor the rhythm-inference settled on for this
    /// segment. 1 = quarters, 2 = 8ths, 3 = triplets, 4 = 16ths,
    /// 6 = sextuplets. `#[serde(default)]` so historic logs (written
    /// before Path B) still deserialize cleanly: missing field is read
    /// as 0 and the JS / post-hoc tooling can treat 0 as "unknown".
    #[serde(rename = "inferredDivisor", default)]
    pub inferred_divisor: u8,
    /// Path B — confidence of the inferred divisor at segment close
    /// (fit ratio, 0.0–1.0). 0.0 if the matcher never locked.
    #[serde(rename = "inferredDivisorConfidence", default)]
    pub inferred_divisor_confidence: f64,
    /// D4c — raw per-onset interval errors (ms) as fed into the IC
    /// Gaussian. Logged for post-hoc diagnosis of anomalous IC scores
    /// (e.g. burst-practice contamination). `#[serde(default)]` keeps
    /// historic logs (written before this field) deserializing cleanly.
    #[serde(rename = "intervalErrors", default)]
    pub interval_errors: Vec<f64>,
}

/// D3c — four-component scoring breakdown. Each component is in `[0, 1]`
/// (multiply by 100 to get the "0–100" form the plan documents).
///
/// Plan formula (see D3c in `plans/archive/DSP_AND_COACH_PLAN.md`):
/// ```text
/// score = interval_consistency × W1
///       + grid_alignment       × W2
///       + hit_completeness     × W3
///       + onset_efficiency     × W4
/// ```
///
/// `interval_consistency` is latency-independent (it measures spacing
/// only). `grid_alignment` rewards on-grid placement. `hit_completeness`
/// uses TOTAL expected beats — not active-only — to close the under-play
/// loophole. `onset_efficiency` distinguishes structured practice from
/// random noodling.
///
/// Wire format uses camelCase to match the JS-side `ComponentScores` type.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ComponentScores {
    #[serde(rename = "intervalConsistency")]
    pub interval_consistency: f32,
    #[serde(rename = "gridAlignment")]
    pub grid_alignment: f32,
    #[serde(rename = "hitCompleteness")]
    pub hit_completeness: f32,
    #[serde(rename = "onsetEfficiency")]
    pub onset_efficiency: f32,
    /// Mean amplitude of onsets that fell on downbeat positions (beats 1, 3
    /// of a 4/4 bar at the active subdivision). `None` when fewer than 2
    /// data points were collected (segment too short, or no hits on those
    /// positions).
    #[serde(
        rename = "downbeatAmpAvg",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub downbeat_amp_avg: Option<f32>,
    /// Mean amplitude of onsets that fell on upbeat positions (beats 2, 4).
    #[serde(
        rename = "upbeatAmpAvg",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub upbeat_amp_avg: Option<f32>,
    /// Mean amplitude of onsets that fell on subdivision positions (all
    /// positions that are neither downbeat nor upbeat).
    #[serde(
        rename = "subdivisionAmpAvg",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub subdivision_amp_avg: Option<f32>,
    /// Population standard deviation of all matched onset amplitudes.
    /// `None` when fewer than 4 matched onsets were recorded.
    #[serde(rename = "ampStdDev", skip_serializing_if = "Option::is_none", default)]
    pub amp_std_dev: Option<f32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SegmentEndReason {
    /// Signal A — BPM, time signature, subdivision, etc. changed.
    SettingsChange,
    /// Signal B — activity detector saw a gap longer than threshold.
    ActivityGap,
    /// Signal D — grid-correlation discontinuity. Player was locked
    /// to the subdivision grid (correlation ≥ GRID_LOCK_THRESHOLD)
    /// and then dropped to ≤ GRID_LOSS_THRESHOLD for at least
    /// GRID_LOSS_SUSTAIN_BEATS consecutive beat ticks. Distinct from
    /// ActivityGap: the player is still playing, just not following
    /// the grid anymore.
    GridDiscontinuity,
    SessionEnd,
    UserStopped,
}

// ---------------------------------------------------------------------------
// Storage — JSON per session in `app_data_dir/session_logs/`.
// ---------------------------------------------------------------------------

/// Build a deterministic file name from session start timestamp.
/// Adding monotonic ns suffix avoids collisions on rapid re-creates.
fn build_filename(session: &SessionLog) -> String {
    format!(
        "session_{:010}_{:020}.json",
        session.timestamp,
        crate::clock::now_ns()
    )
}

/// Persist a session log to `app_data_dir/session_logs/`. Auto-prunes
/// to `MAX_SESSION_LOGS` files (oldest by filename → oldest first).
///
/// Returns the path that was written.
pub fn save_log(app_data_dir: &Path, log: &SessionLog) -> Result<PathBuf, String> {
    let dir = app_data_dir.join(SESSION_LOGS_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("create session_logs dir: {e}"))?;

    let path = dir.join(build_filename(log));
    let json =
        serde_json::to_string_pretty(log).map_err(|e| format!("serialize session log: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("write session log: {e}"))?;

    // Prune oldest if we exceed the cap.
    prune_logs(&dir, MAX_SESSION_LOGS)?;

    Ok(path)
}

/// List all session log files in chronological order (oldest first).
pub fn list_log_paths(app_data_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let dir = app_data_dir.join(SESSION_LOGS_DIR);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| format!("read session_logs dir: {e}"))?
        .filter_map(|r| r.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .collect();
    // Filenames embed timestamp + ns suffix so lexicographic sort = chronological.
    entries.sort();
    Ok(entries)
}

/// Load a single session log by path.
pub fn load_log(path: &Path) -> Result<SessionLog, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("read session log: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse session log: {e}"))
}

/// Delete oldest session logs beyond `max_count`. Idempotent.
pub fn prune_logs(dir: &Path, max_count: usize) -> Result<(), String> {
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| format!("read session_logs dir: {e}"))?
        .filter_map(|r| r.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .collect();
    if entries.len() <= max_count {
        return Ok(());
    }
    entries.sort(); // oldest first
    let to_drop = entries.len() - max_count;
    for path in entries.iter().take(to_drop) {
        let _ = fs::remove_file(path); // best-effort
    }
    Ok(())
}

/// Export every session log into a single tarball-style JSON array file.
/// Privacy: logs are local-only; export is a deliberate user action.
/// Audio metadata only — no raw audio is captured anywhere in the
/// pipeline, so there's nothing more to redact.
pub fn export_logs(app_data_dir: &Path, dest: &Path) -> Result<usize, String> {
    let paths = list_log_paths(app_data_dir)?;
    let mut all: Vec<SessionLog> = Vec::with_capacity(paths.len());
    for p in &paths {
        if let Ok(log) = load_log(p) {
            all.push(log);
        }
    }
    let json = serde_json::to_string_pretty(&all).map_err(|e| format!("serialize export: {e}"))?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create export parent dir: {e}"))?;
    }
    fs::write(dest, json).map_err(|e| format!("write export: {e}"))?;
    Ok(all.len())
}

/// Delete every persisted log. Used by Settings "clear diagnostics".
pub fn clear_logs(app_data_dir: &Path) -> Result<(), String> {
    let dir = app_data_dir.join(SESSION_LOGS_DIR);
    if !dir.exists() {
        return Ok(());
    }
    for p in list_log_paths(app_data_dir)? {
        let _ = fs::remove_file(p);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tiny seeded PRNG — xorshift64. The plan REQUIRES every synthetic
// helper to take an explicit seed; we keep it dependency-free to avoid
// dragging in `rand`.
// ---------------------------------------------------------------------------

/// Xorshift64. Stateless wrapper — callers thread the state themselves.
///
/// Test-only by design: the D1 synthetic-fixture helpers below need a
/// dependency-free seeded PRNG, but production code never touches it.
/// `#[allow(dead_code)]` keeps the lib-target build warning-clean
/// without losing visibility from the cross-module `#[cfg(test)]`
/// suites in `timing.rs`.
#[allow(dead_code)]
pub struct Xorshift64(u64);

#[allow(dead_code)]
impl Xorshift64 {
    pub fn new(seed: u64) -> Self {
        // Zero is a degenerate state for xorshift; promote to 1.
        Self(if seed == 0 { 0x9E3779B97F4A7C15 } else { seed })
    }
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    /// Uniform `f32` in `[0.0, 1.0)`.
    pub fn next_f32(&mut self) -> f32 {
        // Top 24 bits → 0..2^24, divide by 2^24.
        ((self.next_u64() >> 40) as f32) / ((1u32 << 24) as f32)
    }
    /// Box–Muller standard-normal sample (one call returns one sample,
    /// pair partner is discarded — D1 doesn't need cache).
    pub fn next_gauss(&mut self) -> f32 {
        let mut u1: f32;
        loop {
            u1 = self.next_f32();
            if u1 > 1e-9 {
                break;
            }
        }
        let u2 = self.next_f32();
        let r = (-2.0_f32 * u1.ln()).sqrt();
        let theta = 2.0 * std::f32::consts::PI * u2;
        r * theta.cos()
    }
}

// ---------------------------------------------------------------------------
// Layer 1 — post-match synthetic helpers (cheap, fast, scoring-formula
// iteration). Operates on `BeatFeedback` and reuses the existing
// `SessionAccumulator::report()` path so changes to the scoring formula
// flow through automatically.
// ---------------------------------------------------------------------------

/// Score a vec of feedbacks → SessionReport. Thin wrapper over the
/// existing `SessionAccumulator` so plan-level test code can compute a
/// report without standing up a full evaluation session.
pub fn score_feedbacks(feedbacks: &[BeatFeedback]) -> SessionReport {
    let mut acc = crate::session::SessionAccumulator::new();
    for fb in feedbacks {
        acc.push(fb.clone());
    }
    acc.report()
}

/// Score feedbacks together with pre-computed practice segments → SessionReport.
/// This is the production path used by `build_log_from_session`: segments carry
/// IC / GA / OE component scores so the persisted JSON `report` field includes
/// `onsetEfficiency`, `intervalConsistency`, and `gridAlignment`.  Without
/// segments the accumulator falls back to the legacy formula and those fields
/// stay `None`, causing a KeyError in the SCORE_WIRE_1 JS check.
pub fn score_feedbacks_with_segments(
    feedbacks: &[BeatFeedback],
    segments: &[PracticeSegment],
) -> SessionReport {
    let mut acc = crate::session::SessionAccumulator::new();
    for fb in feedbacks {
        acc.push(fb.clone());
    }
    for seg in segments {
        acc.push_segment(seg.clone());
    }
    acc.report()
}

/// Generate `count` perfectly on-time beats (deviation ≈ 0).
/// Determinism: no jitter, no randomness — pure baseline.
/// Lives outside `#[cfg(test)]` so cross-module test code in
/// `timing.rs` can pull it in via `use crate::session_log::...`;
/// `#[allow(dead_code)]` keeps the lib build clean.
#[allow(dead_code)]
pub fn generate_perfect_beats(count: u32, _bpm: u16) -> Vec<BeatFeedback> {
    (0..count)
        .map(|i| BeatFeedback {
            beat_index: i,
            deviation_ms: 0.0,
            interval_error_ms: 0.0,
            classification: "perfect".to_string(),
            amplitude: 0.5,
            calibration_offset_ms: 0.0,
            calibration_confidence: 1.0,
            grid_correlation: 1.0,
        })
        .collect()
}

/// Generate `count` random feedbacks scattered uniformly across the
/// classification bands. `onset_density` ∈ [0,1] is the probability
/// that a given beat is hit at all (rest = miss). Seeded.
/// Same cross-module test-only constraint as `generate_perfect_beats`.
#[allow(dead_code)]
pub fn generate_random_beats(
    count: u32,
    _bpm: u16,
    onset_density: f32,
    seed: u64,
) -> Vec<BeatFeedback> {
    let mut rng = Xorshift64::new(seed);
    (0..count)
        .map(|i| {
            let hit = rng.next_f32() < onset_density;
            if !hit {
                return BeatFeedback {
                    beat_index: i,
                    deviation_ms: 0.0,
                    interval_error_ms: 0.0,
                    classification: "miss".to_string(),
                    amplitude: 0.0,
                    calibration_offset_ms: 0.0,
                    calibration_confidence: 1.0,
                    grid_correlation: 0.5,
                };
            }
            // Uniform deviation in ±60ms — exercises all classes.
            let dev = (rng.next_f32() - 0.5) * 120.0;
            let abs = dev.abs();
            let class = if abs < 10.0 {
                "perfect"
            } else if abs < 25.0 {
                "good"
            } else if abs < 50.0 {
                "ok"
            } else {
                "miss"
            };
            BeatFeedback {
                beat_index: i,
                deviation_ms: dev as f64,
                interval_error_ms: (rng.next_f32() * 20.0) as f64,
                classification: class.to_string(),
                amplitude: 0.3 + rng.next_f32() * 0.6,
                calibration_offset_ms: 0.0,
                calibration_confidence: 1.0,
                grid_correlation: (0.5 + rng.next_f32() * 0.5) as f64,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Layer 2 — raw-onset synthetic helpers (exercises matching pipeline).
//
// The matcher below is intentionally simple in D1 — closest-onset to
// beat, single classification window. D2/D3 will replace it with the
// adaptive, confidence-aware matcher. Until then this version gives
// future-phase code something stable to run against.
// ---------------------------------------------------------------------------

/// Default per-class matching thresholds (ms). Match the live classifier
/// in `timing.rs` so Layer-1 and Layer-2 helpers produce comparable
/// distributions on the same input.
///
/// `#[allow(dead_code)]` on each constant — these are consumed by the
/// `match_and_score` test apparatus below (and by future Phase 3d
/// 18-scenario validation tests) but not by the live runtime, so a
/// lib-only build flags them.
#[allow(dead_code)]
pub const PERFECT_MS: f64 = 10.0;
#[allow(dead_code)]
pub const GOOD_MS: f64 = 25.0;
#[allow(dead_code)]
pub const OK_MS: f64 = 50.0;
/// Hard cutoff — onsets beyond this are not matched to a beat.
#[allow(dead_code)]
pub const MISS_WINDOW_MS: f64 = 80.0;

/// Build `(onsets, expected_beats)` for `beats` perfect hits at `bpm`.
/// Each onset lands exactly on its beat. Centroid set to the profile's
/// onset-spectrum mid so D2 tuning has a realistic baseline.
#[allow(dead_code)]
pub fn generate_raw_onsets_perfect(
    beats: u32,
    bpm: u16,
    profile: &InstrumentProfile,
) -> (Vec<DetectedOnset>, Vec<ExpectedBeat>) {
    let beat_ms = 60_000.0 / bpm as f64;
    let centroid = profile_centroid_hint(profile);

    let expected: Vec<ExpectedBeat> = (0..beats)
        .map(|i| ExpectedBeat {
            index: i,
            timestamp_ms: (i as f64 * beat_ms).round() as u64,
            is_accent: i % 4 == 0,
            expected_bpm: bpm,
        })
        .collect();

    let onsets: Vec<DetectedOnset> = expected
        .iter()
        .map(|b| DetectedOnset {
            timestamp_ms: b.timestamp_ms,
            amplitude: 0.6,
            centroid,
            confidence: 1.0,
        })
        .collect();

    (onsets, expected)
}

/// Same as `generate_raw_onsets_perfect` but onsets are perturbed by a
/// Gaussian with std `jitter_std_ms`. Seeded for determinism.
#[allow(dead_code)]
pub fn generate_raw_onsets_jittered(
    beats: u32,
    bpm: u16,
    jitter_std_ms: f32,
    seed: u64,
    profile: &InstrumentProfile,
) -> (Vec<DetectedOnset>, Vec<ExpectedBeat>) {
    let (mut onsets, expected) = generate_raw_onsets_perfect(beats, bpm, profile);
    let mut rng = Xorshift64::new(seed);
    for o in onsets.iter_mut() {
        let jitter = rng.next_gauss() * jitter_std_ms;
        // Saturating-add to keep u64. Jitter rarely exceeds beat_ms so
        // the clamp is just defensive.
        let new_ts = (o.timestamp_ms as i64 + jitter.round() as i64).max(0) as u64;
        o.timestamp_ms = new_ts;
    }
    (onsets, expected)
}

/// Spurious-onset stream — Poisson-like uniformly distributed across
/// `duration_ms`. Used to test the matcher's rejection of off-beat
/// noise. Centroid varies randomly. Seeded.
#[allow(dead_code)]
pub fn generate_raw_onsets_random(
    duration_ms: u64,
    onset_rate_per_sec: f32,
    seed: u64,
) -> Vec<DetectedOnset> {
    let mut rng = Xorshift64::new(seed);
    let expected_count = ((duration_ms as f32 / 1000.0) * onset_rate_per_sec).round() as u32;
    let mut onsets: Vec<DetectedOnset> = (0..expected_count)
        .map(|_| DetectedOnset {
            timestamp_ms: (rng.next_f32() * duration_ms as f32) as u64,
            amplitude: 0.2 + rng.next_f32() * 0.6,
            centroid: 100.0 + rng.next_f32() * 4000.0,
            confidence: 0.4 + rng.next_f32() * 0.6,
        })
        .collect();
    onsets.sort_by_key(|o| o.timestamp_ms);
    onsets
}

/// Run the D1 reference matcher over raw onsets + expected beats and
/// produce both `MatchDecision`s (for the diagnostic log) and a
/// `SessionReport` (for scoring-formula iteration).
///
/// **NOTE:** This matcher is intentionally simple — closest onset per
/// beat within `MISS_WINDOW_MS`, one onset per beat (no chord cluster
/// collapsing yet). D2 replaces it with the adaptive matcher. D1's job
/// is to provide a stable baseline so the rest of the test apparatus
/// can be built.
#[allow(dead_code)]
pub fn match_and_score(
    onsets: &[DetectedOnset],
    expected: &[ExpectedBeat],
    _profile: &InstrumentProfile,
) -> (Vec<MatchDecision>, Vec<u32>, SessionReport) {
    let mut matched_onset_ids: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let mut decisions: Vec<MatchDecision> = Vec::with_capacity(expected.len());
    let mut feedbacks: Vec<BeatFeedback> = Vec::with_capacity(expected.len());

    for beat in expected {
        // Find closest onset within ±MISS_WINDOW_MS that isn't already
        // claimed (the simple matcher is greedy, beat-order — fine for
        // D1, plan acknowledges D3 changes this).
        let mut best: Option<(usize, i64)> = None;
        for (i, o) in onsets.iter().enumerate() {
            if matched_onset_ids.contains(&(i as u32)) {
                continue;
            }
            let dev = o.timestamp_ms as i64 - beat.timestamp_ms as i64;
            if (dev.abs() as f64) > MISS_WINDOW_MS {
                continue;
            }
            match best {
                None => best = Some((i, dev)),
                Some((_, prev)) if dev.abs() < prev.abs() => best = Some((i, dev)),
                _ => {}
            }
        }

        let (classification, deviation_ms, onset_indices, amplitude, reason) = match best {
            Some((idx, dev)) => {
                matched_onset_ids.insert(idx as u32);
                let abs = (dev as f64).abs();
                let class = if abs < PERFECT_MS {
                    Classification::Perfect
                } else if abs < GOOD_MS {
                    Classification::Good
                } else if abs < OK_MS {
                    Classification::Ok
                } else {
                    // Inside window but outside Ok — counts as miss with
                    // the onset still acknowledged for diagnostic value.
                    Classification::Miss
                };
                let reason = if class == Classification::Miss {
                    MatchReason::OutsideWindow
                } else {
                    MatchReason::InsideWindow
                };
                (
                    class,
                    dev as i32,
                    vec![idx as u32],
                    onsets[idx].amplitude,
                    reason,
                )
            }
            None => (
                Classification::Miss,
                0,
                Vec::new(),
                0.0_f32,
                MatchReason::OutsideWindow,
            ),
        };

        decisions.push(MatchDecision {
            beat_index: beat.index,
            onset_indices: onset_indices.clone(),
            deviation_ms,
            classification,
            reason,
        });

        feedbacks.push(BeatFeedback {
            beat_index: beat.index,
            deviation_ms: deviation_ms as f64,
            interval_error_ms: 0.0,
            classification: classification.as_str().to_string(),
            amplitude,
            calibration_offset_ms: 0.0,
            calibration_confidence: 1.0,
            grid_correlation: 1.0,
        });
    }

    let spurious: Vec<u32> = (0..onsets.len() as u32)
        .filter(|i| !matched_onset_ids.contains(i))
        .collect();

    let report = score_feedbacks(&feedbacks);
    (decisions, spurious, report)
}

/// Wrapper that builds the full `SessionLog` from raw onsets + beats.
/// Convenience for D3 unit tests so they can assert on log shape too.
#[allow(dead_code)]
pub fn build_log_from_raw(
    bpm: u16,
    time_signature: u8,
    subdivision: u8,
    timestamp: u64,
    duration_ms: u64,
    instrument: Instrument,
    onsets: Vec<DetectedOnset>,
    expected: Vec<ExpectedBeat>,
    profile: &InstrumentProfile,
) -> SessionLog {
    let (matches, spurious, report) = match_and_score(&onsets, &expected, profile);
    SessionLog {
        bpm,
        time_signature,
        // Test/convenience builder — no grouping information available,
        // so record the bar as one undivided group.
        beat_groups: vec![time_signature],
        subdivision,
        started_at: secs_to_iso8601(timestamp),
        timestamp,
        duration_ms,
        instrument,
        instrument_profile_version: INSTRUMENT_PROFILE_VERSION,
        expected_beats: expected,
        detected_onsets: onsets,
        matches,
        spurious_onsets: spurious,
        activity_transitions: Vec::new(),
        segments: Vec::new(),
        audio_levels: Vec::new(),
        report,
    }
}

/// Per-session raw telemetry buffer. Populated by the live timing
/// analyzer (`TimingAnalyzer::analysis_loop`) so the D1 diagnostic log
/// can carry the full streams of detected onsets, expected beats,
/// match decisions, and spurious onsets — not just the aggregated
/// report.
///
/// History: D1 originally shipped these as empty `Vec`s (see the prior
/// comment on `build_log_from_session`) because no upstream stage
/// buffered them across a whole session. That left us unable to
/// diagnose "user played 90 16ths but only 60 onsets were detected"
/// scenarios — we had no record of what the detector saw vs. what the
/// matcher matched. Phase 2 (this struct) fixes that: the analyzer
/// pushes events into a shared buffer as they happen, and the buffer
/// is drained at `stop_evaluation` time.
///
/// All timestamps are wall-clock ms (Unix epoch) so the JSON is
/// human-readable without a clock-offset conversion. `expected_beats`
/// and `detected_onsets` are dense (every observation), `matches` is
/// one entry per processed beat, and `spurious_onset_indices` lists
/// indices into `detected_onsets` of onsets that never matched a beat
/// (matches the `SessionLog::spurious_onsets` schema).
///
/// Buffer cap (`TELEMETRY_BUFFER_CAP`) defends against pathological
/// long-running sessions: each stream is capped at 50,000 events
/// (~4 hours of dense 16th-note playing at 200 BPM). On cap we stop
/// pushing for that stream — we don't rotate, because rotation would
/// invalidate the indices in `matches` and `spurious_onset_indices`.
#[derive(Debug, Default, Clone)]
pub struct SessionTelemetry {
    pub expected_beats: Vec<ExpectedBeat>,
    pub detected_onsets: Vec<DetectedOnset>,
    pub matches: Vec<MatchDecision>,
    pub spurious_onset_indices: Vec<u32>,
    /// Per-second input level snapshots from the cpal callback. Drained
    /// at session stop. Capped at `TELEMETRY_BUFFER_CAP` like the other
    /// streams. A 50k cap = ~14 hours of monitoring, which is well past
    /// any realistic session.
    pub audio_levels: Vec<AudioLevelSnapshot>,
    /// D4c — activity state transitions (Idle ↔ Active ↔ Resting)
    /// emitted by the timing analyzer on every state change. Used to
    /// populate `SessionLog.activity_transitions` at session stop.
    pub activity_transitions: Vec<ActivityTransition>,
}

/// Hard cap on each telemetry stream. Beyond this we stop pushing
/// rather than evict (eviction would invalidate `matches` /
/// `spurious_onset_indices` cross-references). 50k events ≈ 4h of
/// dense playing — well beyond any realistic single session.
pub const TELEMETRY_BUFFER_CAP: usize = 50_000;

impl SessionTelemetry {
    /// Append a detected onset. Returns its stable index for use in
    /// downstream `MatchDecision.onset_indices` / `spurious_onset_indices`.
    /// Returns `None` when the buffer is full (caller should still
    /// process the onset musically; we just stop telemetry-logging it).
    pub fn push_onset(&mut self, o: DetectedOnset) -> Option<u32> {
        if self.detected_onsets.len() >= TELEMETRY_BUFFER_CAP {
            return None;
        }
        let idx = self.detected_onsets.len() as u32;
        self.detected_onsets.push(o);
        Some(idx)
    }

    /// Append an expected beat tick.
    pub fn push_beat(&mut self, b: ExpectedBeat) {
        if self.expected_beats.len() >= TELEMETRY_BUFFER_CAP {
            return;
        }
        self.expected_beats.push(b);
    }

    /// Append a match decision (one per processed beat).
    pub fn push_match(&mut self, m: MatchDecision) {
        if self.matches.len() >= TELEMETRY_BUFFER_CAP {
            return;
        }
        self.matches.push(m);
    }

    /// Mark an onset index as spurious (no beat matched it within the
    /// pending-cutoff window).
    pub fn push_spurious(&mut self, onset_idx: u32) {
        if self.spurious_onset_indices.len() >= TELEMETRY_BUFFER_CAP {
            return;
        }
        self.spurious_onset_indices.push(onset_idx);
    }

    /// Append a per-second input level snapshot.
    pub fn push_audio_level(&mut self, snap: AudioLevelSnapshot) {
        if self.audio_levels.len() >= TELEMETRY_BUFFER_CAP {
            return;
        }
        self.audio_levels.push(snap);
    }

    /// Append an activity state transition (D4c). Capped at
    /// `TELEMETRY_BUFFER_CAP` like the other streams.
    pub fn push_activity_transition(&mut self, t: ActivityTransition) {
        if self.activity_transitions.len() >= TELEMETRY_BUFFER_CAP {
            return;
        }
        self.activity_transitions.push(t);
    }
}

/// POSTMATCH_1 — Post-session best-candidate matching.
///
/// For each expected beat, find the closest unassigned detected onset
/// within the tempo-aware match window and assign it as the winner.
/// This replaces the real-time first-come-first-served greedy matcher
/// for scoring purposes, eliminating ghost-cascade misses.
///
/// Algorithm:
/// - Sort order: expected_beats and onsets are assumed time-sorted
///   (they are produced in order by the timing analyzer).
/// - Window per beat: derived from the interval to the next expected
///   beat so drill-ramp tempos are handled correctly.
/// - Greedy: once an onset is assigned to a beat, it cannot be reused.
/// - Miss: beat slots with no candidate onset within the window get
///   Classification::Miss / MatchReason::OutsideWindow.
pub fn recompute_matches(
    onsets: &[DetectedOnset],
    expected_beats: &[ExpectedBeat],
) -> Vec<MatchDecision> {
    if expected_beats.is_empty() {
        return Vec::new();
    }

    let mut assigned = vec![false; onsets.len()];
    let mut results = Vec::with_capacity(expected_beats.len());

    // Pre-compute per-beat interval from consecutive beat timestamps.
    // For the last beat, reuse the previous interval.
    let n = expected_beats.len();
    let intervals_ms: Vec<f64> = (0..n)
        .map(|i| {
            if i + 1 < n {
                expected_beats[i + 1].timestamp_ms as f64 - expected_beats[i].timestamp_ms as f64
            } else if n >= 2 {
                expected_beats[n - 1].timestamp_ms as f64
                    - expected_beats[n - 2].timestamp_ms as f64
            } else {
                // Single beat — fall back to quarter-note at expected BPM.
                60_000.0 / expected_beats[0].expected_bpm.max(1) as f64
            }
        })
        .collect();

    for (beat_idx, beat) in expected_beats.iter().enumerate() {
        let beat_ms = beat.timestamp_ms as f64;
        let window_ms = tempo_aware_window_ms(intervals_ms[beat_idx]);
        let thresholds = window_thresholds(window_ms);
        let window_lo = beat_ms - window_ms;
        let window_hi = beat_ms + window_ms;

        // Find unassigned onset with minimum |deviation| within window.
        let mut best_onset_idx: Option<usize> = None;
        let mut best_dist = f64::INFINITY;

        for (oi, onset) in onsets.iter().enumerate() {
            if assigned[oi] {
                continue;
            }
            let t = onset.timestamp_ms as f64;
            if t < window_lo || t > window_hi {
                continue;
            }
            let dist = (t - beat_ms).abs();
            if dist < best_dist {
                best_dist = dist;
                best_onset_idx = Some(oi);
            }
        }

        let (onset_indices, deviation_ms, classification, reason) = if let Some(oi) = best_onset_idx
        {
            assigned[oi] = true;
            let dev = onsets[oi].timestamp_ms as i64 - beat.timestamp_ms as i64;
            let abs_dev = dev.unsigned_abs() as f64;
            let class = if abs_dev <= thresholds.perfect {
                Classification::Perfect
            } else if abs_dev <= thresholds.good {
                Classification::Good
            } else {
                Classification::Ok // abs_dev ≤ window_ms (ok = full window)
            };
            (
                vec![oi as u32],
                dev as i32,
                class,
                MatchReason::InsideWindow,
            )
        } else {
            (vec![], 0, Classification::Miss, MatchReason::OutsideWindow)
        };

        results.push(MatchDecision {
            beat_index: beat.index,
            onset_indices,
            deviation_ms,
            classification,
            reason,
        });
    }

    results
}

/// Convert `Vec<MatchDecision>` → `Vec<BeatFeedback>` for use with
/// `score_feedbacks` / `SessionAccumulator::report()`.
///
/// `interval_error_ms` is computed from consecutive matched onsets so
/// tempo stability metrics remain meaningful. Calibration and
/// grid-correlation fields are set to neutral defaults — they are not
/// persisted in the session log and are not needed for post-session
/// scoring.
pub fn matches_to_feedbacks(
    matches: &[MatchDecision],
    onsets: &[DetectedOnset],
) -> Vec<BeatFeedback> {
    let mut feedbacks = Vec::with_capacity(matches.len());
    let mut prev_matched_onset_ms: Option<u64> = None;
    let mut prev_beat_ms: Option<u64> = None;

    // Build a quick index: beat_index → expected beat timestamp_ms.
    // We don't have ExpectedBeat here, but we can derive the expected
    // interval from consecutive beat deviations (beat timestamps come
    // from MatchDecision.beat_index ordering only). Instead, compute
    // interval_error from consecutive *actual* onset timestamps vs.
    // consecutive *expected* beat timestamps — approximated as:
    //   interval_error = |actual_interval - expected_interval|
    // where expected_interval = difference between consecutive beat_index
    // times (derived from beat ordering at ~constant BPM).
    //
    // For simplicity, store the expected onset timestamp as
    // (onset.timestamp_ms - deviation_ms) and derive intervals from there.
    for m in matches {
        let amplitude = m
            .onset_indices
            .first()
            .and_then(|&idx| onsets.get(idx as usize))
            .map(|o| o.amplitude)
            .unwrap_or(0.0);

        // Expected beat timestamp (ms) = matched_onset_ms - deviation_ms
        let matched_onset_ms = m
            .onset_indices
            .first()
            .and_then(|&idx| onsets.get(idx as usize))
            .map(|o| o.timestamp_ms);

        let expected_beat_ms =
            matched_onset_ms.map(|ms| (ms as i64 - m.deviation_ms as i64).max(0) as u64);

        // interval_error: |actual inter-onset gap - expected inter-beat gap|
        let interval_error_ms = match (
            matched_onset_ms,
            prev_matched_onset_ms,
            expected_beat_ms,
            prev_beat_ms,
        ) {
            (Some(cur_onset), Some(prev_onset), Some(cur_beat), Some(prev_beat)) => {
                let actual_interval = cur_onset as i64 - prev_onset as i64;
                let expected_interval = cur_beat as i64 - prev_beat as i64;
                (actual_interval - expected_interval).unsigned_abs() as f64
            }
            _ => 0.0,
        };

        if matched_onset_ms.is_some() {
            prev_matched_onset_ms = matched_onset_ms;
        }
        if expected_beat_ms.is_some() {
            prev_beat_ms = expected_beat_ms;
        }

        feedbacks.push(BeatFeedback {
            beat_index: m.beat_index,
            deviation_ms: m.deviation_ms as f64,
            interval_error_ms,
            classification: m.classification.as_str().to_string(),
            amplitude,
            calibration_offset_ms: 0.0,
            calibration_confidence: 1.0,
            grid_correlation: 1.0,
        });
    }

    feedbacks
}

/// Build a `SessionLog` from accumulator state (final report + any
/// Signal-B segments) plus the AppState snapshot taken at stop time.
///
/// `telemetry` carries the per-session raw streams populated by the
/// live timing analyzer (see `SessionTelemetry`). Pass
/// `SessionTelemetry::default()` for code paths that don't run the
/// live analyzer (synthetic tests, fixture sessions).
///
/// When telemetry contains raw onset and beat streams, POSTMATCH_1
/// post-session best-candidate matching is applied: `recompute_matches`
/// replaces the real-time match decisions so `report.hitsCount` and
/// related fields reflect best-candidate assignment rather than the
/// first-come-first-served streaming matches.
pub fn build_log_from_session(
    bpm: u16,
    time_signature: u8,
    beat_groups: Vec<u8>,
    subdivision: u8,
    timestamp_secs: u64,
    duration_ms: u64,
    instrument: Instrument,
    feedbacks: &[BeatFeedback],
    segments: Vec<PracticeSegment>,
    telemetry: SessionTelemetry,
) -> SessionLog {
    // Unpack telemetry before any move/borrow issues.
    let SessionTelemetry {
        expected_beats,
        detected_onsets,
        matches: rt_matches,
        spurious_onset_indices,
        audio_levels,
        activity_transitions,
    } = telemetry;

    // POSTMATCH_1: run post-session best-candidate matching when raw
    // streams are available. Fall back to real-time feedbacks when
    // telemetry is absent (synthetic tests, fixture sessions).
    // COMP_WIRE_FIX: pass `segments` so the report carries IC/GA/OE
    // component scores (prevents legacy-formula fallback in persisted JSON).
    let (final_matches, mut report) = if !expected_beats.is_empty() && !detected_onsets.is_empty() {
        let m = recompute_matches(&detected_onsets, &expected_beats);
        let fbs = matches_to_feedbacks(&m, &detected_onsets);
        (m, score_feedbacks_with_segments(&fbs, &segments))
    } else {
        (rt_matches, score_feedbacks_with_segments(feedbacks, &segments))
    };

    // Populate accent counts and subdivision in the saved log report so
    // the history view can compute Default-mode accuracy correctly.
    report.subdivision = subdivision;
    if !expected_beats.is_empty() {
        let accent_beat_indices: std::collections::HashSet<u32> = expected_beats
            .iter()
            .filter(|b| b.is_accent)
            .map(|b| b.index)
            .collect();
        for m in &final_matches {
            if accent_beat_indices.contains(&m.beat_index)
                && m.reason != MatchReason::NoActivity
            {
                report.accent_beats_count += 1;
                if m.classification != Classification::Miss {
                    report.accent_hits_count += 1;
                }
            }
        }
    }

    SessionLog {
        bpm,
        time_signature,
        beat_groups,
        subdivision,
        started_at: secs_to_iso8601(timestamp_secs),
        timestamp: timestamp_secs,
        duration_ms,
        instrument,
        instrument_profile_version: INSTRUMENT_PROFILE_VERSION,
        expected_beats,
        detected_onsets,
        matches: final_matches,
        spurious_onsets: spurious_onset_indices,
        activity_transitions,
        segments,
        audio_levels,
        report,
    }
}

/// Best-guess centroid for a given instrument profile, used as a
/// synthetic-onset default. Picks the band index with the highest
/// weight; D2 may refine this once we have empirical centroid
/// distributions.
#[allow(dead_code)]
fn profile_centroid_hint(profile: &InstrumentProfile) -> f32 {
    let (band_idx, _) =
        profile
            .spectral_weights
            .iter()
            .enumerate()
            .fold(
                (0usize, 0.0_f32),
                |(bi, bw), (i, &w)| {
                    if w > bw {
                        (i, w)
                    } else {
                        (bi, bw)
                    }
                },
            );
    // 16 bands across the audible spectrum (assume 22 kHz Nyquist).
    let band_hz = 22_000.0 / 16.0;
    (band_idx as f32 + 0.5) * band_hz
}

/// Convert a Unix epoch seconds value to an RFC 3339 / ISO 8601 UTC string,
/// e.g. `1779480661 → "2026-05-22T13:11:01Z"`.
///
/// Implemented without external crates using standard Gregorian arithmetic.
/// Correct for all dates from 1970-01-01 through at least 2200-01-01.
pub fn secs_to_iso8601(secs: u64) -> String {
    let time_of_day = secs % 86400;
    let h = time_of_day / 3600;
    let m = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;

    // Days since Unix epoch (1970-01-01).
    let mut days = (secs / 86400) as u32;

    // Walk years forward from 1970.
    let mut year = 1970u32;
    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }

    // Walk months forward within the year.
    let dim = days_in_month(year);
    let mut month = 1u32;
    for &d in &dim {
        if days < d {
            break;
        }
        days -= d;
        month += 1;
    }
    let day = days + 1; // days is 0-based within the month.

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, h, m, s
    )
}

fn is_leap_year(y: u32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}

fn days_in_month(year: u32) -> [u32; 12] {
    [
        31,
        if is_leap_year(year) { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp_dir(name: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "yames-session-log-test-{}-{}",
            name,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn secs_to_iso8601_known_values() {
        // Unix epoch itself → 1970-01-01T00:00:00Z
        assert_eq!(secs_to_iso8601(0), "1970-01-01T00:00:00Z");
        // 2000-01-01T00:00:00Z = 946684800
        assert_eq!(secs_to_iso8601(946_684_800), "2000-01-01T00:00:00Z");
        // The session log timestamp from the investigated session
        // (1779480661 s = 2026-05-22T20:11:01Z UTC, verified externally).
        assert_eq!(secs_to_iso8601(1_779_480_661), "2026-05-22T20:11:01Z");
        // Leap day: 2000-02-29T12:00:00Z = 951825600
        assert_eq!(secs_to_iso8601(951_825_600), "2000-02-29T12:00:00Z");
    }

    #[test]
    fn xorshift_is_deterministic_given_seed() {
        let mut a = Xorshift64::new(42);
        let mut b = Xorshift64::new(42);
        for _ in 0..1000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn xorshift_seed_zero_does_not_collapse() {
        // A naive xorshift implementation gets stuck at 0 forever if
        // seeded with 0. We promote to a non-zero constant — verify
        // that the stream evolves.
        let mut rng = Xorshift64::new(0);
        let first = rng.next_u64();
        let second = rng.next_u64();
        assert_ne!(first, 0);
        assert_ne!(first, second);
    }

    #[test]
    fn generate_perfect_beats_are_all_perfect() {
        let fbs = generate_perfect_beats(32, 120);
        assert_eq!(fbs.len(), 32);
        assert!(fbs.iter().all(|f| f.classification == "perfect"));
        assert!(fbs.iter().all(|f| f.deviation_ms == 0.0));
        let r = score_feedbacks(&fbs);
        assert_eq!(r.grade, "S");
    }

    #[test]
    fn generate_random_beats_is_seed_reproducible() {
        let a = generate_random_beats(64, 100, 0.8, 7);
        let b = generate_random_beats(64, 100, 0.8, 7);
        assert_eq!(a.len(), b.len());
        for (x, y) in a.iter().zip(b.iter()) {
            assert_eq!(x.classification, y.classification);
            assert!((x.deviation_ms - y.deviation_ms).abs() < 1e-9);
        }
    }

    #[test]
    fn raw_onsets_perfect_score_S() {
        let profile = Instrument::ElectricGuitar.profile();
        let (onsets, expected) = generate_raw_onsets_perfect(64, 120, &profile);
        let (decisions, spurious, report) = match_and_score(&onsets, &expected, &profile);
        assert_eq!(decisions.len(), 64);
        assert!(spurious.is_empty());
        assert!(
            decisions
                .iter()
                .all(|d| d.classification == Classification::Perfect),
            "expected all perfect"
        );
        assert_eq!(report.grade, "S");
    }

    #[test]
    fn raw_onsets_jittered_degrades_score_smoothly() {
        let profile = Instrument::ElectricGuitar.profile();
        let (o0, e0) = generate_raw_onsets_jittered(64, 120, 0.0, 1, &profile);
        let (o20, e20) = generate_raw_onsets_jittered(64, 120, 20.0, 1, &profile);
        let (o60, e60) = generate_raw_onsets_jittered(64, 120, 60.0, 1, &profile);

        let r0 = match_and_score(&o0, &e0, &profile).2;
        let r20 = match_and_score(&o20, &e20, &profile).2;
        let r60 = match_and_score(&o60, &e60, &profile).2;

        assert!(
            r0.score >= r20.score,
            "0ms jitter ({}) should score ≥ 20ms jitter ({})",
            r0.score,
            r20.score
        );
        assert!(
            r20.score >= r60.score,
            "20ms jitter ({}) should score ≥ 60ms jitter ({})",
            r20.score,
            r60.score
        );
    }

    #[test]
    fn raw_onsets_random_are_spurious() {
        let profile = Instrument::Other.profile();
        // No expected beats — everything is spurious by definition.
        let onsets = generate_raw_onsets_random(10_000, 5.0, 99);
        let (_, spurious, _) = match_and_score(&onsets, &[], &profile);
        assert_eq!(spurious.len(), onsets.len());
    }

    #[test]
    fn save_and_load_log_roundtrip() {
        let tmp = tmp_dir("roundtrip");
        let profile = Instrument::AcousticGuitar.profile();
        let (onsets, expected) = generate_raw_onsets_perfect(8, 120, &profile);
        let log = build_log_from_raw(
            120,
            4,
            1,
            1_700_000_000,
            4_000,
            Instrument::AcousticGuitar,
            onsets,
            expected,
            &profile,
        );

        let path = save_log(&tmp, &log).expect("save_log");
        assert!(path.exists());
        let loaded = load_log(&path).expect("load_log");
        assert_eq!(loaded.bpm, log.bpm);
        assert_eq!(loaded.instrument, log.instrument);
        assert_eq!(loaded.expected_beats.len(), log.expected_beats.len());
        assert_eq!(loaded.matches.len(), log.matches.len());
        assert_eq!(loaded.report.grade, log.report.grade);
        // Profile version is persisted for migration.
        assert_eq!(
            loaded.instrument_profile_version,
            INSTRUMENT_PROFILE_VERSION
        );
    }

    #[test]
    fn save_log_prunes_to_max() {
        let tmp = tmp_dir("prune");
        let profile = Instrument::Drums.profile();

        // Save MAX + 5 logs.
        for i in 0..(MAX_SESSION_LOGS + 5) {
            let (onsets, expected) = generate_raw_onsets_perfect(4, 100, &profile);
            let log = build_log_from_raw(
                100,
                4,
                1,
                1_700_000_000 + i as u64,
                1000,
                Instrument::Drums,
                onsets,
                expected,
                &profile,
            );
            save_log(&tmp, &log).expect("save_log");
            // Ensure unique filenames even on fast machines.
            std::thread::sleep(std::time::Duration::from_millis(2));
        }

        let paths = list_log_paths(&tmp).expect("list");
        assert_eq!(
            paths.len(),
            MAX_SESSION_LOGS,
            "expected exactly {} logs after prune, got {}",
            MAX_SESSION_LOGS,
            paths.len()
        );
    }

    #[test]
    fn export_writes_combined_json() {
        let tmp = tmp_dir("export");
        let profile = Instrument::Bass.profile();
        for i in 0..3 {
            let (onsets, expected) = generate_raw_onsets_perfect(4, 100, &profile);
            let log = build_log_from_raw(
                100,
                4,
                1,
                1_700_000_000 + i,
                1000,
                Instrument::Bass,
                onsets,
                expected,
                &profile,
            );
            save_log(&tmp, &log).expect("save_log");
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let dest = tmp.join("export.json");
        let n = export_logs(&tmp, &dest).expect("export");
        assert_eq!(n, 3);
        let raw = fs::read_to_string(&dest).expect("read export");
        let parsed: Vec<SessionLog> = serde_json::from_str(&raw).expect("parse export");
        assert_eq!(parsed.len(), 3);
    }

    #[test]
    fn classification_roundtrip_via_string() {
        for c in [
            Classification::Perfect,
            Classification::Good,
            Classification::Ok,
            Classification::Miss,
            Classification::Skipped,
        ] {
            assert_eq!(Classification::from_str(c.as_str()), c);
        }
    }

    #[test]
    fn match_decision_assigns_correct_class() {
        let profile = Instrument::ElectricGuitar.profile();
        let expected = vec![ExpectedBeat {
            index: 0,
            timestamp_ms: 1000,
            is_accent: true,
            expected_bpm: 120,
        }];
        // Onset 5ms early → Perfect.
        let onsets = vec![DetectedOnset {
            timestamp_ms: 995,
            amplitude: 0.5,
            centroid: 500.0,
            confidence: 1.0,
        }];
        let (decisions, _, _) = match_and_score(&onsets, &expected, &profile);
        assert_eq!(decisions[0].classification, Classification::Perfect);
        assert_eq!(decisions[0].deviation_ms, -5);
    }

    /// `build_log_from_session` is the production code path used at
    /// `stop_evaluation`. Verify it produces a roundtrippable, schema-
    /// compatible log even when raw onsets/expected beats are not
    /// captured (the synthetic-test path passes a default empty
    /// `SessionTelemetry`; the live analyzer populates it for real
    /// sessions).
    #[test]
    fn build_log_from_session_minimal_roundtrips() {
        let feedbacks = generate_perfect_beats(8, 120);
        let segments = vec![PracticeSegment {
            start_ms: 1_000,
            end_ms: 31_000,
            start_bpm: 120,
            end_bpm: 120,
            score: 92.0,
            component_scores: ComponentScores {
                interval_consistency: 0.95,
                grid_alignment: 0.92,
                hit_completeness: 0.90,
                onset_efficiency: 0.88,
                downbeat_amp_avg: None,
                upbeat_amp_avg: None,
                subdivision_amp_avg: None,
                amp_std_dev: None,
            },
            end_reason: SegmentEndReason::ActivityGap,
            // Path B — fixture data, divisor inference not exercised
            // by this test. Sentinel 0 / 0.0 matches the default that
            // historic logs deserialize with.
            inferred_divisor: 0,
            inferred_divisor_confidence: 0.0,
            interval_errors: Vec::new(),
        }];
        let log = build_log_from_session(
            120,
            4,
            vec![4],
            1,
            1_700_000_000,
            45_000,
            Instrument::ElectricGuitar,
            &feedbacks,
            segments.clone(),
            SessionTelemetry::default(),
        );

        // Headline fields propagate.
        assert_eq!(log.bpm, 120);
        assert_eq!(log.time_signature, 4);
        assert_eq!(log.subdivision, 1);
        assert_eq!(log.timestamp, 1_700_000_000);
        assert_eq!(log.duration_ms, 45_000);
        assert_eq!(log.instrument, Instrument::ElectricGuitar);
        assert_eq!(log.instrument_profile_version, INSTRUMENT_PROFILE_VERSION);

        // COMP_WIRE_FIX: report now uses duration-weighted segment score (92.0)
        // instead of the legacy formula.  92 → grade "A" (85–94 band).
        // The hits_count is still derived from beat feedbacks.
        assert_eq!(log.report.hits_count, 8);
        assert_eq!(log.report.grade, "A");
        // Component scores should now be present (not None) since segments are wired in.
        assert!(log.report.onset_efficiency.is_some());
        assert!(log.report.interval_consistency.is_some());
        assert!(log.report.grid_alignment.is_some());

        // Segments roundtripped without mutation.
        assert_eq!(log.segments.len(), 1);
        assert_eq!(log.segments[0].score, 92.0);
        assert_eq!(log.segments[0].end_reason, SegmentEndReason::ActivityGap);

        // Raw-data fields stay empty (D1 ships persistence path only).
        assert!(log.expected_beats.is_empty());
        assert!(log.detected_onsets.is_empty());
        assert!(log.matches.is_empty());
        assert!(log.spurious_onsets.is_empty());
        assert!(log.activity_transitions.is_empty());

        // JSON roundtrip — schema must stay stable.
        let json = serde_json::to_string(&log).expect("serialize");
        let parsed: SessionLog = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.report.score, log.report.score);
        assert_eq!(parsed.segments.len(), 1);
    }

    /// Save-roundtrip integration: build a log via the production helper,
    /// persist it via `save_log`, list it back, and verify the file lands
    /// on disk with the expected report grade.
    #[test]
    fn build_log_from_session_persists_to_disk() {
        let dir = tmp_dir("build_session_persist");
        let feedbacks = generate_perfect_beats(16, 100);
        let log = build_log_from_session(
            100,
            4,
            vec![4],
            1,
            1_700_000_000,
            60_000,
            Instrument::Drums,
            &feedbacks,
            Vec::new(),
            SessionTelemetry::default(),
        );
        let path = save_log(&dir, &log).expect("save log");
        assert!(path.exists(), "log file should exist on disk");

        let listed = list_log_paths(&dir).expect("list logs");
        assert_eq!(listed.len(), 1);

        let loaded = load_log(&listed[0]).expect("load log");
        assert_eq!(loaded.bpm, 100);
        assert_eq!(loaded.report.grade, "S");
        assert_eq!(loaded.instrument, Instrument::Drums);
    }

    /// Empty-feedback edge case: the log builder must still produce a
    /// valid, serializable log when no beats were captured (early stop).
    #[test]
    fn build_log_from_session_handles_empty_feedbacks() {
        let log = build_log_from_session(
            120,
            4,
            vec![4],
            1,
            1_700_000_000,
            0,
            Instrument::Piano,
            &[],
            Vec::new(),
            SessionTelemetry::default(),
        );
        // Empty report grade should be F (consistent with SessionAccumulator).
        assert_eq!(log.report.grade, "F");
        assert_eq!(log.report.total_beats, 0);
        // Still JSON-serializable.
        let json = serde_json::to_string(&log).expect("serialize empty log");
        assert!(json.contains("\"grade\":\"F\""));
    }
}
