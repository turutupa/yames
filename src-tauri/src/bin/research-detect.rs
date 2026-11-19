//! Research bench (branch `research/detection-bench`, not for main): one WAV
//! through the shipped detector, scorer and pitch tracker, as JSON on stdout.
//!
//! It adds nothing to the app. It drives `OnsetCore` the way
//! `tests/audio_fixtures.rs::detect` does (a ring buffer fed in device-sized
//! blocks, the core polled about every 5 ms), then `ScheduleRun` and
//! `pitch::track`, so numbers from here are the product's own.
//!
//! Usage:
//!   cargo run --release --bin research-detect -- <job.json>
//!
//! The job (camelCase):
//!   audio          path to a WAV/FLAC
//!   bpm            tempo of the take
//!   firstBeatMs    where beat 0 of the schedule is in the file (default 0)
//!   beatsPerBar    default 4
//!   instrument     "electric-guitar" (default) | "acoustic-guitar" | ...
//!   knownScore     true (default): a schedule is loaded, refractory 0.5 x gap
//!   gapMs          smallest written gap; default from the schedule
//!   subdivision    click subdivision when no schedule is known (default 1)
//!   schedule       a `ScoreSchedule` as `src/songs/schedule.ts` writes it
//!   pitches        [{id, midi}] the written pitch of each note id
//!   passBars       the Exercise's pass bars
//!   inputFrames    device buffer size in frames (default 256)
//!   pitchFrames    true to print the pitch track frame by frame
//!   pitchRange     "guitar" (default) | "wide" | "bass"

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Instant;

use serde::Deserialize;
use serde_json::json;

use yames_lib::audio_input::RingBuffer;
use yames_lib::instrument::Instrument;
use yames_lib::onset::{Onset, OnsetCore, TempoContext, ONSET_HOP_SIZE};
use yames_lib::pitch::{
    decode_mono_file, identify_take_notes, notes_from, track, MatchedOnset, OnsetState as PitchState,
    PitchConfig, ScoreNote,
};
use yames_lib::score::notes::TakeAudio;
use yames_lib::score::pass::PassBar;
use yames_lib::score::{smallest_gap_beats, OnsetState, PlayedOnset, ScheduleRun, ScoreSchedule};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Job {
    audio: String,
    bpm: f64,
    #[serde(default)]
    first_beat_ms: f64,
    #[serde(default)]
    beats_per_bar: Option<u32>,
    #[serde(default)]
    instrument: Option<String>,
    #[serde(default)]
    known_score: Option<bool>,
    #[serde(default)]
    gap_ms: Option<f64>,
    #[serde(default)]
    subdivision: Option<u8>,
    #[serde(default)]
    schedule: Option<ScoreSchedule>,
    #[serde(default)]
    pitches: Vec<ScoreNote>,
    #[serde(default)]
    pass_bars: Vec<PassBar>,
    #[serde(default)]
    input_frames: Option<usize>,
    #[serde(default)]
    pitch_frames: bool,
    #[serde(default)]
    pitch_range: Option<String>,
    /// How far back to move the pitch lookups for the counter-experiment.
    #[serde(default)]
    pitch_lookback_ms: Option<f64>,
}

/// A small xorshift, so the poll jitter is the same every run.
struct Rng(u64);
impl Rng {
    fn bipolar(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64 * 2.0 - 1.0
    }
}

fn detect(
    samples: &[f32],
    rate: u32,
    instrument: Instrument,
    bpm: f64,
    subdivision: u8,
    gap_ms: Option<f64>,
    known_score: bool,
    input_frames: usize,
) -> Vec<PlayedOnset> {
    const BASE_NS: u64 = 5_000_000_000;
    const POLL_MS: f64 = 5.2;
    const POLL_JITTER_MS: f64 = 0.6;
    let ctx = TempoContext::new(bpm.round().clamp(1.0, 600.0) as u16, subdivision);
    ctx.set_played_interval_ms(gap_ms.map(|g| g as f32));
    ctx.set_known_score(known_score);
    let profile = instrument.profile();
    let mut core = OnsetCore::with_hop(&profile, rate, ONSET_HOP_SIZE);
    let mut ring = RingBuffer::new(rate as usize * 4);
    let mut rng = Rng(0x5EED_F00D);
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

    onsets
        .iter()
        .map(|o| PlayedOnset {
            time_ms: (o.ts_ns - BASE_NS) as f64 / 1e6,
            amplitude: o.amplitude,
            confidence: o.confidence,
        })
        .collect()
}

fn main() -> ExitCode {
    let Some(job_path) = env::args().nth(1) else {
        eprintln!("usage: research-detect <job.json>");
        return ExitCode::from(2);
    };
    let job: Job = match fs::read_to_string(&job_path)
        .map_err(|e| e.to_string())
        .and_then(|raw| serde_json::from_str(&raw).map_err(|e| e.to_string()))
    {
        Ok(j) => j,
        Err(e) => {
            eprintln!("{job_path}: {e}");
            return ExitCode::from(2);
        }
    };
    let (samples, rate) = match decode_mono_file(&PathBuf::from(&job.audio)) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("{}: {e}", job.audio);
            return ExitCode::from(2);
        }
    };
    let instrument = Instrument::from_id(job.instrument.as_deref().unwrap_or("electric-guitar"));
    let q = 60_000.0 / job.bpm;
    let known_score = job.known_score.unwrap_or(true);
    let gap_ms = job.gap_ms.or_else(|| {
        job.schedule
            .as_ref()
            .and_then(|s| smallest_gap_beats(&s.onsets))
            .map(|g| g * q)
    });

    let started = Instant::now();
    let onsets = detect(
        &samples,
        rate,
        instrument,
        job.bpm,
        job.subdivision.unwrap_or(1),
        gap_ms,
        known_score,
        job.input_frames.unwrap_or(256),
    );
    let detect_ms = started.elapsed().as_secs_f64() * 1000.0;

    let mut out = json!({
        "rate": rate,
        "seconds": samples.len() as f64 / rate.max(1) as f64,
        "gapMs": gap_ms,
        "detectMs": detect_ms,
        "onsets": onsets.iter().map(|o| json!({
            "tMs": o.time_ms, "amp": o.amplitude, "conf": o.confidence,
        })).collect::<Vec<_>>(),
    });

    if let Some(schedule) = &job.schedule {
        let beats_per_bar = job.beats_per_bar.unwrap_or(4);
        let mut run = ScheduleRun::new(schedule.clone())
            .with_lag_correction(true)
            .with_pass_bars(job.pass_bars.clone());
        if !job.pitches.is_empty() {
            run = run.with_note_pitches(job.pitches.clone());
        }
        // The transport runs to the end of the audio, as a Take's does.
        let total_ms = samples.len() as f64 * 1000.0 / rate as f64;
        let mut i = 0usize;
        loop {
            let t = job.first_beat_ms + i as f64 * q;
            if t > total_ms + q {
                break;
            }
            run.note_quarter_in_bar(i == 0, t, beats_per_bar);
            i += 1;
        }
        for o in &onsets {
            run.note_onset(*o);
        }
        let weights = instrument.profile().score_weights;
        let scored = Instant::now();
        let report = if run.wants_notes() {
            let audio = TakeAudio {
                samples: &samples,
                rate,
                start_ms: 0.0,
            };
            run.report_with_notes(&weights, &audio)
        } else {
            run.report(&weights)
        };
        out["scoreMs"] = json!(scored.elapsed().as_secs_f64() * 1000.0);
        if let Some(report) = report {
            // Per-note verdicts, the way `score::notes::identify` asks for them:
            // each hit looked up at `due + offset + deviation` on the audio's
            // clock, the track cut at every onset the detector heard.
            if !job.pitches.is_empty() {
                let offset = report.grade.calibration.offset_ms;
                let length = schedule.length_beats;
                let matched: Vec<MatchedOnset> = report
                    .results
                    .iter()
                    .filter_map(|r| {
                        let onset = schedule.onsets.iter().find(|o| o.id == r.id)?;
                        let due = job.first_beat_ms + (r.pass as f64 * length + onset.beat) * q + offset;
                        Some(MatchedOnset::from_result(
                            r.id,
                            onset.note_ids.clone(),
                            match r.state {
                                OnsetState::Hit => PitchState::Hit,
                                OnsetState::Miss => PitchState::Miss,
                                OnsetState::SoftAbsent => PitchState::SoftAbsent,
                            },
                            due,
                            r.deviation_ms,
                        ))
                    })
                    .collect();
                let cuts: Vec<f64> = onsets.iter().map(|o| o.time_ms).collect();
                let lowest = job.pitches.iter().map(|n| n.midi.round() as i32).min().unwrap_or(40);
                let cfg = PitchConfig::for_tuning(&[lowest.min(40)]);
                let verdicts = identify_take_notes(&samples, rate, &job.pitches, &matched, &cuts, &cfg);
                out["noteVerdicts"] = serde_json::to_value(&verdicts).unwrap_or_default();

                // The counter-experiment: the same pass with every lookup and
                // every cut moved back by the detector's own delay, so a note
                // is read from where it starts in the audio and not from where
                // the peak picker got round to saying so.
                let back = job.pitch_lookback_ms.unwrap_or(25.0);
                let matched_back: Vec<MatchedOnset> = matched
                    .iter()
                    .map(|m| MatchedOnset {
                        heard_at_ms: m.heard_at_ms.map(|t| (t - back).max(0.0)),
                        ..m.clone()
                    })
                    .collect();
                let cuts_back: Vec<f64> = cuts.iter().map(|t| (t - back).max(0.0)).collect();
                let verdicts_back =
                    identify_take_notes(&samples, rate, &job.pitches, &matched_back, &cuts_back, &cfg);
                out["noteVerdictsLookback"] = serde_json::to_value(&verdicts_back).unwrap_or_default();
                out["pitchLookbackMs"] = json!(back);
            }
            out["grade"] = serde_json::to_value(&report.grade).unwrap_or_default();
            out["report"] = serde_json::to_value(&report).unwrap_or_default();
        }
    }

    let cfg = match job.pitch_range.as_deref() {
        Some("wide") => PitchConfig::default(),
        Some("bass") => PitchConfig::bass(),
        _ => PitchConfig::guitar(),
    };
    let pitch_started = Instant::now();
    let tr = track(&samples, rate, &cfg);
    let onset_ms: Vec<f64> = onsets.iter().map(|o| o.time_ms).collect();
    let notes = notes_from(&tr, &onset_ms);
    out["pitchMs"] = json!(pitch_started.elapsed().as_secs_f64() * 1000.0);
    out["pitchHopMs"] = json!(cfg.hop_ms());
    out["pitchWindowMs"] = json!(cfg.window_ms());
    out["pitchNotes"] = json!(notes
        .iter()
        .map(|n| json!({
            "startMs": n.start_ms, "endMs": n.end_ms, "midi": n.midi, "conf": n.confidence,
        }))
        .collect::<Vec<_>>());
    if job.pitch_frames {
        out["pitchTrack"] = json!(tr
            .frames
            .iter()
            .map(|f| json!([f.start_ms, if f.voiced { f.midi } else { -1.0 }, f.confidence, f.rms]))
            .collect::<Vec<_>>());
    }

    println!("{out}");
    ExitCode::SUCCESS
}
