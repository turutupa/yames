# Integration notes — what the first wave left for the second

Collected by the orchestrator from the workers' reports, for W7 (engine,
second pass) and W8 (screen, second pass). Everything below is merged on
`jam`; read the modules themselves for signatures.

## Branch names

`jam/<name>` cannot exist beside the `jam` branch; every worker branch is
`jam-<name>`.

## One expected red test until the engine lands

`src/ipc.commands.test.ts` fails on `jam` with `missing = ["set_jam"]`
because the contract added `setJam` to `src/ipc.ts` before the Rust
handler existed. It clears when W1's branch merges. Nobody else touches it.

## `src/jam/harmony.ts` (W4)

- Types `PitchClass`, `Spelling`, `KeyMode`, `Key`, `ChordQuality`, `Chord`,
  `FormBar`, `TranspositionOption`; consts `SHARP_NAMES`, `FLAT_NAMES`,
  `TRANSPOSITION_OPTIONS`.
- `keyName(key)` writes the contract's `Jam.key` string ("A", "Dm",
  "A blues"); `parseKey(text)` reads it back and returns null on anything
  unreadable. Use these two; do not invent a second key encoding.
- `barsForForm(kind, bars, key)` gives `{ chords: [...] }` per bar (one or
  two chords; rhythm changes has two in a bar) for the NOW block.
  `chordsForForm(kind, bars, key)` gives the downbeat chord per bar for the
  timeline. Both are exactly `bars` long.
- `chordName(chord, key)` spells from the key signature (D minor is a flat
  key). `transposeChord`, `transposeKey`, `displayTransposition`,
  `transpositionForInstrument`.
- Scales: `src/jam/scales.ts` — `scalesForChord(chord, key)` returns up to
  three `ScaleSuggestion`s, best first, each with an i18n key
  (`scale.major`, `scale.naturalMinor`, `scale.dorian`, `scale.mixolydian`,
  `scale.minorPentatonic`, `scale.majorPentatonic`, `scale.blues`,
  `scale.harmonicMinor`, `scale.altered`) and `SCALE_NAMES_EN` as the
  fallback. **W8 adds those nine keys in all fifteen locales.**
- Fretboard: `src/components/fretboard` — default `Fretboard`,
  `FretboardStrip`, `positionForRoot`, `GUITAR_STANDARD_TUNING`,
  `BASS_STANDARD_TUNING`. It holds no strings: pass `ariaLabel` already
  translated or it stays `aria-hidden`.

## `src/jam/bassline.ts`, `practice.ts`, `tempoTrainer.ts`, `lineup.ts` (W5)

- `bassLineFor({ groove, feel, chords, beatsPerBar, ticksPerBeat, style })`
  returns a `JamBassLine` for ONE bar. `bassStyleForGroove(id)` maps a
  groove id to a style and normalises spelling; unknown ids fall back to
  `rock` (roots on the kick). Its `BassChordQuality` is member-for-member
  the same union as harmony's `ChordQuality`, and its interval table
  matches; the adapter is one line:
  `{ rootMidi: chord.root + 12 * octave, quality: chord.quality }`.
- `practiceConfigFrom(settings)`, `bandStateForBar(...)`,
  `bandStatesForChorus(...)`, `absoluteBarIndex(...)`. **Windows are
  phase-locked to the chorus** (see the contract comment on
  `JamPracticeConfig` and W7-ENGINE-BAND.md §3). The engine must implement
  the same rule.
- `tempoAfterChorus({ bpm, chorus, tempoStep, tempoEveryChoruses,
  ceiling })` and `tempoAfterChoruses(...)`.
- `lineupFor(instrument)` → `{ drums, bass, keys, you }`;
  `bandDescription(lineup)` returns the keys `jam.band.drums`,
  `jam.band.bass`, `jam.band.keys` in stage order. **W8 adds those keys.**

## `src/containers/jam/editor` (W6)

- One import: `import { GrooveEditor, fromGroove, resizeGroove, ... } from
  "./editor"`.
- `GrooveEditor` props: `value: JamCustomGroove`, `onChange(next)`,
  `playingTick: number | null`, `page: "bar" | "fill"`, `onPageChange`,
  `onDone`, `onReset`. It holds no pattern state; the caller is the source
  of truth.
- Helpers: `cycleLevel`, `setCell`, `emptyPattern`, `resizePattern`,
  `resizeGroove`, `normalizePattern`, `fromGroove(presetGroove)` (takes any
  `{ name, beatsPerBar, ticksPerBeat, bar, fill? }`, so W2's
  `grooves.ts` entries satisfy it), `columnsOf`, `cellAt`, `cellLabel`,
  `tickLabel`, `isShuffleTick`, `meterCaption`, `EDITABLE_LANES`,
  `LANE_LABELS`, `LEVEL_LABELS`, `SUBDIVISION_NAMES`.
- **Its strings are English literals in one place each** (`LANE_LABELS`,
  `LEVEL_LABELS`, `SUBDIVISION_NAMES`, `cellLabel`, `meterCaption`, and the
  literals in `GrooveEditor.tsx`: "Yours", "Bar", "Fill", "Reset", "Done",
  "Groove name", "Edit the bar or the fill", "The groove, one bar" / "The
  fill, one bar", "Click a cell to cycle"). **W8 swaps them for `t()` and
  adds the keys in all fifteen locales.**
- The crash lane is not editable (it is the crash on the one) and is
  all-zero in every pattern the editor builds.

## Kits (W3)

- 32 files `src-tauri/sounds/kit_<kit>_<voice>.wav`, kits `room`, `tight`,
  `brushes`, `electronic`, voices `kick`, `snare_hi`, `snare_lo`, `hat`,
  `hat_open`, `ride`, `rim`, `crash`. Map and measurements in
  `src-tauri/sounds/KITS.md`. **W7 embeds and wires them.**
- `scripts/sounds/measure_kits.py` re-measures them and exits non-zero on
  any violation; run it after any change to the generator.
- `generate_sounds.py` is NOT the generator of record for the pre-existing
  sounds; `scripts/sounds/rebuild.py` is. `generate_sounds.py --kits`
  regenerates only the kits. Do not run it bare.
- The kits are unauditioned by ear. The owner listens before they are
  called done.

## `src/jam/diatonic.ts`, `chordShapes.ts`, `src/components/chords` (W9)

- `chordsInKey(root, mode)`, `seventhsInKey(...)`, `chordTones`,
  `chordPitchClasses`, `chordName(root, quality, keyRoot?)`, `noteName`.
- `shapesFor(root, quality, { instrument })` → `PlacedShape[]` ordered along
  the neck; `shapeCount`, `spellsChord`, `GUITAR_TUNING`, `BASS_TUNING`,
  `MAX_FRET`, `SHAPES`. Every placement is test-verified to spell its chord.
- Components: `ChordDiagram` (`size: "xs" | "sm" | "md"`, `selected`),
  `KeyChordsStrip` (`root`, `mode`, `current?`, `onPick`, sevenths behind a
  toggle), `ChordShapesRow` (`root`, `quality`, `instrument`,
  `selectedIndex`, `onSelect`, a wrapping next-shape button). Every visible
  word is a prop with an English default (`seventhsLabel`, `nextLabel`,
  `sizeLabels`, `fretLabel`): **W8 passes translated strings in.**
- Its `ChordQuality` is a strict superset of harmony's (adds `dim`, `aug`,
  `sus2`, `sus4`, `add9`). **W8 widens `harmony.ts`'s union with those five,
  makes `diatonic.ts` import `Chord`/`ChordQuality`/`PitchClass` from
  harmony, and swaps in harmony's `chordName`.** One-directional, small.

## The mode itself (W2)

- Data: `src/jam/{grooves,feel,forms,compile,jams}.ts` with `index.ts`.
  `compileJam(jam)` is where the bass and practice config get added.
- Screen: `src/containers/jam/JamView.tsx` and neighbours,
  `src/styles/jam.css`. Session and engine wiring:
  `src/containers/main-window/hooks/useJamSession.ts` (loads, seeds the six
  starters, sets meter before table, catches a missing `set_jam` and logs
  once). Transport reads `formBar` / `chorus` when `view === "jam"`.
- Locales: `src/locales/*/jam.json` exists in all fifteen; `nav.jam` and
  `presets.titleJam` in `shell.json`; the `tab-4` hotkey strings live in
  `settings.json` (the locale test forbids a top-level group in two files).
- The tour's view union accepts `"jam"`; the three `"beat" | "drill"`
  narrowings that lost the setlist on the way back from Settings are fixed
  and pinned by a test.
- `set_jam` is rejected by the engine until W1 merges; the click plays.

## Waves four and five (W11–W13)

- Position: `set_jam_position` is registered; the engine applies jump and
  loop at the bar line, a loop catches a jump, a wrap the loop catches is
  not a chorus, restart begins at the loop's first bar. The UI moves the
  loop to the target section when a jump leaves it (`jumpTo` in
  `useJamSession.ts`).
- The gain memo in `compile()` is keyed on the whole table (bass included)
  in a 64-entry ring: `bass.gain` can move the rendered peak by 40%, so a
  drums-only key was unsafe (W11 measured it).
- `Jam.band.keys` and `Jam.keysStyle` were added additively by W13; the
  engine mirror is unchanged. `chordsForJam` is the one place the changes
  come from (progression or the form's default).
- Spoken counts do not fit a beat: Piper's "one" is 654 ms of audio and
  1.1 s end to end, so the count is one phrase (`perBeatCountFits` says
  "does not fit" until measured otherwise).
- `.sr-only` is now defined in `global.css`; it was used since W8 and never
  defined.
- The BRIEF's robocopy line breaks under the Bash tool (Git Bash rewrites
  `/E`); run it through PowerShell.
