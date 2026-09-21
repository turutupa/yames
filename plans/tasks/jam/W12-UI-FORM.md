# W12 — the screen, third pass: moving through the form, more grooves, and the meter given back

Branch: `jam-w12-ui-form`, from `jam`. Your area is `src/` and
`src/locales/`, not `src-tauri/`. Read `plans/tasks/jam/BRIEF.md`,
`INTEGRATION-NOTES.md`, `W2-UI.md`, `W8-UI-BAND.md`, `plans/JAM_MODE.md`
§4.1–§4.4, and the contract: `JamPositionCommand`, `setJamPosition`,
`JamEngineConfig.fillEvery`, `Jam.fillEvery`.

The engine side (`set_jam_position`, `fillEvery`) is being built by W11 at
the same time and will not be on `jam` while you work: `setJamPosition`
will reject until it lands. Catch it, log once, keep the UI working, the
way `setJam` was handled before the engine existed.

## What to build

### 1. Moving through the form

- **Click a bar on the timeline** → `setJamPosition({ jumpTo: bar, loop })`
  (the current loop, unchanged). The cell shows a "next bar line" marker
  until the beat event lands there. While stopped, a click sets where play
  starts (send the same command; the engine applies it on the first bar
  line, and until then the readout says "starts at bar N").
- **Loop a section.** Each section on the timeline (the groups
  `forms.ts` already draws) gets a small loop affordance; toggling it
  sends `loop: { start, end }` for that section, or `null` to clear. The
  looped cells are marked; the header says "looping bars 5–8". Only one
  loop at a time. Leaving the tab or loading another jam clears it.
- **Hotkeys and MIDI actions**: `jam-next-section`, `jam-prev-section`
  (jump to the next / previous section start at the bar line),
  `jam-loop-section` (toggle the loop on the section the form is in).
  Shortcuts sheet, bindings, all fifteen locales. They are no-ops on the
  settings view and while the groove editor is open, like the others.
- The trading and drop-out states drawn ahead on the timeline must still
  be right when a loop is set: they are phase-locked to the chorus and a
  loop does not start a new chorus.

### 2. Fills every N bars

On the setup screen the Fills toggle becomes a segmented choice: off ·
chorus end · every 4 · every 8. Stored as `fills` plus `fillEvery` on the
record (0 = end only), compiled into `fillEvery` on the config, and the
timeline marks every bar that carries a fill.

### 3. The meter given back

Leaving the jam tab sends `setJam(null)` but leaves the metronome with the
jam's subdivision and beat groups. Remember the metronome's subdivision,
beat groups and free mode when a jam is first pushed from another tab's
state, and restore them when the tab is left (or the jam is cleared with
no other jam replacing it). Pin it with a hook test: enter Jam from a 7/8
metronome in 16ths, leave, and the engine is asked for 7/8 in 16ths again.

### 4. Five more grooves

Add to `src/jam/grooves.ts`: funk (16ths, syncopated kick, ghosted snare),
reggae one-drop (kick and side-stick together on 3, hats on the off-beats;
use the rim/side-stick lane if the pattern type allows it, else snare at
ghost level), train beat (brushes-style snare 16ths with accents on the
off-beats, kick on 1 and 3), boom bap (kick on 1 and the "and" of 2,
snare on 2 and 4, hats 8ths with an open hat before the 1), four-on-the-
floor (kick every beat, hats on the off-beats, snare 2 and 4). Each with a
fill, a meter, and a bass style mapping in `bassline.ts`
(`BASS_STYLE_FOR_GROOVE` / `bassStyleForGroove`): funk → funk, one-drop →
rock with roots on 3, train → rock, boom bap → rock, four-on-the-floor →
rock with octave on the "and". Names in all fifteen locales. The groove
cards go to two rows if thirteen do not fit one; keep them readable.

### 5. Tests, strings, run

Tests for the position commands (what is sent on click, on hotkey, on
loop toggle, on leaving), the meter restore, the fills choice, and the
new grooves (every one compiles for every feel; every starter jam still
compiles). Every new string in all fifteen locales. Then the shots
harness on a port other than 1420 (the owner's app holds 1420): the
timeline with a loop set, a jump pending, and the thirteen groove cards.
Screenshots into `.screenshots/`.

## Rules

Nothing in `src-tauri/`. Never touch port 1420 or the owner's store.
Branch names use hyphens. Commit on your branch, do not push or merge.
