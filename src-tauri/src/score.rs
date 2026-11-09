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
}

impl BeatMap {
    /// `times_ms[i]` is when quarter note `i` of the played range fell.
    /// Beat 0 is the schedule's own origin: the count-in belongs before
    /// it and is not in here.
    pub fn from_quarter_times(times_ms: Vec<f64>) -> Self {
        Self { beats_ms: times_ms }
    }

    /// One more quarter note fell. The live path grows the map a beat at a
    /// time rather than rebuilding it, so `report` can be asked the same
    /// question at the end without anything having been copied.
    pub fn push_quarter(&mut self, time_ms: f64) {
        self.beats_ms.push(time_ms);
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
}

/// Match a whole attempt — every pass — and score it.
///
/// `played` is everything the detector heard during the attempt, on the
/// beat map's clock. Notes before beat 0 are dropped rather than
/// reported: that is the count-in, and the player is allowed to use it
/// (LP C4). A loop restarts the schedule and never the score, so
/// results and extras accumulate across passes with `pass` recorded on
/// each.
pub fn match_attempt(
    schedule: &ScoreSchedule,
    beats: &BeatMap,
    played: &[PlayedOnset],
    weights: &ScoreWeights,
) -> ScheduleReport {
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
    // The tempo the deviations are judged against. The median of the
    // quarters actually played, so a song that steps tempo is judged
    // around where it mostly sat rather than around where it opened,
    // and a 180 BPM piece is not marked on a 120 BPM tolerance.
    let quarter_ms = median_interval_ms(beats);
    let (score, ic, ga, hc, oe) =
        score_results(schedule, &results, &extras, weights, quarter_ms);

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
    }
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

/// The four components, against a known score.
///
/// The same four axes as free play, so the number means the same thing
/// on both sides of the app, but each is measured against the score
/// rather than against an inferred grid:
///
/// * **interval consistency** — the spread of the hits' deviations.
///   A player who is 20 ms behind the whole way through is playing
///   evenly and is not punished for it; a player whose deviation
///   wanders is.
/// * **grid alignment** — how close the hits are, on the same
///   perfect/good/ok bands the free-play matcher uses.
/// * **hit completeness** — hits over notes that were genuinely due.
///   Absent soft onsets are not due, and leave the denominator.
/// * **onset efficiency** — hits over everything the player played.
///   This is where extras cost something.
fn score_results(
    schedule: &ScoreSchedule,
    results: &[OnsetResult],
    extras: &[ExtraOnset],
    weights: &ScoreWeights,
    quarter_ms: f64,
) -> (f32, f32, f32, f32, f32) {
    let hits: Vec<f64> = results
        .iter()
        .filter_map(|r| r.deviation_ms)
        .collect();
    let due = results
        .iter()
        .filter(|r| r.state != OnsetState::SoftAbsent)
        .count();

    // A window to judge the deviations against. The schedule's own
    // smallest gap sets it, for the same reason it sets the detector's
    // refractory.
    let sub = smallest_gap_beats(&schedule.onsets).unwrap_or(1.0);
    // The same tempo-aware rule the free-play matcher uses, on the
    // schedule's own smallest gap: a piece of sixteenths is judged on a
    // sixteenth's tolerance, at the tempo it was actually played.
    let window_ms = tempo_aware_window_ms(quarter_ms * sub);
    let thresholds = window_thresholds(window_ms);

    let interval_consistency = if hits.len() < 3 {
        0.5
    } else {
        let mut sorted = hits.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let med = median(&sorted);
        let mut devs: Vec<f64> = sorted.iter().map(|d| (d - med).abs()).collect();
        devs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        // MAD → σ, the same estimator `score_segment` uses, for the
        // same reason: one wild note should not decide the number.
        let sigma = median(&devs) * 1.4826;
        let k = (window_ms * 0.5).max(1.0);
        (-sigma * sigma / (2.0 * k * k)).exp() as f32
    };

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

    let hit_completeness = if due > 0 {
        (hits.len() as f32 / due as f32).clamp(0.0, 1.0)
    } else {
        0.0
    };

    let onset_efficiency = {
        let total = hits.len() + extras.len();
        if total > 0 {
            (hits.len() as f32 / total as f32).clamp(0.0, 1.0)
        } else {
            0.0
        }
    };

    let score = (interval_consistency * weights.ic
        + grid_alignment * weights.ga
        + hit_completeness * weights.hc
        + onset_efficiency * weights.oe)
        * 100.0;

    (
        score,
        interval_consistency,
        grid_alignment,
        hit_completeness,
        onset_efficiency,
    )
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
        }
    }

    pub fn schedule(&self) -> &ScoreSchedule {
        &self.schedule
    }

    /// A quarter note fell. Recording starts at the first downbeat:
    /// before that the player is counting in, and a schedule whose
    /// beat 0 landed mid-bar would put every bar line in the wrong
    /// place for the rest of the attempt.
    pub fn note_quarter(&mut self, is_downbeat: bool, wall_ms: f64) {
        if !self.started {
            if !is_downbeat {
                return;
            }
            self.started = true;
        }
        self.beats.push_quarter(wall_ms);
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

    /// Match everything so far. `None` until there is a beat map to
    /// match against — without one there is no honest way to turn a
    /// beat into a time.
    pub fn report(&self, weights: &ScoreWeights) -> Option<ScheduleReport> {
        if self.beats.is_empty() {
            return None;
        }
        Some(match_attempt(
            &self.schedule,
            &self.beats,
            &self.played,
            weights,
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
            if t + self.window_ms_at(abs) + LIVE_SETTLE_LAG_MS > now_ms {
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
        let from_ms = times[0] - windows[0];
        let to_ms = times[times.len() - 1] + windows[windows.len() - 1];
        let from = self.played.partition_point(|p| p.time_ms < from_ms);
        let to = self.played.partition_point(|p| p.time_ms <= to_ms);

        // The extras are dropped here and the beat they fell on is never
        // computed: a note nobody asked for lights nothing on the page, and
        // the review reports them all at the end.
        let (results, _extras) = align_pass(
            expected,
            &times,
            &self.played[from..to],
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

#[cfg(test)]
mod tests;
