//! Audio through the detector and the scorer, against a known answer.
//!
//! Every other timing suite in this repo starts after the detector: from a
//! list of onsets, or from matched beats. So nothing could see a detector that
//! stopped hearing a sustained note two seconds in, and that take still scored
//! 98. This one starts from samples. It writes them into the real
//! `RingBuffer`, polls the real `OnsetCore` the way the detector's thread does,
//! feeds the real `ScheduleRun`, and compares what comes out with what the
//! generator was told to play: heard, missed, extra and evenness against ground
//! truth, for the same `TakeGrade` a screen reads.
//!
//! **Synthetic means synthetic.** Passing here shows that the path does what it
//! claims on signals built to be hard. It shows nothing about a real guitar.
//! `audio_fixtures/README.md` is how to drop in a recording, which goes through
//! exactly the same code; `plans/revamp/GRADING_LIMITS.md` is what was measured.
//!
//!   npm run test:grading                 # the gates
//!   npm run test:grading -- -- --nocapture  # the report lines
//!   npm run test:grading:measure         # the limit tables, in release
#![allow(dead_code)]

#[path = "pitch_fixtures/synth.rs"]
mod synth;
#[path = "audio_fixtures/signals.rs"]
mod signals;

use std::fs;
use std::path::{Path, PathBuf};

use signals::{render, Noise, Note, Pattern, Tone};
use synth::Rng;
use yames_lib::audio_input::RingBuffer;
use yames_lib::instrument::Instrument;
use yames_lib::onset::{Onset, OnsetCore, TempoContext, ONSET_HOP_SIZE};
use yames_lib::pitch::{
    identify_take_notes, note_identity, MatchedOnset, NoteIdentity, OnsetState as PitchState,
    PitchConfig, ScoreNote,
};
use yames_lib::score::pass::clean_tempo;
use yames_lib::score::{
    evenness, match_attempt, smallest_gap_beats, BeatMap, CalibrationSource, ExpectedOnset,
    NoCatchReason, OnsetState, PassBar, PassResult, PassVerdict, PlayedOnset, ScheduleReport,
    ScheduleRun, ScoreSchedule, TakeVerdict,
};

const RATE: u32 = 48_000;

// ──────────────────────────────────────────────────────────────────────
// Audio → onsets, the way the detector's thread does it
// ──────────────────────────────────────────────────────────────────────

/// How the audio reaches the detector. The defaults are the numbers of an
/// ordinary machine: a 256-frame input buffer, the thread waking about every
/// five milliseconds and a bit.
#[derive(Debug, Clone, Copy)]
struct Feed {
    input_frames: usize,
    poll_ms: f64,
    poll_jitter_ms: f64,
    hop: usize,
}

impl Default for Feed {
    fn default() -> Self {
        Self {
            input_frames: 256,
            poll_ms: 5.2,
            poll_jitter_ms: 0.6,
            hop: ONSET_HOP_SIZE,
        }
    }
}

/// Run `samples` through the detector. `gap_ms` is what the analyzer publishes
/// when a schedule is loaded: the smallest gap the score asks for. Returned
/// times are in ms from the first sample, with `lag_ms` of system lag on top.
fn detect(samples: &[f32], rate: u32, bpm: f64, gap_ms: f64, lag_ms: f64, feed: Feed) -> Vec<PlayedOnset> {
    // A non-zero epoch, as the real clock has by the time anybody plays.
    const BASE_NS: u64 = 5_000_000_000;
    let ctx = TempoContext::new(bpm.round().clamp(1.0, 600.0) as u16, 1);
    ctx.set_played_interval_ms(Some(gap_ms as f32));
    ctx.set_known_score(true);
    let profile = Instrument::ElectricGuitar.profile();
    let mut core = OnsetCore::with_hop(&profile, rate, feed.hop);
    let mut ring = RingBuffer::new(rate as usize * 4);
    let mut rng = Rng::new(0x5EED_F00D);
    let mut onsets: Vec<Onset> = Vec::new();

    let total_ms = samples.len() as f64 * 1000.0 / rate as f64;
    let (mut written, mut t) = (0usize, 0.0f64);
    while t < total_ms + 200.0 {
        t += feed.poll_ms + rng.bipolar() * feed.poll_jitter_ms;
        // Whole device buffers, each delivered when its last sample exists.
        let due = ((t * rate as f64 / 1000.0) as usize / feed.input_frames) * feed.input_frames;
        while written < due.min(samples.len()) {
            let end = (written + feed.input_frames).min(samples.len());
            ring.write(&samples[written..end]);
            written = end;
        }
        core.pull(&ring);
        let mut sink = |o: Onset| onsets.push(o);
        core.process(BASE_NS + (t * 1e6) as u64, &ctx, &mut sink);
    }
    let mut sink = |o: Onset| onsets.push(o);
    core.finish(&mut sink);

    onsets
        .iter()
        .map(|o| PlayedOnset {
            time_ms: (o.ts_ns - BASE_NS) as f64 / 1e6 + lag_ms,
            amplitude: o.amplitude,
            confidence: o.confidence,
        })
        .collect()
}

// ──────────────────────────────────────────────────────────────────────
// A Take: what the player does, and what the system does to it
// ──────────────────────────────────────────────────────────────────────

fn sixteenths(notes: usize) -> ScoreSchedule {
    every(notes, 0.25)
}

fn every(notes: usize, beats: f64) -> ScoreSchedule {
    ScoreSchedule {
        onsets: (0..notes)
            .map(|i| ExpectedOnset {
                id: i as u32,
                beat: i as f64 * beats,
                note_ids: vec![i as u32],
                soft: false,
                accent: false,
            })
            .collect(),
        length_beats: notes as f64 * beats,
        loops: false,
    }
}

/// Which of the schedule's notes actually get played, and how.
#[derive(Clone)]
struct Take {
    tone: Tone,
    pattern: Pattern,
    bpm: f64,
    schedule: ScoreSchedule,
    /// The player's spread around their own centre, ms.
    jitter_ms: f64,
    /// The player's own habit of sitting behind the beat, ms. In the audio.
    lean_ms: f64,
    /// The system's lag. Not in the audio: on the detector's clock.
    lag_ms: f64,
    level: f32,
    noise: Noise,
    /// Indices into `schedule.onsets` that are not played.
    drop: Vec<usize>,
    /// Beats where an unwritten note is played.
    extra_beats: Vec<f64>,
    /// Indices played a semitone off what is written.
    wrong: Vec<usize>,
    /// What the calibration cache holds for this rig.
    cached_offset_ms: Option<f64>,
    /// The schedule the scorer is handed, when it is not `schedule`: a looping
    /// Exercise, played round several times. `schedule` is then what was
    /// played, unrolled.
    scored_as: Option<ScoreSchedule>,
    /// The Exercise's pass bars, as `load_score_schedule` is handed them.
    pass_bars: Vec<PassBar>,
    feed: Feed,
    seed: u64,
}

impl Take {
    fn new(tone: Tone, bpm: f64, notes: usize) -> Self {
        Self {
            tone,
            pattern: Pattern::Chromatic,
            bpm,
            schedule: sixteenths(notes),
            jitter_ms: 5.0,
            lean_ms: 0.0,
            lag_ms: 0.0,
            level: 0.5,
            noise: Noise::DI,
            drop: Vec::new(),
            extra_beats: Vec::new(),
            wrong: Vec::new(),
            cached_offset_ms: None,
            scored_as: None,
            pass_bars: Vec::new(),
            feed: Feed::default(),
            seed: 42,
        }
    }

    fn quarter_ms(&self) -> f64 {
        60_000.0 / self.bpm
    }

    fn gap_ms(&self) -> f64 {
        smallest_gap_beats(&self.schedule.onsets).unwrap_or(1.0) * self.quarter_ms()
    }

    /// Where beat 0 falls: one bar of count-in, with nothing played over it.
    fn first_beat_ms(&self) -> f64 {
        self.quarter_ms() * 4.0
    }

    fn name(&self) -> String {
        format!("{} {} BPM", self.tone.name(), self.bpm)
    }
}

/// What the player was told to do and did. The right answer.
struct Truth {
    /// `(schedule index, when it sounds)`, in time order.
    played: Vec<(usize, f64)>,
    notes: Vec<Note>,
    /// Sigma of the deviations the player actually made.
    evenness: Option<(f32, f64)>,
    midi_written: Vec<f64>,
}

fn gaussian(rng: &mut Rng) -> f64 {
    let u1 = (rng.bipolar() * 0.5 + 0.5).max(1e-12);
    let u2 = rng.bipolar() * 0.5 + 0.5;
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

fn plan(take: &Take) -> Truth {
    let mut rng = Rng::new(take.seed);
    let q = take.quarter_ms();
    let t0 = take.first_beat_ms();
    let mut played = Vec::new();
    let mut notes = Vec::new();
    let mut devs = Vec::new();
    let mut midi_written = Vec::new();
    for (i, onset) in take.schedule.onsets.iter().enumerate() {
        let midi = take.pattern.midi(i);
        midi_written.push(midi);
        let dev = gaussian(&mut rng) * take.jitter_ms + take.lean_ms;
        // Down and up strokes are not the same size, and no two are.
        let stroke = if i % 2 == 0 { 1.0 } else { 0.85 };
        let gain = stroke * (0.85 + 0.15 * (rng.bipolar() as f32 * 0.5 + 0.5));
        if take.drop.contains(&i) {
            continue;
        }
        let at = t0 + onset.beat * q + dev;
        devs.push(dev);
        played.push((i, at));
        let shift = if take.wrong.contains(&i) { 1.0 } else { 0.0 };
        notes.push(Note {
            at_ms: at,
            midi: midi + shift,
            gain,
        });
    }
    for &b in &take.extra_beats {
        notes.push(Note {
            at_ms: t0 + b * q,
            midi: take.pattern.midi(0),
            gain: 0.8,
        });
    }
    Truth {
        evenness: evenness(&devs, take.gap_ms()),
        played,
        notes,
        midi_written,
    }
}

/// One run of the path, and how it compares with the right answer.
struct GradingRun {
    name: String,
    report: ScheduleReport,
    onsets: Vec<PlayedOnset>,
    /// Played notes with a detector onset close enough to be theirs.
    truth_heard: usize,
    /// Detector onsets that answer to no played note, after beat 0.
    truth_extra: usize,
    /// The detector's own error against when the note really sounded,
    /// excluding `lag_ms`: mean is its constant lag, SD is its jitter.
    stamp_mean_ms: f64,
    stamp_sd_ms: f64,
    true_evenness: Option<f32>,
    audio: Vec<f32>,
    truth: Truth,
    first_beat_ms: f64,
    quarter_ms: f64,
}

impl GradingRun {
    fn grade(&self) -> &yames_lib::score::TakeGrade {
        &self.report.grade
    }

    /// The line a person reads, and it is the same for a recording.
    fn line(&self) -> String {
        let g = self.grade();
        let f = |v: Option<f32>| v.map(|e| format!("{e:.3}")).unwrap_or_else(|| "-".into());
        format!(
            "{:34} heard {:3}/{:3} missed {:3} extra {:2} | truth heard {:3} extra {:2} | even {} (true {}) | stamp {:5.1}±{:3.1} ms | cal {:6.1} {:?} | conf {} | {:?} score {}",
            self.name,
            g.heard,
            g.due,
            g.missed,
            g.extra,
            self.truth_heard,
            self.truth_extra,
            f(g.evenness),
            f(self.true_evenness),
            self.stamp_mean_ms,
            self.stamp_sd_ms,
            g.calibration.offset_ms,
            g.calibration.source,
            f(g.confidence),
            g.verdict,
            f(g.score),
        )
    }
}

/// The grade's number, which a graded Take always has. The report's own
/// `score` is Songs' number and keeps its old rule; this is the one a Take is
/// told.
fn number(run: &GradingRun) -> f32 {
    run.grade()
        .score
        .unwrap_or_else(|| panic!("{} was not graded: {}", run.name, run.line()))
}

/// Time onsets against a beat map through the same `ScheduleRun` the analyzer
/// holds. Recordings come through here too.
fn score_onsets(
    schedule: &ScoreSchedule,
    quarter_times_ms: &[f64],
    beats_per_bar: u32,
    onsets: &[PlayedOnset],
    cached_offset_ms: Option<f64>,
    pass_bars: &[PassBar],
) -> ScheduleReport {
    let mut run = ScheduleRun::new(schedule.clone())
        .with_calibration_seed(cached_offset_ms)
        .with_pass_bars(pass_bars.to_vec());
    for (i, &t) in quarter_times_ms.iter().enumerate() {
        run.note_quarter_in_bar(i == 0, t, beats_per_bar);
    }
    for o in onsets {
        run.note_onset(*o);
    }
    let weights = Instrument::ElectricGuitar.profile().score_weights;
    run.report(&weights).expect("the beat map is not empty")
}

/// How far from a played note an onset can be and still be that note's, on the
/// detector's own clock. The peak picker is always late, never early by much.
const STAMP_WINDOW_MS: (f64, f64) = (-15.0, 70.0);

fn compare(truth_ms: &[f64], onsets: &[f64]) -> (usize, usize, f64, f64) {
    let mut used = vec![false; onsets.len()];
    let mut errors = Vec::new();
    for t in truth_ms {
        let mut best: Option<(usize, f64)> = None;
        for (i, at) in onsets.iter().enumerate() {
            let e = at - t;
            if used[i] || e < STAMP_WINDOW_MS.0 || e > STAMP_WINDOW_MS.1 {
                continue;
            }
            if best.is_none_or(|b| e.abs() < b.1.abs()) {
                best = Some((i, e));
            }
        }
        if let Some((i, e)) = best {
            used[i] = true;
            errors.push(e);
        }
    }
    let n = errors.len().max(1) as f64;
    let mean = errors.iter().sum::<f64>() / n;
    let sd = (errors.iter().map(|e| (e - mean).powi(2)).sum::<f64>() / n).sqrt();
    (errors.len(), used.iter().filter(|u| !**u).count(), mean, sd)
}

fn run_take(take: &Take) -> GradingRun {
    let truth = plan(take);
    let q = take.quarter_ms();
    let t0 = take.first_beat_ms();
    let length = take.schedule.length_beats;
    let len_ms = t0 + length * q + 600.0;
    let audio = render(take.tone, &truth.notes, len_ms, take.level, take.noise, RATE, take.seed);
    let onsets = detect(&audio, RATE, take.bpm, take.gap_ms(), take.lag_ms, take.feed);

    // The transport runs one beat past the last written note, as a Take does.
    let quarters: Vec<f64> = (0..=(length.ceil() as usize + 1))
        .map(|i| t0 + i as f64 * q)
        .collect();
    let scored = take.scored_as.as_ref().unwrap_or(&take.schedule);
    let report = score_onsets(scored, &quarters, 4, &onsets, take.cached_offset_ms, &take.pass_bars);

    // Against everything that was sounded, written or not.
    let mut sounded: Vec<f64> = truth.notes.iter().map(|n| n.at_ms).collect();
    sounded.sort_by(|a, b| a.total_cmp(b));
    let unlagged: Vec<f64> = onsets
        .iter()
        .map(|o| o.time_ms - take.lag_ms)
        .filter(|t| *t > t0 - 100.0)
        .collect();
    let (truth_heard, truth_extra, stamp_mean_ms, stamp_sd_ms) = compare(&sounded, &unlagged);

    GradingRun {
        name: take.name(),
        report,
        onsets,
        truth_heard,
        truth_extra,
        stamp_mean_ms,
        stamp_sd_ms,
        true_evenness: truth.evenness.map(|(e, _)| e),
        audio,
        truth,
        first_beat_ms: t0,
        quarter_ms: q,
    }
}

// ──────────────────────────────────────────────────────────────────────
// The noise floor (audit §3, hazard 1)
// ──────────────────────────────────────────────────────────────────────

/// The defect. 128 sixteenths at 120 BPM with a long decay: the old floor shut
/// at about 2.3 s, which is the 19 notes heard. Old-feed numbers for these same
/// signals are in GRADING_LIMITS.md: 16 to 25 of 128.
#[test]
fn sustained_notes_are_still_heard_when_the_floor_would_have_shut() {
    for tone in [Tone::Ringing, Tone::HighGain, Tone::HighGainRinging] {
        for bpm in [80.0, 120.0, 160.0] {
            let run = run_take(&Take::new(tone, bpm, 128));
            println!("{}", run.line());
            let g = run.grade();
            assert!(g.heard >= 126, "{}: heard {} of 128", run.name, g.heard);
            assert!(g.extra <= 2, "{}: {} extras", run.name, g.extra);
            assert_eq!(g.verdict, TakeVerdict::Graded, "{}", run.name);
        }
    }
}

/// A floor that shuts after a minute is the same defect with a longer fuse, and
/// a Path's stamina Exercises are longer than anything above.
#[test]
fn a_minute_of_high_gain_sixteenths_is_heard_to_the_end() {
    let run = run_take(&Take::new(Tone::HighGainRinging, 120.0, 480));
    println!("{}", run.line());
    let g = run.grade();
    assert!(g.heard >= 475, "heard {} of 480", g.heard);
    let last_bars = &g.bars[g.bars.len().saturating_sub(4)..];
    for bar in last_bars {
        assert_eq!(bar.heard, bar.due, "the end of the minute: {bar:?}");
    }
}

/// A slow held note is the case the frozen background does not cover: enough
/// time between picks for its tail to be taken for the room.
#[test]
fn slow_held_notes_at_high_gain_are_still_heard() {
    for (tone, beats) in [(Tone::HighGainRinging, 1.0), (Tone::HighGain, 2.0), (Tone::Ringing, 2.0)] {
        let mut take = Take::new(tone, 70.0, 24);
        take.schedule = every(24, beats);
        let run = run_take(&take);
        println!("{} every {beats} beats: {}", run.name, run.line());
        assert!(run.grade().heard >= 23, "{}: heard {}", run.name, run.grade().heard);
    }
}

/// And the floor still does its job: steady noise, however loud, is not a note.
#[test]
fn a_noise_floor_with_nobody_playing_hears_nothing() {
    for noise in [Noise::NONE, Noise::DI, Noise::ROOM_MIC, Noise::NOISY] {
        for tone in [Tone::Clean, Tone::HighGain] {
            let mut take = Take::new(tone, 120.0, 128);
            take.noise = noise;
            take.drop = (0..128).collect();
            let run = run_take(&take);
            println!("{noise:?} {}", run.line());
            let g = run.grade();
            assert_eq!(g.heard, 0, "{noise:?} {}", run.name);
            assert_eq!(g.verdict, TakeVerdict::DidntCatchEnough);
            assert_eq!(g.score, None, "silence must not score");
        }
    }
}

#[test]
fn levels_and_noise_floors_a_rig_really_has() {
    for (tone, level, noise) in [
        (Tone::Clean, 0.05, Noise::DI),
        (Tone::Damped, 0.05, Noise::DI),
        (Tone::Clean, 0.5, Noise::ROOM_MIC),
        (Tone::Clean, 0.5, Noise::NOISY),
        (Tone::HighGain, 0.05, Noise::ROOM_MIC),
        (Tone::HighGain, 0.5, Noise::NOISY),
        (Tone::HighGainRinging, 0.5, Noise::NOISY),
    ] {
        let mut take = Take::new(tone, 120.0, 128);
        take.level = level;
        take.noise = noise;
        let run = run_take(&take);
        println!("{level} {noise:?} {}", run.line());
        assert!(run.grade().heard >= 125, "{} at {level}, {noise:?}: {}", run.name, run.line());
        assert!(run.grade().extra <= 2, "{}", run.line());
    }
}

// ──────────────────────────────────────────────────────────────────────
// Missed notes and "I didn't catch enough"
// ──────────────────────────────────────────────────────────────────────

/// The number the audit found: 19 of 128 heard, score 98.
#[test]
fn nineteen_of_128_heard_never_scores_high() {
    let mut take = Take::new(Tone::Damped, 120.0, 128);
    take.drop = (19..128).collect();
    let run = run_take(&take);
    println!("{}", run.line());
    let g = run.grade();
    assert_eq!(g.heard, 19);
    assert_eq!(g.verdict, TakeVerdict::DidntCatchEnough);
    assert_eq!(g.no_catch_reason, Some(NoCatchReason::TooFewHeard));
    assert_eq!(g.score, None);
    assert_eq!(g.evenness, None);
    assert_eq!(g.missed, 109, "the counts are facts, and they stay");
}

#[test]
fn a_dropped_note_costs_what_it_should() {
    let clean = run_take(&Take::new(Tone::Clean, 120.0, 128));
    let mut take = Take::new(Tone::Clean, 120.0, 128);
    take.drop = (0..128).step_by(10).collect(); // 13 of them
    let run = run_take(&take);
    println!("{}\n{}", clean.line(), run.line());
    let g = run.grade();
    assert_eq!(g.missed, 13, "{}", run.line());
    assert_eq!(g.heard, 115);
    assert_eq!(g.verdict, TakeVerdict::Graded);
    let (a, b) = (number(&clean), number(&run));
    assert!(a > 85.0, "clean take {a}");
    assert!((b / a - 115.0 / 128.0).abs() < 0.05, "{a} then {b}");
}

#[test]
fn extras_are_reported_and_cost_less_than_a_miss() {
    // Sixteenths every other bar, and notes nobody wrote in the rest bars. Inside
    // a run of sixteenths an added note is mostly refused by the refractory or
    // swallows its neighbour, which GRADING_LIMITS.md says too.
    let mut take = Take::new(Tone::Damped, 90.0, 0);
    let onsets: Vec<ExpectedOnset> = (0..48)
        .map(|i| {
            let bar = (i / 16) as f64;
            ExpectedOnset {
                id: i as u32,
                beat: bar * 8.0 + (i % 16) as f64 * 0.25,
                note_ids: vec![i as u32],
                soft: false,
                accent: false,
            }
        })
        .collect();
    take.schedule = ScoreSchedule {
        onsets,
        length_beats: 24.0,
        loops: false,
    };
    take.extra_beats = vec![4.5, 5.5, 13.5];
    let run = run_take(&take);
    println!("{}", run.line());
    let g = run.grade();
    assert_eq!(g.extra, 3, "{}", run.line());
    assert_eq!(g.bars[1].extra, 2, "{:?}", g.bars[1]);
    assert_eq!(g.bars[3].extra, 1, "{:?}", g.bars[3]);
    assert_eq!(g.missed, 0);
    let clean = run_take(&{
        let mut t = take.clone();
        t.extra_beats.clear();
        t
    });
    let mut one_miss = take.clone();
    one_miss.extra_beats.clear();
    one_miss.drop = vec![10, 26, 40];
    let missed = run_take(&one_miss);
    assert!(
        number(&run) > number(&missed),
        "three extras {} against three misses {}, clean {}",
        number(&run),
        number(&missed),
        number(&clean),
    );
}

// ──────────────────────────────────────────────────────────────────────
// The system's lag (audit §3, defect 2)
// ──────────────────────────────────────────────────────────────────────

/// The audit's table, through real audio. Before: 70/128 at 50 ms and 120 BPM,
/// 5/128 at 160.
///
/// One limit, stated: a total lag longer than the gap between two notes cannot
/// be told from a Take that started a note late and played one extra at the
/// end, except by those two end notes, and one Take does not reliably decide
/// that. 80 ms of rig plus the detector's 23 is past a sixteenth at 160 BPM
/// (94 ms), so that case runs as it would on a second session: with the rig's
/// offset remembered in `calibration_cache`. On a first run it is the prior's
/// call (`NOMINAL_LAG_MS`), and evenness still survives it.
#[test]
fn a_constant_lag_does_not_look_like_bad_playing() {
    for bpm in [80.0, 120.0, 160.0] {
        let base = run_take(&Take::new(Tone::Clean, bpm, 128));
        let detector_lag = base.grade().calibration.offset_ms;
        // Under the top of `SYSTEM_LAG_RANGE_MS` once the detector's own 25 ms
        // is on it. Past that, with no reference, the excess stays visible.
        for lag in [30.0, 50.0, 80.0] {
            let mut take = Take::new(Tone::Clean, bpm, 128);
            take.lag_ms = lag;
            if detector_lag + lag > take.gap_ms() * 0.9 {
                take.cached_offset_ms = Some(detector_lag + lag);
            }
            let run = run_take(&take);
            println!("lag {lag}: {}", run.line());
            let g = run.grade();
            assert!(g.heard >= 127, "lag {lag}, {} BPM: {}", bpm, run.line());
            let (even, base_even) = (g.evenness.unwrap(), base.grade().evenness.unwrap());
            assert!((even - base_even).abs() < 0.01, "evenness moved: {} vs {}", base_even, even);
            assert!(
                (number(&run) - number(&base)).abs() < 3.0,
                "score moved with lag {lag}: {} vs {}",
                number(&base),
                number(&run)
            );
            assert!(
                (g.calibration.offset_ms - base.grade().calibration.offset_ms - lag).abs() < 3.0,
                "{}",
                run.line()
            );
        }
    }
}

/// The uncalibrated path still fails the way the audit said, and this is the
/// measurement the fix is against.
#[test]
fn without_calibration_the_same_lag_still_loses_the_notes() {
    // 25 ms on top of the detector's own, so about 48 ms all told: outside the
    // 37.5 ms window at this tempo, and not yet in the next note's.
    let mut take = Take::new(Tone::Clean, 160.0, 128);
    take.lag_ms = 25.0;
    let run = run_take(&take);
    let q = take.quarter_ms();
    let beats = BeatMap::from_quarter_times(
        (0..40).map(|i| take.first_beat_ms() + i as f64 * q).collect(),
    );
    let weights = Instrument::ElectricGuitar.profile().score_weights;
    let raw = match_attempt(&take.schedule, &beats, &run.onsets, &weights);
    println!("uncalibrated hits {}, calibrated {}", raw.grade.heard, run.grade().heard);
    assert!(raw.grade.heard < 64, "uncalibrated heard {}", raw.grade.heard);
    assert!(run.grade().heard >= 127);
}

/// The trade-off in `CalibrationPolicy`, as behaviour: on a rig with a reference
/// a lean shows; on a first run it cannot; and neither ever costs a note.
#[test]
fn a_real_lean_shows_against_the_cache_and_cannot_on_a_first_run() {
    // What the cache would hold on this rig: its lag plus the detector's.
    let reference = run_take(&Take::new(Tone::Clean, 120.0, 128));
    let detector_lag = reference.grade().calibration.offset_ms;
    let lag = 40.0;
    let seed = detector_lag + lag;

    let mut leaning = Take::new(Tone::Clean, 120.0, 128);
    leaning.lag_ms = lag;
    leaning.lean_ms = 20.0;
    leaning.cached_offset_ms = Some(seed);
    let with_cache = run_take(&leaning);
    println!("{}", with_cache.line());
    let g = with_cache.grade();
    assert_eq!(g.calibration.source, CalibrationSource::Cached);
    assert!((g.calibration.lean_ms.unwrap() - 20.0).abs() < 4.0, "{:?}", g.calibration);
    assert!(g.heard >= 127);

    leaning.cached_offset_ms = None;
    let first_run = run_take(&leaning);
    println!("{}", first_run.line());
    let g = first_run.grade();
    assert_eq!(g.calibration.source, CalibrationSource::Take);
    assert_eq!(g.calibration.lean_ms, None, "lag and lean are one number here");
    assert!(g.heard >= 127);

    // A cache this far out has moved rig. Reporting it as a lean would be a lie.
    leaning.cached_offset_ms = Some(seed + 80.0);
    let stale = run_take(&leaning);
    assert_eq!(stale.grade().calibration.source, CalibrationSource::Take);
    assert_eq!(stale.grade().calibration.lean_ms, None);
}

// ──────────────────────────────────────────────────────────────────────
// Evenness, by bar, on the Paths' own Exercises
// ──────────────────────────────────────────────────────────────────────

/// Evenness has to track what the player really did: within a few points on
/// every tone, at every tempo Alternate Picking's first rungs ask for.
#[test]
fn evenness_tracks_the_real_spread_of_the_playing() {
    for tone in [Tone::Damped, Tone::Clean, Tone::HighGainRinging] {
        for bpm in [80.0, 120.0, 160.0] {
            for jitter in [3.0, 8.0, 14.0] {
                let mut take = Take::new(tone, bpm, 128);
                take.jitter_ms = jitter;
                let run = run_take(&take);
                println!("jitter {jitter}: {}", run.line());
                let g = run.grade();
                let measured = g.evenness.expect("graded");
                let truth = run.true_evenness.unwrap();
                assert!(
                    (measured - truth).abs() <= 0.06,
                    "{} jitter {jitter}: measured {measured} against {truth}",
                    run.name,
                );
                // A player good enough to pass is heard whole. One who is not
                // (14 ms at 160 BPM is evenness 0.77) loses the odd note to
                // the refractory and the matching window, and fails the
                // evenness bar first either way.
                let min_heard = if truth >= 0.85 { 125 } else { 120 };
                assert!(g.heard >= min_heard, "{}", run.line());
            }
        }
    }
}

#[test]
fn bars_add_up_and_say_where_it_went_wrong() {
    let mut take = Take::new(Tone::Clean, 120.0, 128);
    // Four notes out of bar 3 (index 2): sixteenths 32..48.
    take.drop = vec![33, 35, 38, 44];
    let run = run_take(&take);
    println!("{}", run.line());
    let g = run.grade();
    assert_eq!(g.bars.len(), 8, "{:?}", g.bars);
    for (i, bar) in g.bars.iter().enumerate() {
        assert_eq!(bar.bar, i as u32);
        assert_eq!(bar.due, 16);
        let expected_missed = if i == 2 { 4 } else { 0 };
        assert_eq!(bar.missed, expected_missed, "{bar:?}");
        assert_eq!(bar.heard + bar.missed, bar.due);
        assert!(bar.evenness.is_some());
    }
    assert_eq!(g.bars.iter().map(|b| b.heard).sum::<u32>(), g.heard);
}

#[derive(serde::Deserialize)]
struct PathRow {
    path: String,
    exercise: String,
    bpm: f64,
    schedule: ScoreSchedule,
}

fn path_rows() -> Vec<PathRow> {
    let file = manifest().join("tests/path_fixtures/schedules.jsonl");
    fs::read_to_string(&file)
        .expect("schedules.jsonl")
        .lines()
        .map(|l| serde_json::from_str(l).expect("a schedule the app can read"))
        .collect()
}

/// A sample of the real packs through real audio. `path_exercises.rs` proves
/// the format reaches the scorer; this proves it survives the detector too.
#[test]
fn exercises_from_the_packs_come_through_the_detector() {
    let rows = path_rows();
    let picks = rows.iter().step_by(9).filter(|r| r.schedule.onsets.len() >= 8);
    let mut checked = 0;
    for row in picks {
        let tone = if row.path == "sweep-picking" {
            Tone::Swept
        } else {
            Tone::Clean
        };
        let mut take = Take::new(tone, row.bpm, 0);
        take.schedule = row.schedule.clone();
        take.pattern = if row.path == "sweep-picking" {
            Pattern::Arpeggio
        } else {
            Pattern::Chromatic
        };
        take.jitter_ms = 3.0;
        // A soft note is not expected to be heard; play it anyway, softly heard
        // or not, and it must cost nothing either way.
        let run = run_take(&take);
        let name = format!("{}/{} at {}", row.path, row.exercise, row.bpm);
        println!("{name}: {}", run.line());
        let g = run.grade();
        let soft = row.schedule.onsets.iter().filter(|o| o.soft).count() as u32;
        assert!(g.heard + soft >= g.due, "{name}: {}", run.line());
        assert!(
            g.heard_ratio >= 0.95,
            "{name} heard {} of {}: {}",
            g.heard,
            g.due,
            run.line()
        );
        assert_eq!(g.verdict, TakeVerdict::Graded, "{name}");
        checked += 1;
    }
    assert!(checked >= 8, "only {checked} Exercises");
}

// ──────────────────────────────────────────────────────────────────────
// The pass bar and the clean tempo, on Alternate Picking's own Exercises
// ──────────────────────────────────────────────────────────────────────

/// An Exercise's pass bars, read from the pack the app ships.
fn pack_pass_bars(path: &str, exercise: &str) -> Vec<PassBar> {
    let file = manifest().join(format!("../src/paths/packs/{path}.json"));
    let pack: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&file).expect("the pack")).expect("pack JSON");
    fn find<'a>(v: &'a serde_json::Value, id: &str) -> Option<&'a serde_json::Value> {
        match v {
            serde_json::Value::Object(m) => {
                if m.get("id").and_then(|i| i.as_str()) == Some(id) && m.contains_key("passBars") {
                    return Some(v);
                }
                m.values().find_map(|x| find(x, id))
            }
            serde_json::Value::Array(a) => a.iter().find_map(|x| find(x, id)),
            _ => None,
        }
    }
    let ex = find(&pack, exercise).unwrap_or_else(|| panic!("{exercise} in {path}"));
    serde_json::from_value(ex["passBars"].clone()).expect("passBars as format.ts writes them")
}

/// A Take on a looping Exercise from the packs, `passes` times round, at
/// `bpm`. The scorer is handed the loop; the audio is the loop unrolled.
fn exercise_take(exercise: &str, bpm: f64, passes: usize) -> Take {
    let row = path_rows()
        .into_iter()
        .find(|r| r.path == "alternate-picking" && r.exercise == exercise)
        .unwrap_or_else(|| panic!("{exercise} in schedules.jsonl"));
    let looped = ScoreSchedule {
        loops: true,
        ..row.schedule.clone()
    };
    let length = row.schedule.length_beats;
    let mut onsets = Vec::new();
    for pass in 0..passes {
        for o in &row.schedule.onsets {
            onsets.push(ExpectedOnset {
                id: onsets.len() as u32,
                beat: pass as f64 * length + o.beat,
                ..o.clone()
            });
        }
    }
    let mut take = Take::new(Tone::Clean, bpm, 0);
    take.schedule = ScoreSchedule {
        onsets,
        length_beats: length * passes as f64,
        loops: false,
    };
    take.scored_as = Some(looped);
    take.pass_bars = pack_pass_bars("alternate-picking", exercise);
    take
}

fn pass_of(run: &GradingRun) -> &PassResult {
    run.grade().pass.as_ref().expect("pass bars were loaded")
}

/// The first Exercise of the first build, the way a Session runs it: 2 bars
/// round eight times, at the rung that decides it.
#[test]
fn a_tidy_take_passes_alternate_picking_and_counts_for_the_clean_tempo() {
    for tone in [Tone::Clean, Tone::HighGain] {
        let mut take = exercise_take("even-eighths.open-string", 100.0, 8);
        take.tone = tone;
        let run = run_take(&take);
        let pass = pass_of(&run);
        println!("{}\n  {pass:?}", run.line());
        assert_eq!(pass.verdict, PassVerdict::Passed, "{pass:?}");
        assert_eq!(pass.finished_bars, 16);
        assert_eq!(pass.held_bars, 16);
        assert!(pass.counts_for_clean_tempo);
        assert!(pass.not_assessed.is_empty());
        assert!((run.grade().bpm - 100.0).abs() < 0.5);
    }
}

/// And its bars fail a Take on their own, saying which. `extraNotes` is not in
/// here: inside a run of eighths an added note is refused by the refractory
/// more often than not (`extras_are_reported_and_cost_less_than_a_miss` above),
/// so the audio cannot be made to carry a known number of them. Its arithmetic
/// is `score::pass`'s own unit tests.
#[test]
fn each_alternate_picking_bar_fails_a_take_on_its_own() {
    // Uneven: 35 ms of spread on eighths at 100 BPM is evenness 0.68. (At
    // 25 ms, 0.82 over the Take, the best four bars of sixteen can still
    // clear 0.85: the bar asks for four good bars, not sixteen.)
    let mut uneven = exercise_take("even-eighths.open-string", 100.0, 8);
    uneven.jitter_ms = 35.0;
    // A note dropped in every bar: 7 of 8 heard.
    let mut dropping = exercise_take("even-eighths.open-string", 100.0, 8);
    dropping.drop = (0..128).step_by(8).map(|i| i + 3).collect();
    for (take, failing) in [
        (uneven, "timingEvenness"),
        (dropping, "notesHeard"),
    ] {
        let run = run_take(&take);
        let pass = pass_of(&run);
        println!("{failing}: {}\n  {pass:?}", run.line());
        assert_eq!(pass.verdict, PassVerdict::Failed, "{failing}: {pass:?}");
        assert!(!pass.counts_for_clean_tempo);
        let check = pass.checks.iter().find(|c| c.metric == failing).unwrap();
        assert!(!check.held, "{failing}: {pass:?}");
    }
}

/// A Take that stopped before four bars is not a fail, nor is one the grade
/// could not hear.
#[test]
fn a_short_take_or_a_silent_one_is_not_a_fail() {
    let short = run_take(&exercise_take("even-eighths.open-string", 100.0, 1));
    assert_eq!(pass_of(&short).verdict, PassVerdict::TooShort, "{:?}", pass_of(&short));
    let mut silent = exercise_take("even-eighths.open-string", 100.0, 4);
    silent.drop = (0..64).collect();
    let silent = run_take(&silent);
    assert_eq!(pass_of(&silent).verdict, PassVerdict::DidntCatchEnough);
}

/// Pitch is not timing: an Exercise whose bars name `noteIdentity` passes or
/// fails on the rest, and says it did not check the notes.
#[test]
fn right_notes_are_said_to_be_unchecked_rather_than_assumed() {
    let run = run_take(&exercise_take("even-eighths.a-minor-one-string", 100.0, 4));
    let pass = pass_of(&run);
    assert_eq!(pass.verdict, PassVerdict::Passed, "{pass:?}");
    assert_eq!(pass.not_assessed, vec!["noteIdentity".to_string()]);
    // Eight bars of timing, so it counts toward the clean tempo: the tempo is
    // a fact about timing, and the unchecked notes are said out loud.
    assert!(pass.counts_for_clean_tempo, "{pass:?}");
}

/// The clean tempo (BRIEF.md "Decisions"): the fastest rung at which a Take
/// passed over at least 8 bars. A player who holds together up to 85 BPM on
/// the sixteenths Exercise and comes apart above it has a clean tempo of 85.
#[test]
fn the_clean_tempo_is_the_fastest_rung_that_held_for_eight_bars() {
    let mut takes = Vec::new();
    for bpm in [70.0, 75.0, 80.0, 85.0, 90.0, 95.0] {
        let mut take = exercise_take("even-sixteenths.gear-change", bpm, 5);
        take.jitter_ms = if bpm <= 85.0 { 6.0 } else { 30.0 };
        let run = run_take(&take);
        println!("{}\n  {:?}", run.line(), pass_of(&run).verdict);
        takes.push((run.grade().bpm, pass_of(&run).clone()));
    }
    let clean = clean_tempo(takes.iter().map(|(bpm, p)| (*bpm, p))).expect("a clean tempo");
    assert!((clean - 85.0).abs() < 0.5, "clean tempo {clean}");
}

// ──────────────────────────────────────────────────────────────────────
// Which note
// ──────────────────────────────────────────────────────────────────────

/// What a finished Take says about its notes: `results` → `MatchedOnset` →
/// `identify_take_notes`, the path `analyze_take_pitch` takes after reading the
/// stem. Times are on the audio's own clock, as the stem's are.
fn identify(run: &GradingRun, take: &Take) -> NoteIdentity {
    let pass_notes: Vec<ScoreNote> = run
        .truth
        .midi_written
        .iter()
        .enumerate()
        .map(|(i, &midi)| ScoreNote { id: i as u32, midi })
        .collect();
    let matched: Vec<MatchedOnset> = run
        .report
        .results
        .iter()
        .map(|r| {
            let onset = &take.schedule.onsets[r.id as usize];
            MatchedOnset::from_result(
                r.id,
                onset.note_ids.clone(),
                match r.state {
                    OnsetState::Hit => PitchState::Hit,
                    OnsetState::Miss => PitchState::Miss,
                    OnsetState::SoftAbsent => PitchState::SoftAbsent,
                },
                run.first_beat_ms + onset.beat * run.quarter_ms,
                r.deviation_ms,
            )
        })
        .collect();
    let extras: Vec<f64> = run
        .report
        .extras
        .iter()
        .map(|e| run.first_beat_ms + e.beat * run.quarter_ms)
        .collect();
    let cfg = PitchConfig::for_tuning(&[64, 59, 55, 50, 45, 40]);
    let verdicts = identify_take_notes(&run.audio, RATE, &pass_notes, &matched, &extras, &cfg);
    note_identity(&verdicts)
}

#[test]
fn a_finished_take_says_which_notes_were_right() {
    for tone in [Tone::Clean, Tone::HighGain] {
        let mut take = Take::new(tone, 100.0, 96);
        let right = run_take(&take);
        let id = identify(&right, &take);
        println!("{} right: {id:?}", right.name);
        assert!(id.ratio.unwrap() >= 0.95, "{}: {id:?}", right.name);

        take.wrong = (0..96).step_by(8).collect(); // 12 notes a semitone off
        let wrong = run_take(&take);
        let id = identify(&wrong, &take);
        println!("{} with 12 wrong: {id:?}", wrong.name);
        assert!(id.wrong >= 10 && id.wrong <= 15, "{}: {id:?}", wrong.name);
    }
}

// ──────────────────────────────────────────────────────────────────────
// Recordings. See audio_fixtures/README.md
// ──────────────────────────────────────────────────────────────────────

fn manifest() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn recordings_dir() -> PathBuf {
    manifest().join("tests/audio_fixtures/recordings")
}

/// A recording's sidecar.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Sidecar {
    #[serde(default)]
    description: String,
    /// The audio, beside this file. Defaults to the same name with `.wav`.
    #[serde(default)]
    audio: Option<String>,
    /// Where the click's first beat of the Exercise is, ms into the file.
    first_beat_ms: f64,
    bpm: f64,
    #[serde(default = "four")]
    beats_per_bar: u32,
    /// The score as `src/songs/schedule.ts` writes it, or...
    #[serde(default)]
    schedule: Option<ScoreSchedule>,
    /// ...this many straight sixteenths.
    #[serde(default)]
    sixteenths: Option<usize>,
    /// When the notes really sounded, ms into the file, from a reference. Hand
    /// labels or a DAW's transient map. Optional, but without it there is no
    /// ground truth, only a report.
    #[serde(default)]
    played_ms: Option<Vec<f64>>,
    #[serde(default)]
    expect: Expect,
}

fn four() -> u32 {
    4
}

/// The pass criteria, written before anyone plays.
#[derive(Default, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Expect {
    #[serde(default)]
    min_heard_ratio: Option<f32>,
    #[serde(default)]
    max_extra: Option<u32>,
    /// How far evenness may sit from the reference's, on the 0–1 scale.
    #[serde(default)]
    evenness_tolerance: Option<f32>,
    #[serde(default)]
    verdict_didnt_catch_enough: bool,
}

/// One recording, through the same detector and the same scorer, for the same
/// report line. The WAV is on its own clock with no lag: what a rig adds lives
/// in the live path and the calibration deals with it there.
fn run_recording(sidecar_path: &Path) -> Result<(GradingRun, Vec<String>), String> {
    let raw = fs::read_to_string(sidecar_path).map_err(|e| e.to_string())?;
    let sidecar: Sidecar = serde_json::from_str(&raw)
        .map_err(|e| format!("{}: {e}", sidecar_path.display()))?;
    let audio_path = match &sidecar.audio {
        Some(name) => sidecar_path.with_file_name(name),
        None => sidecar_path.with_extension("wav"),
    };
    let (audio, rate) = yames_lib::pitch::decode_mono_file(&audio_path)?;
    let schedule = match (&sidecar.schedule, sidecar.sixteenths) {
        (Some(s), _) => s.clone(),
        (None, Some(n)) => sixteenths(n),
        (None, None) => return Err("say `schedule` or `sixteenths`".into()),
    };
    let q = 60_000.0 / sidecar.bpm;
    let gap_ms = smallest_gap_beats(&schedule.onsets).unwrap_or(1.0) * q;
    let onsets = detect(&audio, rate, sidecar.bpm, gap_ms, 0.0, Feed::default());
    let quarters: Vec<f64> = (0..=(schedule.length_beats.ceil() as usize + 1))
        .map(|i| sidecar.first_beat_ms + i as f64 * q)
        .collect();
    let report = score_onsets(&schedule, &quarters, sidecar.beats_per_bar, &onsets, None, &[]);

    let (mut truth_heard, mut truth_extra, mut mean, mut sd, mut true_evenness) =
        (0, 0, 0.0, 0.0, None);
    if let Some(played) = &sidecar.played_ms {
        let times: Vec<f64> = onsets
            .iter()
            .map(|o| o.time_ms)
            .filter(|t| *t > sidecar.first_beat_ms - 100.0)
            .collect();
        (truth_heard, truth_extra, mean, sd) = compare(played, &times);
        // Against the written time of each note, the same way the scorer does.
        let devs: Vec<f64> = played
            .iter()
            .map(|p| {
                let beat = (p - sidecar.first_beat_ms) / q;
                let nearest = schedule
                    .onsets
                    .iter()
                    .map(|o| o.beat)
                    .min_by(|a, b| (a - beat).abs().total_cmp(&(b - beat).abs()))
                    .unwrap_or(beat);
                (beat - nearest) * q
            })
            .collect();
        true_evenness = evenness(&devs, gap_ms).map(|(e, _)| e);
    }

    let g = &report.grade;
    let mut failures = Vec::new();
    let e = &sidecar.expect;
    if e.verdict_didnt_catch_enough {
        if g.verdict != TakeVerdict::DidntCatchEnough {
            failures.push(format!("expected no grade, got {:?}", g.score));
        }
    } else {
        if let Some(min) = e.min_heard_ratio {
            if g.heard_ratio < min {
                failures.push(format!("heard {:.3}, the bar is {min}", g.heard_ratio));
            }
        }
        if let Some(max) = e.max_extra {
            if g.extra > max {
                failures.push(format!("{} extras, the bar is {max}", g.extra));
            }
        }
        if let (Some(tol), Some(truth), Some(measured)) =
            (e.evenness_tolerance, true_evenness, g.evenness)
        {
            if (measured - truth).abs() > tol {
                failures.push(format!("evenness {measured:.3}, reference {truth:.3}, tolerance {tol}"));
            }
        }
    }
    let name = sidecar_path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok((
        GradingRun {
            name,
            report,
            onsets,
            truth_heard,
            truth_extra,
            stamp_mean_ms: mean,
            stamp_sd_ms: sd,
            true_evenness,
            audio,
            truth: Truth {
                played: Vec::new(),
                notes: Vec::new(),
                evenness: None,
                midi_written: Vec::new(),
            },
            first_beat_ms: sidecar.first_beat_ms,
            quarter_ms: q,
        },
        failures,
    ))
}

/// Every real recording in the folder, against the bars its sidecar set. An
/// empty folder passes, and says so: this is not yet evidence of anything.
#[test]
fn every_recording_meets_the_bars_it_set() {
    let mut sidecars: Vec<PathBuf> = fs::read_dir(recordings_dir())
        .map(|d| {
            d.filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| p.extension().is_some_and(|x| x == "json"))
                .collect()
        })
        .unwrap_or_default();
    sidecars.sort();
    if sidecars.is_empty() {
        println!("no real recordings yet: nothing here has met a guitar");
    }
    let mut failed = Vec::new();
    for path in &sidecars {
        match run_recording(path) {
            Ok((run, failures)) => {
                println!("{}", run.line());
                if !failures.is_empty() {
                    failed.push(format!("{}: {}", run.name, failures.join("; ")));
                }
            }
            Err(e) => failed.push(format!("{}: {e}", path.display())),
        }
    }
    assert!(failed.is_empty(), "{}", failed.join("\n"));
}

/// The folder's format, proved with a recording the suite writes itself: a WAV
/// and a sidecar through `run_recording` come out as the same audio does in
/// memory.
#[test]
fn a_recording_gets_the_same_report_as_the_same_audio_in_memory() {
    let take = Take::new(Tone::Clean, 120.0, 64);
    let direct = run_take(&take);

    let dir = std::env::temp_dir().join(format!("yames-audio-fixture-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let wav = dir.join("synthetic.wav");
    synth::write_wav(&wav, &direct.audio, RATE).unwrap();
    let played: Vec<f64> = direct.truth.played.iter().map(|p| p.1).collect();
    let sidecar = serde_json::json!({
        "description": "written by the test that proves the format",
        "firstBeatMs": take.first_beat_ms(),
        "bpm": take.bpm,
        "sixteenths": 64,
        "playedMs": played,
        "expect": { "minHeardRatio": 0.95, "maxExtra": 2, "evennessTolerance": 0.05 }
    });
    let path = dir.join("synthetic.json");
    fs::write(&path, sidecar.to_string()).unwrap();

    let (from_file, failures) = run_recording(&path).expect("the format");
    println!("{}\n{}", direct.line(), from_file.line());
    assert!(failures.is_empty(), "{failures:?}");
    let (a, b) = (direct.grade(), from_file.grade());
    assert!(a.heard.abs_diff(b.heard) <= 1, "{} vs {}", a.heard, b.heard);
    assert!((a.evenness.unwrap() - b.evenness.unwrap()).abs() < 0.02);
    fs::remove_dir_all(&dir).ok();
}

// ──────────────────────────────────────────────────────────────────────
// The limits. Not a gate: `npm run test:grading:measure` prints what
// plans/revamp/GRADING_LIMITS.md records.
// ──────────────────────────────────────────────────────────────────────

/// The clean-run bar a tempo has to clear to count as "holds": what a pass bar
/// would need of the machinery itself, with a tidy player.
fn holds(run: &GradingRun, truth_jitter: f64) -> bool {
    let g = run.grade();
    let heard = g.heard_ratio >= 0.95;
    let extra = (g.extra as f32) <= 0.02 * g.due as f32;
    let even = match (g.evenness, run.true_evenness) {
        (Some(m), Some(t)) => (m - t).abs() <= 0.05,
        _ => false,
    };
    let _ = truth_jitter;
    heard && extra && even && g.verdict == TakeVerdict::Graded
}

fn measured_tones() -> [(Tone, Pattern); 6] {
    [
        (Tone::Damped, Pattern::Chromatic),
        (Tone::Clean, Pattern::Chromatic),
        (Tone::Ringing, Pattern::Chromatic),
        (Tone::HighGain, Pattern::Chromatic),
        (Tone::HighGainRinging, Pattern::Chromatic),
        (Tone::Swept, Pattern::Arpeggio),
    ]
}

const SWEEP_GAPS_MS: [f64; 12] = [
    187.5, 150.0, 125.0, 107.1, 93.75, 83.3, 75.0, 68.2, 62.5, 57.7, 53.6, 50.0,
];

#[test]
#[ignore = "measurement, not a gate: npm run test:grading:measure"]
fn measure_timing_limit_by_signal() {
    println!("| Signal | gap ms | sixteenths at | heard | extra | evenness (true) | stamp sd ms | holds |");
    println!("|---|---|---|---|---|---|---|---|");
    for (tone, pattern) in measured_tones() {
        for &gap in &SWEEP_GAPS_MS {
            let bpm = 15_000.0 / gap;
            let mut take = Take::new(tone, bpm, 128);
            take.pattern = pattern;
            take.jitter_ms = 3.0;
            take.lag_ms = 30.0;
            let run = run_take(&take);
            let g = run.grade();
            println!(
                "| {} | {:.1} | {:.0} | {}/{} | {} | {} ({}) | {:.1} | {} |",
                tone.name(),
                gap,
                bpm,
                g.heard,
                g.due,
                g.extra,
                g.evenness.map(|e| format!("{e:.2}")).unwrap_or("-".into()),
                run.true_evenness.map(|e| format!("{e:.2}")).unwrap_or("-".into()),
                run.stamp_sd_ms,
                if holds(&run, 3.0) { "yes" } else { "**no**" },
            );
        }
    }
}

#[test]
#[ignore = "measurement, not a gate: npm run test:grading:measure"]
fn measure_note_identity_limit_by_signal() {
    println!("| Signal | gap ms | sixteenths at | right | wrong | octave | unheard | ratio |");
    println!("|---|---|---|---|---|---|---|---|");
    for (tone, pattern) in measured_tones() {
        for &gap in &SWEEP_GAPS_MS[..10] {
            let bpm = 15_000.0 / gap;
            let mut take = Take::new(tone, bpm, 96);
            take.pattern = pattern;
            take.jitter_ms = 3.0;
            let run = run_take(&take);
            let id = identify(&run, &take);
            println!(
                "| {} | {:.1} | {:.0} | {} | {} | {} | {} | {} |",
                tone.name(),
                gap,
                bpm,
                id.right,
                id.wrong,
                id.octave,
                id.unheard,
                id.ratio.map(|r| format!("{r:.2}")).unwrap_or("-".into()),
            );
        }
    }
}

#[test]
#[ignore = "measurement, not a gate: npm run test:grading:measure"]
fn measure_sloppy_players() {
    println!("| Signal | BPM | player sigma ms | heard | extra | evenness (true) |");
    println!("|---|---|---|---|---|---|");
    for tone in [Tone::Clean, Tone::HighGainRinging] {
        for bpm in [80.0, 120.0, 160.0, 200.0] {
            for jitter in [5.0, 10.0, 15.0, 20.0, 30.0] {
                let mut take = Take::new(tone, bpm, 128);
                take.jitter_ms = jitter;
                let run = run_take(&take);
                let g = run.grade();
                println!(
                    "| {} | {} | {} | {}/{} | {} | {} ({}) |",
                    tone.name(),
                    bpm,
                    jitter,
                    g.heard,
                    g.due,
                    g.extra,
                    g.evenness.map(|e| format!("{e:.2}")).unwrap_or("-".into()),
                    run.true_evenness.map(|e| format!("{e:.2}")).unwrap_or("-".into()),
                );
            }
        }
    }
}

#[test]
#[ignore = "measurement, not a gate: npm run test:grading:measure"]
fn measure_lag_table() {
    println!("| lag ms | 80 BPM | 100 BPM | 120 BPM | 160 BPM |");
    println!("|---|---|---|---|---|");
    for lag in [0.0, 30.0, 40.0, 50.0, 60.0, 80.0, 110.0] {
        let cells: Vec<String> = [80.0, 100.0, 120.0, 160.0]
            .iter()
            .map(|&bpm| {
                let mut take = Take::new(Tone::Clean, bpm, 128);
                take.lag_ms = lag;
                let run = run_take(&take);
                let g = run.grade();
                format!(
                    "{}/{} even {:.2} score {:.0}",
                    g.heard,
                    g.due,
                    g.evenness.unwrap_or(0.0),
                    g.score.unwrap_or(0.0)
                )
            })
            .collect();
        println!("| {lag} | {} |", cells.join(" | "));
    }
}
