# c4c: `cues`, the pack field behind "one thing to try"

Branch `coach-c4c`. Frontend and pack content only; no Rust change (`npm run test:paths:rust` green
untouched: nothing in Rust checks the pack's exercise keys).

## What landed

| Where | What |
|---|---|
| `paths/format.ts` | `CUE_TRIGGERS`, `CueTrigger`, `CUE_MAX_CHARS = 48`, `Cue = { when, say, more?, general? }`, `Exercise.cues?`, `ExerciseVariant.cues?` (whole replacement, like `howTo`). |
| `paths/spec.ts` | `ExerciseSpec.cues?`; `CueBook` and `withCues(spec, book)`: cues in their own file per Path, keyed by pack id; an unknown id throws. |
| `paths/cues.ts` (new) | `metricTrigger`, `placeTriggers` (what pattern bars hold: after a held note, open string, shift via `fingerPlan`, string change, last bar), `possibleTriggers`, `cueWordIssues` (length, order, grade, praise, honesty list, "the bar", tuning). Shared by the validator and the coach. |
| `paths/variantText.ts` | `cueTexts(exercise, variant, says)`: each cue said again for a variant by the how-to's rules; a cue naming nothing is the same everywhere; one naming something is refused where the notes do not line up. With the Exercise as its own variant: what `cue.specific` reads. `rewriteSentence` now also returns `specific`. |
| `paths/generate.ts` | Cues through the pack, one key order; `more` follows its how-to line (into the filtered how-to, a variant's rewritten one via `howToFrom`, or dropped); a variant writes `cues` only where they differ by value; cue rows printed on one line. |
| `paths/validate.ts` | Eleven rules, each with its broken fixture: `cue.shape`, `.length`, `.order`, `.honesty`, `.passMark`, `.tuning`, `.more`, `.trigger`, `.general`, `.specific`, `.firstVariant`. Cues also go through the TODO / jargon lints. |
| `paths/strings.ts`, `scripts/paths.mjs` | `exercise.<id>.cue.<n>` (and `...variant.<vid>.cue.<n>`); `checkOverlay(...).long`: a cue over 48 characters in any overlay is an ERROR in `check` and in `merge`. |
| `paths/variants.ts` | `exerciseWithVariant` takes a variant's cues. |
| `coach/cues.ts` (new) | `cueFor(exercise, note)`, `measuredTriggers`, `generalCue`, `cueOrder`. Table test `cues.test.ts`. |
| `SessionCoach.tsx` | `useNextCue(session)`: the cue for the next Take of the step on screen, from that step's last Take. Ready note headline (+ "From the Path · Step N"), `takeOrderText(exercise, pick)`, and on the result `NoteCue` "Next time: {cue}" + source, under the finding. |
| `CoachNote.tsx`, `coach.css` | `NoteCue`; `data-cue` on the note; a pointed how-to line (`data-pointed`, ink, no coach colour); on short windows the cue's source sits beside it. |
| `SessionView.tsx`, `RunwayTake.tsx` | The order from the cue; "What should I try?" opens the How at `more` (`data-how-line`). |
| Locales | `session.note.nextTime` in all fifteen. |
| Content | `specs/alternate-picking-cues.ts`: 436 cues (252 different sentences) on all 59 Exercises; English, then ko / zh / ... overlays. |
| Tests | `cues.test.ts`; validate fixtures + "a teacher's cues pass"; `variantText` cue cases; strings cue keys and the per-locale cap; `noteStrings.test.ts` lints every English cue of every pack; `CoachNote.test.tsx`; layout scenes `coach-next`, `coach-next-order(-runway)` (+ phone) in `coach-session.spec.ts` and `smooth.spec.ts`; harness stop `playingAgain`. |

## Decisions and why

- **History is the note's `repeat`.** `cueFor(exercise, note)` has no third argument: `takeNote` already
  counts this Take against the earlier ones at the same spot and tempo; a second count would disagree.
- **Trigger order**: a non-timing deciding check (heard / extras / notes) first, as the finding leads with
  it; then the place (a Take that came apart from a round on is `lastBars` first; an open leaning note is
  `openString` first; then afterHeld, openString, shift, stringChange, lastBars); then the direction; then
  `even`. The first trigger the author wrote a cue for wins.
- **`general: true`** marks the one cue said with nothing measured. It is also an `even` cue.
- **The result shows "Next time" only for a cue the finding chose** (`basis: "measured"`) and only when the
  next Take is this Exercise again (`bigAction` not next / finish). A pass that goes up, or P2's Move on,
  shows none. The ready note and the Take's order show the general cue when nothing was measured.
- **A cue for a trigger only some variants have is not written** (open strings in other keys): the first
  variant (the Exercise's notes) must be able to say every Exercise cue.
- **`lastBars` on a one-bar loop** only for stamina Takes (`evennessHold`).
- **The cue book is a file of its own** so content legs never touch the Exercises.

## What the design got wrong about the code

- `TakeNote` has no "after a held note / open string / shift" facts: they are read here off the
  Exercise's notes for the note's pattern bars (`placeTriggers`).
- The design's ready screen is rarely seen ("Go again" skips it): hence the cue on the result, as briefed.
- `more` cannot simply index "the played variant's howTo": generated variants rewrite and drop lines, and
  the Exercise's own how-to loses its "first version" line. The generator remaps it.

## The proof-read (a separate sonnet reader, cues + tabs + purposes + rules only)

66 objections (`/tmp/coach-c4c/proof/objections.md`). Taken, by Exercise (cue: was -> now):
open-string heard "as firmly as the tune" -> "like the fretted notes"; lastBars "as the tune comes round" ->
"Keep counting '1 and 2 and' to the last note." · four-fingers late/early named fret 5, not always on the
click -> "each beat's note" · a-minor-one-string: "pressed as the hand slides" / "Lift just enough" /
"Slide as soon as" contradicted each other and the tab -> press fully, lift as the new lands, "Move the
hand" · pedal-riff "palm light so the open E still sounds" (implied the app heard muting) -> "Rest the palm
lightly, just by the bridge."; "same weight" -> "same stroke" · d/a/b-string "Dig into" -> "Pick ...
deeper"; a/b-string late/early: the open A / B is not always on the click -> "right where you count it" /
"Wait for its count"; "just above fret 5" -> "Hover ... over fret 5" · string-per-bar "Ease off" (fought
another cue) -> "Lift off cleanly when the new string starts."; "then wait" -> "then play"; early -> "Stay
on the long note until the next beat."; lastBars named the D-string bar · gear-change "Keep the eighths
slow" -> "on the click, no earlier" · four-fingers-16 "lazier" and a duplicate -> reworded · repeated-notes
shift "on the last of the four" contradicted "on the beat" -> "Have the next fret ready before the beat.";
general -> "Count '1 e and a' and change on the 1." · b-string-melody: no two-fret shift in the line ->
"Move the hand with the notes, not after."; general an accent -> a count · mixed-rhythms "swing" (three
Exercises) -> "Keep the hand moving up to the last note."; "silent upstroke clear the string", "wait on the
'and'", "Pass over the string" -> clearer orders · mixed-melody / e-minor early duplicated afterHeld ->
reworded · accents: "loud enough to hear" (implied loudness measured, fought the Exercise) -> "Play every
quiet note, just lighter."; "time still" -> "pulse steady"; three-over-four late duplicated the general and
"accents follow the click" was false -> the beat cue / "Hold the pulse; let the accents fall."; open Es
said three times in accent-tune / melody-on-accents -> one each; "as strong as the first" -> "on the beat"
· inside-shuttle / inside-moving general duplicated stringChange -> reworded · box-up-down notes "Read the
tab" -> "Name the next two notes before you play them." · lick-in-three-keys "fret 12" (the last bar is at
14) -> "up the neck" · fours-up "Say" -> "Count" · six-note-up "each change" -> "Cross the strings on the
outside each time." · three-strings notes -> "Reach all the way to fret 9 on the D string." · six-strings /
two-octave-run notes and shift duplicated -> "Count three notes on each string." / "Shift as you cross to
the B string." · two-beats, expanding, six-note-burst afterHeld, octaves shift and stringChange, spider
general, scale-in-fours lastBars (the top is mid-tab), three-strings-at-tempo general (fingering quality)
-> reworded · stamina "rung" -> "tempo"; "as small as the first" -> "the stroke as small in the last
seconds"; box-minute "as small at the end" -> "small right to the end" · etude-eighths "fret 4 for the B"
-> "on the G string"; "back to the A" (not there) -> "to the last note"; etude-mixed/-sixteenths "fret 4"
(bar 4 only) -> "ready for the G string"; "Hold the fill back" (implied speeding measured) -> "Land the
fill's first note on its beat."; "twice the band's rate" -> "Play four notes to every click." ·
scale-round "as small as you can" -> "Shift in one quick, calm move."

Answered, not changed:
- *Late and early cues of an Exercise say the same thing two ways*: they are opposite triggers; only one is
  ever shown for a Take, so they are not duplicates for the player.
- *Stock lines in 20 to 25 Exercises* ("Keep the pick close as you cross", "Pick every note right
  through", the beat pair): deliberate, the same order for the same measured thing, translated once; the
  Exercise-specific cues are the general, notes, afterHeld, openString and shift ones.
- *`lastBars` "as X as the first" template*: several replaced with the bar's own content; where an
  Exercise varies key or position the cue must name nothing.
- *tune-with-band "Listen to the snare drum"*: the Exercise's own how-to (the band has drums); listening
  is the count. *"If you get lost, come in at the next bar"*: kept, an order with its condition.
- *lick-round "Look ahead as each new bar starts" is vague*: its variants change shape, so a cue may not
  name a fret (the suggestion was refused by `cue.specific`).

## Numbers

436 cues: general 59, heard 58, late 58, early 58, extras 52, lastBars 39, notes 37, stringChange 31,
openString 15, afterHeld 15, shift 14. All 59 Exercises (56 in Steps, 3 warm-ups) now show an order during
every Take (before: 2 of the Path's 59 had a coach line of 48 characters or less... see c1b1's list: 57 too
long). No variant needed cues of its own after the rewording (0 refusals).

## For the content legs (the other fifteen Paths)

Read `plans/coach/CUES_GUIDE.md`. Copy the shape of `alternate-picking-cues.ts` and the order of work:
write, `gen` + `strings` + `check`, list refusals (`cueTexts`), proof-read with a separate reader,
fix, then translate only the cue keys (each distinct sentence once) and `strings merge`; `check` refuses
any translation over 48 characters. Translation helpers: one per three or four locales did 252 cues in
about five minutes each.
