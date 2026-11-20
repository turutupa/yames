//! The note model behind the verifier: Basic Pitch (Spotify, Apache-2.0,
//! 16,782 parameters), run over a whole Take after it closes.
//!
//! **Tier.** Mid-session report (AGENTS.md "latency tiers"): never on an audio
//! callback, never on the onset detector's thread, never on the analyzer's
//! 5 ms loop. The callers are the post-Take thread (`timing.rs`,
//! `yames-take-notes`, below normal priority) and offline tools.
//!
//! **The runtime sits behind [`NoteModel`]**, so nothing outside this file
//! names it. `detect-tract` (the shipped default) runs it on tract, pure
//! Rust; `detect-ort` on ONNX Runtime through the `ort` crate, kept for the
//! bench and parity (`plans/detection/RUNTIME.md`). A build with neither has
//! no model: [`load`] says so and every caller degrades to
//! "not run" (`VerifierStatus::NoModel`), which is what a plain
//! `cargo build` or `cargo test` gets. Every build people play on is made
//! with `detect-tract` (`scripts/tauri.mjs`, `release.yml`, `beta.yml`).
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

/// The same network as tract's NNEF archive, made from [`MODEL_BYTES`] by
/// `tools/basic-pitch-nnef` (input fixed to one window, the two heads the
/// verifier reads). 257 KiB. Only builds with `detect-tract` carry it.
#[cfg(feature = "detect-tract")]
pub static NNEF_BYTES: &[u8] = include_bytes!("../../models/basic-pitch/nmp.nnef.tar");

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
    cfg!(any(feature = "detect-tract", feature = "detect-ort"))
}

/// The runtimes this build has, the default first.
pub fn runtimes() -> Vec<&'static str> {
    let mut v = Vec::new();
    if cfg!(feature = "detect-tract") {
        v.push("tract");
    }
    if cfg!(feature = "detect-ort") {
        v.push("ort");
    }
    v
}

/// The model on the runtime this build has. One thread: it runs beside a
/// metronome (AGENTS.md, the audio-safety gate). With both runtimes in the
/// build, `tract` unless `YAMES_DETECT_RUNTIME=ort` (bench and parity only;
/// shipped builds have tract alone, `plans/detection/RUNTIME.md`).
pub fn load() -> Result<Box<dyn NoteModel>, String> {
    // A candidate note model from a file (`plans/ml/PLAN.md`): for the bench
    // and for trying a trained model in a dev build. Unset in every shipped
    // build, where the model is the one compiled in.
    if let Some(path) = super::candidate::asked() {
        return super::candidate::load(&path);
    }
    let asked = std::env::var("YAMES_DETECT_RUNTIME").ok().filter(|v| !v.is_empty());
    match asked {
        Some(name) => load_runtime(&name),
        None => match runtimes().first() {
            Some(name) => load_runtime(name),
            None => Err("this build has no note model (features `detect-tract` and `detect-ort` are off)".into()),
        },
    }
}

/// The model on one named runtime (`"tract"` or `"ort"`), if this build has it.
pub fn load_runtime(name: &str) -> Result<Box<dyn NoteModel>, String> {
    match name {
        #[cfg(feature = "detect-tract")]
        "tract" => tract_backend::TractModel::new().map(|m| Box::new(m) as Box<dyn NoteModel>),
        #[cfg(feature = "detect-ort")]
        "ort" => ort_backend::OrtModel::new().map(|m| Box::new(m) as Box<dyn NoteModel>),
        other => Err(format!("this build has no `{other}` note-model runtime (it has: {:?})", runtimes())),
    }
}

/// The app's one loaded model, made on first use and kept. `f` gets `None`
/// when this build has no model, when the player's environment turned the
/// verifier off (`YAMES_VERIFIER=0`), or when loading failed or panicked
/// (said once on stderr, and remembered: a model that would not load is not
/// tried again on every Take). Inference holds the lock, so callers queue:
/// the post-Take pass is the only one, and it is one Take at a time.
///
/// A panic inside `f` while it holds a model retires that model the same way
/// (every later call gets `None`), and then goes on to the caller, whose it is
/// to catch (`timing::late_grade_staged` does, and keeps the tracker's grade).
pub fn with_shared<R>(f: impl FnOnce(Option<&mut Box<dyn NoteModel>>) -> R) -> R {
    static SHARED: Shared = std::sync::Mutex::new(None);
    with_slot(&SHARED, || if enabled() { load() } else { Err(String::new()) }, f)
}

/// Load the shared model now, if it is not loaded yet, on a thread of its
/// own below normal priority, so the first Take's verifier pass does not pay
/// for it (reading the archive and optimising the graph: `RUNTIME.md`,
/// "Loading"). Returns at once; spawns at most one thread per process. For
/// callers off every real-time thread only (the command that loads an
/// Exercise): never the audio callback, never the onset thread.
pub fn warm_in_background() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    if !enabled() {
        return;
    }
    ONCE.call_once(|| {
        let _ = std::thread::Builder::new().name("yames-note-model-warm".into()).spawn(|| {
            crate::coach::lower_current_thread_priority();
            with_shared(|_| ());
        });
    });
}

/// Not yet asked for; asked for and absent (`Some(None)`); or loaded.
type Shared = std::sync::Mutex<Option<Option<Box<dyn NoteModel>>>>;

/// [`with_shared`] over a given slot and loader (an empty error is "turned
/// off": nothing to say).
fn with_slot<R>(
    shared: &Shared,
    load: impl FnOnce() -> Result<Box<dyn NoteModel>, String> + std::panic::UnwindSafe,
    f: impl FnOnce(Option<&mut Box<dyn NoteModel>>) -> R,
) -> R {
    let mut slot = shared.lock().unwrap_or_else(|e| e.into_inner());
    let model = slot.get_or_insert_with(|| match std::panic::catch_unwind(load) {
        Ok(Ok(m)) => Some(m),
        Ok(Err(e)) => {
            if !e.is_empty() {
                eprintln!("[yames] the note model did not load, so notes are not verified: {e}");
            }
            None
        }
        Err(_) => {
            eprintln!("[yames] the note model panicked while loading, so notes are not verified");
            None
        }
    });
    let had_model = model.is_some();
    // The catch is around all of `f`, not the one inference call inside it:
    // `f` is the caller's (the verifier's rule runs in it too) and this file
    // cannot see where in it the panic came from. Retiring the model on any
    // of them is the safe side: a panic that came from the rule would come
    // again on every Take with the model still in, and a retired model costs
    // only the second look, never the tracker's grade.
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| f(model.as_mut()))) {
        Ok(r) => r,
        Err(panic) => {
            if had_model {
                eprintln!("[yames] the note model panicked while running, so notes are no longer verified");
                // Left where it is rather than dropped: its state is whatever
                // the panic left, and one model is all that is ever leaked.
                if let Some(broken) = slot.replace(None).flatten() {
                    std::mem::forget(broken);
                }
            }
            drop(slot);
            std::panic::resume_unwind(panic)
        }
    }
}

/// Whether the verifier should run at all in this process: compiled in, and
/// not turned off with `YAMES_VERIFIER=0` (a troubleshooting switch).
pub fn enabled() -> bool {
    compiled() && std::env::var("YAMES_VERIFIER").map(|v| v != "0").unwrap_or(true)
}

/// Pure-Rust inference (`tract`, Sonos, MIT OR Apache-2.0): no native
/// library, nothing downloaded at build time, the same code on every target
/// Yames ships (Intel Macs included). It reads [`NNEF_BYTES`], the same
/// network as [`MODEL_BYTES`] with the input fixed to one window and only
/// the note and onset heads kept (`tools/basic-pitch-nnef`).
#[cfg(feature = "detect-tract")]
pub(super) mod tract_backend {
    use super::{NoteModel, WindowOut, NNEF_BYTES, PITCHES, WINDOW_FRAMES, WINDOW_SAMPLES};
    use tract_nnef::prelude::*;

    /// The archive's output nodes as tract names them (the tensors that
    /// `graph.nnef` assigns to its results `StatefulPartitionedCall_1` and
    /// `_2`): note, then onset.
    const OUTPUTS: [&str; 2] = ["StatefulPartitionedCall_1_0", "StatefulPartitionedCall_2_0"];

    pub struct TractModel {
        plan: std::sync::Arc<TypedRunnableModel>,
    }

    impl TractModel {
        pub fn new() -> Result<Self, String> {
            Self::from_nnef(NNEF_BYTES)
        }

        /// A model from any NNEF archive that keeps Basic Pitch's contract:
        /// one window in, (note, onset) out under the same names
        /// (`detect/candidate.rs`).
        pub fn from_nnef(archive: &[u8]) -> Result<Self, String> {
            let e = |e: TractError| format!("{e:?}");
            let model = tract_nnef::nnef().model_for_read(&mut std::io::Cursor::new(archive)).map_err(e)?;
            // The archive's outputs are (note, onset), in that order
            // (`tools/basic-pitch-nnef`); refuse one that says otherwise:
            // exactly these two names, each one window of frames by pitches.
            let outlets = model.output_outlets().map_err(e)?.to_vec();
            let names: Vec<&str> = outlets.iter().map(|o| model.node(o.node).name.as_str()).collect();
            if names != OUTPUTS {
                return Err(format!("the NNEF note model has outputs {names:?}, not {OUTPUTS:?} (note, onset)"));
            }
            for (i, name) in OUTPUTS.iter().enumerate() {
                let fact = model.output_fact(i).map_err(e)?;
                if fact.shape.as_concrete() != Some(&[1, WINDOW_FRAMES, PITCHES][..]) {
                    return Err(format!("the NNEF note model's output `{name}` is {fact:?}, not 1 x {WINDOW_FRAMES} x {PITCHES}"));
                }
            }
            let plan = model.into_optimized().map_err(e)?.into_runnable().map_err(e)?;
            Ok(Self { plan })
        }
    }

    impl NoteModel for TractModel {
        fn infer(&mut self, window: &[f32]) -> Result<WindowOut, String> {
            let e = |e: TractError| format!("{e:?}");
            let input = Tensor::from_shape(&[1, WINDOW_SAMPLES, 1], window).map_err(e)?;
            let out = self.plan.run(tvec!(input.into())).map_err(e)?;
            let take = |i: usize| -> Result<Vec<f32>, String> {
                let t = out.get(i).ok_or("the note model gave fewer outputs than asked")?;
                let plain = t.try_as_plain_ram().map_err(e)?;
                let v = plain.as_slice::<f32>().map_err(e)?;
                if v.len() != WINDOW_FRAMES * PITCHES {
                    return Err(format!("output {i} has {} values, not {}", v.len(), WINDOW_FRAMES * PITCHES));
                }
                Ok(v.to_vec())
            };
            Ok(WindowOut { note: take(0)?, onset: take(1)? })
        }

        fn runtime(&self) -> &'static str {
            "tract"
        }
    }
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

    /// A model that panics on its `n`th window and counts the windows asked.
    struct Panics(std::sync::Arc<std::sync::atomic::AtomicUsize>);

    impl NoteModel for Panics {
        fn infer(&mut self, _window: &[f32]) -> Result<WindowOut, String> {
            self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            panic!("the test model panics");
        }
        fn runtime(&self) -> &'static str {
            "test"
        }
    }

    #[test]
    fn a_model_that_panics_while_running_is_retired() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let shared: Shared = std::sync::Mutex::new(None);
        let (asked, loads) = (std::sync::Arc::new(AtomicUsize::new(0)), AtomicUsize::new(0));
        let run = || {
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                with_slot(
                    &shared,
                    || {
                        loads.fetch_add(1, Ordering::SeqCst);
                        Ok(Box::new(Panics(asked.clone())) as Box<dyn NoteModel>)
                    },
                    |m| match m {
                        Some(m) => m.infer(&[]).map(|_| "ran").unwrap_or("failed"),
                        None => "no model",
                    },
                )
            }))
        };
        assert!(run().is_err(), "the panic reaches the caller, who reports the verifier as failed");
        assert_eq!(run().ok(), Some("no model"), "the next Take does not meet the broken model");
        assert_eq!(run().ok(), Some("no model"));
        assert_eq!((loads.load(Ordering::SeqCst), asked.load(Ordering::SeqCst)), (1, 1), "loaded once, run once");
    }

    #[test]
    fn a_model_that_will_not_load_is_asked_for_once() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let shared: Shared = std::sync::Mutex::new(None);
        let loads = AtomicUsize::new(0);
        for _ in 0..3 {
            let got = with_slot(
                &shared,
                || {
                    loads.fetch_add(1, Ordering::SeqCst);
                    panic!("the test loader panics")
                },
                |m| m.is_some(),
            );
            assert!(!got);
        }
        assert_eq!(loads.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn the_model_file_is_the_one_the_readme_names() {
        assert_eq!(MODEL_BYTES.len(), 230_444);
    }

    #[cfg(feature = "detect-tract")]
    #[test]
    fn the_nnef_archive_is_the_one_the_readme_names() {
        assert_eq!(NNEF_BYTES.len(), 263_168);
    }

    #[cfg(any(feature = "detect-tract", feature = "detect-ort"))]
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
        for name in runtimes() {
            let mut model = load_runtime(name).expect("the model loads");
            let p = posteriors(model.as_mut(), &audio).unwrap();
            let col = (57 - MIDI_LOW) as usize;
            let at = |t: f64| (t / Posteriors::frame_seconds()).round() as usize;
            let sounding = p.note[at(0.8) * PITCHES + col];
            let before = p.note[at(0.3) * PITCHES + col];
            assert!(sounding > 0.5, "{name}: A3 sounding reads {sounding}");
            assert!(before < 0.2, "{name}: A3 before it starts reads {before}");
            let onset_peak = (at(0.4)..at(0.6)).map(|k| p.onset[k * PITCHES + col]).fold(0.0f32, f32::max);
            assert!(onset_peak > 0.4, "{name}: A3's onset reads {onset_peak}");
        }
    }
}
