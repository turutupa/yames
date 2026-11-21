# Leg cues10: Metal Rhythm's cues (one thing to try)

Branch `coach-cues10`, worktree `/home/dgx-delgado/yames-coach-cues10`, logs `/tmp/coach-cues10/`.
Cues: `src/paths/specs/metal-rhythm-cues.ts`, attached with `withCues` in `metal-rhythm.ts`.

## State

- [x] Step 1: read; 54 Exercises (49 graded in 15 Steps, 5 warm-ups). Dump
  `/tmp/coach-cues10/metal-rhythm-dump.txt`.
- [x] Level 1 (the-chug, power-chords, chug-and-chord, a-string-chug, warm-up root-chug), 14 Exercises.
- [x] Level 2 (gallop, reverse-gallop, sixteenth-chug, gallop-changes, warm-ups root-gallop and
  root-reverse), 14 Exercises.
- [x] Level 3 (stop-start, triplets-and-bursts, pedal-riffs, pedal-from-a, two-part-riff, riffs-at-length,
  verse-and-chorus, warm-ups root-sixteenths and root-triplets), 25 Exercises (23 in Steps, 2 warm-ups).
  `check`: 0 errors, 0 `cue.refused`, 0 cues rewritten for a variant (`/tmp/coach-cues10/gc7.log`).
- [ ] Proof-read: three sonnet readers, one per Level (`/tmp/coach-cues10/proof-metal-rhythm/`).
- [ ] Translations.
- [ ] Gates.

## How the cues were written

- The honesty rule for this Path: the app hears when and which pitch, not the palm, the pick direction,
  tightness, gain or tone. "Down on every eighth", "Lift the palm for the fretted notes only", "Palm down
  for the chugs, up for the chords" and "Lift the palm and open up for the chorus" appear only as general
  cues, where they are the Exercise's own how-to. No heard / extras / late / early / place cue names the
  palm or the stroke direction. The one-minute downstroke Exercise's `lastBars` is "Make the stroke smaller
  before you slow down" (its how-to), an order, not a cause.
- The place cues carry the count: the gallop "1, and a", the reverse "1 e and", where the stab lands
  ("Put G on '4' and A on its 'and'", "Land each off-beat chord on its 'and'"), the end of a run of
  sixteenths ("Count '1 e and a' right to the last note", "Count the last beat in twos: melody, pedal").
- Eleven Exercises change string between Takes (low E or A): their cues name no string and no note letter;
  frets that stay the same ("Move to frets 3 and 5 for the last two gallops", "Lay the first finger flat
  where fret 7 repeats") are true of both and pass. The five warm-ups change key and string: they name
  nothing but distances ("Move the hand five frets as each bar starts").

## Refusals and rewordings (my own, before the proof-read)

- `cue.specific` refused "the E chord", "the G shape" (after "the", a letter is read as a string too, and
  the two readings differ): reworded to "the first chord", "the long chord", "the open E", "fret 3".
- `cue.specific` refused strings an Exercise does not play: "the A string" in pedal-skip (melody on the D
  string, pedal on the low E), "the D string" in a-pedal-g, "the low E string" in a-pedal-d and
  a-pedal-both -> "the string you skip", "Keep the pick on the strings in use."; "then the D" read as a
  note -> "then the D string".
- Two cues over 48 characters shortened.
