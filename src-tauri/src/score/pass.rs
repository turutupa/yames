//! Whether a Take passed its Exercise's bar, and whether it counts toward the
//! Exercise's clean tempo.
//!
//! An Exercise (`src/paths/format.ts`) carries `passBars`: a metric id from
//! `src/paths/metrics.ts`, a `min` or a `max`, and `overBars`, the number of
//! consecutive bars it must hold over. This is the rule that reads them, and
//! it is plain arithmetic over what [`super::TakeGrade`] already counted. No
//! number here comes from a model.
//!
//! **The rule, exactly.**
//!
//! * Only bars the transport finished count. A bar the player stopped in the
//!   middle of is not a bar of evidence either way.
//! * The window is the longest `overBars` among the bars, `W`. Every metric is
//!   measured over the same `W` consecutive bars, pooled: evenness over all the
//!   notes of the window, notes heard over everything due in it, extras per
//!   four bars of it. A window *holds* when every assessed bar is met in it.
//!   Evenness is a median, so one sloppy bar could hide in a pooled window:
//!   `timingEvenness` in a window is the lower of the pooled value and the
//!   worst single bar in it that has enough notes to measure.
//! * The Take **passes** when at least one window holds. A Take shorter than
//!   `W` finished bars is [`PassVerdict::TooShort`], and a Take the grade could
//!   not catch is [`PassVerdict::DidntCatchEnough`]: neither is a fail.
//! * `heldBars` is the longest stretch of bars covered by windows that hold
//!   one after another. The Take counts toward the **clean tempo** (BRIEF.md
//!   "Decisions": the highest tempo at which a Take passes its bar over at
//!   least 8 bars) when it passed and `heldBars` is at least
//!   [`CLEAN_TEMPO_MIN_BARS`].
//! * `evennessHold` is the exception to pooling: it is evenness over the last
//!   `overBars` finished bars of the Take, whichever window is being judged,
//!   because what it asks is whether the playing held to the end.
//! * `noteIdentity` is measured only when the pitch pass ran over the Take's
//!   own audio (`score::notes`) and can be believed: see [`notes_status`].
//!   Over a window it is the share of the notes that had a pitch that were the
//!   written one, an octave out counting as not the written note; notes the
//!   detector did not hear are `notesHeard`'s business and are left out.
//! * A metric this code cannot measure (`noteIdentity` when the pitch pass did
//!   not run or could not decide, or an id it does not know) is **not
//!   assessed**. It is listed in `notAssessed` and takes no part in the
//!   verdict, so a screen must say those were not checked.

use serde::{Deserialize, Serialize};

use super::evenness;

/// One entry of an Exercise's `passBars`, exactly as `format.ts` writes it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PassBar {
    /// An id from `METRICS` in `src/paths/metrics.ts`.
    pub metric: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    /// Consecutive bars this must hold over.
    pub over_bars: u32,
}

/// The fewest held bars a passing Take needs to count toward the clean tempo.
pub const CLEAN_TEMPO_MIN_BARS: u32 = 8;

/// `extraNotes` is counted per this many bars (`unit: "perFourBars"`).
const EXTRAS_PER_BARS: f64 = 4.0;

/// The metric ids this rule measures. Anything else is not assessed.
const TIMING_EVENNESS: &str = "timingEvenness";
const NOTES_HEARD: &str = "notesHeard";
const EXTRA_NOTES: &str = "extraNotes";
const ACCENT_PLACEMENT: &str = "accentPlacement";
const EVENNESS_HOLD: &str = "evennessHold";
const NOTE_IDENTITY: &str = "noteIdentity";

/// Right notes are not believed when the notes come closer together than this.
/// `plans/revamp/GRADING_LIMITS.md`, "Note identity": the tracker is right on
/// damped, clean and high-gain tones to sixteenths at 200 BPM (75 ms) and goes
/// wrong past it (0.89 on damped at 220), and wrong is worse than unheard: it
/// reads as the player's mistake. The same 75 ms as the picked-note trust limit
/// in `src/paths/metrics.ts`.
pub const NOTES_MIN_GAP_MS: f64 = 75.0;

/// Fewer notes with a pitch than this over the Take, and nothing is said.
pub const NOTES_MIN_PITCHED: u32 = 12;

/// Of the notes the detector heard, at least this share must come out with a
/// pitch. Below it the notes are ringing into each other (GRADING_LIMITS.md:
/// ringing and swept tones give a pitch for under half of them, at any tempo),
/// and the few that do come out are not a fair sample of the Take.
pub const NOTES_MIN_PITCHED_SHARE: f64 = 0.6;

/// More octave errors than this share of the pitched notes, and the tracker is
/// taken to be confusing a harmonic for the note rather than the player being
/// in the wrong octave: the two cannot be told apart from sound alone.
pub const NOTES_MAX_OCTAVE_SHARE: f64 = 0.25;

/// A window with fewer notes with a pitch than this has nothing to say about
/// right notes, and does not hold.
const NOTES_MIN_WINDOW_PITCHED: u32 = 4;

/// How a Take went against its bars.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PassVerdict {
    Passed,
    Failed,
    /// The grade said "I didn't catch enough". Not a fail: it may be the rig.
    DidntCatchEnough,
    /// Fewer finished bars than the longest `overBars`. Not a fail either:
    /// there was not enough of the Take to judge.
    TooShort,
}

/// One pass bar, as it came out in the window that explains the verdict: the
/// first window of the longest held stretch on a pass, and otherwise the
/// window that met the most bars (the earliest such).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BarCheck {
    pub metric: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    pub over_bars: u32,
    /// The value in that window. `None` when the window had nothing to
    /// measure it on (too few notes, no accents landed), which does not hold.
    pub measured: Option<f64>,
    pub held: bool,
}

/// What [`evaluate`] says about one Take.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PassResult {
    pub verdict: PassVerdict,
    /// `W`: the longest `overBars`, the size of every window.
    pub window_bars: u32,
    /// Finished bars the Take had.
    pub finished_bars: u32,
    /// The longest stretch covered by windows that held one after another.
    /// 0 unless the verdict is `Passed`.
    pub held_bars: u32,
    /// The first bar of that stretch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub held_from_bar: Option<u32>,
    /// Passed, over at least [`CLEAN_TEMPO_MIN_BARS`].
    pub counts_for_clean_tempo: bool,
    /// The window `checks` describes, by its first bar.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window_from_bar: Option<u32>,
    /// One per assessed pass bar, in the Exercise's order.
    pub checks: Vec<BarCheck>,
    /// Metric ids the bars named that this Take could not measure. Not in the
    /// verdict, and a screen must say they were not checked.
    pub not_assessed: Vec<String>,
    /// What the pitch pass made of the notes, when a bar names
    /// `noteIdentity`: whether it was measured, why not, and the counts over
    /// the finished bars.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<NotesCheck>,
}

/// Whether right notes could be measured on this Take.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NotesStatus {
    /// Measured: `noteIdentity` is in the checks and in the verdict.
    Measured,
    /// No pitch pass over this Take's audio (none captured, or not yet).
    NotRun,
    /// The notes come faster than [`NOTES_MIN_GAP_MS`].
    TooFast,
    /// Fewer than [`NOTES_MIN_PITCHED`] notes had a pitch.
    TooFew,
    /// Under [`NOTES_MIN_PITCHED_SHARE`] of the heard notes had a pitch: they
    /// ring into each other.
    NotesRing,
    /// Over [`NOTES_MAX_OCTAVE_SHARE`] octave errors: harmonic or player, it
    /// cannot be told.
    OctaveUnsure,
}

/// The pitch pass over a Take's finished bars, summed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesCheck {
    pub status: NotesStatus,
    pub right: u32,
    pub wrong: u32,
    pub octave: u32,
    /// Heard by the detector, but no pitch came out of it.
    pub unpitched: u32,
}

/// What the pitch pass said about the heard notes of one bar.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PitchCounts {
    pub right: u32,
    pub wrong: u32,
    pub octave: u32,
    pub unpitched: u32,
}

impl PitchCounts {
    fn pitched(&self) -> u32 {
        self.right + self.wrong + self.octave
    }

    fn add(&mut self, other: &PitchCounts) {
        self.right += other.right;
        self.wrong += other.wrong;
        self.octave += other.octave;
        self.unpitched += other.unpitched;
    }
}

/// One finished bar of a Take, as the rule reads it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct BarSample {
    pub due: u32,
    pub heard: u32,
    pub extra: u32,
    /// Deviation of every hit in the bar, ms.
    pub deviations_ms: Vec<f64>,
    /// Amplitudes of the hits the score marked accented, and of the rest.
    pub accented: Vec<f32>,
    pub plain: Vec<f32>,
    /// The pitch pass's verdicts on this bar's heard notes. All zero when it
    /// did not run.
    pub pitch: PitchCounts,
}

fn is_assessed(metric: &str, notes_measured: bool) -> bool {
    match metric {
        TIMING_EVENNESS | NOTES_HEARD | EXTRA_NOTES | ACCENT_PLACEMENT | EVENNESS_HOLD => true,
        NOTE_IDENTITY => notes_measured,
        _ => false,
    }
}

/// Whether the pitch pass can be believed on this Take, from its verdicts over
/// the finished bars. `ran` is false when there was no pitch pass at all.
/// Plain thresholds, every one of them from `GRADING_LIMITS.md`, and a design
/// value until a real rig has been through them.
pub fn notes_status(bars: &[BarSample], gap_ms: f64, ran: bool) -> NotesCheck {
    let mut sum = PitchCounts::default();
    for b in bars {
        sum.add(&b.pitch);
    }
    let pitched = sum.pitched();
    let status = if !ran {
        NotesStatus::NotRun
    } else if gap_ms < NOTES_MIN_GAP_MS {
        NotesStatus::TooFast
    } else if pitched < NOTES_MIN_PITCHED {
        NotesStatus::TooFew
    } else if (pitched as f64) < NOTES_MIN_PITCHED_SHARE * (pitched + sum.unpitched) as f64 {
        NotesStatus::NotesRing
    } else if sum.octave as f64 > NOTES_MAX_OCTAVE_SHARE * pitched as f64 {
        NotesStatus::OctaveUnsure
    } else {
        NotesStatus::Measured
    };
    NotesCheck {
        status,
        right: sum.right,
        wrong: sum.wrong,
        octave: sum.octave,
        unpitched: sum.unpitched,
    }
}

/// Judge a Take's finished bars against an Exercise's pass bars. `caught` is
/// false when the grade said "I didn't catch enough". `gap_ms` is the smallest
/// gap the score asks for, at the tempo played, the same one the grade's own
/// evenness used. `notes_ran` says the pitch pass ran over the Take's audio and
/// its verdicts are in the bars. `None` when there are no pass bars to judge
/// against.
pub fn evaluate(
    bars: &[BarSample],
    pass_bars: &[PassBar],
    gap_ms: f64,
    caught: bool,
    notes_ran: bool,
) -> Option<PassResult> {
    if pass_bars.is_empty() {
        return None;
    }
    let notes = pass_bars
        .iter()
        .any(|b| b.metric == NOTE_IDENTITY)
        .then(|| notes_status(bars, gap_ms, notes_ran));
    let measured = notes.is_some_and(|n| n.status == NotesStatus::Measured);
    let (assessed, not_assessed): (Vec<&PassBar>, Vec<&PassBar>) =
        pass_bars.iter().partition(|b| is_assessed(&b.metric, measured));
    let mut not_assessed: Vec<String> = not_assessed.iter().map(|b| b.metric.clone()).collect();
    not_assessed.dedup();
    let window = pass_bars.iter().map(|b| b.over_bars.max(1)).max().unwrap_or(1);
    let finished = bars.len() as u32;
    let mut out = PassResult {
        verdict: PassVerdict::Failed,
        window_bars: window,
        finished_bars: finished,
        held_bars: 0,
        held_from_bar: None,
        counts_for_clean_tempo: false,
        window_from_bar: None,
        checks: Vec::new(),
        not_assessed,
        notes,
    };
    if !caught {
        out.verdict = PassVerdict::DidntCatchEnough;
        return Some(out);
    }
    if finished < window {
        out.verdict = PassVerdict::TooShort;
        return Some(out);
    }

    // Every window, every assessed bar.
    let w = window as usize;
    let windows: Vec<Vec<BarCheck>> = (0..=bars.len() - w)
        .map(|s| {
            assessed
                .iter()
                .map(|b| check(b, &bars[s..s + w], bars, gap_ms))
                .collect()
        })
        .collect();
    let holds = |checks: &[BarCheck]| checks.iter().all(|c| c.held);

    // The longest run of consecutive windows that hold. Windows s..=e cover
    // bars s..e+W.
    let mut best_run: Option<(usize, usize)> = None;
    let mut run_start: Option<usize> = None;
    for (s, checks) in windows.iter().enumerate() {
        if holds(checks) {
            let start = *run_start.get_or_insert(s);
            if best_run.is_none_or(|(a, b)| s - start > b - a) {
                best_run = Some((start, s));
            }
        } else {
            run_start = None;
        }
    }

    let shown = match best_run {
        Some((start, end)) => {
            out.verdict = PassVerdict::Passed;
            out.held_bars = (end - start) as u32 + window;
            out.held_from_bar = Some(start as u32);
            out.counts_for_clean_tempo = out.held_bars >= CLEAN_TEMPO_MIN_BARS;
            start
        }
        None => {
            // The window that met the most bars, the earliest of those.
            let met = |checks: &[BarCheck]| checks.iter().filter(|c| c.held).count();
            let mut best = 0;
            for (s, checks) in windows.iter().enumerate() {
                if met(checks) > met(&windows[best]) {
                    best = s;
                }
            }
            best
        }
    };
    out.window_from_bar = Some(shown as u32);
    out.checks = windows[shown].clone();
    Some(out)
}

/// One pass bar over one window. `take` is every finished bar, for the one
/// metric that reads the end of the Take rather than the window.
fn check(bar: &PassBar, window: &[BarSample], take: &[BarSample], gap_ms: f64) -> BarCheck {
    let measured = match bar.metric.as_str() {
        // Pooled evenness is a median, so one sloppy bar can hide inside a
        // window. The window's value is therefore the lower of the pooled
        // number and the worst single bar that has enough notes to measure.
        TIMING_EVENNESS => pooled_evenness(window, gap_ms).map(|pooled| {
            window
                .iter()
                .filter_map(|b| pooled_evenness(std::slice::from_ref(b), gap_ms))
                .fold(pooled, f64::min)
        }),
        NOTES_HEARD => {
            let due: u32 = window.iter().map(|b| b.due).sum();
            let heard: u32 = window.iter().map(|b| b.heard).sum();
            (due > 0).then(|| heard as f64 / due as f64)
        }
        EXTRA_NOTES => {
            let extra: u32 = window.iter().map(|b| b.extra).sum();
            Some(extra as f64 * EXTRAS_PER_BARS / window.len() as f64)
        }
        ACCENT_PLACEMENT => accent_agreement(window),
        NOTE_IDENTITY => {
            let mut sum = PitchCounts::default();
            for b in window {
                sum.add(&b.pitch);
            }
            let pitched = sum.pitched();
            (pitched >= NOTES_MIN_WINDOW_PITCHED).then(|| sum.right as f64 / pitched as f64)
        }
        EVENNESS_HOLD => {
            let last = (bar.over_bars.max(1) as usize).min(take.len());
            pooled_evenness(&take[take.len() - last..], gap_ms)
        }
        _ => None,
    };
    let held = measured.is_some_and(|v| {
        bar.min.is_none_or(|min| v >= min) && bar.max.is_none_or(|max| v <= max)
    });
    BarCheck {
        metric: bar.metric.clone(),
        min: bar.min,
        max: bar.max,
        over_bars: bar.over_bars,
        measured,
        held,
    }
}

fn pooled_evenness(bars: &[BarSample], gap_ms: f64) -> Option<f64> {
    let devs: Vec<f64> = bars.iter().flat_map(|b| b.deviations_ms.iter().copied()).collect();
    evenness(&devs, gap_ms).map(|(e, _)| e as f64)
}

/// `accent_agreement` in `score.rs`, over a window: 1.0 when the accented
/// hits came out twice as loud as the rest, 0.0 when no louder.
fn accent_agreement(bars: &[BarSample]) -> Option<f64> {
    let accented: Vec<f32> = bars.iter().flat_map(|b| b.accented.iter().copied()).collect();
    let plain: Vec<f32> = bars.iter().flat_map(|b| b.plain.iter().copied()).collect();
    if accented.len() < 2 || plain.len() < 2 {
        return None;
    }
    let mean = |v: &[f32]| v.iter().sum::<f32>() / v.len() as f32;
    let (a, p) = (mean(&accented), mean(&plain));
    if p <= 0.0 {
        return None;
    }
    Some(((a / p - 1.0) as f64).clamp(0.0, 1.0))
}

/// The clean tempo of an Exercise, from its Takes: the highest tempo of a Take
/// that counted toward it. `None` until one has.
pub fn clean_tempo<'a>(takes: impl IntoIterator<Item = (f64, &'a PassResult)>) -> Option<f64> {
    takes
        .into_iter()
        .filter(|(_, r)| r.counts_for_clean_tempo)
        .map(|(bpm, _)| bpm)
        .fold(None, |best: Option<f64>, bpm| Some(best.map_or(bpm, |b| b.max(bpm))))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bar(metric: &str, min: Option<f64>, max: Option<f64>, over: u32) -> PassBar {
        PassBar {
            metric: metric.into(),
            min,
            max,
            over_bars: over,
        }
    }

    /// The Alternate Picking bars, as `alternate-picking.json` writes them.
    fn alternate_picking() -> Vec<PassBar> {
        vec![
            bar(TIMING_EVENNESS, Some(0.85), None, 4),
            bar(NOTES_HEARD, Some(0.95), None, 4),
            bar(EXTRA_NOTES, None, Some(2.0), 4),
        ]
    }

    /// A bar of eight eighths, every one heard, deviations alternating ±`d`.
    fn clean(d: f64) -> BarSample {
        BarSample {
            due: 8,
            heard: 8,
            extra: 0,
            deviations_ms: (0..8).map(|i| if i % 2 == 0 { d } else { -d }).collect(),
            ..BarSample::default()
        }
    }

    fn sloppy() -> BarSample {
        // A spread of ±60 ms at 100 BPM eighths (gap 300 ms, k 40 ms).
        clean(60.0)
    }

    const GAP: f64 = 300.0;

    #[test]
    fn eight_clean_bars_pass_and_count_for_the_clean_tempo() {
        let bars = vec![clean(3.0); 8];
        let r = evaluate(&bars, &alternate_picking(), GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed);
        assert_eq!(r.held_bars, 8);
        assert_eq!(r.held_from_bar, Some(0));
        assert!(r.counts_for_clean_tempo);
        assert!(r.checks.iter().all(|c| c.held));
        assert!(r.not_assessed.is_empty());
    }

    #[test]
    fn four_clean_bars_pass_but_do_not_make_a_clean_tempo() {
        let mut bars = vec![sloppy(); 2];
        bars.extend(vec![clean(3.0); 4]);
        bars.extend(vec![sloppy(); 2]);
        let r = evaluate(&bars, &alternate_picking(), GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed);
        assert_eq!((r.held_bars, r.held_from_bar), (4, Some(2)));
        assert!(!r.counts_for_clean_tempo);
    }

    #[test]
    fn one_sloppy_bar_among_clean_ones_breaks_the_held_stretch() {
        let mut bars = vec![clean(3.0); 9];
        bars[4] = sloppy();
        let r = evaluate(&bars, &alternate_picking(), GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed);
        assert_eq!((r.held_bars, r.held_from_bar), (4, Some(0)));
        assert!(!r.counts_for_clean_tempo, "a sloppy bar must not hide inside the clean tempo");
    }

    #[test]
    fn a_missed_note_a_bar_fails_notes_heard_and_says_so() {
        let bars: Vec<BarSample> = (0..8)
            .map(|_| BarSample {
                heard: 7,
                ..clean(3.0)
            })
            .collect();
        let r = evaluate(&bars, &alternate_picking(), GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Failed);
        let heard = r.checks.iter().find(|c| c.metric == NOTES_HEARD).unwrap();
        assert!(!heard.held);
        assert!((heard.measured.unwrap() - 7.0 / 8.0).abs() < 1e-9);
        let even = r.checks.iter().find(|c| c.metric == TIMING_EVENNESS).unwrap();
        assert!(even.held, "only the bar that failed is said to have failed");
    }

    #[test]
    fn extras_are_counted_per_four_bars() {
        let mut bars = vec![clean(3.0); 4];
        bars[1].extra = 2;
        let r = evaluate(&bars, &alternate_picking(), GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed, "two in four bars is the limit");
        bars[2].extra = 1;
        let r = evaluate(&bars, &alternate_picking(), GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Failed);
        let extras = r.checks.iter().find(|c| c.metric == EXTRA_NOTES).unwrap();
        assert_eq!(extras.measured, Some(3.0));
    }

    #[test]
    fn too_short_and_not_caught_are_not_fails() {
        let r = evaluate(&vec![clean(3.0); 3], &alternate_picking(), GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::TooShort);
        let r = evaluate(&vec![clean(3.0); 8], &alternate_picking(), GAP, false, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::DidntCatchEnough);
        assert!(!r.counts_for_clean_tempo);
        assert!(evaluate(&vec![clean(3.0); 8], &[], GAP, true, false).is_none());
    }

    #[test]
    fn note_identity_is_not_assessed_and_does_not_decide() {
        let mut bars = alternate_picking();
        bars.push(bar("noteIdentity", Some(0.9), None, 4));
        let r = evaluate(&vec![clean(3.0); 4], &bars, GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed);
        assert_eq!(r.not_assessed, vec!["noteIdentity".to_string()]);
        assert_eq!(r.checks.len(), 3);
        assert_eq!(r.notes.map(|n| n.status), Some(NotesStatus::NotRun));
    }

    /// Alternate Picking's bars with `noteIdentity` on, as 24 of its
    /// Exercises write them.
    fn with_notes() -> Vec<PassBar> {
        let mut bars = alternate_picking();
        bars.push(bar(NOTE_IDENTITY, Some(0.9), None, 4));
        bars
    }

    /// A clean bar whose eight heard notes the pitch pass called as given.
    fn pitched(right: u32, wrong: u32, octave: u32, unpitched: u32) -> BarSample {
        BarSample {
            pitch: PitchCounts {
                right,
                wrong,
                octave,
                unpitched,
            },
            ..clean(3.0)
        }
    }

    fn notes_check(r: &PassResult) -> &BarCheck {
        r.checks.iter().find(|c| c.metric == NOTE_IDENTITY).expect("noteIdentity was assessed")
    }

    #[test]
    fn right_notes_are_measured_when_the_pitch_pass_ran() {
        let r = evaluate(&vec![pitched(8, 0, 0, 0); 8], &with_notes(), GAP, true, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed, "{r:?}");
        assert!(r.not_assessed.is_empty());
        assert_eq!(r.checks.len(), 4);
        assert_eq!(notes_check(&r).measured, Some(1.0));
        let notes = r.notes.unwrap();
        assert_eq!((notes.status, notes.right), (NotesStatus::Measured, 64));
        assert!(r.counts_for_clean_tempo);
    }

    #[test]
    fn wrong_notes_fail_the_take_and_say_so() {
        // Two of eight wrong in every bar: 0.75 against 0.9.
        let r = evaluate(&vec![pitched(6, 2, 0, 0); 8], &with_notes(), GAP, true, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Failed);
        let check = notes_check(&r);
        assert!(!check.held);
        assert_eq!(check.measured, Some(0.75));
        // The timing bars held: only the bar that failed is said to have.
        assert!(r.checks.iter().filter(|c| c.metric != NOTE_IDENTITY).all(|c| c.held));
    }

    #[test]
    fn an_octave_out_is_not_the_written_note() {
        // One a bar: 7 of 8, under 0.9. Under the octave share that would make
        // the whole reading doubtful, so it is measured and it counts.
        let r = evaluate(&vec![pitched(7, 0, 1, 0); 8], &with_notes(), GAP, true, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Failed);
        assert_eq!(notes_check(&r).measured, Some(0.875));
        // Three a bar is more than a quarter: harmonic or player, it cannot be
        // told, and nothing is said.
        let r = evaluate(&vec![pitched(5, 0, 3, 0); 8], &with_notes(), GAP, true, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed, "the timing decides: {r:?}");
        assert_eq!(r.notes.unwrap().status, NotesStatus::OctaveUnsure);
        assert_eq!(r.not_assessed, vec![NOTE_IDENTITY.to_string()]);
    }

    #[test]
    fn notes_that_ring_into_each_other_are_not_assessed() {
        // Three of eight came out with a pitch: the rest rang into the next.
        let r = evaluate(&vec![pitched(3, 0, 0, 5); 8], &with_notes(), GAP, true, true).unwrap();
        assert_eq!(r.notes.unwrap().status, NotesStatus::NotesRing);
        assert_eq!(r.not_assessed, vec![NOTE_IDENTITY.to_string()]);
        assert_eq!(r.verdict, PassVerdict::Passed);
    }

    #[test]
    fn too_fast_or_too_few_notes_are_not_assessed() {
        let r = evaluate(&vec![pitched(8, 0, 0, 0); 8], &with_notes(), 60.0, true, true).unwrap();
        assert_eq!(r.notes.unwrap().status, NotesStatus::TooFast);
        assert!(r.not_assessed.contains(&NOTE_IDENTITY.to_string()));
        let r = evaluate(&vec![pitched(2, 0, 0, 0); 4], &with_notes(), GAP, true, true).unwrap();
        assert_eq!(r.notes.unwrap().status, NotesStatus::TooFew);
        assert!(r.not_assessed.contains(&NOTE_IDENTITY.to_string()));
    }

    #[test]
    fn a_window_with_too_few_pitched_notes_does_not_hold() {
        // Measured over the Take, but bars 4 to 7 gave no pitch for the one
        // note in each the tracker was asked about: the window over them has
        // nothing to say, so it does not hold rather than passing on notes
        // nobody heard.
        let mut bars = vec![pitched(8, 0, 0, 0); 4];
        bars.extend(vec![pitched(0, 0, 0, 1); 4]);
        let r = evaluate(&bars, &with_notes(), GAP, true, true).unwrap();
        assert_eq!(r.notes.unwrap().status, NotesStatus::Measured);
        assert_eq!(r.verdict, PassVerdict::Passed);
        assert_eq!((r.held_bars, r.held_from_bar), (7, Some(0)));
        assert!(!r.counts_for_clean_tempo, "the last window does not hold: {r:?}");
    }

    #[test]
    fn evenness_hold_reads_the_end_of_the_take() {
        let bars_spec = vec![
            bar(TIMING_EVENNESS, Some(0.8), None, 16),
            bar(NOTES_HEARD, Some(0.9), None, 16),
            bar(EVENNESS_HOLD, Some(0.75), None, 4),
        ];
        let mut bars = vec![clean(3.0); 16];
        let r = evaluate(&bars, &bars_spec, GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed);
        assert!(r.counts_for_clean_tempo);
        // The last four bars fall apart; pooled over sixteen, the median does
        // not notice, but the hold does.
        for b in bars.iter_mut().skip(12) {
            *b = sloppy();
        }
        let r = evaluate(&bars, &bars_spec, GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Failed);
        let hold = r.checks.iter().find(|c| c.metric == EVENNESS_HOLD).unwrap();
        assert!(!hold.held);
    }

    #[test]
    fn accents_need_to_come_out_louder() {
        let spec = vec![bar(ACCENT_PLACEMENT, Some(0.7), None, 4)];
        let accented = |a: f32| BarSample {
            accented: vec![a, a],
            plain: vec![0.3; 6],
            ..clean(3.0)
        };
        let r = evaluate(&vec![accented(0.6); 4], &spec, GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed);
        let r = evaluate(&vec![accented(0.33); 4], &spec, GAP, true, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::Failed);
    }

    #[test]
    fn the_clean_tempo_is_the_fastest_take_that_counted() {
        let pass = evaluate(&vec![clean(3.0); 8], &alternate_picking(), GAP, true, false).unwrap();
        let short = evaluate(&vec![clean(3.0); 4], &alternate_picking(), GAP, true, false).unwrap();
        assert_eq!(clean_tempo([(90.0, &pass), (110.0, &short), (100.0, &pass)]), Some(100.0));
        assert_eq!(clean_tempo([(110.0, &short)]), None);
    }
}
