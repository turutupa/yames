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
//!   at another one) and, if the engine has an audio thread whose stream is
//!   dead (`output_park::route_should_reopen`) — whether or not anything is
//!   playing, so a stream lost while stopped or parked in the background is
//!   not found dead by the next Play — reopens it through
//!   `MetronomeEngine::reopen_output` as a new route (card #53). The loaded
//!   song and the jam's kit are kept when the new route runs at the old rate,
//!   which a phone's speaker and its headphones nearly always do; at another
//!   rate they are dropped, as a desktop device switch drops them, and the
//!   screen loads the song again. Either way the coach's line in flight is
//!   cut and a song that was playing stops and waits for Play.
//! * **Output dead, route unchanged** (a resume that would not start even
//!   after `output_park`'s retries, or `start` finding the stream dead):
//!   the same `reopen_output`, as the same route: it keeps the coach's line
//!   as well, brings the transport back as it was, and announces no route
//!   change (card #14).
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

/// What the output side has asked for: a route the system moved, or a dead
/// stream to reopen on the route it was on (`output_park::RouteRequests`).
static OUTPUT: crate::output_park::RouteRequests = crate::output_park::RouteRequests::new();
static INPUT_LOST: AtomicBool = AtomicBool::new(false);
static WATCHER: OnceLock<Thread> = OnceLock::new();

/// From the output stream's error thread: the system closed the stream, so
/// the route moved. A flag and an unpark: no lock, no allocation, nothing
/// that waits.
pub(crate) fn output_lost() {
    OUTPUT.note_route_lost();
    if let Some(t) = WATCHER.get() {
        t.unpark();
    }
}

/// From the event loop (a resume that would not start, even after its
/// retries) or `start` (a stream found dead): reopen it, but the route did
/// not move, so nothing decoded for it is dropped when the rate has not
/// moved either, and no `audio-route-changed` goes to the screen (card #14,
/// items 2 and 3). Same shape as `output_lost`.
pub(crate) fn output_dead() {
    OUTPUT.note_dead();
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
            let req = OUTPUT.take();
            if req.route_changed || req.reopen {
                if req.route_changed {
                    // Let the system finish rerouting before asking it for a
                    // new stream: an open in the middle of a route change is
                    // refused.
                    thread::sleep(Duration::from_millis(300));
                    crate::engine::forget_output_rate();
                }
                let state = app.state::<crate::state::SharedState>().inner().clone();
                let mut emit_route_changed = req.route_changed;
                if let Some(engine_state) = app.try_state::<crate::commands::EngineState>() {
                    if let Ok(mut engine) = engine_state.0.lock() {
                        let plan = crate::output_park::route_plan(req, engine.output_needs_reopen());
                        emit_route_changed = plan.emit_route_changed;
                        if let Some(route) = plan.reopen {
                            // Bounded: a probe opens a stream, and this
                            // thread holds the engine's lock. After a route
                            // change the cached format was forgotten above,
                            // so the probe asks the new route.
                            let probe = |d| {
                                crate::output_park::with_deadline(d, || {
                                    crate::android_audio::probe_output_format().ok()
                                })
                                .flatten()
                            };
                            match engine.reopen_output(state, Some(app.clone()), route, probe) {
                                Err(e) => eprintln!("[yames][android] reopening the output ({route:?}) failed: {e}"),
                                Ok(outcome) => {
                                    eprintln!("[yames][android] output reopened ({route:?}): {outcome:?}")
                                }
                            }
                        }
                    }
                }
                // Only a route the system moved is news to the screen; a
                // dead stream reopened where it was is not (card #14, item 3).
                if emit_route_changed {
                    let _ = app.emit("audio-route-changed", RouteChanged { kind: "output" });
                }
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
