# W8 — the screen, second pass: the band, the changes, the tools, the editor

Branch: `jam/w8-ui-band`, from `jam` AFTER W2 (the mode), W4 (harmony and
fretboard), W5 (the band's brain) and W6 (the editor) have merged. Your
area is `src/` and `src/locales/`; you may now edit the jam screen and its
neighbours freely, but not `src-tauri/`. Read `plans/tasks/jam/BRIEF.md`
first, then `W2-UI.md`, and the reports from W4, W5 and W6 (appended below
by the orchestrator) for the exports you integrate. The design boards are
`design/jam/Main.dc.html` and `design/jam/TradingFours.dc.html`.

## What to build

### 1. The band

- A `band` on the jam record (`{ drums, bass }`) with `lineupFor(instrument)`
  from `src/jam/lineup.ts` as the default when a jam is created; the
  setup shows the toggles from the setup board with the caption "you play
  <instrument>, so <instrument> is off the table". The drums toggle off
  means the table is sent with every drum lane at 0; bass off means
  `bass: null`.
- The bass line: `compileJam` now includes `bass` from
  `bassLineFor(...)` in `src/jam/bassline.ts`, one bar at a time is not
  enough for a form with changes, so compile the bass for the CURRENT bar
  and re-send the config at each bar line where the chord changes (the
  beat event with `measureBeat === 0` is the trigger; sending one bar
  ahead is better: when `formBar` changes, send the config for `formBar +
  1`). Document the latency you measured; if it is audible, say so and
  send two bars ahead.
- Band lanes on the playing screen as on the board: drums (groove name and
  kit), bass (the note names of this bar), the "you" lane with the input
  state. Volume per lane can wait; a mute per lane cannot (it is the toggle).

### 2. Kits

A kit picker on the setup screen: room, tight, brushes, electronic, with
one-line descriptions. Stored on the record, sent as `kit`.

### 3. The changes

- A key picker (twelve roots, blues / major / minor) on the setup screen,
  stored as `key` plus a `mode` (extend the record additively; the
  contract's `key?: string` stays for old records).
- `chordsForForm` from `src/jam/harmony.ts` fills the timeline cells with
  chord names when `chords` is on; the NOW block from the playing board
  shows the current chord large, the next chord and when, and up to three
  scale suggestions from `scalesForChord`.
- The fretboard: `Fretboard` from `src/components/fretboard`, shown below
  the NOW block for guitar and bass (from the instrument), collapsed by
  default behind a "Fretboard" link, remembering its open state per session.
- A transposition option (concert / Bb / Eb) in the jam's setup, default
  concert.

### 3b. The chords in the key, and their shapes (W9's components)

- Under the NOW block, `KeyChordsStrip` from `src/components/chords` shows
  the chords of the jam's key with the current chord highlighted; tapping
  one opens `ChordShapesRow` for it, and the chosen shape is drawn on the
  big `Fretboard` (adapt W9's local chord type to W4's `harmony.ts` types
  in one small adapter in `src/jam/`; do not fork either module).
- By default the row shows the CURRENT chord's shapes and advances with the
  changes, so the shapes arrive one chord at a time while you play. A
  "follow the jam" toggle pins the row to a tapped chord instead. Never a
  wall of diagrams: one row, scrollable, sevenths behind a toggle
  (plans/JAM_MODE.md §8.9).
- A hotkey and MIDI action `jam-next-shape` steps the row, so a footswitch
  can page through shapes.
- Bass players get the bass shapes; everyone else gets the strip without
  the row.

### 4. The practice tools

- Drop-out bars (off / every 4 / 8 / 16, for 1 or 2 bars), trading (off /
  2 / 4 / 8), the tempo trainer (off / +2 / +4 every 1 or 2 choruses), as
  toggles in the PRACTICE row of the playing board. Stored as
  `JamPracticeSettings`, compiled to `practice` via `practiceConfigFrom`.
- The timeline draws the band state per bar ahead of time from
  `bandStatesForChorus` (amber "you" cells for trading, dimmed cells for
  drop-outs), and the live state from `BeatEvent.bandState`.
- The tempo trainer applies `tempoAfterChorus` on the first beat of a new
  chorus by calling `setBpm`; the transport shows the new tempo.
- The on-screen cue from the trading board ("Your four", "Band's back") on
  the bar line, in the corner, for two seconds. Spoken cues wait for
  cross-platform voice.

### 5. The editor

- Mount `GrooveEditor` from `src/containers/jam/editor` as a drawer docked
  to the bottom of the stage (the design in `design/drummer/
  GrooveEditor.dc.html`), opened from an EDIT link on the selected groove
  card and from a "Make your own" card. Editing a preset groove copies it
  to `customGroove` on the jam (`fromGroove`); the jam then plays the
  custom one. Reset returns to the preset. Playing continues while editing,
  with the column lit from `BeatEvent`.
- Feel and intensity still apply on top of a custom groove.

### 6. Hands-free and honesty

- Hotkey and MIDI actions in `useActionDispatcher` / `hotkeys.ts`:
  `jam-next-groove`, `jam-prev-groove`, `jam-trade` (toggle trading),
  `jam-dropout` (toggle drop-outs). Add them to the shortcuts sheet.
- The session record: when a session ends while the jam tab is active,
  tag it (`mode: "jam"`, additive, in whatever the saved-session shape
  allows from the frontend without touching Rust; if the shape is
  Rust-owned, put the flag in the session's metadata field if one exists,
  and if none does, say so in the report and skip).

### 7. Strings, tests, run

Every new string in all fifteen locales. Tests for the integration points
(compile with bass, timeline states, tempo trainer application, editor
mount). Then run the app with the engine's second pass merged (the
orchestrator tells you when): a full jam with bass and chords, a drop-out,
a trade, an edited groove. Screenshots into `.screenshots/`.

## Rules

Nothing in `src-tauri/`. Store backup as BRIEF.md says before running the
app; one instance at a time.
