//! Recording session mode (card #109): the commands behind Settings' switch,
//! the "felt off" key, and Open folder / Zip session. See `crate::capture`.

use crate::commands::EngineState;
use crate::state::SharedState;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

fn capture_root(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("capture"))
}

/// The engine's speech slots and output latency, with the stream started if
/// it was not (the chirp needs somewhere to come out of), the lock held for
/// the spawn only, as `tts_speak` does.
fn chirp_slots(
    engine_state: &EngineState,
    state: &SharedState,
    app: &AppHandle,
) -> (crate::engine::SpeechSlots, std::sync::Arc<std::sync::atomic::AtomicU64>) {
    let mut engine = engine_state.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Err(e) = engine.start_audio_thread(state.clone(), app.clone()) {
        eprintln!("[yames] the sync chirp has nowhere to play from: {e}");
    }
    (engine.speech_slots(), engine.output_latency_handle())
}

/// Start a recording session: a folder under `capture/`, its `session.json`
/// from `meta` (device, latency, settings, rates), then the start chirp.
/// `capGb` is where it stops keeping Takes. Returns the status and the chirp.
#[tauri::command]
pub async fn capture_start(
    app: AppHandle,
    engine_state: State<'_, EngineState>,
    state: State<'_, SharedState>,
    meta: Value,
    cap_gb: Option<f64>,
) -> Result<Value, String> {
    let root = capture_root(&app)?;
    let cap = cap_gb.filter(|g| g.is_finite() && *g > 0.0).map(|g| (g * 1024.0 * 1024.0 * 1024.0) as u64);
    // `start` ends a session still on, which waits for a jam's last segment
    tokio::task::spawn_blocking(move || crate::capture::global().start(&root, meta, cap))
        .await
        .map_err(|e| e.to_string())??;
    let (slots, latency) = chirp_slots(&engine_state, state.inner(), &app);
    let chirp = tokio::task::spawn_blocking(move || crate::capture::play_chirp(&slots, &latency, "start"))
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({"status": crate::capture::global().status(), "chirp": chirp}))
}

/// End the recording session: the end chirp, then `endedWallMs`. The folder.
#[tauri::command]
pub async fn capture_end(
    app: AppHandle,
    engine_state: State<'_, EngineState>,
    state: State<'_, SharedState>,
) -> Result<Option<String>, String> {
    if !crate::capture::global().enabled() {
        return Ok(None);
    }
    let (slots, latency) = chirp_slots(&engine_state, state.inner(), &app);
    tokio::task::spawn_blocking(move || crate::capture::play_chirp(&slots, &latency, "end"))
        .await
        .map_err(|e| e.to_string())?;
    // waits for a jam's last segment to be written
    tokio::task::spawn_blocking(|| crate::capture::global().end().map(|d| d.display().to_string()))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn capture_status() -> crate::capture::CaptureStatus {
    crate::capture::global().status()
}

/// What the next Take is (Path, Step, Exercise, variant, mode, count-in), or
/// `None` between Takes.
#[tauri::command]
pub fn capture_set_context(context: Option<Value>) {
    crate::capture::global().set_context(context);
}

/// "That one felt off": the only manual input of a session.
#[tauri::command]
pub fn capture_mark() -> Result<Value, String> {
    crate::capture::global().mark()
}

/// A jam or free play starts / ends (kept in segments, ungraded). Both wait
/// for a run before to finish writing, so neither runs on the main thread.
#[tauri::command]
pub async fn capture_free_begin(context: Value) -> Result<(), String> {
    tokio::task::spawn_blocking(move || crate::capture::global().free_begin(context, None))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn capture_free_end(heard: Option<Value>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || crate::capture::global().free_end(heard))
        .await
        .map_err(|e| e.to_string())
}

/// Show the session's folder (the one on, else the last).
#[tauri::command]
pub fn capture_reveal(app: AppHandle) -> Result<String, String> {
    let dir = match crate::capture::global().dir_or_last() {
        Some(d) => d,
        None => capture_root(&app)?,
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = if dir.join("session.json").exists() { dir.join("session.json") } else { dir.clone() };
    crate::commands::reveal_in_folder(target.display().to_string());
    Ok(dir.display().to_string())
}

/// Zip the session (the one on, else the last) into
/// `yames-capture-<session>.zip`: beside the sessions on a desktop, in the
/// app's cache on a phone, where Share can hand it to another app. The path.
#[tauri::command]
pub async fn capture_zip(app: AppHandle) -> Result<String, String> {
    let dir = crate::capture::global().dir_or_last().ok_or("no recording session yet")?;
    let id = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "session".into());
    let out_dir = if cfg!(any(target_os = "android", target_os = "ios")) {
        app.path().app_cache_dir().map_err(|e| e.to_string())?
    } else {
        capture_root(&app)?
    };
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let out = out_dir.join(format!("yames-capture-{id}.zip"));
    tokio::task::spawn_blocking(move || crate::capture::Capture::zip_session(&dir, &out).map(|p| p.display().to_string()))
        .await
        .map_err(|e| e.to_string())?
}

// --- "Send my test sessions to my computer" (card #123, test builds only) ----
// The files only: the upload is the webview's (`src/capture/inbox.ts`). Every
// id is checked in `crate::capture_outbox` before it touches a path.

fn outbox_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_cache_dir().map_err(|e| e.to_string())?.join("capture-outbox"))
}

fn active_id() -> Option<String> {
    crate::capture::global().status().session
}

/// The recording sessions on this device, oldest first.
#[tauri::command]
pub async fn capture_sessions(app: AppHandle) -> Result<Vec<crate::capture_outbox::SessionEntry>, String> {
    let root = capture_root(&app)?;
    tokio::task::spawn_blocking(move || crate::capture_outbox::list_sessions(&root, active_id().as_deref()))
        .await
        .map_err(|e| e.to_string())
}

/// Zip session `id` into the outbox (once) and, with `shared` on Android, copy
/// it to `Documents/Yames/capture`. `{ id, size, shared, sharedError }`.
#[tauri::command]
pub async fn capture_outbox_prepare(app: AppHandle, id: String, shared: Option<bool>) -> Result<Value, String> {
    let root = capture_root(&app)?;
    let outbox = outbox_dir(&app)?;
    tokio::task::spawn_blocking(move || {
        let (zip, size) = crate::capture_outbox::prepare(&root, &outbox, &id, active_id().as_deref())?;
        let (mut copy, mut copy_err) = (Value::Null, Value::Null);
        if shared.unwrap_or(false) && cfg!(target_os = "android") {
            match crate::capture_outbox::copy_to_shared(&zip, std::path::Path::new(crate::capture_outbox::ANDROID_SHARED_DIR), &id) {
                Ok(p) => copy = Value::String(p.display().to_string()),
                Err(e) => copy_err = Value::String(e),
            }
        }
        Ok(serde_json::json!({"id": id, "size": size, "shared": copy, "sharedError": copy_err}))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Up to `len` bytes of the outbox zip of `id` from `offset`, as raw bytes
/// (an `ArrayBuffer` in the webview, no JSON or base64 on the way).
#[tauri::command]
pub async fn capture_outbox_chunk(app: AppHandle, id: String, offset: u64, len: u64) -> Result<tauri::ipc::Response, String> {
    let outbox = outbox_dir(&app)?;
    let bytes = tokio::task::spawn_blocking(move || crate::capture_outbox::read_chunk(&outbox, &id, offset, len))
        .await
        .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

/// The computer has session `id`: drop the outbox's zip of it.
#[tauri::command]
pub async fn capture_outbox_clear(app: AppHandle, id: String) -> Result<(), String> {
    let outbox = outbox_dir(&app)?;
    tokio::task::spawn_blocking(move || crate::capture_outbox::clear(&outbox, &id))
        .await
        .map_err(|e| e.to_string())?
}
