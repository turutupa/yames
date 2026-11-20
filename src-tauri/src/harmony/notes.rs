//! Notes from the note model's posteriors, one frame at a time.
//!
//! The verifier (`detect/verifier.rs`) asks the model "did this pitch start
//! near here?". Free play has no score to ask about, so this file does the
//! harder thing and decodes notes: a peak of the onset posterior starts one,
//! the note posterior says how long it lasts. It is Basic Pitch's own
//! decoding rule made causal (a note is announced once it has lasted
//! [`MIN_FRAMES`]), without its second pass for notes that have no onset.
//!
//! Tier: the free-play worker and offline tools. Never a real-time thread.

use crate::detect::model::{Posteriors, MIDI_LOW, PITCHES};

/// A peak of the onset posterior at least this high starts a note.
pub const ONSET_T: f32 = 0.5;
/// The note lasts while the note posterior stays above this ...
pub const FRAME_T: f32 = 0.3;
/// ... allowing this many frames under it.
const GAP_FRAMES: usize = 11;
/// A note is real once it has sounded this many frames (about 80 ms).
pub const MIN_FRAMES: usize = 7;
/// Sustain is handed over in runs of this many frames.
const FLUSH_FRAMES: usize = 8;
/// Open E on a bass to the top of a 24-fret guitar and a little more.
const LOW_MIDI: i32 = 28;
const HIGH_MIDI: i32 = 91;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NoteEvent {
    /// A note started at `t` seconds.
    Onset { t: f64, midi: i32 },
    /// The note that started at `note_start` sounded from `t0` to `t1`.
    Sustain { midi: i32, note_start: f64, t0: f64, t1: f64 },
}

#[derive(Debug, Clone, Copy)]
struct Active {
    start: usize,
    /// The last frame the note posterior was above the threshold.
    last_on: usize,
    /// Frames above the threshold so far.
    on: usize,
    confirmed: bool,
    /// Sustain has been handed over up to this frame.
    flushed: usize,
}

pub struct NoteDecoder {
    frame: usize,
    /// The onset posterior of the last two frames.
    prev: [[f32; PITCHES]; 2],
    active: [Option<Active>; PITCHES],
}

impl Default for NoteDecoder {
    fn default() -> Self {
        Self::new()
    }
}

fn secs(frame: usize) -> f64 {
    frame as f64 * Posteriors::frame_seconds()
}

impl NoteDecoder {
    pub fn new() -> Self {
        Self { frame: 0, prev: [[0.0; PITCHES]; 2], active: [None; PITCHES] }
    }

    /// Every event before this time has been handed over.
    pub fn watermark(&self) -> f64 {
        secs(self.frame.saturating_sub(MIN_FRAMES + FLUSH_FRAMES + 2))
    }

    /// One frame of the model's two posteriors ([`PITCHES`] values each).
    pub fn push_frame(&mut self, note: &[f32], onset: &[f32], out: &mut Vec<NoteEvent>) {
        let f = self.frame;
        for p in 0..PITCHES {
            let midi = MIDI_LOW + p as i32;
            if !(LOW_MIDI..=HIGH_MIDI).contains(&midi) {
                continue;
            }
            // a peak at frame f - 1
            let (before, here, after) = (self.prev[0][p], self.prev[1][p], onset[p]);
            if f >= 1 && here >= ONSET_T && here > before && here >= after {
                if let Some(a) = self.active[p].take() {
                    Self::end(a, midi, f - 1, out);
                }
                self.active[p] = Some(Active { start: f - 1, last_on: f - 1, on: 1, confirmed: false, flushed: f - 1 });
            }
            let Some(a) = self.active[p].as_mut() else { continue };
            if note[p] >= FRAME_T {
                a.last_on = f;
                a.on += 1;
            } else if f - a.last_on > GAP_FRAMES {
                let a = self.active[p].take().unwrap();
                Self::end(a, midi, a.last_on + 1, out);
                continue;
            }
            if !a.confirmed && a.on >= MIN_FRAMES {
                a.confirmed = true;
                out.push(NoteEvent::Onset { t: secs(a.start), midi });
            }
            if a.confirmed && a.last_on + 1 >= a.flushed + FLUSH_FRAMES {
                out.push(NoteEvent::Sustain { midi, note_start: secs(a.start), t0: secs(a.flushed), t1: secs(a.last_on + 1) });
                a.flushed = a.last_on + 1;
            }
        }
        self.prev[0] = self.prev[1];
        self.prev[1].copy_from_slice(&onset[..PITCHES]);
        self.frame += 1;
    }

    fn end(a: Active, midi: i32, at: usize, out: &mut Vec<NoteEvent>) {
        let end = at.min(a.last_on + 1);
        if a.confirmed && end > a.flushed {
            out.push(NoteEvent::Sustain { midi, note_start: secs(a.start), t0: secs(a.flushed), t1: secs(end) });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(frames: usize, fill: impl Fn(usize, &mut [f32; PITCHES], &mut [f32; PITCHES])) -> Vec<NoteEvent> {
        let mut d = NoteDecoder::new();
        let mut out = Vec::new();
        for f in 0..frames {
            let (mut note, mut onset) = ([0.0; PITCHES], [0.0; PITCHES]);
            fill(f, &mut note, &mut onset);
            d.push_frame(&note, &onset, &mut out);
        }
        out
    }

    const A3: usize = (57 - MIDI_LOW) as usize;

    #[test]
    fn a_note_is_an_onset_and_its_sustain_adds_up_to_its_length() {
        let events = run(120, |f, note, onset| {
            if f == 20 {
                onset[A3] = 0.9;
            }
            if (20..60).contains(&f) {
                note[A3] = 0.8;
            }
        });
        let onsets: Vec<_> = events.iter().filter(|e| matches!(e, NoteEvent::Onset { .. })).collect();
        assert_eq!(onsets, vec![&NoteEvent::Onset { t: secs(20), midi: 57 }]);
        let sounded: f64 = events.iter().map(|e| if let NoteEvent::Sustain { t0, t1, .. } = e { t1 - t0 } else { 0.0 }).sum();
        assert!((sounded - secs(40)).abs() < 1e-9, "{sounded}");
    }

    #[test]
    fn a_blip_is_not_a_note_and_a_second_attack_is_a_second_note() {
        let blip = run(60, |f, note, onset| {
            if f == 10 {
                onset[A3] = 0.9;
            }
            if (10..13).contains(&f) {
                note[A3] = 0.8;
            }
        });
        assert!(blip.is_empty(), "{blip:?}");
        let twice = run(120, |f, note, onset| {
            if f == 10 || f == 40 {
                onset[A3] = 0.9;
            }
            if (10..80).contains(&f) {
                note[A3] = 0.8;
            }
        });
        assert_eq!(twice.iter().filter(|e| matches!(e, NoteEvent::Onset { .. })).count(), 2);
    }

    #[test]
    fn everything_before_the_watermark_was_handed_over() {
        let mut d = NoteDecoder::new();
        let mut out = Vec::new();
        for f in 0..200usize {
            let (mut note, mut onset) = ([0.0; PITCHES], [0.0; PITCHES]);
            if f % 37 == 5 {
                onset[A3] = 0.9;
            }
            if f % 37 >= 5 && f % 37 < 30 {
                note[A3] = 0.8;
            }
            let before = out.len();
            d.push_frame(&note, &onset, &mut out);
            let mark = secs(f.saturating_sub(MIN_FRAMES + FLUSH_FRAMES + 2));
            for e in &out[before..] {
                let t = match e {
                    NoteEvent::Onset { t, .. } => *t,
                    NoteEvent::Sustain { t0, .. } => *t0,
                };
                assert!(t >= mark, "an event at {t} came after the watermark passed {mark}");
            }
        }
    }
}
