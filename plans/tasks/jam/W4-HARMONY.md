# W4 — the changes: keys, chords, scales, and a fretboard

Branch: `jam/w4-harmony`, from `jam`. Your area is NEW files only:
`src/jam/harmony.ts`, `src/jam/harmony.test.ts`, `src/jam/scales.ts`,
`src/jam/scales.test.ts`, and `src/components/fretboard/` (component, CSS in
`src/styles/fretboard.css`, tests). You do not edit any existing file: the
UI worker is building the jam screen and will integrate your modules after
you both land. Read `plans/tasks/jam/BRIEF.md` first, then
`plans/JAM_MODE.md` §4.3 and §5. Deterministic, pure, tested. The model is
never involved: this is theory as data.

## `harmony.ts`

- Pitch classes, note names with a spelling policy (sharps for G D A E B
  F#, flats for F Bb Eb Ab Db), MIDI ↔ name.
- `Key = { root: PitchClass; mode: "blues" | "major" | "minor" }`.
- Chord symbols: `{ root, quality }` with qualities enough for the forms:
  `7`, `maj7`, `m7`, `m7b5`, `dim7`, `6`, `m6`, `9`, and plain triads
  `maj`/`min`. `chordName(chord, key)` renders "A7", "Dm7", "Bb".
- Progressions per form kind, in Roman numerals resolved against the key,
  one chord per bar (two per bar allowed as a pair):
  - `blues12`: I7 I7 I7 I7 | IV7 IV7 I7 I7 | V7 IV7 I7 V7. For `minor` keys
    the minor blues: i7 i7 i7 i7 | iv7 iv7 i7 i7 | bVI7 V7 i7 V7.
  - `loop8`: major → I V vi IV, twice; minor → i bVII bVI V (Andalusian),
    twice; blues → I7 IV7, four times.
  - `bars16`: major → I vi ii V ×2 then IV V I I, IV V I V; minor and blues
    analogous and sensible. Document the choice in a comment.
  - `aaba32`: an "I Got Rhythm" style A (I vi ii V ×2, I I7 IV #ivdim, I V I I)
    with a B of III7 VI7 II7 V7 (two bars each), then A again. Minor: a
    sensible minor analogue, documented.
  - `one`: I7 (blues), I (major), i (minor), four bars.
  - `custom`: I for every bar (the user edits later; not today).
- `chordsForForm(kind, bars, key): Chord[]` returns exactly `bars` entries.
- Transposition: `transposeChord(chord, semitones)`, and
  `displayTransposition(instrument)`: concert for guitar/bass/piano/drums/
  other; +2 (Bb) and +9 (Eb) available as named options for horns. Keep it
  a function of an option, not of the instrument id, since onboarding's
  instrument list has no horns yet.

## `scales.ts`

- Scale definitions as interval sets: major, natural minor, dorian,
  mixolydian, minor pentatonic, major pentatonic, blues (minor pentatonic +
  b5), harmonic minor, altered (for V7 in minor, optional).
- `scalesForChord(chord, key): ScaleSuggestion[]` ranked: for a I7 in a
  blues key → mixolydian first, minor pentatonic second, blues scale third;
  for a ii-V in major → dorian / mixolydian; for a minor i → dorian or
  natural minor, minor pentatonic. Return at most three, each with a short
  key for the UI ("scale.mixolydian") and the pitch classes.
- `scaleNotes(root, scale): PitchClass[]`.

## `Fretboard`

`src/components/fretboard/Fretboard.tsx`: an SVG fretboard, props:
`tuning` (default standard guitar E A D G B E; also 4-string bass E A D G),
`frets` (default 12, from a `startFret`), `highlight: { pitchClasses,
rootPitchClass }`, `size: "small" | "large"`. Root notes filled with the
accent colour, other scale tones outlined, fret markers at 3 5 7 9 12. Uses
the app's CSS custom properties (`--accent`, `--text-secondary`,
`--border`, `--bg-card`; see `src/styles/shell.css` and `global.css`) so it
follows every theme. Inline SVG, no library. A `FretboardStrip` variant that
shows only the highlighted positions for a given scale in one position
(`startFret`) is welcome but optional.

Tests: pitch spelling round-trips; every form kind returns exactly `bars`
chords for every key and mode; blues12 in A is A7 A7 A7 A7 D7 D7 A7 A7 E7
D7 A7 E7; transposition wraps; `scalesForChord(A7, A blues)` puts
mixolydian first; the fretboard renders the right number of dots for A
minor pentatonic in standard tuning across 12 frets (count them).

## Gates

The ones in BRIEF.md; `npx tsc --noEmit` and `npm test` are the ones your
files affect, run all five anyway.

## Report

As in BRIEF.md. Include the export list of each module, since the UI worker
integrates from your report.
