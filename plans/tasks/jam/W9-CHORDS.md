# W9 — the chords in the key, and every way to play them

Branch: `jam/w9-chords`, from `jam`. Your area is NEW files only:
`src/jam/diatonic.ts`, `src/jam/chordShapes.ts`, their `.test.ts`, and
`src/components/chords/` (components, tests) with `src/styles/chords.css`.
You do not edit any existing file: another worker (W4) is writing
`src/jam/harmony.ts` at the same time, so define the minimal types you need
locally (`{ root: 0..11, quality }`) and the integrator adapts. Read
`plans/tasks/jam/BRIEF.md` first, then `plans/JAM_MODE.md` §4.3, the
"Chords in the key, and their shapes" paragraph and §8.9.

The owner's ask, in their words: "if you're in the key of A it shows all
the chords you can play, but also on the fretboard, and for each chord all
the different shapes along the fretboard, from the smallest triad to
seventh chords. One massive sheet might be overwhelming." So: one chord at
a time, shapes ordered along the neck, small and cute, never a wall.

## `diatonic.ts`

- `chordsInKey(root, mode): DiatonicChord[]` for `major`, `minor` (natural,
  with the V7 borrowed from harmonic minor listed too) and `blues` (I7 IV7
  V7 plus the minor pentatonic's bVII and bIII as passing chords). Each
  entry: degree label ("I", "ii", "V7"), root pitch class, quality, a
  `role` ("home", "subdominant", "dominant", "passing") the UI can colour,
  and its seventh variant where one is natural (I → Imaj7, ii → ii7, V →
  V7, vii° → viiø7).
- Chord qualities: `maj`, `min`, `dim`, `aug`, `7`, `maj7`, `m7`, `m7b5`,
  `dim7`, `sus2`, `sus4`, `6`, `m6`, `add9`, `9`.
- `chordTones(quality): number[]` (intervals from the root) and
  `chordName(root, quality)` with the same spelling policy W4 uses (sharps
  for G D A E B F#, flats for F Bb Eb Ab Db). Note it in a comment so the
  integrator can swap in W4's function.

## `chordShapes.ts`

Shape data as musical fact, authored by you as fret and finger numbers.
Do not copy a diagram sheet's layout or text; the shapes themselves are
common knowledge and that is all you take.

- A `Shape = { name, quality, rootString: 6 | 5 | 4, frets: (number |
  null)[] /* per string, low to high; null = muted; 0 = open */, fingers:
  (number | null)[], baseFret: number, barre?: { fret, from, to } }`.
- Movable shapes for every quality above, rooted on strings 6, 5 and 4
  (the CAGED E-, A- and D-form families for major and minor, the standard
  barre and partial shapes for sevenths, m7, m7b5, dim7, maj7, sus, 6, 9).
- Open-position shapes for C A G E D, Am Em Dm, E7 A7 D7 B7 G7 C7, Amaj7
  Cmaj7 Dmaj7 Emaj7, Am7 Em7 Dm7, Asus2 Dsus2 Asus4 Dsus4 Esus4, Cadd9,
  and the F and B shapes people actually use.
- Triads: three-string voicings on string sets 1–3, 2–4, 3–5 in root
  position and both inversions for major, minor, dim, aug.
- Bass (4 strings E A D G): root-position triads and sevenths, two shapes
  each (root on E, root on A), and the one-octave arpeggio shape.
- `shapesFor(root, quality, { instrument: "guitar" | "bass" }): PlacedShape[]`
  — every applicable shape transposed to the root, with its absolute fret
  positions, sorted by position on the neck low to high, de-duplicated,
  none above fret 15. `PlacedShape` carries `size: "triad" | "open" |
  "barre" | "seventh"` so the UI can order from smallest to fullest, and
  the pitch classes each string sounds, so a test can verify every shape
  really spells its chord.

Tests: every shape in the library, transposed to every root, spells
exactly the chord tones of its quality (no wrong notes, no missing third
where the quality has one); `chordsInKey(A, major)` is A Bm C#m D E F#m
G#°; `chordsInKey(A, blues)` starts A7 D7 E7; open C is x32010; the E-form
barre for F is 133211 at fret 1; bass shapes stay within four strings.

## Components

- `ChordDiagram`: the small chord box (5 frets tall, six strings, dots
  with finger numbers, open and muted markers, a barre bar, the base fret
  number at the left when above 1, the name above). Props: `shape`,
  `size: "xs" | "sm" | "md"`, `selected`. Inline SVG, the app's CSS custom
  properties (`--accent`, `--text-primary`, `--text-secondary`,
  `--border`, `--bg-card`), no library. Must read at 64px wide.
- `KeyChordsStrip`: the chords of a key as a row of `ChordDiagram`s in
  `xs`, the current chord highlighted, roles coloured subtly, sevenths
  behind a "7ths" toggle. Props: `root`, `mode`, `current?: {root,
  quality}`, `onPick`.
- `ChordShapesRow`: one chord's shapes in a horizontally scrollable row of
  `sm` diagrams, ordered along the neck, with the size label under each
  ("triad", "open", "barre", "7th"), a "next shape" affordance, and the
  chosen shape reported by `onSelect` so the integrator can highlight it on
  the big fretboard. Props: `root`, `quality`, `instrument`, `selectedIndex`,
  `onSelect`.

Tests for the components with happy-dom: dot counts match the shape,
muted strings show an X, the base fret label appears when above 1, the
strip renders seven chords for a major key.

## Gates

The ones in BRIEF.md; your files touch only `tsc` and `vitest`, run all
five anyway.

## Report

As in BRIEF.md, with the export list and the shape counts per quality.
