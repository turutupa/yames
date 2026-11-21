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
- [x] Proof-read (below); `check` after the fixes: 0 errors, 0 refused, 0 cues rewritten (`gc10.log`).
- [ ] Translations
- [ ] Gates

## The proof-read (three separate sonnet readers, one per Level: cues, tabs, purposes, how-tos, the guide's rules)

37 objections (`/tmp/coach-cues7/proof-legato/objections-{a,b,c}.md`), 30 taken, 7 answered.
Taken (was -> now): pull-to-open stringChange "Know the next string" (not an action) -> "Look at the next
string during the open note." · "Pick the top note again" (reads as the top string; five Exercises) ->
"highest note" · pick-then-hammer / pick-then-pull lastBars duplicated the general -> "Count '1 and 2 and'
to the last hammer-on / pull-off." · long-roll early "'1 e and a' through all eight" (counts four) ->
"Count '1 e and a 2 e and a' between picks." · repeating-lick lastBars described bar 2 -> "Keep the same
pick strokes a string lower." · two-shapes-round lastBars "as even as the climb" (a comparison, not an
order) -> "Count '1-trip-let' all the way down." · nowhere-two stringChange "Cross strings with a hammer"
(the return is picked) -> "Hammer up to the new string; pick on return." · nowhere-ascent late "the one
picked note" (bar 1 is all picked) -> the picked-note cue · one-pick-round heard "lower fingers"
(ambiguous) -> "Set the other fingers before the hammer lands."; stringChange "Lead each lower string
with the little finger" (false on the climb) -> "Have the next string's finger ready early." ·
nowhere-box-two heard "with the third, together" (bar 2 only) -> "Have the first finger down before the
hammer." · nowhere-box-down heard only the pull-offs -> "Drop the upper finger hard on each new string."
· six-up, six-down, six-round shift "Move the hand on the picked note" (fought "fingers down before the
pick") -> "Shift during the last note on each string."; six-down stringChange duplicated the general ->
"Set the next string while the last note rings."; six-round stringChange "first finger" (false coming
down) -> "Have the new string fretted before the pick." · position-run heard "Leave each finger down"
(false for pull-offs) and etude heard "the group's last note off" (many groups end on a hammer-on) ->
"Hammer and pull hard enough to hear each note."; position-run shift "between beats, on the picked note"
(two timings) -> "Move the hand on the picked note, not after." · fives lastBars repeated stringChange
and can never show -> "Count five to the click right to the end." · etude general "with the bass and
drums" (false on click Takes) -> "Pick on each beat, then three legato notes."; stringChange "Change only
the string under the pick" -> "Move to the new string only on the pick." · roll-minute lastBars
incomplete comparison -> "Keep the roll as even as in the first seconds." · phrase-climbs notes
(fingering true of bar 1 only) and phrase-home notes ("two steps" vague) -> "Name each long note before
you play it." · phrase-home shift (true of bar 2 only) -> the picked-note shift cue · phrases-joined
afterHeld "Count each long note out" (the join's may end early) -> "Count each long note, then play the
next." · advanced warm-up shift "Look ahead" (the eyes) -> "Be in place for the beat after the long
note."; stringChange "Change strings with a hammer" (each beat is picked) -> "Hammer onto the new string;
pick each beat." (the reader's "Hammer up ..." was refused by the checker: a direction).

Answered, not changed:
- *Strings named on key-changing Exercises* (hammer-tune "the B string", pull-tune "the top two strings",
  shape-two / shape-three "from the D string up", two-shapes-round "for the G string"): the key variants
  move the same shape along the same strings; `check` says each variant can say them, none refused.
- *box-round afterHeld: nothing sounds after the long A*: the Exercise loops, so the next round's first
  note follows it; it is a different order from the lastBars cue (count, then go; against hold it full).

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
