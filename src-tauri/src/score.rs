//! The score — one format for a song, an exercise, a path step.
//!
//! This is the Rust half of the contract in `plans/tasks/songs/BRIEF.md`:
//! the serde mirror of `src/songs/types.ts`, `camelCase` on the wire. It is
//! data and nothing else — no parsing, no derivation, no scoring. The
//! importer builds it in TypeScript, the schedule is derived in TypeScript,
//! and everything on this side (scoring in `timing.rs`, judgement in
//! `findings.rs`) reads it.
//!
//! Two things about the shape are easy to get wrong and are load-bearing:
//!
//! * **`bars` is what is played, in order.** Repeats and endings are
//!   unrolled by the importer, so bar 30 of a score with a repeat may be
//!   printed bar 12; `printed_bar` carries the number on the page, which is
//!   the only number a player recognises.
//! * **A tied continuation makes no onset.** `tie_from_previous` is the
//!   flag that keeps the schedule from expecting a pick that never happens.
//!
//! Worker W1 creates this same file on `songs-w1-scoring`; the orchestrator
//! reconciles the two. If they differ, the BRIEF is the arbiter.

use serde::{Deserialize, Serialize};

/// The one schema version this wave speaks.
pub const SCORE_SCHEMA: u32 = 1;

/// Ticks per quarter note. Fixed at 960 by the contract so that every
/// importer, every schedule and every fixture agree on what a tick is:
/// 960 divides by 2, 3, 4, 5, 6 and 8, so eighths, triplets, sixteenths,
/// quintuplets and sextuplets are all exact integers.
pub const TICKS_PER_QUARTER: u32 = 960;

/// Where a score came from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongSource {
    pub file_name: String,
    pub format: SourceFormat,
    pub track_index: u32,
    pub track_name: String,
}

/// The file formats the importer accepts. `alphatex` is alphaTab's own
/// text notation — the format an exercise or a path step is written in
/// when nobody exported it from anywhere.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceFormat {
    Gp,
    MusicXml,
    AlphaTex,
}

/// A step tempo change. Bar lines only in v1: the importer flattens a
/// gradual change to one step per bar and records that it did.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TempoChange {
    pub tick: u32,
    pub bpm: f64,
}

/// A time-signature change, keyed by played bar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeterChange {
    pub bar: u32,
    pub numerator: u8,
    pub denominator: u8,
}

/// One played bar.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreBar {
    /// Index into `SongScore::bars`, and the bar number every fix speaks in.
    pub index: u32,
    pub start_tick: u32,
    pub length_ticks: u32,
    /// The bar as it is numbered on the page. Differs from `index`
    /// wherever a repeat was unrolled.
    pub printed_bar: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section: Option<String>,
}

/// A named span of played bars — "Verse", "Solo".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreSection {
    pub name: String,
    pub start_bar: u32,
    pub end_bar: u32,
}

/// One notated note.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongNote {
    /// Index into `SongScore::notes`, stable for a given score.
    pub id: u32,
    pub tick: u32,
    pub dur_ticks: u32,
    /// String 1 is the highest-sounding string, as Guitar Pro numbers them.
    pub string: u8,
    pub fret: u8,
    pub midi: u8,
    /// A tied continuation makes no onset.
    pub tie_from_previous: bool,
    pub ghost: bool,
    pub dead: bool,
    pub accent: bool,
    pub techniques: Vec<Technique>,
}

/// Playing techniques carried on a note.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Technique {
    Hammer,
    Pull,
    Slide,
    Bend,
    Vibrato,
    PalmMute,
    Harmonic,
    Tap,
    LetRing,
}

/// A song, an exercise, or a path step — the same format for all three.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongScore {
    pub schema: u32,
    /// Stable: a hash of the source bytes plus the track.
    pub id: String,
    pub title: String,
    pub artist: String,
    pub source: SongSource,
    /// MIDI note per string, string 1 (highest) first.
    pub tuning: Vec<u8>,
    pub capo: u8,
    pub ticks_per_quarter: u32,
    /// Step changes, first at tick 0.
    pub tempo_map: Vec<TempoChange>,
    pub meter_map: Vec<MeterChange>,
    /// What is played, in order — repeats and endings unrolled.
    pub bars: Vec<ScoreBar>,
    /// Sorted by tick, then string.
    pub notes: Vec<SongNote>,
    pub sections: Vec<ScoreSection>,
}

/// One thing the player is expected to pick, derived from the score by
/// `src/songs/schedule.ts` and handed to the analyzer.
///
/// Notes sharing a tick are ONE onset. A hammer-on or pull-off is flagged
/// `soft`: it may be too quiet to detect, and must never be scored as a
/// miss when it is absent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedOnset {
    pub id: u32,
    /// Quarter notes from the start of the played range.
    pub beat: f64,
    pub note_ids: Vec<u32>,
    pub soft: bool,
    pub accent: bool,
}

/// The whole of what the player is expected to pick, for one played range.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreSchedule {
    pub onsets: Vec<ExpectedOnset>,
    pub length_beats: f64,
    pub loops: bool,
}

/// How one expected onset went, on one pass.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnsetResult {
    pub id: u32,
    pub state: OnsetState,
    /// Negative is early. `None` when there was nothing to measure.
    pub deviation_ms: Option<f64>,
    /// Times round a loop, from 0.
    pub pass: u32,
}

/// What became of an expected onset.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OnsetState {
    Hit,
    Miss,
    /// A `soft` onset that was not heard. Never counts against the player.
    SoftAbsent,
}

/// An onset that was played and is not written.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraOnset {
    pub beat: f64,
    pub pass: u32,
}
