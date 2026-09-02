use crate::state::SharedState;
use crate::timing::{BeatLog, BeatTick};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rodio::Source;
use std::io::Cursor;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ---------------------------------------------------------------------------
// CoreAudio output latency query (macOS)
// ---------------------------------------------------------------------------

/// Find a CoreAudio device ID by name.
#[cfg(target_os = "macos")]
fn find_coreaudio_device_by_name(target_name: &str) -> Option<u32> {
    use coreaudio_sys::*;
    use std::mem;
    use std::ptr;

    unsafe {
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut size: u32 = 0;
        let status = AudioObjectGetPropertyDataSize(
            kAudioObjectSystemObject,
            &prop,
            0,
            ptr::null(),
            &mut size,
        );
        if status != 0 {
            return None;
        }

        let count = size as usize / mem::size_of::<AudioDeviceID>();
        let mut device_ids = vec![0 as AudioDeviceID; count];
        let status = AudioObjectGetPropertyData(
            kAudioObjectSystemObject,
            &prop,
            0,
            ptr::null(),
            &mut size,
            device_ids.as_mut_ptr() as *mut _,
        );
        if status != 0 {
            return None;
        }

        for &did in &device_ids {
            let name_prop = AudioObjectPropertyAddress {
                mSelector: kAudioObjectPropertyName,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain,
            };
            let mut cf_name: core_foundation_sys::string::CFStringRef = ptr::null();
            let mut name_size = mem::size_of::<core_foundation_sys::string::CFStringRef>() as u32;
            let status = AudioObjectGetPropertyData(
                did,
                &name_prop,
                0,
                ptr::null(),
                &mut name_size,
                &mut cf_name as *mut _ as *mut _,
            );
            if status != 0 || cf_name.is_null() {
                continue;
            }

            let len = core_foundation_sys::string::CFStringGetLength(cf_name);
            let mut buf = vec![0u8; (len * 4) as usize + 1];
            let ok = core_foundation_sys::string::CFStringGetCString(
                cf_name,
                buf.as_mut_ptr() as *mut _,
                buf.len() as isize,
                core_foundation_sys::string::kCFStringEncodingUTF8,
            );
            core_foundation_sys::base::CFRelease(cf_name as *const _);
            if ok == 0 {
                continue;
            }

            let rust_name = std::ffi::CStr::from_ptr(buf.as_ptr() as *const _).to_string_lossy();
            if rust_name == target_name {
                return Some(did);
            }
        }
    }
    None
}

/// Query the total output latency of an audio device in frames.
/// If `device_name` is provided, finds that device; otherwise queries the default.
/// Returns device_latency + safety_offset + stream_latency.
#[cfg(target_os = "macos")]
fn query_coreaudio_output_latency_frames(device_name: Option<&str>) -> Option<u32> {
    use coreaudio_sys::*;
    use std::mem;
    use std::ptr;

    unsafe {
        let mut size: u32;

        let device_id = if let Some(name) = device_name {
            find_coreaudio_device_by_name(name)?
        } else {
            // Get the default output device
            let property_address = AudioObjectPropertyAddress {
                mSelector: kAudioHardwarePropertyDefaultOutputDevice,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain,
            };
            let mut did: AudioDeviceID = kAudioObjectUnknown;
            size = mem::size_of::<AudioDeviceID>() as u32;
            let status = AudioObjectGetPropertyData(
                kAudioObjectSystemObject,
                &property_address,
                0,
                ptr::null(),
                &mut size,
                &mut did as *mut _ as *mut _,
            );
            if status != 0 || did == kAudioObjectUnknown {
                return None;
            }
            did
        };

        let mut total_frames: u32 = 0;

        // 2. Device latency (kAudioDevicePropertyLatency)
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioDevicePropertyLatency,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut latency: u32 = 0;
        size = mem::size_of::<u32>() as u32;
        let status = AudioObjectGetPropertyData(
            device_id,
            &prop,
            0,
            ptr::null(),
            &mut size,
            &mut latency as *mut _ as *mut _,
        );
        if status == 0 {
            total_frames += latency;
        }

        // 3. Safety offset (kAudioDevicePropertySafetyOffset)
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioDevicePropertySafetyOffset,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut safety: u32 = 0;
        size = mem::size_of::<u32>() as u32;
        let status = AudioObjectGetPropertyData(
            device_id,
            &prop,
            0,
            ptr::null(),
            &mut size,
            &mut safety as *mut _ as *mut _,
        );
        if status == 0 {
            total_frames += safety;
        }

        // 4. Stream latency (kAudioStreamPropertyLatency on the first output stream)
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioDevicePropertyStreams,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut stream_size: u32 = 0;
        let status =
            AudioObjectGetPropertyDataSize(device_id, &prop, 0, ptr::null(), &mut stream_size);
        if status == 0 && stream_size >= mem::size_of::<AudioStreamID>() as u32 {
            let count = stream_size as usize / mem::size_of::<AudioStreamID>();
            let mut streams = vec![0 as AudioStreamID; count];
            let status = AudioObjectGetPropertyData(
                device_id,
                &prop,
                0,
                ptr::null(),
                &mut stream_size,
                streams.as_mut_ptr() as *mut _,
            );
            if status == 0 && !streams.is_empty() {
                let stream_prop = AudioObjectPropertyAddress {
                    mSelector: kAudioStreamPropertyLatency,
                    mScope: kAudioObjectPropertyScopeGlobal,
                    mElement: kAudioObjectPropertyElementMain,
                };
                let mut stream_latency: u32 = 0;
                size = mem::size_of::<u32>() as u32;
                let status = AudioObjectGetPropertyData(
                    streams[0],
                    &stream_prop,
                    0,
                    ptr::null(),
                    &mut size,
                    &mut stream_latency as *mut _ as *mut _,
                );
                if status == 0 {
                    total_frames += stream_latency;
                }
            }
        }

        Some(total_frames)
    }
}

#[cfg(not(target_os = "macos"))]
fn query_coreaudio_output_latency_frames(_device_name: Option<&str>) -> Option<u32> {
    None
}

// Embedded click sounds -- 4 kits
const CLICK_HIGH: &[u8] = include_bytes!("../sounds/click_high.wav");
const CLICK_LOW: &[u8] = include_bytes!("../sounds/click_low.wav");
const WOOD_HIGH: &[u8] = include_bytes!("../sounds/wood_high.wav");
const WOOD_LOW: &[u8] = include_bytes!("../sounds/wood_low.wav");
const BEEP_HIGH: &[u8] = include_bytes!("../sounds/beep_high.wav");
const BEEP_LOW: &[u8] = include_bytes!("../sounds/beep_low.wav");
const DRUM_HIGH: &[u8] = include_bytes!("../sounds/drum_high.wav");
const DRUM_LOW: &[u8] = include_bytes!("../sounds/drum_low.wav");
const DRUM_METAL: &[u8] = include_bytes!("../sounds/drum_metal.wav");
const DRUM_CRASH: &[u8] = include_bytes!("../sounds/drum_crash.wav");
const CHIME_UP: &[u8] = include_bytes!("../sounds/chime_up.wav");
const CHIME_DOWN: &[u8] = include_bytes!("../sounds/chime_down.wav");

// ---------------------------------------------------------------------------
// Sound decoding
// ---------------------------------------------------------------------------

/// Decode an embedded WAV to mono f32 samples resampled to `target_sr`.
fn decode_wav(wav_bytes: &'static [u8], target_sr: u32) -> Vec<f32> {
    let cursor = Cursor::new(wav_bytes);
    let decoder = rodio::Decoder::new(cursor).expect("Failed to decode embedded WAV");
    let source_sr = decoder.sample_rate();
    let source_ch = decoder.channels() as usize;
    let raw: Vec<f32> = decoder.convert_samples::<f32>().collect();

    // Down-mix to mono
    let mono: Vec<f32> = if source_ch >= 2 {
        raw.chunks(source_ch)
            .map(|frame| frame.iter().sum::<f32>() / source_ch as f32)
            .collect()
    } else {
        raw
    };

    if source_sr == target_sr {
        return mono;
    }

    // Linear-interpolation resample
    let ratio = target_sr as f64 / source_sr as f64;
    let out_len = (mono.len() as f64 * ratio).ceil() as usize;
    (0..out_len)
        .map(|i| {
            let pos = i as f64 / ratio;
            let idx = pos.floor() as usize;
            let frac = (pos - idx as f64) as f32;
            let s0 = mono.get(idx).copied().unwrap_or(0.0);
            let s1 = mono.get(idx + 1).copied().unwrap_or(s0);
            s0 + (s1 - s0) * frac
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Sound bank — all sounds pre-decoded at the output sample rate
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum SoundId {
    ClickHigh,
    ClickLow,
    WoodHigh,
    WoodLow,
    BeepHigh,
    BeepLow,
    DrumLow,
    DrumAccent,
    ChimeUp,
    ChimeDown,
}

struct SoundBank {
    click_high: Vec<f32>,
    click_low: Vec<f32>,
    wood_high: Vec<f32>,
    wood_low: Vec<f32>,
    beep_high: Vec<f32>,
    beep_low: Vec<f32>,
    drum_low: Vec<f32>,
    drum_accent: Vec<f32>, // pre-mixed kick + metal hat + crash
    chime_up: Vec<f32>,
    chime_down: Vec<f32>,
}

impl SoundBank {
    fn new(sr: u32) -> Self {
        let drum_high = decode_wav(DRUM_HIGH, sr);
        let drum_metal = decode_wav(DRUM_METAL, sr);
        let drum_crash = decode_wav(DRUM_CRASH, sr);

        // Pre-mix drum accent composite
        let max_len = drum_high.len().max(drum_metal.len()).max(drum_crash.len());
        let mut drum_accent = vec![0.0f32; max_len];
        for (i, s) in drum_high.iter().enumerate() {
            drum_accent[i] += s;
        }
        for (i, s) in drum_metal.iter().enumerate() {
            drum_accent[i] += s * 0.55;
        }
        for (i, s) in drum_crash.iter().enumerate() {
            drum_accent[i] += s * 0.35;
        }

        Self {
            click_high: decode_wav(CLICK_HIGH, sr),
            click_low: decode_wav(CLICK_LOW, sr),
            wood_high: decode_wav(WOOD_HIGH, sr),
            wood_low: decode_wav(WOOD_LOW, sr),
            beep_high: decode_wav(BEEP_HIGH, sr),
            beep_low: decode_wav(BEEP_LOW, sr),
            drum_low: decode_wav(DRUM_LOW, sr),
            drum_accent,
            chime_up: decode_wav(CHIME_UP, sr),
            chime_down: decode_wav(CHIME_DOWN, sr),
        }
    }

    fn get(&self, id: SoundId) -> &[f32] {
        match id {
            SoundId::ClickHigh => &self.click_high,
            SoundId::ClickLow => &self.click_low,
            SoundId::WoodHigh => &self.wood_high,
            SoundId::WoodLow => &self.wood_low,
            SoundId::BeepHigh => &self.beep_high,
            SoundId::BeepLow => &self.beep_low,
            SoundId::DrumLow => &self.drum_low,
            SoundId::DrumAccent => &self.drum_accent,
            SoundId::ChimeUp => &self.chime_up,
            SoundId::ChimeDown => &self.chime_down,
        }
    }
}

// ---------------------------------------------------------------------------
// Sound kit mapping
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum SoundKit {
    Click,
    Wood,
    Beep,
    Drum,
}

impl SoundKit {
    fn from_str(s: &str) -> Self {
        match s {
            "wood" => Self::Wood,
            "beep" => Self::Beep,
            "drum" => Self::Drum,
            _ => Self::Click,
        }
    }
    fn high_id(self) -> SoundId {
        match self {
            Self::Click => SoundId::ClickHigh,
            Self::Wood => SoundId::WoodHigh,
            Self::Beep => SoundId::BeepHigh,
            Self::Drum => SoundId::DrumAccent,
        }
    }
    fn low_id(self) -> SoundId {
        match self {
            Self::Click => SoundId::ClickLow,
            Self::Wood => SoundId::WoodLow,
            Self::Beep => SoundId::BeepLow,
            Self::Drum => SoundId::DrumLow,
        }
    }
}

// ---------------------------------------------------------------------------
// Voice — an active sound playing in the audio callback
// ---------------------------------------------------------------------------

struct Voice {
    sound_id: SoundId,
    position: usize,
    amplitude: f32,
    max_samples: usize, // 0 = no cap (play full buffer)
}

// ---------------------------------------------------------------------------
// Cached parameters (snapshot from SharedState, read once per buffer)
// ---------------------------------------------------------------------------

struct CachedParams {
    bpm: u16,
    subdivision: u8,
    volume: f32,
    kit: SoundKit,
    beat_groups: Vec<u8>,
    beat_groups_changed: bool,
    ramp_active: bool,
    ramp_beats_per_bar: u8,
    ramp_warming_up: bool,
    warmup_count: u8,
    warmup_beats: u8,
    free_mode: bool,
}

/// Should this tick be played as an accent (the "high" sound)?
///
/// Pure so it can be unit-tested without an audio device.
///
/// FREE mode is checked **first**: it means "N equal beats, no accent
/// structure", and that has to hold everywhere — including while the drill's
/// speed ramp is active, which otherwise imposes its own
/// `ramp_beats_per_bar` bar accent (N1 on PR #11).
fn accent_for(
    free_mode: bool,
    ramp_active: bool,
    ramp_beats_per_bar: u8,
    beat_groups: &[u8],
    is_downbeat: bool,
    beat_count: u32,
    measure_beat: u32,
) -> bool {
    if free_mode {
        return false;
    }
    if ramp_active {
        let bpb = if ramp_beats_per_bar >= 2 {
            ramp_beats_per_bar as u32
        } else {
            4
        };
        return is_downbeat && (beat_count % bpb) == 0;
    }
    let accent_set = compute_group_accents(beat_groups);
    is_downbeat && accent_set.contains(&measure_beat)
}

fn compute_group_accents(groups: &[u8]) -> HashSet<u32> {
    let mut set = HashSet::new();
    let mut cursor = 0u32;
    for &g in groups {
        set.insert(cursor);
        cursor += g as u32;
    }
    set
}

// ---------------------------------------------------------------------------
// Beat notification — audio callback -> event thread
// ---------------------------------------------------------------------------

struct BeatNotification {
    session: u64,
    beat: u32,
    measure_beat: u32, // bar-local position (0..beats_per_measure), resets on group change
    subdivision: u32,
    /// Path B — user-configured subdivision count (1, 2, 3, 4, 6).
    /// Mirrored to BeatTick so the matcher's rhythm-inference can map
    /// each tick to its phase within the beat.
    subdivision_total: u8,
    is_downbeat: bool,
    ts_ns: u64,
    expected_interval_ms: f64,
    is_warmup_beat: bool,
    is_warmup_transition: bool, // last warmup beat = first real beat (beat 0)
    bar_just_completed: bool,
    delay_us: u64, // output latency — how long to wait before emitting visual event
}

// ---------------------------------------------------------------------------
// Speed ramp logic
// ---------------------------------------------------------------------------

/// Payload emitted after adaptive mode has ALREADY moved the tempo.
///
/// T07 — the engine decides, the model only narrates. `decision` and
/// `new_bpm` describe the move the engine just made; the frontend
/// comments on it and must never change it.
///
/// `current_bpm` is the tempo the evaluated round was played at (i.e.
/// *before* this step); `new_bpm` is the tempo the drill continues at.
#[derive(Debug, Clone, serde::Serialize)]
pub struct AdaptiveEvalRequest {
    #[serde(rename = "currentBpm")]
    pub current_bpm: u16,
    #[serde(rename = "newBpm")]
    pub new_bpm: u16,
    #[serde(rename = "startBpm")]
    pub start_bpm: u16,
    #[serde(rename = "targetBpm")]
    pub target_bpm: u16,
    #[serde(rename = "accuracyPct")]
    pub accuracy_pct: u32,
    pub aggressiveness: String,
    #[serde(rename = "currentStep")]
    pub current_step: u16,
    /// "up" | "hold" | "down" — the move the engine already applied.
    pub decision: String,
}

/// Direction the adaptive drill takes for `score`, given the
/// thresholds from [`adaptive_thresholds`]. Pure so the boundary
/// behaviour is unit-testable: `>= up` goes up, `<= down` goes down,
/// everything between holds.
fn adaptive_direction(score: u32, up_thresh: u32, down_thresh: u32) -> &'static str {
    if score >= up_thresh {
        "up"
    } else if score <= down_thresh {
        "down"
    } else {
        "hold"
    }
}

/// Returns (up_threshold, down_threshold, step_up_bpm, step_down_bpm) for adaptive mode.
fn adaptive_thresholds(
    aggressiveness: &str,
    increment: u16,
    decrement: u16,
) -> (u32, u32, u16, u16) {
    match aggressiveness {
        "conservative" => (80, 40, increment.max(2).min(3), decrement.max(2).min(3)),
        "aggressive" => (60, 25, increment.max(5).min(10), decrement.max(3).min(5)),
        _ /* moderate */ => (70, 35, increment.max(3).min(5), decrement.max(2).min(4)),
    }
}

/// Advance the speed ramp by one step. Returns (new_bpm, new_direction, is_done).
fn advance_ramp(
    current_bpm: u16,
    direction: &str,
    start_bpm: u16,
    target_bpm: u16,
    increment: u16,
    decrement: u16,
    mode: &str,
    cyclic: bool,
) -> (u16, String, bool) {
    match mode {
        "zigzag" => {
            if direction == "up" {
                let new_bpm = current_bpm.saturating_add(increment).min(300);
                if new_bpm >= target_bpm {
                    (target_bpm, "up".to_string(), true)
                } else {
                    (new_bpm, "down".to_string(), false)
                }
            } else {
                let new_bpm = current_bpm.saturating_sub(decrement).max(start_bpm);
                (new_bpm, "up".to_string(), false)
            }
        }
        _ => {
            if direction == "up" {
                let new_bpm = current_bpm.saturating_add(increment).min(300);
                if new_bpm >= target_bpm {
                    if cyclic {
                        (target_bpm, "down".to_string(), false)
                    } else {
                        (target_bpm, "up".to_string(), true)
                    }
                } else {
                    (new_bpm, "up".to_string(), false)
                }
            } else {
                let new_bpm = current_bpm.saturating_sub(increment).max(20);
                if new_bpm <= start_bpm {
                    (start_bpm, "up".to_string(), false)
                } else {
                    (new_bpm, "down".to_string(), false)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// BeatEvent — emitted to the frontend
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct BeatEvent {
    pub beat: u32,
    #[serde(rename = "measureBeat")]
    pub measure_beat: u32,
    pub subdivision: u32,
    #[serde(rename = "isDownbeat")]
    pub is_downbeat: bool,
}

// ---------------------------------------------------------------------------
// Audio output device listing
// ---------------------------------------------------------------------------

/// Bluetooth device name patterns (case-insensitive matching).
const BLUETOOTH_PATTERNS: &[&str] = &[
    "airpods",
    "bluetooth",
    "beats",
    "bose",
    "jabra",
    "jbl",
    "sony wh-",
    "sony wf-",
    "sennheiser momentum",
    "galaxy buds",
    "pixel buds",
    "powerbeats",
    "marshall",
    "skullcandy",
    "anker",
    "soundcore",
    "marshall major",
    "marshall minor",
    "tozo",
    "nothing ear",
];

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioOutputDevice {
    pub name: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    #[serde(rename = "isBluetooth")]
    pub is_bluetooth: bool,
}

/// List all available audio output devices.
pub fn list_output_devices() -> Vec<AudioOutputDevice> {
    let host = cpal::default_host();
    let default_name = host
        .default_output_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    let mut devices = Vec::new();
    if let Ok(output_devices) = host.output_devices() {
        for device in output_devices {
            if let Ok(name) = device.name() {
                let lower = name.to_lowercase();
                let is_bluetooth = BLUETOOTH_PATTERNS.iter().any(|p| lower.contains(p))
                    || is_bluetooth_transport(&name);
                devices.push(AudioOutputDevice {
                    is_default: name == default_name,
                    is_bluetooth,
                    name,
                });
            }
        }
    }
    devices
}

/// Get the number of audio output devices cheaply via CoreAudio (no cpal, no stream interference).
#[cfg(target_os = "macos")]
fn poll_device_count() -> usize {
    use coreaudio_sys::*;
    use std::mem;
    unsafe {
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut size: u32 = 0;
        let status = AudioObjectGetPropertyDataSize(
            kAudioObjectSystemObject,
            &prop,
            0,
            std::ptr::null(),
            &mut size,
        );
        if status != 0 {
            return 0;
        }
        (size as usize) / mem::size_of::<AudioDeviceID>()
    }
}

#[cfg(not(target_os = "macos"))]
fn poll_device_count() -> usize {
    let host = cpal::default_host();
    host.output_devices().map(|d| d.count()).unwrap_or(0)
}

/// Start a background thread that polls for audio device changes
/// and emits "audio-devices-changed" / "audio-input-devices-changed" when the list changes.
/// Uses a lightweight name-only check; only does the full enumeration
/// (with BT detection) when the device list actually changes.
pub fn start_audio_device_polling(app_handle: AppHandle) {
    thread::spawn(move || {
        let mut last_count = poll_device_count();
        loop {
            thread::sleep(Duration::from_secs(5));
            let current_count = poll_device_count();
            if current_count != last_count {
                // Device count changed — do the full enumeration with BT detection
                // (only hits cpal when devices actually change, not every poll)
                let devices = list_output_devices();
                let _ = app_handle.emit("audio-devices-changed", &devices);
                let input_devices = crate::audio_input::AudioInput::list_devices();
                let _ = app_handle.emit("audio-input-devices-changed", &input_devices);
                last_count = current_count;
            }
        }
    });
}

/// Check if a device uses Bluetooth transport via CoreAudio properties.
#[cfg(target_os = "macos")]
fn is_bluetooth_transport(device_name: &str) -> bool {
    use coreaudio_sys::*;
    use std::mem;
    use std::ptr;

    unsafe {
        // Find the device by name and check its transport type
        let prop = AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };
        let mut size: u32 = 0;
        let status = AudioObjectGetPropertyDataSize(
            kAudioObjectSystemObject,
            &prop,
            0,
            ptr::null(),
            &mut size,
        );
        if status != 0 {
            return false;
        }

        let count = size as usize / mem::size_of::<AudioDeviceID>();
        let mut device_ids = vec![0 as AudioDeviceID; count];
        let status = AudioObjectGetPropertyData(
            kAudioObjectSystemObject,
            &prop,
            0,
            ptr::null(),
            &mut size,
            device_ids.as_mut_ptr() as *mut _,
        );
        if status != 0 {
            return false;
        }

        for &did in &device_ids {
            // Get device name
            let name_prop = AudioObjectPropertyAddress {
                mSelector: kAudioObjectPropertyName,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain,
            };
            let mut cf_name: core_foundation_sys::string::CFStringRef = ptr::null();
            let mut name_size = mem::size_of::<core_foundation_sys::string::CFStringRef>() as u32;
            let status = AudioObjectGetPropertyData(
                did,
                &name_prop,
                0,
                ptr::null(),
                &mut name_size,
                &mut cf_name as *mut _ as *mut _,
            );
            if status != 0 || cf_name.is_null() {
                continue;
            }

            // Convert CFString to Rust string
            let len = core_foundation_sys::string::CFStringGetLength(cf_name);
            let mut buf = vec![0u8; (len * 4) as usize + 1];
            let ok = core_foundation_sys::string::CFStringGetCString(
                cf_name,
                buf.as_mut_ptr() as *mut _,
                buf.len() as isize,
                core_foundation_sys::string::kCFStringEncodingUTF8,
            );
            core_foundation_sys::base::CFRelease(cf_name as *const _);
            if ok == 0 {
                continue;
            }
            let rust_name = std::ffi::CStr::from_ptr(buf.as_ptr() as *const _)
                .to_string_lossy()
                .to_string();

            if rust_name != device_name {
                continue;
            }

            // Check transport type
            let transport_prop = AudioObjectPropertyAddress {
                mSelector: kAudioDevicePropertyTransportType,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain,
            };
            let mut transport: u32 = 0;
            let mut t_size = mem::size_of::<u32>() as u32;
            let status = AudioObjectGetPropertyData(
                did,
                &transport_prop,
                0,
                ptr::null(),
                &mut t_size,
                &mut transport as *mut _ as *mut _,
            );
            if status == 0 && transport == kAudioDeviceTransportTypeBluetooth {
                return true;
            }
            // Also check for BluetoothLE
            if status == 0 && transport == kAudioDeviceTransportTypeBluetoothLE {
                return true;
            }
            break;
        }
    }
    false
}

#[cfg(not(target_os = "macos"))]
fn is_bluetooth_transport(_device_name: &str) -> bool {
    false
}

// ---------------------------------------------------------------------------
// MetronomeEngine — cpal-direct, sample-accurate timing
// ---------------------------------------------------------------------------

pub struct MetronomeEngine {
    alive: Arc<AtomicBool>,
    playing: Arc<AtomicBool>,
    thread_handle: Option<thread::JoinHandle<()>>,
    beat_log: BeatLog,
    device_name: Option<String>,
    /// Shared adaptive accuracy score (0-100), updated by timing analyzer callback
    adaptive_score: Arc<AtomicU32>,
}

impl MetronomeEngine {
    pub fn new(beat_log: BeatLog) -> Self {
        Self {
            alive: Arc::new(AtomicBool::new(false)),
            playing: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
            beat_log,
            device_name: None,
            adaptive_score: Arc::new(AtomicU32::new(0)),
        }
    }

    /// Set the output device. If the engine is running, it will be restarted.
    pub fn set_device(&mut self, name: Option<String>, state: SharedState, app_handle: AppHandle) {
        eprintln!("[yames] Setting audio output device: {:?}", name);
        let was_playing = self.playing.load(Ordering::SeqCst);
        self.device_name = name;
        // Fully tear down the old thread/stream
        self.shutdown();
        // Create fresh atomics so the old cpal callback (if still lingering
        // in CoreAudio) can never be reactivated by a shared flag.
        self.alive = Arc::new(AtomicBool::new(false));
        self.playing = Arc::new(AtomicBool::new(false));
        // Brief pause to let CoreAudio fully release the old device
        thread::sleep(Duration::from_millis(100));
        // Restart on the new device
        self.ensure_thread(state, app_handle);
        if was_playing {
            self.playing.store(true, Ordering::SeqCst);
        }
    }

    /// Set the device name without restarting (for startup/restore).
    pub fn set_device_name(&mut self, name: Option<String>) {
        self.device_name = name;
    }

    /// Get the current output device name.
    pub fn device_name(&self) -> Option<&str> {
        self.device_name.as_deref()
    }

    /// Get a clone of the adaptive score Arc for external updates.
    pub fn adaptive_score(&self) -> Arc<AtomicU32> {
        self.adaptive_score.clone()
    }

    /// Ensure the audio thread is running (opens audio device once).
    fn ensure_thread(&mut self, state: SharedState, app_handle: AppHandle) {
        if self.alive.load(Ordering::SeqCst) {
            return;
        }

        self.alive.store(true, Ordering::SeqCst);
        let alive = self.alive.clone();
        let playing = self.playing.clone();
        let beat_log = self.beat_log.clone();
        let device_name = self.device_name.clone();
        let adaptive_score = self.adaptive_score.clone();

        let handle = thread::spawn(move || {
            // ---- cpal setup ----
            let host = cpal::default_host();
            let device = if let Some(ref name) = device_name {
                // Log available devices for debugging
                if let Ok(devs) = host.output_devices() {
                    let names: Vec<String> = devs.filter_map(|d| d.name().ok()).collect();
                    eprintln!("[yames] Available output devices: {:?}", names);
                    eprintln!("[yames] Looking for: {:?}", name);
                }
                // Try to find the requested device by name
                host.output_devices()
                    .ok()
                    .and_then(|mut devs| {
                        devs.find(|d| d.name().ok().as_deref() == Some(name.as_str()))
                    })
                    .or_else(|| {
                        eprintln!(
                            "[yames] Device '{}' not found, falling back to default",
                            name
                        );
                        host.default_output_device()
                    })
            } else {
                host.default_output_device()
            };
            let device = match device {
                Some(d) => {
                    eprintln!(
                        "[yames] Using audio output device: {:?}",
                        d.name().unwrap_or_default()
                    );
                    d
                }
                None => {
                    eprintln!("No audio output device found");
                    return;
                }
            };
            let supported = match device.default_output_config() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("Failed to get default output config: {}", e);
                    return;
                }
            };

            let sample_rate = supported.sample_rate().0;
            let channels = supported.channels() as usize;
            let config: cpal::StreamConfig = supported.into();

            // Pre-decode all sounds at the output sample rate
            let sounds = SoundBank::new(sample_rate);

            // Callback -> event thread channel
            let (tx, rx) = mpsc::channel::<BeatNotification>();

            // Event thread -> callback: pending chime sound
            let pending_chime: Arc<Mutex<Option<SoundId>>> = Arc::new(Mutex::new(None));
            let pending_chime_cb = pending_chime.clone();

            let playing_cb = playing.clone();
            let state_cb = state.clone();
            let sr = sample_rate;

            // Query CoreAudio for the real output latency (device + safety + stream).
            // This auto-adapts to the user's selected device.
            let device_latency_frames =
                query_coreaudio_output_latency_frames(device_name.as_deref()).unwrap_or(0);
            let device_latency_us = (device_latency_frames as u64 * 1_000_000) / sr as u64;
            eprintln!(
                "[yames] CoreAudio output latency: {} frames ({:.1}ms) + buffer",
                device_latency_frames,
                device_latency_frames as f64 / sr as f64 * 1000.0
            );
            let device_latency_us_cb = device_latency_us;

            // ---- Callback-local mutable state ----
            let mut voices: Vec<Voice> = Vec::with_capacity(32);
            let mut sample_counter: u64 = 0;
            let mut next_beat_sample: u64 = 0;
            let mut beat_count: u32 = 0;
            let mut sub_count: u32 = 0;
            let mut measure_beat: u32 = 0;
            let mut was_playing = false;
            let mut session: u64 = 0;
            let mut cached = CachedParams {
                bpm: 120,
                subdivision: 1,
                volume: 0.8,
                kit: SoundKit::Click,
                beat_groups: vec![4],
                beat_groups_changed: false,
                ramp_active: false,
                ramp_beats_per_bar: 4,
                ramp_warming_up: false,
                warmup_count: 0,
                warmup_beats: 4,
                free_mode: false,
            };

            // ---- Build output stream ----
            let stream = device.build_output_stream(
                &config,
                move |data: &mut [f32], _info: &cpal::OutputCallbackInfo| {
                    let frames = data.len() / channels;

                    // Output latency compensation.
                    // CoreAudio device/safety/stream latency + one buffer of
                    // buffering (the buffer we're currently writing into hasn't
                    // reached the DAC yet).
                    let buffer_us = (frames as u64 * 1_000_000) / sr as u64;
                    let output_latency_us = buffer_us + device_latency_us_cb;

                    let is_playing = playing_cb.load(Ordering::Relaxed);

                    // Snapshot params from shared state (non-blocking)
                    if let Ok(s) = state_cb.try_lock() {
                        let eff_bpm = if s.speed_ramp.active {
                            s.speed_ramp.current_bpm
                        } else {
                            s.bpm
                        };
                        cached.bpm = eff_bpm;
                        cached.subdivision = if s.speed_ramp.active {
                            1
                        } else {
                            s.subdivision
                        };
                        cached.volume = s.volume;
                        cached.kit = SoundKit::from_str(&s.sound_type);
                        let new_groups = s.beat_groups.clone();
                        if new_groups != cached.beat_groups {
                            cached.beat_groups = new_groups;
                            cached.beat_groups_changed = true;
                        }
                        cached.ramp_active = s.speed_ramp.active;
                        cached.ramp_beats_per_bar = s.speed_ramp.beats_per_bar;
                        let warming = s.speed_ramp.active
                            && s.speed_ramp.warmup_count < s.speed_ramp.warmup_beats;
                        cached.ramp_warming_up = warming;
                        cached.warmup_count = s.speed_ramp.warmup_count;
                        cached.warmup_beats = s.speed_ramp.warmup_beats;
                        cached.free_mode = s.free_mode;
                    }

                    // ---- Not playing: silence ----
                    if !is_playing {
                        for s in data.iter_mut() {
                            *s = 0.0;
                        }
                        if was_playing {
                            voices.clear();
                            was_playing = false;
                        }
                        sample_counter = 0;
                        next_beat_sample = 0;
                        beat_count = 0;
                        sub_count = 0;
                        measure_beat = 0;
                        return;
                    }

                    // ---- Just started playing ----
                    if !was_playing {
                        was_playing = true;
                        session += 1;
                        sample_counter = 0;
                        next_beat_sample = 0;
                        beat_count = 0;
                        sub_count = 0;
                        measure_beat = 0;
                        voices.clear();
                    }

                    // ---- Check for pending chime from event thread ----
                    if let Ok(mut chime) = pending_chime_cb.try_lock() {
                        if let Some(chime_id) = chime.take() {
                            voices.push(Voice {
                                sound_id: chime_id,
                                position: 0,
                                amplitude: 0.4 * cached.volume,
                                max_samples: 0,
                            });
                        }
                    }

                    // ---- Timing ----
                    let subdivision = cached.subdivision as u32;
                    let beat_duration_secs = 60.0 / cached.bpm as f64;
                    let tick_duration_secs = beat_duration_secs / subdivision as f64;
                    let tick_samples = (tick_duration_secs * sr as f64) as u64;
                    let cap_samples = (tick_samples as f64 * 0.9) as usize;

                    // ---- Per-frame processing ----
                    for frame_idx in 0..frames {
                        // Beat boundary
                        if sample_counter >= next_beat_sample {
                            // If beat_groups changed mid-play, reset bar BEFORE
                            // is_downbeat is computed so this tick IS the new beat 0.
                            if cached.beat_groups_changed {
                                measure_beat = 0;
                                sub_count = 0; // force current tick to be a downbeat
                                cached.beat_groups_changed = false;
                            }

                            let is_downbeat = sub_count == 0;

                            // Warmup transition detection
                            let is_warmup_beat = cached.ramp_warming_up && is_downbeat;
                            let is_last_warmup =
                                is_warmup_beat && cached.warmup_count + 1 >= cached.warmup_beats;
                            let mut is_warmup_transition = false;

                            if is_last_warmup {
                                // Last warmup beat becomes beat 0 of real playback
                                beat_count = 0;
                                sub_count = 0;
                                measure_beat = 0;
                                is_warmup_transition = true;
                            }

                            // Determine accent
                            let use_accent = accent_for(
                                cached.free_mode,
                                cached.ramp_active,
                                cached.ramp_beats_per_bar,
                                &cached.beat_groups,
                                is_downbeat,
                                beat_count,
                                measure_beat,
                            );

                            // Spawn voice for this beat
                            if use_accent && !cached.ramp_warming_up {
                                // Accent: full ring-out, no duration cap
                                voices.push(Voice {
                                    sound_id: cached.kit.high_id(),
                                    position: 0,
                                    amplitude: cached.volume,
                                    max_samples: 0,
                                });
                            } else {
                                // Regular / warmup / subdivision
                                let (sid, amp) = if cached.ramp_warming_up && !is_last_warmup {
                                    (SoundId::BeepHigh, 0.6)
                                } else if is_downbeat {
                                    (cached.kit.low_id(), 0.75)
                                } else {
                                    (cached.kit.low_id(), 0.35)
                                };
                                voices.push(Voice {
                                    sound_id: sid,
                                    position: 0,
                                    amplitude: amp * cached.volume,
                                    max_samples: cap_samples,
                                });
                            }

                            // Capture current beat/sub for notification
                            // Compute delay: output latency + position within buffer
                            let frame_delay_us = (frame_idx as u64 * 1_000_000) / sr as u64;
                            let total_delay_us = output_latency_us + frame_delay_us;
                            let ts_ns = crate::clock::now_ns() + total_delay_us * 1000; // adjusted to play time
                            let notif_beat = beat_count;
                            let notif_sub = sub_count;
                            let notif_measure_beat = measure_beat; // capture BEFORE counter advance

                            // Advance counters
                            let mut bar_complete = false;
                            sub_count += 1;
                            if sub_count >= subdivision {
                                sub_count = 0;
                                beat_count += 1;
                                measure_beat += 1;
                                let beats_per_measure = if cached.ramp_active {
                                    let b = cached.ramp_beats_per_bar;
                                    if b >= 2 {
                                        b as u32
                                    } else {
                                        4
                                    }
                                } else {
                                    let total: u32 =
                                        cached.beat_groups.iter().map(|&g| g as u32).sum();
                                    if total >= 1 { total } else { 4 }
                                };
                                if measure_beat >= beats_per_measure {
                                    measure_beat = 0;
                                    bar_complete = true;
                                }
                            }

                            let _ = tx.send(BeatNotification {
                                session,
                                beat: notif_beat,
                                measure_beat: notif_measure_beat,
                                subdivision: notif_sub,
                                subdivision_total: subdivision.clamp(1, 255) as u8,
                                is_downbeat,
                                ts_ns,
                                expected_interval_ms: beat_duration_secs * 1000.0,
                                is_warmup_beat,
                                is_warmup_transition,
                                bar_just_completed: bar_complete,
                                delay_us: total_delay_us,
                            });

                            next_beat_sample = sample_counter + tick_samples;
                        }

                        // Mix all active voices
                        let mut mix = 0.0f32;
                        for voice in voices.iter_mut() {
                            let buf = sounds.get(voice.sound_id);
                            let limit = if voice.max_samples > 0 {
                                voice.max_samples.min(buf.len())
                            } else {
                                buf.len()
                            };
                            if voice.position < limit {
                                mix += buf[voice.position] * voice.amplitude;
                            }
                            voice.position += 1;
                        }

                        // Write to all output channels (mono -> duplicated)
                        let clamped = mix.clamp(-1.0, 1.0);
                        for ch in 0..channels {
                            data[frame_idx * channels + ch] = clamped;
                        }

                        sample_counter += 1;
                    }

                    // Remove finished voices (once per buffer)
                    voices.retain(|v| {
                        let buf = sounds.get(v.sound_id);
                        let limit = if v.max_samples > 0 {
                            v.max_samples.min(buf.len())
                        } else {
                            buf.len()
                        };
                        v.position < limit
                    });
                },
                |err| {
                    eprintln!("Audio stream error: {}", err);
                },
                None,
            );

            let stream = match stream {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Failed to build audio output stream: {}", e);
                    return;
                }
            };

            if let Err(e) = stream.play() {
                eprintln!("Failed to start audio stream: {}", e);
                return;
            }

            // ---- Event loop (also keeps the cpal Stream alive) ----
            let mut pending_ramp_advance = false;
            let mut current_session: u64 = 0;

            while alive.load(Ordering::SeqCst) {
                let notif = match rx.recv_timeout(Duration::from_millis(50)) {
                    Ok(n) => n,
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        // Drain stale notifications when not playing
                        if !playing.load(Ordering::Relaxed) {
                            while rx.try_recv().is_ok() {}
                        }
                        continue;
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                };

                if !alive.load(Ordering::SeqCst) {
                    break;
                }

                // Session tracking — ignore stale notifications from previous
                // play sessions
                if notif.session < current_session {
                    continue;
                }
                if notif.session > current_session {
                    current_session = notif.session;
                    pending_ramp_advance = false;
                }

                // ---- Warmup beats (not the transition) ----
                if notif.is_warmup_beat && !notif.is_warmup_transition {
                    let mut s = state.lock().unwrap();
                    s.speed_ramp.warmup_count += 1;
                    let sc = s.clone();
                    drop(s);
                    let _ = app_handle.emit("state-changed", &sc);
                    continue;
                }

                // ---- Warmup transition (last warmup beat = beat 0) ----
                if notif.is_warmup_transition {
                    let mut s = state.lock().unwrap();
                    s.speed_ramp.warmup_count += 1;
                    let sc = s.clone();
                    drop(s);
                    let _ = app_handle.emit("state-changed", &sc);
                    pending_ramp_advance = false;
                    // Fall through to emit beat event for beat 0
                }

                // ---- Emit beat event ----
                // Sleep for the output latency so the visual fires when the
                // audio actually reaches the speakers, not when the callback
                // writes samples into the buffer.
                thread::sleep(Duration::from_micros(notif.delay_us));
                let _ = app_handle.emit(
                    "beat",
                    &BeatEvent {
                        beat: notif.beat,
                        measure_beat: notif.measure_beat,
                        subdivision: notif.subdivision,
                        is_downbeat: notif.is_downbeat,
                    },
                );

                // ---- Log BeatTick (Path B — every tick, not just downbeats) ----
                //
                // Pre-Path-B this gate emitted only `is_downbeat` ticks,
                // which meant the matcher only ever saw quarter notes —
                // even when the user had selected 8ths / 16ths and was
                // playing on them. Every off-beat onset then counted as
                // spurious (see session 1779004784: 80 BPM 16ths, 303
                // spurious onsets, score crashed to 28/100). Path B
                // pushes every tick AND tags it with `subdivision_index`
                // / `subdivision_total` so the matcher's
                // `RhythmInference` can pick the actual grid the user
                // is playing and score against THAT.
                if let Ok(mut log) = beat_log.lock() {
                    log.push_back(BeatTick {
                        ts_ns: notif.ts_ns,
                        beat_index: notif.beat,
                        is_downbeat: notif.is_downbeat,
                        expected_interval_ms: notif.expected_interval_ms,
                        subdivision_index: notif.subdivision.min(255) as u8,
                        subdivision_total: notif.subdivision_total.max(1),
                    });
                    // 64 quarters worth of ticks = up to 64 × 6 = 384
                    // entries at the highest configured subdivision.
                    // Bump the cap so a brief stall in the matcher
                    // loop doesn't lose subdivision-tick coverage.
                    while log.len() > 384 {
                        log.pop_front();
                    }
                }

                // ---- Ramp advance (process pending BEFORE checking bar completion) ----
                if notif.is_downbeat && pending_ramp_advance {
                    pending_ramp_advance = false;
                    let should_advance = {
                        let s = state.lock().unwrap();
                        s.speed_ramp.active && !s.speed_ramp.completed
                    };
                    if should_advance {
                        let mut s = state.lock().unwrap();
                        s.speed_ramp.bars_in_step += 1;

                        if s.speed_ramp.bars_in_step >= s.speed_ramp.bars_per_step {
                            s.speed_ramp.bars_in_step = 0;

                            if s.speed_ramp.mode == "adaptive" {
                                let score = adaptive_score.load(Ordering::Relaxed);
                                let (up_thresh, down_thresh, step_up, step_down) =
                                    adaptive_thresholds(
                                        &s.speed_ramp.aggressiveness,
                                        s.speed_ramp.increment,
                                        s.speed_ramp.decrement,
                                    );

                                // T07 — the direction is ALWAYS the engine's
                                // own threshold decision. The coach model
                                // used to be able to override this via an
                                // atomic; it can now only comment on the
                                // move after the fact.
                                let direction = adaptive_direction(score, up_thresh, down_thresh);

                                let prev_bpm = s.speed_ramp.current_bpm;
                                let target = s.speed_ramp.target_bpm;
                                let no_ceiling = target >= 300;
                                let mut completed = false;

                                if direction == "up" {
                                    let new_bpm =
                                        s.speed_ramp.current_bpm.saturating_add(step_up).min(300);
                                    if !no_ceiling && new_bpm >= target {
                                        s.speed_ramp.current_bpm = target;
                                        s.speed_ramp.completed = true;
                                        s.speed_ramp.active = false;
                                        s.is_playing = false;
                                        completed = true;
                                    } else {
                                        s.speed_ramp.current_bpm = new_bpm;
                                        s.speed_ramp.current_step += 1;
                                    }
                                    if let Ok(mut c) = pending_chime.lock() {
                                        *c = Some(SoundId::ChimeUp);
                                    }
                                } else if direction == "down" && prev_bpm > s.speed_ramp.start_bpm {
                                    let new_bpm = s
                                        .speed_ramp
                                        .current_bpm
                                        .saturating_sub(step_down)
                                        .max(s.speed_ramp.start_bpm);
                                    s.speed_ramp.current_bpm = new_bpm;
                                    s.speed_ramp.current_step += 1;
                                    if new_bpm < prev_bpm {
                                        if let Ok(mut c) = pending_chime.lock() {
                                            *c = Some(SoundId::ChimeDown);
                                        }
                                    }
                                }
                                // else: hold — no BPM change

                                // Emit events
                                let rc = s.speed_ramp.clone();
                                // Report the EFFECTIVE move, not the raw
                                // threshold direction: "down" at the start
                                // BPM (or "up" already clamped at 300)
                                // leaves the tempo where it was, and the
                                // coach must not narrate a step that never
                                // happened.
                                let new_bpm = s.speed_ramp.current_bpm;
                                let effective = if new_bpm > prev_bpm {
                                    "up"
                                } else if new_bpm < prev_bpm {
                                    "down"
                                } else {
                                    "hold"
                                };
                                let eval_req = AdaptiveEvalRequest {
                                    current_bpm: prev_bpm,
                                    new_bpm,
                                    start_bpm: s.speed_ramp.start_bpm,
                                    target_bpm: s.speed_ramp.target_bpm,
                                    accuracy_pct: score,
                                    aggressiveness: s.speed_ramp.aggressiveness.clone(),
                                    current_step: s.speed_ramp.current_step,
                                    decision: effective.to_string(),
                                };
                                let sc = s.clone();
                                drop(s);
                                if completed {
                                    playing.store(false, Ordering::SeqCst);
                                }
                                let _ = app_handle.emit("ramp-step", &rc);
                                let _ = app_handle.emit("state-changed", &sc);
                                // Ask the model for the next decision (non-blocking)
                                if !completed {
                                    let _ = app_handle.emit("adaptive-eval", &eval_req);
                                }
                            } else {
                                let prev_bpm = s.speed_ramp.current_bpm;
                                let (new_bpm, new_dir, done) = advance_ramp(
                                    s.speed_ramp.current_bpm,
                                    &s.speed_ramp.direction,
                                    s.speed_ramp.start_bpm,
                                    s.speed_ramp.target_bpm,
                                    s.speed_ramp.increment,
                                    s.speed_ramp.decrement,
                                    &s.speed_ramp.mode,
                                    s.speed_ramp.cyclic,
                                );

                                if done && new_bpm == s.speed_ramp.current_bpm {
                                    // Already at target — truly done
                                    s.speed_ramp.completed = true;
                                    s.speed_ramp.active = false;
                                    s.is_playing = false;
                                    let sc = s.clone();
                                    let rc = s.speed_ramp.clone();
                                    drop(s);
                                    playing.store(false, Ordering::SeqCst);
                                    let _ = app_handle.emit("ramp-step", &rc);
                                    let _ = app_handle.emit("state-changed", &sc);
                                } else {
                                    // Advance step (even if done — play target step first)
                                    s.speed_ramp.current_step += 1;
                                    s.speed_ramp.current_bpm = new_bpm;
                                    s.speed_ramp.direction = new_dir;
                                    let rc = s.speed_ramp.clone();
                                    let sc = s.clone();
                                    drop(s);

                                    // Queue directional chime
                                    let chime = if new_bpm < prev_bpm {
                                        SoundId::ChimeDown
                                    } else {
                                        SoundId::ChimeUp
                                    };
                                    if let Ok(mut c) = pending_chime.lock() {
                                        *c = Some(chime);
                                    }

                                    let _ = app_handle.emit("ramp-step", &rc);
                                    let _ = app_handle.emit("state-changed", &sc);
                                }
                            }
                        } else {
                            let sc = s.clone();
                            drop(s);
                            let _ = app_handle.emit("state-changed", &sc);
                        }
                    }
                }

                // Mark bar completion for deferred advance on the next bar's first beat
                if notif.bar_just_completed {
                    pending_ramp_advance = true;
                }
            }

            // Stream is dropped here, stopping audio
            drop(stream);
        });

        self.thread_handle = Some(handle);
    }

    pub fn start(&mut self, state: SharedState, app_handle: AppHandle) {
        self.ensure_thread(state, app_handle);
        self.playing.store(true, Ordering::SeqCst);
    }

    pub fn stop(&mut self) {
        self.playing.store(false, Ordering::SeqCst);
    }

    /// Fully stop playback and tear down the audio thread.
    pub fn shutdown(&mut self) {
        self.playing.store(false, Ordering::SeqCst);
        self.alive.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }

    pub fn is_running(&self) -> bool {
        self.playing.load(Ordering::SeqCst)
    }
}

impl Drop for MetronomeEngine {
    fn drop(&mut self) {
        self.playing.store(false, Ordering::SeqCst);
        self.alive.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adaptive_thresholds_conservative_clamps_steps() {
        let (up, down, step_up, step_down) = adaptive_thresholds("conservative", 1, 1);
        assert_eq!(up, 80);
        assert_eq!(down, 40);
        assert!(step_up >= 2 && step_up <= 3);
        assert!(step_down >= 2 && step_down <= 3);
    }

    #[test]
    fn adaptive_thresholds_aggressive_has_lower_bar() {
        let (up_aggr, down_aggr, _, _) = adaptive_thresholds("aggressive", 5, 3);
        let (up_cons, down_cons, _, _) = adaptive_thresholds("conservative", 5, 3);
        // Aggressive promotes earlier than conservative
        assert!(up_aggr < up_cons);
        assert!(down_aggr < down_cons);
    }

    #[test]
    fn adaptive_thresholds_moderate_is_default() {
        let (up_mod, _, _, _) = adaptive_thresholds("moderate", 5, 3);
        let (up_unknown, _, _, _) = adaptive_thresholds("not-a-mode", 5, 3);
        assert_eq!(
            up_mod, up_unknown,
            "unknown mode should fall through to moderate"
        );
    }

    /// T07 — every aggressiveness value returns sane, ordered
    /// thresholds and steps. Guards the table itself: the drill's whole
    /// behaviour hangs off these six numbers now that no model decision
    /// can override them.
    #[test]
    fn adaptive_thresholds_all_modes_are_well_formed() {
        for mode in ["conservative", "moderate", "aggressive", "not-a-mode"] {
            let (up, down, step_up, step_down) = adaptive_thresholds(mode, 5, 3);
            assert!(
                up > down,
                "{mode}: up threshold {up} must sit above down threshold {down}"
            );
            assert!(up <= 100, "{mode}: up threshold {up} must be reachable");
            assert!(step_up >= 1, "{mode}: step up must move the tempo");
            assert!(step_down >= 1, "{mode}: step down must move the tempo");
        }
        // Step clamping is per-mode: a huge configured increment is
        // capped, a tiny one is floored.
        let (_, _, big_up, _) = adaptive_thresholds("aggressive", 99, 99);
        assert_eq!(big_up, 10, "aggressive caps the step up at 10 BPM");
        let (_, _, small_up, _) = adaptive_thresholds("moderate", 1, 1);
        assert_eq!(small_up, 3, "moderate floors the step up at 3 BPM");
    }

    /// T07 — boundary scores. `>= up` goes up, `<= down` goes down,
    /// strictly between holds. The thresholds are inclusive on both
    /// ends, so the exact boundary score must move the tempo.
    #[test]
    fn adaptive_direction_boundary_scores() {
        for mode in ["conservative", "moderate", "aggressive"] {
            let (up, down, _, _) = adaptive_thresholds(mode, 5, 3);
            assert_eq!(adaptive_direction(up, up, down), "up", "{mode}: at up");
            assert_eq!(
                adaptive_direction(up - 1, up, down),
                "hold",
                "{mode}: just below up"
            );
            assert_eq!(
                adaptive_direction(down, up, down),
                "down",
                "{mode}: at down"
            );
            assert_eq!(
                adaptive_direction(down + 1, up, down),
                "hold",
                "{mode}: just above down"
            );
            assert_eq!(adaptive_direction(100, up, down), "up", "{mode}: perfect");
            assert_eq!(adaptive_direction(0, up, down), "down", "{mode}: zero");
        }
    }

    #[test]
    fn advance_ramp_linear_up_increments_until_target() {
        // start=80, target=100, increment=5, mode=linear, going up
        let (bpm, dir, done) = advance_ramp(80, "up", 80, 100, 5, 3, "linear", false);
        assert_eq!(bpm, 85);
        assert_eq!(dir, "up");
        assert!(!done);
    }

    #[test]
    fn advance_ramp_linear_reaches_target_and_marks_done() {
        // Last step lands on target with non-cyclic
        let (bpm, _, done) = advance_ramp(98, "up", 80, 100, 5, 3, "linear", false);
        assert_eq!(bpm, 100, "Should clamp at target");
        assert!(done, "Non-cyclic ramp should be done when reaching target");
    }

    #[test]
    fn advance_ramp_cyclic_flips_direction_at_target() {
        let (bpm, dir, done) = advance_ramp(98, "up", 80, 100, 5, 3, "linear", true);
        assert_eq!(bpm, 100);
        assert_eq!(dir, "down");
        assert!(!done, "Cyclic ramps never finish at target");
    }

    #[test]
    fn advance_ramp_zigzag_oscillates() {
        // Zigzag: up by increment, then down by decrement, alternating
        let (bpm1, dir1, done1) = advance_ramp(100, "up", 80, 200, 10, 5, "zigzag", false);
        assert_eq!(bpm1, 110);
        assert_eq!(dir1, "down", "Zigzag flips direction every step");
        assert!(!done1);

        let (bpm2, dir2, _) = advance_ramp(110, "down", 80, 200, 10, 5, "zigzag", false);
        assert_eq!(bpm2, 105);
        assert_eq!(dir2, "up");
    }

    #[test]
    fn advance_ramp_zigzag_caps_at_target() {
        let (bpm, _, done) = advance_ramp(198, "up", 80, 200, 10, 5, "zigzag", false);
        assert_eq!(bpm, 200);
        assert!(done);
    }

    #[test]
    fn advance_ramp_clamps_at_300_bpm() {
        let (bpm, _, _) = advance_ramp(298, "up", 80, 350, 10, 5, "linear", false);
        assert_eq!(bpm, 300, "BPM should be hard-clamped at 300");
    }

    #[test]
    fn advance_ramp_down_floors_at_20_bpm() {
        let (bpm, _, _) = advance_ramp(22, "down", 10, 100, 5, 3, "linear", false);
        assert_eq!(bpm, 20, "BPM should floor at 20");
    }

    // -----------------------------------------------------------------
    // FREE mode — accent decision (PR #11, F8 / N1)
    // -----------------------------------------------------------------

    #[test]
    fn free_mode_never_accents_any_beat() {
        // 16 beats is the FREE-mode maximum; walk every one of them, on and
        // off the quarter-note grid, at every group shape the state could
        // carry. Nothing may come back accented.
        for groups in [vec![16], vec![4], vec![3, 2, 2]] {
            for beat in 0..16u32 {
                for is_downbeat in [true, false] {
                    assert!(
                        !accent_for(true, false, 4, &groups, is_downbeat, beat, beat),
                        "free mode accented beat {beat} (downbeat={is_downbeat}, groups={groups:?})"
                    );
                }
            }
        }
    }

    #[test]
    fn free_mode_beats_the_speed_ramp_bar_accent() {
        // N1: the ramp imposes its own `ramp_beats_per_bar` accent. FREE mode
        // is checked first, so a drill in FREE mode stays flat.
        for beat in 0..16u32 {
            assert!(
                !accent_for(true, true, 4, &[16], true, beat, beat),
                "free mode accented beat {beat} while the ramp was active"
            );
        }
        // Same inputs with free_mode off: beat 0 of every ramp bar IS accented,
        // proving the assertion above is not vacuous.
        assert!(accent_for(false, true, 4, &[16], true, 0, 0));
        assert!(accent_for(false, true, 4, &[16], true, 4, 4));
        assert!(!accent_for(false, true, 4, &[16], true, 5, 5));
    }

    #[test]
    fn grouped_mode_accents_each_group_downbeat() {
        // Control case: with free mode off and no ramp, 3+2+2 accents
        // bar positions 0, 3 and 5.
        let groups = [3u8, 2, 2];
        for pos in 0..7u32 {
            let expected = matches!(pos, 0 | 3 | 5);
            assert_eq!(
                accent_for(false, false, 4, &groups, true, pos, pos),
                expected,
                "grouped accent wrong at bar position {pos}"
            );
        }
    }

    #[test]
    fn accent_never_fires_off_the_quarter_note_grid() {
        // `is_downbeat == false` means a subdivision tick — never an accent.
        assert!(!accent_for(false, false, 4, &[4], false, 0, 0));
        assert!(!accent_for(false, true, 4, &[4], false, 0, 0));
    }
}
