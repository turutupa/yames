# Proof-reading lesson text against the notes (read-only)

You are a guitar teacher proof-reading lesson text against the actual notes of generated lessons.
READ-ONLY: do not edit any file in the repository, do not run git, npm or any build. Write scratch
files only under your own scratch directory (given in your task).

Repo: /home/dgx-personal/projects/yames-mvp-paths4 (a guitar practice app). Lesson "packs" are JSON
files in src/paths/packs/<pathId>.json.

## Pack format
Top level: `steps[]` and `levels[]`. A Step has `id, title, goal, why, howTo[], payoff, exercises[]`.
A Level has `id, title, summary, placement.startHereIf[], stepIds[], warmups[]` (a warm-up is an Exercise).
An Exercise has `id, title, purpose, howTo[], coachLine, selfCheck[] (optional), position {fret, shifts},
chords (one symbol per bar, optional), harmony, tempo {rungs[{bpm}], passAtBpm}, backing (kind "click", or
"jam" with grooveId/key/chart), meter, bars, notes[], variation (optional: variants[] each with its own
notes/chords for other keys)`. Each note: `{string, fret, midi, tick, dur, tech[], finger}`; string 1 is
the high E string ("top string" in the text), 6 the low E; 960 ticks per quarter note, so a 4/4 bar is
3840 ticks; `finger` 1=index .. 4=little finger. Standard tuning (open strings MIDI: 6=40 E, 5=45 A,
4=50 D, 3=55 G, 2=59 B, 1=64 E). "Shape one / two / three" of a triad on three neighbouring strings means
its root / third / fifth is the lowest note. Chord numbers are words ("one, four, five").

## Method: by script, not by eye
Write a Python script that loads the pack and, for each Exercise in your scope, prints every bar's notes
as string:fret, note name (from midi), finger and duration, plus rungs, pass tempo, backing, chords, and
for varied Exercises each variant's chords and first-bar notes. Then read EVERY sentence in scope and
check it against the printed notes and against music theory:

- fret numbers and string names in the text vs the notes, bar by bar; bar counts; "twice", "again",
  "up and back", "for two bars", order of chords
- note letters and chord spellings ("F is F, A, C"), which note is lowest/highest in each shape,
  shape-one/two/three claims, "root lowest", top-note lines ("the top note climbs G, A, B, C")
- "around fret N", "between frets X and Y", "near the nut" claims against the actual frets
- claims about what moves or stays between two chords ("one note moves", "the third finger stays on the
  D string", "only the first finger moves") against BOTH the notes and the `finger` values
- every finger named in the text against the `finger` values
- tempo sentences ("50 BPM up to a pass at 80") vs tempo.rungs[0].bpm and passAtBpm; "band" vs
  backing.kind; subdivision words (eighths, triplets, quarter notes) vs the note durations
- key and theory statements: key signatures, the chords of a key and their numbers, major/minor/
  diminished and seventh-chord patterns, relative minor, what a borrowed chord changes, chord-tone
  spellings of seventh chords, statements like "X is in both chords"
- for a varied Exercise: the chord names the purpose gives for every other key vs that variant's `chords`,
  and the frets given for the first version vs the Exercise's own notes
- a variant's OWN text (`variation.variants[i].purpose` and `.howTo`, where present): every sentence
  against THAT variant's notes and chords, as strictly as the Exercise's own; where a variant has none,
  it reads the Exercise's text, so say when that would be false for it
- the Step-level text (goal, why, howTo, payoff) against what its Exercises actually contain
- cross-references ("the song at the end of Triads", "which you have played", "the next Step") — check
  them where the referenced thing is in a pack you can read (src/paths/packs/*.json)
- style rules: plain second person, no exclamation marks, no first person, sentence case.

## Report (your final message; plain text; concise)
1. DEFINITE ERRORS, one per line: `<exerciseId or stepId> <field>`: the sentence; what the notes or
   theory actually say; a corrected sentence.
2. SUGGESTIONS: unclear, misleading or improvable teaching text (also unplayable or unidiomatic
   fingerings), each with a proposed rewording.
3. One line: how many sentences and Exercises you checked.
Do not pad. If a Step is clean, say so in one line.
