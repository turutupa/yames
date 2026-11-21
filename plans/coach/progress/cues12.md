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
- [x] Translations: four sonnet helpers (de fr es it · nl pl pt-BR ru · tr vi ja · ko zh-CN zh-TW), 120
  sentences each, every file checked again by me with `check_i18n.py` (problems 0 in all fourteen), merged:
  every overlay 947 of 947 (`/tmp/coach-cues12/merge.log`; the "different numbers" warnings on cue keys are
  ja/ko/pt-BR/vi writing spelled numbers or finger names as digits, which the brief allows). `check
  tapping` after the merge: 0 errors (`gc11.log`).
- [x] Gates (logs in `/tmp/coach-cues12/`, all through the job queue):
  - `npm run paths -- check` (every pack): 16 Paths ok, 0 errors (`check-all.log`).
  - `npx tsc --noEmit`: clean (`tsc.log`).
  - `npm run test`: 413 of 415 files, 30,958 of 30,959 tests passed (`vitest.log`). The two files: the
    known worktree-only `TabStage.render.test.tsx`, and `generate.test.ts`'s "mostly names a grid" test,
    which timed out at 20 s on a busy queue; re-run alone it passed, 96 of 96 in 9.7 s (`vt-generate.log`).
  - `npm run build`: ok (job `coach-cues12-build`).
  - No Rust file changed; no layout run (the orchestrator's).

## The numbers

301 cues on 52 Exercises (all covered: 49 graded in 15 Steps, 3 warm-ups), 120 distinct sentences. By
trigger: general 52, heard 52, late 52, early 52, extras 48, lastBars 33, stringChange 11, afterHeld 1 (no
Exercise can produce `shift`, `openString` or `notes`). Final `check`: 0 errors, 0 `cue.refused`, 0 cues said
in other words for a variant (the Path's 55 `variant.rewritten` lines are all purposes and how-tos, none
mine).

How the cues teach tapping: the tap is the count ("Put each tap right on the click", "Put each beat's first
tap on the click" in sextuplets, "Put both taps of each beat on the count" for the double tap); the move is
named by the note it happens during ("Move the tap during the last hammer-on.", "Fret the new note before
the tap pulls off.", "Move the whole hand as the tap lands."); `heard` cues are about making the note exist
(the flick of the pull-off, the hammer-on landing, the fretting hand ready), never about force having been
heard; `extras` cues keep the tap on its string and name no muting.

## Longest cue per language, and what wants a native read

en 48 · de 48 · es 48 · fr 48 · it 48 · nl 48 · ru 48 · tr 48 · pl 47 · pt-BR 45 · vi 44 · ko 35 · ja 27 ·
zh-CN 27 · zh-TW 27. Read first: the spoken syllables ('1-trip-let' kept in de fr es it; ja '1-トリ-プル';
the 'and' as und / et / y / e / en / i / и / &), tr "klikı" (the helper's note: an accusative it was not
sure of), and the finger names where the overlay had none (pl, ru, nl third finger, "top string").

## Twelve cues to read

- **"Tap, pull, hammer"** (Level 1). The cell: tap 12, pull off to 5, hammer 8, in triplets.
  general "Count '1-trip-let' with the tap on the '1'." · late "Bring the tap down as the hammer-on
  lands." · heard "Land each hammer-on firmly enough to sound."
- **"D to B"** (Level 1). Both hands go down three frets on the B string and back.
  general "Move both hands down three frets each." · late "Move the tap during the last hammer-on." ·
  heard "Fret the new note before the tap pulls off."
- **"Am to Em, one string over"** (Level 2). The cell on the top string, then on the B string, same frets.
  general "Cross both hands during the last hammer-on." · stringChange "Keep both hands at the same frets
  as you cross." · lastBars "Cross back to the top string for Am."
- **"Two taps, the taps move"** (Level 3, a new key each Take). The fretting hand stays; both taps go up two
  frets. general "Keep the fretting hand still; move the taps." · late "Put both taps of each beat on the
  count." · lastBars "Slide the whole tapping hand, thumb and all."

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
