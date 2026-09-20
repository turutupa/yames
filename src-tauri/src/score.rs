//! The score the player is playing against, and what came back.
//!
//! Roadmap 2.4, `LEARNING_PATHS_DECISIONS.md` C1 and C4. Everything the
//! rest of the app has measured until now was measured against a grid
//! the analyzer inferred: every note the player did not play was a rest,
//! because nothing knew a note was due. When the material is known —
//! a song they imported, an exercise the curriculum built, a step in a
//! path — that stops being true. A note that is due and does not arrive
//! is a *miss*. A note that arrives and is not due is an *extra*. That
//! difference is the whole of this module, and it is what the review
//! after a pass has to say something about.
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
//!    a time from a BPM. Beat positions become times through `BeatMap`,
//!    which is built from where the engine's beats *actually fell* — the
//!    lesson written into `timing.rs` on 2026-09-04, where a dropped
//!    beat notification degraded a score nobody could explain.
//! 3. **Some notes are not expected to be audible.** A hammer-on or a
//!    pull-off may be too quiet for the detector, and scoring its
//!    absence as a miss would punish the player for good legato. Those
//!    arrive flagged `soft`; absent, they cost nothing.
//!
//! The pitch of a note is not this module's business — timing only.
//! Which note was played waits for `pitch.rs` (LP C2, S0.5).

use serde::{Deserialize, Serialize};

use crate::instrument::ScoreWeights;
use crate::timing::{tempo_aware_window_ms, window_thresholds};

// ──────────────────────────────────────────────────────────────────────
// The wire contract (plans/tasks/songs/BRIEF.md). camelCase on the wire,
// mirrored by `src/songs/types.ts` on the TypeScript side.
// ──────────────────────────────────────────────────────────────────────

/// One moment in the score at which the player is expected to make a
/// sound. Notes that share a tick are one onset — a chord is one
/// attack, not six.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedOnset {
    pub id: u32,
    /// Quarter notes from the start of the played range, as f64.
    pub beat: f64,
    /// Which notes of the score this onset stands for. Carried through
    /// untouched so the review can colour the tab.
    pub note_ids: Vec<u32>,
    /// A hammer-on, a pull-off — an attack that may be too quiet to
    /// detect. Absent, it costs nothing.
    pub soft: bool,
    /// The score marks this one accented. Checked when amplitude
    /// allows, and reported rather than scored in this wave (LP C3).
    pub accent: bool,
}

/// What the player is being asked to play.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreSchedule {
    /// Sorted by `beat`. Built in TypeScript from the song score
    /// (`src/songs/schedule.ts`), never here.
    pub onsets: Vec<ExpectedOnset>,
    /// Quarter notes in the played range. A loop wraps here.
    pub length_beats: f64,
    /// Whether the range repeats.
    pub loops: bool,
}

/// What became of one expected onset.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OnsetState {
    /// A note arrived for it.
    Hit,
    /// Nothing arrived, and something should have.
    Miss,
    /// Nothing arrived, and that is allowed — see `ExpectedOnset::soft`.
    SoftAbsent,
}

/// One expected onset's verdict.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnsetResult {
    pub id: u32,
    pub state: OnsetState,
    /// Signed milliseconds, negative early. `None` unless `state` is
    /// `Hit`.
    pub deviation_ms: Option<f64>,
    /// Times round the loop, from 0.
    pub pass: u32,
}

/// A note the player made that the score did not ask for.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraOnset {
    /// Where it landed, in quarter notes from the start of the played
    /// range — the same frame as `ExpectedOnset::beat`, so the review
    /// can draw it between the notes it sits between.
    pub beat: f64,
    pub pass: u32,
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
                });
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
                });
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
    extras.reverse();
    (results, extras)
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
    let length = if schedule.length_beats > 0.0 {
        schedule.length_beats
    } else {
        1.0
    };

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
    quarter_times_ms: Vec<f64>,
    played: Vec<PlayedOnset>,
    started: bool,
}

impl ScheduleRun {
    pub fn new(schedule: ScoreSchedule) -> Self {
        Self {
            schedule,
            quarter_times_ms: Vec::with_capacity(256),
            played: Vec::with_capacity(512),
            started: false,
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
        self.quarter_times_ms.push(wall_ms);
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

    /// Match everything so far. `None` until there is a beat map to
    /// match against — without one there is no honest way to turn a
    /// beat into a time.
    pub fn report(&self, weights: &ScoreWeights) -> Option<ScheduleReport> {
        if self.quarter_times_ms.is_empty() {
            return None;
        }
        let beats = BeatMap::from_quarter_times(self.quarter_times_ms.clone());
        Some(match_attempt(&self.schedule, &beats, &self.played, weights))
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
