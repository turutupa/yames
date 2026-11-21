# Leg cues12: Tapping's cues (one thing to try)

Branch `coach-cues12`, worktree `/home/dgx-delgado/yames-coach-cues12`, logs `/tmp/coach-cues12/`.
Cues: `src/paths/specs/tapping-cues.ts`, attached with `withCues` in `tapping.ts`.

## State

- [x] Step 1: read; 52 Exercises (49 graded in 15 Steps, 3 warm-ups). Dump
  `/tmp/coach-cues12/tapping-dump.txt`. Possible triggers: no `shift`, no `openString`, no `notes` anywhere
  (the pass marks are timing, notes heard and extras); `stringChange` on 11, `afterHeld` on one.
- [x] Level 1 (Beginner: first-taps, moving-the-tap, changing-the-chord, cell-in-e-minor, warm-up
  cell-around), 14 Exercises. `check`: 0 errors, 0 refused, 0 cues rewritten (`gc2.log`).
- [x] Level 2 (Intermediate: sixteenths, sixteenths-in-e-minor, two-strings, strings-through-chords,
  warm-up loop-around), 15 Exercises. `check`: 0 errors, 0 refused, 0 cues rewritten (`gc4.log`).
- [x] Level 3 (Advanced: sextuplet-taps, scale-under-the-tap, scale-tap-again, two-taps-and-skips,
  two-taps-through-chords, over-the-band, second-solo, warm-up fast-around), 23 Exercises. `check`: 0
  errors, 0 refused, 0 cues rewritten (`gc7.log`; the 55 `variant.rewritten` lines are purposes and
  how-tos, none mine).
- [x] Proof-read (below); `check` after the fixes: 0 errors, 0 refused, 0 cues rewritten (`gc10.log`).
- [ ] Translations
- [ ] Gates

## The proof-read (three separate sonnet readers, one per Level: cues, tabs, purposes, how-tos, the guide's rules)

25 objections (`/tmp/coach-cues12/proof-tapping/objections-{a,b,c}.md`), 21 taken, 4 answered.
Taken (was -> now): tap-and-pull heard "Pull the tap off sideways, toward the floor." (two directions)
-> "Pull the tap off toward the floor, not up." · "Tap each new fret as firmly as the first." (implied the
force of a tap was heard; five Exercises) -> "Look at each new fret before you tap it." · tap-and-stop
heard "Tap the long note as firmly as the cells." -> "Hold the long tap down for its whole beat.";
afterHeld duplicated the general and the early cue -> "Have the tap just above the string on '4'." ·
d-to-b general "together" contradicted how-to 2 (the two hands move at different notes) -> "Move both
hands down three frets each." · double-tap heard "the higher finger" (ambiguous) -> "Put the lifted
finger back down as you tap." (the reader's "little finger" is refused by the G-string variant) ·
sixteenth-changes general "both hands" (false for Am to F) -> "Move from each chord's last pull-off." ·
loop-em-c-d-b general "in the three notes after it" (no referent) -> "Move the tap while the fretting
hand plays." · double-tap-em-c-d-b general "never wait" (fought the early cue) -> "Keep the taps in
steady eighths throughout." · "Tap each string as firmly as the top one." (force; four Exercises) ->
"Fret the new string before the tap pulls off." · scale-tap-em-to-am lastBars "Cross back to the B
string for Em." (the last bar is the Am bar) -> "Keep the Am figure as even as the Em one." ·
two-taps-em-bm late was about the move, not the time -> "Put both taps of each beat on the count." ·
taps-and-skip-line general (a practice routine) -> "Know each change before it comes." · tap-minute
general two ideas -> "Let both shoulders drop." · em-line general "Move as the tap lands" (what?) ->
"Move the whole hand as the tap lands." · em-line and em-eight-bars heard "both fingers down" (false
for the Em and C bars, which hammer) -> "Land each hammer-on firmly enough to sound." · em-melody
lastBars was about every beat -> "Move the tap early into the last chord." · em-eight-bars general
(vague) -> "Move both hands up as the melody begins."; lastBars "the eighth bar" -> "Keep the last
chord as even as the first."

Answered, not changed:
- *am-f-e lastBars "Slide the fretting hand back up a fret for Am." is about the bar before*: the slide
  lands on the last bar's first notes, where a slip there is measured.
- *em-with-the-band lastBars and skip-em-am lastBars name a distance ("three frets", "two frets") on
  Exercises that change string set / key*: a distance is the same in every variant, and `check` lets
  every variant say both.
- *double-tap-em-c-d-b late "Change the tap's fret between two taps." is not about time*: it is the
  how-to's order for the moment the tap is late (it waits to change fret); kept.
- *the reader's "little finger" for the double tap*: refused by the G-string variant, which hammers with
  the third finger.

## Refusals and rewordings

Level 1: the G-string variants of the Step 1 cells hammer with the third finger, so "the little finger"
was refused three times -> "Land each hammer-on firmly enough to sound.", "Bring the tap down as the
hammer-on lands.", "Flick the last pull-off toward the floor.". `cue.specific` refused "for the E chord"
(a bare E reads as a string) -> "for the last chord".

Level 2: the double tap's G-string variant refused "Put the little finger back down as you tap." -> "Put
the higher finger back down as you tap." (the base tab carries no finger marks; the variant hammers
with the third).

Level 3: `cue.specific` refused "over the B string" on skip-taps (a string the Exercise does not play)
-> "Jump both hands over the middle string at once." (shared with skip-em-am). The B-string variant of
"Six notes from one tap" refused "Have all three fingers down" (the fingers differ) and then "Fret all
three notes" (the frets moved differently) -> "Have the fretting hand ready before you tap."; the
G-string variant of "The cell from the top down" refused "Pull off from the higher fret to the lower."
-> "Flick both pull-offs toward the floor.".
