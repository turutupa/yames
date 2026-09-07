use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use crate::instrument::Instrument;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedRamp {
    #[serde(rename = "startBpm")]
    pub start_bpm: u16,
    #[serde(rename = "targetBpm")]
    pub target_bpm: u16,
    pub increment: u16,
    pub decrement: u16,
    #[serde(rename = "barsPerStep")]
    pub bars_per_step: u8,
    #[serde(rename = "beatsPerBar")]
    pub beats_per_bar: u8,
    pub mode: String, // "linear" | "zigzag" | "adaptive"
    pub cyclic: bool,
    pub aggressiveness: String, // "conservative" | "moderate" | "aggressive"
    // Runtime state
    pub active: bool,
    #[serde(rename = "currentStep")]
    pub current_step: u16,
    #[serde(rename = "currentBpm")]
    pub current_bpm: u16,
    pub direction: String, // "up" | "down"
    #[serde(rename = "barsInStep")]
    pub bars_in_step: u8,
    pub completed: bool,
    #[serde(rename = "warmupBeats")]
    pub warmup_beats: u8,
    #[serde(rename = "warmupCount")]
    pub warmup_count: u8,
}

impl Default for SpeedRamp {
    fn default() -> Self {
        Self {
            start_bpm: 80,
            target_bpm: 120,
            increment: 5,
            decrement: 3,
            bars_per_step: 12,
            beats_per_bar: 4,
            mode: "linear".to_string(),
            cyclic: false,
            aggressiveness: "moderate".to_string(),
            active: false,
            current_step: 0,
            current_bpm: 80,
            direction: "up".to_string(),
            bars_in_step: 0,
            completed: false,
            warmup_beats: 4,
            warmup_count: 0,
        }
    }
}

/// A count-in: N beats of a distinct click before the thing you asked for
/// starts, so you arrive on the downbeat already in tempo.
///
/// This used to live inside `SpeedRamp` and be gated on the ramp being active,
/// which meant only a drill could have one. It is the same behaviour and the
/// same sound — the drill's count-in has not changed at all — but it belongs
/// to the engine now, so a preset chain can ask for one between steps
/// (UI_DECISIONS U9.2, U9.5).
///
/// `beats` of 0 means no count-in is armed, which is the resting state. The
/// drill's own `warmup_beats` remains the drill's *setting*; this is the live
/// counter, and the two are seeded together when a ramp starts.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CountIn {
    /// How many beats to count. 0 when nothing is counting in.
    pub beats: u8,
    /// How many have sounded. The count-in ends when this reaches `beats`.
    pub done: u8,
}

fn default_accent_mode() -> String {
    "groups".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub bpm: u16,
    #[serde(rename = "isPlaying")]
    pub is_playing: bool,
    pub subdivision: u8,
    pub mode: String,
    pub corner: String,
    #[serde(rename = "alwaysOnTop")]
    pub always_on_top: bool,
    #[serde(rename = "widgetAlwaysOnTop")]
    pub widget_always_on_top: bool,
    #[serde(rename = "accentColor")]
    pub accent_color: String,
    pub theme: String,
    pub volume: f32,
    /// The user's intended volume (0.0–1.0), updated only by explicit
    /// user actions (`set_volume`). The TTS dim mechanism temporarily
    /// lowers `volume` for the audio engine but MUST NOT touch this field.
    /// `persist_state` writes this field so a settings-change that fires
    /// while TTS is dimming the click track doesn't bake the dimmed value
    /// into the store. Skipped in serde so it stays Rust-internal and
    /// doesn't surface in the JS `AppState` type.
    #[serde(skip)]
    pub volume_real: f32,
    #[serde(rename = "soundType")]
    pub sound_type: String,
    #[serde(rename = "timeSignature")]
    pub time_signature: u8,
    #[serde(rename = "beatGroups", default = "default_beat_groups")]
    pub beat_groups: Vec<u8>,
    #[serde(rename = "freeMode", default)]
    pub free_mode: bool,
    #[serde(rename = "speedRamp")]
    pub speed_ramp: SpeedRamp,
    /// Which beats the click accents: "groups" (where each beat group opens,
    /// the default), "all" (every beat) or "none". A string rather than an
    /// enum for the same reason `sound_type` is one — it crosses to the
    /// frontend as JSON and is parsed into an enum before it reaches the audio
    /// thread. See `AccentMode` in engine.rs.
    #[serde(rename = "accentMode", default = "default_accent_mode")]
    pub accent_mode: String,

    /// The live count-in. See `CountIn` — it is not the ramp's any more.
    #[serde(rename = "countIn", default)]
    pub count_in: CountIn,

    /// Selected instrument. Drives onset-detection refractory floor,
    /// chord-cluster window, spurious-onset cap, activity silence
    /// threshold, and coach vocabulary. See `instrument.rs` (D0 of the
    /// DSP & Coach plan).
    ///
    /// Defaults to `Other` until the user picks one — the first-launch
    /// modal on the React side is responsible for prompting.
    pub instrument: Instrument,
}

fn default_beat_groups() -> Vec<u8> {
    vec![4]
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            bpm: 120,
            is_playing: false,
            subdivision: 1,
            mode: "comfortable".to_string(),
            corner: "top-right".to_string(),
            always_on_top: true,
            widget_always_on_top: true,
            accent_color: "#e94560".to_string(),
            theme: "mono".to_string(),
            volume: 0.8,
            volume_real: 0.8,
            sound_type: "click".to_string(),
            time_signature: 4,
            beat_groups: vec![4],
            free_mode: false,
            speed_ramp: SpeedRamp::default(),
            accent_mode: default_accent_mode(),
            count_in: CountIn::default(),
            instrument: Instrument::default(),
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;

pub fn create_shared_state() -> SharedState {
    Arc::new(Mutex::new(AppState::default()))
}
