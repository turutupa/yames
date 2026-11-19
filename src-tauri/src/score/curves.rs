//! Bends and vibrato, read from the pitch track that already ships
//! (`pitch.rs`) as a curve per note (detection roadmap M5).
//!
//! The right-notes pass reads one pitch per note, so a bend played right reads
//! as a wrong note there (and is "couldn't tell" in the merged count). The
//! same frames say much more when they are read as a line through the note:
//! where it started, how high it went, where it held, where it ended, and
//! whether it wobbled. This module does only that, for the notes the score
//! says are bent or carry vibrato, and gives each a plain verdict with
//! thresholds written below. **Reported, not graded** (`TakeGrade::curves`):
//! no pass bar reads it until the recorded corpus (#85) says the numbers hold
//! on real strings.
//!
//! Runs on the post-Take thread with the rest of the late pass (`timing.rs`,
//! `yames-take-notes`), never on audio. About as costly as the right-notes
//! pass: one pitch track of the Take.

use serde::{Deserialize, Serialize};

use super::notes::TakeAudio;
use super::verify::NoteDetail;
use super::{pass_length, ExpectedOnset, OnsetState, ScheduleReport, ScheduleRun};
use crate::pitch::{PitchConfig, PitchTrack};

/// A bend is on pitch when it holds within this of its target, in cents.
/// M5's acceptance asks for 25.
pub const BEND_TOLERANCE_CENTS: f64 = 25.0;
/// Short of the target by more than [`BEND_TOLERANCE_CENTS`] is flat; over it
/// by more than this is sharp (an over-bend is rarer and less of a fault).
pub const BEND_SHARP_CENTS: f64 = 35.0;
/// A bend or pre-bend has come back down when it ends within this of the
/// fretted pitch.
pub const RELEASED_CENTS: f64 = 50.0;
/// Vibrato is there when the wobble is at least this deep, either way...
pub const VIBRATO_MIN_CENTS: f64 = 12.0;
/// ...and absent when it is under this. Between the two: couldn't tell.
pub const VIBRATO_ABSENT_CENTS: f64 = 8.0;
/// A wobble outside these rates is not vibrato (a slow drift, or noise).
pub const VIBRATO_RATE_HZ: (f64, f64) = (3.0, 10.0);
/// Fewer voiced frames than this in a note (about 115 ms of pitch) and
/// nothing is said of it: a bend read off a handful of frames in a noisy room
/// is a guess (bench, `laptop_noisy`).
const MIN_FRAMES: usize = 10;
/// A release is only judged when the pitch can be followed this far into the
/// note. A released bend dies away quietly, and on a phone the tracker loses
/// it there: that is "couldn't tell", not "it stayed up" (bench, `phone_mic`).
const RELEASE_COVERAGE: f64 = 0.75;
/// Vibrato needs this much of the note after its onset settles, in ms.
const MIN_VIBRATO_SPAN_MS: f64 = 220.0;
/// Frames this soon after the attack, or this close to the next note, are
/// not believed (the pick's transient; the next note's).
const EDGE_MS: f64 = 30.0;

/// How a bend is written.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum BendShape {
    /// Struck at the fret, bent up, held.
    #[default]
    Up,
    /// Bent up, then let back down to the fret within the note.
    Release,
    /// Bent before it is struck, so it sounds at the target, then let down.
    Prebend,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BendVerdict {
    OnPitch,
    Flat,
    Sharp,
    /// Too few frames with a pitch in them: never a fault.
    Unsure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VibratoVerdict {
    Present,
    Absent,
    Unsure,
}

/// One bent or vibrato note, as its frames drew it. Cents are against the
/// fretted pitch (the written note, unbent).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurveNote {
    /// Index into the report's results.
    pub result: u32,
    pub note_id: u32,
    /// Semitones, as written; 0 for a vibrato-only note.
    pub bend_written: f64,
    pub shape: BendShape,
    pub vibrato_written: bool,
    /// Voiced frames read.
    pub frames: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_cents: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub peak_cents: Option<f64>,
    /// Where the bend held: the top of it, or the start of a pre-bend.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hold_cents: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_cents: Option<f64>,
    /// Half the 10-to-90 spread of the wobble, cents.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vibrato_cents: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vibrato_hz: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bend: Option<BendVerdict>,
    /// For a release or a pre-bend: whether it came back to the fret.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub released: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vibrato: Option<VibratoVerdict>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BendTally {
    pub due: u32,
    pub on_pitch: u32,
    pub flat: u32,
    pub sharp: u32,
    pub unsure: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VibratoTally {
    pub due: u32,
    pub present: u32,
    pub absent: u32,
    pub unsure: u32,
}

/// Bends and vibrato of a Take: on the late grade, information only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CurveReport {
    pub bends: BendTally,
    pub vibrato: VibratoTally,
    pub notes: Vec<CurveNote>,
    /// Wall time of the pitch track and the reading.
    pub ms: f64,
}

fn median(v: &mut [f64]) -> Option<f64> {
    if v.is_empty() {
        return None;
    }
    v.sort_by(|a, b| a.total_cmp(b));
    let n = v.len();
    Some(if n % 2 == 1 { v[n / 2] } else { (v[n / 2 - 1] + v[n / 2]) / 2.0 })
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    let i = ((sorted.len() - 1) as f64 * p).round() as usize;
    sorted[i.min(sorted.len() - 1)]
}

/// The frames of `track` between `from_ms` and `to_ms` (window centres), as
/// (ms, cents against `fret_midi`), with octave errors folded back into the
/// range a bend of `bend` semitones can reach.
pub fn frames_between(track: &PitchTrack, fret_midi: f64, bend: f64, from_ms: f64, to_ms: f64) -> Vec<(f64, f64)> {
    let half = track.config.window_ms() / 2.0;
    let lo = -250.0;
    let hi = bend.max(0.0) * 100.0 + 250.0;
    track
        .frames
        .iter()
        .filter(|f| f.voiced && f.midi > 0.0)
        .map(|f| (f.start_ms + half, (f.midi - fret_midi) * 100.0))
        .filter(|(t, _)| *t >= from_ms && *t <= to_ms)
        .filter_map(|(t, mut c)| {
            // a tracker an octave out is still telling the shape
            for _ in 0..2 {
                if c > hi {
                    c -= 1200.0;
                } else if c < lo {
                    c += 1200.0;
                }
            }
            (c >= lo && c <= hi).then_some((t, c))
        })
        .collect()
}

/// Depth (cents, either way) and rate (Hz) of the wobble in `frames`, with a
/// straight line through them taken out first (a bend still rising, a note
/// going flat as it dies).
pub fn wobble(frames: &[(f64, f64)]) -> Option<(f64, f64)> {
    if frames.len() < 8 {
        return None;
    }
    let n = frames.len() as f64;
    let (mt, mc) = frames.iter().fold((0.0, 0.0), |(a, b), (t, c)| (a + t / n, b + c / n));
    let (sxy, sxx) = frames.iter().fold((0.0, 0.0), |(a, b), (t, c)| (a + (t - mt) * (c - mc), b + (t - mt) * (t - mt)));
    let slope = if sxx > 0.0 { sxy / sxx } else { 0.0 };
    let rest: Vec<f64> = frames.iter().map(|(t, c)| c - (mc + slope * (t - mt))).collect();
    let mut sorted = rest.clone();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let depth = (percentile(&sorted, 0.9) - percentile(&sorted, 0.1)) / 2.0;
    // crossings of zero, ignoring wiggles smaller than a third of the depth
    let band = depth / 3.0;
    let mut sign = 0i8;
    let mut crossings = 0u32;
    for r in &rest {
        let s = if *r > band { 1 } else if *r < -band { -1 } else { 0 };
        if s != 0 {
            if sign != 0 && s != sign {
                crossings += 1;
            }
            sign = s;
        }
    }
    let span_s = (frames[frames.len() - 1].0 - frames[0].0) / 1000.0;
    let rate = if span_s > 0.0 { crossings as f64 / 2.0 / span_s } else { 0.0 };
    Some((depth, rate))
}

/// One note's curve. `from_ms`..`to_ms` is the part of the note to believe
/// (after the attack, before the next note).
pub fn read_note(track: &PitchTrack, fret_midi: f64, bend: f64, shape: BendShape, vibrato_written: bool, from_ms: f64, to_ms: f64) -> CurveNote {
    let frames = frames_between(track, fret_midi, bend, from_ms, to_ms);
    let mut out = CurveNote {
        result: 0,
        note_id: 0,
        bend_written: bend,
        shape,
        vibrato_written,
        frames: frames.len() as u32,
        start_cents: None,
        peak_cents: None,
        hold_cents: None,
        end_cents: None,
        vibrato_cents: None,
        vibrato_hz: None,
        bend: (bend > 0.0).then_some(BendVerdict::Unsure),
        released: None,
        vibrato: vibrato_written.then_some(VibratoVerdict::Unsure),
    };
    if frames.len() < MIN_FRAMES {
        return out;
    }
    let cents: Vec<f64> = frames.iter().map(|f| f.1).collect();
    let quarter = (cents.len() / 4).max(2).min(cents.len());
    let start = median(&mut cents[..quarter].to_vec());
    let end = median(&mut cents[cents.len() - quarter..].to_vec());
    let mut sorted = cents.clone();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let peak = percentile(&sorted, 0.9);
    out.start_cents = start;
    out.end_cents = end;
    out.peak_cents = Some(peak);

    if bend > 0.0 {
        let hold = match shape {
            // the second half of the note: where a bend is held (research 5.5)
            BendShape::Up => median(&mut cents[cents.len() / 2..].to_vec()),
            // the top of the bend, whatever its timing: frames near the peak
            BendShape::Release => median(&mut cents.iter().copied().filter(|c| *c >= peak - 35.0).collect::<Vec<_>>()),
            // struck already bent: the start is the bend
            BendShape::Prebend => start,
        };
        out.hold_cents = hold;
        out.bend = hold.map(|h| {
            let target = bend * 100.0;
            if h < target - BEND_TOLERANCE_CENTS {
                BendVerdict::Flat
            } else if h > target + BEND_SHARP_CENTS {
                BendVerdict::Sharp
            } else {
                BendVerdict::OnPitch
            }
        });
        let last = frames[frames.len() - 1].0;
        let covered = to_ms > from_ms && (last - from_ms) / (to_ms - from_ms) >= RELEASE_COVERAGE;
        if shape != BendShape::Up && covered {
            out.released = end.map(|e| e.abs() <= RELEASED_CENTS);
        }
    }

    if vibrato_written {
        // after the onset has settled and, on a bend, once it is up
        let settle = from_ms + (to_ms - from_ms) * 0.25;
        let tail: Vec<(f64, f64)> = frames
            .iter()
            .copied()
            .filter(|(t, c)| *t >= settle && (bend <= 0.0 || shape != BendShape::Up || *c >= bend * 100.0 - 150.0))
            .collect();
        let span = tail.last().map(|l| l.0 - tail[0].0).unwrap_or(0.0);
        if span >= MIN_VIBRATO_SPAN_MS {
            if let Some((depth, rate)) = wobble(&tail) {
                out.vibrato_cents = Some(depth);
                out.vibrato_hz = Some(rate);
                let in_rate = rate >= VIBRATO_RATE_HZ.0 && rate <= VIBRATO_RATE_HZ.1;
                out.vibrato = Some(if depth >= VIBRATO_MIN_CENTS && in_rate {
                    VibratoVerdict::Present
                } else if depth < VIBRATO_ABSENT_CENTS {
                    VibratoVerdict::Absent
                } else {
                    VibratoVerdict::Unsure
                });
            }
        }
    }
    out
}

impl NoteDetail {
    fn shape(&self) -> BendShape {
        self.bend_shape.unwrap_or_default()
    }

    fn has(&self, t: &str) -> bool {
        self.tech.iter().any(|x| x == t)
    }

    fn is_curved(&self) -> bool {
        self.bend > 0.0 || self.has("vibrato")
    }
}

impl ScheduleRun {
    /// Whether the Take has a bent or vibrato note to read.
    pub fn wants_curves(&self) -> bool {
        !self.pitches.is_empty() && self.details.iter().any(|d| d.is_curved())
    }

    /// Every bent or vibrato single note of `report` the matcher heard, read
    /// from `audio`'s pitch track. `None` when there is none to read.
    pub fn curves(&self, report: &ScheduleReport, audio: &TakeAudio<'_>) -> Option<CurveReport> {
        if !self.wants_curves() || audio.samples.is_empty() || audio.rate == 0 {
            return None;
        }
        let started = std::time::Instant::now();
        let detail: std::collections::HashMap<u32, &NoteDetail> = self.details.iter().map(|d| (d.id, d)).collect();
        let pitch: std::collections::HashMap<u32, f64> = self.pitches.iter().map(|n| (n.id, n.midi)).collect();
        let by_id: std::collections::HashMap<u32, &ExpectedOnset> = self.schedule.onsets.iter().map(|o| (o.id, o)).collect();
        let length = pass_length(&self.schedule);
        let looks = super::notes::lookups(self, report, audio);
        // every attack, to stop a note's frames at the next one
        let mut attacks: Vec<f64> = looks.iter().map(|l| l.attack_ms).collect();
        attacks.sort_by(|a, b| a.total_cmp(b));
        let mut wanted = Vec::new();
        for look in &looks {
            if look.onset.note_ids.len() != 1 || report.results[look.result].state != OnsetState::Hit {
                continue;
            }
            let id = look.onset.note_ids[0];
            let (Some(d), Some(midi)) = (detail.get(&id), pitch.get(&id)) else { continue };
            if !d.is_curved() {
                continue;
            }
            let r = &report.results[look.result];
            let at = r.pass as f64 * length + by_id.get(&r.id).map(|o| o.beat).unwrap_or(0.0);
            let dur_ms = (d.dur_beats > 0.0)
                .then(|| self.beats.time_at_beat(at + d.dur_beats).zip(self.beats.time_at_beat(at)).map(|(e, s)| e - s))
                .flatten()
                .unwrap_or(500.0);
            let next = attacks.iter().copied().find(|a| *a > look.attack_ms + 1.0).unwrap_or(f64::INFINITY);
            let to = (look.attack_ms + dur_ms).min(next) - EDGE_MS;
            wanted.push((look.result, id, *midi, *d, look.attack_ms + EDGE_MS, to));
        }
        if wanted.is_empty() {
            return None;
        }
        let lowest = self.pitches.iter().map(|n| n.midi.round() as i32).min().unwrap_or(40);
        let cfg = PitchConfig::for_tuning(&[lowest.min(40)]);
        let track = crate::pitch::track(audio.samples, audio.rate, &cfg);
        let mut out = CurveReport::default();
        for (result, id, midi, d, from, to) in wanted {
            if to <= from {
                continue;
            }
            let mut note = read_note(&track, midi, d.bend.max(0.0), d.shape(), d.has("vibrato"), from, to);
            note.result = result as u32;
            note.note_id = id;
            if let Some(v) = note.bend {
                out.bends.due += 1;
                match v {
                    BendVerdict::OnPitch => out.bends.on_pitch += 1,
                    BendVerdict::Flat => out.bends.flat += 1,
                    BendVerdict::Sharp => out.bends.sharp += 1,
                    BendVerdict::Unsure => out.bends.unsure += 1,
                }
            }
            if let Some(v) = note.vibrato {
                out.vibrato.due += 1;
                match v {
                    VibratoVerdict::Present => out.vibrato.present += 1,
                    VibratoVerdict::Absent => out.vibrato.absent += 1,
                    VibratoVerdict::Unsure => out.vibrato.unsure += 1,
                }
            }
            out.notes.push(note);
        }
        out.ms = started.elapsed().as_secs_f64() * 1000.0;
        Some(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pitch::PitchFrame;

    /// A track drawn by hand: one frame every 11.6 ms, the pitch `f(ms)`.
    fn drawn(ms: f64, f: impl Fn(f64) -> f64) -> PitchTrack {
        let cfg = PitchConfig::guitar();
        let hop = cfg.hop_ms();
        let half = cfg.window_ms() / 2.0;
        let frames = (0..(ms / hop) as usize)
            .map(|i| {
                let t = i as f64 * hop + half;
                let midi = f(t);
                PitchFrame { start_ms: t - half, midi, hz: 440.0 * 2f64.powf((midi - 69.0) / 12.0), confidence: 0.9, rms: 0.1, voiced: true }
            })
            .collect();
        PitchTrack { frames, config: cfg, length_ms: ms }
    }

    fn rise(t: f64, at: f64, over: f64) -> f64 {
        ((t - at) / over).clamp(0.0, 1.0)
    }

    #[test]
    fn a_whole_tone_bend_reads_its_amount_and_a_short_one_reads_flat() {
        let good = drawn(800.0, |t| 64.0 + 2.0 * rise(t, 50.0, 150.0));
        let n = read_note(&good, 64.0, 2.0, BendShape::Up, false, 30.0, 770.0);
        assert_eq!(n.bend, Some(BendVerdict::OnPitch), "{n:?}");
        assert!((n.hold_cents.unwrap() - 200.0).abs() < 2.0);
        let flat = drawn(800.0, |t| 64.0 + 1.5 * rise(t, 50.0, 150.0));
        assert_eq!(read_note(&flat, 64.0, 2.0, BendShape::Up, false, 30.0, 770.0).bend, Some(BendVerdict::Flat));
        let sharp = drawn(800.0, |t| 64.0 + 2.5 * rise(t, 50.0, 150.0));
        assert_eq!(read_note(&sharp, 64.0, 2.0, BendShape::Up, false, 30.0, 770.0).bend, Some(BendVerdict::Sharp));
    }

    #[test]
    fn an_octave_error_still_reads_the_bend() {
        let track = drawn(800.0, |t| 64.0 + 12.0 + 2.0 * rise(t, 50.0, 150.0));
        let n = read_note(&track, 64.0, 2.0, BendShape::Up, false, 30.0, 770.0);
        assert_eq!(n.bend, Some(BendVerdict::OnPitch), "{n:?}");
    }

    #[test]
    fn a_release_is_read_at_its_top_and_comes_back_down() {
        let track = drawn(900.0, |t| 64.0 + 2.0 * (rise(t, 50.0, 120.0) - rise(t, 450.0, 120.0)));
        let n = read_note(&track, 64.0, 2.0, BendShape::Release, false, 30.0, 870.0);
        assert_eq!(n.bend, Some(BendVerdict::OnPitch), "{n:?}");
        assert_eq!(n.released, Some(true));
        let held = drawn(900.0, |t| 64.0 + 2.0 * rise(t, 50.0, 120.0));
        assert_eq!(read_note(&held, 64.0, 2.0, BendShape::Release, false, 30.0, 870.0).released, Some(false));
    }

    /// The pitch lost halfway (a quiet tail on a phone): couldn't tell.
    #[test]
    fn a_release_that_cannot_be_followed_is_not_called_held() {
        let mut track = drawn(900.0, |t| 64.0 + 2.0 * (rise(t, 50.0, 120.0) - rise(t, 450.0, 120.0)));
        for f in track.frames.iter_mut().filter(|f| f.start_ms > 400.0) {
            f.voiced = false;
        }
        let n = read_note(&track, 64.0, 2.0, BendShape::Release, false, 30.0, 870.0);
        assert_eq!(n.bend, Some(BendVerdict::OnPitch));
        assert_eq!(n.released, None, "{n:?}");
    }

    #[test]
    fn a_prebend_starts_at_the_target() {
        let track = drawn(900.0, |t| 66.0 - 2.0 * rise(t, 400.0, 150.0));
        let n = read_note(&track, 64.0, 2.0, BendShape::Prebend, false, 30.0, 870.0);
        assert_eq!(n.bend, Some(BendVerdict::OnPitch), "{n:?}");
        assert_eq!(n.released, Some(true));
    }

    #[test]
    fn vibrato_is_told_from_a_still_note() {
        let wobbling = drawn(1000.0, |t| 64.0 + 0.3 * (2.0 * std::f64::consts::PI * 5.5 * t / 1000.0).sin());
        let n = read_note(&wobbling, 64.0, 0.0, BendShape::Up, true, 30.0, 970.0);
        assert_eq!(n.vibrato, Some(VibratoVerdict::Present), "{n:?}");
        assert!((n.vibrato_hz.unwrap() - 5.5).abs() < 1.0, "{n:?}");
        assert!(n.vibrato_cents.unwrap() > 20.0);
        assert_eq!(n.bend, None);
        // a still note that sags as it dies is not vibrato
        let still = drawn(1000.0, |t| 64.0 - 0.1 * t / 1000.0);
        assert_eq!(read_note(&still, 64.0, 0.0, BendShape::Up, true, 30.0, 970.0).vibrato, Some(VibratoVerdict::Absent));
    }

    #[test]
    fn too_little_to_read_is_unsure_never_a_fault() {
        let track = drawn(60.0, |_| 64.0);
        let n = read_note(&track, 64.0, 2.0, BendShape::Up, true, 30.0, 50.0);
        assert_eq!(n.bend, Some(BendVerdict::Unsure));
        assert_eq!(n.vibrato, Some(VibratoVerdict::Unsure));
    }
}
