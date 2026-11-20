# Leg cues2: Blues Pentatonics' cues (one thing to try)

Branch `coach-cues2`, worktree `/home/dgx-delgado/yames-coach-cues2`, logs `/tmp/coach-cues2/`.
Cues: `src/paths/specs/blues-pentatonics-cues.ts`, attached with `withCues` in `blues-pentatonics.ts`.

## State

- [x] Step 1: read; 100 Exercises (97 in 24 Steps, 3 warm-ups): 79 graded, 15 self-checked, 3 practice-only
  (those 18 get a general cue only). Dump `/tmp/coach-cues2/blues-pentatonics-dump.txt`.
- [x] A partly cued Path passes `check` (Level 1 only cued: 0 errors, `/tmp/coach-cues2/gc2.log`), so a Path can
  land in two legs.
- [x] Level 1 (beginner: box-one, box-keys, straight-feel, landing, call-response, landing-review, warm-up
  box-around). Refusals on the first check: 5, all `cue.specific` on "the E" (a letter that could be a string):
  e7-arpeggio "then the E" -> "then the root"; c7-third's four cues on E -> "the third", "fret nine", "the last
  note".
- [x] Level 2 (intermediate: blues-scale, twelve-bar, quick-change, bends, open-e-blues, minor-blues,
  minor-blues-in-d, question-answer, warm-up boogie-keys). `check` 0 errors, but `cueTexts` (my
  `/tmp/coach-cues2/refusals-entry.ts`) dropped 21 variant cues silently: "long-short pair" and "cross strings"
  in the warm-up ("pair", "cross" say which string is next), "new root" in boogie-keys (an interval), "three
  frets in a row" (a distance) and "Let the hand move" (the hand's position) where the E variant is not a
  uniform transposition. Reworded (the shuffle's late/early everywhere -> "Put each beat's long note right on
  the beat." / "Wait for the beat before each long note."): 0 refusals.
- [x] Level 3 (advanced: two-boxes, up-the-neck, box-five, three-choruses, three-choruses-in-e,
  major-and-minor, sixths, guide-tones, slow-blues, slow-blues-in-c, warm-up two-boxes-keys). Refusals:
  `cue.specific` x2 "Keep the B string quiet between the two." (sixths: the B string is never played) -> "the
  middle string"; `cueTexts` x2 "Move the hand while the held note rings." (both-tones, E: the hand's position)
  -> "Arrive on the new note as each bar starts."; "Keep pressing through the slide to the new fret." (warm-up,
  E: a layout of frets) -> "Keep pressing all the way through the slide." All 100 Exercises: 763 cues, 312
  distinct sentences, 0 refusals, check 0 errors (`gc6.log`).
- [x] Proof-read (below): two sonnet readers (Levels 1-2 and warm-ups; Level 3), 30 objections, all taken.
  763 cues, 317 distinct sentences, 0 refusals, check 0 errors (`gc7.log`).
- [x] Translations (`73ecbe4b`): five sonnet helpers (de fr es · it nl pl · pt-BR ru tr · vi ja ko · zh-CN
  zh-TW), 317 sentences each, each file checked again by me with `/tmp/coach-cues2/check_i18n.py` (problems 0
  in all fourteen). One fix after: nl nut-chorus general was a question ("Kwijt? ...") -> "Wacht op de grondtoon
  van de bas als je zoekt." Merged (`/tmp/coach-cues2/merge.log`: every overlay 1802 of 1802, 0 errors; the
  warnings are "different numbers" where a translation writes "fret five" as 5, and pre-existing ones).
- [x] Gates (below)

## Gates (on `73ecbe4b`)

- `npm run paths -- check` (every pack): 16 Paths ok, 0 errors (`/tmp/coach-cues2/check-all.log`).
- `npx tsc --noEmit`: clean (`/tmp/coach-cues2/tsc.log`).
- `npm run test`: 401 of 402 files, 21,138 of 21,138 tests passed (`/tmp/coach-cues2/vitest.log`); the one file
  is the known worktree-only `TabStage.render.test.tsx` (Vite refuses a file reached through the `node_modules`
  link).
- `npm run build`: ok (`/tmp/coach-cues2/build.log`).
- No Rust file changed, so no `test:paths:rust`; no layout run (the orchestrator's).

## The numbers

763 cues on 100 Exercises (97 in 24 Steps, 3 warm-ups; 18 self-checked or practice-only with the general cue
only), 317 distinct sentences, 0 refusals. By trigger: general 100, heard 82, late 82, early 82, stringChange
81, lastBars 81, extras 79, notes 70, afterHeld 65, shift 35, openString 6. `openString` only where every Take
has an open string (the E-at-the-nut Exercises); none on the key-varied Exercises and warm-ups where only the E
key has one. The bend Exercises with no pitch check (bends-on-time, bends-over-changes, chorus-peak,
e-chorus-climb, c-long-bends, the sixths, nut-turnarounds) have no `notes` cue: the app cannot produce it there,
and their general cues teach the bend's target as plain teaching ("Bend fret eight until it sounds like fret
nine.").

Longest cue per language (characters; the limit is 48): en 48 · de 48 · es 48 · fr 48 · it 48 · nl 48 · pl 48 ·
pt-BR 48 · ru 48 · tr 48 · vi 47 · ja 30 · ko 31 · zh-CN 26 · zh-TW 28.

Want a native read: the helpers chose their own word where the overlay had none for "guide tone" (pt-BR
"nota-guia", ru "направляющий тон", vi "nốt dẫn", ja "ガイドトーン", ko "가이드 톤"; tr and zh keep it as
the overlay does), ja "ブルーノート" for blue note, ru "зов" for the call. it mixes "movimento" and "tempi"
for beat, and writes "root" in a few cues; pl writes "palcem 1" in two; nl is elliptical in a few. zh-TW keeps
"Turnaround", "riff", "Shuffle" in English as its overlay does.

## Twelve cues to read

- **"Find the three A's"** (Level 1, box-one). One riff from each A of box 1 in turn, low, middle, high, over
  the shuffle. general "Start each riff on its A without looking." · late "Put each bar's first note right on
  the beat." · afterHeld "Count the held A's two beats, then the low A."
- **"The A7 arpeggio, and a lick to C#"** (Level 1, landing). A7 up from the low root, then a lick down the box
  that moves C to C#. general "Move from C up to C# and hold it." · shift "Move up a fret after the C# on the G
  string." · lastBars "Walk down G, E, D, C, then settle on C#."
- **"Bends that land on the chord"** (Level 2, bends). A half-note bend on each change, onto a tone of that
  chord, then a fill. general "Hear each bend's target before you pick it." · late "Pick each bend right on
  '1'." · afterHeld "Count the bend's two beats, then the fill."
- **"Chorus 3 in E: the climb, and the top"** (Level 3, three-choruses-in-e). From the nut up the top string to
  the twelfth fret, two bends, ending high. general "Bend the A at fret fourteen up to B." · shift "Lead each
  move up the neck with finger one." · extras "Leave the beat after the first bend silent."

## The proof-read (two separate sonnet readers: cues, tabs, purposes, how-tos, the guide's rules only)

30 objections (`/tmp/coach-cues2/proof-blues-pentatonics/objections-a.md`, `objections-b.md`), all taken
(was -> now):
three-as, riffs-in-c general "Start each bar on its A/C" and late "each bar's first A/C" (bar 4 starts on E/G)
-> "Start each riff on its A/C without looking." / "Put each bar's first note right on the beat." ·
chorus-in-keys general named the low E string on a moving-key Exercise -> "Find the key's root before you
start." · landing-chorus general "Hold each third its full two beats." (bar 11's C# is short) -> "Land each
phrase on its third and let it ring." · the-turn general "Hold each chord's own note" (the last G# is a
quarter) -> "Land on ..." · nine `lastBars` cues that repeated the `afterHeld` hold (first-lick, lick-in-e,
blue-third, passing, bend-and-release, the five arpeggio licks) -> "Keep the long-short swing / the shuffle /
the eighths even right to the last ...", and for the arpeggio licks "Walk down G, E, D, C, then settle on C#."
and its moves (c7: "... to the third.") · two-on-two-off: three cues counted the silent bars -> afterHeld
"Count '1, 2, 3, 4' twice, then play.", lastBars "Let the last note go and stay off the strings." ·
four-answers afterHeld repeated late/early -> "Hum the call while it plays, then answer." · two-boxes-keys
shift "Let the slide carry the hand." (only bar 1 slides) -> "Move to each new place in one calm motion." ·
"Move the hand while the held note rings." (shift, eight Exercises: a held fretted note cannot be left while
it rings) -> "Arrive at the new fret right on its beat." · chorus-peak afterHeld "the bend's two beats" (only
bars 5 and 7 bend) -> the stock held-note count · e-chorus-climb extras "Rest one beat after each bend" (the
second bend has no rest) -> "Leave the beat after the first bend silent." · chorus-low, e-chorus-low,
play-less extras "Play nothing in the empty bars." (repeated the general) -> "Rest both hands in the empty
bars." · a7-sixths, sixths-twelve stringChange "Keep the pick close as you cross strings." (the sixths never
cross) -> "Keep both fingers on their strings as you move." / "Let the third finger take the top string on D7."

Answered, not changed: none. A tab point outside the cues, for the Path's owner: quick-chorus bar 2 reads
D, C, A, A, F# (`4:7` twice); the reader thinks a G (`4:5`) was meant. Not mine to change.
