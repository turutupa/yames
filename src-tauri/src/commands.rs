use crate::engine::MetronomeEngine;
use crate::state::{AppState, SharedState};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct EngineState(pub Mutex<MetronomeEngine>);

/// Persist the current AppState to the store (minus is_playing which is transient).
fn persist_state(state: &SharedState, app_handle: &AppHandle) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        let s = state.lock().unwrap();
        store.set("bpm", serde_json::json!(s.bpm));
        store.set("subdivision", serde_json::json!(s.subdivision));
        store.set("mode", serde_json::json!(s.mode));
        store.set("corner", serde_json::json!(s.corner));
        store.set("alwaysOnTop", serde_json::json!(s.always_on_top));
        store.set("accentColor", serde_json::json!(s.accent_color));
        store.set("theme", serde_json::json!(s.theme));
        store.set("volume", serde_json::json!(s.volume));
        store.set("soundType", serde_json::json!(s.sound_type));
        store.set("timeSignature", serde_json::json!(s.time_signature));
        store.set("speedRamp", serde_json::json!({
            "startBpm": s.speed_ramp.start_bpm,
            "targetBpm": s.speed_ramp.target_bpm,
            "increment": s.speed_ramp.increment,
            "decrement": s.speed_ramp.decrement,
            "barsPerStep": s.speed_ramp.bars_per_step,
            "beatsPerBar": s.speed_ramp.beats_per_bar,
            "mode": s.speed_ramp.mode,
            "cyclic": s.speed_ramp.cyclic,
        }));
    }
}

#[tauri::command]
pub fn get_state(state: State<SharedState>) -> AppState {
    state.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_bpm(bpm: u16, state: State<SharedState>, app_handle: AppHandle) {
    let clamped = bpm.clamp(20, 300);
    {
        let mut s = state.lock().unwrap();
        s.bpm = clamped;
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_subdivision(subdivision: u8, state: State<SharedState>, app_handle: AppHandle) {
    let valid = subdivision.clamp(1, 6);
    {
        let mut s = state.lock().unwrap();
        s.subdivision = valid;
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn toggle_playback(
    state: State<SharedState>,
    engine_state: State<EngineState>,
    app_handle: AppHandle,
) {
    let is_playing = {
        let s = state.lock().unwrap();
        s.is_playing
    };

    let mut engine = engine_state.0.lock().unwrap();

    if is_playing {
        engine.stop();
        let mut s = state.lock().unwrap();
        s.is_playing = false;
    } else {
        engine.start(state.inner().clone(), app_handle.clone());
        let mut s = state.lock().unwrap();
        s.is_playing = true;
    }

    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
}

#[tauri::command]
pub fn set_playing(
    playing: bool,
    state: State<SharedState>,
    engine_state: State<EngineState>,
    app_handle: AppHandle,
) {
    let mut engine = engine_state.0.lock().unwrap();

    if playing && !engine.is_running() {
        engine.start(state.inner().clone(), app_handle.clone());
        let mut s = state.lock().unwrap();
        s.is_playing = true;
    } else if !playing && engine.is_running() {
        engine.stop();
        let mut s = state.lock().unwrap();
        s.is_playing = false;
    }

    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
}

#[tauri::command]
pub fn set_widget_mode(mode: String, state: State<SharedState>, app_handle: AppHandle) {
    {
        let mut s = state.lock().unwrap();
        s.mode = mode;
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_corner(corner: String, state: State<SharedState>, app_handle: AppHandle) {
    {
        let mut s = state.lock().unwrap();
        s.corner = corner;
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_always_on_top(enabled: bool, state: State<SharedState>, app_handle: AppHandle) {
    {
        let mut s = state.lock().unwrap();
        s.always_on_top = enabled;
    }
    if let Some(main_win) = app_handle.get_webview_window("main") {
        let _ = main_win.set_always_on_top(enabled);
    }
    // Widget always stays on top regardless of this setting
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn show_main(app_handle: AppHandle, state: State<SharedState>) {
    if let Some(float_win) = app_handle.get_webview_window("floating") {
        let _ = float_win.hide();
    }
    if let Some(main_win) = app_handle.get_webview_window("main") {
        let aot = state.lock().unwrap().always_on_top;
        let _ = main_win.set_always_on_top(aot);
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        store.set("lastWindow", serde_json::json!("main"));
    }
}

#[tauri::command]
pub fn show_floating(app_handle: AppHandle) {
    if let Some(main_win) = app_handle.get_webview_window("main") {
        let _ = main_win.hide();
    }
    if let Some(float_win) = app_handle.get_webview_window("floating") {
        let _ = float_win.show();
    }
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        store.set("lastWindow", serde_json::json!("floating"));
    }
}

#[tauri::command]
pub fn set_accent_color(color: String, state: State<SharedState>, app_handle: AppHandle) {
    {
        let mut s = state.lock().unwrap();
        s.accent_color = color;
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_theme(theme: String, state: State<SharedState>, app_handle: AppHandle) {
    {
        let mut s = state.lock().unwrap();
        s.theme = theme;
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_volume(volume: f32, state: State<SharedState>, app_handle: AppHandle) {
    let clamped = volume.clamp(0.0, 1.0);
    {
        let mut s = state.lock().unwrap();
        s.volume = clamped;
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn save_window_position(label: String, x: i32, y: i32, app_handle: AppHandle) {
    use tauri_plugin_store::StoreExt;
    let store = app_handle.store("settings.json").unwrap();
    let key = format!("window_position_{}", label);
    store.set(key, serde_json::json!({ "x": x, "y": y }));
}

#[tauri::command]
pub fn save_window_size(label: String, width: u32, height: u32, app_handle: AppHandle) {
    use tauri_plugin_store::StoreExt;
    let store = app_handle.store("settings.json").unwrap();
    let key = format!("window_size_{}", label);
    store.set(key, serde_json::json!({ "width": width, "height": height }));
}

#[tauri::command]
pub fn set_sound_type(sound_type: String, state: State<SharedState>, app_handle: AppHandle) {
    let valid = match sound_type.as_str() {
        "click" | "wood" | "beep" | "drum" => sound_type,
        _ => "click".to_string(),
    };
    {
        let mut s = state.lock().unwrap();
        s.sound_type = valid;
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_time_signature(time_signature: u8, state: State<SharedState>, app_handle: AppHandle) {
    let valid = match time_signature {
        0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 => time_signature,
        _ => 4,
    };
    {
        let mut s = state.lock().unwrap();
        s.time_signature = valid;
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn configure_speed_ramp(
    start_bpm: u16,
    target_bpm: u16,
    increment: u16,
    decrement: u16,
    bars_per_step: u8,
    beats_per_bar: u8,
    mode: String,
    cyclic: bool,
    state: State<SharedState>,
    app_handle: AppHandle,
) {
    {
        let mut s = state.lock().unwrap();
        s.speed_ramp.start_bpm = start_bpm.clamp(20, 300);
        s.speed_ramp.target_bpm = target_bpm.clamp(20, 300);
        s.speed_ramp.increment = increment.clamp(1, 50);
        s.speed_ramp.decrement = decrement.clamp(1, 50);
        s.speed_ramp.bars_per_step = bars_per_step.clamp(1, 32);
        s.speed_ramp.beats_per_bar = beats_per_bar.clamp(1, 12);
        s.speed_ramp.mode = match mode.as_str() {
            "linear" | "zigzag" => mode,
            _ => "linear".to_string(),
        };
        s.speed_ramp.cyclic = cyclic;
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn start_speed_ramp(
    state: State<SharedState>,
    engine_state: State<EngineState>,
    app_handle: AppHandle,
) {
    {
        let mut s = state.lock().unwrap();
        s.speed_ramp.active = true;
        s.speed_ramp.current_step = 0;
        s.speed_ramp.current_bpm = s.speed_ramp.start_bpm;
        s.speed_ramp.direction = "up".to_string();
        s.speed_ramp.bars_in_step = 0;
        s.speed_ramp.completed = false;
        // Set the main BPM to the ramp start
        s.bpm = s.speed_ramp.start_bpm;
        s.is_playing = true;
    }
    {
        let mut engine = engine_state.0.lock().unwrap();
        engine.start(state.inner().clone(), app_handle.clone());
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
}

#[tauri::command]
pub fn start_speed_ramp_from(
    step: u16,
    bpm: u16,
    bar: u8,
    state: State<SharedState>,
    engine_state: State<EngineState>,
    app_handle: AppHandle,
) {
    {
        let mut s = state.lock().unwrap();
        s.speed_ramp.active = true;
        s.speed_ramp.current_step = step;
        s.speed_ramp.current_bpm = bpm.clamp(20, 300);
        s.speed_ramp.direction = if bpm >= s.speed_ramp.target_bpm { "down".to_string() } else { "up".to_string() };
        s.speed_ramp.bars_in_step = bar;
        s.speed_ramp.completed = false;
        s.bpm = bpm.clamp(20, 300);
        s.is_playing = true;
    }
    {
        let mut engine = engine_state.0.lock().unwrap();
        engine.start(state.inner().clone(), app_handle.clone());
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
}

#[tauri::command]
pub fn stop_speed_ramp(
    state: State<SharedState>,
    engine_state: State<EngineState>,
    app_handle: AppHandle,
) {
    {
        let mut s = state.lock().unwrap();
        s.speed_ramp.active = false;
        s.is_playing = false;
    }
    {
        let mut engine = engine_state.0.lock().unwrap();
        engine.stop();
    }
    let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
}

#[tauri::command]
pub fn toggle_fullscreen(app_handle: AppHandle) {
    if let Some(main_win) = app_handle.get_webview_window("main") {
        let is_fs = main_win.is_fullscreen().unwrap_or(false);
        let _ = main_win.set_fullscreen(!is_fs);
        let _ = app_handle.emit("fullscreen-changed", !is_fs);
    }
}

#[tauri::command]
pub fn set_fullscreen(fullscreen: bool, app_handle: AppHandle) {
    if let Some(main_win) = app_handle.get_webview_window("main") {
        let _ = main_win.set_fullscreen(fullscreen);
        let _ = app_handle.emit("fullscreen-changed", fullscreen);
    }
}

#[tauri::command]
pub fn set_active_tab(tab: String, app_handle: AppHandle) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        store.set("activeTab", serde_json::json!(tab));
    }
}

#[tauri::command]
pub fn get_active_tab(app_handle: AppHandle) -> String {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        if let Some(v) = store.get("activeTab").and_then(|v| v.as_str().map(String::from)) {
            return v;
        }
    }
    "beat".to_string()
}

#[tauri::command]
pub fn get_last_window(app_handle: AppHandle) -> String {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        if let Some(v) = store.get("lastWindow").and_then(|v| v.as_str().map(String::from)) {
            return v;
        }
    }
    "floating".to_string()
}

#[tauri::command]
pub fn set_calibration_offset(offset: f64, app_handle: AppHandle) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        store.set("calibrationOffset", serde_json::json!(offset));
    }
}

#[tauri::command]
pub fn get_calibration_offset(app_handle: AppHandle) -> Option<f64> {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        if let Some(v) = store.get("calibrationOffset").and_then(|v| v.as_f64()) {
            return Some(v);
        }
    }
    None
}