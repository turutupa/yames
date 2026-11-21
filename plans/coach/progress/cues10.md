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
- [x] Proof-read: three sonnet readers, one per Level (`/tmp/coach-cues10/proof-metal-rhythm/`), below.
  `check` after the fixes: 0 errors, 0 refused, 0 cues rewritten (`gc9.log`).
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

## The proof-read (three sonnet readers, one per Level: cues, tabs, purposes, how-tos, the guide's rules)

17 objections (`objections-{a,b,c}.md`), 14 taken, 3 answered.
Taken (was -> now): accent-open openString "as even as the accents" (fought the accents) -> "Keep the quiet
open Es even with each other." · gallop-bar-changes shift duplicated the general -> "Lift the hand off as the
last eighth starts." · band-changes early "Wait for the kick" (the held C lands on 4, before the kick on
4-and) -> "Wait for the beat before each chord." · chug-rest heard "both chugs" (bar 1 ends on three) ->
"Pick every chug of every group." · pedal-both general "each finger flat" (bar 2 has no pairs) -> "Lay one
finger flat over each climbing pair." · tremolo notes gave bar 1's fingering only -> "Fingers one, three,
four first: frets 7, 9, 10." · pedal-a-to-e stringChange "on bar three" -> "Drop the pedal to the low E at
the change." · two-parts-joined lastBars repeated the general -> "Land the last gallop's long note on beat
four." · verse-riff late / early "beat three" (bar 4's run starts on 2) -> "Put each answer note right on
its count." / "Wait for the count before each answer note." · verse-into-chorus and song-form stringChange
named the chorus chords only (the verse bars cross strings too) -> "Cross to the A string right on its
count." · song-form openString spoke of the chorus (the open string is in the verse gallops) -> "Keep the
open E even under every gallop."; shift "Drop from fret 5 to 2" (one change of three) -> "Cut the last
eighth short and move on it."

Answered, not changed:
- *stop-riff shift "during the rest before it" misses bar 1's A*: `shift` can fire only in bar 2 for this
  tab (`placeTriggers`), where the A follows the rest on 3. Same for chord-stops.
- *root-chug shift "five frets as each bar starts" is false for bar 1*: going round, bar 4 to bar 1 is the
  same five-fret move; the distance is the same in every key and string. The suggestion said "the bar line".
- *verse-into-chorus shift misses the verse*: `shift` fires only in bars 6 and 8 (chorus) for this tab.
