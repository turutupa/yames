# W5 — the band's brain: bass lines, practice windows, tempo trainer, lineup

Branch: `jam/w5-band`, from `jam`. Your area is NEW files only:
`src/jam/bassline.ts`, `src/jam/practice.ts`, `src/jam/lineup.ts`,
`src/jam/tempoTrainer.ts` and their `.test.ts` files. You do not edit any
existing file: the UI worker integrates after you both land, and the engine
worker implements the engine side of the same contract. Read
`plans/tasks/jam/BRIEF.md` first, then `plans/JAM_MODE.md` §3, §4.3, §4.4,
§5, and the contract in `src/jam/types.ts` (`JamBassLine`,
`JamPracticeConfig`, `JamPracticeSettings`, `JamBandState`). Pure, tested,
deterministic. No model anywhere.

## `bassline.ts`

`bassLineFor({ groove, feel, chords, beatsPerBar, ticksPerBeat, style }):
JamBassLine` — one MIDI note per tick for ONE bar, given that bar's chord
(and the next bar's, for approach notes). `groove` is the drum pattern the
UI compiled (`JamPattern`) and `style` is derived from the groove id:

- `rock` (rock 8ths, rock 16ths, half-time): root on every kick, fifth or
  octave on the "and" before a chord change, otherwise rests. Octave down
  from a bass range of E1–G3 (MIDI 28–55); keep the line inside it.
- `shuffle`: the classic blues walk-up: root, third, fifth, sixth on the
  four beats (swing eighths handled by the ticks the UI already made
  triplets), b7 on the way down in the second bar of a two-bar phrase.
- `swing`: a walking line: quarter notes, root on 1, chord tones on 3,
  chromatic or diatonic approach into the next bar's root on 4. Document
  the rule; make it deterministic (no randomness).
- `bossa`: the bossa bass: root on 1, fifth on the "and of 2", root on 3,
  fifth on the "and of 4" (dotted pattern on 16ths).
- `waltz` and `sixeight`: root on 1, fifth on the strong beat of the second
  group.
- `funk`: root on the one, octave pops on 16th off-beats where the kick
  plays, rests elsewhere.

Every rest is `0`. The gain is 1.0. Export `BASS_STYLE_FOR_GROOVE: Record<
grooveId, style>` and the chord-tone helpers you need (`chordTones(chord)`
returning intervals from the root); take the chord type from
`src/jam/harmony.ts` only if W4 has landed in your worktree (it has not —
so define a minimal `BassChord = { rootMidi: number; quality: "7" | "maj7" |
"m7" | "maj" | "min" | "m7b5" | "dim7" | "6" | "m6" | "9" }` here and let the
integrator adapt).

Tests: every style returns exactly `beatsPerBar × ticksPerBeat` entries;
every non-zero pitch is inside 28–55; the shuffle walk-up on A7 is A C# E
F#; the walking line ends a bar with an approach a semitone or a scale step
below or above the next root; rock plays a root wherever the kick lane is
non-zero.

## `practice.ts`

`bandStateForBar({ formBar, chorus, formBars, practice }): JamBandState` —
the same rule the engine applies, so the UI can draw ahead: absolute bar
index is `(chorus − 1) × formBars + formBar`; a drop-out window is
`dropOut.bars` bars starting at every multiple of `dropOut.everyBars`
(counting from bar 0, but never bar 0 itself: the first drop-out begins at
`everyBars`); trading alternates `bandBars` of "full" and `youBars` of
"hatsOnly" from bar 0; drop-out wins. Also
`practiceConfigFrom(settings: JamPracticeSettings): JamPracticeConfig | null`
(0 means off) and `bandStatesForChorus(...)` returning one state per bar of a
chorus for the timeline.

Tests: with everyBars 8, bars 2, form 12: bars 8–9 silent, 20–21 silent,
nothing before 8; trading 4/4 on a 12-bar form: bars 4–7 hatsOnly, 12–15
full again; both set and overlapping: silent wins.

## `tempoTrainer.ts`

`tempoAfterChorus({ bpm, chorus, tempoStep, tempoEveryChoruses, ceiling
= 300 })`: the tempo the next chorus should start at, unchanged when off,
stepping every N choruses, never above the ceiling. The UI applies it on
the beat event that starts a chorus.

## `lineup.ts`

`lineupFor(instrument: InstrumentId): { drums: boolean; bass: boolean;
keys: boolean; you: "guitar" | "bass" | "drums" | "keys" | "other" }` — the
band never plays your instrument (plan §3.1): drums → drums off, bass and
keys on; bass → bass off; piano → keys off; guitars and other → drums and
bass on, keys off. Plus `bandDescription(lineup)` returning a key list for
the UI to translate ("drums · bass").

## Gates

The ones in BRIEF.md; your files touch only `tsc` and `vitest`, run all
five anyway.

## Report

As in BRIEF.md, with the export list of each module.
