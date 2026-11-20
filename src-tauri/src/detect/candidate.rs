//! A candidate note model, read from a file instead of the one compiled in.
//!
//! `YAMES_NOTE_MODEL=<file.nnef.tar>` makes [`super::model::load`] read that
//! archive. It must keep Basic Pitch's contract (43,844 samples in, note and
//! onset posteriors of 172 x 88 out, under the same output names), which is
//! what `tools/ml/export.py` and `tools/basic-pitch-nnef` write. This is how a
//! model trained by `tools/ml` is measured through the production path
//! (`npm run detect:bench`, `plans/ml/PLAN.md`) before it may replace the
//! shipped one; no shipped build sets the variable.

/// The file asked for, if any.
pub fn asked() -> Option<String> {
    std::env::var("YAMES_NOTE_MODEL").ok().filter(|v| !v.is_empty())
}

/// The candidate on tract, the runtime every shipped build has.
#[cfg(feature = "detect-tract")]
pub fn load(path: &str) -> Result<Box<dyn super::model::NoteModel>, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("candidate note model `{path}`: {e}"))?;
    let model = super::model::tract_backend::TractModel::from_nnef(&bytes).map_err(|e| format!("candidate note model `{path}`: {e}"))?;
    Ok(Box::new(model))
}

#[cfg(not(feature = "detect-tract"))]
pub fn load(path: &str) -> Result<Box<dyn super::model::NoteModel>, String> {
    Err(format!("candidate note model `{path}`: this build has no tract runtime (feature `detect-tract`)"))
}

#[cfg(all(test, feature = "detect-tract"))]
mod tests {
    #[test]
    fn the_shipped_archive_loads_as_a_candidate_from_a_file() {
        let path = std::env::temp_dir().join(format!("yames-candidate-{}.nnef.tar", std::process::id()));
        std::fs::write(&path, super::super::model::NNEF_BYTES).unwrap();
        let mut model = super::load(path.to_str().unwrap()).expect("loads");
        let out = model.infer(&vec![0.0; super::super::model::WINDOW_SAMPLES]).expect("runs");
        assert_eq!(out.note.len(), super::super::model::WINDOW_FRAMES * super::super::model::PITCHES);
        let _ = std::fs::remove_file(&path);
        assert!(super::load("/nonexistent/model.nnef.tar").is_err());
    }
}
