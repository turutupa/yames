# Leg cues14: Shred's cues (one thing to try)

Branch `coach-cues14`, worktree `/home/dgx-delgado/yames-coach-cues14`, logs `/tmp/coach-cues14/`.
Cues: `src/paths/specs/shred-cues.ts`, attached with `withCues` in `shred.ts`.

## State

- [x] Step 1: read; 56 Exercises (53 graded in 15 Steps, 3 warm-ups), 221 variants. Dump
  `/tmp/coach-cues14/shred-dump.txt`.
- [x] Level 1 (Beginner: one-string, accents, crossing, warm-up one-string-climb), 12 Exercises.
  `check`: 0 errors, 0 `cue.refused`, no cue of mine rewritten for a variant (`gc2.log`).
- [x] Level 2 (Intermediate: chromatic, gilbert, three-per-string, sequences, speed-bursts,
  string-skipping, economy, warm-up scale-round), 27 Exercises. `check`: 0 errors, 0 refused (`gc5.log`).
- [ ] Level 3 (Advanced: legato-one, legato-two, sweep-basics, five-string-sweeps, tapping-etude,
  warm-up loop-round), 17 Exercises.
- [ ] Proof-read. - [ ] Translations. - [ ] Gates.

## Refusals and rewordings

Level 1: the beginner warm-up's string/key variants refused "Move the hand up as each bar starts."
("the hand's position, and the frets moved differently") -> "Start one note higher as each bar starts."

Level 2: `cue.specific` (an error) on the intermediate warm-up: "the second position" (a position the
Exercise does not start in) -> "Keep the second run as even as the first.". Refused on variants: "Reach one
fret less below the top pair." (down-the-box, keys D and E: "a stretch or a reach") -> "Know the next
string pair before it comes."; "Shift during the string change, not after." on the string-set variants of
three-strings and the four sequences (the shift exists only on those variants, and they refuse a sentence
about the hand's position) -> "Have each new string's first note ready."; octaves "Shift during each beat's
last note." -> "Arrive at the next pair as each beat starts."; "Let the first finger rest ..." and "Keep
the same two fingers ..." (D-and-B uses other fingers) -> "Rest a finger lightly on the skipped string." and,
after "Keep the same shape on every pair." was refused too (not a uniform transposition), "Name each
octave's note before you play it."
