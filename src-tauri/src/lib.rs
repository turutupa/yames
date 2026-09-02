mod audio_input;
mod calibration_cache;
mod clock;
mod coach;
mod commands;
mod engine;
pub mod instrument;
mod midi;
mod models;
mod onset;
// `session`, `session_log`, and `timing` are exposed `pub` so the
// integration tests in `tests/dsp_fixtures.rs` can import
// `score_feedbacks`, `BeatFeedback`, and `SessionReport` directly.
// The crate's actual API surface is still defined by the Tauri command
// handlers in `commands.rs` — these `pub` modules are an
// implementation detail visible only to the test harness.
pub mod session;
mod session_audio;
pub mod session_log;
mod state;
pub mod timing;
mod tts;

/// Everything `src/bin/click-jitter-probe.rs` needs, and nothing more.
///
/// The probe is a separate crate (Cargo compiles `src/bin/*` against the
/// `yames_lib` rlib), so it can only see `pub` items. Rather than making
/// `engine`, `state`, `coach` and `commands` public wholesale — they are
/// implementation details of the Tauri command surface — this facade
/// re-exports the exact handful of symbols the audio-safety gate uses.
pub mod probe {
    pub use crate::clock::now_ns;
    pub use crate::engine::{CallbackProbe, CallbackSample, MetronomeEngine};
    pub use crate::state::{create_shared_state, AppState, SharedState};
    pub use crate::timing::create_beat_log;

    #[cfg(feature = "coach-llm")]
    pub use crate::coach::{generate, load_model, CoachEngine};
}

use audio_input::create_shared_audio_input;
use calibration_cache::create_shared_calibration_cache;
use coach::create_shared_engine;
use commands::{
    cancel_model_download, clear_all_sessions, clear_calibration_cache_entry, clear_midi_binding,
    clear_session, clear_session_logs, coach_generate, configure_speed_ramp, connect_midi_device,
    delete_models, delete_preset, delete_session, discard_recording, disconnect_midi_device,
    export_session_logs, get_active_tab, get_calibration_cache_entry, get_calibration_offset,
    get_coach_capabilities, get_evaluation_state, get_final_session_report, get_midi_bindings,
    get_model_status,
    get_models_path, get_session_history, get_session_log, get_session_report, get_state,
    get_system_memory_mb,
    get_waveform, is_coach_loaded, list_audio_input_devices, list_audio_output_devices,
    list_calibration_cache, list_midi_devices, list_presets, list_session_logs, load_coach_model,
    close_open_segment, notify_settings_change, open_url, reorder_presets, save_preset, save_session,
    save_window_position, set_active_tab, set_always_on_top,
    set_audio_output_device, set_bpm, set_calibration_offset, set_input_gain, set_instrument,
    set_beat_groups, set_free_mode, set_midi_binding, set_playing, set_sound_type, set_subdivision, set_theme,
    app_ready, set_volume, set_widget_always_on_top, set_widget_mode, show_floating, show_main,
    start_evaluation, start_model_download, start_playback, start_recording, start_speed_ramp,
    start_speed_ramp_from, start_voice_repair, stop_evaluation, stop_playback, stop_recording,
    stop_speed_ramp, toggle_playback, tts_list_voices, tts_set_voice, tts_set_volume, tts_speak,
    tts_stop, tts_voice_diagnostics, write_model_chunk, DownloadState, EngineState,
};
use engine::MetronomeEngine;
use midi::create_shared_midi;
use onset::{create_shared_onset_detector, SharedTempoContext, TempoContext};
use session::create_shared_session_accumulator;
use state::{create_shared_state, SharedState};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_store::StoreExt;
use timing::{create_beat_log, TimingAnalyzer};
use tts::{create_shared_tts, create_shared_tts_active, create_shared_tts_dim};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Loud, one-shot banner so the dev can see at process start whether
    // the session-audio WAV dump is armed. In release builds the gate is
    // always false (cfg(debug_assertions) gate inside is_enabled).
    if session_audio::is_enabled() {
        eprintln!(
            "[yames] session-audio recording ENABLED (debug build default). \
             Each session will dump a paired .wav next to its .json log. \
             Set {}=1 to disable.",
            session_audio::DISABLE_ENV_VAR
        );
    } else {
        // We only reach this branch in two cases: (1) release build,
        // where recording is hard-coded off, or (2) the dev explicitly
        // set DISABLE_ENV_VAR. The banner doesn't try to distinguish —
        // either way, no WAVs will be written.
        eprintln!("[yames] session-audio recording disabled.");
    }

    // Startup-complete flag: gates the WindowEvent::Moved handler so that
    // position moves that happen during app initialization (centering, set_position
    // restore) don't overwrite the persisted position in the store.
    let startup_complete = Arc::new(AtomicBool::new(false));
    let startup_complete_events = Arc::clone(&startup_complete);

    // tauri_plugin_decorum is Win/Linux only — its init() panics on macOS (cocoa null ptr).
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    #[cfg(not(target_os = "macos"))]
    let builder = builder.plugin(tauri_plugin_decorum::init());

    builder.setup(move |app| {
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
                if let Some(v) = store.get("widgetAlwaysOnTop").and_then(|v| v.as_bool()) {
                    s.widget_always_on_top = v;
                }
                if let Some(v) = store.get("accentColor").and_then(|v| v.as_str().map(String::from)) {
                    s.accent_color = v;
                }
                if let Some(v) = store.get("theme").and_then(|v| v.as_str().map(String::from)) {
                    s.theme = v;
                }
                if let Some(v) = store.get("volume").and_then(|v| v.as_f64()) {
                    let vol = (v as f32).clamp(0.0, 1.0);
                    s.volume = vol;
                    s.volume_real = vol; // keep shadow in sync with loaded value
                }
                if let Some(v) = store.get("soundType").and_then(|v| v.as_str().map(String::from)) {
                    s.sound_type = v;
                }
                if let Some(v) = store.get("timeSignature").and_then(|v| v.as_u64()) {
                    s.time_signature = v as u8;
                }
                // Beat groups + FREE mode — restored together, because the
                // two have to agree.
                //
                // The stored grouping goes through the same validator as the
                // `set_beat_groups` command: anything the command would
                // reject (empty, too many groups, a group over the cap, or a
                // bar total over 16) falls through to the `timeSignature`
                // migration instead of being written straight into the state.
                // That keeps `time_signature == sum(beat_groups)` true for
                // every path out of this block, and keeps FREE mode's "one
                // group" invariant intact. A legacy `timeSignature: 0`
                // ("Never accent") restores as FREE mode at four beats.
                let stored_groups = store
                    .get("beatGroups")
                    .and_then(|v| serde_json::from_value::<Vec<u8>>(v.clone()).ok());
                let stored_free = store
                    .get("freeMode")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let (groups, total, free_mode) = commands::restore_beat_groups(
                    stored_groups,
                    s.time_signature,
                    stored_free,
                );
                s.beat_groups = groups;
                s.time_signature = total;
                s.free_mode = free_mode;
                if let Some(v) = store.get("instrument").and_then(|v| v.as_str().map(String::from)) {
                    let loaded = instrument::Instrument::from_id(&v);
                    // Migration guard: drums, piano, and "other" are now
                    // marked "coming soon" in the UI (pitch pipeline is
                    // calibrated for monophonic string instruments only).
                    // Silently promote any stored soon-instrument to
                    // electric-guitar so the user starts in a supported state.
                    s.instrument = match loaded {
                        instrument::Instrument::Drums
                        | instrument::Instrument::Piano
                        | instrument::Instrument::Other => instrument::Instrument::ElectricGuitar,
                        other => other,
                    };
                    // Persist the migrated value so the store doesn't re-load
                    // the legacy instrument on next launch.
                    if s.instrument.id() != v.as_str() {
                        store.set("instrument", serde_json::json!(s.instrument.id()));
                        eprintln!(
                            "[setup] migrated stored instrument '{}' → '{}' (instrument now coming-soon)",
                            v, s.instrument.id()
                        );
                    }
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

            // D2 — live tempo context shared with the onset detector so the
            // adaptive refractory period tracks the current grid without
            // re-acquiring the SharedState mutex on every hop. Seeded from
            // whatever we just restored from disk above.
            let (initial_bpm, initial_subdiv) = {
                let s = shared_state.lock().unwrap();
                (s.bpm, s.subdivision)
            };
            let tempo_ctx: SharedTempoContext =
                Arc::new(TempoContext::new(initial_bpm, initial_subdiv));
            app.manage(tempo_ctx);

            app.manage(shared_state);
            let beat_log = create_beat_log();
            let mut engine = MetronomeEngine::new(beat_log.clone());

            // Restore saved audio output device
            {
                let store = app.store("settings.json")?;
                if let Some(device_name) = store.get("audioOutputDevice").and_then(|v| v.as_str().map(String::from)) {
                    engine.set_device_name(Some(device_name));
                }
            }

            app.manage(EngineState(Mutex::new(engine)));

            // Start audio output device polling
            engine::start_audio_device_polling(app.handle().clone());
            app.manage(create_shared_audio_input());
            app.manage(create_shared_onset_detector());
            app.manage(Arc::new(Mutex::new(TimingAnalyzer::new(beat_log))));
            app.manage(create_shared_session_accumulator());
            app.manage(create_shared_engine());
            // Per-instrument calibration cache (DSP plan §"Per-instrument
            // calibration cache"). Hydrated from the store with TTL
            // eviction so we don't carry month-old entries into a fresh
            // launch. Owned by Tauri state from here on.
            let cal_cache = create_shared_calibration_cache();
            {
                let hydrated = calibration_cache::load_from_store(app.handle());
                *cal_cache.lock().unwrap() = hydrated;
            }
            app.manage(cal_cache);
            let shared_tts = create_shared_tts();
            {
                let models_dir = app.path().app_data_dir().unwrap().join("models");
                let mut engine = shared_tts.lock().unwrap();
                engine.set_models_dir(models_dir);
                // Restore the persisted voice + volume so the first
                // `tts_speak` after launch reflects the user's saved
                // choices. Without this the engine starts with the
                // hardcoded "lessac" default and races the JS-side
                // `useCoachDownload` mount — any early speech (a
                // mini-report rephrase, a session-start greeting) would
                // ship with the wrong voice if the JS load hadn't
                // resolved yet. Mirrors the audioOutputDevice + MIDI
                // restoration pattern used for the engine and listener
                // above.
                let store = app.store("settings.json")?;
                if let Some(voice) = store
                    .get("coachVoiceName")
                    .and_then(|v| v.as_str().map(String::from))
                {
                    engine.set_voice(&voice);
                }
                if let Some(vol) = store
                    .get("coachTtsVolume")
                    .and_then(|v| v.as_f64())
                {
                    engine.set_volume(vol as f32);
                }
            }
            app.manage(shared_tts);

            // Background startup verification for the Piper engine.
            // Legacy installs (built before the `.install_verified`
            // marker scheme) have a working `piper` binary on disk but
            // no marker — the new `piper_runnable` hot-path check would
            // false-flag them as "engine missing" and the UI would
            // start advertising the "Download voices" prompt even
            // though Piper actually works. We run the smoke test once
            // in the background; if it passes we write the marker so
            // subsequent renders trust the install. Failures stay
            // marker-less, which correctly surfaces the broken state.
            //
            // Threaded because the smoke test spawns a subprocess and
            // the setup() callback should return quickly to keep window
            // creation responsive — a slow Piper launch on a cold disk
            // shouldn't block the first frame.
            {
                let models_dir = app.path().app_data_dir().unwrap().join("models");
                std::thread::spawn(move || {
                    let piper_dir = models_dir.join("piper");
                    if !piper_dir.join("piper").exists() {
                        return; // no install yet, nothing to verify
                    }
                    let marker = piper_dir.join(tts::PIPER_VERIFIED_MARKER);
                    if marker.exists() {
                        return; // already verified by a previous run
                    }
                    match tts::piper_smoke_test(&piper_dir) {
                        Ok(()) => {
                            if let Err(e) = std::fs::write(&marker, b"") {
                                eprintln!(
                                    "[yames] startup verify: failed to write marker at {}: {e}",
                                    marker.display(),
                                );
                            } else {
                                eprintln!(
                                    "[yames] startup verify: Piper smoke test passed, wrote {}",
                                    marker.display(),
                                );
                            }
                        }
                        Err(e) => {
                            eprintln!(
                                "[yames] startup verify: Piper smoke test FAILED ({e}) — UI will surface engine-missing state",
                            );
                        }
                    }
                });
            }

            // Nested-dim counter shared by every `tts_speak` call so
            // concurrent greetings + tips can't lose the user's
            // metronome volume (see tts::TtsDimState).
            app.manage(create_shared_tts_dim());
            // Tracks the currently-speaking subprocess + a monotonically
            // increasing generation counter so rapid voice-preview clicks
            // can interrupt the previous utterance instead of queueing.
            app.manage(create_shared_tts_active());
            app.manage(DownloadState(std::sync::Mutex::new(None)));

            // Set up MIDI listener
            let shared_midi = create_shared_midi();
            {
                let listener = shared_midi.lock().unwrap();
                // Restore saved MIDI bindings
                let store = app.store("settings.json")?;
                if let Some(bindings_val) = store.get("midiBindings") {
                    if let Ok(bindings) = serde_json::from_value::<Vec<midi::MidiBinding>>(bindings_val.clone()) {
                        listener.set_bindings(bindings);
                    }
                }
                // Start device polling
                listener.start_device_polling(app.handle().clone());
                // Auto-reconnect to last device
                if let Some(device_name) = store.get("midiDevice").and_then(|v| v.as_str().map(String::from)) {
                    let _ = listener.connect(&device_name, app.handle().clone());
                }
            }
            app.manage(shared_midi);

            // Set up system tray
            let show_i = MenuItem::with_id(app, "show", "Show Yames", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Yames")
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

            // Start with the last-used window visible — the main window on a
            // fresh install, where `lastWindow` has never been written
            // (`commands::resolve_startup_window`). Must stay in step with
            // `app_ready`, which decides the main window's side of this.
            let last_window = {
                let store = app.store("settings.json")?;
                commands::resolve_startup_window(
                    store.get("lastWindow")
                        .and_then(|v| v.as_str().map(String::from))
                        .as_deref(),
                )
            };

            if let Some(main_win) = app.get_webview_window("main") {
                // Apply size and attempt an initial position while hidden. The window
                // stays hidden until app_ready fires (see commands.rs), which re-applies
                // the position and calls show() after macOS restoration has settled.
                let aot = { app.state::<SharedState>().lock().unwrap().always_on_top };
                let _ = main_win.set_always_on_top(aot);

                let store = app.store("settings.json")?;
                if let Some(size) = store.get("window_size_main") {
                    if let (Some(w), Some(h)) = (size.get("width").and_then(|v| v.as_u64()), size.get("height").and_then(|v| v.as_u64())) {
                        let _ = main_win.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
                    }
                }

                // Resolve target position once so it can be re-applied after show().
                let target_pos: Option<(i32, i32)> = store
                    .get("window_position_main")
                    .and_then(|pos| {
                        let x = pos.get("x").and_then(|v| v.as_i64())? as i32;
                        let y = pos.get("y").and_then(|v| v.as_i64())? as i32;
                        if is_position_visible(x, y, &main_win) { Some((x, y)) } else { None }
                    });

                // Initial set_position attempt before show(). On macOS this may be
                // ignored for hidden windows, but it's harmless to try.
                if let Some((x, y)) = target_pos {
                    let _ = main_win.set_position(tauri::PhysicalPosition::new(x, y));
                } else {
                    let _ = main_win.center();
                }

                // Keep the main window hidden here. The frontend calls `app_ready`
                // after React has fully mounted; that command re-applies the saved
                // position and calls show(). This eliminates the race with macOS
                // NSWindowRestoration, which settles long before React is ready.
                let _ = main_win.hide();

                // Non-macOS: call decorum's create_overlay_titlebar() to:
                //   - remove native OS frame (set_decorations false at runtime)
                //   - hook Win32 HTMAXBUTTON so Windows 11 Snap Layout flyout works
                //   - inject its own JS controls (we hide them via CSS)
                // macOS keeps decorations=true — native traffic lights + overlay titlebar.
                // LINUX: transparent: false in config to prevent Nvidia GPU crash (GBM/Err 71).
                #[cfg(not(target_os = "macos"))]
                {
                    use tauri_plugin_decorum::WebviewWindowExt;
                    let _ = main_win.create_overlay_titlebar();
                    let _ = main_win.set_shadow(true);
                }

                // Linux: remove any residual GTK CSD titlebar on KDE/Wayland configs
                // LINUX: transparent: false in config — do NOT set transparent here
                #[cfg(target_os = "linux")]
                {
                    use gtk::prelude::GtkWindowExt;
                    if let Ok(gtk_win) = main_win.gtk_window() {
                        gtk_win.set_titlebar(Option::<&gtk::Widget>::None);
                    }
                }
            }

            // Restore saved floating widget position (and visibility)
            if let Some(float_win) = app.get_webview_window("floating") {
                let widget_aot = { app.state::<SharedState>().lock().unwrap().widget_always_on_top };
                let _ = float_win.set_always_on_top(widget_aot);

                // Restore position before show() for the same reason as main_win.
                let store = app.store("settings.json")?;
                if let Some(pos) = store.get("window_position_floating") {
                    if let (Some(x), Some(y)) = (pos.get("x").and_then(|v| v.as_i64()), pos.get("y").and_then(|v| v.as_i64())) {
                        if is_position_visible(x as i32, y as i32, &float_win) {
                            let _ = float_win.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                        } else {
                            let _ = float_win.center();
                        }
                    }
                }

                if last_window != "main" {
                    let _ = float_win.show();
                } else {
                    let _ = float_win.hide();
                }
            }

            // NOTE: capture_image() + png-based trigger helper was removed here.
            // tauri::WebviewWindow::capture_image() requires the `image` Tauri feature
            // and the `png` crate; the screenshot script (scripts/take-screenshots.sh)
            // uses macOS screencapture directly and does not need this trigger path.
            // Re-enable when Tauri image capture support is properly wired up.

            // Mark startup complete so the Moved handler begins persisting positions.
            startup_complete.store(true, Ordering::Release);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_bpm,
            set_subdivision,
            toggle_playback,
            set_playing,
            set_widget_mode,
            set_always_on_top,
            set_widget_always_on_top,
            set_theme,
            set_instrument,
            set_volume,
            app_ready,
            show_main,
            show_floating,
            save_window_position,
            set_sound_type,
            set_beat_groups,
            set_free_mode,
            configure_speed_ramp,
            start_speed_ramp,
            start_speed_ramp_from,
            stop_speed_ramp,
            set_active_tab,
            get_active_tab,
            set_calibration_offset,
            get_calibration_offset,
            get_calibration_cache_entry,
            clear_calibration_cache_entry,
            list_calibration_cache,
            open_url,
            list_midi_devices,
            connect_midi_device,
            disconnect_midi_device,
            set_midi_binding,
            clear_midi_binding,
            get_midi_bindings,
            list_presets,
            save_preset,
            delete_preset,
            reorder_presets,
            list_audio_input_devices,
            start_evaluation,
            stop_evaluation,
            get_evaluation_state,
            notify_settings_change,
            close_open_segment,
            get_session_report,
            get_final_session_report,
            clear_session,
            save_session,
            get_session_history,
            delete_session,
            clear_all_sessions,
            list_session_logs,
            get_session_log,
            export_session_logs,
            clear_session_logs,
            start_recording,
            stop_recording,
            start_playback,
            stop_playback,
            discard_recording,
            get_waveform,
            set_input_gain,
            list_audio_output_devices,
            set_audio_output_device,
            get_model_status,
            get_system_memory_mb,
            write_model_chunk,
            get_models_path,
            delete_models,
            start_model_download,
            cancel_model_download,
            load_coach_model,
            coach_generate,
            is_coach_loaded,
            get_coach_capabilities,
            tts_speak,
            tts_stop,
            tts_set_voice,
            tts_set_volume,
            tts_list_voices,
            tts_voice_diagnostics,
            start_voice_repair,
        ])
        .on_window_event(move |window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    // Authoritative position save: read outer_position() right before
                    // exit so the exact on-screen location is persisted regardless of
                    // what the Moved handler may have captured during the session.
                    {
                        use tauri_plugin_store::StoreExt;
                        if let Ok(store) = window.app_handle().store("settings.json") {
                            let app_handle = window.app_handle();
                            if let Some(main_win) = app_handle.get_webview_window("main") {
                                if let Ok(pos) = main_win.outer_position() {
                                    store.set("window_position_main", serde_json::json!({ "x": pos.x, "y": pos.y }));
                                }
                            }
                            if let Some(float_win) = app_handle.get_webview_window("floating") {
                                if let Ok(pos) = float_win.outer_position() {
                                    store.set("window_position_floating", serde_json::json!({ "x": pos.x, "y": pos.y }));
                                }
                            }
                            let _ = store.save(); // flush to disk before exit
                        }
                    }
                    // Quit the entire app when user closes ANY window. The
                    // engine shutdown is destructive (rips down the audio
                    // thread); we gate it to the "main" window so closing
                    // a floating-widget or zen-mode popout doesn't tear
                    // down the audio engine before the main window's own
                    // close fires. `app_handle().exit(0)` below still
                    // terminates the process so the engine is cleaned up
                    // via Drop on shutdown either way.
                    if window.label() == "main" {
                        if let Some(engine_state) = window.try_state::<EngineState>() {
                            let mut engine = engine_state.0.lock().unwrap();
                            engine.shutdown();
                        }
                    }
                    window.app_handle().exit(0);
                }
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
                    // Only save after startup is complete; moves that happen
                    // during app initialisation (centering, set_position restore)
                    // must not overwrite the persisted position.
                    if !startup_complete_events.load(Ordering::Acquire) {
                        return;
                    }
                    let label = window.label();
                    if label == "main" || label == "floating" {
                        use tauri_plugin_store::StoreExt;
                        if let Ok(store) = window.app_handle().store("settings.json") {
                            let key = format!("window_position_{}", label);
                            store.set(key, serde_json::json!({ "x": pos.x, "y": pos.y }));
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
        .expect("error while running Yames");
}

/// Check if a window position is at least partially visible on any available monitor.
/// Returns false if the position would place the window entirely off-screen.
///
/// Always iterates all monitors (not just current_monitor) so that positions saved
/// on secondary monitors are correctly accepted when the window starts hidden on
/// the primary monitor.
pub(crate) fn is_position_visible(x: i32, y: i32, window: &tauri::WebviewWindow) -> bool {
    let margin = 100i32; // At least 100px of the window must remain on-screen
    if let Ok(monitors) = window.available_monitors() {
        if monitors.is_empty() {
            return true; // Can't determine monitors — allow the position
        }
        for monitor in monitors {
            let pos = monitor.position();
            let size = monitor.size();
            let w = size.width as i32;
            let h = size.height as i32;
            // Window top-left (x, y) is acceptable if at least `margin` px of
            // the window's leading edge falls within this monitor's bounds.
            let in_x = x > pos.x - (w - margin) && x < pos.x + w - margin;
            let in_y = y > pos.y - (h - margin) && y < pos.y + h - margin;
            if in_x && in_y {
                return true;
            }
        }
        false
    } else {
        // available_monitors() failed — allow the position rather than centering
        true
    }
}
