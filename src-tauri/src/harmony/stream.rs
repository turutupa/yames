//! The note model over a live input: audio in at the device's rate, notes
//! out, about a second behind (report 3.5, "Capture").
//!
//! `detect::model::posteriors` reads a finished recording window by window,
//! 141 new frames (1.6 s) a window. Live, that is too long to wait, so here
//! a window is run every [`HOP_FRAMES`] frames (0.55 s) and only its newest
//! frames are kept: three windows where the Take's pass runs one, which is
//! the price of hearing a chord while it still sounds. Frame `k` is still at
//! sample `k * 256` of the 22,050 Hz audio, so times are exact.
//!
//! The bench feeds a whole recording through this same code (`run_all`), so
//! what it measures is what the worker runs.
//!
//! Tier: the free-play worker and offline tools. Never a real-time thread.

use super::notes::{NoteDecoder, NoteEvent};
use super::Engine;
use crate::detect::model::{NoteModel, FRAME_HOP, MODEL_RATE, PITCHES, WINDOW_FRAMES, WINDOW_SAMPLES};

/// New frames per window: 0.546 s.
pub const HOP_FRAMES: usize = 47;
/// Frames at the window's right edge that are not read (`model.rs` drops 15
/// at each edge: there the model has half a view).
const EDGE_FRAMES: usize = 15;
/// The first frame of a window that is kept.
const FIRST_KEPT: usize = WINDOW_FRAMES - EDGE_FRAMES - HOP_FRAMES;

pub struct Stream {
    rate: u32,
    /// Input not yet behind every window to come; `raw[0]` is input sample
    /// `raw_origin`.
    raw: Vec<f32>,
    raw_origin: usize,
    received: usize,
    windows: usize,
    window: Vec<f32>,
    decoder: NoteDecoder,
    events: Vec<NoteEvent>,
}

impl Stream {
    pub fn new(rate: u32) -> Self {
        Self {
            rate: rate.max(8000),
            raw: Vec::new(),
            raw_origin: 0,
            received: 0,
            windows: 0,
            window: vec![0.0; WINDOW_SAMPLES],
            decoder: NoteDecoder::new(),
            events: Vec::new(),
        }
    }

    pub fn push(&mut self, samples: &[f32]) {
        self.raw.extend_from_slice(samples);
        self.received += samples.len();
    }

    /// Where window `w` starts, in samples at the model's rate (negative for
    /// the first windows: silence before the input began).
    fn start_of(w: usize) -> i64 {
        (w * HOP_FRAMES * FRAME_HOP) as i64 - (FIRST_KEPT * FRAME_HOP) as i64
    }

    fn to_raw(&self, model_sample: i64) -> i64 {
        (model_sample as f64 * self.rate as f64 / MODEL_RATE as f64).floor() as i64
    }

    /// Whether the input has reached the end of the next window.
    pub fn ready(&self) -> bool {
        self.to_raw(Self::start_of(self.windows) + WINDOW_SAMPLES as i64) + 2 <= self.received as i64
    }

    /// Seconds of input the engine has been told about.
    pub fn watermark(&self) -> f64 {
        self.decoder.watermark()
    }

    /// Run the next window, if the input has reached its end, and hand its
    /// notes to `engine`. `Ok(false)` when there was nothing to run.
    pub fn step(&mut self, model: &mut dyn NoteModel, engine: &mut Engine) -> Result<bool, String> {
        if !self.ready() {
            return Ok(false);
        }
        let start = Self::start_of(self.windows);
        let (a, b) = (self.to_raw(start), self.to_raw(start + WINDOW_SAMPLES as i64) + 2);
        let from = (a.max(0) as usize).saturating_sub(self.raw_origin).min(self.raw.len());
        let to = (b.max(0) as usize).saturating_sub(self.raw_origin).min(self.raw.len());
        let resampled = crate::pitch::to_analysis_rate(&self.raw[from..to], self.rate);
        // silence before the input began
        let lead = if start < 0 { ((-start) as usize).min(WINDOW_SAMPLES) } else { 0 };
        self.window.iter_mut().for_each(|v| *v = 0.0);
        for (slot, v) in self.window[lead..].iter_mut().zip(resampled.iter()) {
            *slot = *v as f32;
        }
        let out = model.infer(&self.window)?;
        if out.note.len() != WINDOW_FRAMES * PITCHES || out.onset.len() != WINDOW_FRAMES * PITCHES {
            return Err(format!("the note model answered with {} values, not {}", out.note.len(), WINDOW_FRAMES * PITCHES));
        }
        self.events.clear();
        for j in FIRST_KEPT..FIRST_KEPT + HOP_FRAMES {
            let row = j * PITCHES..(j + 1) * PITCHES;
            self.decoder.push_frame(&out.note[row.clone()], &out.onset[row], &mut self.events);
        }
        for e in &self.events {
            match *e {
                NoteEvent::Onset { t, midi } => engine.onset(t, midi),
                NoteEvent::Sustain { midi, note_start, t0, t1 } => engine.sustain(midi, note_start, t0, t1),
            }
        }
        engine.tick(self.decoder.watermark());
        self.windows += 1;
        // what no later window reads
        let keep_from = self.to_raw(Self::start_of(self.windows)).max(0) as usize;
        if keep_from > self.raw_origin {
            let drop = (keep_from - self.raw_origin).min(self.raw.len());
            self.raw.drain(..drop);
            self.raw_origin += drop;
        }
        Ok(true)
    }

    /// The notes the last [`step`](Self::step) decoded.
    pub fn last_events(&self) -> &[NoteEvent] {
        &self.events
    }
}

/// A whole recording through the live path, in the blocks an input callback
/// would deliver. `each` is called after every window with the engine.
pub fn run_all(model: &mut dyn NoteModel, samples: &[f32], rate: u32, engine: &mut Engine, mut each: impl FnMut(&Stream, &mut Engine)) -> Result<(), String> {
    let mut stream = Stream::new(rate);
    for block in samples.chunks(4800) {
        stream.push(block);
        while stream.step(model, engine)? {
            each(&stream, engine);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::detect::model::WindowOut;

    /// A model that answers "A3 sounds" wherever the window's audio is loud,
    /// with an onset where it gets loud.
    struct Loud;
    impl NoteModel for Loud {
        fn infer(&mut self, window: &[f32]) -> Result<WindowOut, String> {
            let mut note = vec![0.0; WINDOW_FRAMES * PITCHES];
            let mut onset = vec![0.0; WINDOW_FRAMES * PITCHES];
            let loud = |f: usize| window[(f * FRAME_HOP).min(WINDOW_SAMPLES - 1)..((f + 1) * FRAME_HOP).min(WINDOW_SAMPLES)].iter().any(|v| v.abs() > 0.5);
            for f in 0..WINDOW_FRAMES {
                if loud(f) {
                    note[f * PITCHES + 36] = 0.9;
                    if f > 0 && !loud(f - 1) {
                        onset[f * PITCHES + 36] = 0.9;
                    }
                }
            }
            Ok(WindowOut { note, onset })
        }
        fn runtime(&self) -> &'static str {
            "test"
        }
    }

    #[test]
    fn a_note_in_the_input_comes_out_at_its_time_whatever_the_device_rate() {
        for rate in [22_050u32, 44_100, 48_000] {
            // a tone from 1.0 s to 1.5 s
            let mut x = vec![0.0f32; rate as usize * 4];
            for (i, v) in x[rate as usize..rate as usize * 3 / 2].iter_mut().enumerate() {
                *v = (i as f32 * 2.0 * std::f32::consts::PI * 440.0 / rate as f32).sin();
            }
            let mut engine = Engine::new(None);
            let mut onsets = Vec::new();
            run_all(&mut Loud, &x, rate, &mut engine, |s, _| {
                onsets.extend(s.last_events().iter().filter_map(|e| if let NoteEvent::Onset { t, midi } = e { Some((*t, *midi)) } else { None }));
            })
            .unwrap();
            assert_eq!(onsets.len(), 1, "at {rate}: {onsets:?}");
            assert_eq!(onsets[0].1, 57);
            assert!((onsets[0].0 - 1.0).abs() < 0.03, "at {rate}: {onsets:?}");
        }
    }

    #[test]
    fn the_stream_keeps_under_three_seconds_of_input() {
        let mut s = Stream::new(48_000);
        let mut engine = Engine::new(None);
        for _ in 0..200 {
            s.push(&[0.0; 4800]);
            while s.step(&mut Loud, &mut engine).unwrap() {}
            assert!(s.raw.len() < 48_000 * 3, "{} samples held", s.raw.len());
        }
        assert!(s.watermark() > 18.0);
    }
}
