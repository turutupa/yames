//! The detection layer above the live onset detector: a small note model and
//! the score-informed verifier that reads it (research report, section 3.4;
//! `plans/detection/PROGRESS.md`).
//!
//! Nothing in here runs on an audio thread, on the onset detector's thread or
//! on the analyzer's loop. The callers are the post-Take thread, the free-play
//! worker and offline tools. See each file's header for its tier.

pub mod fft;
pub mod flux;
pub mod model;
pub mod verifier;

use model::{NoteModel, Posteriors, MODEL_RATE};
use verifier::Evidence;

/// A recording as the verifier needs it: resampled, run through the model,
/// with the attack envelope beside it. The expensive half of a verification,
/// kept apart from the rule so a tool can time and inspect each.
pub struct Analysis {
    pub evidence: Evidence,
    pub posteriors: Posteriors,
    /// Seconds of audio analysed.
    pub seconds: f64,
}

/// Analyse `samples` (mono, any rate).
pub fn analyse(model: &mut dyn NoteModel, samples: &[f32], rate: u32) -> Result<Analysis, String> {
    if rate == 0 || samples.is_empty() {
        return Err("no audio".into());
    }
    let at_rate = crate::pitch::to_analysis_rate(samples, rate);
    debug_assert_eq!(crate::pitch::ANALYSIS_RATE, MODEL_RATE);
    let as_f32: Vec<f32> = at_rate.iter().map(|v| *v as f32).collect();
    let posteriors = model::posteriors(model, &as_f32)?;
    let flux = flux::broadband_flux(&at_rate, MODEL_RATE);
    Ok(Analysis {
        evidence: Evidence::new(&posteriors, flux),
        posteriors,
        seconds: samples.len() as f64 / rate as f64,
    })
}
