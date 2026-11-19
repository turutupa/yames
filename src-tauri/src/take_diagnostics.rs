//! "Keep my last Takes for troubleshooting": a Take's input audio and what
//! the app expected of it, written to the app's own data folder so a Take that
//! graded wrong can be replayed through `detect-bench replay`
//! (`plans/detection/MEASURE.md`).
//!
//! **Off unless the player turns it on, and local when it is on.** Nothing
//! here sends anything anywhere: there is no telemetry in Yames. The files
//! are the player's to send or delete, and only the last [`KEEP`] are kept.
//!
//! Written on the post-Take thread (`timing.rs`, `yames-take-notes`), which
//! may block on a disk; never on an audio thread, the detector's thread or the
//! analyzer's loop.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Takes kept on disk; older ones are removed as new ones arrive. A Take is
/// about 2 to 6 MB (mono float at the device's rate).
pub const KEEP: usize = 20;

#[derive(Default)]
pub struct TakeDiagnostics {
    enabled: AtomicBool,
    dir: Mutex<Option<PathBuf>>,
}

impl TakeDiagnostics {
    /// Turn it on with the folder to write to, or off.
    pub fn set(&self, dir: Option<PathBuf>) {
        self.enabled.store(dir.is_some(), Ordering::Release);
        *self.dir.lock().unwrap_or_else(|e| e.into_inner()) = dir;
    }

    pub fn enabled(&self) -> bool {
        self.enabled.load(Ordering::Acquire)
    }

    /// Write one Take: `take-<unix seconds>.wav` and `.job.json`, which is
    /// `job` with the audio's file name put in. Failures are logged and
    /// swallowed: troubleshooting must never cost a grade.
    pub fn write(&self, samples: &[f32], rate: u32, mut job: serde_json::Value) {
        if !self.enabled() || samples.is_empty() || rate == 0 {
            return;
        }
        let Some(dir) = self.dir.lock().unwrap_or_else(|e| e.into_inner()).clone() else {
            return;
        };
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let result = (|| -> Result<(), String> {
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let wav = dir.join(format!("take-{stamp}.wav"));
            let spec = hound::WavSpec { channels: 1, sample_rate: rate, bits_per_sample: 32, sample_format: hound::SampleFormat::Float };
            let mut w = hound::WavWriter::create(&wav, spec).map_err(|e| e.to_string())?;
            for s in samples {
                w.write_sample(*s).map_err(|e| e.to_string())?;
            }
            w.finalize().map_err(|e| e.to_string())?;
            job["audio"] = serde_json::Value::String(format!("take-{stamp}.wav"));
            std::fs::write(dir.join(format!("take-{stamp}.job.json")), serde_json::to_vec(&job).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            prune(&dir);
            Ok(())
        })();
        if let Err(e) = result {
            eprintln!("[yames] could not keep the Take for troubleshooting: {e}");
        }
    }
}

/// Keep the newest [`KEEP`] Takes of `dir`; names sort by time.
fn prune(dir: &std::path::Path) {
    let Ok(read) = std::fs::read_dir(dir) else { return };
    let mut wavs: Vec<PathBuf> = read
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("take-") && n.ends_with(".wav")))
        .collect();
    wavs.sort();
    let extra = wavs.len().saturating_sub(KEEP);
    for wav in &wavs[..extra] {
        let _ = std::fs::remove_file(wav);
        let _ = std::fs::remove_file(wav.with_extension("job.json"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yames-take-diag-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn nothing_is_written_until_it_is_turned_on() {
        let dir = scratch("off");
        let d = TakeDiagnostics::default();
        d.write(&[0.1; 480], 48_000, serde_json::json!({"bpm": 100}));
        assert!(!dir.exists());
        assert!(!d.enabled());
    }

    #[test]
    fn a_take_is_written_with_its_sidecar_and_old_ones_are_pruned() {
        let dir = scratch("on");
        let d = TakeDiagnostics::default();
        d.set(Some(dir.clone()));
        d.write(&[0.25; 4800], 48_000, serde_json::json!({"bpm": 100}));
        let names: Vec<String> = std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names.len(), 2, "{names:?}");
        let job = names.iter().find(|n| n.ends_with(".job.json")).unwrap();
        let v: serde_json::Value = serde_json::from_slice(&std::fs::read(dir.join(job)).unwrap()).unwrap();
        assert_eq!(v["bpm"], 100);
        let wav = v["audio"].as_str().unwrap();
        let r = hound::WavReader::open(dir.join(wav)).unwrap();
        assert_eq!(r.spec().sample_rate, 48_000);
        assert_eq!(r.len(), 4800);
        // older Takes go once there are more than KEEP
        for i in 0..KEEP + 3 {
            std::fs::write(dir.join(format!("take-{:010}.wav", i)), b"x").unwrap();
            std::fs::write(dir.join(format!("take-{:010}.job.json", i)), b"{}").unwrap();
        }
        prune(&dir);
        let wavs = std::fs::read_dir(&dir).unwrap().filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().ends_with(".wav")).count();
        assert_eq!(wavs, KEEP);
        assert!(dir.join(wav).exists(), "the newest Take is kept");
        d.set(None);
        assert!(!d.enabled());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
