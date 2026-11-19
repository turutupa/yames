//! Right notes on a Take: the `noteIdentity` metric of `src/paths/metrics.ts`.
//!
//! The timing grade is the matcher's (`super::match_attempt_calibrated`). This
//! is the second look a pass bar naming `noteIdentity` needs: the Take's own
//! input audio, tracked by `pitch.rs`, each note the matcher called a hit
//! checked against the pitch it was written at. What comes back goes into the
//! grade per bar, and `pass::notes_status` decides whether it can be believed
//! at all.
//!
//! **Where it runs.** Never on audio and never on the analyzer's 5 ms loop.
//! The input is captured by the onset detector's thread into a buffer that was
//! allocated before the Take (`crate::take_audio`), and the pitch pass runs on
//! a thread of its own once the Take is closed (`timing.rs`). In a release
//! build it takes about 60 ms for 20 s of audio on the machine it was written
//! on, and some seconds in a debug build, so the timing verdict goes out first
//! with `notesPending` and the grade with right notes follows
//! (`get_take_grade_with_notes`).
//!
//! **What it counts.** Only notes the matcher heard. A missed note is
//! `notesHeard`'s mistake, and charging it here as well would count it twice.
//! A heard note with no pitch in it (a dead note, or one the next note rang
//! over) is `unpitched`, which is not a wrong note either; it is what tells
//! `notes_status` the notes are ringing. A chord is not checked: a monophonic
//! tracker cannot say which of three notes it heard (`pitch::match_notes`).

use std::collections::HashMap;

use super::{pass_length, ExpectedOnset, OnsetState, ScheduleReport, ScheduleRun};
use crate::pitch::{
    identify_take_notes, MatchedOnset, NoteState, OnsetState as PitchState, PitchConfig, ScoreNote,
};

/// A Take's input audio, mono, on the beat map's clock.
#[derive(Debug, Clone, Copy)]
pub struct TakeAudio<'a> {
    pub samples: &'a [f32],
    pub rate: u32,
    /// Where `samples[0]` falls, in the milliseconds the beat map and the
    /// played onsets are in.
    pub start_ms: f64,
    /// How far each played onset's time is behind the attack it stands for:
    /// the detector's peak-picking delay (`OnsetCore::detection_delay_ns`,
    /// about 25 ms on a guitar at 48 kHz). The onsets' clock and the
    /// samples' clock are the same clock, but an onset is stamped when aubio
    /// called it, not when the string was struck, so a note read at its
    /// stamp is read 25 ms in, and at sixteenths above about 135 BPM that is
    /// inside the next note (research M0, 2026-11). Zero for onsets that are
    /// already attack times, such as a test's own truth. One value for the
    /// whole Take: a Take with MIDI notes among its onsets (which ARE attack
    /// times) is not given to this pass at all (`timing.rs`,
    /// `NotesPass::midi_seen`).
    pub detection_delay_ms: f64,
}

impl TakeAudio<'_> {
    fn span_ms(&self) -> f64 {
        if self.rate == 0 {
            return 0.0;
        }
        self.samples.len() as f64 * 1000.0 / self.rate as f64
    }
}

/// A note this close to the end of the audio is not asked about: the tracker
/// needs a window of it after the attack.
const END_MARGIN_MS: f64 = 40.0;

/// Where one hit of a report is read in the Take's audio.
pub(super) struct Lookup<'a> {
    /// Index into `report.results`.
    pub result: usize,
    pub onset: &'a ExpectedOnset,
    /// Where the note was due, ms into the audio, on the attacks' clock.
    pub due_ms: f64,
    /// Where it was struck, ms into the audio: `due_ms` plus its deviation.
    /// This is the time the pitch pass reads the note from, and it has to be
    /// the ATTACK: a few ms off is harmless, the detector's 25 ms is not.
    pub attack_ms: f64,
}

/// Every hit of `report` that falls inside `audio`, placed in it. The one
/// place the detector's delay is taken out of a look-up: `identify` reads
/// from here, and so does `ScheduleRun::pitch_lookups_ms`, which is what the
/// bench compares with the true attack times (so taking the delay out twice,
/// or not at all, moves a gated number).
pub(super) fn lookups<'a>(run: &'a ScheduleRun, report: &ScheduleReport, audio: &TakeAudio<'_>) -> Vec<Lookup<'a>> {
    let span = audio.span_ms();
    let length = pass_length(&run.schedule);
    let by_id: HashMap<u32, &ExpectedOnset> = run.schedule.onsets.iter().map(|o| (o.id, o)).collect();
    // The deviations are measured from the scoring offset, so a hit was
    // stamped at `due + offset + deviation` on the onsets' own clock
    // (`match_attempt_calibrated`, "what gets reported"), and struck the
    // detector's delay before that.
    let offset = report.grade.calibration.offset_ms - audio.detection_delay_ms;
    let mut out = Vec::new();
    for (k, r) in report.results.iter().enumerate() {
        if r.state != OnsetState::Hit {
            continue;
        }
        let Some(onset) = by_id.get(&r.id) else {
            continue;
        };
        let Some(due) = run.beats.time_at_beat(r.pass as f64 * length + onset.beat) else {
            continue;
        };
        let due_ms = due + offset - audio.start_ms;
        let attack_ms = due_ms + r.deviation_ms.unwrap_or(0.0);
        if attack_ms < 0.0 || attack_ms > span - END_MARGIN_MS {
            continue;
        }
        out.push(Lookup { result: k, onset, due_ms, attack_ms });
    }
    out
}

/// Where the pitch track is cut into notes, ms into `audio`: every onset the
/// detector heard, moved back to its attack. The other place the detector's
/// delay is taken out, and the bench holds it against the truth too.
pub(super) fn cuts(run: &ScheduleRun, audio: &TakeAudio<'_>) -> Vec<f64> {
    let span = audio.span_ms();
    run.played
        .iter()
        .map(|p| p.time_ms - audio.detection_delay_ms - audio.start_ms)
        .filter(|t| *t >= 0.0 && *t < span)
        .collect()
}

/// What the pitch pass says of each result of `report`, in step with
/// `report.results`. `None` for everything it gives no verdict on: a miss, a
/// soft note, a chord, a note outside the audio. All `None` when there is no
/// audio or nothing to check against.
pub(super) fn identify(run: &ScheduleRun, report: &ScheduleReport, audio: &TakeAudio<'_>) -> Vec<Option<NoteState>> {
    let mut out = vec![None; report.results.len()];
    let span = audio.span_ms();
    if span <= END_MARGIN_MS || run.pitches.is_empty() {
        return out;
    }
    // The deviations are measured from the scoring offset, so a hit was
    // stamped at `due + offset + deviation` on the onsets' own clock
    // (`match_attempt_calibrated`, "what gets reported"), and struck the
    // detector's delay before that. Every time below is moved back by it, the
    // look-ups and the cuts alike, so the track is cut at the attacks and each
    // note is read from its own attack (plus `pitch::ATTACK_BLANK_MS`).
    let mut matched: Vec<MatchedOnset> = Vec::new();
    let mut single: Vec<bool> = vec![false; report.results.len()];
    for look in lookups(run, report, audio) {
        single[look.result] = look.onset.note_ids.len() == 1;
        // The result's index is its id here, so a verdict comes back to it
        // whichever time round a loop it was.
        matched.push(MatchedOnset::from_result(
            look.result as u32,
            look.onset.note_ids.clone(),
            PitchState::Hit,
            look.due_ms,
            report.results[look.result].deviation_ms,
        ));
    }
    if matched.is_empty() {
        return out;
    }

    // Every note the detector heard is where the track is cut, written or not:
    // an extra note left out would be folded into the note before it.
    let cuts = cuts(run, audio);
    let wanted: std::collections::HashSet<u32> =
        matched.iter().flat_map(|m| m.note_ids.iter().copied()).collect();
    let notes: Vec<ScoreNote> = run.pitches.iter().filter(|n| wanted.contains(&n.id)).copied().collect();
    // A guitar's range buys the time resolution a fast part needs; below E2 is
    // a bass (`PitchConfig::for_tuning`).
    let lowest = notes.iter().map(|n| n.midi.round() as i32).min().unwrap_or(40);
    let cfg = PitchConfig::for_tuning(&[lowest.min(40)]);

    for v in identify_take_notes(audio.samples, audio.rate, &notes, &matched, &cuts, &cfg) {
        let k = v.onset_id as usize;
        if k < out.len() && single[k] && v.state != NoteState::NotAssessed {
            out[k] = Some(v.state);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::instrument::Instrument;
    use crate::score::{PlayedOnset, ScoreSchedule};

    /// The truth against the look-up, with the delay in it. The player strikes
    /// 30 ms after each click (the system's lag); the detector stamps each
    /// attack its 25 ms later still. Every look-up and every cut must land on
    /// the true attack: not taking the delay out reads +25 ms, taking it out
    /// twice (here and in the calibration, say) reads -25 ms, and both fail
    /// this whatever the pitch verdicts would have been (research M0; the
    /// bench's `lookup_bias_ms` is the same check on rendered audio).
    #[test]
    fn every_look_up_and_cut_lands_on_the_true_attack() {
        const LAG_MS: f64 = 30.0;
        const DELAY_MS: f64 = 25.0;
        let bpm = 160.0;
        let q = 60_000.0 / bpm;
        let first = 1_000.0;
        let n = 32u32;
        // sixteenths, so a 25 ms error is most of a gap (94 ms)
        let onsets: Vec<ExpectedOnset> = (0..n).map(|i| ExpectedOnset { id: i, beat: i as f64 / 4.0, note_ids: vec![i], soft: false, accent: false }).collect();
        let schedule = ScoreSchedule { onsets, length_beats: n as f64 / 4.0, loops: false };
        let mut run = ScheduleRun::new(schedule).with_lag_correction(true);
        for b in 0..(n / 4 + 4) {
            run.note_quarter_in_bar(b % 4 == 0, first + b as f64 * q, 4);
        }
        // a little scatter, so the calibration is a median and not a constant
        let scatter = |i: u32| ((i * 7919) % 7) as f64 - 3.0;
        let truth: Vec<f64> = (0..n).map(|i| first + i as f64 * q / 4.0 + LAG_MS + scatter(i)).collect();
        for t in &truth {
            run.note_onset(PlayedOnset { time_ms: t + DELAY_MS, amplitude: 0.5, confidence: 1.0 });
        }
        let weights = Instrument::ElectricGuitar.profile().score_weights;
        let report = run.report(&weights).expect("a report");
        let rate = 8_000;
        let samples = vec![0.0f32; (rate as f64 * (first + n as f64 * q / 4.0 + 1_000.0) / 1000.0) as usize];
        let start_ms = 200.0;
        let audio = TakeAudio { samples: &samples, rate, start_ms, detection_delay_ms: DELAY_MS };

        let looked = run.pitch_lookups_ms(&report, &audio);
        let mut checked = 0;
        for (k, r) in report.results.iter().enumerate() {
            let Some(at) = looked[k] else { continue };
            let truth_ms = truth[r.id as usize] - start_ms;
            assert!((at - truth_ms).abs() < 2.0, "note {}: read at {at:.1} ms, struck at {truth_ms:.1} ms", r.id);
            checked += 1;
        }
        assert_eq!(checked, n as usize, "every note was a hit and was looked up");
        let cuts = run.pitch_cuts_ms(&audio);
        assert_eq!(cuts.len(), n as usize);
        for (c, t) in cuts.iter().zip(&truth) {
            assert!((c - (t - start_ms)).abs() < 1e-6, "cut at {c:.1}, struck at {:.1}", t - start_ms);
        }
    }
}
