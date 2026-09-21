# W15 — the screen, fifth pass: a jam in a setlist, and the takes

Branch: `jam-w15-ui-setlist-takes`, from `jam` AFTER W13 and W14 have
merged. Your area is `src/` and `src/locales/`, not `src-tauri/`. Read
`plans/tasks/jam/BRIEF.md`, `INTEGRATION-NOTES.md`, the UI briefs W2,
W8, W12, W13, `plans/JAM_MODE.md` §4.4, §4.6, §8.5, and the contract:
`SetlistStep.jamId` in `src/types.ts`, `Jam.takes`, `JamTake`, and the
take calls at the end of `src/ipc.ts`.

## What to build

### 1. A jam in a setlist

- From the jam library and from the jam screen's overflow: "Add to
  setlist…", offering the setlists; from the setlist screen's add
  affordance: a jam as a step, beside presets. The step copies the jam's
  tempo, meter and sound into the `SetlistStep` fields it already has
  (U9.1: steps are copies) and carries `jamId`.
- `StepSentence` renders a jam step as "Slow blues in A · 92 · 12 bars"
  with the jam glyph; triggers and transitions apply unchanged (a `bars`
  trigger counts bars of the jam's meter; a count-in transition uses the
  jam's count-in sound when it has one).
- The runner (`useSetlistRunner`, `useSetlistSession`, `applySetlistStep`)
  loads the jam through the jam session's push when a jam step starts
  (meter first, then the table, the same order the jam tab uses) and
  clears it when the step ends or the setlist stops, restoring the
  metronome's meter the way leaving the jam tab does. A jam that no longer
  exists plays as the plain step and the sentence says so.
- The setlist tab shows the jam's form position while a jam step runs
  (bar N of M, the chord), in the player's readout row.

### 2. The takes

- "Record this take" (the practice row toggle) turns on `Jam.takes` for
  the jam; the first time, a short dialog says what it is: your playing
  with the band mixed in, a WAV on this machine only, nothing uploaded.
- With it on, pressing play starts a take (`startTake(jam.id)`) after the
  count-in and stop keeps it (`stopTake()`); the transport shows a
  recording mark and the elapsed time.
- A TAKES section on the jam screen (below the band): the jam's takes
  newest first with date, length and a play/stop control; playing a take
  stops the band (`playTake` → the engine mutes the band; `stopTakePlayback`
  and `onTakePlaybackEnded` bring the controls back); delete with an
  undo-less confirmation; the directory size from `listTakes` shown when
  it passes 100 MB.
- Hands-free: `jam-take` toggles recording for the next play.

### 3. Tests, strings, run

Tests for step creation from a jam, the sentence, the runner's load and
clear order, the takes list rendering and the recording lifecycle
(start after count-in, stop on stop, no take when the engine rejects).
Every new string in all fifteen locales. Shots harness for a setlist with
a jam step and the takes section.

## Rules

Nothing in `src-tauri/`. Never touch port 1420 or the owner's store.
Hyphenated branch. Commit on your branch, do not push or merge.
