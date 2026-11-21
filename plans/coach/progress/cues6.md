# Leg cues6: Classic Rock's cues (one thing to try)

Branch `coach-cues6`, worktree `/home/dgx-delgado/yames-coach-cues6`, logs `/tmp/coach-cues6/`.
Cues: `src/paths/specs/classic-rock-cues.ts`, attached with `withCues` in `classic-rock.ts`.

## State

- [x] Step 1: read; 72 Exercises (61 graded, 7 self-checked, 1 practice-only in 19 Steps; 3 warm-ups).
  Dump `/tmp/coach-cues6/classic-rock-dump.txt`.
- [x] Level 1 (Beginner: riffs, riffs-in-e, box-extension, box-at-twelve, major-pentatonic, warm-up
  riff-around), 17 Exercises. `check`: 0 errors, 0 `cue.refused`, no cue of mine rewritten (`gc1.log`).
- [x] Level 2 (Intermediate: box-two, repeating-licks, double-stops, double-stops-in-e, embellishment,
  embellishment-in-a, chord-tones, chord-tones-ade, warm-up loop-around), 31 Exercises. `check`: 0
  errors, 0 refused (`gc3.log`). Six `cue.specific` refusals on the first run, reworded (below).
- [x] Level 3 (Advanced: melody, call-response, sixes-at-twelve, climax, solo-in-e, solo-etude, warm-up
  run-around), 24 Exercises. `check`: 0 errors, 0 refused (`gc5.log`). 604 cues in all.
- [x] Proof-read (below); `check` after the fixes: 0 errors, 0 refused (`gc7.log`).
- [ ] Translations; gates.

## The proof-read (three separate sonnet readers, one per Level: cues, tabs, purposes, how-tos, the guide's rules)

56 objections (`/tmp/coach-cues6/proof-classic-rock/objections-{a,b,c}.md`), 51 taken, 5 answered.
Taken (was -> now): root-riff notes, two ideas -> "Keep the hand still: one finger per fret." ·
root-riff and e-root-riff afterHeld "Give each quarter note its full beat." (bar 1 can fire, no quarter
there) -> "Count each long note out, then go on."; e-root-riff stringChange "Cross to the A string" (also
crosses back) -> "Cross strings with no gap in the eighths." · fourths-riff and e-fourths-riff
stringChange ("fingers flat" against how-to 2; a duplicate of a general) -> "Keep the pick moving through
both strings."; e-fourths shift "up for frets 10 and 9" (bar 2 goes down) -> "Move the whole hand
together between shapes." · page-descent general (two ideas) -> "Count '1 e and a' on every group." ·
extension-lick, twelve-extension, minor-vs-major shift (two ideas / false in one bar / a duplicate) ->
"Move the whole hand in one go, on the beat." · major-box and box-two-shape heard "top string to
bottom" (it climbs first) -> "Pick every note, up the box and back down."; their stringChange "every
two notes" (three on the top string) -> the eighths crossing cue · southern-lick general not an order ->
"Put finger one on fret 14 for the whole lick."; heard "high to low" -> "none skipped"; lastBars
duplicated afterHeld -> "Land the last A right on beat three." · minor-vs-major notes "in the major
bars" (C sharp is bar 4 only) -> "in the last bar." · box-two-shape / ade-roots / stops-on-a generals
reworded as orders · two-boxes-line notes duplicated the general -> "Play frets 8 and 10 on both top
strings." · open-string-repeat stringChange duplicated extras -> "Cross to the open string and back
evenly."; afterHeld "the last E's" (ambiguous with the open E) -> "the last note's" · stops-and-run
general "short" (bar 2's stop is held) -> "Hit both strings of each stop together."; stringChange true at
one seam -> "Cross strings with no gap between notes." · thirds-over-changes general "each stop on the
beat" (the middle one is on the 'and') -> "Play three stops, count the rest, then the run." ·
stops-on-e and stops-chorus stringChange (bar-specific) -> "Switch string pairs with no gap between
stops."; stops-chorus general not physical -> "Say the next chord's name before it comes." ·
embellishment heard "Hammer hard enough to hear the third" (open-e bar 2 hammers onto the root) -> "...
the hammered note."; a-and-d-part heard (bars 3 and 4 have no hammer) and fourth-and-back heard (the
bass note is single) -> "Play the bass note, then every pair after it."; hammered-thirds heard "both
fingers" (one flat finger) -> "Hammer one flat finger onto both strings." · open-e / e-to-a openString
"Keep the chord held" (the open G needs a finger lifted) -> "Lift one finger for the open string, not
all."; e-to-a shift duplicated the general -> "Move the whole E shape up to fret 5." · fourth-and-back
stringChange "Slide ... to D" (the how-to keeps it on the string) -> "Keep the third finger on the B
string for D."; a-and-d-part afterHeld false in bar 1 -> "Count the held note out, then play on." ·
to-the-root / ade-roots notes "Sing the root" (no gap to sing in) -> "Aim the last eighth at the root on
beat three." · bent-melody heard unfinished comparison -> "Pick the note after each bend, every time.";
stringChange false in bar 2 -> "Have the next string's finger ready early." · answer-the-lick general
duplicated extras/late -> "Let the call finish, then answer on '1'."; both answers' lastBars "then
listen" -> "Hold the last A for its two beats." · sixes-turn stringChange (the drops land on other
fingers) -> "Lay finger one on each higher string early." · sixes-phrase afterHeld true in one bar only ->
"Count each long note to its end, then move." · the-peak heard (the lick is two bars of four) and
e-solo-b heard -> "Pick every sixteenth, right up to the top." / "Pick every note, right through to the
last." · e-solo-a / e-solo / etude notes "Say E, G, A..." or "Say each phrase's first note" -> "Set the
hand for each phrase's first note." · e-solo-a / e-solo openString "Get to the nut" (bar 4 goes back
up) -> "Move the hand while the open strings ring." · e-solo-b / e-solo shift "two frets into box 2"
(bar 7 only) -> "Move the whole hand as the new box starts." · e-solo lastBars two ideas -> "Hold the
last E through all four beats." · run-around afterHeld (two ideas, false in bar 1) -> "Count the held
note out before the next group."; lastBars -> "Hold the last note for its two beats."

Answered, not changed:
- *minor-vs-major general "Drop the hand a fret for the major bars" is false (the fret 5 notes stay)*:
  how-to 1 puts the first finger on fret 4 for bars 3 and 4 and bar 4 plays fret 4; the hand does move.
- *"... as firmly as ..." on heard cues implies a soft attack caused the miss* (stops-on-a, stops-on-b,
  stops-and-single, the two thirds lines): the guide's worked example uses the same order for heard
  ("Pick the B string as firmly as the G string."), as plain teaching, not a reason.
- *"Hammer hard enough to hear ..." implies a cause*: the guide names "Hammer hard enough to hear the
  note" as allowed plain teaching; kept, with "the hammered note" so it is true at every hammer.
- *eighths cross cue reused in many Exercises*: deliberate, translated once.
- *e-fourths stringChange "nothing changes string"*: the trigger is possible for the Exercise (the
  generator says so), so it gets a cue; the new one is about the pick on the pair.
