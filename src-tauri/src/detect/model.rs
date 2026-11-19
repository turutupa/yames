//! The note model behind the verifier: Basic Pitch (Spotify, Apache-2.0,
//! 16,782 parameters), run over a whole Take after it closes.
//!
//! **Tier.** Mid-session report (AGENTS.md "latency tiers"): never on an audio
//! callback, never on the onset detector's thread, never on the analyzer's
//! 5 ms loop. The callers are the post-Take thread (`timing.rs`,
//! `yames-take-notes`, below normal priority) and offline tools.
//!
//! **The runtime sits behind [`NoteModel`]**, so nothing outside this file
//! names it. `detect-ort` builds ONNX Runtime through the `ort` crate. A build
//! without it has no model: [`load`] says so and every caller degrades to
//! "not run" (`VerifierStatus::NoModel`), which is what a plain
//! `cargo test` and the default desktop build get.
//!
//! **Time axis.** The model sees 43,844 samples and answers with 172 frames
//! 256 samples apart, which is 171.27 hops: stitched naively, windows slip
//! about 10 ms each (research report 3.4, "Trap"). Here windows advance by
//! exactly 141 frames (36,096 samples) and the middle 141 frames of each are
//! kept, so frame `k` of [`Posteriors`] is at sample `k * 256`, exactly, for
//! any length of audio.

/// The rate the model was trained at.
pub const MODEL_RATE: u32 = 22_050;
/// Samples the model takes at a time.
pub const WINDOW_SAMPLES: usize = 43_844;
/// Frames it answers with.
pub const WINDOW_FRAMES: usize = 172;
/// Samples between frames.
pub const FRAME_HOP: usize = 256;
/// Pitches per frame, from [`MIDI_LOW`] up.
pub const PITCHES: usize = 88;
/// The pitch of column 0.
pub const MIDI_LOW: i32 = 21;
/// Frames dropped at each edge of a window, where the model has half a view.
const EDGE_FRAMES: usize = 15;
/// Frames kept per window, and so the window hop in frames.
const KEPT_FRAMES: usize = 141;

/// The ONNX file, compiled in: 225 KiB, so no platform has a file to bundle.
/// `models/basic-pitch/README.md` has its source, licence and hash.
pub static MODEL_BYTES: &[u8] = include_bytes!("../../models/basic-pitch/nmp.onnx");

/// One window's answer: `WINDOW_FRAMES x PITCHES`, row-major, 0..1.
pub struct WindowOut {
    pub note: Vec<f32>,
    pub onset: Vec<f32>,
}

/// Anything that can run the model on one window.
pub trait NoteModel: Send {
    /// `window` is exactly [`WINDOW_SAMPLES`] long.
    fn infer(&mut self, window: &[f32]) -> Result<WindowOut, String>;
    /// What is behind it, for a report line.
    fn runtime(&self) -> &'static str;
}

/// The model's two posteriors over a whole recording, on a uniform grid:
/// frame `k` is at sample `k * FRAME_HOP` of the audio it was given.
#[derive(Debug, Clone)]
pub struct Posteriors {
    pub frames: usize,
    /// "this pitch is sounding", `frames x PITCHES`.
    pub note: Vec<f32>,
    /// "this pitch just started", `frames x PITCHES`.
    pub onset: Vec<f32>,
}

impl Posteriors {
    pub fn frame_seconds() -> f64 {
        FRAME_HOP as f64 / MODEL_RATE as f64
    }
}

/// Run `model` over `audio` (mono, at [`MODEL_RATE`]).
pub fn posteriors(model: &mut dyn NoteModel, audio: &[f32]) -> Result<Posteriors, String> {
    let frames = audio.len() / FRAME_HOP + 1;
    let mut note = vec![0.0f32; frames * PITCHES];
    let mut onset = vec![0.0f32; frames * PITCHES];
    let lead = EDGE_FRAMES * FRAME_HOP;
    let hop = KEPT_FRAMES * FRAME_HOP;
    let mut window = vec![0.0f32; WINDOW_SAMPLES];
    let mut w = 0usize;
    while w * KEPT_FRAMES < frames {
        // window `w` starts `lead` samples before sample `w * hop`
        let start = (w * hop) as isize - lead as isize;
        for (i, slot) in window.iter_mut().enumerate() {
            let j = start + i as isize;
            *slot = if j >= 0 && (j as usize) < audio.len() { audio[j as usize] } else { 0.0 };
        }
        let out = model.infer(&window)?;
        if out.note.len() != WINDOW_FRAMES * PITCHES || out.onset.len() != WINDOW_FRAMES * PITCHES {
            return Err(format!("the note model answered with {} values, not {}", out.note.len(), WINDOW_FRAMES * PITCHES));
        }
        for j in 0..KEPT_FRAMES {
            let k = w * KEPT_FRAMES + j;
            if k >= frames {
                break;
            }
            let src = (j + EDGE_FRAMES) * PITCHES;
            note[k * PITCHES..(k + 1) * PITCHES].copy_from_slice(&out.note[src..src + PITCHES]);
            onset[k * PITCHES..(k + 1) * PITCHES].copy_from_slice(&out.onset[src..src + PITCHES]);
        }
        w += 1;
    }
    Ok(Posteriors { frames, note, onset })
}

/// Whether this build can run the model at all.
pub const fn compiled() -> bool {
    cfg!(feature = "detect-ort")
}

/// The model on the runtime this build has. One or two threads at most: it
/// runs beside a metronome (AGENTS.md, the audio-safety gate).
#[cfg(feature = "detect-ort")]
pub fn load() -> Result<Box<dyn NoteModel>, String> {
    ort_backend::OrtModel::new().map(|m| Box::new(m) as Box<dyn NoteModel>)
}

#[cfg(not(feature = "detect-ort"))]
pub fn load() -> Result<Box<dyn NoteModel>, String> {
    Err("this build has no note model (feature `detect-ort` is off)".into())
}

/// The app's one loaded model, made on first use and kept. `f` gets `None`
/// when this build has no model, when the player's environment turned the
/// verifier off (`YAMES_VERIFIER=0`), or when loading failed (said once on
/// stderr). Inference holds the lock, so callers queue: the post-Take pass is
/// the only one, and it is one Take at a time.
pub fn with_shared<R>(f: impl FnOnce(Option<&mut Box<dyn NoteModel>>) -> R) -> R {
    static SHARED: std::sync::Mutex<Option<Option<Box<dyn NoteModel>>>> = std::sync::Mutex::new(None);
    let mut slot = SHARED.lock().unwrap_or_else(|e| e.into_inner());
    let model = slot.get_or_insert_with(|| {
        if !enabled() {
            return None;
        }
        match load() {
            Ok(m) => Some(m),
            Err(e) => {
                eprintln!("[yames] the note model did not load, so notes are not verified: {e}");
                None
            }
        }
    });
    f(model.as_mut())
}

/// Whether the verifier should run at all in this process: compiled in, and
/// not turned off with `YAMES_VERIFIER=0` (a troubleshooting switch).
pub fn enabled() -> bool {
    compiled() && std::env::var("YAMES_VERIFIER").map(|v| v != "0").unwrap_or(true)
}

#[cfg(feature = "detect-ort")]
mod ort_backend {
    use super::{NoteModel, WindowOut, MODEL_BYTES, WINDOW_SAMPLES};
    use ort::session::Session;
    use ort::value::Tensor;

    // Basic Pitch's own names (`basic_pitch/inference.py`).
    const OUT_NOTE: &str = "StatefulPartitionedCall:1";
    const OUT_ONSET: &str = "StatefulPartitionedCall:2";

    pub struct OrtModel {
        session: Session,
    }

    impl OrtModel {
        pub fn new() -> Result<Self, String> {
            let env = ort::init().with_name("yames-detect").build().map_err(|e| e.to_string())?;
            // One intra-op thread: the pass is short (a 30 s Take in well
            // under a second on a desktop) and ONNX Runtime's pool spins when
            // it has more, which is the kind of load the jitter probe exists
            // to catch.
            let session = Session::builder(&env)
                .map_err(|e| e.to_string())?
                .with_intra_threads(1)
                .map_err(|e| e.to_string())?
                .with_inter_threads(1)
                .map_err(|e| e.to_string())?
                .commit_from_memory(MODEL_BYTES)
                .map_err(|e| e.to_string())?;
            Ok(Self { session })
        }
    }

    impl NoteModel for OrtModel {
        fn infer(&mut self, window: &[f32]) -> Result<WindowOut, String> {
            let input = Tensor::from_array(([1usize, WINDOW_SAMPLES, 1], window.to_vec())).map_err(|e| e.to_string())?;
            let out = self.session.run(ort::inputs![input]).map_err(|e| e.to_string())?;
            let take = |name: &str| -> Result<Vec<f32>, String> {
                let (_, data) = out[name].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
                Ok(data.to_vec())
            };
            Ok(WindowOut { note: take(OUT_NOTE)?, onset: take(OUT_ONSET)? })
        }

        fn runtime(&self) -> &'static str {
            "onnxruntime (ort)"
        }
    }
}

#[cfg(test)]
pub(crate) mod testing {
    use super::*;

    /// A stand-in model: every window answers with the window's index in the
    /// note output's first column and the frame's own index in the second, so
    /// the stitching can be read back.
    pub struct Counting(pub usize);

    impl NoteModel for Counting {
        fn infer(&mut self, _window: &[f32]) -> Result<WindowOut, String> {
            let mut note = vec![0.0; WINDOW_FRAMES * PITCHES];
            for j in 0..WINDOW_FRAMES {
                note[j * PITCHES] = self.0 as f32;
                note[j * PITCHES + 1] = j as f32;
            }
            self.0 += 1;
            Ok(WindowOut { note: note.clone(), onset: note })
        }
        fn runtime(&self) -> &'static str {
            "test"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_are_stitched_on_an_exact_grid() {
        // 5 s: more than two windows' worth of kept frames
        let audio = vec![0.0f32; MODEL_RATE as usize * 5];
        let mut model = testing::Counting(0);
        let p = posteriors(&mut model, &audio).unwrap();
        assert_eq!(p.frames, audio.len() / FRAME_HOP + 1);
        for k in 0..p.frames {
            let (window, frame) = (p.note[k * PITCHES] as usize, p.note[k * PITCHES + 1] as usize);
            assert_eq!(window, k / KEPT_FRAMES, "frame {k} came from the wrong window");
            // frame `j` of window `w` sits at sample `w*hop - lead + j*256`,
            // so global frame k is window frame `k - w*141 + 15`
            assert_eq!(frame, k - window * KEPT_FRAMES + EDGE_FRAMES);
        }
        assert_eq!(model.0, p.frames.div_ceil(KEPT_FRAMES));
    }

    #[test]
    fn the_model_file_is_the_one_the_readme_names() {
        assert_eq!(MODEL_BYTES.len(), 230_444);
    }

    #[cfg(feature = "detect-ort")]
    #[test]
    fn the_real_model_hears_a_plucked_a() {
        // A decaying harmonic tone at A3 (MIDI 57) from 0.5 s.
        let n = MODEL_RATE as usize * 2;
        let start = MODEL_RATE as usize / 2;
        let mut audio = vec![0.0f32; n];
        for i in start..n {
            let t = (i - start) as f64 / MODEL_RATE as f64;
            let mut v = 0.0;
            for h in 1..=6 {
                v += (2.0 * std::f64::consts::PI * 220.0 * h as f64 * t).sin() / h as f64;
            }
            audio[i] = (0.3 * v * (-2.0 * t).exp()) as f32;
        }
        let mut model = load().expect("the model loads");
        let p = posteriors(model.as_mut(), &audio).unwrap();
        let col = (57 - MIDI_LOW) as usize;
        let at = |t: f64| (t / Posteriors::frame_seconds()).round() as usize;
        let sounding = p.note[at(0.8) * PITCHES + col];
        let before = p.note[at(0.3) * PITCHES + col];
        assert!(sounding > 0.5, "A3 sounding reads {sounding}");
        assert!(before < 0.2, "A3 before it starts reads {before}");
        let onset_peak = (at(0.4)..at(0.6)).map(|k| p.onset[k * PITCHES + col]).fold(0.0f32, f32::max);
        assert!(onset_peak > 0.4, "A3's onset reads {onset_peak}");
    }
}
