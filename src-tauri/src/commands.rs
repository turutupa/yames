use crate::audio_input::{AudioDevice, SharedAudioInput};
use crate::coach::SharedCoachEngine;
use crate::engine::MetronomeEngine;
use crate::instrument::Instrument;
use crate::midi::{MidiBinding, MidiDeviceInfo, MidiMsgType, SharedMidi};
use crate::onset::{SharedOnsetDetector, SharedTempoContext};
use crate::session::{CoachMode, SessionReport, SharedSessionAccumulator};
use crate::state::{AppState, SharedState};
use crate::timing::SharedTimingAnalyzer;
use crate::tts::{SharedTts, SharedTtsActive, SharedTtsDim};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct EngineState(pub Mutex<MetronomeEngine>);

/// Snapshot the current AppState and emit it on the `state-changed`
/// event. Lock is dropped before the emit so the (synchronous-but-not-
/// instant) serde serialization can't block any other thread waiting on
/// the same mutex. Mirrors the emit-after-drop pattern used throughout
/// the metronome tick thread in `engine.rs`.
fn emit_state_changed(state: &SharedState, app_handle: &AppHandle) {
    let snapshot = state.lock().unwrap().clone();
    let _ = app_handle.emit("state-changed", &snapshot);
}

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
        store.set(
            "widgetAlwaysOnTop",
            serde_json::json!(s.widget_always_on_top),
        );
        store.set("accentColor", serde_json::json!(s.accent_color));
        store.set("theme", serde_json::json!(s.theme));
        // Write volume_real (not volume) so a concurrent TTS dim can't bake
        // the temporarily-lowered value into the store. See state.rs.
        store.set("volume", serde_json::json!(s.volume_real));
        store.set("soundType", serde_json::json!(s.sound_type));
        store.set("timeSignature", serde_json::json!(s.time_signature));
        store.set("beatGroups", serde_json::json!(s.beat_groups));
        store.set("freeMode", serde_json::json!(s.free_mode));
        store.set(
            "speedRamp",
            serde_json::json!({
                "startBpm": s.speed_ramp.start_bpm,
                "targetBpm": s.speed_ramp.target_bpm,
                "increment": s.speed_ramp.increment,
                "decrement": s.speed_ramp.decrement,
                "barsPerStep": s.speed_ramp.bars_per_step,
                "beatsPerBar": s.speed_ramp.beats_per_bar,
                "mode": s.speed_ramp.mode,
                "cyclic": s.speed_ramp.cyclic,
            }),
        );
        store.set("instrument", serde_json::json!(s.instrument.id()));
    }
}

#[tauri::command]
pub fn get_state(state: State<SharedState>) -> AppState {
    state.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_bpm(
    bpm: u16,
    state: State<SharedState>,
    tempo_ctx: State<SharedTempoContext>,
    app_handle: AppHandle,
) {
    let clamped = bpm.clamp(20, 300);
    {
        let mut s = state.lock().unwrap();
        s.bpm = clamped;
    }
    // D2 — keep the onset detector's live tempo view in sync so its
    // adaptive refractory window tracks the current grid immediately
    // (no need to wait for the next start_evaluation).
    tempo_ctx.set_bpm(clamped);
    emit_state_changed(&state, &app_handle);
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_subdivision(
    subdivision: u8,
    state: State<SharedState>,
    tempo_ctx: State<SharedTempoContext>,
    app_handle: AppHandle,
) {
    let valid = subdivision.clamp(1, 6);
    {
        let mut s = state.lock().unwrap();
        s.subdivision = valid;
    }
    // D2 — mirror into the shared tempo context (see set_bpm).
    tempo_ctx.set_subdivision(valid);
    emit_state_changed(&state, &app_handle);
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn toggle_playback(
    state: State<SharedState>,
    engine_state: State<EngineState>,
    tempo_ctx: State<SharedTempoContext>,
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

    // D2 — keep tempo context in sync so the onset detector gates
    // analysis against the live playing state.
    tempo_ctx.set_playing(!is_playing);
    emit_state_changed(&state, &app_handle);
}

#[tauri::command]
pub fn set_playing(
    playing: bool,
    state: State<SharedState>,
    engine_state: State<EngineState>,
    tempo_ctx: State<SharedTempoContext>,
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

    // D2 — mirror into tempo context so the onset detector gates on
    // the live playing state.
    tempo_ctx.set_playing(playing);
    emit_state_changed(&state, &app_handle);
}

#[tauri::command]
pub fn set_widget_mode(mode: String, state: State<SharedState>, app_handle: AppHandle) {
    {
        let mut s = state.lock().unwrap();
        s.mode = mode;
    }
    emit_state_changed(&state, &app_handle);
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
    emit_state_changed(&state, &app_handle);
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_widget_always_on_top(enabled: bool, state: State<SharedState>, app_handle: AppHandle) {
    {
        let mut s = state.lock().unwrap();
        s.widget_always_on_top = enabled;
    }
    if let Some(float_win) = app_handle.get_webview_window("floating") {
        let _ = float_win.set_always_on_top(enabled);
    }
    emit_state_changed(&state, &app_handle);
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
pub fn set_theme(theme: String, state: State<SharedState>, app_handle: AppHandle) {
    {
        let mut s = state.lock().unwrap();
        s.theme = theme;
    }
    emit_state_changed(&state, &app_handle);
    persist_state(&state, &app_handle);
}

/// Update the selected instrument. Accepts the kebab-case ids used by the
/// React dropdown (`"drums"`, `"electric-guitar"`, …); unknown ids fall
/// back to `Instrument::Other` for forward compatibility.
///
/// The new instrument's `InstrumentProfile` becomes effective for the
/// *next* DSP segment — current detection-loop state is not rewound mid-
/// segment (per the plan's "multi-instrument users" rule).
#[tauri::command]
pub fn set_instrument(instrument: String, state: State<SharedState>, app_handle: AppHandle) {
    {
        let mut s = state.lock().unwrap();
        s.instrument = Instrument::from_id(&instrument);
    }
    emit_state_changed(&state, &app_handle);
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_volume(
    volume: f32,
    state: State<SharedState>,
    dim_state: State<SharedTtsDim>,
    app_handle: AppHandle,
) {
    let clamped = volume.clamp(0.0, 1.0);
    {
        // Hold `dim` first to match the lock order used in `tts_speak`
        // (dim → state). If a TTS dim is currently active, `dim_user_set`
        // updates the captured "original" so the eventual `dim_exit`
        // restores the user's NEW intent instead of the stale pre-TTS
        // value — otherwise dragging the slider mid-speech got stomped
        // when the speech ended.
        let mut dim = dim_state.lock().unwrap();
        let mut s = state.lock().unwrap();
        crate::tts::dim_user_set(&mut dim, clamped);
        s.volume = clamped;
        s.volume_real = clamped; // always track real intent — dim must not touch this
    }
    emit_state_changed(&state, &app_handle);
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
pub fn set_sound_type(sound_type: String, state: State<SharedState>, app_handle: AppHandle) {
    let valid = match sound_type.as_str() {
        "click" | "wood" | "beep" | "drum" => sound_type,
        _ => "click".to_string(),
    };
    {
        let mut s = state.lock().unwrap();
        s.sound_type = valid;
    }
    emit_state_changed(&state, &app_handle);
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_time_signature(time_signature: u8, state: State<SharedState>, app_handle: AppHandle) {
    // Deprecated thin-wrap — delegates to set_beat_groups logic.
    // time_signature=0 ("Never") is dropped; treated as 4/4.
    let valid = match time_signature {
        1 | 2 | 3 | 4 | 5 | 6 | 7 => time_signature,
        _ => 4,
    };
    {
        let mut s = state.lock().unwrap();
        s.beat_groups = vec![valid];
        s.time_signature = valid;
    }
    emit_state_changed(&state, &app_handle);
    persist_state(&state, &app_handle);
}

/// Smallest / largest beat count a single group (and therefore a FREE-mode
/// bar) may hold. Mirrored by `MIN_FREE_BEATS` / `MAX_FREE_BEATS` in
/// `src/constants/metronome.ts`.
pub const MIN_GROUP_BEATS: u8 = 1;
pub const MAX_GROUP_BEATS: u8 = 16;

/// Validation half of [`set_beat_groups`], split out so it can be unit-tested
/// without a Tauri `State` / `AppHandle`.
pub fn validate_beat_groups(groups: &[u8]) -> Result<(), String> {
    if groups.is_empty() || groups.len() > 6 {
        return Err("groups: 1–6 required".into());
    }
    for g in groups {
        if *g < MIN_GROUP_BEATS || *g > MAX_GROUP_BEATS {
            return Err(format!(
                "each group: {MIN_GROUP_BEATS}–{MAX_GROUP_BEATS} beats"
            ));
        }
    }
    let total: u32 = groups.iter().map(|g| *g as u32).sum();
    if total > MAX_GROUP_BEATS as u32 {
        return Err(format!("total beats must be ≤ {MAX_GROUP_BEATS}"));
    }
    Ok(())
}

#[tauri::command]
pub fn set_beat_groups(
    groups: Vec<u8>,
    state: State<SharedState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    validate_beat_groups(&groups)?;
    let total: u8 = groups.iter().sum();
    {
        let mut s = state.lock().unwrap();
        s.beat_groups = groups;
        s.time_signature = total;
    }
    emit_state_changed(&state, &app_handle);
    persist_state(&state, &app_handle);
    Ok(())
}

/// FREE mode means "N equal beats, no grouping", so it implies exactly one
/// group holding every beat. Rust owns that invariant (N2 on PR #11): callers
/// only flip the flag, they don't have to remember a second `set_beat_groups`
/// round-trip. Returns `(beat_groups, time_signature)`.
///
/// Pure so it can be unit-tested without a Tauri `State` / `AppHandle`.
pub fn collapse_to_free(groups: &[u8]) -> (Vec<u8>, u8) {
    let total: u32 = groups.iter().map(|g| *g as u32).sum();
    let total = total.clamp(MIN_GROUP_BEATS as u32, MAX_GROUP_BEATS as u32) as u8;
    (vec![total], total)
}

#[tauri::command]
pub fn set_free_mode(
    enabled: bool,
    state: State<SharedState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    {
        let mut s = state.lock().unwrap();
        s.free_mode = enabled;
        if enabled {
            let (groups, total) = collapse_to_free(&s.beat_groups);
            s.beat_groups = groups;
            s.time_signature = total;
        }
    }
    emit_state_changed(&state, &app_handle);
    persist_state(&state, &app_handle);
    Ok(())
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
    warmup_beats: u8,
    aggressiveness: Option<String>,
    state: State<SharedState>,
    app_handle: AppHandle,
) {
    {
        let mut s = state.lock().unwrap();
        s.speed_ramp.start_bpm = start_bpm.clamp(20, 300);
        s.speed_ramp.target_bpm = target_bpm.clamp(s.speed_ramp.start_bpm, 300);
        s.speed_ramp.increment = increment.clamp(1, 50);
        s.speed_ramp.decrement = decrement.clamp(1, 50);
        s.speed_ramp.bars_per_step = bars_per_step.clamp(1, 32);
        s.speed_ramp.beats_per_bar = beats_per_bar.clamp(1, 12);
        s.speed_ramp.mode = match mode.as_str() {
            "linear" | "zigzag" | "adaptive" => mode,
            _ => "linear".to_string(),
        };
        s.speed_ramp.cyclic = cyclic;
        s.speed_ramp.warmup_beats = warmup_beats.clamp(0, 8);
        s.speed_ramp.aggressiveness = match aggressiveness.as_deref() {
            Some("conservative") => "conservative".to_string(),
            Some("aggressive") => "aggressive".to_string(),
            _ => "moderate".to_string(),
        };
    }
    emit_state_changed(&state, &app_handle);
    persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn start_speed_ramp(
    state: State<SharedState>,
    engine_state: State<EngineState>,
    tempo_ctx: State<SharedTempoContext>,
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
        s.speed_ramp.warmup_count = 0;
        // Don't touch s.bpm — ramp uses its own current_bpm
        s.is_playing = true;
    }
    {
        let mut engine = engine_state.0.lock().unwrap();
        engine.start(state.inner().clone(), app_handle.clone());
    }
    // D2 — gate onset analysis on the running state.
    tempo_ctx.set_playing(true);
    emit_state_changed(&state, &app_handle);
}

#[tauri::command]
pub fn start_speed_ramp_from(
    step: u16,
    bpm: u16,
    bar: u8,
    state: State<SharedState>,
    engine_state: State<EngineState>,
    tempo_ctx: State<SharedTempoContext>,
    app_handle: AppHandle,
) {
    {
        let mut s = state.lock().unwrap();
        s.speed_ramp.active = true;
        s.speed_ramp.current_step = step;
        s.speed_ramp.current_bpm = bpm.clamp(20, 300);
        s.speed_ramp.direction = if bpm >= s.speed_ramp.target_bpm {
            "down".to_string()
        } else {
            "up".to_string()
        };
        s.speed_ramp.bars_in_step = bar;
        s.speed_ramp.completed = false;
        s.speed_ramp.warmup_count = 0;
        // Don't touch s.bpm — ramp uses its own current_bpm
        s.is_playing = true;
    }
    {
        let mut engine = engine_state.0.lock().unwrap();
        engine.start(state.inner().clone(), app_handle.clone());
    }
    // D2 — gate onset analysis on the running state.
    tempo_ctx.set_playing(true);
    emit_state_changed(&state, &app_handle);
}

#[tauri::command]
pub fn stop_speed_ramp(
    state: State<SharedState>,
    engine_state: State<EngineState>,
    tempo_ctx: State<SharedTempoContext>,
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
    // D2 — clear the playing gate so the onset detector stops analysis.
    tempo_ctx.set_playing(false);
    emit_state_changed(&state, &app_handle);
}

// T07 — `set_adaptive_decision` was removed here. The adaptive drill's
// direction is computed exclusively by `engine::adaptive_thresholds` /
// `adaptive_direction`; the coach model comments on the move but can no
// longer push a decision back into the engine.

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
        if let Some(v) = store
            .get("activeTab")
            .and_then(|v| v.as_str().map(String::from))
        {
            return v;
        }
    }
    "beat".to_string()
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

// ---------------------------------------------------------------------------
// Per-instrument calibration cache commands (DSP plan §"Per-instrument
// calibration cache"). The cache itself is owned by `SharedCalibrationCache`
// state; these commands surface read / clear / list operations to the UI so
// users can inspect what's been calibrated and force a recalibration when
// hardware changes mid-TTL.
// ---------------------------------------------------------------------------

/// Returns the cached calibration entry for the current `(instrument,
/// device)` pair (or `None`). Used by the Settings UI to render a
/// "Calibrated for this gear" hint.
#[tauri::command]
pub fn get_calibration_cache_entry(
    instrument_id: String,
    device_name: Option<String>,
    cal_cache: State<'_, crate::calibration_cache::SharedCalibrationCache>,
) -> Option<crate::calibration_cache::CalibrationEntry> {
    let key = device_name.unwrap_or_else(|| "default".to_string());
    cal_cache
        .lock()
        .unwrap()
        .lookup(&instrument_id, &key)
        .cloned()
}

/// Forget the cached calibration for one `(instrument, device)` pair
/// — wired to the "Recalibrate" button. The next evaluation session
/// for the pair re-converges from cold.
#[tauri::command]
pub fn clear_calibration_cache_entry(
    instrument_id: String,
    device_name: Option<String>,
    cal_cache: State<'_, crate::calibration_cache::SharedCalibrationCache>,
    app_handle: AppHandle,
) {
    let key = device_name.unwrap_or_else(|| "default".to_string());
    let mut cache = cal_cache.lock().unwrap();
    cache.clear(&instrument_id, &key);
    crate::calibration_cache::persist_to_store(&cache, &app_handle);
}

/// Snapshot every cached entry. Used by support tooling and Settings'
/// "show me what's cached" dev panel (not surfaced yet but cheap to
/// expose now so we don't need a future schema migration).
#[tauri::command]
pub fn list_calibration_cache(
    cal_cache: State<'_, crate::calibration_cache::SharedCalibrationCache>,
) -> Vec<crate::calibration_cache::CachedPair> {
    cal_cache.lock().unwrap().entries.clone()
}

#[tauri::command]
pub fn open_url(url: String) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&url).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", &url])
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    }
}

// ---------------------------------------------------------------------------
// MIDI Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_midi_devices(midi: State<SharedMidi>) -> Vec<MidiDeviceInfo> {
    let listener = midi.lock().unwrap();
    listener.list_devices()
}

#[tauri::command]
pub fn connect_midi_device(
    device_name: String,
    midi: State<SharedMidi>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let listener = midi.lock().unwrap();
    listener.connect(&device_name, app_handle.clone())?;
    // Persist connected device
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        store.set("midiDevice", serde_json::json!(device_name));
    }
    Ok(())
}

#[tauri::command]
pub fn disconnect_midi_device(
    midi: State<SharedMidi>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let listener = midi.lock().unwrap();
    listener.disconnect();
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        store.delete("midiDevice");
    }
    Ok(())
}

#[tauri::command]
pub fn set_midi_binding(
    action: String,
    channel: Option<u8>,
    msg_type: String,
    number: u8,
    midi: State<SharedMidi>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let mt = match msg_type.as_str() {
        "cc" => MidiMsgType::ControlChange,
        "note" => MidiMsgType::NoteOn,
        "pc" => MidiMsgType::ProgramChange,
        _ => return Err("Invalid msg_type: must be 'cc', 'note', or 'pc'".to_string()),
    };
    let binding = MidiBinding {
        action,
        channel,
        msg_type: mt,
        number,
    };
    let listener = midi.lock().unwrap();
    listener.add_binding(binding);
    // Persist bindings
    persist_midi_bindings(&listener, &app_handle);
    Ok(())
}

#[tauri::command]
pub fn clear_midi_binding(
    action: String,
    midi: State<SharedMidi>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let listener = midi.lock().unwrap();
    listener.remove_binding(&action);
    persist_midi_bindings(&listener, &app_handle);
    Ok(())
}

#[tauri::command]
pub fn get_midi_bindings(midi: State<SharedMidi>) -> Vec<MidiBinding> {
    let listener = midi.lock().unwrap();
    listener.get_bindings()
}

fn persist_midi_bindings(listener: &crate::midi::MidiListener, app_handle: &AppHandle) {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        let bindings = listener.get_bindings();
        store.set("midiBindings", serde_json::json!(bindings));
    }
}

// ---------------------------------------------------------------------------
// Preset Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_presets(app_handle: AppHandle) -> Vec<serde_json::Value> {
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        if let Some(val) = store.get("presets") {
            if let Some(arr) = val.as_array() {
                return arr.clone();
            }
        }
    }
    Vec::new()
}

#[tauri::command]
pub fn save_preset(preset: serde_json::Value, app_handle: AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app_handle
        .store("settings.json")
        .map_err(|e| e.to_string())?;
    let id = preset
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("preset must have an id")?;
    let mut presets: Vec<serde_json::Value> = store
        .get("presets")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    // Update existing or append new
    if let Some(pos) = presets
        .iter()
        .position(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
    {
        presets[pos] = preset;
    } else {
        presets.push(preset);
    }

    store.set("presets", serde_json::json!(presets));
    Ok(())
}

#[tauri::command]
pub fn delete_preset(id: String, app_handle: AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app_handle
        .store("settings.json")
        .map_err(|e| e.to_string())?;
    let mut presets: Vec<serde_json::Value> = store
        .get("presets")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    presets.retain(|p| p.get("id").and_then(|v| v.as_str()) != Some(&id));
    store.set("presets", serde_json::json!(presets));
    Ok(())
}

#[tauri::command]
pub fn reorder_presets(ids: Vec<String>, app_handle: AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app_handle
        .store("settings.json")
        .map_err(|e| e.to_string())?;
    let presets: Vec<serde_json::Value> = store
        .get("presets")
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    let mut reordered: Vec<serde_json::Value> = Vec::with_capacity(ids.len());
    for id in &ids {
        if let Some(p) = presets
            .iter()
            .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
        {
            reordered.push(p.clone());
        }
    }
    store.set("presets", serde_json::json!(reordered));
    Ok(())
}

// ---------------------------------------------------------------------------
// Audio Input / Evaluation Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_audio_input_devices() -> Vec<AudioDevice> {
    tauri::async_runtime::spawn_blocking(|| crate::audio_input::AudioInput::list_devices())
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn start_evaluation(
    device_name: Option<String>,
    input_channel: Option<usize>,
    coach_mode: Option<String>,
    audio_input: State<'_, SharedAudioInput>,
    onset_detector: State<'_, SharedOnsetDetector>,
    timing_analyzer: State<'_, SharedTimingAnalyzer>,
    session_acc: State<'_, SharedSessionAccumulator>,
    engine_state: State<'_, EngineState>,
    midi: State<'_, SharedMidi>,
    state: State<'_, SharedState>,
    tempo_ctx: State<'_, SharedTempoContext>,
    cal_cache: State<'_, crate::calibration_cache::SharedCalibrationCache>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let coach_mode = match coach_mode.as_deref().unwrap_or("default") {
        "pro" => CoachMode::Pro,
        _ => CoachMode::Default,
    };
    // Stop any existing evaluation first (idempotent — prevents deadlock if called twice)
    {
        let listener = midi.lock().unwrap();
        listener.clear_onset_callback();
    }
    onset_detector.lock().unwrap().stop();
    timing_analyzer.lock().unwrap().stop();

    let mut ai = audio_input.lock().unwrap();
    ai.start(
        device_name.as_deref(),
        input_channel.unwrap_or(0),
        app_handle.clone(),
    )?;

    // Snapshot subdivision from SharedState before locking the accumulator
    // (separate lock scopes to avoid any potential deadlock ordering issues).
    let current_subdivision = {
        let s = state.lock().unwrap();
        s.subdivision
    };

    // Clear previous session data + stamp the session start so the D1
    // diagnostic log (saved at stop) has a stable epoch.
    {
        let mut acc = session_acc.lock().unwrap();
        acc.clear();
        acc.coach_mode = coach_mode;
        acc.set_subdivision(current_subdivision);
        let (secs, ms) = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| (d.as_secs(), d.as_millis() as u64))
            .unwrap_or((0, 0));
        acc.mark_session_start(secs, ms);
    }

    // Get adaptive score handle from engine for real-time accuracy updates
    let adaptive_score = {
        let engine = engine_state.0.lock().unwrap();
        engine.adaptive_score()
    };

    // Start timing analyzer — emits beat-feedback events and accumulates session data
    let app_for_timing = app_handle.clone();
    let session_for_timing = session_acc.inner().clone();
    // Rolling window for adaptive score: track last N classifications
    let recent_hits = std::sync::Arc::new(std::sync::Mutex::new(Vec::<bool>::with_capacity(32)));
    let recent_hits_for_timing = recent_hits.clone();
    let adaptive_score_for_timing = adaptive_score;
    // D4 — snapshot profile + instrument id for the timing analyzer so
    // its activity state machine uses the right pause tolerance and the
    // Signal-B segment-end events know which instrument was practiced.
    // Mid-session instrument changes will be picked up on the next
    // start_evaluation (we never re-snapshot a live segment).
    let (ta_profile, ta_instrument) = {
        let s = state.lock().unwrap();
        (s.instrument.profile(), s.instrument.id().to_string())
    };
    // No preset tracking on the backend yet — the JS layer owns preset
    // identity. D4 leaves this None and lets the UI annotate the event.
    let ta_preset_id: Option<String> = None;

    // Per-instrument calibration cache (DSP plan §"Per-instrument
    // calibration cache"). Look up the cached `(instrument, device)`
    // offset before the analyzer starts so a familiar combo skips the
    // ~8-beat warmup convergence period. `device_key` is the resolved
    // input device name; we use "default" as a stable key for the OS
    // default device so users who never explicitly pick a device still
    // get a cache.
    let device_key = device_name
        .as_deref()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "default".to_string());
    let initial_calibration_offset_ms = {
        let cache = cal_cache.lock().unwrap();
        cache
            .lookup(&ta_instrument, &device_key)
            .map(|e| e.offset_ms)
    };
    // Write-back path: when the analyzer's session reaches convergence
    // (buffer full of REAL on-device samples) it fires the callback
    // once. We persist to the in-memory cache and to the store. The
    // store write happens on the timing-analysis thread but it's a
    // best-effort no-op on failure — the user already has the in-memory
    // value, so a transient FS error doesn't break the session.
    let cache_shared_for_callback = cal_cache.inner().clone();
    let app_for_cal = app_handle.clone();
    let instrument_for_cal = ta_instrument.clone();
    let device_for_cal = device_key.clone();

    let app_for_segment = app_handle.clone();
    let session_for_segment = session_acc.inner().clone();
    let mut ta = timing_analyzer.lock().unwrap();
    ta.start(
        ta_profile,
        ta_instrument,
        ta_preset_id,
        initial_calibration_offset_ms,
        coach_mode,
        move |feedback| {
            let _ = app_for_timing.emit("beat-feedback", &feedback);
            // Accumulate for session report
            if let Ok(mut acc) = session_for_timing.lock() {
                acc.push(feedback.clone());
            }
            // Update adaptive score (rolling window of last 16 beats)
            if feedback.classification != "skipped" {
                if let Ok(mut hits) = recent_hits_for_timing.lock() {
                    hits.push(feedback.classification != "miss");
                    if hits.len() > 16 {
                        hits.remove(0);
                    }
                    let total = hits.len() as u32;
                    let hit_count = hits.iter().filter(|&&h| h).count() as u32;
                    let score = if total > 0 {
                        (hit_count * 100) / total
                    } else {
                        0
                    };
                    adaptive_score_for_timing.store(score, std::sync::atomic::Ordering::Relaxed);
                }
            }
        },
        move |segment_end| {
            // D4 Signal B — forward to JS so the coach can decide whether
            // to surface a mini-report. The JS side filters by C4's
            // smart-timing gatekeeper.
            let _ = app_for_segment.emit("practice-segment-ended", &segment_end);
            // Also persist into the accumulator so the D1 diagnostic log
            // (written at stop_evaluation) includes the segments timeline.
            if let Ok(mut acc) = session_for_segment.lock() {
                acc.push_segment(crate::session_log::PracticeSegment {
                    start_ms: segment_end.start_ms,
                    end_ms: segment_end.end_ms,
                    start_bpm: segment_end.bpm,
                    end_bpm: segment_end.bpm,
                    score: segment_end.score,
                    component_scores: segment_end.component_scores.clone(),
                    end_reason: segment_end.end_reason,
                    // Path B — propagate the inferred divisor so the D1
                    // diagnostic log records what grid the matcher was
                    // scoring against (essential for debugging "why did
                    // this score this way?" from session_*.json).
                    inferred_divisor: segment_end.inferred_divisor,
                    inferred_divisor_confidence: segment_end.inferred_divisor_confidence,
                    // D4c — forward raw IC errors for post-hoc debugging.
                    interval_errors: segment_end.interval_errors.clone(),
                });
            }
        },
        move |converged_offset_ms| {
            // Per-instrument calibration cache write-back. Fires once
            // per session, after the buffer fully refills with real
            // device samples (confidence == 1.0). Persist with the
            // explicit 1.0 confidence — the cache only persists at the
            // PERSIST_CONFIDENCE_THRESHOLD or above, which 1.0 clears.
            if let Ok(mut cache) = cache_shared_for_callback.lock() {
                cache.insert(
                    instrument_for_cal.clone(),
                    device_for_cal.clone(),
                    converged_offset_ms,
                    1.0,
                );
                crate::calibration_cache::persist_to_store(&cache, &app_for_cal);
            }
        },
        {
            // Path B — emit divisor-locked / divisor-changed events so
            // the coach UI can render the subtle "Tracking 16ths"
            // caption. The Rust side debounces; this just forwards.
            let app_for_grid = app_handle.clone();
            move |grid: crate::timing::InferredGridChanged| {
                let _ = app_for_grid.emit("inferred-grid-changed", &grid);
            }
        },
    );

    // Start onset detection, forwarding onsets to both Tauri events AND timing analyzer
    let ai_shared = audio_input.inner().clone();
    let app_for_onset = app_handle.clone();
    let ta_shared = timing_analyzer.inner().clone();
    // Snapshot the current instrument's profile so onset detection uses
    // instrument-aware refractory + spectral weighting (D0). Mid-session
    // instrument switches take effect on the next evaluation start; the
    // current segment completes with the original profile per the plan.
    let profile = state.lock().unwrap().instrument.profile();
    // D2 — refresh the tempo context with the live grid before kicking
    // off the detector so the very first hop uses the right refractory
    // window (avoids the "first onset gets a stale 500ms guard" hole).
    {
        let s = state.lock().unwrap();
        tempo_ctx.set_bpm(s.bpm);
        tempo_ctx.set_subdivision(s.subdivision);
    }
    let tempo_for_onset = tempo_ctx.inner().clone();
    let mut od = onset_detector.lock().unwrap();
    od.start(ai_shared, profile, tempo_for_onset, move |onset| {
        let _ = app_for_onset.emit("onset-detected", &onset);
        // Feed into timing analyzer for beat matching
        if let Ok(ta) = ta_shared.lock() {
            ta.log_onset(onset);
        }
    });

    // Set MIDI onset callback — forward NoteOn events as onsets for timing
    let ta_for_midi = timing_analyzer.inner().clone();
    let app_for_midi = app_handle.clone();
    {
        let listener = midi.lock().unwrap();
        listener.set_onset_callback(move |velocity| {
            let onset = crate::onset::Onset {
                ts_ns: crate::clock::now_ns(),
                amplitude: velocity as f32 / 127.0,
                centroid: 0.0, // no spectral info from MIDI
                // MIDI is deterministic — full confidence. (No noise floor
                // or spectral flux to estimate against.)
                confidence: 1.0,
            };
            let _ = app_for_midi.emit("onset-detected", &onset);
            if let Ok(ta) = ta_for_midi.lock() {
                ta.log_onset(onset);
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_evaluation(
    audio_input: State<'_, SharedAudioInput>,
    onset_detector: State<'_, SharedOnsetDetector>,
    timing_analyzer: State<'_, SharedTimingAnalyzer>,
    midi: State<'_, SharedMidi>,
    session_acc: State<'_, SharedSessionAccumulator>,
    state: State<'_, SharedState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    // Idempotency guard — if the analyzer is already stopped (e.g. double-call
    // from a device change racing an explicit Stop), skip silently. The first
    // call already drained telemetry and persisted the log.
    {
        let ta = timing_analyzer
            .lock()
            .map_err(|e| format!("Lock failed: {e}"))?;
        if !ta.is_active() {
            return Ok(());
        }
    }
    // Clear MIDI onset callback first (no lock ordering issue)
    {
        let listener = midi.lock().map_err(|e| format!("Lock failed: {e}"))?;
        listener.clear_onset_callback();
    }
    // Stop in reverse-start order: onset_detector → timing_analyzer → audio_input
    // This matches start_evaluation's lock acquisition order to prevent deadlocks
    onset_detector
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?
        .stop();
    // Finalize the session WAV BEFORE stopping the timing analyzer.
    // audio_input.stop() is idempotent (capture_thread.take() / recorder.take()
    // are no-ops on a second call), so this is safe to call here even if the
    // timing_analyzer block below also tried to call it. Doing it early means
    // the WAV is always saved even when timing_analyzer.stop() fails (e.g. due
    // to a poisoned inner mutex from a timing-thread panic).
    //
    // Drain audio levels first — the comment "BEFORE stop()" still holds since
    // we call take_audio_levels() immediately before stop() in the same block.
    let captured_audio_levels = {
        let ai = audio_input
            .lock()
            .map_err(|e| format!("Lock failed: {e}"))?;
        ai.take_audio_levels()
    };
    audio_input
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?
        .stop();

    // Drain raw telemetry from the timing analyzer AFTER stop() so the
    // analyzer thread has fully joined and there's no concurrent push
    // racing the take. `TimingAnalyzer::drain_telemetry()` requires the
    // analyzer to be stopped for that race-free guarantee; `start()`
    // resets the buffer for the next session.
    let mut telemetry = {
        let mut ta = timing_analyzer
            .lock()
            .map_err(|e| format!("Lock failed: {e}"))?;
        ta.stop();
        ta.drain_telemetry()
    };
    telemetry.audio_levels = captured_audio_levels;

    // POSTMATCH_1: Post-session best-candidate matching. Run on the raw
    // telemetry before it's consumed by persist_session_log. Results are
    // stored in session_acc so get_final_session_report can use them via
    // report_final() without needing the (now-consumed) telemetry.
    if !telemetry.detected_onsets.is_empty() && !telemetry.expected_beats.is_empty() {
        let new_matches = crate::session_log::recompute_matches(
            &telemetry.detected_onsets,
            &telemetry.expected_beats,
        );
        let new_feedbacks =
            crate::session_log::matches_to_feedbacks(&new_matches, &telemetry.detected_onsets);

        // Compute accent (downbeat) hit counts for Default-mode accuracy display.
        // Build a set of expected-beat indices that are accent beats, then count
        // how many were matched (hit) vs. total non-idle accent beats.
        // NoActivity reason is excluded (player was in warmup/idle for that beat).
        let accent_beat_indices: std::collections::HashSet<u32> = telemetry.expected_beats
            .iter()
            .filter(|b| b.is_accent)
            .map(|b| b.index)
            .collect();
        let mut accent_hits = 0u32;
        let mut accent_beats = 0u32;
        for m in &new_matches {
            if accent_beat_indices.contains(&m.beat_index)
                && m.reason != crate::session_log::MatchReason::NoActivity
            {
                accent_beats += 1;
                if m.classification != crate::session_log::Classification::Miss {
                    accent_hits += 1;
                }
            }
        }

        if let Ok(mut acc) = session_acc.lock() {
            acc.set_recomputed_feedbacks(new_feedbacks);
            acc.set_accent_counts(accent_hits, accent_beats);
        }
    }

    // D1 — persist a diagnostic session log. Best-effort: failures here
    // must never fail the stop path (the user already finished playing,
    // we just lose retroactive debugging data). The log layer auto-prunes
    // to MAX_SESSION_LOGS so disk growth is bounded.
    if let Err(e) = persist_session_log(&session_acc, &state, &app_handle, &audio_input, telemetry)
    {
        eprintln!("[D1] failed to persist session log: {e}");
    }
    Ok(())
}

/// Build + save a D1 diagnostic session log from the accumulator state.
/// Returns Ok(()) when the log was saved OR when there was nothing to save
/// (no feedbacks AND no telemetry → an idle stop). Surface errors only
/// for the "we wanted to save but the save itself failed" path.
fn persist_session_log(
    session_acc: &State<'_, SharedSessionAccumulator>,
    state: &State<'_, SharedState>,
    app_handle: &AppHandle,
    audio_input: &State<'_, SharedAudioInput>,
    telemetry: crate::session_log::SessionTelemetry,
) -> Result<(), String> {
    // Snapshot accumulator state under its own lock window, then drop
    // the guard before any IO so we don't hold it across `fs::write`.
    //
    // Read from the FULL-session buffers (`all_feedbacks`/`all_segments`)
    // — not the mini-report window — so the persisted JSON's `report`
    // and `segments` cover the whole session. The window is wiped each
    // time JS fires `clearSession()` between per-segment mini-reports,
    // which used to leave the persisted log with only the last segment's
    // beats (typical artifact: `totalBeats=1, hits=0, score=20`).
    //
    // We still tolerate an empty accumulator: if the user presses End
    // Session right after a segment auto-ends with no further play, the
    // window is empty but the full-session totals + telemetry still
    // describe the session. The `is_empty` fast-path below filters out
    // truly idle stops.
    let (feedbacks, segments, mut start_secs, mut start_ms) = {
        let acc = session_acc
            .lock()
            .map_err(|e| format!("session_acc lock failed: {e}"))?;
        (
            acc.all_feedbacks().to_vec(),
            acc.all_segments().to_vec(),
            acc.session_start_secs().unwrap_or(0),
            acc.session_start_ms().unwrap_or(0),
        )
    };

    let telemetry_has_content = !telemetry.expected_beats.is_empty()
        || !telemetry.detected_onsets.is_empty()
        || !telemetry.matches.is_empty();
    if feedbacks.is_empty() && !telemetry_has_content {
        return Ok(());
    }

    // Defensive fallback for missing `session_start_*` — after the
    // window/all split, `mark_session_start` is preserved across
    // mid-session clears so this should never fire on the normal path.
    // Kept as a safety net for edge cases (legacy callers, tests, or
    // future code paths that bypass `start_evaluation`): recover the
    // session epoch from the earliest telemetry timestamp so the JSON's
    // `timestamp` / `durationMs` reflect the real session window instead
    // of 1970.
    if start_ms == 0 {
        let earliest = telemetry
            .expected_beats
            .first()
            .map(|b| b.timestamp_ms)
            .or_else(|| telemetry.detected_onsets.first().map(|o| o.timestamp_ms));
        if let Some(ms) = earliest {
            start_ms = ms;
            start_secs = ms / 1000;
        }
    }

    let (bpm, time_signature, subdivision, instrument) = {
        let s = state
            .lock()
            .map_err(|e| format!("state lock failed: {e}"))?;
        (s.bpm, s.time_signature, s.subdivision, s.instrument.clone())
    };

    let end_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(start_ms);
    let duration_ms = end_ms.saturating_sub(start_ms);

    let log = crate::session_log::build_log_from_session(
        bpm,
        time_signature,
        subdivision,
        start_secs,
        duration_ms,
        instrument,
        &feedbacks,
        segments,
        telemetry,
    );

    let dir = diagnostics_dir(app_handle)?;
    let json_path = crate::session_log::save_log(&dir, &log)?;

    // Dev-only: if session-audio recording was enabled, the AudioInput
    // has a `.wav.partial` waiting. Rename it to match the JSON stem so
    // the two files pair up obviously in `session_logs/`. Best-effort —
    // any failure logs but doesn't break the stop path.
    let partial_wav = audio_input
        .lock()
        .map_err(|e| format!("audio_input lock failed: {e}"))?
        .take_last_session_audio_path();
    if let Some(partial) = partial_wav {
        if let Some(target) = crate::session_audio::paired_wav_path(&json_path) {
            if let Err(e) = std::fs::rename(&partial, &target) {
                eprintln!(
                    "[session-audio] rename {} → {} failed: {e}",
                    partial.display(),
                    target.display()
                );
                // Leave the partial in place rather than deleting — the
                // raw bytes are still useful for manual debugging even if
                // the pairing didn't land.
            } else {
                eprintln!("[session-audio] paired WAV saved: {}", target.display());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_evaluation_state(audio_input: State<SharedAudioInput>) -> bool {
    let ai = audio_input.lock().unwrap_or_else(|e| e.into_inner());
    ai.is_active()
}

/// D4 — Signal A entry point. The JS layer calls this when the user
/// changes BPM, preset, time signature, or instrument. The timing
/// analyzer closes the open segment internally on its next poll
/// (`SegmentEndReason::SettingsChange`) so the next run of play scores
/// against fresh state. Per the plan, no `practice-segment-ended`
/// event fires — the coach speaks the boundary via the forced
/// `boundary_signal_a` gatekeeper event in the JS layer.
#[tauri::command]
pub fn notify_settings_change(timing_analyzer: State<SharedTimingAnalyzer>) -> Result<(), String> {
    let ta = timing_analyzer
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    ta.notify_settings_change();
    Ok(())
}

/// Force-close the open practice segment so that `get_session_report`
/// returns the IC/GA formula score instead of the legacy fallback.
/// Called by the JS falling-edge handler before fetching the mini-report.
/// Emits `practice-segment-ended` with `UserStopped` and calls
/// `push_segment()` via the `on_segment_end` callback.
/// Safe to call when no session is active (no-op).
#[tauri::command]
pub fn close_open_segment(timing_analyzer: State<SharedTimingAnalyzer>) -> Result<(), String> {
    let ta = timing_analyzer
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    ta.close_open_segment();
    Ok(())
}

#[tauri::command]
pub async fn get_session_report(
    session_acc: State<'_, SharedSessionAccumulator>,
) -> Result<Option<SessionReport>, String> {
    let acc = session_acc
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    if acc.is_empty() {
        Ok(None)
    } else {
        Ok(Some(acc.report()))
    }
}

/// Session-end report: uses `all_segments` (never cleared) so the score
/// reflects every segment from the full session even after `clearSession()`
/// wiped the per-exercise window buffer mid-session.
///
/// Intentionally separate from `get_session_report` — that command uses the
/// window buffer (`self.segments`) so mid-session mini-reports stay
/// per-exercise. Merging the two would make exercise-N mini-reports show a
/// cumulative score instead of exercise-N's individual score.
#[tauri::command]
pub async fn get_final_session_report(
    session_acc: State<'_, SharedSessionAccumulator>,
) -> Result<Option<SessionReport>, String> {
    let acc = session_acc
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    // Use all_segments; report_final() returns None-equivalent (legacy
    // formula) when all_segments is empty, but surface that as Ok(None)
    // here to keep the JS side consistent with get_session_report.
    if acc.all_segments().is_empty() && acc.is_empty() {
        Ok(None)
    } else {
        Ok(Some(acc.report_final()))
    }
}

#[tauri::command]
pub async fn clear_session(session_acc: State<'_, SharedSessionAccumulator>) -> Result<(), String> {
    // Mid-session clear: wipe only the per-segment mini-report window so
    // the next `get_session_report` reflects the next segment in
    // isolation. The full-session totals (`all_feedbacks`/`all_segments`)
    // and `session_start_*` are preserved so `persist_session_log` still
    // sees the whole session at stop time. Wiping them mid-session used
    // to leave the persisted D1 JSON with `totalBeats=1, hits=0,
    // score=20` even on long sessions — see `SessionAccumulator` doc.
    session_acc
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?
        .clear_segment_window();
    Ok(())
}

#[tauri::command]
pub fn save_session(
    session: crate::session::SavedSession,
    app_handle: AppHandle,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app_handle
        .store("settings.json")
        .map_err(|e| e.to_string())?;
    let mut history: Vec<crate::session::SavedSession> = store
        .get("evalSessionHistory")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    // Prepend new session at the front
    history.insert(0, session);
    // Cap at max
    history.truncate(crate::session::MAX_SESSION_HISTORY);
    store.set(
        "evalSessionHistory",
        serde_json::to_value(&history).unwrap(),
    );
    Ok(())
}

#[tauri::command]
pub fn get_session_history(app_handle: AppHandle) -> Vec<crate::session::SavedSession> {
    use tauri_plugin_store::StoreExt;
    app_handle
        .store("settings.json")
        .ok()
        .and_then(|store| {
            store
                .get("evalSessionHistory")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn delete_session(id: String, app_handle: AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app_handle
        .store("settings.json")
        .map_err(|e| e.to_string())?;
    let mut history: Vec<crate::session::SavedSession> = store
        .get("evalSessionHistory")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    history.retain(|s| s.id != id);
    store.set(
        "evalSessionHistory",
        serde_json::to_value(&history).unwrap(),
    );
    Ok(())
}

#[tauri::command]
pub fn clear_all_sessions(app_handle: AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app_handle
        .store("settings.json")
        .map_err(|e| e.to_string())?;
    let empty: Vec<crate::session::SavedSession> = Vec::new();
    store.set("evalSessionHistory", serde_json::to_value(&empty).unwrap());
    Ok(())
}

// ---------------------------------------------------------------------------
// Diagnostic Session Logs (D1)
//
// These are heavier per-session JSON dumps (raw onsets, expected beats,
// match decisions, etc.) used by the dev/debug pipeline. Storage path:
// `app_data_dir/session_logs/`. They are independent from
// `evalSessionHistory` above, which is the lightweight history shown
// in the UI.
// ---------------------------------------------------------------------------

fn diagnostics_dir(app_handle: &AppHandle) -> Result<std::path::PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))
}

#[tauri::command]
pub fn list_session_logs(app_handle: AppHandle) -> Result<Vec<String>, String> {
    let dir = diagnostics_dir(&app_handle)?;
    let paths = crate::session_log::list_log_paths(&dir)?;
    Ok(paths
        .into_iter()
        .filter_map(|p| p.to_str().map(|s| s.to_string()))
        .collect())
}

#[tauri::command]
pub fn get_session_log(path: String) -> Result<crate::session_log::SessionLog, String> {
    crate::session_log::load_log(std::path::Path::new(&path))
}

/// Dump every persisted log into a single combined JSON file under
/// `app_data_dir/exports/yames-session-logs-<unix>.json`. Returns the
/// destination path so the frontend can show / reveal it.
#[tauri::command]
pub fn export_session_logs(app_handle: AppHandle) -> Result<String, String> {
    let app_dir = diagnostics_dir(&app_handle)?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dest = app_dir
        .join("exports")
        .join(format!("yames-session-logs-{ts}.json"));
    crate::session_log::export_logs(&app_dir, &dest)?;
    dest.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "export path is not valid UTF-8".to_string())
}

#[tauri::command]
pub fn clear_session_logs(app_handle: AppHandle) -> Result<(), String> {
    let dir = diagnostics_dir(&app_handle)?;
    crate::session_log::clear_logs(&dir)
}

// ---------------------------------------------------------------------------
// Audio Input Recording / Playback
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn start_recording(audio_input: State<SharedAudioInput>) -> Result<(), String> {
    let ai = audio_input.lock().unwrap_or_else(|e| e.into_inner());
    if !ai.is_active() {
        return Err("Audio input is not active".to_string());
    }
    ai.start_recording();
    Ok(())
}

#[tauri::command]
pub fn stop_recording(audio_input: State<SharedAudioInput>) -> f32 {
    let mut ai = audio_input.lock().unwrap_or_else(|e| e.into_inner());
    ai.stop_recording()
}

#[tauri::command]
pub fn start_playback(
    audio_input: State<SharedAudioInput>,
    engine_state: State<EngineState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    // Use the same output device as the metronome engine
    let output_device_name = {
        let engine = engine_state.0.lock().unwrap();
        engine.device_name().map(|s| s.to_string())
    };
    let mut ai = audio_input.lock().unwrap_or_else(|e| e.into_inner());
    ai.start_playback(app_handle, output_device_name.as_deref())
}

#[tauri::command]
pub fn stop_playback(audio_input: State<SharedAudioInput>) {
    let mut ai = audio_input.lock().unwrap_or_else(|e| e.into_inner());
    ai.stop_playback();
}

#[tauri::command]
pub fn discard_recording(audio_input: State<SharedAudioInput>) {
    let mut ai = audio_input.lock().unwrap_or_else(|e| e.into_inner());
    ai.discard_recording();
}

#[tauri::command]
pub fn get_waveform(audio_input: State<SharedAudioInput>) -> Vec<f32> {
    let ai = audio_input.lock().unwrap_or_else(|e| e.into_inner());
    ai.get_waveform(100)
}

#[tauri::command]
pub fn set_input_gain(gain_db: f32, audio_input: State<SharedAudioInput>) {
    let gain_linear = 10.0_f32.powf(gain_db / 20.0);
    let ai = audio_input.lock().unwrap_or_else(|e| e.into_inner());
    ai.set_input_gain(gain_linear);
}

use crate::engine::AudioOutputDevice;

#[tauri::command]
pub fn list_audio_output_devices() -> Vec<AudioOutputDevice> {
    crate::engine::list_output_devices()
}

#[tauri::command]
pub fn set_audio_output_device(
    device_name: Option<String>,
    state: State<SharedState>,
    engine_state: State<EngineState>,
    app_handle: AppHandle,
) {
    // Persist the choice
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app_handle.store("settings.json") {
        match &device_name {
            Some(name) => store.set("audioOutputDevice", serde_json::json!(name)),
            None => store.set("audioOutputDevice", serde_json::Value::Null),
        }
    }

    let mut engine = engine_state.0.lock().unwrap();
    engine.set_device(device_name, state.inner().clone(), app_handle);
}

// ---------------------------------------------------------------------------
// Model download management
// ---------------------------------------------------------------------------

use crate::models;

pub struct DownloadState(pub std::sync::Mutex<Option<models::DownloadCancelFlag>>);

#[tauri::command]
pub fn get_model_status(app_handle: AppHandle) -> Result<models::ModelStatus, String> {
    models::check_model_status(&app_handle)
}

#[tauri::command]
pub fn write_model_chunk(
    app_handle: AppHandle,
    component: String,
    filename: String,
    data: Vec<u8>,
) -> Result<String, String> {
    models::write_model_file(&app_handle, &component, &filename, &data)
}

#[tauri::command]
pub fn get_models_path(app_handle: AppHandle) -> Result<String, String> {
    models::get_models_path(&app_handle)
}

#[tauri::command]
pub fn delete_models(app_handle: AppHandle, dl_state: State<DownloadState>) -> Result<(), String> {
    // Signal any in-flight download to abort BEFORE wiping the models
    // directory. Otherwise the download thread continues, sees its
    // partial-file destination vanish, and emits a confusing failure
    // event after the UI has already shown "removed". The cancel flag
    // is read at each curl progress tick so the thread bails on the
    // next chunk instead of writing into a deleted tree.
    {
        let mut guard = dl_state.0.lock().unwrap();
        if let Some(cancel) = guard.take() {
            cancel.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }
    models::delete_models(&app_handle)
}

#[tauri::command]
pub fn start_model_download(
    app_handle: AppHandle,
    url: String,
    component: String,
    filename: String,
    tier: String,
    dl_state: State<DownloadState>,
) -> Result<(), String> {
    let mut guard = dl_state.0.lock().unwrap();
    // Cancel any existing download first
    if let Some(old) = guard.take() {
        old.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    *guard = Some(cancel.clone());
    models::start_download(app_handle, url, component, filename, tier, cancel);
    Ok(())
}

#[tauri::command]
pub fn cancel_model_download(dl_state: State<DownloadState>) -> Result<(), String> {
    let mut guard = dl_state.0.lock().unwrap();
    if let Some(cancel) = guard.take() {
        cancel.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Coach LLM inference
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn load_coach_model(
    app_handle: AppHandle,
    engine: State<'_, SharedCoachEngine>,
) -> Result<bool, String> {
    let model_path = {
        let dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {e}"))?;
        dir.join("models").join("brain").join("model.bin")
    };

    let mut lock = engine.lock().map_err(|e| format!("Lock failed: {e}"))?;
    crate::coach::load_model(&mut lock, &model_path)
}

#[tauri::command]
pub async fn coach_generate(
    engine: State<'_, SharedCoachEngine>,
    context: String,
) -> Result<String, String> {
    // LLM inference takes ~200-2000ms and the templated fallback can
    // still spend ~1-10ms parsing the context string. Holding the
    // CoachEngine Mutex on a tokio worker for that whole window blocks
    // every concurrent async command (boundary IPC, evaluation
    // toggles, audio device polling, …) — the same hazard `tts_speak`
    // already guards against via `spawn_blocking`. Move the inference
    // off the async runtime so generations queue behind the mutex
    // without freezing the rest of the command surface.
    let engine_arc: SharedCoachEngine = engine.inner().clone();
    let ctx_owned = context;
    tokio::task::spawn_blocking(move || {
        // ROADMAP §3: the generation thread runs below normal priority so a
        // multi-second CPU inference can never preempt the audio path. The
        // cpal callback thread is untouched — the OS already schedules it
        // real-time and nothing here goes near it.
        with_below_normal_priority(|| {
            let lock = engine_arc.lock().map_err(|e| format!("Lock failed: {e}"))?;
            crate::coach::generate(&lock, &ctx_owned)
        })
    })
    .await
    .map_err(|e| format!("coach_generate join failed: {e}"))?
}

/// Run `f` on the current thread at below-normal scheduling priority,
/// restoring the previous priority afterwards.
///
/// The restore is not optional: tokio's `spawn_blocking` pool *reuses*
/// threads, so a permanent demotion here would silently slow down whatever
/// blocking task (TTS synthesis, device enumeration) landed on the same
/// thread next.
fn with_below_normal_priority<T>(f: impl FnOnce() -> T) -> T {
    let restore = lower_current_thread_priority();
    let out = f();
    restore();
    out
}

#[cfg(windows)]
fn lower_current_thread_priority() -> impl FnOnce() {
    use windows_sys::Win32::System::Threading::{
        GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL, THREAD_PRIORITY_NORMAL,
    };
    // SAFETY: `GetCurrentThread` returns a pseudo-handle that needs no close,
    // and `SetThreadPriority` only mutates this thread's scheduling class.
    let ok = unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL) } != 0;
    move || {
        if ok {
            unsafe { SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_NORMAL) };
        }
    }
}

#[cfg(unix)]
fn lower_current_thread_priority() -> impl FnOnce() {
    // On macOS `PRIO_DARWIN_THREAD` scopes `setpriority` to the calling
    // thread. On Linux `PRIO_PROCESS` with `who == 0` is already per-thread
    // (a documented Linux divergence from POSIX), which is exactly what we
    // want here — a process-wide nice bump would also slow the audio threads.
    #[cfg(target_os = "macos")]
    let which = libc::PRIO_DARWIN_THREAD;
    #[cfg(not(target_os = "macos"))]
    let which = libc::PRIO_PROCESS;

    // SAFETY: plain libc scheduling calls scoped to the current thread.
    // `getpriority` overloads -1 as both "nice -1" and "error"; distinguishing
    // them needs an errno reset, and the only consequence of guessing wrong is
    // restoring a tokio worker to nice 0 instead of nice -1, so treat it as 0.
    let previous = match unsafe { libc::getpriority(which, 0) } {
        -1 => 0,
        n => n,
    };
    let ok = unsafe { libc::setpriority(which, 0, previous.saturating_add(5)) } == 0;
    move || {
        if ok {
            unsafe { libc::setpriority(which, 0, previous) };
        }
    }
}

#[cfg(not(any(windows, unix)))]
fn lower_current_thread_priority() -> impl FnOnce() {
    || {}
}

#[tauri::command]
pub fn is_coach_loaded(engine: State<'_, SharedCoachEngine>) -> bool {
    engine.lock().map(|lock| lock.is_loaded()).unwrap_or(false)
}

/// What the coach can actually do in THIS build, right now.
///
/// Deliberately separate from `ModelStatus` (which only answers "are
/// the weights on disk"). The two together are what the Settings
/// status line needs: weights present + `llm_compiled` + resident tells
/// you whether the user is getting a real brain, a downloaded-but-
/// unusable one, or the template coach.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CoachCapabilities {
    /// Whether the binary was built with the `coach-llm` feature.
    #[serde(rename = "llmCompiled")]
    pub llm_compiled: bool,
    /// Whether a real model is loaded in memory right now.
    #[serde(rename = "modelResident")]
    pub model_resident: bool,
    /// Compile-time llama.cpp backend: metal / vulkan / cpu / none.
    pub backend: String,
    /// File name of the resident model (null in template mode).
    #[serde(rename = "modelName")]
    pub model_name: Option<String>,
    /// Rough resident-set estimate while generating: weights × 1.2 to
    /// cover the KV cache and llama.cpp scratch buffers. 0 when no
    /// model file is on disk.
    #[serde(rename = "ramEstimateMb")]
    pub ram_estimate_mb: u64,
}

#[tauri::command]
pub fn get_coach_capabilities(
    app_handle: AppHandle,
    engine: State<'_, SharedCoachEngine>,
) -> Result<CoachCapabilities, String> {
    let (model_resident, model_name) = engine
        .lock()
        .map(|lock| (lock.is_loaded(), lock.model_name().map(str::to_string)))
        .unwrap_or((false, None));

    let model_path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?
        .join("models")
        .join("brain")
        .join("model.bin");
    let ram_estimate_mb = std::fs::metadata(&model_path)
        .map(|m| ((m.len() as f64 * 1.2) / (1024.0 * 1024.0)).round() as u64)
        .unwrap_or(0);

    Ok(CoachCapabilities {
        llm_compiled: crate::coach::llm_compiled(),
        model_resident,
        backend: crate::coach::backend_name().to_string(),
        model_name,
        ram_estimate_mb,
    })
}

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn tts_speak(
    app_handle: AppHandle,
    tts: State<'_, SharedTts>,
    tts_active: State<'_, SharedTtsActive>,
    state: State<'_, SharedState>,
    dim_state: State<'_, SharedTtsDim>,
    text: String,
) -> Result<(), String> {
    // Interrupt any in-flight speech BEFORE we dim — a duplicate dim
    // entry from a rapid-fire click would still be counted on
    // dim_exit, leaving the metronome stuck quiet. Cancelling here
    // also covers the per-voice-preview click pattern the user asked
    // for: clicking another voice should stop the current one.
    crate::tts::cancel_active_speech(tts_active.inner());

    // Dim metronome volume during speech (temporary, not persisted).
    //
    // Nested-dim safety: two TTS calls can land concurrently (e.g.
    // greeting paraphrase still talking when the first coach-tip
    // fires). Without coordination, the second call would capture the
    // already-dimmed volume as its "original" and the restored volume
    // would end up stuck at ~15% of the user's real setting. The
    // `dim_enter` helper records the original ONCE on the outermost
    // dim and tells us when to skip the AppState write; the
    // symmetric `dim_exit` below only triggers a restore when the
    // counter drains to zero. Pure helpers live in `tts.rs` so the
    // invariants are unit-tested.
    {
        let mut dim = dim_state.lock().unwrap();
        // Hold the state lock across the read-then-conditional-write so
        // a concurrent `set_volume` (e.g. the user dragging the volume
        // slider mid-greeting) can't land between the "live_volume" read
        // and the dim write — that would let dim_enter capture a stale
        // "original" and `dim_exit` later restore over the user's new
        // value. Acquiring `dim` first keeps the lock order consistent
        // with `dim_exit` below; `set_volume` only takes `state` so no
        // dim/state cross-deadlock is possible.
        let mut s = state.lock().unwrap();
        if let Some(target) = crate::tts::dim_enter(&mut dim, s.volume) {
            s.volume = target;
        }
    }

    // Snapshot the engine state ONCE up front so the heavy subprocess
    // work can run without holding the engine mutex. Pre-fix, holding
    // the engine lock for the full ~1-5s speak() serialized every
    // concurrent `tts_speak` — clicking Voice B while Voice A was
    // playing would queue behind A's speech instead of interrupting
    // it. The active-state cancellation above gives us the interrupt
    // semantic; releasing the lock here lets the new call actually
    // proceed concurrently to do the cancelling.
    let snapshot = {
        let engine = tts.lock().map_err(|e| format!("Lock failed: {e}"))?;
        engine.snapshot()
    }
    .ok_or_else(|| "Models directory not set".to_string())?;

    let tts_active_arc: SharedTtsActive = tts_active.inner().clone();
    let text_owned = text;
    let app_handle_for_emit = app_handle.clone();
    // Push subprocess I/O onto tokio's blocking pool so async workers
    // stay free for boundary IPC, evaluation toggles, settings, etc.
    let join_result = tokio::task::spawn_blocking(move || {
        crate::tts::speak_standalone(&snapshot, &text_owned, &tts_active_arc, || {
            let _ = app_handle_for_emit.emit("tts-speech-started", ());
        })
    })
    .await;

    // `tts-speech-ended` fires for EVERY exit path of speak_standalone:
    // natural completion, user-driven interrupt (another voice click /
    // `tts_stop`), and Piper/afplay errors that bubbled up. The Settings
    // voice-preview UI uses this to clear its "speaking" indicator at
    // the EXACT moment audio actually stops, instead of a coarse 3.5 s
    // timer that drifted on long/short lines and never honoured
    // interrupts. Emit BEFORE we unwind the dim so the indicator clears
    // in lock-step with the audible end of speech — the spawn_blocking
    // join error path also gets a clean ended event, so the frontend
    // pending-counter never gets stuck above zero. Each `tts_speak`
    // call produces exactly one `tts-speech-ended`, so the counter can
    // be incremented per click and decremented per event.
    let _ = app_handle.emit("tts-speech-ended", ());

    // Restore original volume only when this is the outermost dim
    // releasing. Inner dims are no-ops on restore so a concurrent
    // greeting+tip doesn't stomp on the user-visible value mid-speech.
    // Same dim-then-state lock order as the entry block above keeps the
    // capture/restore symmetrical and consistent.
    {
        let mut dim = dim_state.lock().unwrap();
        if let Some(orig) = crate::tts::dim_exit(&mut dim) {
            state.lock().unwrap().volume = orig;
        }
    }

    join_result.map_err(|e| format!("TTS task join failed: {e}"))?
}

/// Cancel any in-flight TTS speech. Used by the Settings voice-preview
/// path so clicking a second voice cuts off the first one's audio
/// instead of queueing behind it. Idempotent — a no-op when nothing
/// is currently speaking.
#[tauri::command]
pub fn tts_stop(tts_active: State<'_, SharedTtsActive>) {
    crate::tts::cancel_active_speech(tts_active.inner());
}

#[tauri::command]
pub fn tts_set_voice(tts: State<'_, SharedTts>, voice: String) {
    if let Ok(mut engine) = tts.lock() {
        engine.set_voice(&voice);
    }
}

/// Set the coach voice playback volume (0.0..=1.0). Stored on the TtsEngine
/// and applied to the next `afplay` invocation via the `-v` flag.
#[tauri::command]
pub fn tts_set_volume(tts: State<'_, SharedTts>, volume: f32) {
    if let Ok(mut engine) = tts.lock() {
        engine.set_volume(volume);
    }
}

#[tauri::command]
pub fn tts_list_voices(tts: State<'_, SharedTts>) -> Vec<(String, String)> {
    tts.lock()
        .map(|e| e.list_available_voices())
        .unwrap_or_default()
}

/// Per-voice readiness for the Settings UI — the JS layer renders the
/// download button when `engineMissing` OR `onnxMissing` OR `corrupted`,
/// so the user can repair a single voice without nuking the brain.
#[tauri::command]
pub fn tts_voice_diagnostics(tts: State<'_, SharedTts>) -> Vec<crate::tts::VoiceDiagnostic> {
    tts.lock()
        .map(|e| e.list_voice_diagnostics())
        .unwrap_or_default()
}

/// Repair-download a single voice. Re-installs the Piper engine if
/// it's missing or partial (the dylib-missing case) AND fetches that
/// voice's `.onnx` + `.onnx.json` sidecar. The frontend wires the
/// per-voice "Download" buttons in `CoachSettingsSection` to this
/// command, so a single missing/corrupted voice can be fixed without
/// re-downloading the whole brain.
///
/// Emits the same `model-download-progress` / `model-download-complete`
/// events as `start_model_download` so the existing download UI works
/// unchanged. `tier` is omitted from the complete event so the
/// frontend's "tier completed" branch doesn't false-fire — repairs
/// don't change the active brain tier.
#[tauri::command]
pub fn start_voice_repair(
    app_handle: AppHandle,
    voice_id: String,
    dl_state: State<DownloadState>,
) -> Result<(), String> {
    let mut guard = dl_state.0.lock().unwrap();
    if let Some(old) = guard.take() {
        old.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    *guard = Some(cancel.clone());
    models::start_voice_repair(app_handle, voice_id, cancel);
    Ok(())
}

/// Called by the frontend after React has fully mounted.
///
/// This is the authoritative moment to show the main window: macOS
/// NSWindowRestoration and any other async OS window-management has
/// long settled by the time the JS runtime has booted and React has
/// committed its first render. We re-read the saved position from the
/// store and call set_position() + show() in one shot, so the window
/// appears exactly where the user left it with no visible jump.
#[tauri::command]
pub fn app_ready(app_handle: AppHandle) {
    use tauri_plugin_store::StoreExt;

    let store = match app_handle.store("settings.json") {
        Ok(s) => s,
        Err(_) => return,
    };

    // Only show the main window if that's what was last active.
    let last_window = store
        .get("lastWindow")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "floating".to_string());

    if last_window != "main" {
        return;
    }

    let main_win = match app_handle.get_webview_window("main") {
        Some(w) => w,
        None => return,
    };

    // Re-apply the saved position. By this point macOS restoration has
    // settled, so this call is the last word on where the window sits.
    if let Some(pos) = store.get("window_position_main") {
        let x = pos.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let y = pos.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        if crate::is_position_visible(x, y, &main_win) {
            let _ = main_win.set_position(tauri::PhysicalPosition::new(x, y));
        } else {
            let _ = main_win.center();
        }
    } else {
        let _ = main_win.center();
    }

    let _ = main_win.show();
    let _ = main_win.set_focus();
}

// ---------------------------------------------------------------------------
// Tests — the pure halves of the beat-group / free-mode commands. The
// `#[tauri::command]` wrappers need a live `State` + `AppHandle`, so the
// validation and the FREE-mode invariant are extracted above and tested here.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_beat_groups_accepts_a_full_16_beat_free_bar() {
        assert!(validate_beat_groups(&[16]).is_ok());
    }

    #[test]
    fn validate_beat_groups_accepts_the_minimum_single_beat() {
        assert!(validate_beat_groups(&[1]).is_ok());
    }

    #[test]
    fn validate_beat_groups_rejects_a_group_of_17() {
        let err = validate_beat_groups(&[17]).unwrap_err();
        assert_eq!(err, "each group: 1–16 beats");
    }

    #[test]
    fn validate_beat_groups_rejects_a_zero_beat_group() {
        assert!(validate_beat_groups(&[0]).is_err());
        assert!(validate_beat_groups(&[3, 0, 2]).is_err());
    }

    #[test]
    fn validate_beat_groups_rejects_totals_over_16() {
        // Every group is individually legal; only the sum breaks the cap.
        let err = validate_beat_groups(&[9, 8]).unwrap_err();
        assert_eq!(err, "total beats must be ≤ 16");
        assert!(validate_beat_groups(&[4, 4, 4, 4, 4]).is_err());
    }

    #[test]
    fn validate_beat_groups_rejects_empty_and_over_six_groups() {
        assert!(validate_beat_groups(&[]).is_err());
        assert!(validate_beat_groups(&[1, 1, 1, 1, 1, 1, 1]).is_err());
    }

    #[test]
    fn validate_beat_groups_accepts_grouped_meters_summing_to_16() {
        assert!(validate_beat_groups(&[3, 2, 2]).is_ok());
        assert!(validate_beat_groups(&[4, 4, 4, 4]).is_ok());
    }

    #[test]
    fn collapse_to_free_flattens_a_grouped_meter_preserving_the_total() {
        assert_eq!(collapse_to_free(&[3, 2, 2]), (vec![7], 7));
        assert_eq!(collapse_to_free(&[3, 3, 3, 3]), (vec![12], 12));
    }

    #[test]
    fn collapse_to_free_is_idempotent_on_an_already_flat_bar() {
        assert_eq!(collapse_to_free(&[5]), (vec![5], 5));
    }

    #[test]
    fn collapse_to_free_result_is_always_valid() {
        for groups in [
            vec![1],
            vec![4],
            vec![3, 2, 2],
            vec![4, 4, 4, 4],
            vec![],
            vec![16, 16],
        ] {
            let (collapsed, total) = collapse_to_free(&groups);
            assert!(
                validate_beat_groups(&collapsed).is_ok(),
                "collapse_to_free({groups:?}) produced {collapsed:?}"
            );
            assert_eq!(collapsed, vec![total]);
        }
    }
}
