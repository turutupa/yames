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
    #[serde(rename = "speedRamp")]
    pub speed_ramp: SpeedRamp,

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
            speed_ramp: SpeedRamp::default(),
            instrument: Instrument::default(),
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;

pub fn create_shared_state() -> SharedState {
    Arc::new(Mutex::new(AppState::default()))
}
