# W12 — The review: you stop, and the coach says one thing

Branch `songs-w12-review`, from `songs-v1` as it stands (ten merges: store,
queue, songs, pitch, findings, blocks, coach, scoring ×2, wiring). Size L.
Your spec is `plans/SONGS.md` S0.5–S0.6 and A6–A7, and `plans/COACH_UX.md`
A3, A4, A5, B1, B2, D3 (section E says these are all the first release
needs). Read the final reports' handover notes baked into the code comments
of `src/songs/`, `src/coach/blocks/`, `src-tauri/src/score.rs`,
`findings.rs`, `pitch.rs` and the commands W10 added. Frontend first; Rust
only where an item says so. Commit per stage. W9 still owns `engine.rs`,
`song.rs`, `jam.rs` tonight.

## Stage A — an attempt is a thing

In Songs, pressing play on a range loads the schedule
(`load_score_schedule`, now real: delete `src/songs/engineBridge.ts` and
move the call into `ipc.ts` as its header says). Stopping ends the attempt:
collect the `OnsetResult`s and `ExtraOnset`s that ride
`practice-segment-ended`, `saveAttempt` them with the range, the tempo
percentage and the passes, then `clear_score_schedule` (W1: a run
accumulates until cleared — an attempt is play-to-stop). An attempt with
fewer than eight scored onsets is not saved and gets no review. Read the
song you are showing through `getScore`/`getScoreSource`, not the library
list (W10's note on 2N+1 calls).

## Stage B — the tab tells the truth

After a pass the tab is coloured by what happened: on time, early, late
(two steps each, from the scorer's own thresholds — ask
`timing::window_thresholds` through a small command rather than inventing
numbers), missed, `softAbsent` drawn as "not assessed", extras marked
between the notes where they fell, a written accent that was not heard
given a quiet mark. With several passes, show the last by default and let
the player step through them. Colours come from the theme's feedback
tokens and are never the only signal (shape or mark as well), all 13
themes. While playing, notes light on timing alone as they are hit
(`SONGS.md` A7): if no live per-onset event exists, light from the live
beat-feedback event the metronome view already uses and let the review
correct it; say which you did.

If a take was recorded over the pass and its dry stem exists, call
`analyze_take_pitch` and mark wrong notes (naming the note that was heard),
octave slips and unheard notes; chords are `notAssessed` and the review
says once, plainly, that it cannot check the notes inside chords yet, only
their timing (`COACH_UX.md` B2). Recording a take over a song needs W9's
engine mode: build against the command and guard it.

## Stage C — one thing, with its fix as a button

`analyze_attempt` → `Finding[]`. The headline finding becomes a
`CoachAnswer` — `text` + `tabExcerpt` + `action` — rendered by
`CoachBlocks`, with the other findings available behind "what else"
(never pushed, `COACH_UX.md` A4). The rules speak blocks, so there is no
model anywhere in this.

- **Sentences.** A finding becomes a sentence by template, per kind, from
  its evidence numbers, in the coach's voice (`COACH_UX.md` B1: a patient
  session player; plain words; "about a sixteenth early", never a
  percentage as the headline; printed bar numbers, since that is what the
  player sees). Templates are locale keys with parameters, translated
  BEFORE they become a `text` block (W7's finding 7). Three variants per
  kind through the existing shuffle-bag so the coach does not repeat
  itself. English written properly; the other 14 locales may carry English.
- **The `tabExcerpt` slot** gets its real component: those bars of the
  tab, coloured by the attempt. `take` and `compare` get theirs if stage B
  has takes; otherwise leave the placeholders.
- **Actions do what they say.** `loopBars` sets the range and the tempo
  percentage and is ready to play; `ramp` sets the range at the lower
  percentage and steps it up each clean pass to the upper one (in the
  frontend, by pass, until the engine has its own); `clickSubdivision`
  already works; `comeBack` writes a due item through the store (W6's
  `srs.rs` gives the date — add the command if W10 did not) and the Songs
  library shows a quiet "due" mark on that song.
- **`progress`**: `queryAttempts({ scoreId, barRange })` → a small line of
  this passage over time, shown with `improved` findings.
- **Quiet while playing** (`COACH_UX.md` A3): in Songs the coach says and
  shows nothing while the transport runs. The review appears on stop.

## Gates

build; vitest (attempt lifecycle incl. the eight-onset floor; every finding
kind produces a sentence, a block list that survives `resolve` with
nothing dropped, and an action that changes the state it names; colouring
from a fixture attempt); layout tests for the review at the minimum window
size in the two narrowest widths and all 13 themes; `npm run test:rust` if
you add a command. New scenes in the shots harness so the owner can look
at a review without playing one.

## Not yours

Scoring, findings and pitch internals (call them, do not change them; a
wrong number is a finding for your report), the engine, a model of any
kind, the coach card outside Songs.
