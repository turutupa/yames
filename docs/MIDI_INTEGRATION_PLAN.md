# MIDI Pedal Integration Plan

## Motivation

Musicians use Bluetooth/USB MIDI foot controllers to keep hands free during practice. The current footswitch support in Yames uses the Browser Gamepad API, which only detects USB HID gamepads. MIDI foot controllers like the **M-VAVE Chocolate Plus** ([Amazon link](https://www.amazon.com/Chocolate-Plus-Controller-Programmable-Rechargeable/dp/B0DNZTNKP1/)) send standard MIDI messages (CC, Note On/Off, Program Change) over Bluetooth or USB — a completely separate protocol the Gamepad API cannot see.

### Example Hardware

| Device | Connectivity | Protocol | Price |
|--------|-------------|----------|-------|
| [M-VAVE Chocolate Plus](https://www.amazon.com/dp/B0DNZTNKP1/) | BT + USB + TRS MIDI | MIDI CC/Note/PC | ~$45 |
| HOTONE Ampero Control | BT + USB | MIDI CC/Note | ~$60 |
| Paint Audio MIDI Captain MINI 6 | USB-MIDI + USB-HID | MIDI + HID | ~$80 |
| iRig BlueTurn | BT | MIDI Note | ~$50 |

### What Works Today vs. What This Adds

| | Gamepad API (current) | MIDI (this plan) |
|---|---|---|
| USB HID pedals | ✅ | — |
| USB MIDI controllers | ❌ | ✅ |
| Bluetooth MIDI pedals | ❌ | ✅ |
| TRS/DIN MIDI pedals | ❌ | ✅ |
| DAW integration | ❌ | ✅ (future) |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│  Rust Backend                                     │
│                                                   │
│  ┌─────────────┐    ┌──────────────────────────┐ │
│  │ MetronomeEngine │    │ MidiListener (new)       │ │
│  │ (audio thread)  │    │ (dedicated thread)       │ │
│  └─────────────┘    │                          │ │
│                      │  midir::MidiInput        │ │
│                      │  → parse MIDI messages   │ │
│                      │  → match against bindings│ │
│                      │  → emit "midi-action"    │ │
│                      └──────────────────────────┘ │
│                                                   │
│  IPC Commands:                                    │
│    list_midi_devices()                            │
│    set_midi_binding({ action, channel, cc/note }) │
│    clear_midi_binding({ action })                 │
│    get_midi_bindings()                            │
│    refresh_midi_devices()                         │
│                                                   │
│  Events:                                          │
│    "midi-action" → { action: string }             │
│    "midi-devices-changed" → [MidiDeviceInfo]      │
│    "midi-activity" → { channel, cc, value }       │
└──────────────────────────────────────────────────┘
          │ emit()              ▲ invoke()
          ▼                    │
┌──────────────────────────────────────────────────┐
│  React Frontend                                   │
│                                                   │
│  ┌──────────────────────┐                        │
│  │ useMidi() hook (new) │                        │
│  │  - listen "midi-action" events                │
│  │  - dispatch to same dispatchAction() system   │
│  │  - MIDI learn mode for binding capture        │
│  └──────────────────────┘                        │
│                                                   │
│  MainWindow.tsx:                                  │
│    - MIDI column in hotkey table (or merge w/Foot)│
│    - MIDI device selector dropdown                │
│    - MIDI activity indicator                      │
│    - "MIDI Learn" button per action               │
└──────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Rust MIDI Listener (`midir` crate)

**Files to modify/create:**

#### 1.1 Add `midir` dependency

```toml
# src-tauri/Cargo.toml
[dependencies]
midir = "0.10"
```

`midir` is the standard cross-platform MIDI I/O crate for Rust. It wraps CoreMIDI (macOS), WinMM (Windows), and ALSA (Linux). It handles both USB-MIDI and Bluetooth MIDI devices natively on macOS via CoreMIDI — no extra BLE code needed.

#### 1.2 Create `src-tauri/src/midi.rs`

New module with:

```rust
pub struct MidiBinding {
    pub action: String,       // e.g. "toggle_play", "bpm_up"
    pub channel: Option<u8>,  // None = any channel
    pub msg_type: MidiMsgType,
    pub number: u8,           // CC number or Note number
}

pub enum MidiMsgType {
    ControlChange,  // CC messages (most pedals use this)
    NoteOn,         // Note-based triggers
    ProgramChange,  // Preset switching
}

pub struct MidiDeviceInfo {
    pub id: usize,
    pub name: String,
    pub is_connected: bool,
}

pub struct MidiListener {
    alive: Arc<AtomicBool>,
    bindings: Arc<Mutex<Vec<MidiBinding>>>,
    connection: Option<MidiInputConnection<()>>,
}
```

**Key behaviors:**
- Runs `midir::MidiInput::new()` to create a MIDI input client
- `list_ports()` enumerates all available MIDI input ports (USB + BT)
- `connect()` opens a port with a callback closure
- Callback parses raw MIDI bytes → matches against bindings → emits Tauri events
- Auto-reconnect: periodically poll for device changes (every 2s)

#### 1.3 MIDI message parsing

Raw MIDI is 1-3 bytes. Parsing is straightforward:

```rust
fn parse_midi_message(bytes: &[u8]) -> Option<MidiMessage> {
    if bytes.is_empty() { return None; }
    let status = bytes[0];
    let channel = status & 0x0F;
    match status & 0xF0 {
        0x90 => Some(MidiMessage::NoteOn { channel, note: bytes[1], velocity: bytes[2] }),
        0x80 => Some(MidiMessage::NoteOff { channel, note: bytes[1] }),
        0xB0 => Some(MidiMessage::ControlChange { channel, cc: bytes[1], value: bytes[2] }),
        0xC0 => Some(MidiMessage::ProgramChange { channel, program: bytes[1] }),
        _ => None,
    }
}
```

#### 1.4 Extend `state.rs`

Add MIDI-related state (or keep bindings separate in the store):

```rust
// Option A: In AppState (if we want it in the shared state)
pub midi_device: Option<String>,     // selected device name
pub midi_enabled: bool,

// Option B: Separate MidiState managed independently
// Bindings stored in tauri-plugin-store like foot bindings
```

**Recommendation:** Option B — keep MIDI bindings in `tauri-plugin-store` like foot bindings. The MIDI listener runs independently and doesn't need to be in `AppState`.

---

### Phase 2: Tauri IPC Commands

#### 2.1 New commands in `src-tauri/src/commands.rs`

```rust
#[tauri::command]
pub fn list_midi_devices(midi: State<'_, SharedMidi>) -> Vec<MidiDeviceInfo> { ... }

#[tauri::command]
pub fn connect_midi_device(midi: State<'_, SharedMidi>, device_name: String) -> Result<(), String> { ... }

#[tauri::command]
pub fn disconnect_midi_device(midi: State<'_, SharedMidi>) -> Result<(), String> { ... }

#[tauri::command]
pub fn set_midi_binding(
    midi: State<'_, SharedMidi>,
    action: String,
    channel: Option<u8>,
    msg_type: String,  // "cc" | "note" | "pc"
    number: u8,
) -> Result<(), String> { ... }

#[tauri::command]
pub fn clear_midi_binding(midi: State<'_, SharedMidi>, action: String) -> Result<(), String> { ... }

#[tauri::command]
pub fn get_midi_bindings(midi: State<'_, SharedMidi>) -> Vec<MidiBindingInfo> { ... }
```

#### 2.2 Register in `lib.rs`

```rust
.manage(SharedMidi::default())
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    commands::list_midi_devices,
    commands::connect_midi_device,
    commands::disconnect_midi_device,
    commands::set_midi_binding,
    commands::clear_midi_binding,
    commands::get_midi_bindings,
])
```

#### 2.3 Events emitted by MidiListener

| Event | Payload | When |
|-------|---------|------|
| `midi-action` | `{ action: "toggle_play" }` | MIDI input matches a binding |
| `midi-activity` | `{ channel: 0, type: "cc", number: 64, value: 127 }` | Any MIDI input (for learn mode) |
| `midi-devices-changed` | `[{ id, name, isConnected }]` | Device connected/disconnected |

---

### Phase 3: Frontend Integration

#### 3.1 Create `src/hooks/useMidi.ts`

```typescript
export function useMidi(
  onAction: (action: string) => void,
  learnMode: boolean,
  onLearn?: (msg: MidiActivity) => void,
) {
  useEffect(() => {
    // Listen for "midi-action" events → call onAction()
    const unlisten1 = listen<{ action: string }>("midi-action", (e) => {
      onAction(e.payload.action);
    });

    // Listen for "midi-activity" events → call onLearn() in learn mode
    const unlisten2 = listen<MidiActivity>("midi-activity", (e) => {
      if (learnMode && onLearn) onLearn(e.payload);
    });

    return () => { unlisten1.then(f => f()); unlisten2.then(f => f()); };
  }, [onAction, learnMode, onLearn]);
}
```

#### 3.2 Add IPC wrappers in `src/ipc.ts`

```typescript
export const listMidiDevices = () => invoke<MidiDeviceInfo[]>("list_midi_devices");
export const connectMidiDevice = (deviceName: string) => invoke("connect_midi_device", { deviceName });
export const disconnectMidiDevice = () => invoke("disconnect_midi_device");
export const setMidiBinding = (action: string, channel: number | null, msgType: string, number: number) =>
  invoke("set_midi_binding", { action, channel, msgType, number });
export const clearMidiBinding = (action: string) => invoke("clear_midi_binding", { action });
export const getMidiBindings = () => invoke<MidiBindingInfo[]>("get_midi_bindings");
```

#### 3.3 Add types in `src/types.ts`

```typescript
export interface MidiDeviceInfo {
  id: number;
  name: string;
  isConnected: boolean;
}

export interface MidiActivity {
  channel: number;
  type: "cc" | "note" | "pc";
  number: number;
  value: number;
}

export interface MidiBindingInfo {
  action: string;
  channel: number | null;
  msgType: "cc" | "note" | "pc";
  number: number;
  displayName: string;  // e.g. "CC#64" or "Note C3"
}
```

#### 3.4 Update `MainWindow.tsx` — Hotkey Table

**Option A: Add a 4th "MIDI" column** (recommended)

```
| Action          | Key   | Global        | Foot  | MIDI   |
|-----------------|-------|---------------|-------|--------|
| Play / Stop     | Space | ⌘⇧Space      | GP:0  | CC#64  |
| BPM +1          | ↑     | ⌘⇧↑          |       |        |
| ...             |       |               |       |        |
```

Each MIDI cell shows the current binding or a "Learn" button. Clicking "Learn" enters MIDI learn mode — the next MIDI message received becomes the binding for that action.

**Option B: Merge with Foot column** — show "GP:0:B:0" for gamepad or "CC#64" for MIDI in the same column. Simpler UI, but less clear.

#### 3.5 MIDI Device Selector

Add a dropdown in the settings panel (near the Sound section):

```
┌─ MIDI ────────────────────────────┐
│ Device: [M-VAVE Chocolate Plus ▾] │
│ Status: ● Connected               │
│ [Refresh]                          │
└────────────────────────────────────┘
```

---

### Phase 4: MIDI Learn Flow

The most ergonomic way to bind MIDI:

1. User clicks "Learn" on a hotkey row's MIDI cell
2. UI shows overlay: "Press a button on your MIDI controller…"
3. `midi-activity` event fires with `{ channel, type, number, value }`
4. Frontend calls `set_midi_binding(action, channel, type, number)`
5. Binding saved → overlay closes → cell shows "CC#64" (or whatever was pressed)

This mirrors the existing foot pedal binding flow (click "Bind" → press button → captured).

---

## Technical Considerations

### Bluetooth MIDI on macOS

macOS CoreMIDI natively supports Bluetooth MIDI. When a BLE-MIDI device (like the Chocolate Plus) is paired in **System Settings → Bluetooth**, it appears as a standard MIDI port in `midir::MidiInput::ports()`. No extra BLE scanning code needed.

**User setup:** Pair the pedal in macOS Bluetooth settings → it shows up in Yames MIDI device list automatically.

### Bluetooth MIDI on Windows

Windows does not natively expose BLE-MIDI as a standard MIDI port. Options:
- **loopMIDI + MIDIberry** — free third-party tools that bridge BLE-MIDI to virtual MIDI ports
- **Recommend USB mode** for Windows users (the Chocolate Plus supports USB too)
- Future: Direct BLE-MIDI via `btleplug` crate (complex, out of scope for v1)

### Bluetooth MIDI on Linux

ALSA supports BLE-MIDI via `bluez` + `aseqdump`. The `midir` crate uses ALSA natively. Setup varies by distro.

### Latency

| Path | Expected Latency |
|------|-----------------|
| USB MIDI | < 1ms |
| Bluetooth MIDI (BLE) | 5–20ms |
| Chocolate Plus (BT, per reviews) | 10–30ms (some users report flakiness) |

For metronome control (start/stop, BPM changes), even 30ms is acceptable — these aren't timing-critical audio events.

### Thread Safety

The MIDI callback from `midir` runs on its own thread. It needs to:
1. Lock the bindings `Mutex` to check matches (fast — small vec lookup)
2. Call `app_handle.emit()` to send events to the frontend (thread-safe in Tauri)
3. Optionally lock `SharedState` to mutate state directly (like `toggle_playback`)

**Recommendation:** Have the MIDI thread emit events, and let the frontend call `invoke()` to mutate state. This keeps the same data flow as gamepad: input → event → frontend → invoke → state change. Simpler and consistent.

### Hot-plug Support

`midir` doesn't have built-in device change notifications. Solution:
- Poll `MidiInput::ports()` every 2 seconds on the MIDI thread
- Compare with previous port list
- Emit `midi-devices-changed` event if different
- Auto-reconnect to the selected device if it reappears

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src-tauri/Cargo.toml` | Modify | Add `midir = "0.10"` |
| `src-tauri/src/midi.rs` | **Create** | MidiListener, MidiBinding, message parsing, device polling |
| `src-tauri/src/state.rs` | Modify | Add `SharedMidi` type alias |
| `src-tauri/src/commands.rs` | Modify | Add 6 new MIDI commands |
| `src-tauri/src/lib.rs` | Modify | Register MidiListener, manage state, register commands |
| `src-tauri/src/main.rs` | No change | — |
| `src/types.ts` | Modify | Add MidiDeviceInfo, MidiActivity, MidiBindingInfo |
| `src/ipc.ts` | Modify | Add MIDI invoke wrappers + event listeners |
| `src/hooks/useMidi.ts` | **Create** | Hook for MIDI events + learn mode |
| `src/components/MainWindow.tsx` | Modify | MIDI column in hotkeys, device selector, learn overlay |

---

## Estimated Scope

| Phase | Work |
|-------|------|
| Phase 1: Rust MIDI listener | `midi.rs` module, midir integration, message parsing |
| Phase 2: IPC commands | 6 new commands, event emission, state management |
| Phase 3: Frontend UI | useMidi hook, hotkey table MIDI column, device selector |
| Phase 4: MIDI Learn | Learn mode overlay, binding capture flow |
| **Testing** | Manual testing with USB-MIDI device, mock if no hardware |

---

## Testing Without Hardware

If no MIDI pedal is available during development:

1. **Virtual MIDI on macOS:** Use the built-in **IAC Driver** (Audio MIDI Setup → IAC Driver → enable) to create a virtual MIDI port, then send test messages with a free app like **MIDIMonitor** or `sendmidi` CLI.

2. **`sendmidi` CLI tool:**
   ```bash
   brew install sendmidi
   sendmidi dev "IAC Driver Bus 1" cc 64 127   # Send CC#64
   sendmidi dev "IAC Driver Bus 1" on 60 100   # Send Note C3
   ```

3. **Unit tests:** Mock `midir` in Rust tests to verify message parsing and binding matching logic without hardware.

---

## References

- [`midir` crate docs](https://docs.rs/midir/latest/midir/)
- [MIDI 1.0 message spec](https://www.midi.org/specifications-old/item/table-1-summary-of-midi-message)
- [M-VAVE Chocolate Plus (Amazon)](https://www.amazon.com/Chocolate-Plus-Controller-Programmable-Rechargeable/dp/B0DNZTNKP1/)
- [CoreMIDI Bluetooth MIDI (Apple)](https://developer.apple.com/documentation/coremidi)
- [Tauri v2 Events](https://v2.tauri.app/develop/calling-rust/#events)
