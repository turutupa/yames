//! The Android input stream, opened straight at `oboe` (M7, the MVP).
//!
//! A child module of `audio_input` (`#[path]` from there), so it fills the
//! same private ring, take ring, recording buffer and level snapshots the
//! desktop's cpal callback fills. Everything downstream — the onset detector,
//! the timing analyzer, the scorer, the spectrum loop — reads those exactly as
//! it does on a desktop and does not know which platform it is on.
//!
//! # Why not cpal
//!
//! cpal 0.15.3's Android backend is Oboe, and it opens an input stream with a
//! direction and a format only (`cpal-0.15.3/src/host/oboe/mod.rs`): no
//! performance mode, no sharing mode, no input preset, and a rate picked from
//! a fixed candidate list rather than the device's own. Two of those matter
//! for grading:
//!
//! * **The input preset.** Oboe's default is `VoiceRecognition`. Most phones
//!   honour the CDD there (no AGC, no noise suppression), but a phone that runs
//!   its noise suppressor on that preset turns a pick attack into a smear and
//!   a quiet note into nothing, which is every onset the grade is built from.
//!   `Unprocessed` (API 24+) asks for the raw converter output. Where a device
//!   will not open it, the stream is opened again with `VoiceRecognition`
//!   rather than refused, and the log says which one was granted.
//! * **Latency.** `PerformanceMode::LowLatency` is what gets AAudio's fast
//!   path (MMAP where the device has it). A late input is a late onset, and
//!   the timing analyzer judges every one against the click.
//!
//! The device is chosen by id, which cpal cannot do: a phone's built-in mics
//! all carry the phone's product name, so a name alone does not say which.
//!
//! # The real-time rules (AGENTS.md)
//!
//! The data callback below does what the desktop callback does, in the same
//! order, with the same `try_lock`-and-drop discipline — and one thing less:
//! it does not allocate. The desktop builds a fresh `Vec` of mono samples per
//! buffer; this one mixes into a scratch buffer allocated when the stream
//! opens and never grows (a burst larger than it is processed in pieces). The
//! recording buffer and the level snapshots grow exactly as they do on a
//! desktop (the input tester's recording, once a second) — reviewer item.

use super::{AudioDevice, AudioInput, RingBuffer};
use crate::session_audio::SessionAudioRecorder;
use crate::session_log::AudioLevelSnapshot;
use crate::take::TakeRing;
use oboe::{
    AudioDeviceDirection, AudioDeviceInfo, AudioDeviceType, AudioInputCallback,
    AudioInputStreamSafe, AudioStream, AudioStreamBase, AudioStreamBuilder, AudioStreamSafe,
    DataCallbackResult,
    Input, InputPreset, Mono, PerformanceMode, SharingMode, Stereo,
};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// Frames the callback mixes at a time. AAudio's bursts are 96–480 frames on
/// every phone measured anywhere; 4096 leaves a margin of ten and costs 16 KiB
/// once per stream.
const SCRATCH_FRAMES: usize = 4096;

/// One input device, as Android reports it, and the name the UI shows for it.
#[derive(Debug, Clone)]
struct InputDevice {
    id: i32,
    name: String,
    kind: Kind,
    channels: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    /// A USB-C class-compliant interface, headset or amp (iRig HD, Scarlett).
    Usb,
    /// The headset jack: what a TRRS adapter (iRig 2) and a wired headset are.
    Jack,
    /// An analog line in, on the few phones and docks that have one.
    Line,
    /// One of the phone's own microphones.
    BuiltIn,
}

impl Kind {
    fn of(t: AudioDeviceType) -> Option<Kind> {
        match t {
            AudioDeviceType::UsbDevice | AudioDeviceType::UsbHeadset | AudioDeviceType::UsbAccessory => {
                Some(Kind::Usb)
            }
            AudioDeviceType::WiredHeadset => Some(Kind::Jack),
            AudioDeviceType::LineAnalog | AudioDeviceType::LineDigital | AudioDeviceType::AuxLine => {
                Some(Kind::Line)
            }
            AudioDeviceType::BuiltinMic => Some(Kind::BuiltIn),
            // Not offered: Bluetooth input is 8–16 kHz SCO with 100+ ms of
            // latency, which no grade survives (plans/tasks/mvp/ANDROID.md);
            // telephony, FM, remote submix and the rest are not a guitar.
            _ => None,
        }
    }

    /// Words the device list shows after the product name. English on
    /// purpose: they sit beside a product name the system hands over in
    /// whatever it is, and the desktop's device names are not translated
    /// either.
    fn label(self) -> &'static str {
        match self {
            Kind::Usb => "USB",
            Kind::Jack => "headset jack",
            Kind::Line => "line in",
            Kind::BuiltIn => "built-in mic",
        }
    }

    /// Which the system routes to first when the app does not choose — and so
    /// what "default" means in the list: a USB interface, then the jack, then
    /// a line in, then the phone's own mic.
    fn rank(self) -> u8 {
        match self {
            Kind::Usb => 0,
            Kind::Jack => 1,
            Kind::Line => 2,
            Kind::BuiltIn => 3,
        }
    }
}

/// Every input a guitar could come in through, named so that each name is
/// unique (two built-in mics with one product name get a number each).
fn input_devices() -> Vec<InputDevice> {
    let infos: Vec<AudioDeviceInfo> = match AudioDeviceInfo::request(AudioDeviceDirection::Input) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[yames][android] could not list input devices: {e}");
            return Vec::new();
        }
    };
    let mut out: Vec<InputDevice> = Vec::new();
    for info in infos {
        let Some(kind) = Kind::of(info.device_type) else { continue };
        let channels = info.channel_counts.iter().copied().max().unwrap_or(1).clamp(1, 2) as u16;
        let base = format!("{} ({})", info.product_name.trim(), kind.label());
        let mut name = base.clone();
        let mut n = 2;
        while out.iter().any(|d| d.name == name) {
            name = format!("{base} {n}");
            n += 1;
        }
        out.push(InputDevice { id: info.id, name, kind, channels });
    }
    out
}

pub(super) fn list_devices() -> Vec<AudioDevice> {
    let devices = input_devices();
    let best = devices.iter().map(|d| d.kind.rank()).min();
    let mut default_marked = false;
    devices
        .into_iter()
        .map(|d| {
            let is_default = !default_marked && Some(d.kind.rank()) == best;
            default_marked |= is_default;
            AudioDevice {
                name: d.name,
                is_default,
                is_interface: d.kind != Kind::BuiltIn,
                channels: d.channels,
            }
        })
        .collect()
}

/// Everything the data callback touches, built once per stream.
struct Capture {
    /// Which channel of the stream is the guitar (0 on a mono stream).
    ch: usize,
    channels: usize,
    scratch: Vec<f32>,
    gain: Arc<AtomicU32>,
    ring: Arc<Mutex<RingBuffer>>,
    /// Buffers the ring's `try_lock` turned away (the detector thread held
    /// it). Read at session stop into the log's `input_ring_drops`, as on a
    /// desktop; the right-notes capture reads that ring, so a drop is audio
    /// the note grader never saw.
    ring_drops: Arc<AtomicU64>,
    take_ring: Arc<TakeRing>,
    take_on: Arc<AtomicBool>,
    frames_seen: Arc<AtomicU32>,
    is_recording: Arc<AtomicBool>,
    recording_buf: Arc<Mutex<Vec<f32>>>,
    recording_max: Arc<AtomicUsize>,
    stream_gen: Arc<AtomicU64>,
    my_gen: u64,
    session_rec: Arc<Mutex<Option<SessionAudioRecorder>>>,
    levels_out: Arc<Mutex<Vec<AudioLevelSnapshot>>>,
    start: Instant,
    sample_rate: u32,
    peak: f32,
    sum_abs: f32,
    level_frames: u32,
}

impl Capture {
    /// The desktop callback's body, minus its allocation. `data` is
    /// interleaved, `self.channels` wide.
    fn process(&mut self, data: &[f32]) {
        let g = f32::from_bits(self.gain.load(Ordering::Relaxed));
        let frames_total = data.len() / self.channels;
        self.frames_seen.store(frames_total as u32, Ordering::Relaxed);
        for piece in data.chunks(SCRATCH_FRAMES * self.channels) {
            let frames = piece.len() / self.channels;
            // `scratch` was allocated with SCRATCH_FRAMES of capacity and is
            // only ever truncated and refilled up to it: no reallocation.
            self.scratch.clear();
            for f in 0..frames {
                self.scratch.push(piece[f * self.channels + self.ch] * g);
            }
            let mono = &self.scratch[..];
            if let Ok(mut r) = self.ring.try_lock() {
                r.write(mono);
            } else {
                self.ring_drops.fetch_add(1, Ordering::Relaxed);
            }
            if self.take_on.load(Ordering::Relaxed) {
                self.take_ring.push(mono);
            }
            if self.is_recording.load(Ordering::Relaxed)
                && self.stream_gen.load(Ordering::Relaxed) == self.my_gen
            {
                if let Ok(mut buf) = self.recording_buf.try_lock() {
                    if buf.len() < self.recording_max.load(Ordering::Relaxed) {
                        buf.extend_from_slice(mono);
                    }
                }
            }
            if let Ok(mut slot) = self.session_rec.try_lock() {
                if let Some(rec) = slot.as_mut() {
                    let _ = rec.push_samples(mono);
                }
            }
            for &s in mono {
                let a = s.abs();
                if a > self.peak {
                    self.peak = a;
                }
                self.sum_abs += a;
            }
            self.level_frames += mono.len() as u32;
            if self.level_frames >= self.sample_rate {
                let mean = self.sum_abs / self.level_frames as f32;
                let snap = AudioLevelSnapshot {
                    timestamp_ms: self.start.elapsed().as_millis() as u64,
                    peak: self.peak,
                    mean,
                    frames: self.level_frames,
                };
                if let Ok(mut v) = self.levels_out.try_lock() {
                    v.push(snap);
                }
                self.peak = 0.0;
                self.sum_abs = 0.0;
                self.level_frames = 0;
            }
        }
    }
}

struct MonoCallback(Capture);
struct StereoCallback(Capture);

impl AudioInputCallback for MonoCallback {
    type FrameType = (f32, Mono);
    fn on_audio_ready(
        &mut self,
        _stream: &mut dyn AudioInputStreamSafe,
        frames: &[f32],
    ) -> DataCallbackResult {
        self.0.process(frames);
        DataCallbackResult::Continue
    }
    fn on_error_after_close(&mut self, _stream: &mut dyn AudioInputStreamSafe, error: oboe::Error) {
        // Unplugging the interface ends the stream. The UI's device list is
        // refreshed by the device poll; the log says why the input went quiet.
        eprintln!("[yames][android] input stream closed by the system: {error:?}");
    }
}

impl AudioInputCallback for StereoCallback {
    type FrameType = (f32, Stereo);
    fn on_audio_ready(
        &mut self,
        _stream: &mut dyn AudioInputStreamSafe,
        frames: &[(f32, f32)],
    ) -> DataCallbackResult {
        // SAFETY: `(f32, f32)` is two 4-byte floats with no padding, so the
        // slice is the same memory as an interleaved `[f32]` of twice the
        // length — the cast `android_audio.rs` makes for output.
        let flat = unsafe { std::slice::from_raw_parts(frames.as_ptr().cast::<f32>(), frames.len() * 2) };
        self.0.process(flat);
        DataCallbackResult::Continue
    }
    fn on_error_after_close(&mut self, _stream: &mut dyn AudioInputStreamSafe, error: oboe::Error) {
        eprintln!("[yames][android] input stream closed by the system: {error:?}");
    }
}

fn builder(
    device_id: Option<i32>,
    preset: InputPreset,
    rate: Option<u32>,
) -> AudioStreamBuilder<Input, oboe::Unspecified, oboe::Unspecified> {
    let mut b = AudioStreamBuilder::default()
        .set_input()
        .set_performance_mode(PerformanceMode::LowLatency)
        // Exclusive is what MMAP needs; AAudio downgrades rather than refuses.
        .set_sharing_mode(SharingMode::Exclusive)
        .set_input_preset(preset);
    if let Some(r) = rate {
        b = b.set_sample_rate(r as i32);
    }
    match device_id {
        Some(id) => b.set_device_id(id),
        None => b,
    }
}

/// What the capture thread reports once its stream is open (or is not).
type Opened = Result<u32, String>;

impl AudioInput {
    /// `start()` on a phone. Same contract: stop what was running, open the
    /// chosen device (or let the system route when `device_name` is `None`),
    /// feed the shared ring, and run the spectrum loop on the capture thread
    /// until `stop()`.
    pub(super) fn start_android(
        &mut self,
        device_name: Option<&str>,
        input_channel: usize,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let devices = input_devices();
        let chosen = match device_name {
            Some(name) => Some(
                devices
                    .iter()
                    .find(|d| d.name == name)
                    .cloned()
                    .ok_or_else(|| format!("Audio device '{name}' not found"))?,
            ),
            None => None,
        };
        let stereo = chosen.as_ref().map(|d| d.channels >= 2 && input_channel >= 1).unwrap_or(false);
        let ch = if stereo { 1 } else { 0 };

        // The session-audio dump and the level snapshots, as on a desktop.
        // The rate is not known until the stream opens, so the dump (debug
        // builds only, env-gated) is created on the capture thread.
        *self.last_session_audio_path.lock().unwrap() = None;
        *self.session_recorder.lock().unwrap() = None;
        self.audio_levels.lock().unwrap().clear();
        self.input_frames.store(0, Ordering::SeqCst);
        self.ring_drops.store(0, Ordering::SeqCst);

        self.stream_generation.fetch_add(1, Ordering::SeqCst);
        let my_gen = self.stream_generation.load(Ordering::SeqCst);

        let alive = self.alive.clone();
        alive.store(true, Ordering::SeqCst);
        let ring = self.ring.clone();
        let ring_drops = self.ring_drops.clone();
        let sample_rate_slot = self.sample_rate.clone();
        let take_ring_slot = self.take_ring.clone();
        let take_on = self.take_recording.clone();
        let frames_seen = self.input_frames.clone();
        let is_recording = self.is_recording.clone();
        let recording_buf = self.recording_buf.clone();
        let recording_max = self.recording_max.clone();
        let stream_gen = self.stream_generation.clone();
        let gain = self.input_gain.clone();
        let session_rec = self.session_recorder.clone();
        let levels_out = self.audio_levels.clone();
        let device_id = chosen.as_ref().map(|d| d.id);
        let label = chosen.as_ref().map(|d| d.name.clone()).unwrap_or_else(|| "system default".into());

        let (tx, rx) = mpsc::sync_channel::<Opened>(1);
        let thread_label = label.clone();
        self.capture_thread = Some(thread::spawn(move || {
            // Open on this thread: the stream lives and dies here, like the
            // desktop's cpal stream.
            let mut last_err = String::new();
            for preset in [InputPreset::Unprocessed, InputPreset::VoiceRecognition] {
                // Probe the rate with a blocking stream first: the ring, the
                // take ring and the callback's level clock are sized from it,
                // and all three must exist before the first callback.
                let probe = if stereo {
                    builder(device_id, preset, None).set_f32().set_stereo().open_stream().map(|mut s| {
                        let r = s.get_sample_rate();
                        let _ = s.close();
                        r
                    })
                } else {
                    builder(device_id, preset, None).set_f32().set_mono().open_stream().map(|mut s| {
                        let r = s.get_sample_rate();
                        let _ = s.close();
                        r
                    })
                };
                let sr = match probe {
                    Ok(r) if r > 0 => r as u32,
                    Ok(_) => {
                        last_err = "the input device reported no sample rate".into();
                        continue;
                    }
                    Err(e) => {
                        last_err = format!("{e:?}");
                        continue;
                    }
                };

                *sample_rate_slot.lock().unwrap() = sr;
                *ring.lock().unwrap() = RingBuffer::new(sr as usize * 4);
                let take_ring = Arc::new(TakeRing::new(sr as usize * 4));
                *take_ring_slot.lock().unwrap() = Some(take_ring.clone());
                if crate::session_audio::is_enabled() {
                    use tauri::Manager;
                    if let Ok(dir) = app_handle.path().app_data_dir() {
                        let dir = dir.join(crate::session_log::SESSION_LOGS_DIR);
                        if let Ok(rec) = SessionAudioRecorder::create(&dir, sr) {
                            *session_rec.lock().unwrap() = Some(rec);
                        }
                    }
                }

                let capture = Capture {
                    ch,
                    channels: if stereo { 2 } else { 1 },
                    scratch: Vec::with_capacity(SCRATCH_FRAMES),
                    gain: gain.clone(),
                    ring: ring.clone(),
                    ring_drops: ring_drops.clone(),
                    take_ring,
                    take_on: take_on.clone(),
                    frames_seen: frames_seen.clone(),
                    is_recording: is_recording.clone(),
                    recording_buf: recording_buf.clone(),
                    recording_max: recording_max.clone(),
                    stream_gen: stream_gen.clone(),
                    my_gen,
                    session_rec: session_rec.clone(),
                    levels_out: levels_out.clone(),
                    start: Instant::now(),
                    sample_rate: sr,
                    peak: 0.0,
                    sum_abs: 0.0,
                    level_frames: 0,
                };

                macro_rules! run {
                    ($b:expr) => {{
                        let mut stream = match $b.open_stream()
                        {
                            Ok(s) => s,
                            Err(e) => {
                                last_err = format!("{e:?}");
                                continue;
                            }
                        };
                        if let Err(e) = stream.start() {
                            last_err = format!("{e:?}");
                            continue;
                        }
                        eprintln!(
                            "[yames][android] oboe input: {} — {} Hz, {} ch, asked LowLatency/Exclusive/{:?}, \
                             got {:?}/{:?}/{:?}, burst {} frames, api {:?}",
                            thread_label,
                            stream.get_sample_rate(),
                            if stereo { 2 } else { 1 },
                            preset,
                            stream.get_performance_mode(),
                            stream.get_sharing_mode(),
                            stream.get_input_preset(),
                            stream.get_frames_per_burst(),
                            stream.get_audio_api(),
                        );
                        let _ = tx.send(Ok(sr));
                        AudioInput::spectrum_loop(&alive, &ring, sr, &app_handle);
                        let _ = stream.stop();
                        let _ = stream.close();
                        return;
                    }};
                }
                if stereo {
                    run!(builder(device_id, preset, Some(sr)).set_f32().set_stereo().set_callback(StereoCallback(capture)));
                } else {
                    run!(builder(device_id, preset, Some(sr)).set_f32().set_mono().set_callback(MonoCallback(capture)));
                }
            }
            alive.store(false, Ordering::SeqCst);
            let _ = tx.send(Err(last_err));
        }));

        // Wait for the open, so a refused microphone permission or a device
        // that went away is an error the UI can show rather than a silent
        // input. Opening takes tens of milliseconds; five seconds is a hang.
        match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(_sr)) => Ok(()),
            Ok(Err(e)) => {
                if let Some(h) = self.capture_thread.take() {
                    let _ = h.join();
                }
                Err(format!(
                    "could not open the input ({label}): {e}. If Yames is not allowed to use the \
                     microphone, allow it in Android's settings for the app."
                ))
            }
            Err(_) => Err(format!("the input ({label}) did not open in time")),
        }
    }
}
