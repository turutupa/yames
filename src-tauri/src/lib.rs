mod commands;
mod engine;
mod state;

use commands::{
    get_state, get_active_tab, get_last_window, get_calibration_offset, save_window_position, save_window_size, set_accent_color, set_active_tab, set_always_on_top, set_bpm, set_calibration_offset, set_corner,
    set_playing, set_sound_type, set_subdivision, set_theme, set_time_signature, set_volume, set_widget_mode,
    show_floating, show_main, toggle_playback, configure_speed_ramp, start_speed_ramp,
    start_speed_ramp_from, stop_speed_ramp, toggle_fullscreen, set_fullscreen, EngineState,
};
use engine::MetronomeEngine;
use state::{create_shared_state, SharedState};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let shared_state = create_shared_state();

            // Restore saved settings from store
            {
                let store = app.store("settings.json")?;
                let mut s = shared_state.lock().unwrap();
                if let Some(v) = store.get("bpm").and_then(|v| v.as_u64()) {
                    s.bpm = (v as u16).clamp(20, 300);
                }
                if let Some(v) = store.get("subdivision").and_then(|v| v.as_u64()) {
                    s.subdivision = (v as u8).clamp(1, 6);
                }
                if let Some(v) = store.get("mode").and_then(|v| v.as_str().map(String::from)) {
                    s.mode = v;
                }
                if let Some(v) = store.get("corner").and_then(|v| v.as_str().map(String::from)) {
                    s.corner = v;
                }
                if let Some(v) = store.get("alwaysOnTop").and_then(|v| v.as_bool()) {
                    s.always_on_top = v;
                }
                if let Some(v) = store.get("accentColor").and_then(|v| v.as_str().map(String::from)) {
                    s.accent_color = v;
                }
                if let Some(v) = store.get("theme").and_then(|v| v.as_str().map(String::from)) {
                    s.theme = v;
                }
                if let Some(v) = store.get("volume").and_then(|v| v.as_f64()) {
                    s.volume = (v as f32).clamp(0.0, 1.0);
                }
                if let Some(v) = store.get("soundType").and_then(|v| v.as_str().map(String::from)) {
                    s.sound_type = v;
                }
                if let Some(v) = store.get("timeSignature").and_then(|v| v.as_u64()) {
                    s.time_signature = v as u8;
                }
                if let Some(v) = store.get("speedRamp") {
                    if let Some(sb) = v.get("startBpm").and_then(|x| x.as_u64()) {
                        s.speed_ramp.start_bpm = (sb as u16).clamp(20, 300);
                    }
                    if let Some(tb) = v.get("targetBpm").and_then(|x| x.as_u64()) {
                        s.speed_ramp.target_bpm = (tb as u16).clamp(20, 300);
                    }
                    if let Some(inc) = v.get("increment").and_then(|x| x.as_u64()) {
                        s.speed_ramp.increment = (inc as u16).clamp(1, 50);
                    }
                    if let Some(dec) = v.get("decrement").and_then(|x| x.as_u64()) {
                        s.speed_ramp.decrement = (dec as u16).clamp(1, 50);
                    }
                    if let Some(bps) = v.get("barsPerStep").and_then(|x| x.as_u64()) {
                        s.speed_ramp.bars_per_step = (bps as u8).clamp(1, 32);
                    }
                    if let Some(bpb) = v.get("beatsPerBar").and_then(|x| x.as_u64()) {
                        s.speed_ramp.beats_per_bar = (bpb as u8).clamp(1, 12);
                    }
                    if let Some(m) = v.get("mode").and_then(|x| x.as_str()) {
                        s.speed_ramp.mode = m.to_string();
                    }
                    if let Some(c) = v.get("cyclic").and_then(|x| x.as_bool()) {
                        s.speed_ramp.cyclic = c;
                    }
                    s.speed_ramp.current_bpm = s.speed_ramp.start_bpm;
                }
            }

            app.manage(shared_state);
            app.manage(EngineState(Mutex::new(MetronomeEngine::new())));

            // Set up system tray
            let show_i = MenuItem::with_id(app, "show", "Show Mustik", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Mustik")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        // Hide floating, show main
                        if let Some(float_win) = app.get_webview_window("floating") {
                            let _ = float_win.hide();
                        }
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Start with the last-used window visible
            let last_window = {
                let store = app.store("settings.json")?;
                store.get("lastWindow")
                    .and_then(|v| v.as_str().map(String::from))
                    .unwrap_or_else(|| "floating".to_string())
            };

            if let Some(main_win) = app.get_webview_window("main") {
                if last_window == "main" {
                    let _ = main_win.show();
                    let _ = main_win.set_focus();
                } else {
                    let _ = main_win.hide();
                }
                // Apply saved always-on-top setting for main window
                let aot = { app.state::<SharedState>().lock().unwrap().always_on_top };
                let _ = main_win.set_always_on_top(aot);

                // Restore saved main window size
                let store = app.store("settings.json")?;
                if let Some(size) = store.get("window_size_main") {
                    if let (Some(w), Some(h)) = (size.get("width").and_then(|v| v.as_u64()), size.get("height").and_then(|v| v.as_u64())) {
                        let _ = main_win.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
                    }
                }
                // Restore saved main window position
                if let Some(pos) = store.get("window_position_main") {
                    if let (Some(x), Some(y)) = (pos.get("x").and_then(|v| v.as_i64()), pos.get("y").and_then(|v| v.as_i64())) {
                        let _ = main_win.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                    }
                }
            }

            // Restore saved floating widget position (and visibility)
            if let Some(float_win) = app.get_webview_window("floating") {
                if last_window != "main" {
                    let _ = float_win.show();
                } else {
                    let _ = float_win.hide();
                }
                let store = app.store("settings.json")?;
                if let Some(pos) = store.get("window_position_floating") {
                    if let (Some(x), Some(y)) = (pos.get("x").and_then(|v| v.as_i64()), pos.get("y").and_then(|v| v.as_i64())) {
                        let _ = float_win.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                    }
                }
            }

            // Register global shortcuts
            setup_global_shortcuts(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_bpm,
            set_subdivision,
            toggle_playback,
            set_playing,
            set_widget_mode,
            set_corner,
            set_always_on_top,
            set_accent_color,
            set_theme,
            set_volume,
            show_main,
            show_floating,
            save_window_position,
            save_window_size,
            set_sound_type,
            set_time_signature,
            configure_speed_ramp,
            start_speed_ramp,
            start_speed_ramp_from,
            stop_speed_ramp,
            toggle_fullscreen,
            set_fullscreen,
            set_active_tab,
            get_active_tab,
            get_last_window,
            set_calibration_offset,
            get_calibration_offset,
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::Resized(size) => {
                    // Save main window size on resize
                    if window.label() == "main" && size.width > 0 && size.height > 0 {
                        use tauri_plugin_store::StoreExt;
                        if let Ok(store) = window.app_handle().store("settings.json") {
                            store.set("window_size_main", serde_json::json!({ "width": size.width, "height": size.height }));
                        }
                    }
                }
                tauri::WindowEvent::Moved(pos) => {
                    // Save main window position on move
                    if window.label() == "main" {
                        use tauri_plugin_store::StoreExt;
                        if let Ok(store) = window.app_handle().store("settings.json") {
                            store.set("window_position_main", serde_json::json!({ "x": pos.x, "y": pos.y }));
                        }
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    // Stop the engine + kill audio thread when the app is about to close
                    if window.app_handle().webview_windows().len() <= 1 {
                        if let Some(engine_state) = window.try_state::<EngineState>() {
                            let mut engine = engine_state.0.lock().unwrap();
                            engine.shutdown();
                        }
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Mustik");
}

fn setup_global_shortcuts(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    fn persist(app_handle: &AppHandle, shared: &state::SharedState) {
        use tauri_plugin_store::StoreExt;
        if let Ok(store) = app_handle.store("settings.json") {
            let s = shared.lock().unwrap();
            store.set("bpm", serde_json::json!(s.bpm));
            store.set("subdivision", serde_json::json!(s.subdivision));
            store.set("mode", serde_json::json!(s.mode));
            store.set("corner", serde_json::json!(s.corner));
            store.set("alwaysOnTop", serde_json::json!(s.always_on_top));
            store.set("accentColor", serde_json::json!(s.accent_color));
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

    // Cmd+Shift+Space → Play / Stop
    let app_handle = app.handle().clone();
    app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+Space", move |_app, _shortcut, event| {
        if event.state != ShortcutState::Pressed { return; }
        let state: tauri::State<state::SharedState> = app_handle.state();
        let engine_state: tauri::State<EngineState> = app_handle.state();
        let is_playing = state.lock().unwrap().is_playing;

        let mut engine = engine_state.0.lock().unwrap();
        if is_playing {
            engine.stop();
            state.lock().unwrap().is_playing = false;
        } else {
            engine.start(state.inner().clone(), app_handle.clone());
            state.lock().unwrap().is_playing = true;
        }
        let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
    })?;

    // Cmd+Shift+Up → BPM +5
    let app_handle = app.handle().clone();
    app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+Up", move |_app, _shortcut, event| {
        if event.state != ShortcutState::Pressed { return; }
        let state: tauri::State<state::SharedState> = app_handle.state();
        {
            let mut s = state.lock().unwrap();
            s.bpm = (s.bpm + 5).min(300);
        }
        let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
        persist(&app_handle, &state);
    })?;

    // Cmd+Shift+Down → BPM -5
    let app_handle = app.handle().clone();
    app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+Down", move |_app, _shortcut, event| {
        if event.state != ShortcutState::Pressed { return; }
        let state: tauri::State<state::SharedState> = app_handle.state();
        {
            let mut s = state.lock().unwrap();
            s.bpm = (s.bpm.saturating_sub(5)).max(20);
        }
        let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
        persist(&app_handle, &state);
    })?;

    // Cmd+Shift+Alt+Up → BPM +1
    let app_handle = app.handle().clone();
    app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+Alt+Up", move |_app, _shortcut, event| {
        if event.state != ShortcutState::Pressed { return; }
        let state: tauri::State<state::SharedState> = app_handle.state();
        {
            let mut s = state.lock().unwrap();
            s.bpm = (s.bpm + 1).min(300);
        }
        let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
        persist(&app_handle, &state);
    })?;

    // Cmd+Shift+Alt+Down → BPM -1
    let app_handle = app.handle().clone();
    app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+Alt+Down", move |_app, _shortcut, event| {
        if event.state != ShortcutState::Pressed { return; }
        let state: tauri::State<state::SharedState> = app_handle.state();
        {
            let mut s = state.lock().unwrap();
            s.bpm = s.bpm.saturating_sub(1).max(20);
        }
        let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
        persist(&app_handle, &state);
    })?;

    // Cmd+Shift+M → Toggle compact/comfortable widget mode
    let app_handle = app.handle().clone();
    app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+M", move |_app, _shortcut, event| {
        if event.state != ShortcutState::Pressed { return; }
        let state: tauri::State<state::SharedState> = app_handle.state();
        {
            let mut s = state.lock().unwrap();
            s.mode = if s.mode == "compact" {
                "comfortable".to_string()
            } else {
                "compact".to_string()
            };
        }
        let _ = app_handle.emit("state-changed", &*state.lock().unwrap());
        persist(&app_handle, &state);
    })?;

    // Cmd+Shift+O → Toggle between main window and floating widget
    let app_handle = app.handle().clone();
    app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+O", move |_app, _shortcut, event| {
        if event.state != ShortcutState::Pressed { return; }
        if let Some(main_win) = app_handle.get_webview_window("main") {
            if let Some(float_win) = app_handle.get_webview_window("floating") {
                let main_visible = main_win.is_visible().unwrap_or(false);
                if main_visible {
                    let _ = main_win.hide();
                    let _ = float_win.show();
                } else {
                    let _ = float_win.hide();
                    let _ = main_win.show();
                    let _ = main_win.set_focus();
                }
                // Persist which window is now visible
                use tauri_plugin_store::StoreExt;
                if let Ok(store) = app_handle.store("settings.json") {
                    store.set("lastWindow", serde_json::json!(if main_visible { "floating" } else { "main" }));
                }
            }
        }
    })?;

    Ok(())
}
