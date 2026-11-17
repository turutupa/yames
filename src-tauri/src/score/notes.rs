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
    let length = pass_length(&run.schedule);
    let by_id: HashMap<u32, &ExpectedOnset> = run.schedule.onsets.iter().map(|o| (o.id, o)).collect();
    // The deviations are measured from the scoring offset, so a hit was played
    // at `due + offset + deviation` on the onsets' own clock
    // (`match_attempt_calibrated`, "what gets reported").
    let offset = report.grade.calibration.offset_ms;
    let mut matched: Vec<MatchedOnset> = Vec::new();
    let mut single: Vec<bool> = vec![false; report.results.len()];
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
        let due_in_audio = due + offset - audio.start_ms;
        let heard = due_in_audio + r.deviation_ms.unwrap_or(0.0);
        if heard < 0.0 || heard > span - END_MARGIN_MS {
            continue;
        }
        single[k] = onset.note_ids.len() == 1;
        // The result's index is its id here, so a verdict comes back to it
        // whichever time round a loop it was.
        matched.push(MatchedOnset::from_result(
            k as u32,
            onset.note_ids.clone(),
            PitchState::Hit,
            due_in_audio,
            r.deviation_ms,
        ));
    }
    if matched.is_empty() {
        return out;
    }

    // Every note the detector heard is where the track is cut, written or not:
    // an extra note left out would be folded into the note before it.
    let cuts: Vec<f64> = run
        .played
        .iter()
        .map(|p| p.time_ms - audio.start_ms)
        .filter(|t| *t >= 0.0 && *t < span)
        .collect();
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
