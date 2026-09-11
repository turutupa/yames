//! Live tempo context — the three atomics the metronome engine writes and
//! the onset detector reads.
//!
//! Extracted from `onset.rs` for the mobile build (M01). `onset.rs` links
//! aubio (C, GPL) and is compiled on desktop only; `engine.rs` needs only
//! these atomics, so they live in their own pure-Rust module and are
//! re-exported from `onset` so every existing path keeps working.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

/// Live tempo context shared between the metronome engine and the
/// onset detector. Lets D2 compute an adaptive refractory period
/// (`max(profile.refractory_floor_ms, subdivision_interval_ms × k)`)
/// without coupling the detector to the engine module.
///
/// Both fields are atomically writeable so the engine can update them
/// per-beat without re-acquiring the SharedState mutex.
#[derive(Debug)]
pub struct TempoContext {
    /// Current BPM × 100 (centi-BPM) so we get one decimal of resolution
    /// while staying lock-free with `AtomicU32`.
    bpm_x100: AtomicU32,
    /// Current subdivision (1 = quarter, 2 = 8th, 4 = 16th, …).
    subdivision: AtomicU32,
    /// Whether the metronome click track is currently running.
    /// The `detect_loop` gates analysis on this so onsets aren't
    /// accumulated when there's no beat grid to match against.
    is_playing: AtomicBool,
}

impl TempoContext {
    pub fn new(bpm: u16, subdivision: u8) -> Self {
        Self {
            bpm_x100: AtomicU32::new((bpm as u32) * 100),
            subdivision: AtomicU32::new(subdivision.max(1) as u32),
            is_playing: AtomicBool::new(false),
        }
    }
    pub fn set_bpm(&self, bpm: u16) {
        self.bpm_x100.store((bpm as u32) * 100, Ordering::Relaxed);
    }
    pub fn set_subdivision(&self, subdivision: u8) {
        self.subdivision
            .store(subdivision.max(1) as u32, Ordering::Relaxed);
    }
    /// Mark the metronome click track as started (`true`) or stopped
    /// (`false`). The `detect_loop` reads this flag every hop to gate
    /// spectral analysis — no grid → no matching → no event flood.
    pub fn set_playing(&self, playing: bool) {
        self.is_playing.store(playing, Ordering::Relaxed);
    }
    /// Returns `true` if the metronome click track is currently running.
    pub fn is_playing(&self) -> bool {
        self.is_playing.load(Ordering::Relaxed)
    }
    /// Returns the current subdivision interval in milliseconds. At
    /// 120 BPM quarter-notes this is 500ms; at 200 BPM 16ths it's 75ms.
    pub fn subdivision_interval_ms(&self) -> f32 {
        let bpm = (self.bpm_x100.load(Ordering::Relaxed) as f32) / 100.0;
        let subdiv = self.subdivision.load(Ordering::Relaxed) as f32;
        if bpm <= 0.0 || subdiv <= 0.0 {
            return 500.0;
        }
        (60_000.0 / bpm) / subdiv
    }
}

pub type SharedTempoContext = Arc<TempoContext>;

// ---------------------------------------------------------------------------
// D2 unit tests — tempo context arithmetic. Moved here with the type (M01);
// they were in `onset.rs`, which a phone does not compile.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f32, b: f32, eps: f32) -> bool {
        (a - b).abs() < eps
    }

    #[test]
    fn tempo_context_subdivision_interval_120_quarters() {
        let ctx = TempoContext::new(120, 1);
        // 60_000 / 120 = 500ms per quarter.
        assert!(approx_eq(ctx.subdivision_interval_ms(), 500.0, 0.01));
    }

    #[test]
    fn tempo_context_subdivision_interval_200_sixteenths() {
        let ctx = TempoContext::new(200, 4);
        // 60_000 / 200 / 4 = 75ms per 16th.
        assert!(approx_eq(ctx.subdivision_interval_ms(), 75.0, 0.01));
    }

    #[test]
    fn tempo_context_live_updates() {
        let ctx = TempoContext::new(120, 1);
        ctx.set_bpm(60);
        // 60 BPM quarter = 1000ms.
        assert!(approx_eq(ctx.subdivision_interval_ms(), 1000.0, 0.01));
        ctx.set_subdivision(2);
        // 60 BPM 8ths = 500ms.
        assert!(approx_eq(ctx.subdivision_interval_ms(), 500.0, 0.01));
    }

    #[test]
    fn tempo_context_subdivision_floor_is_one() {
        // We never want a divide-by-zero on subdivision; setter clamps to ≥1.
        let ctx = TempoContext::new(120, 1);
        ctx.set_subdivision(0);
        // Behaves as if subdivision = 1.
        assert!(approx_eq(ctx.subdivision_interval_ms(), 500.0, 0.01));
    }

    #[test]
    fn tempo_context_zero_bpm_returns_safe_default() {
        // Defensive: BPM should never legitimately be 0, but if it
        // somehow lands there we hand back a 500ms beat instead of NaN.
        let ctx = TempoContext::new(120, 1);
        ctx.bpm_x100.store(0, Ordering::Relaxed);
        assert!(approx_eq(ctx.subdivision_interval_ms(), 500.0, 0.01));
    }
}
