//! Spaced repetition, and the tempo ceiling — both as arithmetic.
//!
//! `ROADMAP.md` §2.5. This module is the scheduler and nothing else: it
//! takes a record and a result and hands back the next record. It opens no
//! database, reads no clock and knows no exercise — `db.rs` (W2) owns
//! storage, and the caller says what day it is. That is what makes every
//! rule here testable and every schedule reproducible.
//!
//! **Why a variant and not textbook SM-2.** SM-2 was designed for facts,
//! which keep for months. A motor skill does not: a passage you could play
//! at 120 three weeks ago is not a passage you can play at 120 today, and a
//! schedule that says otherwise teaches the player to distrust the coach. So
//! two things change. Intervals are capped at fourteen days, and the second
//! rung is three days rather than six — with a fourteen-day ceiling, a
//! six-day second step leaves only two rungs above it, and the ladder stops
//! being a ladder.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// The bounds the schedule lives inside
// ---------------------------------------------------------------------------

/// Nothing is ever scheduled further out than a fortnight.
pub const MAX_INTERVAL_DAYS: u16 = 14;

/// The first rung: tomorrow.
pub const FIRST_INTERVAL_DAYS: u16 = 1;

/// The second rung. Three, not SM-2's six — see the module note.
pub const SECOND_INTERVAL_DAYS: u16 = 3;

/// SM-2's easiness factor, floored where SM-2 floors it.
pub const MIN_EASE: f32 = 1.3;

/// And ceilinged, which SM-2 does not do. Textbook SM-2 lets a perpetually
/// perfect item drift above 2.5 and grow without bound; with a fourteen-day
/// cap the growth is wasted anyway, and a bounded ease keeps the record's
/// numbers inside a range a person reading their notebook can make sense of.
pub const MAX_EASE: f32 = 2.5;

/// Where a new item starts.
pub const DEFAULT_EASE: f32 = 2.5;

/// Below this quality the item is a failure and the ladder resets.
pub const PASS_QUALITY: u8 = 3;

/// The ceiling rule's "held it together": median absolute deviation, in ms.
/// Shared with `findings.rs`, which calls the same number a collapse when a
/// higher tempo exceeds it.
pub const COMFORTABLE_MAD_MS: f64 = 15.0;

/// …over at least this many bars. Eight bars is long enough that a lucky
/// four-bar run cannot claim a tempo.
pub const COMFORTABLE_MIN_BARS: u32 = 8;

/// The peak rule's "you got through it": a score out of 100.
pub const PEAK_MIN_SCORE: f32 = 70.0;

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/// What the scheduler remembers about one reviewable thing — a passage of a
/// song, an exercise, a path step. W2 stores it; this module only transforms
/// it.
///
/// `due_day` and the `today` arguments are whole days on one monotonic axis
/// (days since the Unix epoch, in the player's own timezone). Days, not
/// timestamps: "due today" is a question about a calendar, and an item due
/// at 09:00 that a player picks up at 08:45 is due.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRecord {
    /// Consecutive passes. Reset to 0 by any failure.
    pub repetitions: u32,
    /// The gap that produced `due_day`.
    pub interval_days: u16,
    /// SM-2's easiness factor, in `[MIN_EASE, MAX_EASE]`.
    pub ease: f32,
    /// How many times this has ever been failed. Never reset — it is the
    /// one number that says "this one is hard for you".
    pub lapses: u32,
    /// The day this becomes due.
    pub due_day: i64,
}

impl ReviewRecord {
    /// A thing seen for the first time today: due immediately, no history.
    pub fn new(today: i64) -> Self {
        ReviewRecord {
            repetitions: 0,
            interval_days: 0,
            ease: DEFAULT_EASE,
            lapses: 0,
            due_day: today,
        }
    }

    /// Whether this is due on `today` (or overdue).
    pub fn is_due(&self, today: i64) -> bool {
        today >= self.due_day
    }

    /// Days overdue, 0 when not yet due. Used to order "due today".
    pub fn overdue_by(&self, today: i64) -> i64 {
        (today - self.due_day).max(0)
    }
}

// ---------------------------------------------------------------------------
// Score → quality
// ---------------------------------------------------------------------------

/// SM-2 asks the learner how it felt on a 0–5 scale. The coach does not
/// ask — it measured. These bands are the translation, and the pass mark
/// sits on the same 70 the peak ceiling uses, so "you got through it" means
/// one thing in this app rather than two.
///
/// | score   | quality | reading                        |
/// |---------|---------|--------------------------------|
/// | ≥ 95    | 5       | nothing to say                 |
/// | ≥ 85    | 4       | solid                          |
/// | ≥ 70    | 3       | got through it — a pass        |
/// | ≥ 55    | 2       | came apart                     |
/// | ≥ 40    | 1       | mostly did not happen          |
/// | else    | 0       | no                             |
pub fn quality_from_score(score: f32) -> u8 {
    if score >= 95.0 {
        5
    } else if score >= 85.0 {
        4
    } else if score >= PEAK_MIN_SCORE {
        3
    } else if score >= 55.0 {
        2
    } else if score >= 40.0 {
        1
    } else {
        0
    }
}

/// The next record, given how today's attempt went.
///
/// The ladder, for a pass: **1 day → 3 days → previous × ease**, capped at
/// fourteen. For a failure: straight back to tomorrow, repetitions cleared,
/// one more lapse on the record. Ease moves by SM-2's own formula either
/// way, clamped into `[MIN_EASE, MAX_EASE]`.
pub fn review(record: &ReviewRecord, score: f32, today: i64) -> ReviewRecord {
    review_with_quality(record, quality_from_score(score), today)
}

/// `review`, for a caller that already has a quality. Exposed because the
/// property tests drive qualities directly, and because a future path step
/// may grade on something other than a 0–100 score.
pub fn review_with_quality(record: &ReviewRecord, quality: u8, today: i64) -> ReviewRecord {
    let quality = quality.min(5);
    let ease = next_ease(record.ease, quality);

    let (repetitions, interval_days, lapses) = if quality < PASS_QUALITY {
        // A failure puts it back to tomorrow. Not "half the interval", not
        // "a bit sooner" — if you could not play it, the next useful
        // attempt is the next day.
        (0, FIRST_INTERVAL_DAYS, record.lapses.saturating_add(1))
    } else {
        let repetitions = record.repetitions.saturating_add(1);
        let interval = match repetitions {
            1 => FIRST_INTERVAL_DAYS,
            2 => SECOND_INTERVAL_DAYS,
            _ => {
                let grown = f64::from(record.interval_days.max(SECOND_INTERVAL_DAYS))
                    * f64::from(ease);
                // `round` and not `ceil`: at ease 1.3 a three-day interval
                // becomes four either way, but rounding keeps the ladder
                // from inflating on every rung.
                grown.round().clamp(1.0, f64::from(MAX_INTERVAL_DAYS)) as u16
            }
        };
        (repetitions, interval.min(MAX_INTERVAL_DAYS), record.lapses)
    };

    ReviewRecord {
        repetitions,
        interval_days,
        ease,
        lapses,
        due_day: today.saturating_add(i64::from(interval_days)),
    }
}

/// SM-2's easiness update, clamped at both ends.
fn next_ease(ease: f32, quality: u8) -> f32 {
    let q = f32::from(quality);
    let delta = 0.1 - (5.0 - q) * (0.08 + (5.0 - q) * 0.02);
    (ease + delta).clamp(MIN_EASE, MAX_EASE)
}

/// The at-most-three of `COACH_UX.md` C2, as indices into `records`.
///
/// Most overdue first; ties broken by the harder item (lower ease), then by
/// position, so the same input always yields the same list. Nothing that is
/// not yet due appears at all — a backlog is not a practice plan.
pub fn due_today(records: &[ReviewRecord], today: i64, limit: usize) -> Vec<usize> {
    let mut due: Vec<usize> = (0..records.len())
        .filter(|&i| records[i].is_due(today))
        .collect();
    due.sort_by(|&a, &b| {
        records[b]
            .overdue_by(today)
            .cmp(&records[a].overdue_by(today))
            .then_with(|| {
                records[a]
                    .ease
                    .partial_cmp(&records[b].ease)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then(a.cmp(&b))
    });
    due.truncate(limit);
    due
}

// ---------------------------------------------------------------------------
// The ceiling
// ---------------------------------------------------------------------------

/// The two tempos worth remembering about a passage.
///
/// *Comfortable* is where you can actually play it; *peak* is the fastest
/// you have got through it at all. A routine is validated against both
/// (`ROADMAP.md` §2.6), and the coach quotes them back ("a month ago this
/// topped out at 96; today you held 120").
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ceiling {
    /// Highest BPM held with MAD ≤ 15 ms over at least 8 bars.
    pub comfortable_bpm: Option<u16>,
    /// Highest BPM attempted with a score ≥ 70.
    pub peak_bpm: Option<u16>,
}

/// One attempt at one tempo, as the ceiling rule sees it.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TempoAttempt {
    pub bpm: u16,
    pub score: f32,
    pub mad_ms: f64,
    /// Bars of sustained play in this attempt.
    pub bars: u32,
}

/// Fold new attempts into a ceiling.
///
/// **A ceiling never falls.** It is a record of what has been done, not a
/// statement about today — a bad night does not un-play last week. What
/// makes it honest instead of flattering is that it is hard to move: eight
/// bars at MAD ≤ 15 ms is not something you stumble into.
pub fn update_ceiling(current: &Ceiling, attempts: &[TempoAttempt]) -> Ceiling {
    let mut out = *current;
    for a in attempts {
        if a.mad_ms <= COMFORTABLE_MAD_MS && a.bars >= COMFORTABLE_MIN_BARS {
            out.comfortable_bpm = Some(out.comfortable_bpm.map_or(a.bpm, |c| c.max(a.bpm)));
        }
        if a.score >= PEAK_MIN_SCORE {
            out.peak_bpm = Some(out.peak_bpm.map_or(a.bpm, |p| p.max(a.bpm)));
        }
    }
    // A tempo you held cleanly for eight bars is a tempo you reached, even
    // if the score never crossed 70 (a passage with a lot of rests can hold
    // perfect time and still lose completeness). Peak is never the smaller
    // of the two.
    if let Some(c) = out.comfortable_bpm {
        out.peak_bpm = Some(out.peak_bpm.map_or(c, |p| p.max(c)));
    }
    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// A deterministic LCG — the property tests need a spread of inputs and
    /// must produce the same spread on every machine and every run. Numerical
    /// Recipes' constants.
    struct Lcg(u32);
    impl Lcg {
        fn next(&mut self) -> u32 {
            self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            self.0
        }
        fn below(&mut self, n: u32) -> u32 {
            self.next() % n
        }
    }

    #[test]
    fn quality_bands_are_the_documented_table() {
        let table: &[(f32, u8)] = &[
            (100.0, 5),
            (95.0, 5),
            (94.9, 4),
            (85.0, 4),
            (84.9, 3),
            (70.0, 3),
            (69.9, 2),
            (55.0, 2),
            (54.9, 1),
            (40.0, 1),
            (39.9, 0),
            (0.0, 0),
        ];
        for &(score, expected) in table {
            assert_eq!(
                quality_from_score(score),
                expected,
                "score {score} should map to quality {expected}"
            );
        }
    }

    #[test]
    fn the_pass_mark_is_the_peak_mark() {
        // One number for "you got through it", not two.
        assert_eq!(quality_from_score(PEAK_MIN_SCORE), PASS_QUALITY);
        assert!(quality_from_score(PEAK_MIN_SCORE - 0.1) < PASS_QUALITY);
    }

    #[test]
    fn the_ladder_is_one_three_then_ease() {
        let mut r = ReviewRecord::new(0);
        let mut day = 0i64;
        let mut seen = Vec::new();
        for _ in 0..8 {
            r = review(&r, 100.0, day);
            seen.push(r.interval_days);
            day = r.due_day;
        }
        // 1 → 3 → round(3 × 2.5) = 8 → round(8 × 2.5) = 20, capped → 14.
        assert_eq!(&seen[..4], &[1, 3, 8, 14], "ladder was {seen:?}");
        assert!(
            seen[4..].iter().all(|&i| i == MAX_INTERVAL_DAYS),
            "ladder should sit at the cap: {seen:?}"
        );
    }

    #[test]
    fn schedule_is_monotonic_while_it_is_passing() {
        let mut r = ReviewRecord::new(0);
        let mut day = 0i64;
        let mut previous = 0u16;
        for _ in 0..30 {
            r = review(&r, 88.0, day);
            assert!(
                r.interval_days >= previous,
                "interval fell from {previous} to {}",
                r.interval_days
            );
            previous = r.interval_days;
            day = r.due_day;
        }
    }

    #[test]
    fn the_cap_holds_at_the_easiest_possible_item() {
        let mut r = ReviewRecord::new(0);
        let mut day = 0i64;
        for _ in 0..100 {
            r = review(&r, 100.0, day);
            assert!(
                r.interval_days <= MAX_INTERVAL_DAYS,
                "interval {} exceeded the cap",
                r.interval_days
            );
            day = r.due_day;
        }
        assert_eq!(r.interval_days, MAX_INTERVAL_DAYS);
    }

    #[test]
    fn a_failure_resets_the_ladder_and_counts_a_lapse() {
        let mut r = ReviewRecord::new(0);
        let mut day = 0i64;
        for _ in 0..5 {
            r = review(&r, 100.0, day);
            day = r.due_day;
        }
        assert!(r.interval_days > 1, "precondition: the ladder had climbed");
        let before = r;

        let after = review(&before, 30.0, day);
        assert_eq!(after.repetitions, 0);
        assert_eq!(after.interval_days, FIRST_INTERVAL_DAYS);
        assert_eq!(after.due_day, day + 1);
        assert_eq!(after.lapses, before.lapses + 1);
        assert!(after.ease < before.ease, "a failure should make it harder");
    }

    #[test]
    fn ease_never_leaves_its_bounds() {
        // Floor: fail it forever.
        let mut r = ReviewRecord::new(0);
        for d in 0..50 {
            r = review(&r, 0.0, d);
            assert!((MIN_EASE..=MAX_EASE).contains(&r.ease), "ease {}", r.ease);
        }
        assert_eq!(r.ease, MIN_EASE);
        // Ceiling: ace it forever.
        let mut r = ReviewRecord::new(0);
        for d in 0..50 {
            r = review(&r, 100.0, d);
            assert!((MIN_EASE..=MAX_EASE).contains(&r.ease), "ease {}", r.ease);
        }
        assert_eq!(r.ease, MAX_EASE);
    }

    #[test]
    fn property_every_transition_respects_the_invariants() {
        let mut rng = Lcg(0x5EED_1234);
        for case in 0..5_000u32 {
            let mut r = ReviewRecord::new(0);
            let mut day = i64::from(rng.below(400));
            for _ in 0..12 {
                let quality = rng.below(6) as u8;
                let before = r;
                r = review_with_quality(&before, quality, day);

                assert!(
                    (MIN_EASE..=MAX_EASE).contains(&r.ease),
                    "case {case}: ease {} out of bounds",
                    r.ease
                );
                assert!(
                    r.interval_days >= 1 && r.interval_days <= MAX_INTERVAL_DAYS,
                    "case {case}: interval {} out of bounds",
                    r.interval_days
                );
                assert_eq!(
                    r.due_day,
                    day + i64::from(r.interval_days),
                    "case {case}: due day is not today plus the interval"
                );
                if quality < PASS_QUALITY {
                    assert_eq!(r.repetitions, 0, "case {case}: a failure must reset");
                    assert_eq!(r.interval_days, FIRST_INTERVAL_DAYS);
                    assert_eq!(r.lapses, before.lapses + 1);
                } else {
                    assert_eq!(r.repetitions, before.repetitions + 1);
                    assert_eq!(r.lapses, before.lapses);
                    assert!(
                        r.interval_days >= before.interval_days,
                        "case {case}: a pass shortened the interval, {} → {}",
                        before.interval_days,
                        r.interval_days
                    );
                }
                day = r.due_day;
            }
        }
    }

    #[test]
    fn review_is_deterministic() {
        let r = ReviewRecord::new(10);
        let a = review(&r, 77.0, 12);
        let b = review(&r, 77.0, 12);
        assert_eq!(a, b);
    }

    #[test]
    fn due_today_is_at_most_three_most_overdue_first() {
        let today = 100i64;
        let records = vec![
            ReviewRecord { due_day: 99, ease: 2.5, ..ReviewRecord::new(0) }, // 1 day over
            ReviewRecord { due_day: 105, ease: 2.5, ..ReviewRecord::new(0) }, // not due
            ReviewRecord { due_day: 90, ease: 2.5, ..ReviewRecord::new(0) }, // 10 days over
            ReviewRecord { due_day: 100, ease: 2.5, ..ReviewRecord::new(0) }, // today
            ReviewRecord { due_day: 95, ease: 2.5, ..ReviewRecord::new(0) }, // 5 days over
        ];
        assert_eq!(due_today(&records, today, 3), vec![2, 4, 0]);
    }

    #[test]
    fn due_today_breaks_ties_on_the_harder_item_then_position() {
        let today = 10i64;
        let records = vec![
            ReviewRecord { due_day: 10, ease: 2.5, ..ReviewRecord::new(0) },
            ReviewRecord { due_day: 10, ease: 1.4, ..ReviewRecord::new(0) },
            ReviewRecord { due_day: 10, ease: 2.5, ..ReviewRecord::new(0) },
        ];
        assert_eq!(due_today(&records, today, 3), vec![1, 0, 2]);
    }

    #[test]
    fn ceiling_takes_the_highest_clean_tempo_and_never_falls() {
        let start = Ceiling::default();
        let after = update_ceiling(
            &start,
            &[
                TempoAttempt { bpm: 100, score: 92.0, mad_ms: 9.0, bars: 16 },
                TempoAttempt { bpm: 120, score: 88.0, mad_ms: 12.0, bars: 12 },
                // Too short to claim the tempo.
                TempoAttempt { bpm: 140, score: 80.0, mad_ms: 8.0, bars: 4 },
                // Too loose to claim it, but it counts as a peak.
                TempoAttempt { bpm: 150, score: 74.0, mad_ms: 22.0, bars: 32 },
                // Fell apart — neither.
                TempoAttempt { bpm: 165, score: 40.0, mad_ms: 44.0, bars: 32 },
            ],
        );
        assert_eq!(after.comfortable_bpm, Some(120));
        assert_eq!(after.peak_bpm, Some(150));

        // A bad night changes nothing.
        let later = update_ceiling(
            &after,
            &[TempoAttempt { bpm: 90, score: 55.0, mad_ms: 30.0, bars: 16 }],
        );
        assert_eq!(later, after);
    }

    #[test]
    fn ceiling_boundaries_are_inclusive() {
        let at_the_line = update_ceiling(
            &Ceiling::default(),
            &[TempoAttempt {
                bpm: 132,
                score: PEAK_MIN_SCORE,
                mad_ms: COMFORTABLE_MAD_MS,
                bars: COMFORTABLE_MIN_BARS,
            }],
        );
        assert_eq!(at_the_line.comfortable_bpm, Some(132));
        assert_eq!(at_the_line.peak_bpm, Some(132));

        let just_over = update_ceiling(
            &Ceiling::default(),
            &[TempoAttempt {
                bpm: 132,
                score: PEAK_MIN_SCORE - 0.1,
                mad_ms: COMFORTABLE_MAD_MS + 0.1,
                bars: COMFORTABLE_MIN_BARS - 1,
            }],
        );
        assert_eq!(just_over, Ceiling::default());
    }

    #[test]
    fn peak_is_never_below_comfortable() {
        // Perfect time, poor completeness — a clean tempo with no peak.
        let c = update_ceiling(
            &Ceiling::default(),
            &[TempoAttempt { bpm: 110, score: 62.0, mad_ms: 6.0, bars: 16 }],
        );
        assert_eq!(c.comfortable_bpm, Some(110));
        assert_eq!(c.peak_bpm, Some(110));
    }
}
