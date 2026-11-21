# Leg cues8: Triads' cues (one thing to try)

Branch `coach-cues8`, worktree `/home/dgx-delgado/yames-coach-cues8`, logs `/tmp/coach-cues8/`.
Cues: `src/paths/specs/triads-cues.ts`, attached with `withCues` in `triads.ts`.

## State

- [x] Step 1: read; 72 Exercises (65 graded and 3 self-checked in 20 Steps, 4 warm-ups). Dump
  `/tmp/coach-cues8/triads-dump.txt`, compact (no variant tables) `/tmp/coach-cues8/compact.txt`.
  Level 1 = Steps 1-6 + one warm-up (22), Level 2 = Steps 7-13 + one warm-up (26, one self-checked),
  Level 3 = Steps 14-20 + two warm-ups (24, two self-checked). Key-varied: the seven `-keys` Exercises
  (one line moved along the same strings) and the four warm-ups (key and shape; bars jump an octave
  where the neck runs out, so the variants are not one transposition).
- [x] Level 1 (Beginner), 22 Exercises. `check` 0 errors, 0 refused, 0 rewritten (`gc4.log`).
- [x] Level 2 (Intermediate), 26 Exercises (your-line self-checked: general only). `check` 0 errors, 0
  refused, 0 rewritten (`gc6.log`). Two at 49 characters, shortened.
- [x] Level 3 (Advanced), 24 Exercises (two self-checked: general only). `check` 0 errors, 0 refused,
  0 rewritten (`gc8.log`). One refusal: "Lay finger one flat for C and for D." (`cue.specific`, "a
  sentence about the other variants": "for D" read as a string) -> "Barre with finger one for the C
  and D chords." All 72: 617 cues.
- [ ] Proof-read
- [ ] Translations
- [ ] Gates

## Refusals and rewordings

Level 1: "Play four at fret six: B flat, not B." (`cue.specific`: B is a note the Exercise does not
play) -> "Play four at fret six: B flat."; one at 49 characters. The beginner warm-up's variants refused
"shape" ("not a uniform transposition"), "next shape" and "crosses strings" ("the strings moved
differently"), "back" and "down" (a direction), "fret every note" (a layout of frets): the warm-up's
cues now name only chords, notes, the count and the pick ("Sound all three notes of every chord.",
"Have the new chord ready before '1'.", "Keep the pick close to the strings.").
