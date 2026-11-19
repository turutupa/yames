//! A Take's written notes, confirmed or declined one by one by the note
//! model: the glue between the scorer and `crate::detect`.
//!
//! The timing grade stays the matcher's and the onset detector's. This is a
//! second, slower look that answers what they cannot: whether a hammer-on
//! sounded, which note of a fast run was wrong, whether a chord's strings all
//! rang. It runs where the right-notes pass runs (`timing.rs`,
//! `yames-take-notes`, after the Take, below normal priority) and its result
//! travels on the same late grade.
//!
//! Owner decisions it carries (plans/detection/PROGRESS.md):
//!   * the model only CONFIRMS or DECLINES notes the Exercise wrote;
//!   * an unsounded hammer-on or pull-off is REPORTED, not graded;
//!   * weak evidence reads "couldn't tell", never "missed", and never blocks
//!     a pass.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::notes::TakeAudio;
use super::{pass_length, ExpectedOnset, OnsetState, ScheduleReport, ScheduleRun};
use crate::detect::model::NoteModel;
use crate::detect::verifier::{verify, Expected, Heard, How};
use crate::detect::Analysis;

/// What the frontend knows about a written note beyond its pitch
/// (`src/session/take.ts`). All optional: a note with no detail is verified as
/// a plain picked note lasting to the next onset.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDetail {
    pub id: u32,
    /// Written length in quarter notes; 0 for unknown.
    #[serde(default)]
    pub dur_beats: f64,
    /// Semitones the note is bent up to; 0 for none.
    #[serde(default)]
    pub bend: f64,
    /// 1 = high E. 0 for unknown.
    #[serde(default)]
    pub string: u8,
    /// `PathTechnique` names: hammer, pull, slide, bend, vibrato, palmMute,
    /// letRing, tap, and Songs' harmonic, dead, ghost.
    #[serde(default)]
    pub tech: Vec<String>,
}

/// How a note is produced, for the per-technique tally. One per note, the
/// first that applies, in this order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NoteKind {
    ChordTone,
    Hammer,
    Pull,
    Tap,
    SlideTo,
    Bend,
    Harmonic,
    PalmMute,
    Picked,
}

impl NoteKind {
    /// No pick attack is expected, so absence of one is not evidence.
    pub fn is_legato(self) -> bool {
        matches!(self, NoteKind::Hammer | NoteKind::Pull | NoteKind::SlideTo)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedNote {
    /// Index into the report's `results`.
    pub result: u32,
    pub onset_id: u32,
    pub pass: u32,
    pub note_id: u32,
    pub kind: NoteKind,
    pub heard: Heard,
    pub how: How,
    /// The pitch heard instead, on `wrong`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heard_midi: Option<i32>,
    /// Where it started against where it was due, lag removed. Negative early.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deviation_ms: Option<f64>,
    /// The model's "sounding" reading over the note, 0..1: a loudness proxy.
    pub strength: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KindTally {
    pub kind: NoteKind,
    /// Notes of this kind the Take reached.
    pub due: u32,
    pub sounded: u32,
    pub not_sounded: u32,
    pub wrong: u32,
    /// "Couldn't tell".
    pub unsure: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum VerifierStatus {
    /// Verdicts are in `notes`.
    Ran,
    /// This build has no model.
    #[default]
    NoModel,
    /// No audio was kept, or no note fell inside it.
    NoAudio,
    /// The model or the runtime failed; the grade is as it was.
    Failed,
}

/// The verifier's account of a Take.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VerifierReport {
    pub status: VerifierStatus,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub kinds: Vec<KindTally>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<VerifiedNote>,
    /// The offset between the click's grid and the audio it used.
    pub lag_ms: f64,
    /// Wall time of the model pass and of the rule.
    pub model_ms: f64,
    pub rule_ms: f64,
    /// Seconds of audio it read.
    pub audio_s: f64,
}

impl VerifierReport {
    pub fn status(status: VerifierStatus) -> Self {
        Self { status, ..Self::default() }
    }

    pub fn tally(&self, kind: NoteKind) -> Option<&KindTally> {
        self.kinds.iter().find(|k| k.kind == kind)
    }
}

fn kind_of(detail: Option<&NoteDetail>, chord: bool, slid_to: bool) -> NoteKind {
    if chord {
        return NoteKind::ChordTone;
    }
    let has = |t: &str| detail.is_some_and(|d| d.tech.iter().any(|x| x == t));
    if has("hammer") {
        NoteKind::Hammer
    } else if has("pull") {
        NoteKind::Pull
    } else if has("tap") {
        NoteKind::Tap
    } else if slid_to {
        NoteKind::SlideTo
    } else if has("bend") || detail.is_some_and(|d| d.bend > 0.0) {
        NoteKind::Bend
    } else if has("harmonic") {
        NoteKind::Harmonic
    } else if has("palmMute") {
        NoteKind::PalmMute
    } else {
        NoteKind::Picked
    }
}

/// The notes a slide arrives at: the next note on the same string after one
/// marked `slide` (the DSL puts the mark on the note it leaves).
fn slid_to_ids(onsets: &[ExpectedOnset], details: &HashMap<u32, &NoteDetail>) -> std::collections::HashSet<u32> {
    let mut ordered: Vec<&ExpectedOnset> = onsets.iter().collect();
    ordered.sort_by(|a, b| a.beat.total_cmp(&b.beat));
    let mut leaving: HashMap<u8, bool> = HashMap::new();
    let mut out = std::collections::HashSet::new();
    for o in ordered {
        for id in &o.note_ids {
            let Some(d) = details.get(id) else { continue };
            if d.string == 0 {
                continue;
            }
            if leaving.get(&d.string).copied().unwrap_or(false) {
                out.insert(*id);
            }
            leaving.insert(d.string, d.tech.iter().any(|t| t == "slide"));
        }
    }
    out
}

impl ScheduleRun {
    /// Detail for the verifier, as `src/session/take.ts` sends it.
    pub fn with_note_details(mut self, details: Vec<NoteDetail>) -> Self {
        self.details = details;
        self
    }

    /// Whether there is anything for the verifier to check on this run: the
    /// written pitches are loaded. Unlike [`Self::wants_notes`] it does not
    /// need a `noteIdentity` bar, because what it reports is information.
    pub fn wants_verifier(&self) -> bool {
        !self.pitches.is_empty() && crate::detect::model::enabled()
    }

    /// What this Take was, as a sidecar `detect-bench replay` reads
    /// (`harness.rs::Job`): the schedule, pitches, details and pass bars it
    /// was loaded with, and where every quarter fell in the audio that starts
    /// at `audio_start_ms`. For `crate::take_diagnostics` only.
    pub fn diagnostic_job(&self, audio_start_ms: f64, instrument_id: &str) -> serde_json::Value {
        let quarters: Vec<f64> = self.beats.quarters_ms().iter().map(|t| ((t - audio_start_ms) * 100.0).round() / 100.0).collect();
        serde_json::json!({
            "audio": "",
            "bpm": self.beats.median_bpm(),
            "firstBeatMs": quarters.first().copied().unwrap_or(0.0),
            "beatsPerBar": self.beats.beats_per_bar_or(4),
            "quartersMs": quarters,
            "instrument": instrument_id,
            "schedule": self.schedule,
            "pitches": self.pitches,
            "details": self.details,
            "passBars": self.pass_bars,
        })
    }

    /// Every written note of `report` placed in `audio`, in the order of
    /// `report.results`, with the result's index and the kind of each.
    pub fn expected_notes(&self, report: &ScheduleReport, audio: &TakeAudio<'_>) -> Vec<(Expected, u32, NoteKind)> {
        let span_s = audio.samples.len() as f64 / audio.rate.max(1) as f64;
        let length = pass_length(&self.schedule);
        let by_id: HashMap<u32, &ExpectedOnset> = self.schedule.onsets.iter().map(|o| (o.id, o)).collect();
        let pitch: HashMap<u32, f64> = self.pitches.iter().map(|n| (n.id, n.midi)).collect();
        let detail: HashMap<u32, &NoteDetail> = self.details.iter().map(|d| (d.id, d)).collect();
        let slid = slid_to_ids(&self.schedule.onsets, &detail);
        // the gap to the next written onset, for a note with no length given
        let mut beats: Vec<f64> = self.schedule.onsets.iter().map(|o| o.beat).collect();
        beats.sort_by(|a, b| a.total_cmp(b));
        let mut out = Vec::new();
        for (k, r) in report.results.iter().enumerate() {
            let Some(onset) = by_id.get(&r.id) else { continue };
            let at = r.pass as f64 * length + onset.beat;
            let Some(due) = self.beats.time_at_beat(at) else { continue };
            let t = (due - audio.start_ms) / 1000.0;
            if t < 0.0 || t > span_s - 0.04 {
                continue;
            }
            let next_gap = beats.iter().find(|b| **b > onset.beat + 1e-6).map(|b| b - onset.beat).unwrap_or(1.0);
            for id in &onset.note_ids {
                let Some(midi) = pitch.get(id) else { continue };
                let d = detail.get(id).copied();
                let dur_beats = d.map(|d| d.dur_beats).filter(|b| *b > 0.0).unwrap_or(next_gap);
                let dur = self
                    .beats
                    .time_at_beat(at + dur_beats)
                    .map(|end| (end - due) / 1000.0)
                    .unwrap_or(0.25)
                    .max(0.03);
                let chord = onset.note_ids.len() > 1;
                let kind = kind_of(d, chord, slid.contains(id));
                out.push((
                    Expected { note_id: *id, t, midi: *midi, dur, chord, bend: d.map(|d| d.bend).unwrap_or(0.0) },
                    k as u32,
                    kind,
                ));
            }
        }
        out
    }

    /// The verifier over an analysis already made of `audio`.
    pub fn verify_analysed(&self, report: &ScheduleReport, audio: &TakeAudio<'_>, analysis: &Analysis) -> VerifierReport {
        let started = std::time::Instant::now();
        let expected = self.expected_notes(report, audio);
        if expected.is_empty() {
            return VerifierReport::status(VerifierStatus::NoAudio);
        }
        let only: Vec<Expected> = expected.iter().map(|e| e.0.clone()).collect();
        let verified = verify(&analysis.evidence, &only, None);
        let mut notes = Vec::with_capacity(expected.len());
        let mut tallies: std::collections::BTreeMap<NoteKind, KindTally> = std::collections::BTreeMap::new();
        for ((e, result, kind), v) in expected.iter().zip(&verified.verdicts) {
            let r = &report.results[*result as usize];
            let t = tallies.entry(*kind).or_insert(KindTally { kind: *kind, due: 0, sounded: 0, not_sounded: 0, wrong: 0, unsure: 0 });
            t.due += 1;
            match v.heard {
                Heard::Yes => t.sounded += 1,
                Heard::No => t.not_sounded += 1,
                Heard::Wrong => t.wrong += 1,
                Heard::Unsure => t.unsure += 1,
            }
            notes.push(VerifiedNote {
                result: *result,
                onset_id: r.id,
                pass: r.pass,
                note_id: e.note_id,
                kind: *kind,
                heard: v.heard,
                how: v.how,
                heard_midi: v.alt_midi,
                deviation_ms: v.t.map(|t| (t - e.t) * 1000.0),
                strength: v.act,
            });
        }
        VerifierReport {
            status: VerifierStatus::Ran,
            kinds: tallies.into_values().collect(),
            notes,
            lag_ms: verified.lag * 1000.0,
            model_ms: 0.0,
            rule_ms: started.elapsed().as_secs_f64() * 1000.0,
            audio_s: analysis.seconds,
        }
    }

    /// The whole second look: the model over the Take's audio, then the rule.
    /// A second or so of work on a 30 s Take: never on the analyzer's loop and
    /// never on audio.
    pub fn verify(&self, report: &ScheduleReport, audio: &TakeAudio<'_>, model: &mut dyn NoteModel) -> VerifierReport {
        if audio.samples.is_empty() || self.pitches.is_empty() {
            return VerifierReport::status(VerifierStatus::NoAudio);
        }
        let started = std::time::Instant::now();
        let analysis = match crate::detect::analyse(model, audio.samples, audio.rate) {
            Ok(a) => a,
            Err(e) => {
                eprintln!("[yames] the note verifier could not run: {e}");
                return VerifierReport::status(VerifierStatus::Failed);
            }
        };
        let model_ms = started.elapsed().as_secs_f64() * 1000.0;
        let mut out = self.verify_analysed(report, audio, &analysis);
        out.model_ms = model_ms;
        out
    }
}

impl ScheduleRun {
    /// The grade the player is shown once the late pass is in. What
    /// `timing.rs` runs on the post-Take thread, in one place so that offline
    /// tools grade exactly as the app does.
    ///
    /// Right notes (`noteIdentity`), when a bar asks for them: the pitch
    /// tracker's verdicts and the verifier's, merged by [`merge_states`].
    /// With the verifier in it the count is no longer the tracker's alone, so
    /// the tracker's give-up rules (too fast, notes ring) stop applying:
    /// `pass.notes.source` says which it was. Without a verifier report this
    /// is `report_with_notes`, unchanged.
    pub fn report_late(
        &self,
        weights: &crate::instrument::ScoreWeights,
        audio: &TakeAudio<'_>,
        verified: Option<&VerifierReport>,
    ) -> Option<ScheduleReport> {
        let ran = verified.filter(|v| v.status == VerifierStatus::Ran);
        let mut report = match (self.wants_notes(), ran) {
            (true, Some(v)) => {
                let timed = self.report(weights)?;
                let merged = self.late_states(&timed, audio, v);
                self.report_with_states(weights, &merged, super::NotesSource::Verifier)
            }
            (true, None) => self.report_with_notes(weights, audio)?,
            (false, _) => self.report(weights)?,
        };
        report.grade.verifier = verified.cloned();
        Some(report)
    }

    /// The right-notes verdict on each result of `timed` that the late grade
    /// counts: the pitch pass and the verifier merged.
    pub fn late_states(&self, timed: &ScheduleReport, audio: &TakeAudio<'_>, verified: &VerifierReport) -> Vec<Option<crate::pitch::NoteState>> {
        let tracker = super::notes::identify(self, timed, audio);
        merge_states(&tracker, &note_states(timed, verified))
    }
}

/// One verdict per note from two witnesses, leaning the player's way
/// (owner decision 4: weak evidence is "couldn't tell", never a wrong note):
///
/// | verifier \ tracker | right | wrong / octave | no pitch / none |
/// |---|---|---|---|
/// | confirmed  | right | right | right |
/// | wrong      | couldn't tell | the tracker's | wrong |
/// | couldn't tell | right | couldn't tell | couldn't tell |
/// | none (a chord, a miss) | the tracker's | the tracker's | the tracker's |
///
/// So a note is RIGHT when either heard it right and nobody heard it wrong,
/// or when the verifier (which reads fast and ringing notes) confirmed it; it
/// is WRONG only when the verifier named another pitch and the tracker did not
/// disagree. "Couldn't tell" is `Unheard`, which the pass rule counts as
/// neither.
pub fn merge_states(
    tracker: &[Option<crate::pitch::NoteState>],
    verifier: &[Option<crate::pitch::NoteState>],
) -> Vec<Option<crate::pitch::NoteState>> {
    use crate::pitch::NoteState::{Octave, Right, Unheard, Wrong};
    tracker
        .iter()
        .zip(verifier)
        .map(|(t, v)| match (v, t) {
            (None, t) => *t,
            (Some(Right), _) => Some(Right),
            (Some(Wrong), Some(Right)) => Some(Unheard),
            (Some(Wrong), Some(Wrong)) => Some(Wrong),
            (Some(Wrong), Some(Octave)) => Some(Octave),
            (Some(Wrong), _) => Some(Wrong),
            (Some(_), Some(Right)) => Some(Right),
            (Some(_), _) => Some(Unheard),
        })
        .collect()
}

/// What the verifier says of each result of `report`, for the right-notes
/// count, in step with `report.results`: `None` where it has nothing to add.
/// Only single notes the matcher heard, like the pitch pass
/// (`notes::identify`), so the two can be laid over each other.
pub fn note_states(report: &ScheduleReport, verified: &VerifierReport) -> Vec<Option<crate::pitch::NoteState>> {
    use crate::pitch::NoteState;
    let mut out = vec![None; report.results.len()];
    if verified.status != VerifierStatus::Ran {
        return out;
    }
    for n in &verified.notes {
        let k = n.result as usize;
        if k >= out.len() || n.kind == NoteKind::ChordTone || report.results[k].state != OnsetState::Hit {
            continue;
        }
        out[k] = match n.heard {
            Heard::Yes => Some(NoteState::Right),
            Heard::Wrong => Some(NoteState::Wrong),
            // "couldn't tell" and "no pitch at an attack the matcher heard"
            // are both unpitched: neither right nor wrong
            Heard::Unsure | Heard::No => Some(NoteState::Unheard),
        };
    }
    out
}

#[cfg(test)]
mod merge_tests {
    use super::merge_states;
    use crate::pitch::NoteState::{self, Octave, Right, Unheard, Wrong};

    fn one(tracker: Option<NoteState>, verifier: Option<NoteState>) -> Option<NoteState> {
        merge_states(&[tracker], &[verifier])[0]
    }

    /// The table on `merge_states`, cell by cell (owner decision 4: weak
    /// evidence is "couldn't tell", never a wrong note).
    #[test]
    fn two_witnesses_lean_the_players_way() {
        for t in [Some(Right), Some(Wrong), Some(Octave), Some(Unheard), None] {
            assert_eq!(one(t, Some(Right)), Some(Right), "confirmed wins over {t:?}");
            assert_eq!(one(t, None), t, "no verifier verdict keeps the tracker's {t:?}");
        }
        assert_eq!(one(Some(Right), Some(Wrong)), Some(Unheard), "they disagree: couldn't tell");
        assert_eq!(one(Some(Wrong), Some(Wrong)), Some(Wrong));
        assert_eq!(one(Some(Octave), Some(Wrong)), Some(Octave));
        assert_eq!(one(Some(Unheard), Some(Wrong)), Some(Wrong));
        assert_eq!(one(None, Some(Wrong)), Some(Wrong));
        assert_eq!(one(Some(Right), Some(Unheard)), Some(Right));
        assert_eq!(one(Some(Wrong), Some(Unheard)), Some(Unheard), "the verifier could not tell: not a wrong note");
        assert_eq!(one(None, Some(Unheard)), Some(Unheard));
    }
}
