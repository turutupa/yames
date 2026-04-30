use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

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
    pub mode: String,       // "linear" | "zigzag"
    pub cyclic: bool,
    // Runtime state
    pub active: bool,
    #[serde(rename = "currentStep")]
    pub current_step: u16,
    #[serde(rename = "currentBpm")]
    pub current_bpm: u16,
    pub direction: String,  // "up" | "down"
    #[serde(rename = "barsInStep")]
    pub bars_in_step: u8,
    pub completed: bool,
}

impl Default for SpeedRamp {
    fn default() -> Self {
        Self {
            start_bpm: 80,
            target_bpm: 140,
            increment: 5,
            decrement: 3,
            bars_per_step: 4,
            beats_per_bar: 4,
            mode: "linear".to_string(),
            cyclic: false,
            active: false,
            current_step: 0,
            current_bpm: 80,
            direction: "up".to_string(),
            bars_in_step: 0,
            completed: false,
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
    #[serde(rename = "accentColor")]
    pub accent_color: String,
    pub theme: String,
    pub volume: f32,
    #[serde(rename = "soundType")]
    pub sound_type: String,
    #[serde(rename = "timeSignature")]
    pub time_signature: u8,
    #[serde(rename = "speedRamp")]
    pub speed_ramp: SpeedRamp,
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
            accent_color: "#e94560".to_string(),
            theme: "mono".to_string(),
            volume: 0.8,
            sound_type: "click".to_string(),
            time_signature: 4,
            speed_ramp: SpeedRamp::default(),
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;

pub fn create_shared_state() -> SharedState {
    Arc::new(Mutex::new(AppState::default()))
}
