use crate::onset::SharedTempoContext;
use crate::state::SharedState;
use crate::timing::{BeatLog, BeatTick};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rodio::Source;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
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
    /// Mirror of `SharedState::beat_groups`. Allocated once with
    /// capacity `MAX_BEAT_GROUPS` and only ever refilled in place —
    /// the audio callback must never allocate.
    beat_groups: Vec<u8>,
    /// Bit per bar-local beat position that starts a group (= is
    /// accented). Rebuilt only when `beat_groups` actually changes so
    /// the per-beat accent test is a single bit-and.
    accent_mask: u32,
    /// `beat_groups.iter().sum()`, precomputed alongside `accent_mask`.
    beat_groups_total: u32,
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
///
/// The grouped case takes a precomputed `accent_mask` rather than the
/// `beat_groups` slice: this runs on the audio thread once per beat, and
/// rebuilding a `HashSet` there allocated on every single click. The mask
/// is rebuilt only when the grouping actually changes — see
/// [`accent_mask`] and `CachedParams::accent_mask`.
fn accent_for(
    free_mode: bool,
    ramp_active: bool,
    ramp_beats_per_bar: u8,
    accent_mask: u32,
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
    is_downbeat && mask_has_accent(accent_mask, measure_beat)
}

/// Upper bound on the number of groups (`validate_beat_groups`).
/// Used to pre-size the callback's `beat_groups` mirror.
const MAX_BEAT_GROUPS: usize = 6;

/// Bitmask of the bar-local positions that carry an accent — one bit
/// per beat, bit `n` set when beat `n` opens a group.
///
/// `validate_beat_groups` caps the bar at 16 beats, so every position
/// fits in a `u32` with room to spare; positions past bit 31 (only
/// reachable from unvalidated input) are dropped rather than shifting
/// out of range.
fn accent_mask(groups: &[u8]) -> u32 {
    let mut mask = 0u32;
    let mut cursor = 0u32;
    for &g in groups {
        if cursor >= 32 {
            break;
        }
        mask |= 1u32 << cursor;
        cursor += g as u32;
    }
    mask
}

/// Is the bar-local position `beat` accented under `mask`?
#[inline]
fn mask_has_accent(mask: u32, beat: u32) -> bool {
    beat < 32 && (mask & (1u32 << beat)) != 0
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
    /// Whether this tick is accented (opens a group, or is the first
    /// beat of the ramp's bar). Mirrored to `BeatEvent` so the UI never
    /// has to re-derive accent positions from `beat_groups`.
    is_accent: bool,
    /// Beats per bar the engine used to wrap `measure_beat` for this
    /// tick — ramp `beats_per_bar` while the ramp is active, else the
    /// meter total.
    beats_per_bar: u8,
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
    /// True when the engine accented this tick. The UI reads this
    /// instead of re-deriving group starts from `beatGroups`.
    #[serde(rename = "isAccent")]
    pub is_accent: bool,
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
// Callback timing probe (ROADMAP §4 audio-safety gate)
// ---------------------------------------------------------------------------

/// One cpal output callback, as observed from inside it.
#[derive(Debug, Clone, Copy)]
pub struct CallbackSample {
    /// `clock::now_ns()` read at the very top of the callback.
    pub entry_ns: u64,
    /// Frames this callback was asked to fill.
    pub frames: u32,
    /// Engine sample counter at callback entry — i.e. audio-clock time.
    /// Only advances by frames the device actually consumed, so comparing
    /// it against `entry_ns` exposes buffers that never made it out.
    pub sample_pos: u64,
    /// Metronome ticks (beats *and* subdivisions) rendered in this buffer.
    pub ticks: u32,
}

/// Preallocated, lock-free sink for cpal callback timings.
///
/// Exists so `click-jitter-probe` can measure the real output callback
/// without changing how it behaves. Constraints, in priority order:
///
/// * **The callback must not allocate, lock or block.** Every slot is
///   allocated up front by the probe; writing one is a single `fetch_add`
///   plus three relaxed stores. There is exactly one writer (the audio
///   thread) and readers only run after the stream is torn down.
/// * **The app must not pay for it.** `MetronomeEngine::new` leaves
///   `callback_probe` as `None`, so a shipping build costs one null check
///   per buffer and nothing per beat.
/// * **Overflow must be visible, not silent.** Pushes past `capacity` are
///   dropped, but `written` keeps counting so `overflow()` can report them
///   and the probe can refuse to publish truncated statistics.
pub struct CallbackProbe {
    entry_ns: Box<[AtomicU64]>,
    frames: Box<[AtomicU32]>,
    sample_pos: Box<[AtomicU64]>,
    ticks: Box<[AtomicU32]>,
    /// Total pushes attempted, including any beyond `capacity`.
    written: AtomicUsize,
    /// Output sample rate, published by the engine thread before the stream
    /// is built. 0 until then.
    sample_rate: AtomicU32,
}

impl CallbackProbe {
    /// Allocate room for `capacity` callbacks. The probe sizes this from
    /// the run length and a pessimistic callback rate; see the binary.
    pub fn new(capacity: usize) -> Self {
        let alloc_u64 = || {
            (0..capacity)
                .map(|_| AtomicU64::new(0))
                .collect::<Vec<_>>()
                .into_boxed_slice()
        };
        let alloc_u32 = || {
            (0..capacity)
                .map(|_| AtomicU32::new(0))
                .collect::<Vec<_>>()
                .into_boxed_slice()
        };
        Self {
            entry_ns: alloc_u64(),
            frames: alloc_u32(),
            sample_pos: alloc_u64(),
            ticks: alloc_u32(),
            written: AtomicUsize::new(0),
            sample_rate: AtomicU32::new(0),
        }
    }

    pub fn capacity(&self) -> usize {
        self.entry_ns.len()
    }

    /// Output sample rate the engine opened the device at, or 0 if the
    /// stream never started.
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate.load(Ordering::Acquire)
    }

    /// Callbacks dropped because the preallocated arena filled up.
    pub fn overflow(&self) -> usize {
        self.written
            .load(Ordering::Acquire)
            .saturating_sub(self.capacity())
    }

    /// Read the recorded callbacks. Call only after the stream is stopped —
    /// there is no synchronisation with an in-flight callback beyond the
    /// acquire on `written`.
    pub fn snapshot(&self) -> Vec<CallbackSample> {
        let n = self.written.load(Ordering::Acquire).min(self.capacity());
        (0..n)
            .map(|i| CallbackSample {
                entry_ns: self.entry_ns[i].load(Ordering::Relaxed),
                frames: self.frames[i].load(Ordering::Relaxed),
                sample_pos: self.sample_pos[i].load(Ordering::Relaxed),
                ticks: self.ticks[i].load(Ordering::Relaxed),
            })
            .collect()
    }

    fn set_sample_rate(&self, sr: u32) {
        self.sample_rate.store(sr, Ordering::Release);
    }

    /// Audio-thread hot path. Returns the slot index so the tick counter
    /// can be bumped later in the same buffer, or `None` once full.
    #[inline]
    fn record(&self, entry_ns: u64, frames: u32, sample_pos: u64) -> Option<usize> {
        let i = self.written.fetch_add(1, Ordering::Release);
        if i >= self.capacity() {
            return None;
        }
        self.entry_ns[i].store(entry_ns, Ordering::Relaxed);
        self.frames[i].store(frames, Ordering::Relaxed);
        self.sample_pos[i].store(sample_pos, Ordering::Relaxed);
        self.ticks[i].store(0, Ordering::Relaxed);
        Some(i)
    }

    /// Audio-thread hot path — one tick rendered into slot `i`.
    #[inline]
    fn note_tick(&self, i: usize) {
        self.ticks[i].fetch_add(1, Ordering::Relaxed);
    }
}

/// Where the engine's event loop sends UI events.
///
/// The desktop app passes a real `AppHandle`. `click-jitter-probe` runs the
/// same engine with no Tauri application at all, so the handle is optional
/// and every emit becomes a no-op. The method signature mirrors
/// `Emitter::emit` precisely so the ~11 call sites in the event loop are
/// untouched by the probe's existence.
#[derive(Clone)]
struct EventSink(Option<AppHandle>);

impl EventSink {
    fn emit<S: serde::Serialize + Clone>(
        &self,
        event: &str,
        payload: S,
    ) -> Result<(), tauri::Error> {
        match self.0 {
            Some(ref h) => h.emit(event, payload),
            None => Ok(()),
        }
    }
}

// ---------------------------------------------------------------------------
// Audio thread exit — the engine's only way back to a startable state
// ---------------------------------------------------------------------------

/// How long `start_headless` waits for the audio thread to report whether the
/// output stream actually came up.
///
/// Only the headless path waits. `click-jitter-probe` has no UI and must not
/// start measuring against a stream that never opened, so a synchronous
/// answer is worth a bounded stall there. The app does **not** wait: `start`
/// is reached from synchronous Tauri commands, which Tauri v2 runs on the
/// main thread, so any wait at all is a frozen window — and the first Play
/// after launch is exactly when the wait is longest, because the audio thread
/// still has to enumerate devices, decode the sound bank and open the device.
/// The app does not need the answer anyway: `AudioThreadExit::fail` corrects
/// the transport and emits `audio-error` + `state-changed` on its own, and
/// the UI renders playback from that state rather than from this call.
const AUDIO_SETUP_TIMEOUT: Duration = Duration::from_millis(2000);

/// Whether `ensure_thread` waits for the audio thread's setup verdict.
enum SetupWait {
    /// Return as soon as the thread is spawned. The app path — see
    /// `AUDIO_SETUP_TIMEOUT`.
    No,
    /// Block until the stream is up, the device gives up, or the timeout
    /// expires. Only `start_headless`.
    UpTo(Duration),
}

/// Clears the engine's `alive` / `playing` flags however the audio thread
/// leaves — clean shutdown, no output device, a config the backend refuses,
/// a stream that will not build, or a panic on the thread itself.
///
/// `ensure_thread` raises `alive` *before* it spawns, so that two presses of
/// Play cannot race two audio threads onto one device. That makes the thread
/// the only place `alive` can be lowered again, and it used to be lowered on
/// exactly one path: the clean one. Every failure path just `return`ed, so a
/// single `build_output_stream` error left `alive` stuck true — and from then
/// on `ensure_thread` short-circuited, `start` only flipped `playing`, and the
/// metronome could not be started again for the life of the process, on any
/// tab, with the reason visible nowhere but stderr. That is the regression
/// this type exists to make impossible: the flags come down in `Drop`, so no
/// future early return can forget them.
///
/// The flags are each thread's *own*: `ensure_thread` installs a fresh pair of
/// `Arc`s per spawn, so a thread that is still unwinding can never clear the
/// flags of the thread that replaced it.
struct AudioThreadExit {
    alive: Arc<AtomicBool>,
    playing: Arc<AtomicBool>,
    state: SharedState,
    sink: EventSink,
    /// Cleared alongside the transport when setup fails, so the onset
    /// detector stops gating analysis on a click track that is not playing.
    /// `None` for `click-jitter-probe`, which runs no detector.
    tempo: Option<SharedTempoContext>,
    /// Answers the `start` call that spawned this thread. Taken once —
    /// by `ready`, by `fail`, or by `Drop` if the thread died without
    /// saying anything (a panic), so `start` can never hang on it.
    setup: Option<mpsc::SyncSender<Result<(), String>>>,
}

impl AudioThreadExit {
    fn new(
        alive: Arc<AtomicBool>,
        playing: Arc<AtomicBool>,
        state: SharedState,
        sink: EventSink,
        tempo: Option<SharedTempoContext>,
        setup: mpsc::SyncSender<Result<(), String>>,
    ) -> Self {
        Self {
            alive,
            playing,
            state,
            sink,
            tempo,
            setup: Some(setup),
        }
    }

    /// The stream is up and running; `start` may report success.
    fn ready(&mut self) {
        if let Some(tx) = self.setup.take() {
            let _ = tx.send(Ok(()));
        }
    }

    /// Setup failed. Lowers `alive` *before* answering `start`, so the very
    /// next press of Play spawns a fresh thread and re-tries the device
    /// instead of short-circuiting on a flag this dead thread left behind.
    ///
    /// This is also the only correction the app gets: `start` no longer waits
    /// for a verdict, so every caller has already recorded playback by the
    /// time this runs. Whatever the transport must stop claiming has to be
    /// undone here, and this write is always the last one — the command wrote
    /// its optimistic state before the spawn that led here.
    fn fail(&mut self, reason: String) {
        self.alive.store(false, Ordering::SeqCst);
        self.playing.store(false, Ordering::SeqCst);
        eprintln!("[yames] audio output unavailable: {reason}");
        // The transport must stop claiming to play. Without this the button
        // sits on "Stop" over silence and the user's only clue is a line on
        // stderr they will never see.
        let snapshot = {
            // Never panic inside a path that also runs from `Drop`.
            let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
            s.is_playing = false;
            // A drill cannot be running either — there is no click to run it
            // against — and `start_speed_ramp` raised this before spawning.
            s.speed_ramp.active = false;
            s.clone()
        };
        // D2 — no click track, so the onset detector must not go on matching
        // incoming audio against a beat grid that is not being played.
        if let Some(ref tempo) = self.tempo {
            tempo.set_playing(false);
        }
        let _ = self.sink.emit("audio-error", reason.clone());
        let _ = self.sink.emit("state-changed", &snapshot);
        if let Some(tx) = self.setup.take() {
            let _ = tx.send(Err(reason));
        }
    }
}

impl Drop for AudioThreadExit {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::SeqCst);
        self.playing.store(false, Ordering::SeqCst);
        // Reached only when the thread neither succeeded nor reported a
        // failure — i.e. it panicked. `start` is still blocked on the
        // channel; unblock it rather than make the UI wait out the timeout.
        if let Some(tx) = self.setup.take() {
            let _ = tx.send(Err("audio thread stopped unexpectedly".to_string()));
        }
    }
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
    /// Callback timing sink. `None` in the app — only `click-jitter-probe`
    /// ever sets it (`new_with_probe`), so the shipping build's cpal
    /// callback pays a single `Option` check per buffer and nothing else.
    callback_probe: Option<Arc<CallbackProbe>>,
    /// D2 gate for the onset detector. The audio thread clears it when the
    /// output device will not open, because `start` no longer waits long
    /// enough for the command to learn that and clear it itself. `None` for
    /// `click-jitter-probe`, which runs no detector.
    tempo_ctx: Option<SharedTempoContext>,
    /// Test-only: make the audio thread fail its setup without touching a
    /// real device, so the recovery path above can be exercised on a build
    /// machine that has a perfectly good sound card.
    #[cfg(test)]
    force_setup_failure: bool,
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
            callback_probe: None,
            tempo_ctx: None,
            #[cfg(test)]
            force_setup_failure: false,
        }
    }

    /// Hand the engine the same `TempoContext` the commands mirror into, so
    /// a failed device open can clear the onset detector's playing gate from
    /// the audio thread. Called once, at app setup.
    pub fn set_tempo_context(&mut self, tempo_ctx: SharedTempoContext) {
        self.tempo_ctx = Some(tempo_ctx);
    }

    /// Test-only constructor: the audio thread spawns, refuses to open a
    /// device, and takes the failure path. Used to prove that a failed
    /// setup still leaves the engine startable.
    #[cfg(test)]
    fn new_with_forced_setup_failure(beat_log: BeatLog) -> Self {
        let mut engine = Self::new(beat_log);
        engine.force_setup_failure = true;
        engine
    }

    /// Build an engine whose output callback records its own timings into
    /// `probe`. Used only by `click-jitter-probe` (ROADMAP §4 audio-safety
    /// gate); the app uses `new`, which leaves the sink off.
    pub fn new_with_probe(beat_log: BeatLog, probe: Arc<CallbackProbe>) -> Self {
        // Not `..Self::new(beat_log)`: `MetronomeEngine` implements `Drop`,
        // so functional-update syntax cannot move fields out of it.
        let mut engine = Self::new(beat_log);
        engine.callback_probe = Some(probe);
        engine
    }

    /// Set the output device. If the engine is running, it will be restarted.
    /// The engine is left in a startable state whatever happens, and a device
    /// that will not open reports itself through `AudioThreadExit` — which
    /// also puts the transport back, so a failed switch cannot leave the
    /// button on "Stop" over silence.
    pub fn set_device(
        &mut self,
        name: Option<String>,
        state: SharedState,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        eprintln!("[yames] Setting audio output device: {:?}", name);
        let was_playing = self.playing.load(Ordering::SeqCst);
        self.device_name = name;
        // Fully tear down the old thread/stream
        self.shutdown();
        // Create fresh atomics so the old cpal callback (if still lingering
        // in CoreAudio) can never be reactivated by a shared flag. `playing`
        // carries the old state across *before* the spawn rather than being
        // restored after it: `ensure_thread` no longer waits, so a device
        // that fails instantly would otherwise have its `playing = false`
        // overwritten by a restore running a moment later.
        self.alive = Arc::new(AtomicBool::new(false));
        self.playing = Arc::new(AtomicBool::new(was_playing));
        // Brief pause to let CoreAudio fully release the old device
        thread::sleep(Duration::from_millis(100));
        // Restart on the new device
        self.ensure_thread(state, Some(app_handle), SetupWait::No)
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
    ///
    /// `app_handle` is `None` only for `click-jitter-probe`, which runs the
    /// engine outside a Tauri application; the event loop then emits into
    /// an `EventSink` that discards. Everything else — timing, the beat
    /// log, the ramp state machine — is identical either way.
    /// With `SetupWait::UpTo`, returns `Err` when the audio thread could not
    /// open the output stream. With `SetupWait::No` it returns as soon as the
    /// thread is spawned and the verdict arrives later, out of band, through
    /// `AudioThreadExit`. A thread that is already running is `Ok` either
    /// way — there is nothing to wait for.
    fn ensure_thread(
        &mut self,
        state: SharedState,
        app_handle: Option<AppHandle>,
        wait: SetupWait,
    ) -> Result<(), String> {
        if self.alive.load(Ordering::SeqCst) {
            return Ok(());
        }

        // A *fresh* flag per spawn, not `store(true)` on the shared one. The
        // outgoing thread may still be unwinding — `AudioThreadExit::fail`
        // lowers `alive` before the thread has actually returned, so its
        // `Drop` runs after this call can already have spawned a replacement.
        // Sharing one `Arc` would let that dying thread's `Drop` clear the
        // live thread's flag, ending its event loop and dropping the stream:
        // silence, with `start` having reported success. Same idiom as
        // `set_device`.
        self.alive = Arc::new(AtomicBool::new(true));
        let alive = self.alive.clone();
        let playing = self.playing.clone();
        let beat_log = self.beat_log.clone();
        let device_name = self.device_name.clone();
        let adaptive_score = self.adaptive_score.clone();
        let callback_probe = self.callback_probe.clone();
        let app_handle = EventSink(app_handle);
        #[cfg(test)]
        let force_setup_failure = self.force_setup_failure;
        // Rendezvous for the setup outcome. Bounded at 1 and never waited on
        // by the sender, so the audio thread does not block on it even when
        // the receiver is dropped unread (which is what `SetupWait::No` does).
        let (setup_tx, setup_rx) = mpsc::sync_channel::<Result<(), String>>(1);

        let exit_alive = alive.clone();
        let exit_playing = playing.clone();
        let exit_state = state.clone();
        let exit_sink = app_handle.clone();
        let exit_tempo = self.tempo_ctx.clone();
        let handle = thread::spawn(move || {
            // Lowers `alive` / `playing` however this thread leaves, and
            // answers `start` exactly once. See `AudioThreadExit`.
            let mut exit = AudioThreadExit::new(
                exit_alive,
                exit_playing,
                exit_state,
                exit_sink,
                exit_tempo,
                setup_tx,
            );

            #[cfg(test)]
            if force_setup_failure {
                exit.fail("forced setup failure (test)".to_string());
                return;
            }

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
                    exit.fail("no audio output device found".to_string());
                    return;
                }
            };
            let supported = match device.default_output_config() {
                Ok(c) => c,
                Err(e) => {
                    exit.fail(format!("output device has no usable config: {e}"));
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

            // Audio-safety probe (ROADMAP §4). `None` in the app.
            if let Some(ref p) = callback_probe {
                p.set_sample_rate(sample_rate);
            }
            let probe_cb = callback_probe.clone();

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
            // Pre-size so refilling `beat_groups` in the callback never
            // reallocates (validated input is at most MAX_BEAT_GROUPS).
            let mut initial_groups: Vec<u8> = Vec::with_capacity(MAX_BEAT_GROUPS);
            initial_groups.push(4);
            let mut cached = CachedParams {
                bpm: 120,
                subdivision: 1,
                volume: 0.8,
                kit: SoundKit::Click,
                accent_mask: accent_mask(&initial_groups),
                beat_groups_total: 4,
                beat_groups: initial_groups,
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

                    // Audio-safety probe: timestamp the callback *entry*,
                    // before any work, so callback-to-callback jitter is
                    // measured at the point the OS handed us the buffer.
                    // The value is only committed further down, once we
                    // know this buffer is actually rendering the click —
                    // silent buffers reset `sample_counter`, which would
                    // make the audio-clock delta meaningless. `None` in
                    // the app, where this costs one null check per buffer.
                    let probe_entry_ns = match probe_cb {
                        Some(_) => crate::clock::now_ns(),
                        None => 0,
                    };

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
                        // Compare slices — cloning here would allocate on
                        // every output buffer. Refill in place (capacity
                        // is pre-reserved) and rebuild the accent mask +
                        // bar length only on an actual change.
                        if s.beat_groups.as_slice() != cached.beat_groups.as_slice() {
                            cached.beat_groups.clear();
                            cached.beat_groups.extend_from_slice(&s.beat_groups);
                            cached.accent_mask = accent_mask(&cached.beat_groups);
                            cached.beat_groups_total =
                                cached.beat_groups.iter().map(|&g| g as u32).sum();
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

                    // Audio-safety probe: commit this buffer's entry time,
                    // now that `sample_counter` is the live audio clock.
                    let probe_slot = match probe_cb {
                        Some(ref p) => p.record(probe_entry_ns, frames as u32, sample_counter),
                        None => None,
                    };

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

                            // Bar length the engine wraps `measure_beat`
                            // against — the ramp owns it while active,
                            // otherwise it is the meter total (which in
                            // FREE mode is the single collapsed group).
                            let beats_per_measure: u32 = if cached.ramp_active {
                                if cached.ramp_beats_per_bar >= 2 {
                                    cached.ramp_beats_per_bar as u32
                                } else {
                                    4
                                }
                            } else if cached.beat_groups_total >= 1 {
                                cached.beat_groups_total
                            } else {
                                4
                            };

                            // Determine accent. A handful of integer ops
                            // — no allocation, no set build, per the
                            // "click is sacred" rule.
                            let use_accent = accent_for(
                                cached.free_mode,
                                cached.ramp_active,
                                cached.ramp_beats_per_bar,
                                cached.accent_mask,
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
                                is_accent: use_accent,
                                beats_per_bar: beats_per_measure.clamp(1, 255) as u8,
                                ts_ns,
                                expected_interval_ms: beat_duration_secs * 1000.0,
                                is_warmup_beat,
                                is_warmup_transition,
                                bar_just_completed: bar_complete,
                                delay_us: total_delay_us,
                            });

                            // Audio-safety probe: one audible tick rendered
                            // into this buffer. Counting here (rather than
                            // from the event thread) keeps the count on the
                            // audio clock, which is what "missed beats"
                            // has to be measured against.
                            if let (Some(ref p), Some(slot)) = (&probe_cb, probe_slot) {
                                p.note_tick(slot);
                            }

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
                    // The one observed in the wild: WASAPI answers
                    // AUDCLNT_E_DEVICE_IN_USE (0x8889000A) when the endpoint
                    // is already held exclusively, which on Windows is any
                    // second client on some Realtek configurations.
                    exit.fail(format!("could not open the audio output stream: {e}"));
                    return;
                }
            };

            if let Err(e) = stream.play() {
                exit.fail(format!("could not start the audio output stream: {e}"));
                return;
            }

            // Past this point there is a live stream, so `start` may report
            // success; the guard's `Drop` still lowers the flags when the
            // loop below ends.
            exit.ready();

            // ROADMAP §0.5 — promote the event loop (not the cpal callback,
            // which the backend already runs at TIME_CRITICAL). Failure is
            // non-fatal: the loop just runs at normal priority.
            let _rt_handle = match audio_thread_priority::promote_current_thread_to_real_time(
                0,
                sample_rate,
            ) {
                Ok(h) => Some(h),
                Err(e) => {
                    eprintln!("[yames] event loop stayed at normal priority: {e}");
                    None
                }
            };

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
                        is_accent: notif.is_accent,
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
                        beats_per_bar: notif.beats_per_bar.max(1),
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

        let timeout = match wait {
            // Nothing to wait for. `setup_rx` drops here; the thread's send
            // then fails harmlessly and it reports the outcome to the UI
            // itself through `AudioThreadExit`.
            SetupWait::No => return Ok(()),
            SetupWait::UpTo(d) => d,
        };

        // Wait for the thread to say whether it got a stream. Only the
        // headless path does this: `click-jitter-probe` has no UI to correct
        // afterwards and must not start measuring a stream that never opened.
        match setup_rx.recv_timeout(timeout) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(e),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                Err("audio output device did not respond".to_string())
            }
            // The thread is gone without a word; `AudioThreadExit` has
            // already lowered the flags, so the next Play tries again.
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err("audio thread stopped unexpectedly".to_string())
            }
        }
    }

    /// Start playing. Returns as soon as the audio thread is on its way —
    /// it does **not** wait for the output device, because this is reached
    /// from a synchronous Tauri command and waiting there freezes the window
    /// for exactly as long as the device takes (see `AUDIO_SETUP_TIMEOUT`).
    ///
    /// A device that will not open is not silently swallowed: the audio
    /// thread puts the transport back and emits `audio-error` plus a truthful
    /// `state-changed` from `AudioThreadExit::fail`, which is what the UI
    /// actually renders. `Ok` therefore means "the engine is trying", not
    /// "sound is coming out".
    pub fn start(&mut self, state: SharedState, app_handle: AppHandle) -> Result<(), String> {
        // Before the spawn, not after: the thread can fail and lower this at
        // any moment once `ensure_thread` returns, and a raise running after
        // that correction would put the engine back to claiming playback.
        self.playing.store(true, Ordering::SeqCst);
        self.ensure_thread(state, Some(app_handle), SetupWait::No)
    }

    /// Start the engine with no Tauri application attached — the audio path
    /// and the event loop run exactly as they do in the app, but UI events
    /// go nowhere. Only `click-jitter-probe` uses this.
    ///
    /// Unlike `start` this *does* wait for the setup verdict: there is no UI
    /// to correct after the fact, and the probe must not begin timing a
    /// stream that never opened. `Err` means no sound is coming out.
    pub fn start_headless(&mut self, state: SharedState) -> Result<(), String> {
        self.ensure_thread(state, None, SetupWait::UpTo(AUDIO_SETUP_TIMEOUT))?;
        self.playing.store(true, Ordering::SeqCst);
        Ok(())
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
    use std::collections::HashSet;

    /// Reference implementation the audio callback used to run on every
    /// beat. Kept here only so `accent_mask` can be proved equivalent to
    /// it — the hot path must not build a set.
    fn compute_group_accents(groups: &[u8]) -> HashSet<u32> {
        let mut set = HashSet::new();
        let mut cursor = 0u32;
        for &g in groups {
            set.insert(cursor);
            cursor += g as u32;
        }
        set
    }

    /// Every METER_PRESETS entry plus every METER_VARIANTS entry from
    /// `src/constants/metronome.ts`, and the 2/4 preset added alongside.
    const ALL_METERS: &[&[u8]] = &[
        // METER_PRESETS
        &[4],
        &[3],
        &[2],
        &[3, 2],
        &[3, 3],
        &[3, 2, 2],
        &[3, 2, 3],
        &[3, 3, 3],
        &[3, 3, 3, 3],
        // METER_VARIANTS
        &[2, 3],
        &[2, 2, 3],
        &[2, 3, 2],
        &[3, 3, 2],
        &[2, 3, 3],
        // edges the validator still accepts
        &[1],
        &[16],
        &[1, 1, 1, 1, 1, 1],
        &[8, 8],
    ];

    #[test]
    fn accent_mask_matches_the_set_implementation() {
        for groups in ALL_METERS {
            let set = compute_group_accents(groups);
            let mask = accent_mask(groups);
            let total: u32 = groups.iter().map(|&g| g as u32).sum();
            for beat in 0..total.max(1) {
                assert_eq!(
                    mask_has_accent(mask, beat),
                    set.contains(&beat),
                    "groups {groups:?}, beat {beat}"
                );
            }
        }
    }

    #[test]
    fn accent_mask_marks_exactly_one_bit_per_group() {
        for groups in ALL_METERS {
            assert_eq!(
                accent_mask(groups).count_ones() as usize,
                groups.len(),
                "groups {groups:?}"
            );
        }
        // Beat 0 always accents — it opens the first group.
        assert!(mask_has_accent(accent_mask(&[3, 2, 2]), 0));
        assert!(mask_has_accent(accent_mask(&[3, 2, 2]), 3));
        assert!(mask_has_accent(accent_mask(&[3, 2, 2]), 5));
        assert!(!mask_has_accent(accent_mask(&[3, 2, 2]), 1));
        assert!(!mask_has_accent(accent_mask(&[3, 2, 2]), 6));
    }

    #[test]
    fn accent_mask_is_bounded_for_pathological_input() {
        // Not reachable through `validate_beat_groups`, but the shift
        // must never be UB if it ever were.
        let mask = accent_mask(&[255, 255, 255]);
        assert!(mask_has_accent(mask, 0));
        assert!(!mask_has_accent(mask, 255));
    }

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
                        !accent_for(true, false, 4, accent_mask(&groups), is_downbeat, beat, beat),
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
                !accent_for(true, true, 4, accent_mask(&[16]), true, beat, beat),
                "free mode accented beat {beat} while the ramp was active"
            );
        }
        // Same inputs with free_mode off: beat 0 of every ramp bar IS accented,
        // proving the assertion above is not vacuous.
        assert!(accent_for(false, true, 4, accent_mask(&[16]), true, 0, 0));
        assert!(accent_for(false, true, 4, accent_mask(&[16]), true, 4, 4));
        assert!(!accent_for(false, true, 4, accent_mask(&[16]), true, 5, 5));
    }

    #[test]
    fn grouped_mode_accents_each_group_downbeat() {
        // Control case: with free mode off and no ramp, 3+2+2 accents
        // bar positions 0, 3 and 5.
        let groups = [3u8, 2, 2];
        for pos in 0..7u32 {
            let expected = matches!(pos, 0 | 3 | 5);
            assert_eq!(
                accent_for(false, false, 4, accent_mask(&groups), true, pos, pos),
                expected,
                "grouped accent wrong at bar position {pos}"
            );
        }
    }

    #[test]
    fn accent_never_fires_off_the_quarter_note_grid() {
        // `is_downbeat == false` means a subdivision tick — never an accent.
        assert!(!accent_for(false, false, 4, accent_mask(&[4]), false, 0, 0));
        assert!(!accent_for(false, true, 4, accent_mask(&[4]), false, 0, 0));
    }

    // -----------------------------------------------------------------
    // Audio-thread failure recovery
    //
    // The regression these cover: on 2026-09-03 the metronome stopped
    // starting on the owner's Windows box, on every tab, for the whole
    // life of the process. WASAPI answered `build_output_stream` with
    // AUDCLNT_E_DEVICE_IN_USE (0x8889000A) because the endpoint was
    // already held; the audio thread printed one line to stderr and
    // `return`ed, leaving `alive` — raised by `ensure_thread` before the
    // spawn — stuck true forever. Every later `ensure_thread` then
    // short-circuited, `start` still flipped `playing`, and the UI
    // happily showed "Stop" over silence.
    // -----------------------------------------------------------------

    /// Waits for a condition the audio thread satisfies asynchronously.
    fn eventually(mut cond: impl FnMut() -> bool) -> bool {
        for _ in 0..200 {
            if cond() {
                return true;
            }
            thread::sleep(Duration::from_millis(10));
        }
        false
    }

    #[test]
    fn a_failed_audio_setup_leaves_the_engine_startable_again() {
        let mut engine =
            MetronomeEngine::new_with_forced_setup_failure(crate::timing::create_beat_log());
        let state = crate::state::create_shared_state();

        // First press of Play: the device will not open, and the caller is
        // told so rather than being left to assume it worked.
        let first = engine.start_headless(state.clone());
        assert!(first.is_err(), "a failed setup must not report success");

        // The flag `ensure_thread` raised before spawning has to come back
        // down, or nothing can ever spawn an audio thread again.
        assert!(
            !engine.alive.load(Ordering::SeqCst),
            "`alive` stayed true after a failed setup — the engine is wedged"
        );
        assert!(
            !engine.is_running(),
            "the engine must not claim to be running with no stream"
        );

        // Second press: this must actually spawn and re-try the device.
        // A short-circuit on the stale `alive` would return `Ok` — that is
        // exactly the bug, so a second `Err` is the proof of a retry.
        let second = engine.start_headless(state);
        assert!(
            second.is_err(),
            "the second Play short-circuited instead of re-trying the device"
        );
    }

    #[test]
    fn each_audio_thread_gets_its_own_alive_flag() {
        // `fail` lowers `alive` *before* the audio thread has returned, so
        // that thread's `Drop` can run after `ensure_thread` has already
        // spawned a replacement. If the two shared one flag, the dying
        // thread's `Drop` would end the live thread's event loop and drop
        // its stream: silence, with `start` having reported success. Every
        // spawn must install its own flag.
        let mut engine =
            MetronomeEngine::new_with_forced_setup_failure(crate::timing::create_beat_log());
        let state = crate::state::create_shared_state();

        let _ = engine.start_headless(state.clone());
        let first = engine.alive.clone();
        let _ = engine.start_headless(state);
        let second = engine.alive.clone();

        assert!(
            !Arc::ptr_eq(&first, &second),
            "the replacement audio thread reused the dead thread's `alive` flag"
        );
    }

    #[test]
    fn the_app_path_does_not_wait_for_the_output_device() {
        // What `start` uses. It must answer without waiting for a verdict
        // the audio thread has not produced yet, because on the app path
        // that wait happens on the Tauri main thread and is a frozen window.
        let mut engine =
            MetronomeEngine::new_with_forced_setup_failure(crate::timing::create_beat_log());
        let state = crate::state::create_shared_state();
        state.lock().unwrap().is_playing = true;

        assert!(
            engine
                .ensure_thread(state.clone(), None, SetupWait::No)
                .is_ok(),
            "the non-waiting path must report that the engine is trying"
        );

        // The verdict still arrives — out of band, from the audio thread —
        // so the engine ends up startable and the transport stops lying.
        assert!(
            eventually(|| !engine.alive.load(Ordering::SeqCst)),
            "`alive` never came down, so nothing could ever start again"
        );
        assert!(
            eventually(|| !state.lock().unwrap().is_playing),
            "the transport was left claiming playback with no audio stream"
        );
    }

    #[test]
    fn a_failed_audio_setup_stops_the_transport_claiming_playback() {
        let state = crate::state::create_shared_state();
        {
            let mut s = state.lock().unwrap();
            s.is_playing = true;
            s.speed_ramp.active = true;
        }
        let alive = Arc::new(AtomicBool::new(true));
        let playing = Arc::new(AtomicBool::new(true));
        let tempo: SharedTempoContext = Arc::new(crate::onset::TempoContext::new(120, 1));
        tempo.set_playing(true);
        let (tx, rx) = mpsc::sync_channel::<Result<(), String>>(1);

        {
            let mut exit = AudioThreadExit::new(
                alive.clone(),
                playing.clone(),
                state.clone(),
                EventSink(None),
                Some(tempo.clone()),
                tx,
            );
            exit.fail("could not open the audio output stream: 0x8889000A".to_string());
        }

        assert!(!alive.load(Ordering::SeqCst), "`alive` must come down");
        assert!(!playing.load(Ordering::SeqCst), "`playing` must come down");
        {
            let s = state.lock().unwrap();
            assert!(
                !s.is_playing,
                "the transport must not report playback with no audio stream"
            );
            assert!(
                !s.speed_ramp.active,
                "a drill cannot be running with no audio stream"
            );
        }
        assert!(
            !tempo.is_playing(),
            "the onset detector was left gating on a click track that never started"
        );
        match rx.try_recv() {
            Ok(Err(reason)) => assert!(reason.contains("0x8889000A")),
            other => panic!("`start` was not told why setup failed: {other:?}"),
        }
    }

    #[test]
    fn an_audio_thread_that_dies_without_a_word_still_unblocks_start() {
        // A panic on the audio thread takes the `Drop` path only. `start`
        // must be answered anyway, and the flags must still come down, or
        // one panic would wedge the metronome exactly like a failed setup.
        let state = crate::state::create_shared_state();
        let alive = Arc::new(AtomicBool::new(true));
        let playing = Arc::new(AtomicBool::new(true));
        let (tx, rx) = mpsc::sync_channel::<Result<(), String>>(1);

        drop(AudioThreadExit::new(
            alive.clone(),
            playing.clone(),
            state,
            EventSink(None),
            None,
            tx,
        ));

        assert!(!alive.load(Ordering::SeqCst));
        assert!(!playing.load(Ordering::SeqCst));
        assert!(matches!(rx.try_recv(), Ok(Err(_))));
    }

    #[test]
    fn a_started_stream_reports_success_and_leaves_the_transport_alone() {
        let state = crate::state::create_shared_state();
        state.lock().unwrap().is_playing = true;
        let alive = Arc::new(AtomicBool::new(true));
        let playing = Arc::new(AtomicBool::new(true));
        let tempo: SharedTempoContext = Arc::new(crate::onset::TempoContext::new(120, 1));
        tempo.set_playing(true);
        let (tx, rx) = mpsc::sync_channel::<Result<(), String>>(1);

        let mut exit = AudioThreadExit::new(
            alive.clone(),
            playing.clone(),
            state.clone(),
            EventSink(None),
            Some(tempo.clone()),
            tx,
        );
        exit.ready();

        assert!(matches!(rx.try_recv(), Ok(Ok(()))));
        assert!(
            state.lock().unwrap().is_playing,
            "a working stream must not rewrite the transport"
        );
        assert!(
            tempo.is_playing(),
            "a working stream must not close the onset detector's gate"
        );
        // The flags only come down when the thread actually ends.
        assert!(alive.load(Ordering::SeqCst));
        drop(exit);
        assert!(!alive.load(Ordering::SeqCst));
    }
}
