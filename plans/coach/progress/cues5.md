# Leg cues5: Scales and Modes' cues (one thing to try)

Branch `coach-cues5`, worktree `/home/dgx-delgado/yames-coach-cues5`, logs `/tmp/coach-cues5/`.
Cues: `src/paths/specs/scales-and-modes-cues.ts`, attached with `withCues` in `scales-and-modes.ts`.

## State

- [x] Step 1: read; 72 Exercises (66 graded and 3 self-checked in 19 Steps, 3 warm-ups). Dump
  `/tmp/coach-cues5/scales-and-modes-dump.txt`.
- [x] Level 1 (Beginner: major-scale, movable-major, what-a-key-is, keys-by-hand, relative-minor,
  minor-second-key, warm-up scale-walk), 23 Exercises.
- [x] Level 2 (Intermediate: chords-from-the-scale, harmonic-minor, harmonic-minor-again, sequences,
  more-neck, second-shape, warm-up shape-of-the-day), 24 Exercises.
- [x] Level 3 (Advanced: dorian, mixolydian, box-plus-two, modes-second-key, same-notes-new-home,
  choosing, choosing-again, warm-up mode-of-the-day), 25 Exercises (3 self-checked: general cue only).
  `check`: 0 errors, 0 `cue.refused`, 0 cues rewritten for a variant (`/tmp/coach-cues5/gc5.log`).
- [x] Proof-read (below); `check` after the fixes: 0 errors, 0 refused, 0 rewritten (`gc7.log`).
- [x] Translations: four sonnet helpers (de fr es it · nl pl pt-BR ru · tr vi ja · ko zh-CN zh-TW), 235
  sentences each, every file checked again by me with `check_i18n.py` (problems 0 in all fourteen), merged:
  every overlay 1432 of 1432 (`/tmp/coach-cues5/merge.log`; the "different numbers" warnings are fret
  numbers written as digits where the English spells them, which the brief allows).
- [x] Gates (below).

## Gates (logs in `/tmp/coach-cues5/`)

- `npm run paths -- check` (every pack): 16 Paths ok, 0 errors (`check-all.log`).
- `npx tsc --noEmit`: clean (`tsc.log`).
- `npm run test`: 412 of 413 files, 29,537 of 29,537 tests passed (`vitest.log`); the one file is the known
  worktree-only `TabStage.render.test.tsx`.
- `npm run build`: ok (`build.log`).
- No Rust file changed; no layout run (the orchestrator's).

## For the generator's owner (not changed, not mine)

`check` refuses a step word ("for each step") on the formula's and the beginner warm-up's string
variants as "an interval, and the move is not a uniform transposition", although the whole/half pattern
is the same on every string; and "Come down as evenly as you went up" on the intermediate warm-up's
minor variants ("the line's contour differs"), although every shape goes up and back. Both worked round
in the wording.

## The numbers

637 cues on 72 Exercises (all covered: 66 graded, 3 self-checked with the general cue only, 3 warm-ups),
235 distinct sentences. By trigger: general 72, heard 69, late 69, early 69, lastBars 69, stringChange 67,
notes 66, extras 66, afterHeld 63, shift 24, openString 3. Final `check`: 0 errors, 0 `cue.refused`, 0 cues
said in other words for a variant (the Path's 78 `variant.rewritten` lines are all how-to and purpose
sentences, none mine; read on the first run, they read true).

## Longest cue per language, and what wants a native read

en 48 · de 48 · es 48 · fr 48 · it 48 · nl 48 · pl 48 · pt-BR 48 · ru 48 · tr 48 · vi 47 · ko 34 · ja 26 ·
zh-CN 24 · zh-TW 24. Read first: the spoken syllables, which no overlay had and the translators made up
('one-trip-let': pl 'tri-o-la', ru 'три-о-ла', pt-BR '1-tri-o-lá', tr 'bir-üç-lü', vi 'một-ba-nốt', ja
「ワン・トリ・プレット」, ko 트리-플렛, zh 三-连-音; 'skip one', 'one-three, two-four', 'whole' / 'half');
ja "1の指" for finger one (its overlay has no finger numbers); ko written in 해요체 where its overlay is
formal; "click" in tr ("tık") and vi ("click"); fr and de shorten "root" in a few cues to fit. Every
language keeps letter note names with # and b as its overlay does (de writes B, not H, as its overlay does).

## Twelve cues to read

- **"G major in open position"** (Level 1). The scale from G with its one sharp, F# at the D string's fret 4.
  general "Say each note's name as you play it: G to G." · notes "Play F sharp at the D string's fret four." ·
  afterHeld "Count the last G's two beats, then go again."
- **"The shape, one octave"** (Level 1, a new key each Take). The movable major shape on the low three
  strings. general "Keep one finger per fret; the hand stays still." · notes "Put finger two on the root
  before you start." · lastBars "Come down as evenly as you went up."
- **"Eight bars over one, four and five"** (Level 2, E minor or A minor). The plain seventh over Em and Am,
  the raised one over B7. general "Raise the seventh over the five chord only." · notes "Keep the plain
  seventh over the other chords." · lastBars "Land on the root and hold it two beats."
- **"Minor, then Dorian"** (Level 3). Two phrases, each with F and then with F#. general "Play F in the first
  phrase, F sharp in the next." · notes "Find F sharp at the D string's fret four." · shift "Reach finger one
  back a fret for F sharp."

## The proof-read (three separate sonnet readers, one per Level: cues, tabs, purposes, how-tos, the guide's rules)

29 objections (`/tmp/coach-cues5/proof-scales-and-modes/objections-{a,b,c}.md`), 26 taken, 3 answered.
Taken (was -> now): formula notes "Say 'half' as you play notes four and eight." (false on the way down)
-> "Sing each note before you play it."; formula lastBars duplicated the general -> "Keep the way down as
even as the way up." · in-thirds / sequences thirds stringChange "Let the shape tell you which string is
next." (vague) -> "Know the next string before each pair starts." · tune-two-keys shift "each long note"
(the long F does not move) -> "Move two frets as each half's last note ends." · c-then-f notes "fret
eight in the F bars" (also the A string's F) -> "Keep B flat on the D string's fret eight." ·
three-frets-down lastBars named next lap's notes -> "Say D, C, B, A as you come down." · scale-walk
lastBars duplicated the general -> "Keep the quarters even right to the end." · seven-chords and
seven-chords-from-a afterHeld "Hop the same finger to the next root" (false at two spots) -> "Count the
long note out, then the next root." · harmonic-shape and e-harmonic-shape general "Listen for the raised
seventh" (not an order about the hands) -> "Put finger two on the raised seventh."; their stringChange
(missed the crossings) -> the stock crossing cue · harmonic-lick general "rest on A over Am" (the Am bars
end on E and C) -> "Play G sharp over E7 only." · natural-then-harmonic notes duplicated the general ->
"Move the D string's fret five up to six." · threes-down shift "for each B" (the low B is not a reach)
-> "Reach finger one back a fret on the G string." · two-positions general "finger four to one" (one to
four coming down) -> "Play the shape at two, then the shape at five." · walk-and-shape notes gave three
of seven steps -> "Count frets: two, two, one, two, two, two, one."; shift "as soon as each note sounds"
(cut notes short) -> "Move on as each note ends, not before." (also formula) · tune-both-shapes shift
"each long D" (two do not move) -> "Move the hand as each half's last D ends." · shape-of-the-day
lastBars duplicated the general -> "Keep the eighths even right to the last note." · minor-vs-dorian
lastBars named D (the last note is G) -> "Hold the last G two beats, then start again." ·
mixolydian-shape stringChange missed its place -> the stock crossing cue · box-then-two-notes lastBars
skipped the G -> "Hold the last A for its two beats." · three-homes lastBars "hear it as home"
(listening, and a duplicate) -> "Land the last G on the click and let it ring." · sixth-follows lastBars
put the hand's move at the long F sharp -> "Move back a fret as the last phrase starts."

Answered, not changed:
- *chord-then-walk afterHeld names only the long G*: in this tab `afterHeld` can fire only in bar 1,
  the note after bar 4's long G.
- *three-per-string shift "up a fret on the D string" is false coming down*: `shift` can fire only in
  bar 1 (the way up) for this tab.
- *walk-and-shape notes "the app cannot hear names"*: the reworded cue counts frets, it names nothing.

## Refusals and rewordings

Level 1: `cue.specific` refused two cues that named F natural ("never F") on Exercises that play no F:
reworded to name only the F sharp. `cue.refused` on the formula's and the beginner warm-up's string
variants (the G and D strings are not a uniform transposition of the B string): "one fret each",
"finger", "each new fret", "the hand", "'whole' or 'half' for each step" -> orders that name a note,
not a fret ("See where the next note is before the click.", "Move on as soon as each note sounds.",
"Start one note higher as each bar starts.", "Say 'half' as you play notes four and eight.").

Level 2: the intermediate warm-up's minor-shape variants refused "the same two frets higher", "the
hand", "cross strings" -> "Play it twice: the second time just as even.", "Have the first note ready
as the held one ends.", "Keep the pick close to the strings.". The key-moved Exercises (one shape
moved along the same strings) say degrees, fingers and string names and were refused nothing.

Level 3: one cue over 48 characters ("Find the third three frets above A, four above D." -> "Find each
chord's third from its root."); the Dorian shape in D refused "Reach finger one back" (in D the reach
is not the same) -> "Put finger one on the raised sixth.".
