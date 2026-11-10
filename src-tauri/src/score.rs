//! The score — one format for a song, an exercise, a path step — and
//! what came back from a pass at it.
//!
//! The first half is the Rust side of the contract in
//! `plans/tasks/songs/BRIEF.md`: the serde mirror of
//! `src/songs/types.ts`, `camelCase` on the wire, data and nothing else.
//! The importer builds it in TypeScript, the schedule is derived in
//! TypeScript, and everything on this side (`timing.rs`, `findings.rs`,
//! `srs.rs`) reads it.
//!
//! Two things about that shape are easy to get wrong and are
//! load-bearing:
//!
//! * **`bars` is what is played, in order.** Repeats and endings are
//!   unrolled by the importer, so bar 30 of a score with a repeat may be
//!   printed bar 12; `printed_bar` carries the number on the page, which is
//!   the only number a player recognises.
//! * **A tied continuation makes no onset.** `tie_from_previous` is the
//!   flag that keeps the schedule from expecting a pick that never happens.
//!
//! The second half, from `PlayedOnset` down, is roadmap 2.4 and
//! `LEARNING_PATHS_DECISIONS.md` C1 and C4: matching what was played
//! against what was written. Everything the app measured before this
//! was measured against a grid the analyzer inferred from the playing
//! itself, so a note the player did not play was a rest — nothing knew
//! a note was due. When the material is known that stops being true. A
//! note that is due and does not arrive is a *miss*; a note that
//! arrives and is not due is an *extra*; and that difference is what
//! the review after a pass has to say something about.
//!
//! Three things make it harder than "nearest note wins":
//!
//! 1. **Players drop notes and add notes.** Nearest-neighbour matching
//!    slides: drop one note in a run of sixteenths and every note after
//!    it pairs with its neighbour's slot, so one mistake is reported as
//!    twenty. The fix is sequence alignment — `align_pass` below — which
//!    is allowed to leave a slot empty rather than fill it wrongly.
//! 2. **The schedule is in beats; playing happens in time.** And the
//!    tempo inside a song steps at bar lines. So nothing here computes
//!    a time from a BPM: beat positions become times through `BeatMap`,
//!    built from where the engine's beats *actually fell*. That is the
//!    lesson written into `timing.rs` on 2026-09-04, where a dropped
//!    beat notification degraded a score nobody could explain.
//! 3. **Some notes are not expected to be audible.** A hammer-on or a
//!    pull-off may be too quiet for the detector, and scoring its
//!    absence as a miss would punish the player for good legato. Those
//!    arrive flagged `soft`; absent, they cost nothing.
//!
//! The pitch of a note is nobody's business here — timing only. Which
//! note was played waits for `pitch.rs` (LP C2, S0.5).
//!
//! What the player and the UI are told about a Take is [`TakeGrade`], and
//! `plans/revamp/GRADING_LIMITS.md` is what it has and has not been shown to
//! get right.

use serde::{Deserialize, Serialize};

use crate::instrument::ScoreWeights;
use crate::timing::{tempo_aware_window_ms, window_thresholds};

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
    /// LP C3, the half of it that is decided: whether a note the score
    /// marked accented actually came out louder than the notes around
    /// it. **Reported, never scored** — what an accent should cost is
    /// still open, and a wave that priced them before deciding would be
    /// guessing.
    ///
    /// `None` means there is nothing to say: the note carries no
    /// accent, or it was not played, or the amplitudes around it are
    /// unusable (a silent neighbourhood, a detector that gave up). The
    /// field is skipped on the wire when it is `None`, so a schedule
    /// with no accents in it serializes exactly as it did before this
    /// existed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent_heard: Option<bool>,
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

/// One expected onset's verdict, said while the player is still playing
/// (`plans/SONGS.md` A7).
///
/// The same four facts [`OnsetResult`] carries, and deliberately a type of
/// its own rather than that one: this is PROVISIONAL. It is decided from the
/// notes that had arrived by the time the onset's matching window closed, and
/// the banded alignment at the end of the attempt can still revise the last
/// bar of it — a note the player has not played yet can change which slot an
/// earlier one belongs in. The end-of-attempt `ScheduleReport` is the
/// authority and always was; this is what the page can light a note with
/// before then.
///
/// `accent_heard` is not here on purpose. An accent is measured against the
/// notes on either side of it (see [`report_accents`]), and the note after
/// has not necessarily been played when this is emitted.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveOnset {
    pub id: u32,
    /// Times round a loop, from 0 — the same axis [`OnsetResult::pass`] is on.
    pub pass: u32,
    pub state: OnsetState,
    /// Negative is early. `None` when there was nothing to measure.
    pub deviation_ms: Option<f64>,
}
/// A note the player actually made, as this module wants it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlayedOnset {
    /// Milliseconds on the same clock as the `BeatMap`.
    pub time_ms: f64,
    pub amplitude: f32,
    pub confidence: f32,
}

// ──────────────────────────────────────────────────────────────────────
// Where the beats actually fell
// ──────────────────────────────────────────────────────────────────────

/// The quarter notes of the played range, in the order the engine
/// played them, as milliseconds.
///
/// A schedule says "beat 6.5". Turning that into a time is the one
/// place a tempo map could be read — and it is deliberately not. The
/// engine's beat log is the only honest source of where a beat fell:
/// it already carries speed ramps, meter changes, a tempo step at a bar
/// line, and the drift of a real audio clock, none of which a BPM
/// multiplication carries. `timing.rs` records what happened on
/// 2026-09-04 when a `BeatNotification` went missing and the score was
/// computed from a tempo instead; this type is the shape of not doing
/// that again.
#[derive(Debug, Clone, Default)]
pub struct BeatMap {
    beats_ms: Vec<f64>,
    /// Which logged quarter each bar opened on, as the engine counted them.
    /// Empty when nobody said, which is only a fixture's beat map.
    bar_starts: Vec<usize>,
    /// How long the last bar is, in quarters. 0 until somebody says.
    beats_per_bar: u32,
}

/// What a beat map with no bars logged assumes. Only reachable from a fixture
/// or a direct caller: the live path logs the engine's own bar length.
const DEFAULT_BEATS_PER_BAR: u32 = 4;

impl BeatMap {
    /// `times_ms[i]` is when quarter note `i` of the played range fell.
    /// Beat 0 is the schedule's own origin: the count-in belongs before
    /// it and is not in here.
    pub fn from_quarter_times(times_ms: Vec<f64>) -> Self {
        Self {
            beats_ms: times_ms,
            ..Self::default()
        }
    }

    /// The same map, with bars this many quarters long.
    pub fn with_beats_per_bar(mut self, beats_per_bar: u32) -> Self {
        self.beats_per_bar = beats_per_bar;
        self
    }

    /// One more quarter note fell. The live path grows the map a beat at a
    /// time rather than rebuilding it, so `report` can be asked the same
    /// question at the end without anything having been copied.
    pub fn push_quarter(&mut self, time_ms: f64) {
        self.beats_ms.push(time_ms);
    }

    /// One more quarter note fell, in a bar `beats_per_bar` long. A bar line
    /// is where the engine's own count says it is, so a meter change lands
    /// where it happened rather than where a multiplication puts it.
    pub fn push_quarter_in_bar(&mut self, time_ms: f64, beats_per_bar: u32) {
        let index = self.beats_ms.len();
        let opens_a_bar = match self.bar_starts.last() {
            Some(&start) => index - start >= self.beats_per_bar.max(1) as usize,
            None => true,
        };
        if opens_a_bar {
            self.bar_starts.push(index);
            self.beats_per_bar = beats_per_bar.max(1);
        }
        self.beats_ms.push(time_ms);
    }

    /// Which played bar a beat falls in, from 0. Before the first beat is the
    /// first bar: a note a hair early belongs to the bar it was aiming at.
    pub fn bar_at_beat(&self, beat: f64) -> u32 {
        let beat = beat.max(0.0);
        let per_bar = if self.beats_per_bar > 0 {
            self.beats_per_bar
        } else {
            DEFAULT_BEATS_PER_BAR
        } as f64;
        let Some(&last_start) = self.bar_starts.last() else {
            return (beat / per_bar).floor() as u32;
        };
        let logged = self.bar_starts.partition_point(|&s| (s as f64) <= beat);
        let bar = logged.saturating_sub(1) as u32;
        // Past the last bar the log knows about, its length carries on, just
        // as the last logged interval does in `time_at_beat`.
        if beat >= last_start as f64 + per_bar {
            bar + ((beat - last_start as f64) / per_bar).floor() as u32
        } else {
            bar
        }
    }

    /// Bars the transport finished: those whose next downbeat was logged, so
    /// that every note in them was reached. The bar the Take stopped in is not
    /// one of them.
    pub fn finished_bars(&self) -> u32 {
        if self.bar_starts.is_empty() {
            let per_bar = if self.beats_per_bar > 0 {
                self.beats_per_bar
            } else {
                DEFAULT_BEATS_PER_BAR
            } as usize;
            // Quarter `i` is logged for every `i < len`; a bar of `per_bar`
            // starting at `s` is finished once quarter `s + per_bar` is.
            return (self.beats_ms.len().saturating_sub(1) / per_bar) as u32;
        }
        // Every bar but the last has had its successor's downbeat logged: that
        // downbeat is what opened the successor.
        (self.bar_starts.len() - 1) as u32
    }

    pub fn len(&self) -> usize {
        self.beats_ms.len()
    }

    pub fn is_empty(&self) -> bool {
        self.beats_ms.is_empty()
    }

    /// The interval around beat `i`, in ms. Used for the tempo-aware
    /// matching window, which is why it has to be local: a window
    /// computed from the schedule's opening tempo is the wrong size
    /// after a step at bar 9.
    pub fn interval_ms_at(&self, beat: f64) -> f64 {
        if self.beats_ms.len() < 2 {
            return 500.0;
        }
        let i = (beat.floor().max(0.0) as usize).min(self.beats_ms.len() - 2);
        (self.beats_ms[i + 1] - self.beats_ms[i]).max(1.0)
    }

    /// When beat `beat` falls, in ms. Linear between logged quarters;
    /// past the end, the last logged interval carries on, so a schedule
    /// that outruns its beat log degrades rather than truncates.
    pub fn time_at_beat(&self, beat: f64) -> Option<f64> {
        if self.beats_ms.is_empty() || beat < 0.0 {
            return None;
        }
        let last = self.beats_ms.len() - 1;
        let i = beat.floor() as usize;
        let frac = beat - beat.floor();
        if i >= last {
            let interval = self.interval_ms_at(last as f64);
            return Some(self.beats_ms[last] + ((i - last) as f64 + frac) * interval);
        }
        Some(self.beats_ms[i] + frac * (self.beats_ms[i + 1] - self.beats_ms[i]))
    }

    /// The inverse: which beat a moment in time sits on. Before beat 0
    /// this returns a negative beat rather than `None`, because "the
    /// player came in early" is a thing the review has to be able to
    /// say.
    pub fn beat_at_time(&self, time_ms: f64) -> Option<f64> {
        if self.beats_ms.is_empty() {
            return None;
        }
        let last = self.beats_ms.len() - 1;
        if time_ms < self.beats_ms[0] {
            let interval = self.interval_ms_at(0.0);
            return Some((time_ms - self.beats_ms[0]) / interval);
        }
        if time_ms >= self.beats_ms[last] {
            let interval = self.interval_ms_at(last as f64);
            return Some(last as f64 + (time_ms - self.beats_ms[last]) / interval);
        }
        // Logged beats are sorted, so a binary search finds the pair.
        let mut lo = 0usize;
        let mut hi = last;
        while hi - lo > 1 {
            let mid = (lo + hi) / 2;
            if self.beats_ms[mid] <= time_ms {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        let span = (self.beats_ms[hi] - self.beats_ms[lo]).max(1e-9);
        Some(lo as f64 + (time_ms - self.beats_ms[lo]) / span)
    }
}

// ──────────────────────────────────────────────────────────────────────
// Alignment
// ──────────────────────────────────────────────────────────────────────

/// Cost of leaving an expected onset unplayed. Soft onsets pay
/// `SOFT_SKIP_COST` instead.
const MISS_COST: f64 = 1.0;
/// Cost of a played note the score never asked for.
const EXTRA_COST: f64 = 1.0;
/// What an absent soft onset costs. Nothing, by decision: a hammer-on
/// the detector could not hear is not a mistake.
const SOFT_SKIP_COST: f64 = 0.0;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Step {
    /// Expected `i` paired with played `j`.
    Match,
    /// Expected `i` left unplayed.
    SkipExpected,
    /// Played `j` left unaccounted for.
    SkipPlayed,
    /// Nothing before this.
    Start,
}

/// Align one pass of a schedule against what was played.
///
/// Needleman–Wunsch, banded by the matching window: a played note may
/// only pair with an expected onset it is physically close to, which
/// bounds the width of each row to the handful of notes inside that
/// window and keeps the whole thing linear in the number of onsets. The
/// band is the only approximation, and it is not one that matters —
/// a pairing outside the window scores worse than two gaps, so the full
/// table would never choose it.
///
/// Why alignment rather than nearest-neighbour: a player who drops one
/// note in a run of sixteenths shifts every note after it by one slot.
/// Nearest-neighbour reports twenty mistakes for one. Alignment is
/// allowed to leave a slot empty, so it reports one.
///
/// `window_ms_at` is asked for the tolerance around each expected
/// onset, so a tempo step inside the pass moves the window with it.
pub fn align_pass(
    expected: &[ExpectedOnset],
    expected_times_ms: &[f64],
    played: &[PlayedOnset],
    window_ms_at: &dyn Fn(usize) -> f64,
    pass: u32,
    beat_of_time: &dyn Fn(f64) -> f64,
) -> (Vec<OnsetResult>, Vec<ExtraOnset>) {
    debug_assert_eq!(expected.len(), expected_times_ms.len());
    let m = expected.len();
    let n = played.len();

    if m == 0 {
        // Nothing was due; everything played is an extra.
        return (
            Vec::new(),
            played
                .iter()
                .map(|p| ExtraOnset {
                    beat: beat_of_time(p.time_ms),
                    pass,
                })
                .collect(),
        );
    }

    // ── The band ────────────────────────────────────────────────────
    // For each expected onset, the played notes close enough to be a
    // candidate. Both bounds are non-decreasing because both sequences
    // are sorted, which is what makes the sweep linear.
    let mut lo = vec![0usize; m];
    let mut hi = vec![0usize; m]; // exclusive
    {
        let mut l = 0usize;
        let mut h = 0usize;
        for i in 0..m {
            let w = window_ms_at(i);
            let t = expected_times_ms[i];
            while l < n && played[l].time_ms < t - w {
                l += 1;
            }
            if h < l {
                h = l;
            }
            while h < n && played[h].time_ms <= t + w {
                h += 1;
            }
            lo[i] = l;
            hi[i] = h;
        }
    }

    // Columns each row visits. A row has to reach further right than
    // its own window: the notes between this expected onset's window
    // and the next one's are extras, and the path consumes them by
    // walking across row `i` before it drops to row `i+1`. Stopping at
    // `hi[i]` leaves the next row's first cell with no predecessor, and
    // a legitimate hit then gets reported as a miss plus an extra —
    // which is the failure mode this whole module exists to avoid.
    // Row `m-1` is forced out to `n` so the final cell exists whatever
    // the last window caught.
    let mut col_lo = vec![0usize; m];
    let mut col_hi = vec![0usize; m]; // inclusive
    for i in 0..m {
        let reach = if i + 1 < m { lo[i + 1] } else { n };
        col_lo[i] = lo[i];
        col_hi[i] = hi[i].max(reach).max(lo[i]);
    }

    // ── The sweep ───────────────────────────────────────────────────
    // `row_above` is the virtual row before any expected onset: `j`
    // played notes consumed, all of them extras.
    let above: Vec<f64> = (0..=n).map(|j| -(j as f64) * EXTRA_COST).collect();
    let mut rows: Vec<Vec<(f64, Step)>> = Vec::with_capacity(m);

    for i in 0..m {
        let width = col_hi[i] - col_lo[i] + 1;
        let mut row = vec![(f64::NEG_INFINITY, Step::Start); width];
        let skip_expected_cost = if expected[i].soft {
            SOFT_SKIP_COST
        } else {
            MISS_COST
        };
        let w = window_ms_at(i);
        for j in col_lo[i]..=col_hi[i] {
            let idx = j - col_lo[i];
            let mut best = f64::NEG_INFINITY;
            let mut step = Step::Start;

            // Leave expected `i` unplayed.
            let up = if i == 0 {
                Some(above[j])
            } else {
                cell(&rows[i - 1], col_lo[i - 1], col_hi[i - 1], j)
            };
            if let Some(v) = up {
                let cand = v - skip_expected_cost;
                if cand > best {
                    best = cand;
                    step = Step::SkipExpected;
                }
            }

            // Leave played `j-1` unaccounted for.
            if j > col_lo[i] {
                let v = row[idx - 1].0;
                if v.is_finite() {
                    let cand = v - EXTRA_COST;
                    if cand > best {
                        best = cand;
                        step = Step::SkipPlayed;
                    }
                }
            }

            // Pair expected `i` with played `j-1`.
            if j > 0 {
                let dev = played[j - 1].time_ms - expected_times_ms[i];
                if dev.abs() <= w {
                    let diag = if i == 0 {
                        Some(above[j - 1])
                    } else {
                        cell(&rows[i - 1], col_lo[i - 1], col_hi[i - 1], j - 1)
                    };
                    if let Some(v) = diag {
                        // A pairing at the very edge of the window is
                        // worth nothing, which is exactly the point
                        // where two gaps become the better answer.
                        let reward = 1.0 - (dev.abs() / w.max(1e-9));
                        let cand = v + reward;
                        if cand > best {
                            best = cand;
                            step = Step::Match;
                        }
                    }
                }
            }

            row[idx] = (best, step);
        }
        rows.push(row);
    }

    // ── Read the path back ──────────────────────────────────────────
    let mut results: Vec<OnsetResult> = Vec::with_capacity(m);
    // How loud each result's note actually was, in step with `results`.
    // `None` where nothing was played.
    let mut heard_amplitude: Vec<Option<f32>> = Vec::with_capacity(m);
    let mut extras: Vec<ExtraOnset> = Vec::new();
    let mut i = m; // one past the last expected onset
    let mut j = n;
    while i > 0 {
        let r = i - 1;
        let (_, step) = match cell_pair(&rows[r], col_lo[r], col_hi[r], j) {
            Some(c) => c,
            None => {
                // Unreachable in a well-formed band; fail soft rather
                // than panicking on a live analysis thread.
                break;
            }
        };
        match step {
            Step::Match => {
                let dev = played[j - 1].time_ms - expected_times_ms[r];
                results.push(OnsetResult {
                    id: expected[r].id,
                    state: OnsetState::Hit,
                    deviation_ms: Some(dev),
                    pass,
                    accent_heard: None,
                });
                // The alignment is the only place that knows WHICH
                // played note a result came from — after this the pairing
                // is gone and anything downstream has to guess it back
                // from a time. The amplitude is taken here for that
                // reason; what it means is decided below.
                heard_amplitude.push(Some(played[j - 1].amplitude));
                i -= 1;
                j -= 1;
            }
            Step::SkipExpected | Step::Start => {
                results.push(OnsetResult {
                    id: expected[r].id,
                    state: if expected[r].soft {
                        OnsetState::SoftAbsent
                    } else {
                        OnsetState::Miss
                    },
                    deviation_ms: None,
                    pass,
                    accent_heard: None,
                });
                heard_amplitude.push(None);
                i -= 1;
            }
            Step::SkipPlayed => {
                extras.push(ExtraOnset {
                    beat: beat_of_time(played[j - 1].time_ms),
                    pass,
                });
                j -= 1;
            }
        }
    }
    // Anything still unconsumed arrived before the first expected
    // onset. Those are extras too.
    while j > 0 {
        extras.push(ExtraOnset {
            beat: beat_of_time(played[j - 1].time_ms),
            pass,
        });
        j -= 1;
    }

    results.reverse();
    heard_amplitude.reverse();
    extras.reverse();
    report_accents(expected, &mut results, &heard_amplitude);
    (results, extras)
}

/// How much louder than its neighbours a note has to be before anybody
/// would call it an accent.
///
/// Deliberately low. This is a report, not a judgement: the question it
/// answers is "did the player put something there", and a guitarist
/// digging in for an accent inside a run of sixteenths is a long way
/// from doubling the amplitude of the pick attack. Raising it would
/// quietly turn a report into an opinion, which is what LP C3 has not
/// decided yet.
const ACCENT_LOUDER_BY: f32 = 1.15;

/// LP C3 — say, per note, whether a written accent was actually played
/// louder than the notes around it.
///
/// The comparison is local on purpose. A piece gets louder and quieter
/// as it goes; an accent is a thing done to the notes beside it, not to
/// the piece. So each accented note is measured against its immediate
/// neighbours in the same pass — the note before and the note after —
/// and a note whose neighbours were not played, or were silent, gets no
/// verdict rather than a guessed one.
///
/// Nothing here is scored. The verdict rides beside the result and the
/// review decides what to say about it.
fn report_accents(
    expected: &[ExpectedOnset],
    results: &mut [OnsetResult],
    heard_amplitude: &[Option<f32>],
) {
    for k in 0..results.len() {
        // `results` is in `expected` order — the backtrack walks the
        // path and the reverse above puts it back — so the accent flag
        // is `expected[k]`'s. Guarded anyway: a malformed band can end
        // the walk early and leave the two out of step, and a silently
        // shifted accent flag is worse than no report at all.
        let Some(exp) = expected.get(k).filter(|e| e.id == results[k].id) else {
            continue;
        };
        if !exp.accent || results[k].state != OnsetState::Hit {
            continue;
        }
        let Some(amp) = heard_amplitude.get(k).copied().flatten() else {
            continue;
        };
        if !amp.is_finite() || amp <= 0.0 {
            continue;
        }
        let mut neighbours: Vec<f32> = Vec::with_capacity(2);
        for n in [k.checked_sub(1), k.checked_add(1)].into_iter().flatten() {
            // A neighbour that is itself written as an accent says
            // nothing about this one — two accents in a row are not
            // each other's baseline.
            if expected.get(n).is_none_or(|e| e.accent) {
                continue;
            }
            if let Some(a) = heard_amplitude.get(n).copied().flatten() {
                if a.is_finite() && a > 0.0 {
                    neighbours.push(a);
                }
            }
        }
        if neighbours.is_empty() {
            continue;
        }
        let baseline = neighbours.iter().sum::<f32>() / neighbours.len() as f32;
        if baseline <= 0.0 {
            continue;
        }
        results[k].accent_heard = Some(amp >= baseline * ACCENT_LOUDER_BY);
    }
}

fn cell(row: &[(f64, Step)], lo: usize, hi: usize, j: usize) -> Option<f64> {
    cell_pair(row, lo, hi, j).map(|(v, _)| v)
}

fn cell_pair(row: &[(f64, Step)], lo: usize, hi: usize, j: usize) -> Option<(f64, Step)> {
    if j < lo || j > hi {
        return None;
    }
    let c = row[j - lo];
    if c.0.is_finite() {
        Some(c)
    } else {
        None
    }
}

// ──────────────────────────────────────────────────────────────────────
// Scoring a whole attempt
// ──────────────────────────────────────────────────────────────────────

/// What a pass (or a whole attempt) came to.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleReport {
    pub results: Vec<OnsetResult>,
    pub extras: Vec<ExtraOnset>,
    /// 0–100, the same shape of number the grid-based score produces so
    /// a player never has to learn two scales.
    pub score: f32,
    pub interval_consistency: f32,
    pub grid_alignment: f32,
    pub hit_completeness: f32,
    pub onset_efficiency: f32,
    /// How often an onset the score marked accented was actually
    /// louder than its neighbours, when there was enough signal to
    /// tell. Reported, not scored, in this wave (LP C3 is still open).
    pub accent_agreement: Option<f32>,
    /// How many times round the loop the player got.
    pub passes: u32,
    /// What to tell the player about this Take. See [`TakeGrade`].
    ///
    /// Not part of this report's own wire shape: Songs' goldens
    /// (`tests/highbpm_fixtures`) pin that shape byte for byte, and the grade
    /// reaches the screen on `PracticeSegmentEnded::take_grade` instead.
    #[serde(skip)]
    pub grade: TakeGrade,
}

/// Whether a Take gave enough to grade.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TakeVerdict {
    Graded,
    /// Too little was heard, or too unreliably, to say anything about the
    /// playing. It is not a low mark: it may be the rig, and the honest thing
    /// to say is "I didn't catch enough". See [`didnt_catch_enough`].
    #[default]
    DidntCatchEnough,
}

/// Why [`TakeVerdict::DidntCatchEnough`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NoCatchReason {
    /// Nothing was heard at all.
    NothingHeard,
    /// Under [`MIN_HEARD_RATIO`] of the notes that were due were heard.
    TooFewHeard,
    /// More unwritten onsets than written ones: this is not a recording of
    /// the Exercise, or the detector is hearing something else.
    TooManyExtras,
    /// The detector itself was unsure, on average, of what it reported.
    LowConfidence,
}

/// Where the number that removed the system's lag came from.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CalibrationSource {
    /// None applied: the clock was taken as given, or there was too little to
    /// measure and nothing remembered.
    #[default]
    None,
    /// The `(instrument, device)` offset from `calibration_cache`. A lean is
    /// measurable against it, because it was learned in other sessions.
    Cached,
    /// This Take's own median, because nothing was remembered or what was
    /// remembered is no longer believable. A lean cannot be told from lag.
    Take,
}

/// How a Take's clock was corrected. See [`CalibrationPolicy`] for the
/// trade-off this is the result of.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TakeCalibration {
    /// What the reported deviations are measured from, ms. Positive means the
    /// detector's clock runs behind the beat map's.
    pub offset_ms: f64,
    pub source: CalibrationSource,
    /// How far behind (positive) or ahead of `offset_ms` the player sat, in
    /// ms. `None` unless `source` is `Cached`: without a reference from
    /// another session, a lean and a lag are the same number.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lean_ms: Option<f64>,
}

/// One played bar of a Take. Bars count from 0, in played order, and a loop
/// keeps counting rather than starting again.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BarMetrics {
    pub bar: u32,
    /// Notes the score asked for that were reached. Absent soft notes leave.
    pub due: u32,
    pub heard: u32,
    pub missed: u32,
    pub extra: u32,
    /// [`evenness`] over this bar's own notes. `None` under three heard.
    pub evenness: Option<f32>,
    pub evenness_sigma_ms: Option<f64>,
}

/// What Mechanics reads about one Take, and what the coach may state.
///
/// **A stable shape.** Add to it; do not rename what is here. Everything on it
/// comes from the Exercise's known schedule and from no opinion.
///
/// `score` and `evenness` are `None` on [`TakeVerdict::DidntCatchEnough`], so
/// a screen cannot show a number by accident. The counts are always there:
/// they are facts, and "I heard 19 of 128" is the useful thing to say.
///
/// The default is a Take nothing was heard on, and exists only so that a
/// stored [`ScheduleReport`], which does not carry its grade, can be read back.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TakeGrade {
    pub verdict: TakeVerdict,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub no_catch_reason: Option<NoCatchReason>,
    /// 0–100, the timing of what was heard scaled by how much of the Exercise
    /// was heard. See [`known_score_number`].
    pub score: Option<f32>,
    /// 0–1. See [`evenness`] for the definition and what 0.85 means in ms.
    pub evenness: Option<f32>,
    pub evenness_sigma_ms: Option<f64>,
    /// Notes the score asked for that the transport reached. Absent soft notes
    /// are not due. Notes past where the transport stopped are `not_reached`.
    pub due: u32,
    pub heard: u32,
    pub missed: u32,
    pub extra: u32,
    /// Written notes the Take never got to, because the transport stopped.
    pub not_reached: u32,
    /// `heard / due`, 0–1.
    pub heard_ratio: f32,
    /// The detector's median confidence over the Take. `None` if it heard
    /// nothing.
    pub confidence: Option<f32>,
    pub calibration: TakeCalibration,
    pub bars: Vec<BarMetrics>,
    /// The tempo the Take was played at: the median quarter of the beat map.
    /// What a clean tempo is recorded as.
    pub bpm: f64,
    /// The Exercise's pass bars applied to this Take. `None` when no pass bars
    /// were loaded with the schedule, which is every Song. See [`pass`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pass: Option<PassResult>,
}

/// Under this share of the notes due, the Take says "I didn't catch enough"
/// rather than a number. A player really leaving out half the notes reads the
/// same as a rig the detector cannot hear, and only one of those is theirs.
pub const MIN_HEARD_RATIO: f32 = 0.5;

/// Under this median detector confidence, likewise. Every synthetic tone in
/// `tests/audio_fixtures` at a sane input level sits well above it, including
/// high gain over a noisy floor; `plans/revamp/GRADING_LIMITS.md` has the
/// measured values. A design value until a real rig has been through it.
pub const MIN_MEDIAN_CONFIDENCE: f32 = 0.15;

/// Fewer heard notes than this tells nothing about the spread of them.
const MIN_NOTES_FOR_EVENNESS: usize = 3;

/// The rule, in one place: can anything be said about this Take?
///
/// In order, because the first that holds is the most useful thing to say:
/// nothing heard; under [`MIN_HEARD_RATIO`] heard; more extras than hits; or
/// a detector that was not sure ([`MIN_MEDIAN_CONFIDENCE`]). A Take none of
/// those apply to gets a number. `None` means graded.
pub fn didnt_catch_enough(
    due: u32,
    heard: u32,
    extra: u32,
    confidence: Option<f32>,
) -> Option<NoCatchReason> {
    if heard == 0 {
        return Some(NoCatchReason::NothingHeard);
    }
    if due == 0 || (heard as f32 / due as f32) < MIN_HEARD_RATIO {
        return Some(NoCatchReason::TooFewHeard);
    }
    if extra > heard {
        return Some(NoCatchReason::TooManyExtras);
    }
    if confidence.is_some_and(|c| c < MIN_MEDIAN_CONFIDENCE) {
        return Some(NoCatchReason::LowConfidence);
    }
    None
}

/// Evenness, and the spread of timing it came from.
///
/// `exp(-σ² / 2k²)`, where:
///
/// * `σ` is the spread of the note deviations around their own median: the
///   median absolute deviation × 1.4826, so one wild note does not decide it.
///   A constant offset, whether lag or lean, has no effect on it at all.
/// * `k` is half the matching window for the smallest gap the score asks for,
///   so 0.2 × that gap for anything up to a 200 ms gap, where the 80 ms cap on
///   the window takes over.
///
/// So "85% even" is `σ = 0.57 k`, which for straight sixteenths is:
///
/// | BPM | gap | k | σ at 85% |
/// |---|---|---|---|
/// | 80 | 187.5 ms | 37.5 ms | 21 ms |
/// | 120 | 125 ms | 25 ms | 14 ms |
/// | 160 | 93.75 ms | 18.75 ms | 11 ms |
///
/// It is a tolerance that tightens with the tempo. It is not a percentage of
/// notes that were even, and no screen should word it as one.
pub fn evenness(deviations_ms: &[f64], smallest_gap_ms: f64) -> Option<(f32, f64)> {
    if deviations_ms.len() < MIN_NOTES_FOR_EVENNESS {
        return None;
    }
    let mut sorted = deviations_ms.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let med = median(&sorted);
    let mut devs: Vec<f64> = sorted.iter().map(|d| (d - med).abs()).collect();
    devs.sort_by(|a, b| a.total_cmp(b));
    // MAD → σ, the same estimator `score_segment` uses, for the
    // same reason: one wild note should not decide the number.
    let sigma = median(&devs) * 1.4826;
    let k = (tempo_aware_window_ms(smallest_gap_ms) * 0.5).max(1.0);
    Some(((-sigma * sigma / (2.0 * k * k)).exp() as f32, sigma))
}

/// How a Take's clock gets corrected for the system's constant lag.
///
/// The detector stamps a note after it has heard it, and between a string and
/// that stamp are the peak picker's look-ahead, the driver's input buffer and
/// the converter: 25 to 60 ms on an ordinary rig, nothing to do with the
/// player, and more than half a sixteenth's matching window at speed. Taken as
/// given it reads as everything late, and past the window as everything missed
/// (70 of 128 at 120 BPM with 50 ms). So two different things are done with
/// two different numbers:
///
/// * **Matching** always uses this Take's own measured lag. Which written note
///   a played one answers is not a judgement, it is bookkeeping, and no plausible
///   lag or lean should change it. Heard, missed, extra and evenness therefore
///   do not move with a constant offset of either kind.
/// * **Scoring** (`deviation_ms`, grid alignment, `lean_ms`) measures from the
///   `calibration_cache` offset for this `(instrument, device)` when there is
///   one, because that was learned in other sessions and a lean shows against
///   it. Without one it can only be this Take's own median, clamped to the
///   range a system lag can be ([`SYSTEM_LAG_RANGE_MS`]).
///
/// **The trade-off, stated.** One Take cannot tell a player who sits 20 ms
/// behind from a rig that is 20 ms slower. On a first run with an empty cache
/// that lean is absorbed, and the result says so by reporting no `lean_ms`;
/// grid alignment is then a statement about steadiness, not about the click. A
/// lean is only reported against a reference, and the reference itself holds
/// the player's habitual offset from when it was learned, so `lean_ms` means
/// "further from the click than you usually are". It was the honest choice
/// against the two alternatives: subtracting nothing marks a rig as a player,
/// and a fixed nominal lag does so by a smaller amount for no better reason.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CalibrationPolicy {
    /// Take the detector's clock as given. Fixtures, and `match_attempt`.
    Off,
    /// Measure and remove the system's lag, as above.
    Auto {
        /// The cached `(instrument, device)` offset, ms.
        seed_ms: Option<f64>,
    },
}

/// Where the lag search looks, ms. Wider than any rig on the low side so that
/// a player rushing is still found, and past a Bluetooth output on the high.
const LAG_SEARCH_MS: (i32, i32) = (-40, 160);
const LAG_SEARCH_STEP_MS: usize = 2;
/// What a system lag can plausibly be. Past this a constant offset is the
/// player's, and with no reference it stays visible in the deviations.
pub const SYSTEM_LAG_RANGE_MS: (f64, f64) = (0.0, 120.0);
/// Where to start believing when the notes alone cannot pick: a periodic run
/// fits equally well a whole note earlier or later. Roughly the detector's own
/// lag plus one input buffer, measured in `tests/audio_fixtures`.
const NOMINAL_LAG_MS: f64 = 30.0;
/// A Take this far from the cached offset has moved rig, or the cache is
/// stale. Reporting that gap as the player's lean would be inventing a fact,
/// so the seed is set aside and `lean_ms` says nothing.
const SEED_TRUST_MS: f64 = 40.0;
/// How few notes a lag can be read off.
const MIN_NOTES_FOR_LAG: usize = 8;

/// The constant lag between what was written and what was played, ms.
///
/// Slides the played notes over the written ones and takes the offset that
/// lines up the most of them, then the median of what is left. It does not
/// assume a matching window, because a lag past the window is the failure it
/// is here for. `None` when there are too few notes to tell. Both lists must
/// be sorted.
pub fn estimate_constant_lag_ms(
    expected_ms: &[f64],
    played_ms: &[f64],
    smallest_gap_ms: f64,
    prior_ms: f64,
) -> Option<f64> {
    if expected_ms.is_empty() || played_ms.len() < MIN_NOTES_FOR_LAG {
        return None;
    }
    // Nearest written note to `t`, moving a hint forward through both sorted
    // lists so that each offset is one pass over the notes.
    fn nearest(expected: &[f64], hint: &mut usize, t: f64) -> f64 {
        while *hint + 1 < expected.len()
            && (expected[*hint + 1] - t).abs() <= (expected[*hint] - t).abs()
        {
            *hint += 1;
        }
        t - expected[*hint]
    }

    let tol = (smallest_gap_ms * 0.2).clamp(6.0, 15.0);
    let fit_at = |offset: f64| -> f64 {
        let mut hint = 0usize;
        played_ms
            .iter()
            .map(|p| {
                let d = nearest(expected_ms, &mut hint, p - offset).abs();
                (1.0 - d / tol).max(0.0)
            })
            .sum()
    };
    let candidates = (LAG_SEARCH_MS.0..=LAG_SEARCH_MS.1).step_by(LAG_SEARCH_STEP_MS);
    let fits: Vec<(f64, f64)> = candidates.map(|c| (c as f64, fit_at(c as f64))).collect();
    let best = fits.iter().map(|&(_, f)| f).fold(0.0, f64::max);
    // A periodic run fits the same a whole gap away, except for the note at
    // the end that then answers to nothing. Half of what an average note adds
    // to the fit is what separates those (an absolute half a note is too
    // much: a note seldom lands dead on, so the one at the end is worth less
    // than one); among what is left, the prior decides.
    let per_note = best / played_ms.len() as f64;
    let coarse = fits
        .iter()
        .filter(|&&(_, f)| f >= best - 0.5 * per_note)
        .min_by(|a, b| (a.0 - prior_ms).abs().total_cmp(&(b.0 - prior_ms).abs()))
        .map(|&(c, _)| c)?;

    let reach = (smallest_gap_ms * 0.4).max(tol);
    let mut hint = 0usize;
    let mut residuals: Vec<f64> = played_ms
        .iter()
        .map(|p| nearest(expected_ms, &mut hint, p - coarse))
        .filter(|d| d.abs() <= reach)
        .collect();
    if residuals.len() < MIN_NOTES_FOR_LAG {
        return None;
    }
    residuals.sort_by(|a, b| a.total_cmp(b));
    Some(coarse + median(&residuals))
}

/// Match a whole attempt — every pass — and score it.
///
/// `played` is everything the detector heard during the attempt, on the
/// beat map's clock. Notes before beat 0 are dropped rather than
/// reported: that is the count-in, and the player is allowed to use it
/// (LP C4). A loop restarts the schedule and never the score, so
/// results and extras accumulate across passes with `pass` recorded on
/// each.
///
/// This takes the clock as given. The live path goes through
/// [`match_attempt_calibrated`] with [`CalibrationPolicy::Auto`].
pub fn match_attempt(
    schedule: &ScoreSchedule,
    beats: &BeatMap,
    played: &[PlayedOnset],
    weights: &ScoreWeights,
) -> ScheduleReport {
    match_attempt_calibrated(schedule, beats, played, weights, CalibrationPolicy::Off, &[])
}

/// [`match_attempt`], with the system's constant lag dealt with as `policy`
/// says, and the grade judged against an Exercise's `pass_bars` (none for a
/// Song).
pub fn match_attempt_calibrated(
    schedule: &ScoreSchedule,
    beats: &BeatMap,
    played: &[PlayedOnset],
    weights: &ScoreWeights,
    policy: CalibrationPolicy,
    pass_bars: &[PassBar],
) -> ScheduleReport {
    let (matching_ms, mut calibration) = resolve_calibration(schedule, beats, played, policy);
    // Everything below sees the notes as if there were no lag. `played` is on
    // the beat map's clock except for that one number.
    let calibrated: Vec<PlayedOnset> = played
        .iter()
        .map(|p| PlayedOnset {
            time_ms: p.time_ms - matching_ms,
            ..*p
        })
        .collect();
    let played = &calibrated[..];
    let length = pass_length(schedule);

    // How many times round. Without a loop there is exactly one pass,
    // however long the player carried on for.
    let last_beat = played
        .last()
        .and_then(|p| beats.beat_at_time(p.time_ms))
        .unwrap_or(0.0);
    let passes = if schedule.loops {
        ((last_beat / length).floor() as i64 + 1).clamp(1, 4096) as u32
    } else {
        1
    };

    let mut results: Vec<OnsetResult> = Vec::new();
    let mut extras: Vec<ExtraOnset> = Vec::new();

    for pass in 0..passes {
        let origin = pass as f64 * length;
        // The expected onsets of this pass, in absolute beats. A loop
        // takes the notes inside its own length and no others — a note
        // at exactly `length` is the next pass's first note. Without a
        // loop there is no wrapping to do and every note counts,
        // including one an importer put past the length it declared:
        // a schedule that silently dropped notes would be scored
        // against material the player can see on the page, which is
        // the worst kind of wrong answer to give them.
        let expected: Vec<ExpectedOnset> = schedule
            .onsets
            .iter()
            .filter(|o| o.beat >= 0.0 && (!schedule.loops || o.beat < length))
            .cloned()
            .collect();
        let times: Vec<f64> = expected
            .iter()
            .filter_map(|o| beats.time_at_beat(origin + o.beat))
            .collect();
        if times.len() != expected.len() {
            // The beat log does not reach this pass. Nothing honest to
            // say about it, so say nothing rather than inventing times
            // from a tempo.
            break;
        }

        // The window each expected onset gets, from the tempo where it
        // actually is. Same tempo-aware rule the grid matcher uses, so
        // a note is judged the same way whether or not a score is
        // loaded.
        let windows: Vec<f64> = expected
            .iter()
            .map(|o| {
                let quarter = beats.interval_ms_at(origin + o.beat);
                let sub = smallest_gap_beats(&schedule.onsets).unwrap_or(1.0);
                tempo_aware_window_ms(quarter * sub)
            })
            .collect();

        // The notes that belong to this pass: from just before its
        // first beat up to just before the next pass's. "Just before"
        // is one matching window, because a player who comes in six
        // milliseconds early has not played a count-in note — and on
        // pass 0 anything earlier than that IS the count-in, which is
        // dropped rather than reported (LP C4).
        let lead = windows.first().copied().unwrap_or(0.0);
        let pass_start = beats
            .time_at_beat(origin)
            .map(|t| t - lead)
            .unwrap_or(f64::MIN);
        let pass_end = if pass + 1 < passes {
            beats
                .time_at_beat(origin + length)
                .map(|t| t - lead)
                .unwrap_or(f64::MAX)
        } else {
            f64::MAX
        };
        let window: Vec<PlayedOnset> = played
            .iter()
            .copied()
            .filter(|p| p.time_ms >= pass_start && p.time_ms < pass_end)
            .collect();

        let (mut r, mut e) = align_pass(
            &expected,
            &times,
            &window,
            &|i| windows[i],
            pass,
            &|t| beats.beat_at_time(t).unwrap_or(0.0) - origin,
        );
        results.append(&mut r);
        extras.append(&mut e);
    }

    let accent_agreement = accent_agreement(schedule, &results, played, beats);
    // The same lookup, kept per note for the pass bars' per-window accents.
    // Only when there is an accent to judge: it is a search per hit.
    let amplitudes = if schedule.onsets.iter().any(|o| o.accent) && !pass_bars.is_empty() {
        hit_amplitudes(schedule, &results, played, beats)
    } else {
        Vec::new()
    };

    // Matching is done. What gets reported is measured from the scoring
    // offset, which is where a lean shows (see `CalibrationPolicy`).
    let scoring_shift = matching_ms - calibration.offset_ms;
    if scoring_shift != 0.0 {
        for r in results.iter_mut() {
            if let Some(d) = r.deviation_ms.as_mut() {
                *d += scoring_shift;
            }
        }
    }
    if calibration.source == CalibrationSource::Cached {
        let mut devs: Vec<f64> = results.iter().filter_map(|r| r.deviation_ms).collect();
        devs.sort_by(|a, b| a.total_cmp(b));
        calibration.lean_ms = (devs.len() >= MIN_NOTES_FOR_LAG).then(|| median(&devs));
    }

    // The tempo the deviations are judged against. The median of the
    // quarters actually played, so a song that steps tempo is judged
    // around where it mostly sat rather than around where it opened,
    // and a 180 BPM piece is not marked on a 120 BPM tolerance.
    let quarter_ms = median_interval_ms(beats);
    let tally = Tally::of(schedule, beats, &results, &extras);
    let (ic, ga) = timing_components(schedule, &results, quarter_ms);

    // The report's own number is the one Songs has always shown, and its
    // goldens pin it: completeness over every written note, efficiency over
    // every extra, the instrument's weights as they are.
    let hits = results.iter().filter(|r| r.deviation_ms.is_some()).count() as u32;
    let due = results
        .iter()
        .filter(|r| r.state != OnsetState::SoftAbsent)
        .count() as u32;
    let hc = ratio(hits, due);
    let oe = ratio(hits, hits + extras.len() as u32);
    let score = (ic * weights.ic + ga * weights.ga + hc * weights.hc + oe * weights.oe) * 100.0;

    // The grade's number: what was heard of what the Take reached, priced as
    // `known_score_number` says.
    let grade_score = known_score_number(
        ic,
        ga,
        ratio(tally.heard, tally.due),
        ratio(tally.heard, tally.heard + tally.extra),
        weights,
    );
    let grade = grade_take(
        GradeInputs {
            schedule,
            beats,
            results: &results,
            extras: &extras,
            tally: &tally,
            played,
            amplitudes: &amplitudes,
            pass_bars,
        },
        grade_score,
        calibration,
    );

    ScheduleReport {
        results,
        extras,
        score,
        interval_consistency: ic,
        grid_alignment: ga,
        hit_completeness: hc,
        onset_efficiency: oe,
        accent_agreement,
        passes,
        grade,
    }
}

/// The offset to match with, and what the report will say it scored from.
fn resolve_calibration(
    schedule: &ScoreSchedule,
    beats: &BeatMap,
    played: &[PlayedOnset],
    policy: CalibrationPolicy,
) -> (f64, TakeCalibration) {
    let CalibrationPolicy::Auto { seed_ms } = policy else {
        let none = TakeCalibration {
            offset_ms: 0.0,
            source: CalibrationSource::None,
            lean_ms: None,
        };
        return (0.0, none);
    };
    let seed_ms = seed_ms.filter(|s| s.is_finite());
    let measured = measure_take_lag(schedule, beats, played, seed_ms);
    let (matching, offset, source) = match (measured, seed_ms) {
        (Some(m), Some(s)) if (m - s).abs() <= SEED_TRUST_MS => (m, s, CalibrationSource::Cached),
        (Some(m), _) => (
            m,
            m.clamp(SYSTEM_LAG_RANGE_MS.0, SYSTEM_LAG_RANGE_MS.1),
            CalibrationSource::Take,
        ),
        // Too few notes to measure anything, so the seed stands for both.
        (None, Some(s)) => (s, s, CalibrationSource::Cached),
        (None, None) => (0.0, 0.0, CalibrationSource::None),
    };
    (
        matching,
        TakeCalibration {
            offset_ms: offset,
            source,
            lean_ms: None,
        },
    )
}

/// This Take's constant lag, from all of its notes and every pass of them.
fn measure_take_lag(
    schedule: &ScoreSchedule,
    beats: &BeatMap,
    played: &[PlayedOnset],
    seed_ms: Option<f64>,
) -> Option<f64> {
    let length = pass_length(schedule);
    let last_beat = played.last().and_then(|p| beats.beat_at_time(p.time_ms))?;
    let passes = if schedule.loops {
        ((last_beat / length).floor() as i64 + 1).clamp(1, 4096) as u32
    } else {
        1
    };
    let mut expected: Vec<f64> = Vec::new();
    for pass in 0..passes {
        let origin = pass as f64 * length;
        expected.extend(
            schedule
                .onsets
                .iter()
                .filter(|o| o.beat >= 0.0 && (!schedule.loops || o.beat < length))
                .filter_map(|o| beats.time_at_beat(origin + o.beat)),
        );
    }
    let times: Vec<f64> = played.iter().map(|p| p.time_ms).collect();
    let gap_ms = smallest_gap_beats(&schedule.onsets)? * median_interval_ms(beats);
    estimate_constant_lag_ms(&expected, &times, gap_ms, seed_ms.unwrap_or(NOMINAL_LAG_MS))
}

/// What a Take comes to, counted once for everybody who needs it.
struct Tally {
    due: u32,
    heard: u32,
    missed: u32,
    extra: u32,
    not_reached: u32,
    /// Absolute beat of each result, in step with `results`.
    abs_beats: Vec<f64>,
    /// In step with `results`: did the transport get there?
    reached: Vec<bool>,
}

impl Tally {
    fn of(
        schedule: &ScoreSchedule,
        beats: &BeatMap,
        results: &[OnsetResult],
        extras: &[ExtraOnset],
    ) -> Self {
        let length = pass_length(schedule);
        // The last quarter the engine reported. A note past it was not played
        // because the Take was over, which is not a miss, and with misses now
        // costing the number it must not count as one. A stored beat map that
        // has no quarters at all reaches nothing, and nothing is due.
        let last_logged = beats.len().saturating_sub(1) as f64;
        let beat_of: std::collections::HashMap<u32, f64> =
            schedule.onsets.iter().map(|o| (o.id, o.beat)).collect();
        let mut tally = Self {
            due: 0,
            heard: 0,
            missed: 0,
            extra: 0,
            not_reached: 0,
            abs_beats: Vec::with_capacity(results.len()),
            reached: Vec::with_capacity(results.len()),
        };
        for r in results {
            let abs = r.pass as f64 * length + beat_of.get(&r.id).copied().unwrap_or(0.0);
            tally.abs_beats.push(abs);
            let reached = r.state == OnsetState::Hit || abs <= last_logged + 1e-9;
            tally.reached.push(reached);
            match r.state {
                OnsetState::Hit => {
                    tally.due += 1;
                    tally.heard += 1;
                }
                OnsetState::Miss if reached => {
                    tally.due += 1;
                    tally.missed += 1;
                }
                OnsetState::Miss => tally.not_reached += 1,
                OnsetState::SoftAbsent => {}
            }
        }
        tally.extra = extras.iter().filter(|e| counts_as_extra(schedule, e)).count() as u32;
        tally
    }
}

/// An onset after the last written bar is the player carrying on once the Take
/// was over. It stays in `extras`, which is a record of what was heard, but it
/// was not an error in the Exercise.
fn counts_as_extra(schedule: &ScoreSchedule, extra: &ExtraOnset) -> bool {
    schedule.loops || extra.beat < pass_length(schedule)
}

/// What [`grade_take`] reads, all of it from one matched Take.
struct GradeInputs<'a> {
    schedule: &'a ScoreSchedule,
    beats: &'a BeatMap,
    results: &'a [OnsetResult],
    extras: &'a [ExtraOnset],
    tally: &'a Tally,
    played: &'a [PlayedOnset],
    /// In step with `results`: the hit's amplitude, or `None`. Empty when no
    /// pass bar needs it.
    amplitudes: &'a [Option<f32>],
    pass_bars: &'a [PassBar],
}

/// What `match_attempt` tells the player and the screen.
fn grade_take(input: GradeInputs<'_>, score: f32, calibration: TakeCalibration) -> TakeGrade {
    let GradeInputs {
        schedule,
        beats,
        results,
        extras,
        tally,
        played,
        amplitudes,
        pass_bars,
    } = input;
    let sub = smallest_gap_beats(&schedule.onsets).unwrap_or(1.0);
    let gap_ms = sub * median_interval_ms(beats);
    let deviations: Vec<f64> = results.iter().filter_map(|r| r.deviation_ms).collect();
    let spread = evenness(&deviations, gap_ms);

    // The detector's own opinion, from the first beat on: a count-in that the
    // player noodled through has nothing to do with this Take.
    let first_beat_ms = beats.time_at_beat(0.0).unwrap_or(0.0);
    let mut confidences: Vec<f64> = played
        .iter()
        .filter(|p| p.time_ms >= first_beat_ms - 100.0)
        .map(|p| p.confidence as f64)
        .collect();
    confidences.sort_by(|a, b| a.total_cmp(b));
    let confidence = (!confidences.is_empty()).then(|| median(&confidences) as f32);

    let reason = didnt_catch_enough(tally.due, tally.heard, tally.extra, confidence);
    let (bars, samples) = bar_metrics(schedule, beats, results, extras, tally, amplitudes, gap_ms);
    let graded = reason.is_none();
    let finished = beats.finished_bars().min(samples.len() as u32) as usize;
    let pass = pass::evaluate(&samples[..finished], pass_bars, gap_ms, graded);
    TakeGrade {
        verdict: if graded {
            TakeVerdict::Graded
        } else {
            TakeVerdict::DidntCatchEnough
        },
        no_catch_reason: reason,
        score: graded.then_some(score),
        evenness: spread.map(|(e, _)| e).filter(|_| graded),
        evenness_sigma_ms: spread.map(|(_, s)| s).filter(|_| graded),
        due: tally.due,
        heard: tally.heard,
        missed: tally.missed,
        extra: tally.extra,
        not_reached: tally.not_reached,
        heard_ratio: if tally.due > 0 {
            tally.heard as f32 / tally.due as f32
        } else {
            0.0
        },
        confidence,
        calibration,
        bars,
        bpm: 60_000.0 / median_interval_ms(beats),
        pass,
    }
}

/// One row per bar the Take reached, and the same bars as the pass rule reads
/// them. A bar with nothing due and nothing played still gets a row: the pass
/// rule windows over bars, and a rest bar is a bar. Rest bars after the last
/// note are added up to every bar the transport finished.
fn bar_metrics(
    schedule: &ScoreSchedule,
    beats: &BeatMap,
    results: &[OnsetResult],
    extras: &[ExtraOnset],
    tally: &Tally,
    amplitudes: &[Option<f32>],
    gap_ms: f64,
) -> (Vec<BarMetrics>, Vec<pass::BarSample>) {
    let length = pass_length(schedule);
    let mut rows: Vec<BarMetrics> = Vec::new();
    let mut devs: Vec<pass::BarSample> = Vec::new();
    let accent_of: std::collections::HashMap<u32, bool> =
        schedule.onsets.iter().map(|o| (o.id, o.accent)).collect();
    fn row<'a>(
        rows: &'a mut Vec<BarMetrics>,
        devs: &mut Vec<pass::BarSample>,
        bar: u32,
    ) -> &'a mut BarMetrics {
        while rows.len() <= bar as usize {
            rows.push(BarMetrics {
                bar: rows.len() as u32,
                due: 0,
                heard: 0,
                missed: 0,
                extra: 0,
                evenness: None,
                evenness_sigma_ms: None,
            });
            devs.push(pass::BarSample::default());
        }
        &mut rows[bar as usize]
    }
    if let Some(last) = beats.finished_bars().checked_sub(1) {
        row(&mut rows, &mut devs, last);
    }
    for (k, r) in results.iter().enumerate() {
        if !tally.reached[k] {
            continue;
        }
        let bar = beats.bar_at_beat(tally.abs_beats[k]);
        let cell = row(&mut rows, &mut devs, bar);
        match r.state {
            OnsetState::Hit => {
                cell.due += 1;
                cell.heard += 1;
                let sample = &mut devs[bar as usize];
                if let Some(d) = r.deviation_ms {
                    sample.deviations_ms.push(d);
                }
                if let Some(Some(a)) = amplitudes.get(k) {
                    if accent_of.get(&r.id).copied().unwrap_or(false) {
                        sample.accented.push(*a);
                    } else {
                        sample.plain.push(*a);
                    }
                }
            }
            OnsetState::Miss => {
                cell.due += 1;
                cell.missed += 1;
            }
            OnsetState::SoftAbsent => {}
        }
    }
    for e in extras.iter().filter(|e| counts_as_extra(schedule, e)) {
        let bar = beats.bar_at_beat(e.pass as f64 * length + e.beat);
        row(&mut rows, &mut devs, bar).extra += 1;
    }
    for (cell, d) in rows.iter_mut().zip(devs.iter_mut()) {
        if let Some((e, s)) = evenness(&d.deviations_ms, gap_ms) {
            cell.evenness = Some(e);
            cell.evenness_sigma_ms = Some(s);
        }
        (d.due, d.heard, d.extra) = (cell.due, cell.heard, cell.extra);
    }
    (rows, devs)
}

/// The smallest gap between two consecutive expected onsets, in beats.
/// Drives the matching window (so a schedule of sixteenths is judged on
/// a sixteenth's tolerance, not a quarter's) and the refractory the
/// detector is told about — the score knows what is coming, which is
/// more than the inference can ever know.
pub fn smallest_gap_beats(onsets: &[ExpectedOnset]) -> Option<f64> {
    let mut smallest: Option<f64> = None;
    for pair in onsets.windows(2) {
        let gap = pair[1].beat - pair[0].beat;
        if gap > 1e-6 {
            smallest = Some(match smallest {
                Some(s) if s <= gap => s,
                _ => gap,
            });
        }
    }
    smallest
}

/// The most onsets any single quarter note of this schedule holds.
///
/// Not the reciprocal of the smallest gap: one pair of 32nds in an
/// otherwise plain piece would answer 8 to that question, and the
/// answer wanted here is how dense the music actually gets. A sliding
/// quarter-wide window over the onsets, which are already in beat
/// order, gives the honest number in one pass.
///
/// `timing.rs` reads it to bound how many notes one quarter may hold
/// before the extras stop being music: a loaded score knows exactly
/// how many notes a beat was written to carry, which is a better
/// answer than any constant.
pub fn densest_quarter(onsets: &[ExpectedOnset]) -> u32 {
    let mut densest: u32 = 0;
    let mut start = 0usize;
    for end in 0..onsets.len() {
        // Onsets are sorted by beat; walk the tail forward until the
        // window is one quarter wide. The epsilon keeps a note exactly
        // one beat later out of the same window, where floating point
        // would otherwise decide it by the last bit.
        while onsets[end].beat - onsets[start].beat >= 1.0 - 1e-9 {
            start += 1;
        }
        densest = densest.max((end - start + 1) as u32);
    }
    densest
}

/// Whether the notes the score marked accented actually came out
/// louder. `None` when there is nothing to compare — no accents, or not
/// enough of either group landed.
fn accent_agreement(
    schedule: &ScoreSchedule,
    results: &[OnsetResult],
    played: &[PlayedOnset],
    beats: &BeatMap,
) -> Option<f32> {
    let mut accented: Vec<f32> = Vec::new();
    let mut plain: Vec<f32> = Vec::new();
    for res in results.iter().filter(|r| r.state == OnsetState::Hit) {
        let Some(exp) = schedule.onsets.iter().find(|o| o.id == res.id) else {
            continue;
        };
        let origin = res.pass as f64 * schedule.length_beats;
        let Some(nominal) = beats.time_at_beat(origin + exp.beat) else {
            continue;
        };
        let at = nominal + res.deviation_ms.unwrap_or(0.0);
        // The played note this result came from, by its time.
        let Some(p) = played
            .iter()
            .min_by(|a, b| {
                (a.time_ms - at)
                    .abs()
                    .partial_cmp(&(b.time_ms - at).abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .copied()
        else {
            continue;
        };
        if exp.accent {
            accented.push(p.amplitude);
        } else {
            plain.push(p.amplitude);
        }
    }
    if accented.len() < 2 || plain.len() < 2 {
        return None;
    }
    let mean = |v: &[f32]| v.iter().sum::<f32>() / v.len() as f32;
    let a = mean(&accented);
    let p = mean(&plain);
    if p <= 0.0 {
        return None;
    }
    // 1.0 when the accents are twice as loud; 0.0 when they are no
    // louder at all. A ratio, not a score — LP C3 decides what it costs.
    Some((((a / p) - 1.0) / 1.0).clamp(0.0, 1.0))
}

/// The amplitude of the played note each hit came from, found as
/// [`accent_agreement`] finds it. In step with `results`; `None` for anything
/// that was not a hit.
fn hit_amplitudes(
    schedule: &ScoreSchedule,
    results: &[OnsetResult],
    played: &[PlayedOnset],
    beats: &BeatMap,
) -> Vec<Option<f32>> {
    let beat_of: std::collections::HashMap<u32, f64> =
        schedule.onsets.iter().map(|o| (o.id, o.beat)).collect();
    results
        .iter()
        .map(|res| {
            if res.state != OnsetState::Hit {
                return None;
            }
            let origin = res.pass as f64 * schedule.length_beats;
            let nominal = beats.time_at_beat(origin + *beat_of.get(&res.id)?)?;
            let at = nominal + res.deviation_ms.unwrap_or(0.0);
            played
                .iter()
                .min_by(|a, b| (a.time_ms - at).abs().total_cmp(&(b.time_ms - at).abs()))
                .map(|p| p.amplitude)
        })
        .collect()
}

/// How much an extra note costs against a missed one, in [`known_score_number`].
const EXTRA_NOTE_WEIGHT: f32 = 0.5;

/// The number, against a known score.
///
/// `timing × heard × extras`, and it is a product on purpose. On guitar the
/// free-play weights give missed notes no say at all (`instrument.rs`, and
/// rightly: with no score, an unplayed note is a rest), so a take with 19 of
/// 128 notes heard used to score 98. A weighted sum would only move that to
/// about 80, and "I heard one note in seven" is not a B. When the material is
/// known, the timing of what was heard can only be credit for what was heard.
///
/// * `timing` is interval consistency and grid alignment, balanced by the
///   instrument's own weights, so the two keep the proportion they have in
///   free play. The instrument's `hc` and `oe` are not read: they answer "how
///   much does completeness matter when you cannot know what was due", and
///   here it is known.
/// * `heard` is hit completeness. One note in a hundred costs one point in a
///   hundred, whatever the tempo.
/// * `extras` costs half what a miss does. The detector's ghosts land here as
///   well as the player's own, and a ghost is not their fault.
///
/// Silence scores nothing, because `heard` is nought. A pass bar must still
/// read [`TakeGrade`], whose counts and evenness come per-bar, not this.
fn known_score_number(
    interval_consistency: f32,
    grid_alignment: f32,
    hit_completeness: f32,
    onset_efficiency: f32,
    weights: &ScoreWeights,
) -> f32 {
    let balance = weights.ic + weights.ga;
    let timing = if balance > 0.0 {
        (interval_consistency * weights.ic + grid_alignment * weights.ga) / balance
    } else {
        (interval_consistency + grid_alignment) * 0.5
    };
    let extras = 1.0 - EXTRA_NOTE_WEIGHT * (1.0 - onset_efficiency);
    (timing * hit_completeness * extras * 100.0).clamp(0.0, 100.0)
}

/// The four components, against a known score.
///
/// The same four axes as free play, so the number means the same thing
/// on both sides of the app, but each is measured against the score
/// rather than against an inferred grid:
///
/// * **interval consistency** — the spread of the hits' deviations.
///   A player who is 20 ms behind the whole way through is playing
///   evenly and is not punished for it; a player whose deviation
///   wanders is. See [`evenness`].
/// * **grid alignment** — how close the hits are, on the same
///   perfect/good/ok bands the free-play matcher uses.
/// * **hit completeness** — hits over notes that were genuinely due.
///   Absent soft onsets are not due, and leave the denominator. The
///   grade's count also leaves out notes past where the transport
///   stopped; the report's keeps them, as it always has.
/// * **onset efficiency** — hits over everything the player played.
///   This is where extras cost something. The grade's count leaves out
///   what was played after the last written bar of a schedule that does
///   not loop.
///
/// This computes the first two, which do not depend on what is counted as
/// due. The caller counts the other two, once for the report and once for the
/// grade.
fn timing_components(schedule: &ScoreSchedule, results: &[OnsetResult], quarter_ms: f64) -> (f32, f32) {
    let hits: Vec<f64> = results
        .iter()
        .filter_map(|r| r.deviation_ms)
        .collect();

    // A window to judge the deviations against. The schedule's own
    // smallest gap sets it, for the same reason it sets the detector's
    // refractory.
    let sub = smallest_gap_beats(&schedule.onsets).unwrap_or(1.0);
    // The same tempo-aware rule the free-play matcher uses, on the
    // schedule's own smallest gap: a piece of sixteenths is judged on a
    // sixteenth's tolerance, at the tempo it was actually played.
    let gap_ms = quarter_ms * sub;
    let window_ms = tempo_aware_window_ms(gap_ms);
    let thresholds = window_thresholds(window_ms);

    let interval_consistency = evenness(&hits, gap_ms).map(|(e, _)| e).unwrap_or(0.5);

    let grid_alignment = if hits.is_empty() {
        0.0
    } else {
        let sum: f64 = hits
            .iter()
            .map(|d| {
                let a = d.abs();
                if a < thresholds.perfect {
                    100.0
                } else if a < thresholds.good {
                    80.0
                } else if a < thresholds.ok {
                    50.0
                } else {
                    0.0
                }
            })
            .sum();
        ((sum / hits.len() as f64) / 100.0).clamp(0.0, 1.0) as f32
    };

    (interval_consistency, grid_alignment)
}

/// `part / whole`, 0 when there is no whole.
fn ratio(part: u32, whole: u32) -> f32 {
    if whole > 0 {
        (part as f32 / whole as f32).clamp(0.0, 1.0)
    } else {
        0.0
    }
}

// ──────────────────────────────────────────────────────────────────────
// One attempt, as the analysis thread accumulates it
// ──────────────────────────────────────────────────────────────────────

/// A schedule that has been loaded, and what has happened since.
///
/// Lives on the timing analyzer's own thread — the one that already
/// matches onsets to beats. Nothing here runs on the audio callback,
/// and nothing here allocates while a note is being detected: the two
/// vectors grow once per beat and once per note, on a thread whose job
/// is already to do that.
///
/// Beat 0 is the first downbeat after the schedule was loaded. A
/// count-in is therefore whatever the player did before that, and is
/// dropped rather than reported — see `match_attempt`.
#[derive(Debug, Clone)]
pub struct ScheduleRun {
    schedule: ScoreSchedule,
    beats: BeatMap,
    played: Vec<PlayedOnset>,
    started: bool,
    /// The onsets ONE pass asks for, in beat order — the same filter
    /// `match_attempt` applies, taken once because it cannot change.
    pass_onsets: Vec<ExpectedOnset>,
    /// The schedule's smallest gap in beats, which sets every matching
    /// window. Taken once for the same reason.
    smallest_gap: f64,
    /// How far the live sweep has got: `pass * pass_onsets.len() + index`,
    /// so a loop keeps counting rather than starting again. Everything below
    /// it has had a verdict emitted; nothing below it is ever revisited.
    settled: u64,
    /// When the last sweep ran, on the beat map's own clock. The rate limit.
    last_sweep_ms: f64,
    /// The cached `(instrument, device)` offset, if this rig has one.
    calibration_seed_ms: Option<f64>,
    /// What the live sweep currently takes the system's lag to be.
    live_lag_ms: f64,
    /// How many played notes `live_lag_ms` was last worked out over.
    live_lag_notes: usize,
    /// The Exercise's pass bars, when an Exercise is what was loaded.
    pass_bars: Vec<PassBar>,
}

/// How long after an expected onset's matching window closes its live verdict
/// is taken to be decided.
///
/// The onset detector is not instantaneous: an FFT hop, a hop or two of
/// decision smoothing and the driver's own buffering put a note in the
/// analyzer's hands up to about thirty milliseconds after it was played, which
/// is the same figure `timing.rs` holds a beat back by for the same reason. A
/// verdict passed before that would call a note missed that is still in
/// flight.
const LIVE_SETTLE_LAG_MS: f64 = 35.0;

/// The shortest gap between two live sweeps.
///
/// Twenty-five sweeps a second: faster than a screen refreshes a note and far
/// slower than the analyzer's own 5 ms loop, so the alignment below runs on
/// one pass in eight rather than on every one. A verdict is never delayed by
/// more than this, which at any tempo anybody plays is a fraction of the beat
/// it has to arrive inside.
const LIVE_SWEEP_MS: f64 = 40.0;

/// The most verdicts one sweep will emit.
///
/// A sweep normally settles nought or one onset. The cap only bites when a
/// schedule is loaded onto a transport that has already been running, where
/// the cursor has a backlog to walk; it spreads that over a few sweeps rather
/// than doing an unbounded amount of alignment in one.
const LIVE_SWEEP_CAP: usize = 64;

/// How many onsets on either side of the settled run the live alignment is
/// given to work with.
///
/// The alignment is the whole reason a dropped note is reported as one
/// mistake rather than twenty (`align_pass`), and it can only do that with a
/// run of notes to align. Handed one onset it degenerates into
/// nearest-neighbour matching, which is exactly what this module exists to
/// avoid. Eight is two beats of sixteenths — enough for the path to route
/// around a drop, and small enough that a sweep is a few dozen cells.
const LIVE_CONTEXT: usize = 8;

impl ScheduleRun {
    pub fn new(schedule: ScoreSchedule) -> Self {
        let pass_onsets: Vec<ExpectedOnset> = schedule
            .onsets
            .iter()
            .filter(|o| o.beat >= 0.0 && (!schedule.loops || o.beat < pass_length(&schedule)))
            .cloned()
            .collect();
        let smallest_gap = smallest_gap_beats(&schedule.onsets).unwrap_or(1.0);
        Self {
            schedule,
            beats: BeatMap::default(),
            played: Vec::with_capacity(512),
            started: false,
            pass_onsets,
            smallest_gap,
            settled: 0,
            last_sweep_ms: f64::NEG_INFINITY,
            calibration_seed_ms: None,
            live_lag_ms: 0.0,
            live_lag_notes: 0,
            pass_bars: Vec::new(),
        }
    }

    /// The pass bars the report's grade is judged against. See [`pass`].
    pub fn with_pass_bars(mut self, pass_bars: Vec<PassBar>) -> Self {
        self.pass_bars = pass_bars;
        self
    }

    /// The offset `calibration_cache` holds for this rig, when it holds one.
    pub fn with_calibration_seed(mut self, seed_ms: Option<f64>) -> Self {
        self.calibration_seed_ms = seed_ms.filter(|s| s.is_finite());
        self.live_lag_ms = self.calibration_seed_ms.unwrap_or(0.0);
        self
    }

    pub fn schedule(&self) -> &ScoreSchedule {
        &self.schedule
    }

    /// A quarter note fell. Recording starts at the first downbeat:
    /// before that the player is counting in, and a schedule whose
    /// beat 0 landed mid-bar would put every bar line in the wrong
    /// place for the rest of the attempt.
    pub fn note_quarter(&mut self, is_downbeat: bool, wall_ms: f64) {
        self.note_quarter_in_bar(is_downbeat, wall_ms, DEFAULT_BEATS_PER_BAR);
    }

    /// [`Self::note_quarter`], with the length of the bar the engine is
    /// counting, which is what per-bar metrics are cut by.
    pub fn note_quarter_in_bar(&mut self, is_downbeat: bool, wall_ms: f64, beats_per_bar: u32) {
        if !self.started {
            if !is_downbeat {
                return;
            }
            self.started = true;
        }
        self.beats.push_quarter_in_bar(wall_ms, beats_per_bar);
    }

    /// A note was heard. Everything the detector emitted goes in,
    /// including what it heard before beat 0 — `match_attempt` decides
    /// what is a count-in, not this.
    pub fn note_onset(&mut self, onset: PlayedOnset) {
        self.played.push(onset);
    }

    pub fn has_started(&self) -> bool {
        self.started
    }

    /// The smallest gap the score is about to ask for, in ms, at a
    /// given quarter-note interval. This is what the onset detector's
    /// refractory should be keyed to when a schedule is loaded: the
    /// score knows what is coming, which is more than the inference can
    /// work out from what has already been played.
    pub fn smallest_gap_ms(&self, quarter_ms: f64) -> Option<f64> {
        smallest_gap_beats(&self.schedule.onsets).map(|b| b * quarter_ms)
    }

    /// The most notes any one quarter of this score asks for. The
    /// per-quarter onset cap in `timing.rs` follows this rather than a
    /// constant while a schedule is loaded.
    pub fn densest_quarter(&self) -> u32 {
        densest_quarter(&self.schedule.onsets)
    }

    /// Match everything so far, with the system's lag taken out. `None`
    /// until there is a beat map to match against — without one there is no
    /// honest way to turn a beat into a time.
    pub fn report(&self, weights: &ScoreWeights) -> Option<ScheduleReport> {
        if self.beats.is_empty() {
            return None;
        }
        Some(match_attempt_calibrated(
            &self.schedule,
            &self.beats,
            &self.played,
            weights,
            CalibrationPolicy::Auto {
                seed_ms: self.calibration_seed_ms,
            },
            &self.pass_bars,
        ))
    }

    /// `plans/SONGS.md` A7 — the verdicts that can be given NOW, appended to
    /// `out`, each exactly once for the life of this run.
    ///
    /// Called on the analyzer's own thread, from the loop that is already
    /// matching onsets to beats. Nothing here runs on the audio callback and
    /// nothing here is on the onset detector's path.
    ///
    /// **It changes nothing the report reads.** `played`, the beat map and
    /// the schedule are untouched; the only state this moves is the cursor
    /// and the sweep clock, neither of which `report` looks at. So an
    /// attempt scores exactly what it scored before this existed, whether
    /// this was called a thousand times or never —
    /// `the_live_sweep_changes_nothing_about_the_report` is the test.
    ///
    /// An onset is settled when its matching window has closed and the
    /// detector has had time to deliver anything still in flight, and only
    /// while the beat log actually reaches it: a transport that stops takes
    /// the beat log with it, and extrapolating past the last logged quarter
    /// would turn "the player stopped" into a bar of misses.
    pub fn settle(&mut self, now_ms: f64, out: &mut Vec<LiveOnset>) {
        let n = self.pass_onsets.len();
        if n == 0 || self.beats.is_empty() {
            return;
        }
        if now_ms - self.last_sweep_ms < LIVE_SWEEP_MS {
            return;
        }
        self.last_sweep_ms = now_ms;
        self.refresh_live_lag();

        let length = pass_length(&self.schedule);
        // The last quarter the engine actually reported. Nothing past it is
        // judged, however long ago its nominal time was.
        let last_logged = (self.beats.len() - 1) as f64;

        // ── How far the cursor can go ──────────────────────────────────
        let start = self.settled;
        let mut end = start;
        while (end - start) < LIVE_SWEEP_CAP as u64 {
            let pass = (end / n as u64) as u32;
            if pass > 0 && !self.schedule.loops {
                break;
            }
            let i = (end % n as u64) as usize;
            let abs = pass as f64 * length + self.pass_onsets[i].beat;
            if abs > last_logged {
                break;
            }
            let Some(t) = self.beats.time_at_beat(abs) else {
                break;
            };
            if t + self.live_lag_ms + self.window_ms_at(abs) + LIVE_SETTLE_LAG_MS > now_ms {
                break;
            }
            end += 1;
        }
        if end == start {
            return;
        }

        // ── Align, one pass of the loop at a time ──────────────────────
        // A slice that straddles a seam would have to carry two `pass`
        // numbers through an alignment that takes one, so the seam is where
        // the work is cut. At most two slices come out of any one sweep.
        let mut cursor = start;
        while cursor < end {
            let pass = (cursor / n as u64) as u32;
            let first = (cursor % n as u64) as usize;
            let pass_end = ((pass as u64 + 1) * n as u64).min(end);
            let last = ((pass_end - 1) % n as u64) as usize;
            self.emit_slice(pass, first, last, length, out);
            cursor = pass_end;
        }
        self.settled = end;
    }

    /// The live verdicts have the same lag to deal with as the report, and
    /// less to go on: the recent notes rather than all of them. Until there
    /// are enough to read one, the cached offset or nothing. Provisional, like
    /// everything `settle` says: the report works it out again from the whole
    /// Take at the end.
    fn refresh_live_lag(&mut self) {
        const RECENT: usize = 32;
        if self.played.len() == self.live_lag_notes || self.played.len() < MIN_NOTES_FOR_LAG {
            return;
        }
        self.live_lag_notes = self.played.len();
        let recent = &self.played[self.played.len().saturating_sub(RECENT)..];
        let (Some(first), Some(last)) = (recent.first(), recent.last()) else {
            return;
        };
        let (Some(from), Some(to)) = (
            self.beats.beat_at_time(first.time_ms - 200.0),
            self.beats.beat_at_time(last.time_ms + 200.0),
        ) else {
            return;
        };
        let length = pass_length(&self.schedule);
        let mut expected: Vec<f64> = Vec::with_capacity(RECENT * 2);
        let first_pass = (from.max(0.0) / length).floor() as u32;
        let last_pass = if self.schedule.loops {
            (to.max(0.0) / length).floor() as u32
        } else {
            0
        };
        for pass in first_pass.min(last_pass)..=last_pass {
            let origin = pass as f64 * length;
            for o in &self.pass_onsets {
                let abs = origin + o.beat;
                if abs >= from && abs <= to {
                    if let Some(t) = self.beats.time_at_beat(abs) {
                        expected.push(t);
                    }
                }
            }
        }
        let times: Vec<f64> = recent.iter().map(|p| p.time_ms).collect();
        let gap_ms = self.smallest_gap * self.beats.interval_ms_at(from.max(0.0));
        let prior = self.calibration_seed_ms.unwrap_or(NOMINAL_LAG_MS);
        if let Some(lag) = estimate_constant_lag_ms(&expected, &times, gap_ms, prior) {
            self.live_lag_ms = lag;
        }
    }

    /// Verdicts for `first..=last` of one pass, aligned with context on both
    /// sides so the path has somewhere to put a dropped or an added note.
    fn emit_slice(
        &self,
        pass: u32,
        first: usize,
        last: usize,
        length: f64,
        out: &mut Vec<LiveOnset>,
    ) {
        let n = self.pass_onsets.len();
        let lo = first.saturating_sub(LIVE_CONTEXT);
        let hi = (last + 1 + LIVE_CONTEXT).min(n);
        let expected = &self.pass_onsets[lo..hi];
        let origin = pass as f64 * length;
        let times: Vec<f64> = expected
            .iter()
            .filter_map(|o| self.beats.time_at_beat(origin + o.beat))
            .collect();
        if times.len() != expected.len() {
            return;
        }
        let windows: Vec<f64> = expected
            .iter()
            .map(|o| self.window_ms_at(origin + o.beat))
            .collect();

        // The notes that could pair with anything in the slice. `played` is
        // in arrival order, which is time order, so both ends are a binary
        // search rather than a scan of the whole attempt.
        let lag = self.live_lag_ms;
        let from_ms = times[0] - windows[0] + lag;
        let to_ms = times[times.len() - 1] + windows[windows.len() - 1] + lag;
        let from = self.played.partition_point(|p| p.time_ms < from_ms);
        let to = self.played.partition_point(|p| p.time_ms <= to_ms);
        let notes: Vec<PlayedOnset> = self.played[from..to]
            .iter()
            .map(|p| PlayedOnset {
                time_ms: p.time_ms - lag,
                ..*p
            })
            .collect();

        // The extras are dropped here and the beat they fell on is never
        // computed: a note nobody asked for lights nothing on the page, and
        // the review reports them all at the end.
        let (results, _extras) = align_pass(
            expected,
            &times,
            &notes,
            &|i| windows[i],
            pass,
            &|_| 0.0,
        );
        if results.len() != expected.len() {
            // A malformed band ends the backtrack early and leaves the
            // results out of step with the onsets they are about. Saying
            // nothing is the only safe answer; the report will say it
            // properly at the end of the attempt.
            return;
        }
        for k in (first - lo)..=(last - lo) {
            out.push(LiveOnset {
                id: results[k].id,
                pass: results[k].pass,
                state: results[k].state,
                deviation_ms: results[k].deviation_ms,
            });
        }
    }

    /// The matching window around an absolute beat — the same tempo-aware
    /// rule, off the same beat map, that `match_attempt` will use when the
    /// attempt ends. Two answers to "was that note in time" that came from
    /// different windows would be two answers.
    fn window_ms_at(&self, abs_beat: f64) -> f64 {
        tempo_aware_window_ms(self.beats.interval_ms_at(abs_beat) * self.smallest_gap)
    }
}

/// How long one pass of a schedule is, in quarter notes. A schedule that
/// declares nothing is one beat long rather than zero, which is what
/// `match_attempt` has always assumed and what keeps the loop cursor moving.
fn pass_length(schedule: &ScoreSchedule) -> f64 {
    if schedule.length_beats > 0.0 {
        schedule.length_beats
    } else {
        1.0
    }
}

/// The median quarter-note interval over a beat map. Median rather
/// than mean so one gap in the beat log — the 2026-09-04 dropped
/// notification — cannot decide the tolerance the whole pass is judged
/// on.
fn median_interval_ms(beats: &BeatMap) -> f64 {
    if beats.beats_ms.len() < 2 {
        return 500.0;
    }
    let mut gaps: Vec<f64> = beats
        .beats_ms
        .windows(2)
        .map(|w| (w[1] - w[0]).max(1.0))
        .collect();
    gaps.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    median(&gaps)
}

fn median(sorted: &[f64]) -> f64 {
    let n = sorted.len();
    if n == 0 {
        return 0.0;
    }
    let mid = n / 2;
    if n % 2 == 0 {
        (sorted[mid - 1] + sorted[mid]) / 2.0
    } else {
        sorted[mid]
    }
}

pub mod pass;
pub use pass::{PassBar, PassResult, PassVerdict};

#[cfg(test)]
mod tests;
