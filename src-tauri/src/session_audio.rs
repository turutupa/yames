//! Per-session raw audio dump for offline DSP debugging.
//!
//! **Always on in debug builds. Always off in release builds.** No
//! flags, no env vars, no opt-in dance — if you're running
//! `npm run tauri dev` or `cargo run`, every session produces a paired
//! 16-bit PCM mono WAV next to its JSON log so the captured waveform and
//! the matcher's onset stream can be compared side-by-side.
//!
//! ## Why this isn't in production builds
//!
//! Raw audio is sensitive (a user's room mic catches voices and
//! conversations). The `cfg(debug_assertions)` gate means a
//! `cargo build --release` (or `tauri build`) shipped to a user
//! physically cannot record audio — it isn't a runtime check, it's a
//! compile-time guarantee. There is no env var to flip; the only way
//! to enable recording is to build in debug mode.
//!
//! ## Why no opt-in flag in dev
//!
//! Earlier revs gated this on `YAMES_RECORD_SESSION_AUDIO=1`. In
//! practice that flag did nothing except occasionally cost us a debug
//! session (forgot to set it, can't reconstruct the bug). Dev = full
//! debugging instrumentation always on. If for some reason you need
//! the dev binary to NOT record (e.g. you're profiling disk I/O), set
//! `YAMES_DISABLE_SESSION_AUDIO=1` — escape hatch, not the default.
//!
//! ## Filename pairing
//!
//! At session start the recorder writes to `session_inprogress_<ns>.wav.partial`
//! in the same `session_logs/` dir as the JSON log. At session end the
//! caller (`commands::persist_session_log`) renames the partial to match
//! the JSON stem — so a session yields a `session_<ts>_<ns>.json` plus
//! its `session_<ts>_<ns>.wav` twin.
//!
//! ## Format & overhead
//!
//! - Mono, 16-bit signed PCM, native sample rate (typically 48kHz).
//! - ~5.6 MB per minute. A 10-min debug session ≈ 56 MB.
//! - Header is patched on `finish()` so the file is valid as soon as
//!   `finish()` returns — interrupted sessions leave behind a `.partial`
//!   with a zeroed header (junk but disk-safe).
//!
//! ## Threading
//!
//! The cpal callback writes via a `Mutex<Option<SessionAudioRecorder>>`
//! using `try_lock`. If the lock is contended we drop the frame (small
//! gap in the WAV) rather than block the audio thread. For dev-only
//! debugging this is fine; a missing 10ms here and there doesn't change
//! what the DSP saw.

use std::fs::File;
use std::io::{BufWriter, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// Format code 1 = PCM (16-bit integer). Float (3) needs an extra "fact"
/// chunk; sticking to PCM keeps the header at exactly 44 bytes.
const WAVE_FORMAT_PCM: u16 = 1;
const BITS_PER_SAMPLE: u16 = 16;
const NUM_CHANNELS: u16 = 1;
const BYTES_PER_SAMPLE: u64 = (BITS_PER_SAMPLE / 8) as u64;
/// 64KB I/O buffer keeps disk writes off the audio thread's hot path on
/// average — actual writes happen during the spectrum/sleep window.
const WRITER_BUFFER_BYTES: usize = 64 * 1024;

/// Escape-hatch env var. Set `YAMES_DISABLE_SESSION_AUDIO=1` to turn
/// recording OFF in a debug build (e.g. when profiling disk I/O or
/// running long-soak tests where the WAVs would balloon).
///
/// Note the polarity: dev = ON by default. This env var only DISABLES.
/// There is no env var that ENABLES — in release builds, recording is
/// always off and there is no runtime override.
pub const DISABLE_ENV_VAR: &str = "YAMES_DISABLE_SESSION_AUDIO";

/// Suffix used for the in-progress WAV file. Renamed to `.wav` once
/// the JSON log lands on disk and we know its stem.
pub const PARTIAL_SUFFIX: &str = "wav.partial";

/// Returns true iff session-audio recording is enabled for this process.
///
///   * In release builds: ALWAYS false (no runtime override). The
///     `cfg(debug_assertions)` guard is a compile-time elision, so a
///     shipped binary cannot be tricked into recording.
///   * In debug builds: true UNLESS `YAMES_DISABLE_SESSION_AUDIO=1` is
///     set in the environment. Default behavior is "on" — dev = full
///     debugging always.
pub fn is_enabled() -> bool {
    #[cfg(debug_assertions)]
    {
        std::env::var(DISABLE_ENV_VAR).is_err()
    }
    #[cfg(not(debug_assertions))]
    {
        false
    }
}

/// The 44-byte header of a mono 16-bit PCM WAV holding `sample_count`
/// samples at `sample_rate`.
///
/// Pulled out of [`SessionAudioRecorder::finish`] so `take.rs` writes byte
/// for byte the same header: a take and a diagnostic dump are different
/// features with opposite privacy rules, but they are the same file format,
/// and two hand-written copies of a header is how one of them ends up with a
/// wrong `byte_rate` that no test notices.
///
/// Note the polarity of the guard on this module: [`is_enabled`] is what
/// keeps the diagnostic recorder out of release builds, and this function is
/// not part of that — it writes no file and records nothing, it lays out
/// forty-four bytes.
pub(crate) fn wav_header_mono_16bit(sample_rate: u32, sample_count: u64) -> [u8; 44] {
    let data_bytes = sample_count * BYTES_PER_SAMPLE;
    // chunk_size = 36 (header tail) + data_bytes. Clamped to u32 max
    // for the WAV spec — 2^32 / 96000 ≈ 12 hours of mono 16-bit audio
    // so this is a defensive floor, not a realistic limit.
    let chunk_size = (36u64 + data_bytes).min(u32::MAX as u64) as u32;
    let data_size = data_bytes.min(u32::MAX as u64) as u32;

    let mut header = [0u8; 44];
    // RIFF chunk descriptor
    header[0..4].copy_from_slice(b"RIFF");
    header[4..8].copy_from_slice(&chunk_size.to_le_bytes());
    header[8..12].copy_from_slice(b"WAVE");
    // fmt sub-chunk
    header[12..16].copy_from_slice(b"fmt ");
    header[16..20].copy_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    header[20..22].copy_from_slice(&WAVE_FORMAT_PCM.to_le_bytes());
    header[22..24].copy_from_slice(&NUM_CHANNELS.to_le_bytes());
    header[24..28].copy_from_slice(&sample_rate.to_le_bytes());
    let byte_rate = sample_rate as u64 * NUM_CHANNELS as u64 * BYTES_PER_SAMPLE;
    header[28..32].copy_from_slice(&(byte_rate as u32).to_le_bytes());
    let block_align = NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
    header[32..34].copy_from_slice(&block_align.to_le_bytes());
    header[34..36].copy_from_slice(&BITS_PER_SAMPLE.to_le_bytes());
    // data sub-chunk
    header[36..40].copy_from_slice(b"data");
    header[40..44].copy_from_slice(&data_size.to_le_bytes());
    header
}

/// Stream-to-disk WAV recorder. Created at session start, fed samples
/// during capture, finalized at session stop.
pub struct SessionAudioRecorder {
    path: PathBuf,
    writer: BufWriter<File>,
    sample_count: u64,
    sample_rate: u32,
}

impl SessionAudioRecorder {
    /// Open a new partial WAV file in `dir` (typically the same
    /// `session_logs/` directory the JSON log lives in). Writes a
    /// 44-byte placeholder header; the real sizes are patched in by
    /// `finish()`.
    pub fn create(dir: &Path, sample_rate: u32) -> std::io::Result<Self> {
        std::fs::create_dir_all(dir)?;
        let ns = crate::clock::now_ns();
        let path = dir.join(format!("session_inprogress_{:020}.{}", ns, PARTIAL_SUFFIX));
        let mut file = File::create(&path)?;
        // Reserve 44 bytes for the header — we'll seek back and patch
        // sizes on `finish()` once we know the total sample count.
        file.write_all(&[0u8; 44])?;
        Ok(Self {
            path,
            writer: BufWriter::with_capacity(WRITER_BUFFER_BYTES, file),
            sample_count: 0,
            sample_rate,
        })
    }

    /// Append mono f32 samples (interleaved frames already collapsed by
    /// the caller). Converts to i16 little-endian PCM in place.
    pub fn push_samples(&mut self, samples: &[f32]) -> std::io::Result<()> {
        // Small stack buffer to batch the per-sample to_le_bytes calls
        // into one writer.write_all per frame chunk.
        const CHUNK: usize = 1024;
        let mut buf = [0u8; CHUNK * 2];
        let mut i = 0;
        while i < samples.len() {
            let end = (i + CHUNK).min(samples.len());
            let n = end - i;
            for (j, s) in samples[i..end].iter().enumerate() {
                let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
                let bytes = v.to_le_bytes();
                buf[j * 2] = bytes[0];
                buf[j * 2 + 1] = bytes[1];
            }
            self.writer.write_all(&buf[..n * 2])?;
            i = end;
        }
        self.sample_count += samples.len() as u64;
        Ok(())
    }

    /// Flush, patch the header with real sizes, and return the path of
    /// the (now-valid but still `.wav.partial`-named) file.
    pub fn finish(mut self) -> std::io::Result<PathBuf> {
        self.writer.flush()?;
        let mut file = self
            .writer
            .into_inner()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

        let header = wav_header_mono_16bit(self.sample_rate, self.sample_count);

        file.seek(SeekFrom::Start(0))?;
        file.write_all(&header)?;
        file.sync_all()?;
        Ok(self.path)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn sample_count(&self) -> u64 {
        self.sample_count
    }
}

/// Helper: derive the final `.wav` path from a JSON log path. Replaces
/// the `.json` extension with `.wav`. Returns `None` if the input has no
/// extension or a non-`.json` extension (defensive — caller should only
/// pass paths it just received from `save_log`).
pub fn paired_wav_path(json_path: &Path) -> Option<PathBuf> {
    let ext = json_path.extension()?.to_str()?;
    if ext != "json" {
        return None;
    }
    Some(json_path.with_extension("wav"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(name: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "yames-session-audio-test-{}-{}",
            name,
            crate::clock::now_ns()
        ));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn paired_wav_path_swaps_extension() {
        let p = PathBuf::from("/tmp/session_logs/session_1700_42.json");
        let wav = paired_wav_path(&p).expect("should pair");
        assert_eq!(wav.file_name().unwrap(), "session_1700_42.wav");
    }

    #[test]
    fn paired_wav_path_rejects_non_json() {
        assert!(paired_wav_path(&PathBuf::from("/tmp/x.txt")).is_none());
        assert!(paired_wav_path(&PathBuf::from("/tmp/x")).is_none());
    }

    #[test]
    fn create_and_finish_writes_valid_wav_header() {
        let dir = tmp_dir("create-finish");
        let mut rec = SessionAudioRecorder::create(&dir, 48000).expect("create");
        // ~100ms of a 440Hz tone
        let mut samples = Vec::with_capacity(4800);
        for i in 0..4800 {
            let t = i as f32 / 48000.0;
            samples.push((t * 440.0 * 2.0 * std::f32::consts::PI).sin() * 0.5);
        }
        rec.push_samples(&samples).expect("push");
        assert_eq!(rec.sample_count(), 4800);
        let path = rec.finish().expect("finish");
        assert!(path.exists());
        let bytes = std::fs::read(&path).expect("read");
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(&bytes[12..16], b"fmt ");
        assert_eq!(&bytes[36..40], b"data");
        // data size = 4800 * 2 bytes
        let data_size = u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]);
        assert_eq!(data_size, 9600);
        // Total file size = 44 (header) + 9600 (data) = 9644
        assert_eq!(bytes.len(), 9644);
        // RIFF chunk size = file_size - 8
        let chunk_size = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        assert_eq!(chunk_size, 9636);
        // Sample rate
        let sr = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]);
        assert_eq!(sr, 48000);
    }

    #[test]
    fn empty_recording_still_valid_wav() {
        let dir = tmp_dir("empty");
        let rec = SessionAudioRecorder::create(&dir, 44100).expect("create");
        let path = rec.finish().expect("finish");
        let bytes = std::fs::read(&path).expect("read");
        // 44-byte header, 0 data
        assert_eq!(bytes.len(), 44);
        assert_eq!(&bytes[0..4], b"RIFF");
        let data_size = u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]);
        assert_eq!(data_size, 0);
    }

    #[test]
    fn samples_are_clamped_to_int16_range() {
        let dir = tmp_dir("clamp");
        let mut rec = SessionAudioRecorder::create(&dir, 48000).expect("create");
        rec.push_samples(&[1.5, -1.5, 0.0, 1.0, -1.0])
            .expect("push");
        let path = rec.finish().expect("finish");
        let bytes = std::fs::read(&path).expect("read");
        // Read i16 samples from bytes[44..]
        let payload = &bytes[44..];
        let s0 = i16::from_le_bytes([payload[0], payload[1]]);
        let s1 = i16::from_le_bytes([payload[2], payload[3]]);
        let s2 = i16::from_le_bytes([payload[4], payload[5]]);
        let s3 = i16::from_le_bytes([payload[6], payload[7]]);
        let s4 = i16::from_le_bytes([payload[8], payload[9]]);
        // 1.5 clamps to 1.0 → 32767
        assert_eq!(s0, 32767);
        // -1.5 clamps to -1.0 → -32767
        assert_eq!(s1, -32767);
        assert_eq!(s2, 0);
        assert_eq!(s3, 32767);
        assert_eq!(s4, -32767);
    }

    #[test]
    fn partial_file_uses_expected_suffix() {
        let dir = tmp_dir("suffix");
        let rec = SessionAudioRecorder::create(&dir, 48000).expect("create");
        let path_str = rec.path().to_string_lossy().to_string();
        assert!(
            path_str.ends_with(&format!(".{PARTIAL_SUFFIX}")),
            "expected partial suffix, got {path_str}"
        );
        let _ = rec.finish();
    }
}
