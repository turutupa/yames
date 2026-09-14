# W24 — the cheat sheet's data: power chords, colours, what fits the key

Branch `jam-v2-w24-cheatsheet-data` from `jam-v2` (tip 00487cf or later).
Read `plans/tasks/jam-v2/BRIEF.md`, then decision **A10** in
`plans/JAM_UX_DECISIONS.md`. Area: `src/jam/harmony.ts`, `src/jam/diatonic.ts`,
`src/jam/chordShapes.ts`, `src/jam/bandChord.ts`, `src/jam/keysline.ts`,
`src/jam/bassline.ts` (only as far as a `"5"` chord needs), a new
`src/jam/cheatSheet.ts`, and their tests. **No screen files, no locale
files, no `src-tauri/`.** W25 builds the screen against the contract below
at the same time, so the names and signatures here are fixed; if one has to
change, say so in the report and why.

## 1. The power chord is a chord type

`"5"` joins `ChordQuality` in `harmony.ts`, with suffix `"5"` and intervals
`[0, 7]`. Every exhaustive `Record<ChordQuality, …>` in the tree compiles
again (`harmony.ts` QUALITY_SUFFIX and QUALITY_INTERVALS, `diatonic.ts`
CHORD_TONES and CHORD_QUALITIES, `bandChord.ts` BASS_QUALITY, anything
else `tsc` finds). The band plays it without a third: bass root and fifth,
keys root, fifth and octave — wherever a third is chosen from the quality,
`"5"` chooses none. A jam whose progression holds a `"5"` chord compiles
and its bass and keys lines contain no third. The progression editor
(`ChordPicker.tsx`) lists whatever the quality list exports; check that a
`"5"` there needs nothing from you beyond the type (it may need a locale
key — if so, name it in the report for W25: `jam.changes.quality5` or
whatever the existing pattern is; do not add it yourself).

`spellsChord`: the fifth is omittable in every quality except `"5"`, where
it is the only other note. Encode that rule, not a special case in the
caller.

## 2. Shapes for it

Guitar: the two-string and three-string (with octave) power grips rooted on
the sixth, fifth and fourth strings, movable, `size: "triad"`; and at the
nut, E5, A5 and D5 either as open seeds or by letting the movable form sit
at position 0 — whichever the library already does for the E-form major at
E (read `shapesFor` before deciding). Bass: root-and-fifth on the fourth
and third strings, and the three-note version with the octave. Every root
gets at least three guitar shapes and two bass shapes; `shapeCount("5",
…)` says so in a test. Names as players say them: "E-string power chord",
"A-string power chord", "with the octave".

## 3. `src/jam/cheatSheet.ts` — the contract W25 reads

```ts
export type ChordFlavour = "triads" | "sevenths" | "colours" | "power";
export const CHORD_FLAVOURS: readonly ChordFlavour[];

/** In-key page: the chords of the key at one flavour, in degree order. */
export function chordsAtFlavour(root: PitchClass, mode: KeyMode, flavour: ChordFlavour): DiatonicChord[];

/** The flavour a jam's sheet opens on: rock/hardRock/metal → power; jazz, blues → sevenths; else triads. */
export function defaultFlavour(jam: Pick<Jam, "vibe" | "key">): ChordFlavour;

/** The key's note set, derived from the chords listed for it (A10). */
export function keyNoteSet(root: PitchClass, mode: KeyMode): ReadonlySet<PitchClass>;

/** Every note of the chord is in the key's note set. */
export function fitsKey(chord: Chord, root: PitchClass, mode: KeyMode): boolean;

export type ChordFamily = "basic" | "sevenths" | "colours";
export const CHORD_FAMILIES: readonly ChordFamily[];
/** basic: maj min 5 dim aug · sevenths: 7 maj7 m7 m7b5 dim7 · colours: sus2 sus4 add9 6 m6 9 */
export function qualitiesInFamily(family: ChordFamily): readonly ChordQuality[];

/** The twelve roots as the key spells them (flats in flat keys), pitch class 0..11 in order from C. */
export function rootNames(key: Key): { pc: PitchClass; name: string }[];
```

Details that matter:

- `chordsAtFlavour` at `"triads"` is `chordsInKey`, at `"sevenths"` is
  `seventhsInKey`. At `"power"` every degree becomes quality `"5"` with an
  upper-case roman degree and a 5 ("I5", "IV5", "VI5", "bVII5"; a
  diminished degree loses its ° — "VII5"); in a blues, the five listed
  chords the same way. Role is kept.
- At `"colours"` each degree yields the colour chords that fit the key,
  in this priority: sus4, sus2, add9, 6 (or m6 on a minor degree), 9; a
  colour is kept only if `fitsKey` says every note is in the key. Degree
  labels are the degree plus the suffix ("Vsus4", "Iadd9", "ii7" is not a
  colour, "IV6"). Return them grouped by degree in degree order (a flat
  list that keeps the order is enough; W25 groups on `degree`'s root).
  Write down in a test what a C major yields, and check it by ear on
  paper: Csus4 (C F G) fits, Dsus2 (D E A) fits, Esus2 (E F# B) does not,
  Bsus4 (B E F#) does not, Cadd9 fits, C6 fits, Dm6 (D F A B) fits, G9
  fits, C9 (C E G Bb D) does not.
- `keyNoteSet` is the union of the notes of `chordsInKey` ∪
  `seventhsInKey` for that key. Assert in tests: C major → exactly the
  seven scale notes; A minor → the seven plus G#; A blues → nine notes,
  never Bb, Eb or F.
- `defaultFlavour` reads `jam.vibe` (ids in `vibesContract.ts`) and falls
  back to the key's mode (`blues` → sevenths). Undefined vibe and no key →
  triads.
- `rootNames` uses `noteName(pc, key)` from `diatonic.ts`.
- Pure, no React, no i18n: names are chord names, not sentences.

## 4. Tests and gates

Unit tests for every function above; `chordShapes.test.ts` grows the
power-chord cases (every placed `"5"` shape spells root and fifth only, on
guitar and bass, at every root; the nut shapes exist for E, A and D);
`harmony.test.ts` / `diatonic.test.ts` / `bandChord` tests cover `"5"`;
the compile test proves a progression with a `"5"` produces no third in
the bass or keys line. Then the gates in the shared BRIEF: `npx tsc
--noEmit`, `npx vitest run` (the whole suite), and the i18n contract test
will pass unchanged because you add no keys.

## Report

The export list of `cheatSheet.ts` as built, the shape counts per
instrument for `"5"`, the C major colours list, and any locale key W25
must add for the picker.
