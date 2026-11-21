# Leg cues9: Funk Lines' cues (one thing to try)

Branch `coach-cues9`, worktree `/home/dgx-delgado/yames-coach-cues9`, logs `/tmp/coach-cues9/`.
Cues: `src/paths/specs/funk-lines-cues.ts`, attached with `withCues` in `funk-lines.ts`.

## State

- [x] Step 1: read; 49 Exercises (46 graded in 14 Steps, 3 warm-ups). Dump
  `/tmp/coach-cues9/funk-lines-dump.txt`.
- [x] Level 1 (Beginner: the-engine, holes, holes-mixed, first-lines, lines-second-key, warm-up swing-up),
  18 Exercises (`c81a7248`). `check`: 0 errors, 0 refused (`gc1.log`).
- [x] Level 2 (Intermediate: stabs, line-and-stab, second-pair, octaves, warm-up hole-up), 14 Exercises
  (`44c0c271`). One `cue.specific` ("Keep the E's half as even as the D's.": a letter that could be a
  string) -> "Keep the second half as even as the first." (`gc2.log`, `gc3.log`).
- [x] Level 3 (Advanced: displaced, displaced-shapes, the-sixth, the-pocket, long-form, warm-up threes-up),
  17 Exercises (`ef83291e`). `check`: 0 errors, 0 refused (`gc4.log`).
- [x] Proof-read: three sonnet readers, one per Level (`/tmp/coach-cues9/proof-funk-lines/`); 16
  objections, all taken (`3ddc7b7f`; below). `check`: 0 errors, 0 refused (`gc6.log`). 209 distinct
  sentences to translate.
- [x] Translations (`b737712e`; below).
- [x] Gates (logs in `/tmp/coach-cues9/`, all through the job queue):
  - `npm run paths -- check` (every pack): 16 Paths ok, 0 errors (`check-all.log`).
  - `npx tsc --noEmit`: clean (`tsc.log`).
  - `npm run build`: ok (`build.log`).
  - `npm run test`: 412 of 415 files, 31,101 of 31,103 tests passed (`vitest.log`), under a busy queue.
    The two failures were 20 s timeouts (`generate.test.ts` "subdivisions mostly", `packs.test.ts` "an
    overlay for every Path in every locale"); re-run alone, both files pass, 100 of 100
    (`vitest-2.log`, with the known "Timeout calling onTaskUpdate" under load). The third file is the
    known worktree-only `TabStage.render.test.tsx`.
  - No Rust file changed; no layout run (the orchestrator's).

## The proof-read (three separate sonnet readers, one per Level: cues, tabs, purposes, how-tos, the guide's rules)

16 objections (`/tmp/coach-cues9/proof-funk-lines/objections-{a,b,c}.md`), all taken (was -> now):
two-notes heard "Press fret five fully for each 'a'." (implied a fretting cause) -> "Pick every 'a', the G
at fret five." · both-lines late "Put '1' and '3' right on the click." (bar 3 rests on '3') -> "Put each
line's first note on the click." · the stock crossing cue "Look at the next string during each rest." (vague,
and false where a line crosses with no rest: both-lines, d-both-lines, figures-line; used in eight
Exercises) -> "Keep the pick close as you cross strings." · call-and-stab general "..., then stab on the
'and'." (the 'and' of '1' is the low C) -> "Count '1 (e) and a', stab on the 'and' of '2'." · bm-stabs
stringChange "Play both roots with the first finger." (fingering, not the crossing) -> "Jump from the root
to the stab in one move." (also stab-backbeat's) · octave-eighths early "Wait out '2' and '3' in full."
(each rest is an eighth) -> "Wait out the rests on '2' and '3'." · octave-line general "Move the shape in
the rests after each 'e'." (nothing moves mid-way through the A) -> "Move to each new shape in the two
rests."; shift "Move two frets in the rest before '1' and '3'." (A to D keeps its frets) -> "Slide two
frets up, then two back, in the rests." (a first rewording naming E and A was refused by `cue.specific`)
· hole-up early, and holes.no-and's, "Play the 'a' late, just before the next beat." (empty, and "late"
reads as an order to drag) -> "Wait out the hole, then play the 'a'." · slide-and-stab heard "as firmly
as the stabs" (loudness) -> "Pick the single notes as well as the stabs." · sixth heard "of the answer"
(a miss can be in either bar) -> "Pick every note of both lines." · hammered late "Put each picked note
right where you count it." (vague) -> "Put '1', '2' and '4' right on the click." (the reader's "'1', '2'
and '3'" is false: '3' is a rest) · two-chord-line lastBars "... and let it ring." (two ideas, length
unheard) -> "Land the held D right on '4'."; the same tail dropped from the three other "Land ... on '4'"
cues · bm-octaves general "Change octave in the two rests after each 'e'." (only at the end of each
chord's bar) -> "Change octave in the rest before each new chord.".

Answered, not changed: none.

## The numbers

344 cues on 49 Exercises (all covered: 46 graded in 14 Steps, 3 warm-ups), 209 distinct sentences. By
trigger: general 49, heard 49, late 49, early 49, extras 43, stringChange 35, lastBars 28, notes 20,
afterHeld 13, shift 9. Final `check`: 0 errors, 0 `cue.refused`, 0 cues said in other words for a variant
(the Path's 9 `variant.rewritten` lines are purpose and how-to sentences of "The second vamp with the band",
none mine; read, they read true). The longest English cue is 48 ("Strike the strings only where a stab is
written."). One refusal on the way (`cue.specific`, twice: a sentence naming E and D, then E and A, on the
octave Exercise with the band, read as strings) -> reworded to name no letter.

## Translations

Four sonnet helpers (de fr es it · nl pl pt-BR ru · tr vi ja · ko zh-CN zh-TW), 209 sentences each, every
file checked again by me with `check_i18n.py` (problems 0 in all fourteen), merged: every overlay 878 of 878
(`/tmp/coach-cues9/merge1.log`, `merge2.log`; the "different numbers" warnings are fret numbers written as
digits where the English spells them, which the brief allows). Three German cues were not imperatives and
were fixed by hand ("Tipp den Schlag mit dem Fuß, betone das „und“.", "Spiel die zweite Hälfte so
gleichmäßig.", "Setz den ersten Ton jeder Figur auf ihre Zahl."). `check funk-lines` after: 0 errors
(`gc7.log`).

Longest cue per language: en 48 · de 48 · es 48 · fr 48 · it 48 · nl 48 · pl 48 · pt-BR 48 · ru 48 · tr 47 ·
vi 48 · ko 42 · ja 41 · zh-CN 38 · zh-TW 38 (the CJK longest is the count '1, and a, 2 e (and) a, (3) e and a').

Want a native read: **it** first (its overlay counts '1 e e a', so the 'e' and the 'and' are both "e"; the
helper wrote "la seconda 'e'" for the 'and' where it fitted and a bare 'e' where it did not: read
holes.no-and and the stabs cues); **pl** ("Zostaw każdą „2” ciszą.", "pryma" for root); **ru** (the hammered
general is compressed); **ja** (plain form and ます/ましょう mixed to fit); **tr** ("klik", "basamak" for
rung); fr ("passage" and "tour" both for a round; "position" for box); es ("la caja" for box, which is also
the snare); zh-CN 把位 / zh-TW 指型 for box; "hi-hat" in pt-BR, 踩镲 / 踩鑔 in zh.

## Twelve cues to read

- **"One, and-a"** (Level 1). A long note and two short ones on every beat, the 'e' left out. general
  "Count '1, and a' and leave each 'e' silent." · extras "Leave the 'e' of every beat silent." · early
  "Wait the full eighth before the 'and'."
- **"A line from the top"** (Level 1). Two bars from the D string's fret 7 down to a held low A, mostly one
  note at a time. general "Count '1, and a', then play the 'e' of '2'." · stringChange "Move to the A
  string in the rests of '2'." · afterHeld "Count the low A's beat, then start again."
- **"The vamp with the band"** (Level 2). Line and stabs on Am7, then the same shape on D9 with F#.
  general "Put your stabs just after the snare." · shift "Reach back to fret four for the F sharp." ·
  early "Let the snare sound before each stab."
- **"Starting on the 'e'"** (Level 3). A low A on '1', then pairs on the 'e' and the 'a' answered on the
  next beat and its 'and'. general "Count '1 e (and) a, 2 (e) and (a)' aloud." · extras "Leave '3' itself
  silent." · late "Put '1', '2' and '4' right on the click."

## How these cues are written

Funk is the count. Most cues say where a note sits in '1 e and a', which sixteenth stays silent, or what
to wait out, with digits only inside quoted counts. The `extras` cues are the one place a stray note is
named, always as an order ("Leave the 'e' of every beat silent."). The app hears neither ghosted strokes
nor the swing of the hand nor how short a note was; "keep the pick swinging" and "keep every stab the same
length" appear only as teaching (a general cue, or a `late` cue as an order), never as a reason. The
key-moving Exercises (the three warm-ups, "The second vamp with the band", "Eight bars with the band")
name no fret, string, note or chord.
