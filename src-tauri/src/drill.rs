//! Drill-run records — the climb's "last run under tonight's plan".
//!
//! Extracted from `session.rs` for the mobile build (M01). Drills ship on
//! mobile and a drill run is a plain store record; `session.rs` is the
//! evaluation pipeline and is desktop-only. Re-exported from `session` so
//! every existing `session::DrillRun` path still resolves.

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
