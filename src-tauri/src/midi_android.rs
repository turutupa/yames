//! MIDI on a phone: there is none (M7, as in the `mobile` branch's v1).
//!
//! midir 0.10 has no Android backend at all, so `midi.rs` cannot be built
//! there. Rather than gate every MIDI call site in `commands.rs` and `lib.rs`
//! (which other workers edit), a phone compiles this file under the same
//! module name: the same types and the same `MidiListener` surface, with no
//! devices, no connection and no thread. Bindings are kept in memory so the
//! commands still answer consistently; nothing is ever received.
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MidiMsgType {
    #[serde(rename = "cc")]
    ControlChange,
    #[serde(rename = "note")]
    NoteOn,
    #[serde(rename = "pc")]
    ProgramChange,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiBinding {
    pub action: String,
    pub channel: Option<u8>,
    #[serde(rename = "msgType")]
    pub msg_type: MidiMsgType,
    pub number: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiDeviceInfo {
    pub id: usize,
    pub name: String,
    #[serde(rename = "isConnected")]
    pub is_connected: bool,
}

const NOT_AVAILABLE: &str = "MIDI is not available on this platform";

#[derive(Default)]
pub struct MidiListener {
    bindings: Mutex<Vec<MidiBinding>>,
}

#[allow(dead_code)]
impl MidiListener {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn list_devices(&self) -> Vec<MidiDeviceInfo> {
        Vec::new()
    }
    pub fn connect(&self, _device_name: &str, _app_handle: AppHandle) -> Result<(), String> {
        Err(NOT_AVAILABLE.into())
    }
    pub fn disconnect(&self) {}
    pub fn is_connected(&self) -> bool {
        false
    }
    pub fn connected_device_name(&self) -> Option<String> {
        None
    }
    pub fn set_bindings(&self, new_bindings: Vec<MidiBinding>) {
        *self.bindings.lock().unwrap() = new_bindings;
    }
    pub fn get_bindings(&self) -> Vec<MidiBinding> {
        self.bindings.lock().unwrap().clone()
    }
    pub fn add_binding(&self, binding: MidiBinding) {
        let mut b = self.bindings.lock().unwrap();
        b.retain(|x| x.action != binding.action);
        b.push(binding);
    }
    pub fn remove_binding(&self, action: &str) {
        self.bindings.lock().unwrap().retain(|b| b.action != action);
    }
    pub fn set_onset_callback<F>(&self, _f: F)
    where
        F: Fn(u8) + Send + Sync + 'static,
    {
    }
    pub fn clear_onset_callback(&self) {}
    pub fn start_device_polling(&self, _app_handle: AppHandle) {}
    pub fn shutdown(&self) {}
}

pub type SharedMidi = Arc<Mutex<MidiListener>>;

pub fn create_shared_midi() -> SharedMidi {
    Arc::new(Mutex::new(MidiListener::new()))
}
