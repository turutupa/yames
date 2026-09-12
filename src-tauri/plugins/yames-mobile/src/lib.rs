//! The five things Yames needs from Android that a webview cannot do.
//!
//! Every one of them exists because of something the M00 spike measured or
//! the plan (`plans/MOBILE_IMPLEMENTATION_PLAN.md` §3.4, §6) predicted:
//!
//! * **`set_background_audio`** — a `mediaPlayback` foreground service with a
//!   notification. Without it, Android is free to freeze or kill the process
//!   minutes after the screen goes off, and a metronome on a music stand goes
//!   quiet on its own. The service also owns the audio-focus request, because
//!   focus and "we are playing" are the same fact.
//! * **`keep_awake`** — `FLAG_KEEP_SCREEN_ON`, for a drill or zen mode you are
//!   reading while both hands are busy.
//! * **`open_url`** — `Intent.ACTION_VIEW`. The Rust `open_url` command spawns
//!   a process, and there is nothing to spawn on a phone.
//! * **`set_back_intercept`** — M00 found the Back gesture *finishing the
//!   activity mid-click*: one stray edge-swipe and the metronome is gone. Back
//!   now closes whatever the app has open, or puts the app in the background
//!   with the click still running.
//!
//! Nothing here touches the audio thread. The foreground service exists to
//! stop the OS from taking the process away; the click is rendered where it
//! always was.
//!
//! # Shape
//!
//! Tauri mobile plugins are a Rust half and a Kotlin half. Commands cross as
//! JSON; the Kotlin class is `YamesMobilePlugin` in
//! `com.yames.metronome.mobile`. Off Android every command answers `Ok`
//! without doing anything, so the crate stays buildable anywhere even though
//! `src-tauri/Cargo.toml` only depends on it for `target_os = "android"`.

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Runtime,
};

#[cfg(target_os = "android")]
use tauri::Manager;

/// The Kotlin side's package, and the class inside it.
#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.yames.metronome.mobile";

/// What the notification says, passed in already translated.
///
/// The strings are the frontend's — i18n lives there, and a musician reading
/// "Playing — 120 BPM" in the shade must read it in the language they picked
/// in the app. Nothing on this side ever composes user-visible text.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundAudio {
    /// Start the service (and take audio focus), or stop it.
    pub active: bool,
    /// Notification title, e.g. "Yames".
    pub title: String,
    /// Notification body, e.g. "Playing — 120 BPM".
    pub body: String,
    /// Label on the notification's stop action, e.g. "Stop".
    pub stop_label: String,
    /// Name of the notification channel as it appears in Android's own
    /// settings, e.g. "Playback".
    pub channel_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Toggle {
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenUrl {
    pub url: String,
}

/// One channel carries every event the Android side raises, tagged.
///
/// The alternative is `addPluginListener`, and it does not work for a plugin
/// whose Rust half declares its own commands: that API invokes
/// `plugin:<name>|registerListener`, which only the Kotlin base class knows
/// about and which would have to be re-declared here under a name Rust's
/// snake_case conventions have no room for. One channel, opened once at
/// startup, is the smaller and more predictable thing — and three events do
/// not need three subscriptions.
#[derive(Serialize)]
struct EventChannel {
    channel: tauri::ipc::Channel<serde_json::Value>,
}

/// The handle the commands run through. Only exists on Android.
#[cfg(target_os = "android")]
struct YamesMobile<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "android")]
fn call<R: Runtime>(
    app: &AppHandle<R>,
    command: &str,
    payload: impl Serialize,
) -> Result<(), String> {
    let handle = app
        .try_state::<YamesMobile<R>>()
        .ok_or_else(|| "the Android side of Yames did not start".to_string())?;
    handle
        .0
        .run_mobile_plugin::<()>(command, payload)
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
fn call<R: Runtime>(
    _app: &AppHandle<R>,
    _command: &str,
    _payload: impl Serialize,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn set_background_audio<R: Runtime>(
    app: AppHandle<R>,
    payload: BackgroundAudio,
) -> Result<(), String> {
    call(&app, "setBackgroundAudio", payload)
}

#[tauri::command]
async fn keep_awake<R: Runtime>(app: AppHandle<R>, payload: Toggle) -> Result<(), String> {
    call(&app, "keepAwake", payload)
}

#[tauri::command]
async fn open_url<R: Runtime>(app: AppHandle<R>, payload: OpenUrl) -> Result<(), String> {
    call(&app, "openUrl", payload)
}

#[tauri::command]
async fn set_back_intercept<R: Runtime>(app: AppHandle<R>, payload: Toggle) -> Result<(), String> {
    call(&app, "setBackIntercept", payload)
}

#[tauri::command]
async fn set_event_channel<R: Runtime>(
    app: AppHandle<R>,
    channel: tauri::ipc::Channel<serde_json::Value>,
) -> Result<(), String> {
    call(&app, "setEventChannel", EventChannel { channel })
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("yames-mobile")
        .invoke_handler(tauri::generate_handler![
            set_background_audio,
            keep_awake,
            open_url,
            set_back_intercept,
            set_event_channel
        ])
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "YamesMobilePlugin")?;
                _app.manage(YamesMobile(handle));
            }
            Ok(())
        })
        .build()
}
