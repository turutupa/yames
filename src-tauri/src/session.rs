use std::sync::{Arc, Mutex};

use crate::models::PlayMode;
use crate::session_log::PracticeSegment;
use crate::timing::BeatFeedback;

/// Coach operating mode. Controls scoring leniency (k-factor, weights).
///
/// `Default` widens the IC Gaussian tolerance and shifts guitar weights
/// toward grid_alignment (more forgiving for learners).
/// `Pro` uses the tighter original constants calibrated against
/// competent players in the 2026-05-22 replay session.
#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize, serde::Serialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CoachMode {
    #[default]
    Default,
    Pro,
}

fn default_subdivision() -> u8 {
    1
}

/// Accumulated session statistics from beat feedback events.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionReport {
    /// Total beats in session
    #[serde(rename = "totalBeats")]
    pub total_beats: u32,
    /// Number of beats with a matched onset
    #[serde(rename = "hitsCount")]
    pub hits_count: u32,
    /// Number of missed beats
    #[serde(rename = "missCount")]
    pub miss_count: u32,
    /// Number of skipped beats (warmup, idle, resting — not scored)
    #[serde(rename = "skippedBeats")]
    pub skipped_beats: u32,
    /// Counts per classification
    #[serde(rename = "perfectCount")]
    pub perfect_count: u32,
    #[serde(rename = "goodCount")]
    pub good_count: u32,
    #[serde(rename = "okCount")]
    pub ok_count: u32,
    /// Mean deviation in ms (signed — negative = early tendency)
    #[serde(rename = "meanDeviationMs")]
    pub mean_deviation_ms: f64,
    /// Standard deviation of deviations (consistency measure)
    #[serde(rename = "stdDeviationMs")]
    pub std_deviation_ms: f64,
    /// Mean absolute deviation (how far off on average)
    #[serde(rename = "meanAbsDeviationMs")]
    pub mean_abs_deviation_ms: f64,
    /// Mean interval error (consistency between consecutive hits)
    #[serde(rename = "meanIntervalErrorMs")]
    pub mean_interval_error_ms: f64,
    /// Letter grade: S, A, B, C, D, F
    pub grade: String,
    /// Score 0–100
    pub score: u32,
    /// All deviations for histogram rendering
    pub deviations: Vec<f64>,
    /// Dynamics consistency: std deviation of hit amplitudes (lower = more even)
    #[serde(rename = "dynamicsStd")]
    pub dynamics_std: f64,
    /// Mean hit amplitude
    #[serde(rename = "meanAmplitude")]
    pub mean_amplitude: f64,
    /// Tempo stability: std deviation of interval errors (lower = steadier)
    #[serde(rename = "tempoStabilityMs")]
    pub tempo_stability_ms: f64,
    /// Longest streak of consecutive non-miss beats
    #[serde(rename = "longestStreak")]
    pub longest_streak: u32,
    /// Human-readable one-liner comment based on performance
    pub comment: String,
    /// Specific insights about the session (early/late tendency, consistency, etc.)
    pub insights: Vec<String>,
    /// Mean grid correlation (0.0–1.0). High = structured exercise, low = free playing.
    #[serde(rename = "gridCorrelation")]
    pub grid_correlation: f64,
    /// Mean onset efficiency over the segment window (0.0–1.0).
    /// Derived from `ComponentScores.onset_efficiency` across the segments
    /// that fed into this report. `None` when no segments were recorded
    /// (e.g. short warm-up bursts, unit-test fixtures with raw feedbacks).
    /// The JS side uses this to classify the session as 'structured' vs
    /// 'noodling' (threshold = 0.65).
    #[serde(rename = "onsetEfficiency", skip_serializing_if = "Option::is_none")]
    pub onset_efficiency: Option<f32>,
    /// Play mode derived from `onset_efficiency`. `None` when no segments
    /// were recorded (mirrors the `onset_efficiency` sentinel exactly).
    #[serde(rename = "playMode", skip_serializing_if = "Option::is_none")]
    pub play_mode: Option<PlayMode>,
    /// Mean hit completeness over the segment window (0.0–1.0).
    /// `beat_count / total_expected_beats` averaged across segments.
    /// `None` when no segments were recorded (mirrors `onset_efficiency`).
    #[serde(rename = "hitCompleteness", skip_serializing_if = "Option::is_none")]
    pub hit_completeness: Option<f32>,
    /// Mean interval consistency over the segment window (0.0–1.0).
    /// Gaussian decay of inter-onset interval MAD. 1.0 = perfectly even spacing.
    /// `None` when no segments were recorded.
    #[serde(
        rename = "intervalConsistency",
        skip_serializing_if = "Option::is_none"
    )]
    pub interval_consistency: Option<f32>,
    /// Mean grid alignment over the segment window (0.0–1.0).
    /// Confidence-weighted hit-quality average (perfect=1.0, miss=0.0).
    /// `None` when no segments were recorded.
    #[serde(rename = "gridAlignment", skip_serializing_if = "Option::is_none")]
    pub grid_alignment: Option<f32>,
    /// Coach mode active during this session. Determines which scoring
    /// constants were applied (k-factor, score weights).
    /// `default` when absent so legacy golden fixtures / old saved sessions
    /// deserialise without error (pre-dates the coach-mode field).
    #[serde(rename = "coachMode", default)]
    pub coach_mode: CoachMode,
    /// Mean amplitude of downbeat onsets averaged across segments.
    /// `None` when no segment had enough downbeat data points.
    #[serde(rename = "downbeatAmpAvg", skip_serializing_if = "Option::is_none")]
    pub downbeat_amp_avg: Option<f32>,
    /// Mean amplitude of upbeat onsets averaged across segments.
    /// `None` when no segment had enough upbeat data points.
    #[serde(rename = "upbeatAmpAvg", skip_serializing_if = "Option::is_none")]
    pub upbeat_amp_avg: Option<f32>,
    /// Mean amplitude of subdivision onsets averaged across segments.
    /// `None` when no segment had enough subdivision data points.
    #[serde(rename = "subdivisionAmpAvg", skip_serializing_if = "Option::is_none")]
    pub subdivision_amp_avg: Option<f32>,
    /// Population std dev of all matched onset amplitudes averaged across segments.
    /// `None` when no segment had enough matched onsets.
    #[serde(rename = "ampStdDev", skip_serializing_if = "Option::is_none")]
    pub amp_std_dev: Option<f32>,
    /// Count of accent (downbeat) positions matched within the active window.
    /// 0 when no post-session telemetry was available (live mini-reports, short
    /// warmups). Use to compute Default-mode display accuracy:
    /// `accent_hits_count / accent_beats_count`.
    #[serde(rename = "accentHitsCount", default)]
    pub accent_hits_count: u32,
    /// Total accent positions that fell within the active segment window.
    /// 0 when no post-session telemetry available.
    #[serde(rename = "accentBeatsCount", default)]
    pub accent_beats_count: u32,
    /// Subdivision count active during this session (1 = quarter notes,
    /// 2 = eighth, 4 = sixteenth). Defaults to 1 for backward compat with
    /// old saved sessions and live mini-reports.
    #[serde(rename = "subdivision", default = "default_subdivision")]
    pub subdivision: u8,
}

/// Accumulates BeatFeedback events during a playing session.
///
/// Also tracks session start (UNIX seconds) and Signal-B-emitted
/// `PracticeSegment`s so the D1 diagnostic log persistence path
/// (`commands::stop_evaluation` → `session_log::save_log`) has
/// everything it needs without piping the timing analyzer into the
/// log builder directly.
///
/// **Two parallel buffers**: the mini-report `window` (cleared by JS
/// mid-session — see `useSession.ts::clearSession`) and the full-session
/// `all_*` totals (cleared only at `start_evaluation`). The window powers
/// per-segment `get_session_report` IPC calls — the coach card needs to
/// see the current segment in isolation. The full-session totals back the
/// persisted D1 JSON so the on-disk `report` field reflects the whole
/// session, not just the last segment. Before this split, every
/// mid-session `clearSession()` (one per segment that produced a
/// mini-report) wiped the totals too — leaving the persisted JSON's
/// `totalBeats=1, hits=0, score=20` even when the user played for an
/// hour. Anything downstream that reads `report.*` directly (analytics,
/// exports) got garbage. Forensics from session_1779073853 spotted it.
pub struct SessionAccumulator {
    /// Mini-report window — cleared by JS `clearSession()` between
    /// per-segment mini-reports so each `get_session_report` IPC call
    /// reflects only the segment the player just finished.
    feedbacks: Vec<BeatFeedback>,
    /// Full-session totals. Mirrors every `push` into `feedbacks` but is
    /// only cleared at session start (`clear()`). Drives the persisted
    /// D1 JSON `report` field via `persist_session_log`.
    all_feedbacks: Vec<BeatFeedback>,
    /// POSTMATCH_1: Post-session best-candidate feedbacks. Computed once
    /// at `stop_evaluation` by `recompute_matches` on the raw telemetry
    /// streams. `report_final()` uses these when present (falls back to
    /// `all_feedbacks` for synthetic tests / fixture sessions where
    /// telemetry is absent). Cleared only at `clear()` (session start),
    /// not at `clear_segment_window()`.
    recomputed_feedbacks: Option<Vec<BeatFeedback>>,
    /// UNIX seconds when the session started. `None` until
    /// `mark_session_start` is called (`start_evaluation` sets this).
    /// Survives `clear_segment_window()` so the session epoch isn't lost
    /// to a mid-session mini-report.
    session_start_secs: Option<u64>,
    /// Wall-clock ms (Unix epoch) of the session start. Used to derive
    /// duration on save and to compute segment offsets in the diagnostic
    /// log. `None` until `mark_session_start` is called.
    session_start_ms: Option<u64>,
    /// Practice segments — same window/all split as feedbacks. The
    /// window backs `acc.report()`'s duration-weighted score; the full
    /// list lands in the persisted JSON.
    segments: Vec<PracticeSegment>,
    /// Full-session segments. Mirror of `segments` that survives
    /// `clear_segment_window()`.
    all_segments: Vec<PracticeSegment>,
    /// Coach mode for this session. Set at session start via
    /// `start_evaluation`. Propagated to `SessionReport` and into each
    /// `SegmentState` so `score_segment` can branch on it.
    pub coach_mode: CoachMode,
    /// Post-session accent counts — populated by `set_accent_counts` in
    /// `stop_evaluation` after `recompute_matches`. 0 for live mini-reports
    /// (real-time accumulator path lacks per-beat `is_accent` metadata).
    pub accent_hits_count: u32,
    pub accent_beats_count: u32,
    /// Subdivision count for this session. Set from SharedState at
    /// `start_evaluation` so `report_final()` can include it.
    pub subdivision: u8,
}

impl SessionAccumulator {
    pub fn new() -> Self {
        Self {
            feedbacks: Vec::with_capacity(256),
            all_feedbacks: Vec::with_capacity(1024),
            recomputed_feedbacks: None,
            session_start_secs: None,
            session_start_ms: None,
            segments: Vec::new(),
            all_segments: Vec::new(),
            coach_mode: CoachMode::Default,
            accent_hits_count: 0,
            accent_beats_count: 0,
            subdivision: 1,
        }
    }

    pub fn push(&mut self, fb: BeatFeedback) {
        self.feedbacks.push(fb.clone());
        self.all_feedbacks.push(fb);
    }

    /// Stamp the session-start wall clock. Idempotent — only the first
    /// call sticks. Call from `start_evaluation` after `clear()`.
    pub fn mark_session_start(&mut self, secs: u64, ms: u64) {
        if self.session_start_secs.is_none() {
            self.session_start_secs = Some(secs);
            self.session_start_ms = Some(ms);
        }
    }

    pub fn push_segment(&mut self, seg: PracticeSegment) {
        self.segments.push(seg.clone());
        self.all_segments.push(seg);
    }

    /// Full reset — wipes BOTH the mini-report window and the full-
    /// session totals (feedbacks, segments, session_start). Use at
    /// session boundaries (`start_evaluation`) — not mid-session.
    pub fn clear(&mut self) {
        self.feedbacks.clear();
        self.all_feedbacks.clear();
        self.recomputed_feedbacks = None;
        self.segments.clear();
        self.all_segments.clear();
        self.session_start_secs = None;
        self.session_start_ms = None;
        self.accent_hits_count = 0;
        self.accent_beats_count = 0;
        // subdivision is intentionally NOT reset — it persists until
        // start_evaluation sets it from the current SharedState. This
        // prevents a 0-subdivision report if clear() is ever called without
        // a subsequent set_subdivision().
    }

    /// Store post-session best-candidate feedbacks (POSTMATCH_1).
    /// Called once from `stop_evaluation` after `recompute_matches`.
    /// `report_final()` uses these in preference to `all_feedbacks`.
    pub fn set_recomputed_feedbacks(&mut self, fbs: Vec<BeatFeedback>) {
        self.recomputed_feedbacks = Some(fbs);
    }

    /// Store post-session accent counts for Default-mode accuracy display.
    /// Called from `stop_evaluation` alongside `set_recomputed_feedbacks`.
    /// `hits` = accent beats where an onset was matched; `beats` = total
    /// accent positions in the active window (reason != NoActivity).
    pub fn set_accent_counts(&mut self, hits: u32, beats: u32) {
        self.accent_hits_count = hits;
        self.accent_beats_count = beats;
    }

    /// Set the subdivision count from SharedState at `start_evaluation`.
    pub fn set_subdivision(&mut self, sub: u8) {
        self.subdivision = sub.max(1);
    }

    /// Mid-session clear — wipes ONLY the mini-report window so the next
    /// `get_session_report` IPC reflects the next segment in isolation.
    /// The full-session `all_*` totals and `session_start_*` are
    /// preserved so the eventual persisted JSON still sees the whole
    /// session. Called by the `clear_session` Tauri command which the
    /// JS side fires between per-segment mini-reports.
    pub fn clear_segment_window(&mut self) {
        self.feedbacks.clear();
        self.segments.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.feedbacks.is_empty()
    }

    /// Read-only access to the mini-report window's feedbacks
    /// (per-segment scope — what `acc.report()` consumes).
    pub fn feedbacks(&self) -> &[BeatFeedback] {
        &self.feedbacks
    }

    /// Read-only access to the FULL-session feedbacks, surviving every
    /// mid-session `clear_segment_window()`. Used by
    /// `persist_session_log` so the on-disk report reflects every beat
    /// played across every segment.
    pub fn all_feedbacks(&self) -> &[BeatFeedback] {
        &self.all_feedbacks
    }

    /// UNIX seconds when the session started, or `None` if never stamped.
    pub fn session_start_secs(&self) -> Option<u64> {
        self.session_start_secs
    }

    /// Wall-clock ms (Unix epoch) when the session started.
    pub fn session_start_ms(&self) -> Option<u64> {
        self.session_start_ms
    }

    /// Read-only access to the mini-report window's segments.
    pub fn segments(&self) -> &[PracticeSegment] {
        &self.segments
    }

    /// Read-only access to the FULL-session segments, surviving every
    /// mid-session `clear_segment_window()`. Used by
    /// `persist_session_log`.
    pub fn all_segments(&self) -> &[PracticeSegment] {
        &self.all_segments
    }

    /// Generate a session report from accumulated feedback.
    pub fn report(&self) -> SessionReport {
        let total_beats = self.feedbacks.len() as u32;
        let mut perfect_count = 0u32;
        let mut good_count = 0u32;
        let mut ok_count = 0u32;
        let mut miss_count = 0u32;
        let mut skipped_beats = 0u32;
        let mut deviations: Vec<f64> = Vec::new();
        let mut interval_errors: Vec<f64> = Vec::new();
        let mut amplitudes: Vec<f64> = Vec::new();
        let mut grid_correlations: Vec<f64> = Vec::new();

        // Track longest streak
        let mut longest_streak = 0u32;
        let mut current_streak = 0u32;

        for fb in &self.feedbacks {
            match fb.classification.as_str() {
                "perfect" => {
                    perfect_count += 1;
                    deviations.push(fb.deviation_ms);
                    amplitudes.push(fb.amplitude as f64);
                    current_streak += 1;
                }
                "good" => {
                    good_count += 1;
                    deviations.push(fb.deviation_ms);
                    amplitudes.push(fb.amplitude as f64);
                    current_streak += 1;
                }
                "ok" => {
                    ok_count += 1;
                    deviations.push(fb.deviation_ms);
                    amplitudes.push(fb.amplitude as f64);
                    current_streak += 1;
                }
                "skipped" => {
                    skipped_beats += 1;
                    // Skipped beats don't break streaks or count as misses
                }
                _ => {
                    // "miss"
                    miss_count += 1;
                    if current_streak > longest_streak {
                        longest_streak = current_streak;
                    }
                    current_streak = 0;
                }
            }
            if fb.classification != "miss"
                && fb.classification != "skipped"
                && fb.interval_error_ms != 0.0
            {
                interval_errors.push(fb.interval_error_ms.abs());
            }
            if fb.grid_correlation > 0.0 {
                grid_correlations.push(fb.grid_correlation);
            }
        }
        if current_streak > longest_streak {
            longest_streak = current_streak;
        }

        let hits_count = perfect_count + good_count + ok_count;
        // Scored beats exclude skipped — only hits + misses count for scoring
        let scored_beats = hits_count + miss_count;

        let mean_deviation_ms = if deviations.is_empty() {
            0.0
        } else {
            deviations.iter().sum::<f64>() / deviations.len() as f64
        };

        let mean_abs_deviation_ms = if deviations.is_empty() {
            0.0
        } else {
            deviations.iter().map(|d| d.abs()).sum::<f64>() / deviations.len() as f64
        };

        let std_deviation_ms = if deviations.len() < 2 {
            0.0
        } else {
            let variance = deviations
                .iter()
                .map(|d| (d - mean_deviation_ms).powi(2))
                .sum::<f64>()
                / (deviations.len() - 1) as f64;
            variance.sqrt()
        };

        let mean_interval_error_ms = if interval_errors.is_empty() {
            0.0
        } else {
            interval_errors.iter().sum::<f64>() / interval_errors.len() as f64
        };

        // Dynamics consistency
        let mean_amplitude = if amplitudes.is_empty() {
            0.0
        } else {
            amplitudes.iter().sum::<f64>() / amplitudes.len() as f64
        };

        let dynamics_std = if amplitudes.len() < 2 {
            0.0
        } else {
            let var = amplitudes
                .iter()
                .map(|a| (a - mean_amplitude).powi(2))
                .sum::<f64>()
                / (amplitudes.len() - 1) as f64;
            var.sqrt()
        };

        // Tempo stability: std of interval errors
        let tempo_stability_ms = if interval_errors.len() < 2 {
            0.0
        } else {
            let mean_ie = interval_errors.iter().sum::<f64>() / interval_errors.len() as f64;
            let var = interval_errors
                .iter()
                .map(|e| (e - mean_ie).powi(2))
                .sum::<f64>()
                / (interval_errors.len() - 1) as f64;
            var.sqrt()
        };

        // Score: weighted combination of hit rate, accuracy, and consistency
        // Use scored_beats (not total_beats) so skipped beats don't deflate hit rate
        let hit_rate = if scored_beats > 0 {
            hits_count as f64 / scored_beats as f64
        } else {
            0.0
        };
        let accuracy_score = if deviations.is_empty() {
            0.0
        } else {
            let points =
                perfect_count as f64 * 10.0 + good_count as f64 * 7.0 + ok_count as f64 * 3.0;
            let max_points = hits_count as f64 * 10.0;
            if max_points > 0.0 {
                points / max_points
            } else {
                0.0
            }
        };
        let consistency_score = (1.0 - (std_deviation_ms / 50.0).min(1.0)).max(0.0);

        // D4 — duration-weighted session score from segment results.
        // The live DSP pipeline emits `PracticeSegment`s with their own
        // four-component D3 scores; the plan-correct session score is
        // `Σ(segment_score × segment_duration_ms) / Σ(segment_duration_ms)`
        // so a 10-second warmup segment doesn't outweigh a 5-minute run.
        // Fall back to the legacy `hit×0.3 + acc×0.5 + consist×0.2` only
        // when no segments were recorded (e.g. drill-only sessions where
        // the segment trigger never fired, or unit-test fixtures that
        // push raw feedbacks).
        //
        // SCALE: `score_segment` returns a 0-100 score (the four
        // components are weighted then `* 100.0` at the bottom of the
        // function). `duration_weighted_session_score` preserves that
        // scale — it just takes a weighted mean of values it doesn't
        // care about. The legacy fallback, in contrast, is a sum of
        // [0, 1] components so it needs an explicit `* 100.0` to land
        // in the same range. Mixing the two scales caused v0.9's
        // "Score 2636 / grade F" final report — segment path was being
        // `* 100`'d twice. Branching the multiplier keeps both paths
        // honest.
        let score = if !self.segments.is_empty() {
            let pairs: Vec<(f32, u64)> = self
                .segments
                .iter()
                .map(|s| (s.score, s.end_ms.saturating_sub(s.start_ms)))
                .collect();
            crate::timing::duration_weighted_session_score(&pairs)
                .round()
                .clamp(0.0, 100.0) as u32
        } else {
            ((hit_rate * 0.3 + accuracy_score * 0.5 + consistency_score * 0.2) * 100.0)
                .round()
                .clamp(0.0, 100.0) as u32
        };

        let grade = match score {
            95..=100 => "S",
            85..=94 => "A",
            70..=84 => "B",
            55..=69 => "C",
            40..=54 => "D",
            _ => "F",
        }
        .to_string();

        // Generate human-readable comment
        let comment = generate_comment(&grade, score, scored_beats);

        // Generate insights
        let insights = generate_insights(
            mean_deviation_ms,
            std_deviation_ms,
            longest_streak,
            hit_rate,
            score,
            scored_beats,
            perfect_count,
            hits_count,
            tempo_stability_ms,
        );

        // Mean onset efficiency across window segments.  `None` when no
        // segment has been emitted yet (short warmup, raw-feedback unit tests).
        let onset_efficiency = if self.segments.is_empty() {
            None
        } else {
            let sum: f32 = self
                .segments
                .iter()
                .map(|s| s.component_scores.onset_efficiency)
                .sum();
            Some(sum / self.segments.len() as f32)
        };
        // DEFAULT_EVAL: play_mode is always Structured. Noodling detection
        // is removed — penalising extra notes (16ths over quarters, fills,
        // ghost notes) conflicts with free-form practice and produces
        // demotivating results for correct playing. OE weight is also 0.0
        // in all instrument profiles, so this is purely cosmetic, but
        // keeping play_mode=Noodling in any code path would still surface
        // as a misleading label in the UI and coach feed.
        let play_mode = onset_efficiency.map(|_| PlayMode::Structured);
        let hit_completeness = if self.segments.is_empty() {
            None
        } else {
            let sum: f32 = self
                .segments
                .iter()
                .map(|s| s.component_scores.hit_completeness)
                .sum();
            Some(sum / self.segments.len() as f32)
        };
        let interval_consistency = if self.segments.is_empty() {
            None
        } else {
            let sum: f32 = self
                .segments
                .iter()
                .map(|s| s.component_scores.interval_consistency)
                .sum();
            Some(sum / self.segments.len() as f32)
        };
        let grid_alignment = if self.segments.is_empty() {
            None
        } else {
            let sum: f32 = self
                .segments
                .iter()
                .map(|s| s.component_scores.grid_alignment)
                .sum();
            Some(sum / self.segments.len() as f32)
        };

        let downbeat_amp_avg = {
            let vals: Vec<f32> = self
                .segments
                .iter()
                .filter_map(|s| s.component_scores.downbeat_amp_avg)
                .collect();
            if vals.is_empty() {
                None
            } else {
                Some(vals.iter().sum::<f32>() / vals.len() as f32)
            }
        };
        let upbeat_amp_avg = {
            let vals: Vec<f32> = self
                .segments
                .iter()
                .filter_map(|s| s.component_scores.upbeat_amp_avg)
                .collect();
            if vals.is_empty() {
                None
            } else {
                Some(vals.iter().sum::<f32>() / vals.len() as f32)
            }
        };
        let subdivision_amp_avg = {
            let vals: Vec<f32> = self
                .segments
                .iter()
                .filter_map(|s| s.component_scores.subdivision_amp_avg)
                .collect();
            if vals.is_empty() {
                None
            } else {
                Some(vals.iter().sum::<f32>() / vals.len() as f32)
            }
        };
        let amp_std_dev = {
            let vals: Vec<f32> = self
                .segments
                .iter()
                .filter_map(|s| s.component_scores.amp_std_dev)
                .collect();
            if vals.is_empty() {
                None
            } else {
                Some(vals.iter().sum::<f32>() / vals.len() as f32)
            }
        };

        SessionReport {
            total_beats,
            hits_count,
            miss_count,
            skipped_beats,
            perfect_count,
            good_count,
            ok_count,
            mean_deviation_ms,
            std_deviation_ms,
            mean_abs_deviation_ms,
            mean_interval_error_ms,
            grade,
            score,
            deviations,
            dynamics_std,
            mean_amplitude,
            tempo_stability_ms,
            longest_streak,
            comment,
            insights,
            grid_correlation: if grid_correlations.is_empty() {
                0.0
            } else {
                grid_correlations.iter().sum::<f64>() / grid_correlations.len() as f64
            },
            onset_efficiency,
            play_mode,
            hit_completeness,
            interval_consistency,
            grid_alignment,
            coach_mode: self.coach_mode,
            downbeat_amp_avg,
            upbeat_amp_avg,
            subdivision_amp_avg,
            amp_std_dev,
            // Accent counts are populated by report_final() after post-session
            // recompute_matches; live mini-reports via report() carry 0 because
            // the real-time accumulator path lacks per-beat is_accent metadata.
            accent_hits_count: 0,
            accent_beats_count: 0,
            subdivision: self.subdivision,
        }
    }

    /// Final-session report: identical to `report()` but reads all segment
    /// buffers from `self.all_segments` (the never-cleared full-session
    /// accumulator) instead of `self.segments` (the per-exercise window).
    ///
    /// # Why a separate method instead of changing `report()`?
    ///
    /// Mid-session mini-reports call `get_session_report` (which uses
    /// `report()`) BEFORE `clearSession()` fires, and they deliberately show
    /// per-exercise performance.  For the first exercise `all_segments ==
    /// segments`, so there is no difference.  But for exercise N ≥ 2,
    /// `all_segments` already contains segments from earlier exercises;
    /// routing the mini-report through `report_final()` would show a
    /// cumulative score (exercises 1 … N) instead of the per-exercise score
    /// (exercise N alone) — a misleading UX regression.
    ///
    /// The session-end path uses a dedicated `get_final_session_report`
    /// command that calls this method, so the two call sites stay independent.
    pub fn report_final(&self) -> SessionReport {
        // POSTMATCH_1: use post-session best-candidate feedbacks when
        // available (set by stop_evaluation via recompute_matches).
        // Fall back to all_feedbacks for synthetic tests / fixture
        // sessions where telemetry is absent.
        let beat_feedbacks: &[BeatFeedback] = if let Some(ref rfs) = self.recomputed_feedbacks {
            rfs.as_slice()
        } else {
            &self.all_feedbacks
        };

        // Build a scratch accumulator loaded with the chosen feedbacks +
        // all_segments. A single report() call then computes all fields
        // correctly: beat-level stats from feedbacks, D3 score and
        // component averages from segments.
        let mut tmp = SessionAccumulator::new();
        tmp.coach_mode = self.coach_mode;
        tmp.subdivision = self.subdivision;
        for fb in beat_feedbacks {
            tmp.feedbacks.push(fb.clone());
        }
        for seg in &self.all_segments {
            tmp.segments.push(seg.clone());
        }
        let mut r = tmp.report();
        // Patch in post-session accent counts (computed by stop_evaluation
        // after recompute_matches — not available in the scratch accumulator).
        r.accent_hits_count = self.accent_hits_count;
        r.accent_beats_count = self.accent_beats_count;
        r
    }
}

pub type SharedSessionAccumulator = Arc<Mutex<SessionAccumulator>>;

pub fn create_shared_session_accumulator() -> SharedSessionAccumulator {
    Arc::new(Mutex::new(SessionAccumulator::new()))
}

/// A persisted session with metadata for history.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SavedSession {
    pub id: String,
    pub timestamp: u64,
    pub bpm: u16,
    #[serde(rename = "timeSignature")]
    pub time_signature: u8,
    pub report: SessionReport,
    #[serde(rename = "presetId", default, skip_serializing_if = "Option::is_none")]
    pub preset_id: Option<String>,
    #[serde(
        rename = "presetName",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub preset_name: Option<String>,
    /// Per-segment exercise data, serialised as raw JSON so the Rust layer
    /// doesn't need to mirror the full `SessionSegment` TypeScript shape.
    /// `None` for old sessions that pre-date this field — deserialized via
    /// `serde(default)` so existing stored data loads cleanly.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub segments: Option<serde_json::Value>,
}

pub const MAX_SESSION_HISTORY: usize = 30;

/// Bars actually played at one tempo during a drill run.
///
/// A pair rather than a map because a JSON object keyed by a number is
/// awkward on both sides of the bridge, and the list is never long — one
/// entry per distinct tempo the run touched.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct DrillReach {
    pub bpm: u16,
    pub bars: u16,
}

/// One drill run, recorded so the next one can be drawn against it
/// (UI_DECISIONS U3.3 — the last run under tonight's plan).
///
/// # Why this is not a field on `SavedSession`
///
/// A `SavedSession` is an *evaluation* record: it cannot exist without a
/// `SessionReport`, which cannot exist without the mic on. Most drills are
/// played with the input off — and those are exactly the runs whose wall the
/// climb has to draw. Hanging the underlay off `evalSessionHistory` would
/// have made the picture blank for everyone who practises without the mic,
/// which is a silent, invisible failure. So a drill run is its own record in
/// its own store key, written when the ramp stops, not when a session ends.
///
/// # What is here, and why each piece is needed
///
/// The *plan* half (`start_bpm` … `cyclic`) is what lets the frontend decide
/// whether a stored run is comparable to tonight's plan at all — see
/// `lastRun.ts`, which requires `beats_per_bar`, `subdivision` and
/// `bars_per_step` to match, because those three are what one cell of the
/// climb *means*.
///
/// The *reach* half is deliberately recorded as bars-per-tempo rather than
/// only as a step index. A step index is only meaningful against the ladder
/// the run was following, and that ladder is not recoverable later: adaptive
/// counts a step per decision (including the ones that went down), and a
/// cyclic ramp counts past the end of its own ladder and comes back. Tempo is
/// the one coordinate that means the same thing in both runs, so tempo is
/// what is stored. `reached_step` / `reached_bar` / `reached_bpm` are kept
/// alongside it as the literal position the run stopped at.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrillRun {
    pub id: String,
    /// Epoch ms at which the run *started* — the note beside the climb says
    /// how long ago you practised, and that is when you practised.
    pub timestamp: u64,
    // --- the plan that was running ---
    pub start_bpm: u16,
    pub target_bpm: u16,
    pub increment: u16,
    pub decrement: u16,
    pub bars_per_step: u16,
    pub beats_per_bar: u8,
    pub subdivision: u8,
    pub mode: String,
    pub cyclic: bool,
    // --- how far it got ---
    /// `speed_ramp.current_step` at the end. May exceed the ladder's length
    /// on a cyclic run, and counts decisions rather than rungs on an adaptive
    /// one, which is why the picture is drawn from `reach` instead.
    pub reached_step: u32,
    /// Bars completed inside that step.
    pub reached_bar: u16,
    pub reached_bpm: u16,
    /// The ramp reached its target, rather than being stopped short.
    pub completed: bool,
    /// Bars played at each tempo the run touched, most bars seen at each.
    /// Empty is legal (and means "no picture"), so old or partial records
    /// degrade to no underlay rather than to a wrong one.
    #[serde(default)]
    pub reach: Vec<DrillReach>,
}

/// Same cap as the session history: thirty runs is more than enough to find
/// the last comparable one, and this lives in `settings.json` alongside
/// everything else the app stores.
pub const MAX_DRILL_RUN_HISTORY: usize = 30;

/// Generate a one-liner comment based on the grade and score.
fn generate_comment(grade: &str, score: u32, scored_beats: u32) -> String {
    if scored_beats < 8 {
        return "Not enough data yet — keep playing!".to_string();
    }
    match grade {
        "S" => match score {
            100 => "Flawless. You're a metronome yourself.",
            _ => "Outstanding timing — near-perfect precision.",
        },
        "A" => "Solid performance. Your timing is tight and consistent.",
        "B" => "Good work! A few rough edges, but strong overall.",
        "C" => "Decent foundation. Focus on evenness and you'll climb fast.",
        "D" => "Getting there. Slow down and lock in with the click.",
        _ => "Keep at it — consistent practice builds timing muscle memory.",
    }
    .to_string()
}

/// Generate specific, actionable insights from session data.
fn generate_insights(
    mean_deviation_ms: f64,
    std_deviation_ms: f64,
    longest_streak: u32,
    hit_rate: f64,
    score: u32,
    scored_beats: u32,
    perfect_count: u32,
    hits_count: u32,
    tempo_stability_ms: f64,
) -> Vec<String> {
    let mut insights = Vec::new();

    if scored_beats < 8 {
        return insights;
    }

    // Early/late tendency
    if mean_deviation_ms.abs() > 5.0 {
        if mean_deviation_ms < 0.0 {
            insights.push(format!(
                "You tend to rush — averaging {:.0}ms ahead of the beat.",
                mean_deviation_ms.abs()
            ));
        } else {
            insights.push(format!(
                "You tend to drag — averaging {:.0}ms behind the beat.",
                mean_deviation_ms
            ));
        }
    } else if hits_count > 8 {
        insights.push("Your timing is centered — no early/late bias.".to_string());
    }

    // Consistency praise or guidance
    if std_deviation_ms < 8.0 && hits_count > 12 {
        insights.push("Extremely consistent — your timing barely varies.".to_string());
    } else if std_deviation_ms > 25.0 {
        insights.push(
            "Your timing varies quite a bit between beats. Try focusing on smaller phrases."
                .to_string(),
        );
    }

    // Streak highlight
    if longest_streak >= 16 {
        insights.push(format!(
            "Impressive streak of {} beats in a row without a miss!",
            longest_streak
        ));
    } else if longest_streak >= 8 {
        insights.push(format!(
            "Best streak: {} beats in a row. Build on that.",
            longest_streak
        ));
    }

    // High hit rate but low score = accuracy issue
    if hit_rate > 0.9 && score < 70 {
        insights.push(
            "You're hitting most beats but not precisely — focus on locking in tighter."
                .to_string(),
        );
    }

    // Perfect ratio
    if hits_count > 0 {
        let perfect_ratio = perfect_count as f64 / hits_count as f64;
        if perfect_ratio > 0.6 && hits_count > 12 {
            insights.push(format!(
                "{:.0}% of your hits were perfect (<10ms). Keep it up!",
                perfect_ratio * 100.0
            ));
        }
    }

    // Tempo stability
    if tempo_stability_ms > 25.0 && hits_count > 8 {
        insights.push("Your spacing between beats is uneven. Try subdividing mentally to keep a steadier pulse.".to_string());
    } else if tempo_stability_ms < 5.0 && hits_count > 12 {
        insights.push(
            "Rock-solid internal clock — your spacing between beats is very even.".to_string(),
        );
    }

    // Cap at 3 most relevant insights
    insights.truncate(3);
    insights
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fb(classification: &str, deviation: f64, interval_err: f64, amp: f32) -> BeatFeedback {
        BeatFeedback {
            beat_index: 0,
            deviation_ms: deviation,
            interval_error_ms: interval_err,
            classification: classification.to_string(),
            amplitude: amp,
            calibration_offset_ms: 0.0,
            calibration_confidence: 1.0,
            grid_correlation: 0.0,
        }
    }

    #[test]
    fn empty_session_grades_F() {
        // Empty session: no hits, no misses, no scored beats.
        // Score is non-zero because consistency_score = 1.0 trivially
        // (no deviations means no variance penalty). Implementation detail —
        // grade should still be F since score < 40.
        let acc = SessionAccumulator::new();
        let r = acc.report();
        assert_eq!(r.total_beats, 0);
        assert!(
            r.score < 40,
            "Empty session score should be < 40, got {}",
            r.score
        );
        assert_eq!(r.grade, "F");
    }

    #[test]
    fn all_perfect_hits_grade_S() {
        let mut acc = SessionAccumulator::new();
        for _ in 0..16 {
            acc.push(fb("perfect", 2.0, 1.0, 0.5));
        }
        let r = acc.report();
        assert_eq!(r.hits_count, 16);
        assert_eq!(r.perfect_count, 16);
        assert_eq!(r.miss_count, 0);
        assert!(
            r.score >= 95,
            "All perfect hits should score >= 95, got {}",
            r.score
        );
        assert_eq!(r.grade, "S");
    }

    #[test]
    fn all_miss_grades_F() {
        let mut acc = SessionAccumulator::new();
        for _ in 0..16 {
            acc.push(fb("miss", 0.0, 0.0, 0.0));
        }
        let r = acc.report();
        assert_eq!(r.miss_count, 16);
        assert_eq!(r.hits_count, 0);
        assert_eq!(r.grade, "F");
    }

    #[test]
    fn grade_bands_map_to_score_ranges() {
        // Test the grade band logic by constructing reports with known
        // perfect/good/ok/miss mixes
        let cases = [
            // (perfect, good, ok, miss, expected_grade_or_alternatives)
            (16, 0, 0, 0, vec!["S"]),          // all perfect = S
            (12, 4, 0, 0, vec!["A", "S"]),     // mostly perfect
            (8, 4, 4, 0, vec!["A", "B"]),      // mixed quality, no miss
            (4, 4, 4, 4, vec!["B", "C", "D"]), // balanced with miss
        ];
        for (p, g, o, m, expected) in cases {
            let mut acc = SessionAccumulator::new();
            for _ in 0..p {
                acc.push(fb("perfect", 1.0, 1.0, 0.5));
            }
            for _ in 0..g {
                acc.push(fb("good", 8.0, 5.0, 0.5));
            }
            for _ in 0..o {
                acc.push(fb("ok", 20.0, 10.0, 0.5));
            }
            for _ in 0..m {
                acc.push(fb("miss", 0.0, 0.0, 0.0));
            }
            let r = acc.report();
            assert!(
                expected.contains(&r.grade.as_str()),
                "(p={}, g={}, o={}, m={}) score={} produced grade {:?}, expected one of {:?}",
                p,
                g,
                o,
                m,
                r.score,
                r.grade,
                expected
            );
        }
    }

    #[test]
    fn skipped_beats_do_not_count_as_misses() {
        let mut acc = SessionAccumulator::new();
        for _ in 0..8 {
            acc.push(fb("perfect", 1.0, 1.0, 0.5));
        }
        for _ in 0..8 {
            acc.push(fb("skipped", 0.0, 0.0, 0.0));
        }
        let r = acc.report();
        assert_eq!(r.perfect_count, 8);
        assert_eq!(r.skipped_beats, 8);
        assert_eq!(r.miss_count, 0);
        // Score should be high since skipped don't deflate it
        assert!(r.score >= 90, "score={}", r.score);
    }

    #[test]
    fn longest_streak_counts_consecutive_non_miss() {
        let mut acc = SessionAccumulator::new();
        // 10 perfect, 1 miss, 5 perfect
        for _ in 0..10 {
            acc.push(fb("perfect", 1.0, 1.0, 0.5));
        }
        acc.push(fb("miss", 0.0, 0.0, 0.0));
        for _ in 0..5 {
            acc.push(fb("perfect", 1.0, 1.0, 0.5));
        }
        let r = acc.report();
        assert_eq!(r.longest_streak, 10);
    }

    #[test]
    fn mean_deviation_centers_on_zero_with_balanced_data() {
        let mut acc = SessionAccumulator::new();
        // Symmetric early/late
        for _ in 0..5 {
            acc.push(fb("good", -10.0, 5.0, 0.5));
        }
        for _ in 0..5 {
            acc.push(fb("good", 10.0, 5.0, 0.5));
        }
        let r = acc.report();
        assert!(
            r.mean_deviation_ms.abs() < 0.01,
            "Expected mean deviation ~ 0, got {}",
            r.mean_deviation_ms
        );
    }

    #[test]
    fn generate_comment_handles_short_session() {
        let comment = generate_comment("S", 100, 4);
        assert!(comment.contains("Not enough data"));
    }

    #[test]
    fn generate_comment_returns_grade_specific_text() {
        let s = generate_comment("S", 100, 20);
        let a = generate_comment("A", 90, 20);
        let f = generate_comment("F", 30, 20);
        assert_ne!(s, a);
        assert_ne!(a, f);
        assert_ne!(s, f);
    }

    // ---- D4 duration-weighted session score plumbing ----

    /// Construct a `PracticeSegment` for the D4 plumbing tests.
    ///
    /// `score_0_1` is a readability convenience — call sites pass
    /// `0.5`, `0.75`, etc. and this helper scales them to the
    /// production 0–100 range that `score_segment` actually emits.
    /// Keeping the call-site notation in `[0, 1]` mirrors the way the
    /// plan talks about D3 sub-components; the on-the-wire `score`
    /// field is 0–100 per the doc-comment in `session_log.rs`.
    /// Component scores stay in `[0, 1]` because that's their actual
    /// schema (see `ComponentScores` doc).
    fn seg(start_ms: u64, end_ms: u64, score_0_1: f32) -> crate::session_log::PracticeSegment {
        crate::session_log::PracticeSegment {
            start_ms,
            end_ms,
            start_bpm: 120,
            end_bpm: 120,
            score: score_0_1 * 100.0,
            component_scores: crate::session_log::ComponentScores {
                interval_consistency: score_0_1,
                grid_alignment: score_0_1,
                hit_completeness: score_0_1,
                onset_efficiency: score_0_1,
                downbeat_amp_avg: None,
                upbeat_amp_avg: None,
                subdivision_amp_avg: None,
                amp_std_dev: None,
            },
            end_reason: crate::session_log::SegmentEndReason::SettingsChange,
            // Path B — fixtures don't exercise rhythm-inference; use
            // the sentinel-unknown 0/0.0 to mirror historic-log defaults.
            inferred_divisor: 0,
            inferred_divisor_confidence: 0.0,
            interval_errors: Vec::new(),
        }
    }

    #[test]
    fn session_score_uses_segment_d4_weighting_when_segments_present() {
        // Two segments: a short 0.5 score for 5s and a long 0.9 score
        // for 55s. Legacy formula on the feedbacks alone would land
        // somewhere mid-range; D4 weighting should land near 0.87
        // (heavily biased toward the 55s segment).
        let mut acc = SessionAccumulator::new();
        for _ in 0..20 {
            acc.push(fb("good", 10.0, 5.0, 0.5));
        }
        acc.push_segment(seg(0, 5_000, 0.50));
        acc.push_segment(seg(5_000, 60_000, 0.90));
        let r = acc.report();
        // Σ(score×dur) / Σdur = (0.5×5000 + 0.9×55000) / 60000 ≈ 0.867
        // → 87 after rounding ×100.
        assert!(
            (84..=89).contains(&r.score),
            "D4-weighted score should land near 87, got {}",
            r.score
        );
    }

    #[test]
    fn session_score_falls_back_to_legacy_when_no_segments() {
        // No segments pushed — should hit the legacy 3-component path.
        // 16 perfects → score >= 95.
        let mut acc = SessionAccumulator::new();
        for _ in 0..16 {
            acc.push(fb("perfect", 1.0, 1.0, 0.5));
        }
        let r = acc.report();
        assert!(
            r.score >= 95,
            "Legacy fallback should still grade all-perfect as S, got {}",
            r.score
        );
    }

    #[test]
    fn session_score_d4_short_segment_doesnt_dominate_long_segment() {
        // Regression guard for the very bug §"What's broken" called out:
        // a 5-second perfect warmup should NOT make a 5-minute D-grade
        // run look like a B.
        let mut acc = SessionAccumulator::new();
        acc.push_segment(seg(0, 5_000, 1.00)); // 5s perfect warmup
        acc.push_segment(seg(5_000, 305_000, 0.40)); // 5min D-grade run
        let r = acc.report();
        // Weighted ≈ (1.0×5000 + 0.4×300000) / 305000 ≈ 0.410 → 41
        assert!(
            r.score <= 50,
            "Long D-grade run should dominate; got {}",
            r.score
        );
    }

    #[test]
    fn session_score_d4_handles_single_segment() {
        let mut acc = SessionAccumulator::new();
        acc.push_segment(seg(0, 60_000, 0.75));
        let r = acc.report();
        assert!(
            (74..=76).contains(&r.score),
            "Single 0.75 segment should score ~75, got {}",
            r.score
        );
    }

    #[test]
    fn session_score_d4_handles_zero_duration_segments() {
        // Defensive: a segment with end_ms < start_ms (clock skew?) or
        // start==end shouldn't poison the aggregation.
        let mut acc = SessionAccumulator::new();
        acc.push_segment(seg(1_000, 1_000, 0.50)); // zero duration
        acc.push_segment(seg(1_000, 31_000, 0.90)); // 30s real segment
        let r = acc.report();
        // 30s segment dominates; expect ~90.
        assert!(
            (88..=92).contains(&r.score),
            "Zero-duration segment should not poison D4 weighting; got {}",
            r.score
        );
    }

    // ---- Mini-report window vs. full-session totals (clear_segment_window) ----
    //
    // Regression guards for the "persisted JSON report shows
    // `totalBeats=1, hits=0, score=20` after a multi-segment session"
    // bug — root cause was the mid-session `clearSession()` IPC wiping
    // the same buffers the persistence layer reads at stop time.

    #[test]
    fn clear_segment_window_preserves_full_session_totals() {
        let mut acc = SessionAccumulator::new();
        acc.mark_session_start(1_700_000_000, 1_700_000_000_000);

        // Segment 1 — 8 perfects, then push the segment + mid-session clear.
        for _ in 0..8 {
            acc.push(fb("perfect", 1.0, 1.0, 0.5));
        }
        acc.push_segment(crate::session_log::PracticeSegment {
            start_ms: 0,
            end_ms: 30_000,
            start_bpm: 100,
            end_bpm: 100,
            score: 95.0,
            component_scores: crate::session_log::ComponentScores::default(),
            end_reason: crate::session_log::SegmentEndReason::ActivityGap,
            inferred_divisor: 0,
            inferred_divisor_confidence: 0.0,
            interval_errors: Vec::new(),
        });
        acc.clear_segment_window();

        // Window is empty (mini-report scope reset).
        assert!(
            acc.is_empty(),
            "window feedbacks should be empty after clear_segment_window"
        );
        assert!(acc.segments().is_empty(), "window segments should be empty");

        // Full-session totals survive.
        assert_eq!(
            acc.all_feedbacks().len(),
            8,
            "all_feedbacks should keep segment 1"
        );
        assert_eq!(
            acc.all_segments().len(),
            1,
            "all_segments should keep segment 1"
        );
        assert_eq!(
            acc.session_start_secs(),
            Some(1_700_000_000),
            "session_start_secs should survive mid-session clear"
        );
        assert_eq!(
            acc.session_start_ms(),
            Some(1_700_000_000_000),
            "session_start_ms should survive mid-session clear"
        );

        // Segment 2 — 4 more perfects.
        for _ in 0..4 {
            acc.push(fb("perfect", 1.0, 1.0, 0.5));
        }

        // Full session sees both segments' beats; window only sees the
        // post-clear ones.
        assert_eq!(acc.feedbacks().len(), 4, "window only has post-clear beats");
        assert_eq!(
            acc.all_feedbacks().len(),
            12,
            "all_feedbacks accumulates across clears"
        );
    }

    #[test]
    fn full_session_report_reflects_all_segments_after_mid_clears() {
        // The bug: after a multi-segment session, the persisted JSON
        // report contained only the LAST segment's worth of beats. The
        // fix routes persistence through `all_feedbacks` so callers see
        // the entire session.
        let mut acc = SessionAccumulator::new();
        acc.mark_session_start(1_700_000_000, 1_700_000_000_000);

        // Three segments × 8 perfects each, with mid-session clears between.
        for _ in 0..3 {
            for _ in 0..8 {
                acc.push(fb("perfect", 1.0, 1.0, 0.5));
            }
            acc.clear_segment_window();
        }

        // Mid-report window scope: empty after the final clear.
        assert!(acc.is_empty(), "window should be empty after final clear");

        // Full-session feedbacks: 24 perfects across three segments.
        let all = acc.all_feedbacks();
        assert_eq!(
            all.len(),
            24,
            "all_feedbacks should keep every push across clears"
        );

        // Score the FULL session via the public helper used by
        // `build_log_from_session` — this is the path that produces the
        // persisted JSON `report` field.
        let full_report = crate::session_log::score_feedbacks(all);
        assert_eq!(full_report.hits_count, 24, "report should count every beat");
        assert_eq!(full_report.perfect_count, 24);
        assert_eq!(full_report.miss_count, 0);
        assert!(
            full_report.score >= 95,
            "all-perfect full session should still grade S, got score {}",
            full_report.score
        );
    }

    #[test]
    fn clear_resets_everything_window_and_full() {
        // The session-start `clear()` MUST wipe both buffers + the
        // session_start stamp so a fresh `start_evaluation` starts clean.
        let mut acc = SessionAccumulator::new();
        acc.mark_session_start(1_700_000_000, 1_700_000_000_000);
        for _ in 0..8 {
            acc.push(fb("perfect", 1.0, 1.0, 0.5));
        }
        acc.push_segment(crate::session_log::PracticeSegment {
            start_ms: 0,
            end_ms: 30_000,
            start_bpm: 100,
            end_bpm: 100,
            score: 95.0,
            component_scores: crate::session_log::ComponentScores::default(),
            end_reason: crate::session_log::SegmentEndReason::ActivityGap,
            inferred_divisor: 0,
            inferred_divisor_confidence: 0.0,
            interval_errors: Vec::new(),
        });

        acc.clear();

        assert!(acc.feedbacks().is_empty(), "window feedbacks");
        assert!(acc.all_feedbacks().is_empty(), "full feedbacks");
        assert!(acc.segments().is_empty(), "window segments");
        assert!(acc.all_segments().is_empty(), "full segments");
        assert_eq!(acc.session_start_secs(), None);
        assert_eq!(acc.session_start_ms(), None);
    }

    // ---------------------------------------------------------------------
    // DrillRun (UI_DECISIONS U3.3) — the record the climb's underlay reads.
    // ---------------------------------------------------------------------

    /// A run written by a build that predates `reach` must still load. It
    /// degrades to "no underlay", which is the whole point of U3.3's rule: a
    /// chart that admits it has no history beats one that invents some.
    #[test]
    fn drill_run_loads_without_its_reach() {
        let json = r#"{
            "id": "r1", "timestamp": 1234, "startBpm": 80, "targetBpm": 120,
            "increment": 5, "decrement": 3, "barsPerStep": 12, "beatsPerBar": 4,
            "subdivision": 1, "mode": "linear", "cyclic": false,
            "reachedStep": 6, "reachedBar": 5, "reachedBpm": 110,
            "completed": false
        }"#;
        let run: DrillRun = serde_json::from_str(json).expect("old record loads");
        assert!(run.reach.is_empty());
        assert_eq!(run.reached_bpm, 110);
    }

    /// The wire names are what `types.ts` mirrors and what sits in
    /// `settings.json`; renaming one silently blanks the underlay, because
    /// every call site of `save_drill_run` is fire-and-forget.
    #[test]
    fn drill_run_serialises_camel_case() {
        let run = DrillRun {
            id: "r1".into(),
            timestamp: 1,
            start_bpm: 80,
            target_bpm: 120,
            increment: 5,
            decrement: 3,
            bars_per_step: 12,
            beats_per_bar: 4,
            subdivision: 1,
            mode: "linear".into(),
            cyclic: false,
            reached_step: 6,
            reached_bar: 5,
            reached_bpm: 110,
            completed: false,
            reach: vec![DrillReach { bpm: 80, bars: 12 }],
        };
        let v = serde_json::to_value(&run).unwrap();
        for key in [
            "startBpm", "targetBpm", "barsPerStep", "beatsPerBar", "reachedStep", "reachedBar",
            "reachedBpm", "completed", "reach",
        ] {
            assert!(v.get(key).is_some(), "missing {key}");
        }
        assert_eq!(v["reach"][0]["bars"], 12);
    }

    /// `SavedSession` is untouched by U3.3 — a drill run is its own record,
    /// so nothing about the evaluation history's shape may have moved.
    #[test]
    fn saved_session_still_loads_without_its_optional_fields() {
        let report = serde_json::to_value(SessionAccumulator::new().report()).unwrap();
        let json = serde_json::json!({
            "id": "s1", "timestamp": 1, "bpm": 100, "timeSignature": 4,
            "report": report,
        });
        let parsed: Result<SavedSession, _> = serde_json::from_value(json);
        assert!(parsed.is_ok(), "old session record must still load");
        let s = parsed.unwrap();
        assert_eq!(s.preset_id, None);
        assert!(s.segments.is_none());
    }
}
