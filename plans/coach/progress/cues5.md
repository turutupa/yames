# Leg cues5: Scales and Modes' cues (one thing to try)

Branch `coach-cues5`, worktree `/home/dgx-delgado/yames-coach-cues5`, logs `/tmp/coach-cues5/`.
Cues: `src/paths/specs/scales-and-modes-cues.ts`, attached with `withCues` in `scales-and-modes.ts`.

## State

- [x] Step 1: read; 72 Exercises (66 graded and 3 self-checked in 19 Steps, 3 warm-ups). Dump
  `/tmp/coach-cues5/scales-and-modes-dump.txt`.
- [x] Level 1 (Beginner: major-scale, movable-major, what-a-key-is, keys-by-hand, relative-minor,
  minor-second-key, warm-up scale-walk), 23 Exercises.
- [x] Level 2 (Intermediate: chords-from-the-scale, harmonic-minor, harmonic-minor-again, sequences,
  more-neck, second-shape, warm-up shape-of-the-day), 24 Exercises.
- [x] Level 3 (Advanced: dorian, mixolydian, box-plus-two, modes-second-key, same-notes-new-home,
  choosing, choosing-again, warm-up mode-of-the-day), 25 Exercises (3 self-checked: general cue only).
  `check`: 0 errors, 0 `cue.refused`, 0 cues rewritten for a variant (`/tmp/coach-cues5/gc5.log`).
- [x] Proof-read (below); `check` after the fixes: 0 errors, 0 refused, 0 rewritten (`gc7.log`).
- [ ] Translations.
- [ ] Gates.

## The proof-read (three separate sonnet readers, one per Level: cues, tabs, purposes, how-tos, the guide's rules)

29 objections (`/tmp/coach-cues5/proof-scales-and-modes/objections-{a,b,c}.md`), 26 taken, 3 answered.
Taken (was -> now): formula notes "Say 'half' as you play notes four and eight." (false on the way down)
-> "Sing each note before you play it."; formula lastBars duplicated the general -> "Keep the way down as
even as the way up." · in-thirds / sequences thirds stringChange "Let the shape tell you which string is
next." (vague) -> "Know the next string before each pair starts." · tune-two-keys shift "each long note"
(the long F does not move) -> "Move two frets as each half's last note ends." · c-then-f notes "fret
eight in the F bars" (also the A string's F) -> "Keep B flat on the D string's fret eight." ·
three-frets-down lastBars named next lap's notes -> "Say D, C, B, A as you come down." · scale-walk
lastBars duplicated the general -> "Keep the quarters even right to the end." · seven-chords and
seven-chords-from-a afterHeld "Hop the same finger to the next root" (false at two spots) -> "Count the
long note out, then the next root." · harmonic-shape and e-harmonic-shape general "Listen for the raised
seventh" (not an order about the hands) -> "Put finger two on the raised seventh."; their stringChange
(missed the crossings) -> the stock crossing cue · harmonic-lick general "rest on A over Am" (the Am bars
end on E and C) -> "Play G sharp over E7 only." · natural-then-harmonic notes duplicated the general ->
"Move the D string's fret five up to six." · threes-down shift "for each B" (the low B is not a reach)
-> "Reach finger one back a fret on the G string." · two-positions general "finger four to one" (one to
four coming down) -> "Play the shape at two, then the shape at five." · walk-and-shape notes gave three
of seven steps -> "Count frets: two, two, one, two, two, two, one."; shift "as soon as each note sounds"
(cut notes short) -> "Move on as each note ends, not before." (also formula) · tune-both-shapes shift
"each long D" (two do not move) -> "Move the hand as each half's last D ends." · shape-of-the-day
lastBars duplicated the general -> "Keep the eighths even right to the last note." · minor-vs-dorian
lastBars named D (the last note is G) -> "Hold the last G two beats, then start again." ·
mixolydian-shape stringChange missed its place -> the stock crossing cue · box-then-two-notes lastBars
skipped the G -> "Hold the last A for its two beats." · three-homes lastBars "hear it as home"
(listening, and a duplicate) -> "Land the last G on the click and let it ring." · sixth-follows lastBars
put the hand's move at the long F sharp -> "Move back a fret as the last phrase starts."

Answered, not changed:
- *chord-then-walk afterHeld names only the long G*: in this tab `afterHeld` can fire only in bar 1,
  the note after bar 4's long G.
- *three-per-string shift "up a fret on the D string" is false coming down*: `shift` can fire only in
  bar 1 (the way up) for this tab.
- *walk-and-shape notes "the app cannot hear names"*: the reworded cue counts frets, it names nothing.

## Refusals and rewordings

Level 1: `cue.specific` refused two cues that named F natural ("never F") on Exercises that play no F:
reworded to name only the F sharp. `cue.refused` on the formula's and the beginner warm-up's string
variants (the G and D strings are not a uniform transposition of the B string): "one fret each",
"finger", "each new fret", "the hand", "'whole' or 'half' for each step" -> orders that name a note,
not a fret ("See where the next note is before the click.", "Move on as soon as each note sounds.",
"Start one note higher as each bar starts.", "Say 'half' as you play notes four and eight.").

Level 2: the intermediate warm-up's minor-shape variants refused "the same two frets higher", "the
hand", "cross strings" -> "Play it twice: the second time just as even.", "Have the first note ready
as the held one ends.", "Keep the pick close to the strings.". The key-moved Exercises (one shape
moved along the same strings) say degrees, fingers and string names and were refused nothing.

Level 3: one cue over 48 characters ("Find the third three frets above A, four above D." -> "Find each
chord's third from its root."); the Dorian shape in D refused "Reach finger one back" (in D the reach
is not the same) -> "Put finger one on the raised sixth.".
