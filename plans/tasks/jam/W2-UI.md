# W2 — the mode: Jam in the rail, its library, and its screen

Branch: `jam/w2-ui`, from `jam`. Your area is `src/` (except the contract
files named in BRIEF.md, which you use but do not change) and
`src/locales/`. You do not touch `src-tauri/`. Read `plans/tasks/jam/BRIEF.md`
first.

The design is drawn: `design/jam/Main.dc.html` (the jam playing),
`design/jam/NewJam.dc.html` (the setup) and `design/jam/TradingFours.dc.html`
(not for today). They are static HTML; open them in a browser at 1440×900.
They share the shipped shell's vocabulary (`src/styles/shell.css`,
`metronome.css`), so copy from the real components, not from the mockup
markup. Today's screen is the setup board's controls plus the playing board's
form timeline, without the chord block (Jam 2) and without the band lanes
beyond the drummer. Where the boards and this brief disagree, this brief
wins.

## What to build

### 1. `src/jam/` — the data, pure and tested

- `grooves.ts`: eight grooves with an id, a name key, the meter they are
  written for (`beatsPerBar`, `ticksPerBeat`), the bar pattern, and a fill
  pattern. Rock 8ths, rock 16ths, half-time, shuffle (triplets, middle tick
  silent), waltz (3/4), 6/8, bossa (16ths), swing ride (triplets, ride lane).
  The patterns from `design/jam` are a starting point; make them sound like
  the thing they are named after, with ghosts and accents where a drummer
  would put them. Fills: one bar, a snare figure over the last two beats, a
  crash lands on the next one via `crashOnOne`.
- `feel.ts`: `applyFeel(groove, feel)`. Straight leaves a groove alone.
  Shuffle and swing convert an 8th-note groove (2 ticks per beat) into
  triplets (3 per beat) with the off-beat moved to the third tick; swing also
  drops the hat's off-beat to a ghost. A groove already in triplets keeps its
  pattern. Never change `beatsPerBar`.
- `forms.ts`: bars per form kind from `JAM_FORM_BARS`, and the section
  boundaries the timeline draws: blues12 → [4, 4, 4], loop8 → [8], bars16 →
  [8, 8], aaba32 → [8, 8, 8, 8], one → [4], custom → [bars].
- `compile.ts`: `compileJam(jam): JamEngineConfig` from a `Jam` record —
  groove, feel, intensity gain, form bars, fills. Pure.
- `jams.ts`: `createJam`, `renameJam`, `upsertJam`, `duplicateJam`, a
  `newId` like `setlists.ts`, and `STARTER_JAMS`: Slow blues in A (92,
  shuffle, blues12, key "A"), Funk in E (104, rock 16ths, loop8, "E"), Bossa
  in D minor (120, bossa, bars16, "Dm"), Swing in F (160, swing ride, aaba32,
  "F"), Rock in G (120, rock 8ths, loop8, "G"), Waltz in C (140, waltz,
  bars16, "C"). Count-in one bar, fills on.
- `index.ts` re-exports. Tests for every module: feel conversion keeps tick
  counts consistent, every starter jam compiles to a config whose lanes have
  `beatsPerBar × ticksPerBeat` entries, forms sum to their bar counts.

### 2. The shell

- `Rail.tsx`: a fourth mode, `jam`, after Drill. Icon: the four bars from
  `design/jam` (`railIcons.jam` in the build script is stroke SVG; redraw it
  in the rail's 18px, stroke-2 style). `nav.jam` in `shell.json`.
- `useTabRouting.ts`: `PLAY_TABS` gains `"jam"`. `MainHeader.tsx`'s
  `MainView`, `useActionDispatcher.ts`'s `ViewName` and `prevTab` unions gain
  it too; `hotkeys.ts` gains `tab-4` bound to mod+4 with the same shape as
  `tab-3`. Every place that narrows a view to `"beat" | "drill"` must be
  visited (grep `as "beat" | "drill"` and `view === "drill" ? "drill" :
  "beat"`); jam behaves like beat wherever a play tab is expected, including
  the coach session, so the coach listens on a jam exactly as it does on the
  metronome.
- `PresetSidebar.tsx`: on the jam tab the library IS the jams, the way the
  setlist tab's is the setlists (`showSetlists` is the pattern). Rows show
  the name and `92 · 12-bar`. New, rename, delete, duplicate, reorder by
  drag, load. The `+` creates a jam from the current one's settings, named
  "New jam", and loads it.
- `MainWindow.tsx`: owns the jam list (load with `listJams()`; when it
  returns `undefined` seed `STARTER_JAMS` and save), the active jam, and
  dirty tracking with Save / Revert in the context bar (the setlist's
  `SetlistSaveBar` is the shape to copy). Loading a jam: `setBpm`,
  `setFreeMode(false)`, `setBeatGroups([beatsPerBar])`,
  `setSubdivision(ticksPerBeat)`, then `setJam(compileJam(jam))`, in that
  order. Every edit recompiles and re-sends. Leaving the jam tab sends
  `setJam(null)`; entering it re-sends. Pressing play on a jam with a
  count-in arms it first (`armCountIn`, the way `useSetlistRunner` does).
  `setJam` rejects while W1's command does not exist yet: catch it, log
  once, keep going, so you can run the app before the engine lands.
- `Transport.tsx`: `view: "jam"` shows bar `formBar + 1` / `formBars` and the
  chorus, from the latest `BeatEvent`, in the readout style already there.

### 3. The screen: `src/containers/jam/`

`JamView.tsx` and whatever it needs, `src/styles/jam.css`, in the stage's
existing vocabulary (`stage-label`, the subdivision cards, the segmented
accent control, the meter chip). Top to bottom:

- **Tempo**: reuse what `MetronomeView` uses (`useBpmEditing`, the stepper,
  tap) rather than a second implementation.
- **Feel** and **Intensity**: segmented controls.
- **Groove**: the eight cards with a small lane glyph each (three rows of
  dots, one column per tick; draw it from the pattern, do not hand-place).
- **Form**: six cards; custom shows a bar stepper 1..64. **Count-in**
  segmented (none / 1 bar / 2 bars, in beats of the form's meter). **Fills**
  toggle.
- **The form timeline**: one cell per bar, grouped by section, the current
  bar lit with a beat progress line, a fill mark on the last bar of the
  chorus when fills are on, the chorus count in the label. Drives from
  `BeatEvent.formBar`, `chorus`, `measureBeat`.
- The line "Headphones keep the score honest" with the headphone glyph.
- Empty state when there is no jam loaded, like `SetlistEmpty`.

### 4. Strings

`jam.json` in every locale directory (fifteen), `nav.jam` and the `tab-4`
label in `shell.json` everywhere, and `"jam"` added to `NAMESPACES` in
`src/test/i18n.locales.test.ts`. English first, then the other fourteen
with the register the existing files use (look at `setlist.json` in `de`
and `es` for tone). Groove and form names are translated; jam names in the
starter set are not.

### 5. Tests

Vitest for the data modules (above), `Rail.test.tsx`, `Transport.test.tsx`
and `useTabRouting.test.ts` extended for the new tab, and a `JamView` test
that renders with a jam and asserts the timeline shows "bar 3 of 12" for a
beat event on bar index 2. Update `src/shots/mockIpc.ts` and any test
fixture that builds a `BeatEvent` for the two new fields.

### 6. Run it

After the gates: back up the store as BRIEF.md says, then
`YAMES_DEV_NO_LLM=1 npm run tauri dev` with `CARGO_TARGET_DIR` pointed at
the warm dir. Click through: open Jam, see six starters, load one, edit
groove and form, save, press play (the click plays; the drummer arrives when
W1 merges), watch the timeline count, leave for the metronome tab and come
back. Take screenshots of the empty state, the loaded state, and playing;
put them in your worktree's `.screenshots/` and name them in the report.
Restore the store if its hash changed.

## What not to do

- No chord or key UI beyond the name. No kit picker. No groove editor. No
  drop-out or trading controls. No coach changes.
- Nothing in `src-tauri/`. If the contract does not give you something you
  need from the engine, say exactly what and keep going.
- Do not add a fifth tab shortcut scheme; `tab-4` follows `tab-3`.
- Do not machine-translate by copying English into fourteen files. Real
  translations, in the register the neighbours use.
