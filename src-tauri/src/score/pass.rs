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
//! * A metric this code cannot measure from timing (`noteIdentity`, which needs
//!   the pitch pass over the dry stem; or an id it does not know) is **not
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
    /// Metric ids the bars named that timing cannot measure. Not in the
    /// verdict, and a screen must say they were not checked.
    pub not_assessed: Vec<String>,
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
}

fn is_assessed(metric: &str) -> bool {
    matches!(
        metric,
        TIMING_EVENNESS | NOTES_HEARD | EXTRA_NOTES | ACCENT_PLACEMENT | EVENNESS_HOLD
    )
}

/// Judge a Take's finished bars against an Exercise's pass bars. `caught` is
/// false when the grade said "I didn't catch enough". `gap_ms` is the smallest
/// gap the score asks for, at the tempo played, the same one the grade's own
/// evenness used. `None` when there are no pass bars to judge against.
pub fn evaluate(
    bars: &[BarSample],
    pass_bars: &[PassBar],
    gap_ms: f64,
    caught: bool,
) -> Option<PassResult> {
    if pass_bars.is_empty() {
        return None;
    }
    let (assessed, not_assessed): (Vec<&PassBar>, Vec<&PassBar>) =
        pass_bars.iter().partition(|b| is_assessed(&b.metric));
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
        TIMING_EVENNESS => pooled_evenness(window, gap_ms),
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
        let r = evaluate(&bars, &alternate_picking(), GAP, true).unwrap();
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
        let r = evaluate(&bars, &alternate_picking(), GAP, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed);
        assert_eq!((r.held_bars, r.held_from_bar), (4, Some(2)));
        assert!(!r.counts_for_clean_tempo);
    }

    #[test]
    fn a_missed_note_a_bar_fails_notes_heard_and_says_so() {
        let bars: Vec<BarSample> = (0..8)
            .map(|_| BarSample {
                heard: 7,
                ..clean(3.0)
            })
            .collect();
        let r = evaluate(&bars, &alternate_picking(), GAP, true).unwrap();
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
        let r = evaluate(&bars, &alternate_picking(), GAP, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed, "two in four bars is the limit");
        bars[2].extra = 1;
        let r = evaluate(&bars, &alternate_picking(), GAP, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Failed);
        let extras = r.checks.iter().find(|c| c.metric == EXTRA_NOTES).unwrap();
        assert_eq!(extras.measured, Some(3.0));
    }

    #[test]
    fn too_short_and_not_caught_are_not_fails() {
        let r = evaluate(&vec![clean(3.0); 3], &alternate_picking(), GAP, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::TooShort);
        let r = evaluate(&vec![clean(3.0); 8], &alternate_picking(), GAP, false).unwrap();
        assert_eq!(r.verdict, PassVerdict::DidntCatchEnough);
        assert!(!r.counts_for_clean_tempo);
        assert!(evaluate(&vec![clean(3.0); 8], &[], GAP, true).is_none());
    }

    #[test]
    fn note_identity_is_not_assessed_and_does_not_decide() {
        let mut bars = alternate_picking();
        bars.push(bar("noteIdentity", Some(0.9), None, 4));
        let r = evaluate(&vec![clean(3.0); 4], &bars, GAP, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed);
        assert_eq!(r.not_assessed, vec!["noteIdentity".to_string()]);
        assert_eq!(r.checks.len(), 3);
    }

    #[test]
    fn evenness_hold_reads_the_end_of_the_take() {
        let bars_spec = vec![
            bar(TIMING_EVENNESS, Some(0.8), None, 16),
            bar(NOTES_HEARD, Some(0.9), None, 16),
            bar(EVENNESS_HOLD, Some(0.75), None, 4),
        ];
        let mut bars = vec![clean(3.0); 16];
        let r = evaluate(&bars, &bars_spec, GAP, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed);
        assert!(r.counts_for_clean_tempo);
        // The last four bars fall apart; pooled over sixteen, the median does
        // not notice, but the hold does.
        for b in bars.iter_mut().skip(12) {
            *b = sloppy();
        }
        let r = evaluate(&bars, &bars_spec, GAP, true).unwrap();
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
        let r = evaluate(&vec![accented(0.6); 4], &spec, GAP, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Passed);
        let r = evaluate(&vec![accented(0.33); 4], &spec, GAP, true).unwrap();
        assert_eq!(r.verdict, PassVerdict::Failed);
    }

    #[test]
    fn the_clean_tempo_is_the_fastest_take_that_counted() {
        let pass = evaluate(&vec![clean(3.0); 8], &alternate_picking(), GAP, true).unwrap();
        let short = evaluate(&vec![clean(3.0); 4], &alternate_picking(), GAP, true).unwrap();
        assert_eq!(clean_tempo([(90.0, &pass), (110.0, &short), (100.0, &pass)]), Some(100.0));
        assert_eq!(clean_tempo([(110.0, &short)]), None);
    }
}
