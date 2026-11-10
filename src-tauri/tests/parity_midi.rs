//! P6: what a pedal sends, and what counts as pressing it.
//!
//! `midi.rs` is a private module, and `parse_midi` a private function in it, so the
//! file is included here rather than the production code being opened up for a
//! test. The binding rules are the ones `midi-action` depends on, and the action
//! ids they carry are the same 42 as `HOTKEYS`, frozen by
//! `src/test/parity/surface.test.ts`. Real hardware stays on the manual checklist.
//!
//!   node scripts/rust-test.mjs --test parity_midi

#[allow(dead_code, unused_imports)]
mod midi {
    include!("../src/midi.rs");

    pub fn parse(bytes: &[u8]) -> Option<(u8, MidiMsgType, u8, u8)> {
        parse_midi(bytes)
    }
}

use midi::{MidiBinding, MidiListener, MidiMsgType};

fn binding(action: &str, channel: Option<u8>, msg_type: MidiMsgType, number: u8) -> MidiBinding {
    MidiBinding {
        action: action.into(),
        channel,
        msg_type,
        number,
    }
}

#[test]
fn it_reads_a_note_on_with_its_channel_and_velocity() {
    assert_eq!(
        midi::parse(&[0x93, 60, 100]),
        Some((3, MidiMsgType::NoteOn, 60, 100))
    );
}

#[test]
fn it_reads_a_control_change() {
    assert_eq!(
        midi::parse(&[0xB0, 64, 127]),
        Some((0, MidiMsgType::ControlChange, 64, 127))
    );
}

#[test]
fn it_reads_a_program_change_as_always_pressed() {
    assert_eq!(
        midi::parse(&[0xC5, 12]),
        Some((5, MidiMsgType::ProgramChange, 12, 127))
    );
}

#[test]
fn it_ignores_everything_else() {
    assert_eq!(midi::parse(&[]), None);
    assert_eq!(midi::parse(&[0x80, 60, 0]), None, "note off is not a press");
    assert_eq!(midi::parse(&[0xE0, 0, 64]), None, "pitch bend is not a press");
    assert_eq!(midi::parse(&[0x90, 60]), None, "a truncated note");
    assert_eq!(midi::parse(&[0xB0, 64]), None, "a truncated control");
    assert_eq!(midi::parse(&[0xC0]), None, "a truncated program");
}

#[test]
fn a_binding_replaces_that_action_s_old_one() {
    let midi = MidiListener::new();
    midi.add_binding(binding("play", Some(0), MidiMsgType::ControlChange, 64));
    midi.add_binding(binding("play", Some(0), MidiMsgType::NoteOn, 36));
    let bound = midi.get_bindings();
    assert_eq!(bound.len(), 1);
    assert_eq!(bound[0].msg_type, MidiMsgType::NoteOn);
}

#[test]
fn a_binding_takes_its_signal_from_any_other_action() {
    let midi = MidiListener::new();
    midi.add_binding(binding("play", Some(0), MidiMsgType::ControlChange, 64));
    midi.add_binding(binding("tab-3", Some(0), MidiMsgType::ControlChange, 64));
    let bound = midi.get_bindings();
    assert_eq!(bound.len(), 1);
    assert_eq!(bound[0].action, "tab-3");
}

#[test]
fn the_same_number_on_another_channel_or_type_is_another_signal() {
    let midi = MidiListener::new();
    midi.add_binding(binding("play", Some(0), MidiMsgType::ControlChange, 64));
    midi.add_binding(binding("tab-1", Some(1), MidiMsgType::ControlChange, 64));
    midi.add_binding(binding("tab-2", Some(0), MidiMsgType::NoteOn, 64));
    assert_eq!(midi.get_bindings().len(), 3);
}

#[test]
fn a_binding_can_be_removed_on_its_own() {
    let midi = MidiListener::new();
    midi.add_binding(binding("play", Some(0), MidiMsgType::ControlChange, 64));
    midi.add_binding(binding("tab-1", Some(0), MidiMsgType::ControlChange, 65));
    midi.remove_binding("play");
    let bound = midi.get_bindings();
    assert_eq!(bound.len(), 1);
    assert_eq!(bound[0].action, "tab-1");
}

#[test]
fn the_stored_format_is_the_one_players_have() {
    let stored = serde_json::json!([
        { "action": "play", "channel": 0, "msgType": "cc", "number": 64 },
        { "action": "tab-3", "channel": null, "msgType": "note", "number": 36 },
        { "action": "songs-take", "channel": 1, "msgType": "pc", "number": 5 }
    ]);
    let bindings: Vec<MidiBinding> = serde_json::from_value(stored.clone()).unwrap();
    assert_eq!(bindings[0].msg_type, MidiMsgType::ControlChange);
    assert_eq!(bindings[1].channel, None);
    assert_eq!(bindings[2].msg_type, MidiMsgType::ProgramChange);
    assert_eq!(serde_json::to_value(&bindings).unwrap(), stored);
}
