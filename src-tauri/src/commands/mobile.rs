//! What a phone answers for the commands that only a desktop has (M7).
//!
//! `tauri::generate_handler!` takes one flat list and cannot cfg individual
//! entries, so every command stays registered on every platform; the window
//! manager's bodies (`set_always_on_top`, the floating widget, `app_ready`'s
//! window placement) and the custom-kit folder picker are `#[cfg(desktop)]`
//! in `commands.rs`, and these answer under the same names on a phone. The
//! phone frontend does not call them (they sit behind `IS_MOBILE`); this is
//! the safety net, not UX. Unlike the `mobile` branch's version of this file,
//! the mic evaluation, the session store and the coach's template are NOT
//! here: they are real on a phone now.

use crate::state::SharedState;
use tauri::{AppHandle, State};

/// Stored so a later desktop build reads the same settings, and so
/// `get_state` reports what was asked; there is no window to put on top.
#[tauri::command]
pub fn set_always_on_top(enabled: bool, state: State<SharedState>, app_handle: AppHandle) {
    state.lock().unwrap().always_on_top = enabled;
    super::emit_state_changed(&state, &app_handle);
    super::persist_state(&state, &app_handle);
}

#[tauri::command]
pub fn set_widget_always_on_top(enabled: bool, state: State<SharedState>, app_handle: AppHandle) {
    state.lock().unwrap().widget_always_on_top = enabled;
    super::emit_state_changed(&state, &app_handle);
    super::persist_state(&state, &app_handle);
}

/// One fullscreen webview: it is always "main", always shown.
#[tauri::command]
pub fn show_main() {}

#[tauri::command]
pub fn show_floating() {}

/// The desktop re-applies the saved window position and shows the hidden
/// window once React has mounted; a phone's window is never hidden.
#[tauri::command]
pub fn app_ready() {}

/// A phone has no folder of samples to point at (M08).
#[tauri::command]
pub async fn pick_kit_folder() -> Option<String> {
    None
}
