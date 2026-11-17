//! Route changes on a phone (M7, from the review of `mvp-android`).
//!
//! AAudio closes a fast-path (Exclusive / MMAP) stream when the route under
//! it changes: headphones in or out, a USB interface or a jack adapter
//! plugged or pulled, Bluetooth connecting. Oboe reports it on its own error
//! thread through `on_error_after_close`, and after that the stream is gone:
//! the click goes silent while the engine still says it is playing, and the
//! input goes quiet. A desktop notices device changes through its device
//! poll; that poll is `cfg(desktop)`.
//!
//! So the two error callbacks (`android_audio.rs`, `android_input.rs`) only
//! raise a flag and unpark the one thread here. **Nothing is reopened on an
//! audio or Oboe thread.** This thread:
//!
//! * **Output lost:** forgets the probed output rate (a USB interface can run
//!   at another one) and, if the engine is running, reopens it through
//!   `MetronomeEngine::set_device` with the same name — the path a desktop
//!   device switch takes, which re-decodes what was decoded for the old rate.
//! * **Input lost:** sends the input list again and `audio-route-changed`
//!   `{ kind: "input" }`. The input is reopened by the frontend
//!   (`src/mobile/inputRoute.ts`) through stop/start evaluation, because the
//!   onset detector's rate is fixed when it starts and only a full restart
//!   re-reads it — the same thing a device switch in Settings does.
//!
//! The Kotlin side's `AudioDeviceCallback` covers the other half (a device
//! that appears without closing anything): it tells the frontend, which asks
//! `refresh_audio_devices` for the new lists.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::thread::{self, Thread};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

static OUTPUT_LOST: AtomicBool = AtomicBool::new(false);
static INPUT_LOST: AtomicBool = AtomicBool::new(false);
static WATCHER: OnceLock<Thread> = OnceLock::new();

/// From the output stream's error thread. A flag and an unpark: no lock, no
/// allocation, nothing that waits.
pub(crate) fn output_lost() {
    OUTPUT_LOST.store(true, Ordering::Release);
    if let Some(t) = WATCHER.get() {
        t.unpark();
    }
}

/// From the input stream's error thread. Same shape.
pub(crate) fn input_lost() {
    INPUT_LOST.store(true, Ordering::Release);
    if let Some(t) = WATCHER.get() {
        t.unpark();
    }
}

#[derive(Clone, serde::Serialize)]
struct RouteChanged {
    kind: &'static str,
}

/// Start the watcher. Once, from `setup`. It sleeps in `park()` and costs
/// nothing until a stream is closed under it.
pub(crate) fn spawn(app: AppHandle) {
    let handle = thread::Builder::new()
        .name("yames-route".into())
        .spawn(move || loop {
            thread::park();
            if OUTPUT_LOST.swap(false, Ordering::AcqRel) {
                // Let the system finish rerouting before asking it for a new
                // stream: an open in the middle of a route change is refused.
                thread::sleep(Duration::from_millis(300));
                crate::engine::forget_output_rate();
                let state = app.state::<crate::state::SharedState>().inner().clone();
                if let Some(engine_state) = app.try_state::<crate::commands::EngineState>() {
                    if let Ok(mut engine) = engine_state.0.lock() {
                        if engine.is_running() {
                            let name = engine.device_name().map(String::from);
                            if let Err(e) = engine.set_device(name, state, app.clone()) {
                                eprintln!("[yames][android] reopening the output after a route change failed: {e}");
                            } else {
                                eprintln!("[yames][android] output reopened after a route change");
                            }
                        }
                    }
                }
                let _ = app.emit("audio-route-changed", RouteChanged { kind: "output" });
            }
            if INPUT_LOST.swap(false, Ordering::AcqRel) {
                thread::sleep(Duration::from_millis(300));
                let devices = crate::audio_input::AudioInput::list_devices();
                let _ = app.emit("audio-input-devices-changed", &devices);
                let _ = app.emit("audio-route-changed", RouteChanged { kind: "input" });
            }
        });
    match handle {
        Ok(h) => {
            let _ = WATCHER.set(h.thread().clone());
        }
        Err(e) => eprintln!("[yames][android] could not start the route watcher: {e}"),
    }
}
