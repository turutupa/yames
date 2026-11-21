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
- [x] Translations: four sonnet helpers (de fr es it · nl pl pt-BR ru · tr vi ja · ko zh-CN zh-TW), 299
  sentences each, every file checked again by me with `check_i18n.py` (problems 0 in all fourteen),
  merged: every overlay 1387 of 1387 (`/tmp/coach-cues6/merge.log`); `check classic-rock` 0 errors
  (`gc8.log`).
- [x] Gates (below).

## Gates (logs in `/tmp/coach-cues6/`, all through the job queue)

- `npm run paths -- check` (every pack): 16 Paths ok, 0 errors (`check-all.log`; first-chords reports 14
  cues a variant cannot say, not this leg's Path).
- `npx tsc --noEmit`: clean (`tsc.log`).
- `npm run build`: ok (`build.log`).
- `npm run test`: 412 of 415 files, 32,056 of 32,059 tests passed (`vitest.log`) on a machine at its job
  limit. The three: the known worktree-only `TabStage.render.test.tsx`, and two 20-second timeouts in
  `generate.test.ts` (legato, subdivisions) and one in `packs.test.ts`, with "Timeout calling
  onTaskUpdate". Re-run of those files and `noteStrings.test.ts` (which lints every English cue): 3 of 3
  files, 19,341 tests passed (`vitest-2.log`).
- No Rust file changed; no layout run (the orchestrator's).

## The numbers

579 cues written on 72 Exercises (all covered: 61 graded, 7 self-checked and 1 practice-only with the
general cue only, 3 warm-ups): 72 general and 507 trigger cues; the generated pack holds 604 cue entries
(variant copies included). 299 distinct sentences. By trigger in the pack: general 75, heard 67, late
67, early 67, stringChange 67, lastBars 66, extras 64, afterHeld 53, notes 50, shift 16, openString 12.
Final `check`: 0 errors, 0 `cue.refused`, 0 cues said in other words for a variant (the Path's 58
`variant.rewritten` lines are all purpose and how-to sentences, none mine; read, they read true).
Exercises that move key or position (root-riff, page-descent, major-box, pulloff-loop, arpeggios,
to-the-root, sixes-in-e, sixes-turn, run-up, the three warm-ups) name no fret, string or note.

## Refusals and rewordings

Level 1: none. Level 2: `cue.specific` refused bare fret numbers ("at 12", "flat at 14") on the double
stops in E ("a number it cannot place") -> "fret 12", "fret 14"; and the A, D, E triads' shift "Move two
frets up for E, back down for A." / "for the E chord, back for the A chord" ("a letter that could be a
note, a string or a key") -> "Move the barre up two frets, then back.". Level 3: "Answer with first
finger on fret 4." (the answer plays no fret 4) -> "Answer brighter: the same shape, major notes.";
"Play A, G, E, D twice, then hold the E." (letters it could not place) -> "Play the four-note group
twice, then hold."; "Count the E's beat" ("an E string it cannot tell apart") -> "the last note's beat";
"Climb A, C, D, E, G, A" ("an open string the Exercise does not play") -> "Climb the opening phrase up
to the high A."; one cue of 49 characters shortened. After the proof-read, "Use finger one on 14, three
on 16, four on 17." was refused (unplaced numbers) -> "Put finger one on fret 14 for the whole lick.".

## Longest cue per language, and what wants a native read

en 48 · de 48 · es 48 · fr 48 · it 48 · nl 48 · pl 48 · pt-BR 48 · ru 48 · tr 47 · vi 47 · ja 36 · ko 34 ·
zh-CN 33 · zh-TW 33. Read first: "hi-hat" (de Hi-Hat from its overlay; fr "charleston"; es, it chosen by
the translator); "call" in call and response, which no overlay had (ru "зов", tr "çağrı", ko 콜, zh-CN
呼唤, zh-TW 呼叫); "hammer-on" kept in English in tr and vi; it "movimento" for beat; pl "uderzenie" /
"na raz"; the spoken counts ('1-trip-let': nl '1-tri-o-le', pl '1-try-o-la', pt-BR '1-ter-ci-na', ru
'1-три-оль'; 'one-two-...-six' in tr, ja, vi); ko / zh write "finger one" as the index finger. Several
cues in de, es, it, nl, ru were cut to fit 48 characters and drop a detail (de to-the-root's root cue
no longer names beat three; es open-e's openString lost "not all"; es / it three-over-four's late cue
lost "first").

## Twelve cues to read

- **"A root line under power chords"** (Level 1, a new key each Take). A single-note riff on the low
  strings walking the roots under a band. general "Lock every eighth to the drummer's hi-hat." · late
  "Lock each eighth to the hi-hat, not behind it." · heard "Pick both muted notes that start each bar."
- **"A twelve-bar chorus in E"** (Level 2). The three double-stop figures in the order of a twelve-bar
  chorus. general "Say the next chord's name before it comes." · shift "Move up two frets for the B
  bar, then back." · lastBars "Hold the last G sharp and B for two beats."
- **"Hammer to the third, open A"** (Level 2). Inside the open A chord, the open B hammered to C#.
  general "Hold the A chord; move only the third finger." · openString "Lift the third finger just for
  the open B." · heard "Hammer hard enough to hear the hammered note."
- **"The melody with bends"** (Level 3). A slow melody with whole-step bends from A to B, timed, never
  pitch-checked. general "Hear the target B before you bend." · late "Pick each bend right on its
  beat." · lastBars "Hold the last bend up for its two beats."

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
