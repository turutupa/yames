# Leg cues7: Legato's cues (one thing to try)

Branch `coach-cues7`, worktree `/home/dgx-delgado/yames-coach-cues7`, logs `/tmp/coach-cues7/`.
Cues: `src/paths/specs/legato-cues.ts`, attached with `withCues` in `legato.ts`.

## State

- [x] Step 1: read; 52 Exercises (46 graded in 13 Steps, 6 warm-ups). Dump
  `/tmp/coach-cues7/legato-dump.txt`. Levels: beginner (first-hammers, first-pulls, hammer-and-pull +
  2 warm-ups, 13), intermediate (rolls, pentatonic-legato, three-per-string, three-per-string-shapes +
  2 warm-ups, 17), advanced (from-nowhere, nowhere-box, six-string-runs, odd-groups, long-lines,
  second-key + 2 warm-ups, 22).
- [x] Level 1: 13 Exercises. `check`: 0 errors, 0 `cue.refused`, no cue rewritten (`gc3.log`).
- [x] Level 2: 17 Exercises. `check`: 0 errors, 0 `cue.refused`, no cue rewritten (`gc6.log`).
- [x] Level 3: 22 Exercises. `check`: 0 errors, 0 `cue.refused`, no cue rewritten (`gc8.log`).
- [ ] Proof-read
- [ ] Translations
- [ ] Gates

## Refusals and rewordings

Level 1: slow-trill "Keep the first finger planted" (the fingers differ on the B-5-6 variant) -> "Keep the
lower note fretted the whole time."; "Trill between the same two frets" and "Say the group's three
frets" (a distance, not a uniform move) -> "notes"; triplet-down "Set all three fingers down" / "Fret
all three notes" (fingers / fret layout differ on two string sets) -> "Have every finger down before
the pick."; hammer-climb warm-up "Move the hand up one note", "Move the hand on the picked note",
"then step up" (hand position / interval) -> "Pick the lower note, hammer the upper one." and "Step up
on the picked note, not after." (accepted).

Level 2: the roll-climb warm-up refused "the shape changes as it climbs" and "before you reach them"
("reach" and "shape" are layout words; the string variants are not a uniform transposition) -> "Know
the next three notes before you play them."

Level 3: only the advanced warm-up (two strings around the chords, on three string sets) refused four:
"the upper string" (which string is higher), "the next pick" and "the next string" (which string is
next), "Shift during the long note" (the hand's position) -> "One pick a beat; hammer everything
else.", "Count six notes to every click.", "Change strings with a hammer, not a pick.", "Look ahead
during each long note."
