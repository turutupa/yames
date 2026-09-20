# W13 — the screen, fourth pass: your own changes, any meter, the mix, the sticks, the cues, Zen

Branch: `jam-w13-ui-changes`, from `jam` AFTER W12 has merged. Your area
is `src/` and `src/locales/`, not `src-tauri/`. Read
`plans/tasks/jam/BRIEF.md`, `INTEGRATION-NOTES.md`, the UI briefs W2, W8,
W12 for what exists, `plans/JAM_MODE.md` §3–§5, and the contract:
`Jam.progression`, `Jam.meter`, `Jam.mix`, `Jam.countInSound`, `Jam.cues`,
`JamEngineConfig.keys`, `mix`, `countInSound`, `JamKeysLine`.

The engine side (keys, mix, sticks) is W14's and may not be on `jam` while
you work; the engine ignores unknown fields, so send them anyway.

## What to build

### 1. Your own changes

- The timeline's chord cells become editable: tap a cell (in an "Edit
  changes" mode entered from the FORM header, or a long-press) to pick a
  chord: twelve roots × the qualities `harmony.ts` knows, plus "as the
  form" to clear. Stored as `Jam.progression` (chord names per bar; keep
  it exactly `form.bars` long, extend or truncate when the form changes,
  document the rule). `chordsForForm` is replaced by the progression when
  present. Add `parseChordName` to `harmony.ts` (the inverse of
  `chordName`, tolerant of "Bb"/"A#", "maj7"/"Δ", "m7"/"-7", "dim"/"°").
- The NOW block, the strip, the shapes row and the bass follow the
  progression; the key picker sets the default progression and stays the
  spelling source.

### 2. Any meter

- A METER control on the setup screen: the metronome's meter presets
  (`MeterPresets` and `METER_PRESETS` in `src/constants/metronome.ts`,
  reuse them) plus ticks per beat. Default: the groove's own. Stored as
  `Jam.meter`.
- `ruleGroove(beatGroups, ticksPerBeat)` in `src/jam/grooves.ts`: kick on
  each group's first beat, snare on the last beat of every group of two or
  more, hats on every tick, a fill that plays snare 8ths over the last
  group, per plan §4.1. When the chosen meter is not the groove's,
  `compileJam` uses the rule groove for that meter and the cards say so
  ("Shuffle does not fit 7/8; the drummer plays the rule"). The bar sent
  to the engine uses the beat GROUPS (`setBeatGroups(groups)`) and
  `beatsPerBar` is their sum; the bass and keys lines follow the new tick
  count.

### 3. The mix and the keys

- Per-lane volume sliders on the band rows (drums, bass, keys), stored
  as `Jam.mix`, sent as `mix`.
- The keys row: on/off from the lineup (`keys` is true for drummers by
  default), a comping style (`pads` = whole-bar sustained voicing on beat
  1; `stabs` = the chord on the "and" of 2 and 4, or on the snare's beats
  for other meters), a `keysLineFor(chord, groove, style, meter)` in a
  new `src/jam/keysline.ts` producing `JamKeysLine` with close voicings
  in MIDI 55–79 with voice leading between bars (nearest inversion to the
  previous voicing). Tests: voicings inside the range, at most four
  notes, voice leading moves each note by at most a fourth.

### 4. The count-in, the cues, Zen

- Count-in sound: beep / sticks, on the setup, stored and sent.
- Spoken cues: a toggle on the setup (`Jam.cues`). When the voice is set
  up (`voiceReady` in the app's voice state; see `ttsSpeak` in
  `src/ipc.ts` and how the coach speaks), say the count ("one, two, three,
  four" on the count-in beats, at the tempo, via one `ttsSpeak` per beat or
  a single "one two three four" if latency makes per-beat impossible —
  measure and say which), "your four" and "band's back" on trading bar
  lines, and the section name on section starts. Silent, with no error,
  when no voice is set up; the toggle explains that in its caption.
- Zen for jams: when a jam is loaded, the Zen view (`src/containers/zen/
  FullscreenView.tsx`) shows the chord now and next, bar N of M, the
  chorus, and the beat, nothing else, in the Zen typography.

### 5. Tests, strings, run

Tests for the chord parser (round-trips every chord `chordName` can
write), the progression length rule, the rule groove for 5/4 [3,2] and
7/8 [2,2,3] in 8ths and 16ths, the keys line, the cues decision (speaks
only with a voice), and the Zen view with a jam. Every new string in all
fifteen locales. Shots harness on a port other than 1420 for the edit
mode, a 7/8 jam, the band rows with sliders, and Zen.

## Rules

Nothing in `src-tauri/`. Never touch port 1420 or the owner's store.
Hyphenated branch. Commit on your branch, do not push or merge.
