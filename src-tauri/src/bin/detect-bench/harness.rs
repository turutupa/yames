//! One Take through the PRODUCTION path, offline: the shipped onset detector
//! (`OnsetCore`, fed a ring buffer in device-sized blocks and polled about
//! every 5 ms, as its thread does), the shipped scorer (`ScheduleRun`), the
//! shipped right-notes pass, and the shipped verifier, wired the way
//! `timing.rs` wires them. Nothing here re-implements a step: if the app
//! would get it wrong, so does this, which is the point
//! (`plans/revamp/GRADING_LIMITS.md` once measured through a test helper that
//! did not have the detector's delay, and missed a 25 ms bug for it).

use std::time::Instant;

use serde::{Deserialize, Serialize};
use yames_lib::audio_input::RingBuffer;
use yames_lib::detect::model::NoteModel;
use yames_lib::detect::Analysis;
use yames_lib::instrument::Instrument;
use yames_lib::onset::{Onset, OnsetCore, TempoContext, ONSET_HOP_SIZE};
use yames_lib::pitch::{NoteState, PitchConfig, PitchTrack, ScoreNote};
use yames_lib::score::notes::TakeAudio;
use yames_lib::score::pass::PassBar;
use yames_lib::score::verify::{NoteDetail, VerifierReport, VerifierStatus};
use yames_lib::score::{smallest_gap_beats, PlayedOnset, ScheduleReport, ScheduleRun, ScoreSchedule};

/// What a Take was, as the app would have been told (`loadScoreSchedule`).
/// This is also the sidecar the app writes beside a kept Take's audio.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    /// Path to the audio, relative to the sidecar when not absolute.
    #[serde(default)]
    pub audio: String,
    pub bpm: f64,
    /// Where beat 0 of the schedule is in the audio.
    #[serde(default)]
    pub first_beat_ms: f64,
    #[serde(default)]
    pub beats_per_bar: Option<u32>,
    /// Where every quarter fell in the audio, ms, when the app recorded it
    /// (a kept Take). Overrides `bpm` and `firstBeatMs`.
    #[serde(default)]
    pub quarters_ms: Vec<f64>,
    #[serde(default)]
    pub instrument: Option<String>,
    #[serde(default)]
    pub schedule: Option<ScoreSchedule>,
    #[serde(default)]
    pub pitches: Vec<ScoreNote>,
    #[serde(default)]
    pub details: Vec<NoteDetail>,
    #[serde(default)]
    pub pass_bars: Vec<PassBar>,
    /// Device buffer size in frames (default 256).
    #[serde(default)]
    pub input_frames: Option<usize>,
    /// The click's subdivision when no schedule is known (free play).
    #[serde(default)]
    pub subdivision: Option<u8>,
}

/// A small xorshift, so the poll jitter is the same every run.
struct Jitter(u64);
impl Jitter {
    fn bipolar(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64 * 2.0 - 1.0
    }
}

pub struct Detected {
    pub onsets: Vec<PlayedOnset>,
    /// The detector's own peak-picking delay, ms.
    pub delay_ms: f64,
}

/// The shipped detector over a buffer, exactly as its thread drives it.
pub fn detect(samples: &[f32], rate: u32, instrument: Instrument, bpm: f64, subdivision: u8, gap_ms: Option<f64>, known_score: bool, input_frames: usize) -> Detected {
    const BASE_NS: u64 = 5_000_000_000;
    const POLL_MS: f64 = 5.2;
    const POLL_JITTER_MS: f64 = 0.6;
    let ctx = TempoContext::new(bpm.round().clamp(1.0, 600.0) as u16, subdivision);
    ctx.set_played_interval_ms(gap_ms.map(|g| g as f32));
    ctx.set_known_score(known_score);
    let profile = instrument.profile();
    let mut core = OnsetCore::with_hop(&profile, rate, ONSET_HOP_SIZE);
    let delay_ms = core.detection_delay_ns() as f64 / 1e6;
    let mut ring = RingBuffer::new(rate as usize * 4);
    let mut rng = Jitter(0x5EED_F00D);
    let mut onsets: Vec<Onset> = Vec::new();
    let total_ms = samples.len() as f64 * 1000.0 / rate as f64;
    let (mut written, mut t) = (0usize, 0.0f64);
    while t < total_ms + 200.0 {
        t += POLL_MS + rng.bipolar() * POLL_JITTER_MS;
        let due = ((t * rate as f64 / 1000.0) as usize / input_frames) * input_frames;
        while written < due.min(samples.len()) {
            let end = (written + input_frames).min(samples.len());
            ring.write(&samples[written..end]);
            written = end;
        }
        core.pull(&ring);
        let mut sink = |o: Onset| onsets.push(o);
        core.process(BASE_NS + (t * 1e6) as u64, &ctx, &mut sink);
    }
    let mut sink = |o: Onset| onsets.push(o);
    core.finish(&mut sink);
    Detected {
        onsets: onsets
            .iter()
            .map(|o| PlayedOnset { time_ms: (o.ts_ns.saturating_sub(BASE_NS)) as f64 / 1e6, amplitude: o.amplitude, confidence: o.confidence })
            .collect(),
        delay_ms,
    }
}

/// Everything the production path says of one Take.
pub struct Outcome {
    pub rate: u32,
    pub seconds: f64,
    pub detected: Detected,
    pub gap_ms: Option<f64>,
    /// The grade the player would be shown once the late pass is in.
    pub report: Option<ScheduleReport>,
    /// The right-notes pass, per result, whether or not a bar asks for it.
    pub pitch_states: Vec<Option<NoteState>>,
    /// The right-notes verdict the late grade counts: the pitch pass and the
    /// verifier merged (`ScheduleRun::late_states`), or the pitch pass alone
    /// when the verifier did not run.
    pub final_states: Vec<Option<NoteState>>,
    /// Where the right-notes pass reads each result from, and where it cuts
    /// its track, ms into the audio (`ScheduleRun::pitch_lookups_ms`).
    pub pitch_lookups_ms: Vec<Option<f64>>,
    pub pitch_cuts_ms: Vec<f64>,
    pub verifier: VerifierReport,
    pub analysis: Option<Analysis>,
    pub pitch_track: Option<PitchTrack>,
    /// Milliseconds of work per stage.
    pub cost: Cost,
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cost {
    pub detect_ms: f64,
    pub score_ms: f64,
    pub model_ms: f64,
    pub rule_ms: f64,
    pub pitch_track_ms: f64,
}

pub struct Options {
    /// Keep the pitch track (the replay tool draws it).
    pub keep_track: bool,
}

pub fn run_take(samples: &[f32], rate: u32, job: &Job, model: Option<&mut Box<dyn NoteModel>>, opts: &Options) -> Outcome {
    let instrument = Instrument::from_id(job.instrument.as_deref().unwrap_or("electric-guitar"));
    let q = 60_000.0 / job.bpm.max(1.0);
    let gap_ms = job.schedule.as_ref().and_then(|s| smallest_gap_beats(&s.onsets)).map(|g| g * q);
    let mut cost = Cost::default();

    let started = Instant::now();
    let detected = detect(samples, rate, instrument, job.bpm, job.subdivision.unwrap_or(1), gap_ms, job.schedule.is_some(), job.input_frames.unwrap_or(256));
    cost.detect_ms = started.elapsed().as_secs_f64() * 1000.0;
    let seconds = samples.len() as f64 / rate.max(1) as f64;

    let mut out = Outcome {
        rate,
        seconds,
        detected,
        gap_ms,
        report: None,
        pitch_states: Vec::new(),
        final_states: Vec::new(),
        pitch_lookups_ms: Vec::new(),
        pitch_cuts_ms: Vec::new(),
        verifier: VerifierReport::status(if model.is_some() { VerifierStatus::NoAudio } else { VerifierStatus::NoModel }),
        analysis: None,
        pitch_track: None,
        cost,
    };

    // The model's pass, when there is a model: the replay tool wants it even
    // with no schedule to verify.
    let mut analysis = None;
    if let Some(model) = model {
        let started = Instant::now();
        match yames_lib::detect::analyse(model.as_mut(), samples, rate) {
            Ok(a) => analysis = Some(a),
            Err(e) => {
                eprintln!("the note model failed: {e}");
                out.verifier = VerifierReport::status(VerifierStatus::Failed);
            }
        }
        out.cost.model_ms = started.elapsed().as_secs_f64() * 1000.0;
    }

    let track_cfg = PitchConfig::guitar();
    if let Some(schedule) = &job.schedule {
        let beats_per_bar = job.beats_per_bar.unwrap_or(4);
        let mut run = ScheduleRun::new(schedule.clone()).with_lag_correction(true).with_pass_bars(job.pass_bars.clone());
        if !job.pitches.is_empty() {
            run = run.with_note_pitches(job.pitches.clone()).with_note_details(job.details.clone());
        }
        // The transport runs to the end of the audio, as a Take's does.
        if job.quarters_ms.is_empty() {
            let total_ms = seconds * 1000.0;
            let mut i = 0usize;
            loop {
                let t = job.first_beat_ms + i as f64 * q;
                if t > total_ms + q {
                    break;
                }
                run.note_quarter_in_bar(i as u32 % beats_per_bar == 0, t, beats_per_bar);
                i += 1;
            }
        } else {
            for (i, t) in job.quarters_ms.iter().enumerate() {
                run.note_quarter_in_bar(i as u32 % beats_per_bar == 0, *t, beats_per_bar);
            }
        }
        for o in &out.detected.onsets {
            run.note_onset(*o);
        }
        let weights = instrument.profile().score_weights;
        let audio = TakeAudio { samples, rate, start_ms: 0.0, detection_delay_ms: out.detected.delay_ms };
        let started = Instant::now();
        // What `timing.rs` does on the post-Take thread: the timing report,
        // then the late grade with right notes and the verifier in it.
        out.pitch_cuts_ms = run.pitch_cuts_ms(&audio);
        let verified = run.report(&weights).map(|timed| {
            out.pitch_lookups_ms = run.pitch_lookups_ms(&timed, &audio);
            let pitch_states = if job.pitches.is_empty() { vec![None; timed.results.len()] } else { run.pitch_states(&timed, &audio) };
            let rule = Instant::now();
            let verifier = match &analysis {
                Some(a) if !job.pitches.is_empty() => run.verify_analysed(&timed, &audio, a),
                _ => out.verifier.clone(),
            };
            out.cost.rule_ms = rule.elapsed().as_secs_f64() * 1000.0;
            let final_states = if verifier.status == VerifierStatus::Ran { run.late_states(&timed, &audio, &verifier) } else { pitch_states.clone() };
            (pitch_states, verifier, final_states)
        });
        if let Some((pitch_states, verifier, final_states)) = verified {
            out.final_states = final_states;
            out.report = run.report_late(&weights, &audio, Some(&verifier));
            out.pitch_states = pitch_states;
            out.verifier = verifier;
        }
        out.cost.score_ms = started.elapsed().as_secs_f64() * 1000.0 - out.cost.rule_ms;
    }
    if opts.keep_track && out.pitch_track.is_none() {
        let started = Instant::now();
        out.pitch_track = Some(yames_lib::pitch::track(samples, rate, &track_cfg));
        out.cost.pitch_track_ms = started.elapsed().as_secs_f64() * 1000.0;
    }
    out.verifier.model_ms = out.cost.model_ms;
    out.analysis = analysis;
    out
}
