use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::session_audio::{self, SessionAudioRecorder};
use crate::session_log::AudioLevelSnapshot;
use crate::take::TakeRing;

/// Monotonically increasing stream instance counter. Each call to
/// `AudioInput::start()` increments this before spawning the capture thread,
/// baking the resulting ID into the F32/I16 closures. Two cap-hit log lines
/// with the SAME id = cpal drop-tail from a single stream. Two cap-hits with
/// DIFFERENT ids = two live streams (leaked stream / React double-start).
static STREAM_INSTANCE_ID: AtomicU64 = AtomicU64::new(0);

/// Wall-clock timestamp for log lines — `HH:MM:SS.mmm` in local time.
/// Cheap enough for one-shot eprintln! calls (not per-callback hot path).
fn now_ts() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let s = (ms / 1000) % 86400;
    format!(
        "{:02}:{:02}:{:02}.{:03}",
        s / 3600,
        (s % 3600) / 60,
        s % 60,
        ms % 1000
    )
}

/// Module-local dev-only logger. Expands to `println!` in debug builds
/// (cargo run, vitest harness, tauri dev) and to nothing in release
/// builds — so device-config / playback-config / first-callback /
/// gain-change diagnostics are available during development without
/// polluting stdout in the shipped desktop binary. Error paths still
/// use bare `eprintln!` so genuine failures surface in production logs.
macro_rules! audio_dbg {
    ($($arg:tt)*) => {{
        #[cfg(debug_assertions)]
        {
            println!($($arg)*);
        }
    }};
}

/// Known audio interface brand patterns for smart default detection.
const INTERFACE_PATTERNS: &[&str] = &[
    "scarlett",
    "focusrite",
    "apollo",
    "motu",
    "audient",
    "presonus",
    "behringer",
    "ssl",
    "rme",
    "uad",
    "universal audio",
    "steinberg",
    "ur22",
    "ur44",
    "babyface",
    "clarett",
    "saffire",
    "tascam",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub name: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    #[serde(rename = "isInterface")]
    pub is_interface: bool,
    /// Number of input channels reported by the device's default config.
    /// 0 means the query failed (treat as 1 channel for UI purposes).
    pub channels: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioSpectrum {
    /// 16 frequency band magnitudes, normalized 0.0–1.0
    pub bands: Vec<f32>,
    /// Overall RMS level, normalized 0.0–1.0
    pub rms: f32,
}

/// Simple ring buffer for audio samples.
/// Protected by Mutex — the audio callback uses try_lock to avoid blocking.
pub struct RingBuffer {
    buf: Vec<f32>,
    write_pos: usize,
    capacity: usize,
}

impl RingBuffer {
    fn new(capacity: usize) -> Self {
        Self {
            buf: vec![0.0; capacity],
            write_pos: 0,
            capacity,
        }
    }

    fn write(&mut self, samples: &[f32]) {
        for &s in samples {
            self.buf[self.write_pos] = s;
            self.write_pos = (self.write_pos + 1) % self.capacity;
        }
    }

    /// Read the last `n` samples in chronological order.
    pub fn read_last(&self, n: usize) -> Vec<f32> {
        let n = n.min(self.capacity);
        let mut out = Vec::with_capacity(n);
        let start = (self.write_pos + self.capacity - n) % self.capacity;
        for i in 0..n {
            out.push(self.buf[(start + i) % self.capacity]);
        }
        out
    }
}

/// Audio input manager. Does NOT hold the cpal::Stream directly (it's not Send).
/// Instead, spawns a dedicated thread that owns the stream and ring buffer writes.
/// Control is via atomic flags (same pattern as MetronomeEngine).
pub struct AudioInput {
    alive: Arc<AtomicBool>,
    capture_thread: Option<thread::JoinHandle<()>>,
    ring: Arc<Mutex<RingBuffer>>,
    sample_rate: Arc<Mutex<u32>>,
    // Recording
    is_recording: Arc<AtomicBool>,
    recording_buf: Arc<Mutex<Vec<f32>>>,
    /// Sample rate snapshotted at start_recording() time. Isolated from
    /// self.sample_rate so a concurrent start() call (device/channel change)
    /// cannot corrupt the SR used for duration calculation and resampling.
    recording_sr: Arc<Mutex<u32>>,
    /// Buffer cap set atomically at start_recording() time (`recording_sr * 10`).
    /// Shared into capture-thread closures so stale CoreAudio callbacks from a
    /// prior device's stream (cpal stream-drop tail) respect the NEW session's
    /// SR rather than the thread-spawn-time SR, preventing slow-mo artefacts.
    recording_max: Arc<AtomicUsize>,
    /// Incremented by every `start()` call. Each F32/I16 closure captures the
    /// value at build-time (`my_gen`). Recording writes are only allowed when
    /// `stream_generation.load() == my_gen`, so stale CoreAudio callbacks from
    /// a prior stream (cpal drop-tail) cannot interleave samples into the new
    /// session's buffer — the root cause of slow-mo playback.
    stream_generation: Arc<AtomicU64>,
    // Playback
    playback_alive: Arc<AtomicBool>,
    playback_thread: Option<thread::JoinHandle<()>>,
    recorded_audio: Arc<Mutex<Option<(Vec<f32>, u32)>>>, // (samples, sample_rate)
    input_gain: Arc<AtomicU32>, // f32 linear multiplier stored as bits (1.0 = unity)
    // Optional per-session raw audio dump (env-flag + debug-build gated).
    // `session_recorder` is `Some` while a recording is in flight; the
    // cpal callback feeds samples in via try_lock. `last_session_audio_path`
    // is populated by `stop()` once the recorder is finalized so
    // `commands::persist_session_log` can pair the WAV with the JSON log.
    session_recorder: Arc<Mutex<Option<SessionAudioRecorder>>>,
    last_session_audio_path: Arc<Mutex<Option<PathBuf>>>,
    /// Per-second input level snapshots, written by the cpal callback
    /// and drained at session stop into the diagnostic log. Critical
    /// for debugging "stream went silent mid-session" regressions when
    /// the paired WAV itself is unreliable (the WAV writer suffers the
    /// same stall as the DSP would).
    audio_levels: Arc<Mutex<Vec<AudioLevelSnapshot>>>,
    /// Where a jam take collects your playing (JAM_MODE §4.4, `take.rs`).
    ///
    /// A lock-free ring rather than the `Mutex<Vec<f32>>` `recording_buf`
    /// is: that one drops a frame whenever the lock is contended, which for
    /// the input tester is fine (a missing 10 ms does not change what the
    /// DSP saw) and for a take is not — every sample the mic misses is a
    /// sample of drift against the band it is being mixed with.
    ///
    /// Allocated once per `start()`, so the closure holds its own `Arc` and
    /// the callback never takes a lock to find it. This mutex is only ever
    /// touched by command threads.
    take_ring: Arc<Mutex<Option<Arc<TakeRing>>>>,
    /// Whether the input callback writes into [`Self::take_ring`]. Down
    /// until `start_take`, so nothing is captured for a take until one is
    /// asked for.
    take_recording: Arc<AtomicBool>,
}

// Safety: AudioInput doesn't hold cpal::Stream — it lives on its own thread.
// The struct only holds Arc<AtomicBool>, Arc<Mutex<...>>, and JoinHandle, all of which are Send+Sync.
unsafe impl Send for AudioInput {}
unsafe impl Sync for AudioInput {}

impl AudioInput {
    pub fn new() -> Self {
        Self {
            alive: Arc::new(AtomicBool::new(false)),
            capture_thread: None,
            ring: Arc::new(Mutex::new(RingBuffer::new(48000 * 4))),
            sample_rate: Arc::new(Mutex::new(48000)),
            is_recording: Arc::new(AtomicBool::new(false)),
            recording_buf: Arc::new(Mutex::new(Vec::new())),
            recording_sr: Arc::new(Mutex::new(48000)),
            recording_max: Arc::new(AtomicUsize::new(usize::MAX)),
            stream_generation: Arc::new(AtomicU64::new(0)),
            playback_alive: Arc::new(AtomicBool::new(false)),
            playback_thread: None,
            recorded_audio: Arc::new(Mutex::new(None)),
            input_gain: Arc::new(AtomicU32::new(1.0_f32.to_bits())),
            session_recorder: Arc::new(Mutex::new(None)),
            last_session_audio_path: Arc::new(Mutex::new(None)),
            audio_levels: Arc::new(Mutex::new(Vec::new())),
            take_ring: Arc::new(Mutex::new(None)),
            take_recording: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Enumerate all audio input devices.
    pub fn list_devices() -> Vec<AudioDevice> {
        let host = cpal::default_host();
        let default_name = host
            .default_input_device()
            .and_then(|d| d.name().ok())
            .unwrap_or_default();

        let mut devices = Vec::new();
        if let Ok(input_devices) = host.input_devices() {
            for device in input_devices {
                if let Ok(name) = device.name() {
                    let lower = name.to_lowercase();
                    let is_interface = INTERFACE_PATTERNS.iter().any(|p| lower.contains(p));
                    // Use max channels across all supported configs, not just the
                    // default — on macOS, Focusrite Scarlett loopback channels (3/4)
                    // appear in supported configs but not in default_input_config().
                    let channels = device
                        .supported_input_configs()
                        .ok()
                        .and_then(|cfgs| cfgs.map(|c| c.channels()).max())
                        .unwrap_or_else(|| {
                            device
                                .default_input_config()
                                .map(|c| c.channels())
                                .unwrap_or(0)
                        });
                    audio_dbg!("[audio_input] list_devices: {:?} — {} channels (max across supported configs), is_interface={}", name, channels, is_interface);
                    devices.push(AudioDevice {
                        is_default: name == default_name,
                        is_interface,
                        channels,
                        name,
                    });
                }
            }
        }
        devices
    }

    /// Start capturing audio from the given device.
    /// Spawns a dedicated thread that owns the cpal stream.
    /// `input_channel` is 0-indexed; it is clamped to the device's valid range.
    pub fn start(
        &mut self,
        device_name: Option<&str>,
        input_channel: usize,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        self.stop();

        // Resolve device and config on the current thread (for error reporting)
        let host = cpal::default_host();
        let device = if let Some(name) = device_name {
            host.input_devices()
                .map_err(|e| e.to_string())?
                .find(|d| d.name().ok().as_deref() == Some(name))
                .ok_or_else(|| format!("Audio device '{}' not found", name))?
        } else {
            host.default_input_device()
                .ok_or_else(|| "No default input device found".to_string())?
        };

        let default_config = device.default_input_config().map_err(|e| e.to_string())?;
        let sample_format = default_config.sample_format();
        let default_channels = default_config.channels();
        let default_sr = default_config.sample_rate();
        // If the requested channel index exceeds what the default config exposes,
        // search for a supported config that provides enough channels at the same
        // sample rate. This unlocks Scarlett loopback channels (indices 2/3) that
        // are absent from default_input_config() on macOS but appear in
        // supported_input_configs(). Falls back to default channel count on failure.
        let needed = (input_channel as u16).saturating_add(1);
        let in_channels = if needed > default_channels {
            device
                .supported_input_configs()
                .ok()
                .and_then(|cfgs| {
                    cfgs.filter(|c| {
                        c.channels() >= needed
                            && c.min_sample_rate() <= default_sr
                            && c.max_sample_rate() >= default_sr
                    })
                    .map(|c| c.channels())
                    .min() // fewest channels that satisfies the request
                })
                .unwrap_or(default_channels)
        } else {
            default_channels
        };
        // Clamp the requested channel index to the device's valid range.
        // Done once here so both the F32 and I16 closures capture the same value.
        let ch = input_channel.min(in_channels.saturating_sub(1) as usize);
        let config = StreamConfig {
            channels: in_channels,
            sample_rate: default_config.sample_rate(),
            buffer_size: cpal::BufferSize::Default,
        };
        let sr = config.sample_rate.0;

        audio_dbg!(
            "[audio_input] device config: {}Hz, {}ch, {:?} (input_channel={}→ch={})",
            sr,
            in_channels,
            sample_format,
            input_channel,
            ch
        );

        // Update sample rate and resize ring buffer
        {
            *self.sample_rate.lock().unwrap() = sr;
            let mut ring = self.ring.lock().unwrap();
            *ring = RingBuffer::new(sr as usize * 4);
        }

        // The take ring, sized for this device rate. Allocated here, once
        // per stream, so the callback below holds its own `Arc` and never
        // takes a lock to find it — and so a take started later costs the
        // input thread nothing but an `AtomicBool` it is already reading.
        //
        // A stream restarting mid-take (a device change) leaves the take
        // writer holding the OLD ring: it stops receiving mic samples, the
        // band keeps the clock, and the rest of the take is the band alone.
        // A restart mid-take is the user changing audio device while
        // recording, and losing the mic from that point is the honest
        // outcome — the alternative is a file whose two halves are recorded
        // through different microphones with no gap to say so.
        let take_ring = Arc::new(TakeRing::new(sr as usize * 4));
        {
            *self.take_ring.lock().unwrap() = Some(take_ring.clone());
        }
        let take_recording = self.take_recording.clone();

        // Optional session-audio recording (dev-only, env-gated). Initialize
        // BEFORE the capture thread launches so the cpal callback can see
        // a non-None recorder from the first frame. `session_audio::is_enabled()`
        // is a no-op in release builds, so this whole block costs zero in
        // production.
        {
            *self.last_session_audio_path.lock().unwrap() = None;
            let mut slot = self.session_recorder.lock().unwrap();
            *slot = None;
            if session_audio::is_enabled() {
                match app_handle.path().app_data_dir() {
                    Ok(app_dir) => {
                        let dir = app_dir.join(crate::session_log::SESSION_LOGS_DIR);
                        match SessionAudioRecorder::create(&dir, sr) {
                            Ok(rec) => {
                                eprintln!(
                                    "[session-audio] recording enabled, writing to {}",
                                    rec.path().display()
                                );
                                *slot = Some(rec);
                            }
                            Err(e) => {
                                eprintln!("[session-audio] failed to open WAV writer: {e}");
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[session-audio] could not resolve app data dir: {e}");
                    }
                }
            }
        }

        // Reset the per-session audio-level buffer so a new session
        // doesn't inherit the previous session's snapshots.
        {
            let mut levels = self.audio_levels.lock().unwrap();
            levels.clear();
        }

        let alive = self.alive.clone();
        alive.store(true, Ordering::SeqCst);
        let ring = self.ring.clone();
        let is_recording = self.is_recording.clone();
        let recording_buf = self.recording_buf.clone();
        let input_gain = self.input_gain.clone();
        let self_session_recorder = self.session_recorder.clone();
        let audio_levels_cb = self.audio_levels.clone();
        let recording_max_cb = self.recording_max.clone();
        let take_ring_cb = take_ring;
        let take_recording_cb = take_recording;
        // Bump the generation counter and capture the new value. Each closure
        // bakes in `my_gen` and only writes to `recording_buf` when the global
        // counter still matches — stale CoreAudio callbacks (cpal drop-tail)
        // from prior streams see a lower value and skip the write.
        self.stream_generation.fetch_add(1, Ordering::SeqCst);
        let my_gen = self.stream_generation.load(Ordering::SeqCst);
        let stream_gen_cb = self.stream_generation.clone();
        let sample_rate = sr;
        let session_start_instant = std::time::Instant::now();
        let device_name_owned = device.name().unwrap_or_default();
        // Move the resolved channel index into the thread closure.
        let selected_ch = ch;

        self.capture_thread = Some(thread::spawn(move || {
            // Re-open the device on this thread (cpal streams must be created on the thread that runs them)
            let host = cpal::default_host();
            let device = if let Ok(devices) = host.input_devices() {
                devices
                    .into_iter()
                    .find(|d| d.name().ok().as_deref() == Some(&device_name_owned))
            } else {
                None
            };
            let device = match device {
                Some(d) => d,
                None => {
                    eprintln!("Audio input: device disappeared before thread started");
                    return;
                }
            };

            let ring_for_callback = ring.clone();
            let channels = config.channels as usize;
            let is_recording_cb = is_recording.clone();
            let recording_buf_cb = recording_buf.clone();

            let session_rec_cb = self_session_recorder.clone();

            // Per-second audio-level accumulator. Reset every time we
            // emit a snapshot. The accumulator runs on the cpal thread
            // (single-writer) so plain locals are fine.
            //
            // We close over `audio_levels_cb` to push completed snapshots
            // out via try_lock (drop-on-contention, same pattern as the
            // other shared mutexes — losing a snapshot is acceptable).
            struct LevelAcc {
                peak: f32,
                sum_abs: f32,
                frames: u32,
            }
            impl LevelAcc {
                fn new() -> Self {
                    Self {
                        peak: 0.0,
                        sum_abs: 0.0,
                        frames: 0,
                    }
                }
                fn observe(&mut self, samples: &[f32]) {
                    for &s in samples {
                        let a = s.abs();
                        if a > self.peak {
                            self.peak = a;
                        }
                        self.sum_abs += a;
                    }
                    self.frames += samples.len() as u32;
                }
                fn drain(&mut self) -> (f32, f32, u32) {
                    let peak = self.peak;
                    let mean = if self.frames > 0 {
                        self.sum_abs / self.frames as f32
                    } else {
                        0.0
                    };
                    let frames = self.frames;
                    self.peak = 0.0;
                    self.sum_abs = 0.0;
                    self.frames = 0;
                    (peak, mean, frames)
                }
            }

            // Monotonically increasing per-stream ID. Two cap-hits with the
            // same ID = cpal drop-tail from one stream. Different IDs = two
            // live streams (leaked / React double-start).
            let my_stream_id = STREAM_INSTANCE_ID.fetch_add(1, Ordering::Relaxed);
            eprintln!(
                "[{}] [stream-built] id={} device={:?} sr={}Hz ch={}",
                now_ts(),
                my_stream_id,
                device_name_owned,
                sample_rate,
                selected_ch
            );

            let stream_result = match sample_format {
                SampleFormat::F32 => {
                    let is_rec = is_recording_cb.clone();
                    let rec_buf = recording_buf_cb.clone();
                    let recording_max_f32 = recording_max_cb.clone();
                    let gain = input_gain.clone();
                    let session_rec = session_rec_cb.clone();
                    let levels_out = audio_levels_cb.clone();
                    let start = session_start_instant;
                    let sr_frames = sample_rate;
                    let ch = selected_ch;
                    let stream_id = my_stream_id;
                    let stream_gen_f32 = stream_gen_cb.clone();
                    let my_gen_f32 = my_gen;
                    let mut level_acc = LevelAcc::new();
                    let mut cap_logged_f32 = false;
                    let take_ring_f32 = take_ring_cb.clone();
                    let take_on_f32 = take_recording_cb.clone();
                    device.build_input_stream(
                    &config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        let g = f32::from_bits(gain.load(Ordering::Relaxed));
                        let mono: Vec<f32> = data.chunks(channels).map(|f| f[ch] * g).collect();
                        if let Ok(mut r) = ring_for_callback.try_lock() {
                            r.write(&mono);
                        }
                        // A jam take, if one is running. Lock-free and
                        // unconditional apart from one relaxed load, so the
                        // input path costs nothing when nobody is recording
                        // and never drops a sample when somebody is.
                        if take_on_f32.load(Ordering::Relaxed) {
                            take_ring_f32.push(&mono);
                        }
                        // Gate recording writes on the stream generation counter.
                        // Stale CoreAudio callbacks from a prior stream (cpal
                        // drop-tail) see a generation mismatch and skip the write,
                        // preventing double-writes that cause slow-mo playback.
                        if is_rec.load(Ordering::Relaxed)
                            && stream_gen_f32.load(Ordering::Relaxed) == my_gen_f32
                        {
                            if let Ok(mut buf) = rec_buf.try_lock() {
                                let max_rec = recording_max_f32.load(Ordering::Relaxed);
                                if buf.len() < max_rec {
                                    buf.extend_from_slice(&mono);
                                } else if !cap_logged_f32 {
                                    cap_logged_f32 = true;
                                    eprintln!(
                                        "[{}] [recording] cap hit (f32): stream_id={} thread_sr={}Hz rec_cap_sr={}Hz",
                                        now_ts(), stream_id, sr_frames, max_rec / 10
                                    );
                                }
                            }
                        }
                        // Session-audio dump (dev-only). try_lock + drop-on-fail
                        // so we never block the audio thread on disk I/O —
                        // BufWriter absorbs the bulk of writes anyway.
                        if let Ok(mut slot) = session_rec.try_lock() {
                            if let Some(rec) = slot.as_mut() {
                                let _ = rec.push_samples(&mono);
                            }
                        }
                        // Per-second level snapshot — observable evidence
                        // for "WAV went silent" regressions. Once we've
                        // accumulated a full second of frames, push a
                        // snapshot via try_lock; if contended (which
                        // realistically only happens at session stop) we
                        // drop the snapshot rather than block.
                        level_acc.observe(&mono);
                        if level_acc.frames >= sr_frames {
                            let (peak, mean, frames) = level_acc.drain();
                            let ts_ms = start.elapsed().as_millis() as u64;
                            if let Ok(mut v) = levels_out.try_lock() {
                                v.push(AudioLevelSnapshot { timestamp_ms: ts_ms, peak, mean, frames });
                            }
                        }
                    },
                    |err| eprintln!("[audio_input] cpal stream error: {} — recovery path is print-only; subsequent silence in WAV / DSP may follow", err),
                    None,
                )
                }
                SampleFormat::I16 => {
                    let is_rec = is_recording_cb.clone();
                    let rec_buf = recording_buf_cb.clone();
                    let recording_max_i16 = recording_max_cb.clone();
                    let gain = input_gain.clone();
                    let session_rec = session_rec_cb.clone();
                    let levels_out = audio_levels_cb.clone();
                    let start = session_start_instant;
                    let sr_frames = sample_rate;
                    let ch = selected_ch;
                    let stream_id = my_stream_id;
                    let stream_gen_i16 = stream_gen_cb.clone();
                    let my_gen_i16 = my_gen;
                    let mut level_acc = LevelAcc::new();
                    let mut cap_logged_i16 = false;
                    let take_ring_i16 = take_ring_cb.clone();
                    let take_on_i16 = take_recording_cb.clone();
                    device.build_input_stream(
                    &config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let g = f32::from_bits(gain.load(Ordering::Relaxed));
                        let mono: Vec<f32> = data.chunks(channels)
                            .map(|f| (f[ch] as f32 / i16::MAX as f32) * g)
                            .collect();
                        if let Ok(mut r) = ring_for_callback.try_lock() {
                            r.write(&mono);
                        }
                        if take_on_i16.load(Ordering::Relaxed) {
                            take_ring_i16.push(&mono);
                        }
                        if is_rec.load(Ordering::Relaxed)
                            && stream_gen_i16.load(Ordering::Relaxed) == my_gen_i16
                        {
                            if let Ok(mut buf) = rec_buf.try_lock() {
                                let max_rec = recording_max_i16.load(Ordering::Relaxed);
                                if buf.len() < max_rec {
                                    buf.extend_from_slice(&mono);
                                } else if !cap_logged_i16 {
                                    cap_logged_i16 = true;
                                    eprintln!(
                                        "[{}] [recording] cap hit (i16): stream_id={} thread_sr={}Hz rec_cap_sr={}Hz",
                                        now_ts(), stream_id, sr_frames, max_rec / 10
                                    );
                                }
                            }
                        }
                        if let Ok(mut slot) = session_rec.try_lock() {
                            if let Some(rec) = slot.as_mut() {
                                let _ = rec.push_samples(&mono);
                            }
                        }
                        level_acc.observe(&mono);
                        if level_acc.frames >= sr_frames {
                            let (peak, mean, frames) = level_acc.drain();
                            let ts_ms = start.elapsed().as_millis() as u64;
                            if let Ok(mut v) = levels_out.try_lock() {
                                v.push(AudioLevelSnapshot { timestamp_ms: ts_ms, peak, mean, frames });
                            }
                        }
                    },
                    |err| eprintln!("[audio_input] cpal stream error: {} — recovery path is print-only; subsequent silence in WAV / DSP may follow", err),
                    None,
                )
                }
                _ => {
                    eprintln!("Unsupported sample format: {:?}", sample_format);
                    return;
                }
            };

            let stream = match stream_result {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Failed to build input stream: {}", e);
                    return;
                }
            };

            if let Err(e) = stream.play() {
                eprintln!("Failed to start input stream: {}", e);
                return;
            }

            // Spectrum analysis loop (runs on same thread, stream lives here too)
            Self::spectrum_loop(&alive, &ring, sample_rate, &app_handle);

            // Stream is dropped here when the loop exits, stopping capture
            drop(stream);
        }));

        Ok(())
    }

    pub fn stop(&mut self) {
        self.is_recording.store(false, Ordering::SeqCst);
        // A take outlives the stream it was capturing through: the band is
        // still playing and the writer is still going, so the take carries
        // on without the mic rather than ending here. What must stop is the
        // writing, or a restarted stream's callback would keep filling a
        // ring the take has already been told about.
        self.take_recording.store(false, Ordering::SeqCst);
        self.stop_playback();
        self.alive.store(false, Ordering::SeqCst);
        if let Some(handle) = self.capture_thread.take() {
            let _ = handle.join();
        }
        // Capture thread has exited — no more callbacks will fire, so it's
        // safe to finalize the session WAV here (writer.flush + header
        // patch). Stash the resulting path for the JSON-pairing step.
        let recorder = self.session_recorder.lock().unwrap().take();
        if let Some(rec) = recorder {
            let samples = rec.sample_count();
            match rec.finish() {
                Ok(path) => {
                    audio_dbg!(
                        "[session-audio] finalized {} samples → {}",
                        samples,
                        path.display()
                    );
                    *self.last_session_audio_path.lock().unwrap() = Some(path);
                }
                Err(e) => {
                    eprintln!("[session-audio] failed to finalize WAV: {e}");
                }
            }
        }
    }

    #[allow(dead_code)]
    pub fn is_active(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    /// Get a reference to the ring buffer (for onset detection in later phases).
    pub fn ring(&self) -> Arc<Mutex<RingBuffer>> {
        self.ring.clone()
    }

    pub fn sample_rate(&self) -> u32 {
        *self.sample_rate.lock().unwrap()
    }

    pub fn set_input_gain(&self, gain_linear: f32) {
        let clamped = gain_linear.clamp(0.0, 100.0); // 0 to +40dB ~ 100x
        audio_dbg!(
            "[audio_input] set_input_gain: {:.2}x ({:.1} dB)",
            clamped,
            20.0 * clamped.log10()
        );
        self.input_gain.store(clamped.to_bits(), Ordering::Relaxed);
    }

    /// Take ownership of the most recently finalized session-audio WAV
    /// path, if any. Returns `None` when session-audio recording was
    /// disabled, or when the file has already been claimed by an earlier
    /// call. Consumed by `commands::persist_session_log` so it can
    /// rename the partial WAV to match the JSON log's stem.
    pub fn take_last_session_audio_path(&self) -> Option<PathBuf> {
        self.last_session_audio_path.lock().unwrap().take()
    }

    /// Take ownership of all per-second input-level snapshots accumulated
    /// during the most recent capture. Drains the internal buffer so the
    /// next session starts fresh even without an intervening `start()`.
    /// Consumed by `commands::persist_session_log` and merged into the
    /// diagnostic JSON's `audioLevels` field.
    pub fn take_audio_levels(&self) -> Vec<AudioLevelSnapshot> {
        let mut guard = self.audio_levels.lock().unwrap();
        std::mem::take(&mut *guard)
    }

    // ─── Takes (JAM_MODE §4.4, `take.rs`) ───────────────────────────

    /// Start feeding a jam take, and say where and at what rate.
    ///
    /// `None` when no input stream is running — the caller decides whether
    /// to start one or to record the band alone. The ring is emptied before
    /// the flag goes up, so a take begins with what the mic hears from now
    /// and not with whatever was left behind by the last one.
    pub fn begin_take_capture(&self) -> Option<(Arc<TakeRing>, u32)> {
        if !self.is_active() {
            return None;
        }
        let ring = self.take_ring.lock().ok()?.clone()?;
        let sr = *self.sample_rate.lock().ok()?;
        ring.reset();
        self.take_recording.store(true, Ordering::SeqCst);
        Some((ring, sr))
    }

    /// Stop feeding a take. Idempotent — a stop with nothing recording is
    /// what a UI sends when the user pressed stop twice.
    pub fn end_take_capture(&self) {
        self.take_recording.store(false, Ordering::SeqCst);
    }

    // ─── Recording ──────────────────────────────────────────────────

    pub fn start_recording(&self) {
        self.is_recording.store(false, Ordering::SeqCst);
        {
            let mut buf = self.recording_buf.lock().unwrap();
            buf.clear();
            let sr = *self.sample_rate.lock().unwrap();
            // Snapshot the current SR so stop_recording() uses the rate that
            // was active when capture began, not whatever start() may have set
            // afterwards (e.g. device/channel change while recording).
            *self.recording_sr.lock().unwrap() = sr;
            // Set the atomic cap so any stale cpal callback from a prior
            // device's stream (CoreAudio stream-drop tail) respects this
            // session's SR rather than the thread-spawn-time SR.
            self.recording_max.store(sr as usize * 10, Ordering::SeqCst);
            buf.reserve(sr as usize * 10);
            eprintln!("[{}] [recording] started, sample_rate={}Hz", now_ts(), sr);
        }
        self.is_recording.store(true, Ordering::SeqCst);
    }

    /// Stop recording and stash the buffer for playback. Returns duration in seconds.
    pub fn stop_recording(&mut self) -> f32 {
        self.is_recording.store(false, Ordering::SeqCst);
        // Use the SR that was current at start_recording() time, not the live
        // self.sample_rate which may have been updated by a concurrent start().
        let sr = *self.recording_sr.lock().unwrap();
        let samples: Vec<f32> = {
            let mut buf = self.recording_buf.lock().unwrap();
            std::mem::take(&mut *buf)
        };
        let duration = samples.len() as f32 / sr as f32;
        let rms = if !samples.is_empty() {
            (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
        } else {
            0.0
        };
        let peak = samples.iter().map(|s| s.abs()).fold(0.0_f32, f32::max);
        // Zero-crossing rate: fraction of consecutive sample pairs that cross zero.
        // Acts as a crude frequency estimator — e.g. a 440Hz tone at 44100Hz crosses
        // zero ~880 times/s → ZCR ≈ 0.020. If loopback channels are zero-interleaved
        // by CoreAudio (content at half density), ZCR ≈ 0.010 for the same pitch.
        // Compare ch1 vs ch3 ZCR for the same guitar note to diagnose slow-mo cause.
        let zcr = if samples.len() > 1 {
            let crossings = samples
                .windows(2)
                .filter(|w| (w[0] >= 0.0) != (w[1] >= 0.0))
                .count();
            crossings as f32 / samples.len() as f32
        } else {
            0.0
        };
        eprintln!(
            "[{}] [recording] stopped, {} samples, {:.2}s @ {}Hz | rms={:.4} peak={:.4} zcr={:.4}",
            now_ts(),
            samples.len(),
            duration,
            sr,
            rms,
            peak,
            zcr
        );
        *self.recorded_audio.lock().unwrap() = Some((samples, sr));
        duration
    }

    #[allow(dead_code)]
    pub fn has_recording(&self) -> bool {
        self.recorded_audio.lock().unwrap().is_some()
    }

    pub fn discard_recording(&mut self) {
        *self.recorded_audio.lock().unwrap() = None;
    }

    /// Get the waveform envelope (downsampled peaks) for UI display.
    pub fn get_waveform(&self, num_points: usize) -> Vec<f32> {
        let guard = self.recorded_audio.lock().unwrap();
        match &*guard {
            Some((samples, _)) if !samples.is_empty() => {
                let chunk_size = (samples.len() / num_points).max(1);
                samples
                    .chunks(chunk_size)
                    .take(num_points)
                    .map(|chunk| chunk.iter().map(|s| s.abs()).fold(0.0_f32, f32::max))
                    .collect()
            }
            _ => vec![0.0; num_points],
        }
    }

    // ─── Playback ──────────────────────────────────────────────────

    pub fn start_playback(
        &mut self,
        app_handle: AppHandle,
        output_device_name: Option<&str>,
    ) -> Result<(), String> {
        self.stop_playback();

        let (samples, rec_sr) = {
            let guard = self.recorded_audio.lock().unwrap();
            match &*guard {
                Some((s, r)) => (s.clone(), *r),
                None => return Err("No recording to play".to_string()),
            }
        };

        let alive = Arc::new(AtomicBool::new(true));
        self.playback_alive = alive.clone();

        let device_name_owned = output_device_name.map(|s| s.to_string());

        self.playback_thread = Some(thread::spawn(move || {
            let host = cpal::default_host();
            let device = if let Some(name) = &device_name_owned {
                host.output_devices()
                    .ok()
                    .and_then(|mut devs| {
                        devs.find(|d| d.name().ok().as_deref() == Some(name.as_str()))
                    })
                    .or_else(|| host.default_output_device())
            } else {
                host.default_output_device()
            };
            let device = match device {
                Some(d) => d,
                None => {
                    eprintln!("Playback: no output device found");
                    let _ = app_handle.emit("playback-finished", ());
                    return;
                }
            };

            let default_config = match device.default_output_config() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("Playback: failed to get default output config: {}", e);
                    let _ = app_handle.emit("playback-finished", ());
                    return;
                }
            };

            let out_sr = default_config.sample_rate().0;
            let out_format = default_config.sample_format();
            // Cap at stereo: some interfaces (e.g. Scarlett) report multichannel
            // in default_output_config but the actual stream delivers stereo buffers;
            // dividing data.len() by 4 would make the cursor advance at 0.5× → slow-mo.
            // Floor at 1: mono output devices (Bluetooth SCO, virtual devices) report
            // channels=1; dividing by 2 would make the cursor advance at 0.5× → slow-mo.
            let out_channels: usize = (default_config.channels() as usize).min(2).max(1);

            eprintln!("[{}] [playback] recording: {} samples @ {}Hz, output: {}Hz {}ch {:?} (device reports {}ch)",
                now_ts(), samples.len(), rec_sr, out_sr, out_channels, out_format, default_config.channels());

            let config = StreamConfig {
                channels: out_channels as u16,
                sample_rate: default_config.sample_rate(),
                buffer_size: cpal::BufferSize::Default,
            };

            // Resample if needed (linear interpolation)
            let playback_samples = if rec_sr != out_sr {
                eprintln!(
                    "[{}] [playback] SR mismatch: recorded={}Hz output={}Hz → resampling",
                    now_ts(),
                    rec_sr,
                    out_sr
                );
                let ratio = rec_sr as f64 / out_sr as f64;
                let out_len = (samples.len() as f64 / ratio).ceil() as usize;
                let mut resampled = Vec::with_capacity(out_len);
                for i in 0..out_len {
                    let src_pos = i as f64 * ratio;
                    let idx = src_pos as usize;
                    let frac = src_pos - idx as f64;
                    let s0 = samples.get(idx).copied().unwrap_or(0.0);
                    let s1 = samples.get(idx + 1).copied().unwrap_or(s0);
                    resampled.push(s0 + (s1 - s0) * frac as f32);
                }
                resampled
            } else {
                samples
            };

            let samples_arc = Arc::new(playback_samples);
            let samples_for_cb = samples_arc.clone();
            let total_len = samples_arc.len();
            let cursor = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let cursor_for_cb = cursor.clone();
            let alive_for_cb = alive.clone();
            let logged = Arc::new(AtomicBool::new(false));
            let logged_cb = logged.clone();

            let build_result = device.build_output_stream(
                &config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    if !alive_for_cb.load(Ordering::Relaxed) {
                        for s in data.iter_mut() { *s = 0.0; }
                        return;
                    }
                    if !logged_cb.swap(true, Ordering::Relaxed) {
                        eprintln!("[{}] [playback] first callback: data.len()={}, out_channels={}, frames={}",
                            now_ts(), data.len(), out_channels, data.len() / out_channels);
                    }
                    let pos = cursor_for_cb.load(Ordering::Relaxed);
                    let frames = data.len() / out_channels;
                    for frame in 0..frames {
                        let idx = pos + frame;
                        let sample = if idx < total_len {
                            samples_for_cb[idx]
                        } else {
                            0.0
                        };
                        // Write mono sample to all output channels
                        for ch in 0..out_channels {
                            data[frame * out_channels + ch] = sample;
                        }
                    }
                    cursor_for_cb.store((pos + frames).min(total_len), Ordering::Relaxed);
                },
                |err| eprintln!("Playback error: {}", err),
                None,
            );

            // If stereo fails, try with the device's reported channel count
            let stream = match build_result {
                Ok(s) => s,
                Err(e) => {
                    let dev_channels = default_config.channels() as usize;
                    audio_dbg!(
                        "[playback] stereo stream failed ({}), retrying with {}ch",
                        e,
                        dev_channels
                    );
                    if dev_channels == out_channels {
                        eprintln!("Failed to build output stream for playback: {}", e);
                        let _ = app_handle.emit("playback-finished", ());
                        return;
                    }
                    let config2 = StreamConfig {
                        channels: default_config.channels(),
                        sample_rate: default_config.sample_rate(),
                        buffer_size: cpal::BufferSize::Default,
                    };
                    let samples_for_cb2 = samples_arc.clone();
                    let cursor_for_cb2 = cursor.clone();
                    let alive_for_cb2 = alive.clone();
                    match device.build_output_stream(
                        &config2,
                        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                            if !alive_for_cb2.load(Ordering::Relaxed) {
                                for s in data.iter_mut() {
                                    *s = 0.0;
                                }
                                return;
                            }
                            let pos = cursor_for_cb2.load(Ordering::Relaxed);
                            let frames = data.len() / dev_channels;
                            for frame in 0..frames {
                                let idx = pos + frame;
                                let sample = if idx < samples_for_cb2.len() {
                                    samples_for_cb2[idx]
                                } else {
                                    0.0
                                };
                                for ch in 0..dev_channels {
                                    data[frame * dev_channels + ch] = sample;
                                }
                            }
                            cursor_for_cb2.store(
                                (pos + frames).min(samples_for_cb2.len()),
                                Ordering::Relaxed,
                            );
                        },
                        |err| eprintln!("Playback error: {}", err),
                        None,
                    ) {
                        Ok(s) => s,
                        Err(e2) => {
                            eprintln!(
                                "Failed to build output stream for playback (both attempts): {}",
                                e2
                            );
                            let _ = app_handle.emit("playback-finished", ());
                            return;
                        }
                    }
                }
            };

            if let Err(e) = stream.play() {
                eprintln!("Failed to start playback: {}", e);
                let _ = app_handle.emit("playback-finished", ());
                return;
            }

            // Wait for playback to finish or be stopped
            while alive.load(Ordering::SeqCst) {
                let pos = cursor.load(Ordering::Relaxed);
                if pos >= total_len {
                    break;
                }
                thread::sleep(Duration::from_millis(50));
            }

            alive.store(false, Ordering::SeqCst);
            drop(stream);
            let _ = app_handle.emit("playback-finished", ());
        }));

        Ok(())
    }

    pub fn stop_playback(&mut self) {
        self.playback_alive.store(false, Ordering::SeqCst);
        if let Some(handle) = self.playback_thread.take() {
            let _ = handle.join();
        }
    }

    #[allow(dead_code)]
    pub fn is_playing_back(&self) -> bool {
        self.playback_alive.load(Ordering::SeqCst)
    }

    /// Compute and emit spectrum data at ~20Hz. Runs until `alive` is set to false.
    fn spectrum_loop(
        alive: &Arc<AtomicBool>,
        ring: &Arc<Mutex<RingBuffer>>,
        sample_rate: u32,
        app_handle: &AppHandle,
    ) {
        let fft_size = 2048_usize;

        // Hann window
        let window: Vec<f32> = (0..fft_size)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (fft_size - 1) as f32).cos())
            })
            .collect();

        // 16 logarithmically-spaced frequency band edges
        let nyquist = sample_rate as f32 / 2.0;
        let num_bands = 16;
        let half = fft_size / 2;
        let band_edges = log_band_edges(20.0, nyquist.min(20000.0), num_bands, nyquist, half);

        let mut smoothed = vec![0.0_f32; num_bands];
        let decay = 0.7_f32;

        while alive.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(50));
            if !alive.load(Ordering::SeqCst) {
                break;
            }

            let samples = {
                let r = ring.lock().unwrap();
                r.read_last(fft_size)
            };

            if samples.len() < fft_size {
                continue;
            }

            // RMS
            let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();

            // Apply window
            let windowed: Vec<f32> = samples.iter().zip(&window).map(|(s, w)| s * w).collect();

            // Compute energy in each band using Goertzel's algorithm
            let mut band_magnitudes = Vec::with_capacity(num_bands);
            for &(lo, hi) in &band_edges {
                if lo >= hi {
                    band_magnitudes.push(0.0);
                    continue;
                }
                let mut energy = 0.0_f32;
                let bin_count = hi - lo;
                for bin in lo..hi {
                    let freq = 2.0 * std::f32::consts::PI * bin as f32 / fft_size as f32;
                    let coeff = 2.0 * freq.cos();
                    let mut s1 = 0.0_f32;
                    let mut s2 = 0.0_f32;
                    for &x in &windowed {
                        let s0 = x + coeff * s1 - s2;
                        s2 = s1;
                        s1 = s0;
                    }
                    let power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
                    energy += power.max(0.0).sqrt();
                }
                band_magnitudes.push(energy / bin_count as f32);
            }

            // Normalize
            let max_mag = band_magnitudes.iter().cloned().fold(0.0_f32, f32::max);
            let ref_level = max_mag.max(0.001);
            let normalized: Vec<f32> = band_magnitudes
                .iter()
                .enumerate()
                .map(|(i, &mag)| {
                    let target = (mag / ref_level).clamp(0.0, 1.0);
                    smoothed[i] = smoothed[i] * decay + target * (1.0 - decay);
                    smoothed[i]
                })
                .collect();

            let has_signal = rms > 0.005;
            let spectrum = if has_signal {
                AudioSpectrum {
                    bands: normalized,
                    rms: (rms * 10.0).clamp(0.0, 1.0),
                }
            } else {
                // Decay smoothed values toward zero when silent
                for s in smoothed.iter_mut() {
                    *s *= decay;
                }
                AudioSpectrum {
                    bands: smoothed.clone(),
                    rms: 0.0,
                }
            };
            let _ = app_handle.emit("audio-spectrum", &spectrum);
        }
    }
}

impl Drop for AudioInput {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Compute logarithmically-spaced band edges as FFT bin index pairs.
fn log_band_edges(
    lo_freq: f32,
    hi_freq: f32,
    num_bands: usize,
    nyquist: f32,
    num_bins: usize,
) -> Vec<(usize, usize)> {
    let log_lo = lo_freq.ln();
    let log_hi = hi_freq.ln();
    let mut edges = Vec::with_capacity(num_bands);
    for i in 0..num_bands {
        let f_lo = (log_lo + (log_hi - log_lo) * i as f32 / num_bands as f32).exp();
        let f_hi = (log_lo + (log_hi - log_lo) * (i + 1) as f32 / num_bands as f32).exp();
        let bin_lo = ((f_lo / nyquist) * num_bins as f32).round() as usize;
        let bin_hi = ((f_hi / nyquist) * num_bins as f32).round() as usize;
        // Skip bin 0 (DC offset) — it picks up noise from audio interfaces
        edges.push((bin_lo.max(1).min(num_bins), bin_hi.min(num_bins)));
    }
    edges
}

pub type SharedAudioInput = Arc<Mutex<AudioInput>>;

pub fn create_shared_audio_input() -> SharedAudioInput {
    Arc::new(Mutex::new(AudioInput::new()))
}
