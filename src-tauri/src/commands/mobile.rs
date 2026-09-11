//! Mobile answers for the commands that exist only on a desktop.
//!
//! MOBILE_IMPLEMENTATION_PLAN §3: `tauri::generate_handler!` takes one flat
//! list and cannot cfg individual entries, so every command stays registered
//! on every platform and only the *bodies* change. The mobile frontend never
//! calls any of these (M02 removes them from the import graph) — what is here
//! is the safety net behind that, not UX. Nothing in this file is ever shown
//! to a musician.
//!
//! Three shapes appear below:
//!
//!   * **Refusals** — the coach, the mic evaluation and the voice. They answer with
//!     `Err(NOT_AVAILABLE)` or the empty value for their type.
//!   * **No-ops** — the window manager. A phone has one fullscreen webview;
//!     "always on top" and "show the floating widget" have no meaning, and
//!     failing would be noisier than doing nothing.
//!   * **One real implementation** — `set_volume`, which on desktop also has
//!     to cooperate with the TTS ducking mechanism. There is no voice on a
//!     phone, so the mobile version is the same command without that half.

use crate::state::SharedState;
use tauri::{AppHandle, State};

/// The one error string every refused command returns. English-only and
/// never rendered: the frontend does not call these on mobile.
const NOT_AVAILABLE: &str = "not available on this platform";

// ---------------------------------------------------------------------------
// Window management — no-ops. A phone has one fullscreen webview.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn set_widget_mode() {}

#[tauri::command]
pub fn set_always_on_top() {}

#[tauri::command]
pub fn set_widget_always_on_top() {}

#[tauri::command]
pub fn show_main() {}

#[tauri::command]
pub fn show_floating() {}

#[tauri::command]
pub fn save_window_position() {}

/// The desktop `app_ready` re-applies the saved window position and calls
/// `show()` once React has mounted. There is no window to place and nothing
/// is hidden at startup on a phone, so this is where that ends.
#[tauri::command]
pub fn app_ready() {}

// ---------------------------------------------------------------------------
// Volume — the real thing, minus the TTS ducking the desktop build needs.
// ---------------------------------------------------------------------------

/// Same as the desktop `set_volume` without the `SharedTtsDim` half: there is
/// no voice on mobile, so nothing can be holding a dimmed value that has to be
/// updated in step. `volume_real` is still written so `persist_state` keeps
/// storing the user's intent from one field.
#[tauri::command]
pub fn set_volume(volume: f32, state: State<SharedState>, app_handle: AppHandle) {
    let clamped = volume.clamp(0.0, 1.0);
    {
        let mut s = state.lock().unwrap();
        s.volume = clamped;
        s.volume_real = clamped;
    }
    // `emit_state_changed` / `persist_state` are private to `commands`; a
    // child module can still see them, which is why this lives here.
    super::emit_state_changed(&state, &app_handle);
    super::persist_state(&state, &app_handle);
}

// ---------------------------------------------------------------------------
// MIDI. Not "gated off a phone" — midir cannot be built for Android at all
// (no backend arm for `target_os = "android"`), so `crate::midi` does not
// exist here and even the device/binding types are gone. The shapes below are
// therefore plain JSON. iOS CoreMIDI is M07.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_midi_devices() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn connect_midi_device() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn disconnect_midi_device() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn set_midi_binding() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn clear_midi_binding() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn get_midi_bindings() -> Vec<serde_json::Value> {
    Vec::new()
}

// ---------------------------------------------------------------------------
// Mic evaluation, calibration, session records, diagnostic logs.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn set_calibration_offset() {}

#[tauri::command]
pub fn get_calibration_offset() -> Option<f64> {
    None
}

#[tauri::command]
pub fn get_calibration_cache_entry() -> Option<serde_json::Value> {
    None
}

#[tauri::command]
pub fn clear_calibration_cache_entry() {}

#[tauri::command]
pub fn list_calibration_cache() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn list_audio_input_devices() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn start_evaluation() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn stop_evaluation() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn get_evaluation_state() -> bool {
    false
}

#[tauri::command]
pub fn notify_settings_change() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn close_open_segment() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn get_session_report() -> Result<Option<serde_json::Value>, String> {
    Ok(None)
}

#[tauri::command]
pub fn get_final_session_report() -> Result<Option<serde_json::Value>, String> {
    Ok(None)
}

#[tauri::command]
pub fn clear_session() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn save_session() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn get_session_history() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn delete_session() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn clear_all_sessions() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn list_session_logs() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub fn get_session_log() -> Result<serde_json::Value, String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn export_session_logs() -> Result<String, String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn clear_session_logs() -> Result<(), String> {
    Ok(())
}

// ---------------------------------------------------------------------------
// Audio input capture / playback (the input-test modals).
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn start_recording() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn stop_recording() -> f32 {
    0.0
}

#[tauri::command]
pub fn start_playback() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn stop_playback() {}

#[tauri::command]
pub fn discard_recording() {}

#[tauri::command]
pub fn get_waveform() -> Vec<f32> {
    Vec::new()
}

#[tauri::command]
pub fn set_input_gain() {}

// ---------------------------------------------------------------------------
// The coach brain — download, load, generate — and its voice.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_model_status() -> Result<serde_json::Value, String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn get_system_memory_mb() -> u64 {
    0
}

#[tauri::command]
pub fn write_model_chunk() -> Result<String, String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn get_models_path() -> Result<String, String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn delete_models() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn start_model_download() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn cancel_model_download() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn load_coach_model() -> Result<bool, String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn unload_coach_model() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn coach_generate() -> Result<String, String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn is_coach_loaded() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub fn get_coach_capabilities() -> Result<serde_json::Value, String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn tts_speak() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}

#[tauri::command]
pub fn tts_stop() {}

#[tauri::command]
pub fn tts_set_voice() {}

#[tauri::command]
pub fn tts_set_volume() {}

#[tauri::command]
pub fn tts_list_voices() -> Vec<(String, String)> {
    Vec::new()
}

#[tauri::command]
pub fn tts_voice_diagnostics() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn start_voice_repair() -> Result<(), String> {
    Err(NOT_AVAILABLE.into())
}
