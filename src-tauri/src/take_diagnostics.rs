//! "Keep my last Takes for troubleshooting": a Take's input audio and what
//! the app expected of it, written to the app's own data folder so a Take that
//! graded wrong can be replayed through `detect-bench replay`
//! (`plans/detection/MEASURE.md`).
//!
//! **Off unless the player turns it on, and local when it is on.** Nothing
//! here sends anything anywhere: there is no telemetry in Yames. The files
//! are the player's to send or delete, and only the last [`KEEP`] are kept.
//! **They are the raw microphone recording** of each Take, whatever else the
//! room held, and Settings says so.
//!
//! Written on the post-Take thread (`timing.rs`, `yames-take-notes`), which
//! may block on a disk; never on an audio thread, the detector's thread or the
//! analyzer's loop.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

/// Takes kept on disk; older ones are removed as new ones arrive. A Take is
/// mono 32-bit float at the device's rate: 5.8 MB for 30 s at 48 kHz, and
/// about 23 MB at worst (the 120 s the tap keeps), so the folder is at most
/// about 460 MB.
pub const KEEP: usize = 20;

/// Tells apart two Takes written in the same millisecond.
static WRITTEN: AtomicU32 = AtomicU32::new(0);

/// A file still being written: never read as a Take, renamed when whole.
const PARTIAL: &str = "tmp";

/// A partial file this old was left by a write that died.
const STALE_PARTIAL: std::time::Duration = std::time::Duration::from_secs(600);

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

    /// Write one Take ([`write_pair`]) and prune to the last [`KEEP`].
    /// Failures are logged and swallowed: troubleshooting must never cost a
    /// grade.
    pub fn write(&self, samples: &[f32], rate: u32, mut job: serde_json::Value) {
        if !self.enabled() || samples.is_empty() || rate == 0 {
            return;
        }
        let Some(dir) = self.dir.lock().unwrap_or_else(|e| e.into_inner()).clone() else {
            return;
        };
        let result = write_pair(&dir, &next_stem(), samples, rate, &mut job).map(|_| prune(&dir));
        if let Err(e) = result {
            eprintln!("[yames] could not keep the Take for troubleshooting: {e}");
        }
    }
}

/// A new Take's file stem, `take-<unix ms>-<count>`. Names sort by time: 13
/// digits of milliseconds until the year 2286, and a `take-<seconds>.wav` from
/// before this sorts ahead of them; the count keeps two Takes written in the
/// same millisecond apart.
pub(crate) fn next_stem() -> String {
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    format!("take-{ms:013}-{:04}", WRITTEN.fetch_add(1, Ordering::Relaxed) % 10_000)
}

/// Write `<stem>.wav` (mono 32-bit float) and `<stem>.job.json` (`job`, with
/// the audio's file name put in) into `dir`. Each under a `.tmp` name, renamed
/// when whole, the audio first, so a sidecar that is there always names a
/// finished recording. The bytes written. Blocks on the disk: never call it
/// from an audio thread, the detector's thread or the analyzer's loop.
pub(crate) fn write_pair(dir: &std::path::Path, stem: &str, samples: &[f32], rate: u32, job: &mut serde_json::Value) -> Result<u64, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let wav = dir.join(format!("{stem}.wav"));
    let wav_partial = dir.join(format!("{stem}.wav.{PARTIAL}"));
    let spec = hound::WavSpec { channels: 1, sample_rate: rate, bits_per_sample: 32, sample_format: hound::SampleFormat::Float };
    let mut w = hound::WavWriter::create(&wav_partial, spec).map_err(|e| e.to_string())?;
    for s in samples {
        w.write_sample(*s).map_err(|e| e.to_string())?;
    }
    w.finalize().map_err(|e| e.to_string())?;
    job["audio"] = serde_json::Value::String(format!("{stem}.wav"));
    let body = serde_json::to_vec(job).map_err(|e| e.to_string())?;
    let job_partial = dir.join(format!("{stem}.job.json.{PARTIAL}"));
    std::fs::write(&job_partial, &body).map_err(|e| e.to_string())?;
    std::fs::rename(&wav_partial, &wav).map_err(|e| e.to_string())?;
    std::fs::rename(&job_partial, dir.join(format!("{stem}.job.json"))).map_err(|e| e.to_string())?;
    Ok(44 + samples.len() as u64 * 4 + body.len() as u64)
}

/// Keep the newest [`KEEP`] Takes of `dir`; names sort by time. Partial files
/// a dead write left behind go too, once they are old enough not to be a
/// write in flight.
fn prune(dir: &std::path::Path) {
    let Ok(read) = std::fs::read_dir(dir) else { return };
    let all: Vec<PathBuf> = read.filter_map(|e| e.ok().map(|e| e.path())).collect();
    for partial in all.iter().filter(|p| {
        p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("take-")) && p.extension().is_some_and(|e| e == PARTIAL)
    }) {
        let age = std::fs::metadata(partial).and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok());
        if age.is_some_and(|a| a > STALE_PARTIAL) {
            let _ = std::fs::remove_file(partial);
        }
    }
    let mut wavs: Vec<PathBuf> = all
        .into_iter()
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
        assert!(names.iter().all(|n| !n.ends_with(".tmp")), "{names:?}");
        // two Takes inside one second, or one millisecond, are two Takes
        d.write(&[0.5; 480], 48_000, serde_json::json!({"bpm": 101}));
        d.write(&[0.5; 480], 48_000, serde_json::json!({"bpm": 102}));
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 6);
        let job = names.iter().find(|n| n.ends_with(".job.json")).unwrap();
        let v: serde_json::Value = serde_json::from_slice(&std::fs::read(dir.join(job)).unwrap()).unwrap();
        assert_eq!(v["bpm"], 100);
        let wav = v["audio"].as_str().unwrap();
        let r = hound::WavReader::open(dir.join(wav)).unwrap();
        assert_eq!(r.spec().sample_rate, 48_000);
        assert_eq!(r.len(), 4800);
        // older Takes go once there are more than KEEP
        for i in 0..KEEP + 3 {
            // (names of the kind written before the millisecond stamp)
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
