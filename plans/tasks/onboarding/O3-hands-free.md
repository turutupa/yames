# O3 — W3 "Hands-free control" step with live MIDI/gamepad mapping

Size: M. Branch: `onboarding/o3-hands-free`. Depends on: O1 merged.

## Goal

The user learns the five keys that matter and, if a footswitch or
gamepad is connected, maps Play/Stop to it right there.

## Facts

- MIDI: `listMidiDevices`, `connectMidiDevice`, `onMidiDevicesChanged`,
  `onMidiActivity`, `setMidiBinding`, `getMidiBindings` in `src/ipc.ts`;
  hook `src/hooks/useMidi.ts`; capture UI in
  `src/containers/settings/KeybindingModals.tsx` and
  `InputTesterModal.tsx` (learn mode).
- Gamepad: `src/hooks/useGamepad.ts`.
- Hotkeys and defaults: `src/hotkeys.ts` (`HotkeyAction`, groups);
  action ids in `useActionDispatcher.ts` (`play`, `bpm-up`, `bpm-down`,
  `toggle-coach`, tab switches).

## Deliverables

1. `steps/HandsFreeStep.tsx` registered as `hands-free` after
   `sound-look`.
2. Three cards: **Keyboard** (static: Space play/stop, ↑/↓ BPM, T tap
   tempo, C coach, Cmd/Ctrl-1/2 tabs — read the actual bindings from
   `hotkeys.ts`, do not hardcode), **MIDI footswitch**, **Gamepad**.
3. MIDI card: live device list; if ≥ 1 device: "Press the pedal you want
   for Play/Stop" → listens via the existing learn path, saves one
   binding to the `play` action, shows a confirmation with the CC/note
   captured; if none: one calm line ("Plug one in any time — Yames will
   offer to map it"). Device hot-plug while on the step updates the card.
4. Gamepad card: same flow via `useGamepad` if a pad is connected.
5. i18n keys `onboarding.handsFree.*` in all locales.
6. Tests: mocked `listMidiDevices`/`onMidiActivity` → binding saved;
   no-device copy; keyboard card renders the real bindings.

## Gates

- `tsc`, vitest, build green. Manual with a real MIDI pedal (owner) and
  with none connected.
