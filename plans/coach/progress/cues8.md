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
- [x] Proof-read (below): three sonnet readers, one per Level, 31 objections, 31 taken (some by a
  wider fix than the one suggested). `check` after the fixes: 0 errors, 0 refused, 0 rewritten
  (`gc9.log`).
- [x] Translations: 171 distinct sentences. Three sonnet helpers (de fr es it · nl pl pt-BR ru · tr vi
  ja); the fourth (ko zh-CN zh-TW) could not be started (the session's concurrent-agent limit), so I
  wrote those three myself from the overlays' terms. Every file checked with `check_i18n.py` (problems
  0 in all fourteen), merged: every overlay 1284 of 1284 (`/tmp/coach-cues8/merge.log`; the warnings
  are all "different numbers", fret numbers as digits where the English spells them). `check triads`
  after the merge: 0 errors (`gc10.log`).
- [x] Gates (below)

## Gates (logs in `/tmp/coach-cues8/`, all through the job queue)

- `npm run paths -- check` (every pack): exit 0, 16 Paths, 0 errors (`check-all.log`).
- `npx tsc --noEmit`: clean (job `coach-cues8-tsc`).
- `npm run build`: ok (job `coach-cues8-build`).
- `npm run test`: 413 of 415 files, 32,110 of 32,111 tests passed (`vitest.log`). The two files: the
  known worktree-only `TabStage.render.test.tsx`, and `generate.test.ts`'s "subdivisions ... mostly"
  test, which timed out at 20 s (31 s) on a machine running six jobs. Re-run alone
  (`vitest-gen.log`): 96 of 96 passed, triads' three tests among them; exit 1 only from "Timeout
  calling onTaskUpdate" under the load, the known vitest noise. The full run also printed three
  unhandled "window is not defined" errors from `useDownbeatPulse.ts` timers after teardown: not this
  leg's (no app code touched).
- No Rust file changed; no layout run (the orchestrator's).

## The numbers

617 cues on 72 Exercises (all covered: 65 graded, 3 self-checked with the general cue only, 4
warm-ups), 171 distinct sentences. By trigger: general 72, heard 69, late 69, early 69, lastBars 69,
notes 65, extras 65, stringChange 65, shift 63, afterHeld 10, openString 1. Final `check`: 0 errors, 0
`cue.refused`, 0 cues said in other words for a variant (no `variant.rewritten` line of mine).

## How the cues are built

Most graded Exercises roll a three-note shape low, middle, high, middle in eighths, one chord a bar:
`roll(general, notes, shift, lastBars)` adds the stock `heard` / `extras` / `late` / `early` /
`stringChange` orders. The one-string scale and arpeggio Exercises of Steps 1 and 3 use
`oneString(...)` (quarter notes, first finger). The specific cues: the general names the Exercise's
point (the fret the G, D or A string leads with up the neck, the note that stays across a change, the
form, the numbers); `notes` names the shape most likely wrong by finger and fret, or, where one chord
is played in three places, the chord's letters ("Say D, F, A as you fret each shape."); `lastBars`
names what the last bar is. Key-varied Exercises name only chord numbers, string names and shapes
("Keep the top string's fret for one and four.", "For four, add finger two on the B string."). The
four warm-ups jump an octave where the neck runs out, so their variants are not one transposition:
their cues name no shape, string, fret or direction.

## Longest cue per language, and what wants a native read

en 48 · de 48 · es 48 · fr 48 · it 48 · nl 48 · pl 48 · pt-BR 48 · ru 48 · tr 48 · vi 45 · ko 33 ·
ja 29 · zh-CN 23 · zh-TW 23. Read first: ko, zh-CN and zh-TW (written by me, not by a helper: the
helper could not be started; terms from each overlay: 쉐입 / 指型 / 形狀, 프렛 / 品 / 格, 검지..새끼손가락 /
食指..小指); ja writes chord degrees as digits (1、4、5); tr "tiz C" for "the high C" and "penayı yakın
tut" for the pick, not from its overlay; de names fingers (Zeigefinger .. kleiner Finger); fr and it
shortened "before you leave shape two" to "before shape three" in one cue; it "Tieni il tasto della
acuta" for "the top string's fret". The letter-name cues ("Say C, E, G ...") keep letters in every
language, with Bb / F# as the overlays write them (es "B bemol", "F sostenido").

## Twelve cues to read

- **"One, three and five on one string"** (Level 1). C, E and G picked out along the B string, first
  finger only. general "Say each note's number: one, three or five." · notes "Play the high C at fret
  thirteen." · afterHeld "Count fret eight's two beats, then jump up."
- **"C, G, F, C: five before four"** (Level 1). The three chords around fret 12 in a new order; two
  notes keep their fret across a change. general "Keep the G string at fret twelve from C to G." · notes
  "For F, lay finger one across fret thirteen." · lastBars "Keep the B string at fret thirteen into C."
- **"A line that steps down"** (Level 2). C, G, A minor, F with shapes chosen so the top note falls and
  is held a beat. general "Hold each chord's top note a full beat." · afterHeld "Have the next chord
  ready as the top note rings." · lastBars "Keep finger one on fret eight from A minor to F."
- **"B minor to B diminished"** (Level 3). One note, the top one, makes minor into diminished. general
  "Move only the top note, down to fret one." · notes "For B diminished, put finger one at fret one." ·
  shift "Keep fingers three and four down all four bars."

## The proof-read (three separate sonnet readers: cues, tabs, purposes, how-tos, per-bar triggers, the guide's rules)

Objections in `/tmp/coach-cues8/proof-triads/objections-{a,b,c}.md`: 12 + 11 + 8. Taken (was -> now):

- **The loop cues** (`lastBars` "From fret ten, drop to fret five as it loops." and its kin on every
  up-and-back Exercise): the slip is inside the last bar, the cue spoke of the move after it. Readers
  objected on five; fixed on all fourteen: the last bar of an up-and-back Exercise is the arrival from
  the top shape, so "Come back to the middle shape right on '1'." (shape two in all-three); first-two
  and second-and-third, whose last bar repeats the new shape, "Keep shape two / three down to the last
  note."
- **`notes` true of one shape of three** ("Barre fret ten with finger one for D minor.", "Finger one
  across the D and G strings at five.", "Second finger on the G string, fret fourteen.", and so on: 12
  objected; fixed on all seventeen one-chord-in-three-places Exercises): the chord's letters, "Say D,
  F, A as you fret each shape." (C, E, G · A, C, E · E, G, B · F, A, C · G, B, D · B, D, F).
- **`shift` tied to one move where `shift` fires on most bars** (shape-three-moves, stay-put,
  stay-put-high, five-before-four, twelve-bars, whose "second C" is where `shift` cannot fire;
  c-and-a-minor): -> "Start each change on the last eighth." (shape-three-moves: "Keep the fingers in
  shape as the hand slides.", true of every move there).
- "Keep the hand still until chord five." (four-chords-keys, four-chords-middle-keys, the low-set keys
  Exercise: the hand moves in bar 2) -> "Start each change on the last eighth."; on four-chords.low (no
  numbers in that Exercise) -> "Keep the hand around fret five until G."
- four-chords.mid general "Keep finger one on the top string at fret eight." (G is at seven) -> "Keep
  the top string at fret eight until G."; stay-put notes the same fault -> "Put fingers three and four
  at fret ten for F."
- "For G, lay finger one across fret three." (finger one covers two strings) -> "For G, barre the top
  two strings at fret three."
- three-minors / three-minors-middle lastBars "go straight back to A minor" (the last bar already is A
  minor) -> "From E minor, land A minor right on '1'."
- pick-three notes "Find the high one at fret thirteen." (clashes with the numbers) -> "Play the high C
  at fret thirteen."
- inside-open-c openString named the open G (bar 2 starts on the open top string) -> "Put each open
  string right on its click."
- add-a-seventh notes "Finger one across the G and B strings at five." (bar 4 is F) -> "Keep the G
  string at fret five all four bars."
- a-song.eight-bars notes "For A minor, put finger three at fret ten." (the first A minor is a barre at
  five) -> "For the high A minor, put finger three at ten."

Answered, not changed: the readers' suggested "Say A, C, E as you fret each note" became "each shape"
(the order is per shape). Not objected to but left as is: first-two / second-and-third `notes` name
the new shape (two shapes in the Exercise, and the new one is its point); eight-bars `shift` "From G to
F, move finger one to fret eight." (the one move where nothing stays, howTo 4).

## Refusals and rewordings

Level 1: "Play four at fret six: B flat, not B." (`cue.specific`: B is a note the Exercise does not
play) -> "Play four at fret six: B flat."; one at 49 characters. The beginner warm-up's variants refused
"shape" ("not a uniform transposition"), "next shape" and "crosses strings" ("the strings moved
differently"), "back" and "down" (a direction), "fret every note" (a layout of frets): the warm-up's
cues now name only chords, notes, the count and the pick ("Sound all three notes of every chord.",
"Have the new chord ready before '1'.", "Keep the pick close to the strings.").
