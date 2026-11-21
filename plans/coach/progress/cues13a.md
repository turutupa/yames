# Leg cues13a: Sweep Picking's cues, first half (one thing to try)

Branch `coach-cues13a`, worktree `/home/dgx-delgado/yames-coach-cues13a`, logs `/tmp/coach-cues13a/`.
Cues: `src/paths/specs/sweep-picking-cues.ts` (`SWEEP_PICKING_CUES`), attached with `withCues` in
`sweep-picking.ts`. Second half: leg cues13b, after this one is merged.

## The Path's Levels and Steps (72 Exercises in Steps, 3 warm-ups: 75)

| Level | Steps (Exercises) | Warm-up |
|---|---|---|
| Beginner | triads (4), turnaround (3), phrases (4, one self-checked), qualities (3), first-solo (3) = 17 | triads-around |
| Intermediate | four-strings (4), five-strings (4), five-e-shape (5), moving-shapes (4), the-link (3), link-chains (3), minor-progressions (4), long-chains (3), over-the-progression (4, one self-checked) = 34 | progression-of-the-day |
| Advanced | six-strings (3), six-string-changes (3), fast-shifts (3, one self-checked), neoclassical (5), advanced-etude (4), over-a-heavy-band (3, one self-checked) = 21 | big-round |

Whole Levels give 18 or 53 Exercises, nowhere near 36, so the split is at a Step boundary inside
Intermediate.

**cues13a covered (37):** all of Beginner (17), Intermediate Steps 6 to 9 (`four-strings`,
`five-strings`, `five-e-shape`, `moving-shapes`: 17), and all three warm-ups
(`warmup-beginner.triads-around`, `warmup-intermediate.progression-of-the-day`,
`warmup-advanced.big-round`).

**Left for cues13b (35):** Intermediate Steps 10 to 14 (`the-link` 3, `link-chains` 3,
`minor-progressions` 4, `long-chains` 3, `over-the-progression` 4: 17), and all of Advanced (21 in
Steps, its warm-up is already done). Self-checked among them (general cue only, no triggers):
`over-the-progression.your-chorus`, `fast-shifts.inversion-runs`, `over-a-heavy-band.your-solo`.
Note `long-chains.chain-four` can produce `openString`.

## State

- [x] Step 1: read; dump `/tmp/coach-cues13a/sweep-picking-dump.txt` (75 Exercises, tabs, triggers).
- [x] Step 2: Beginner and Intermediate Steps 6 to 9 and the warm-ups written; `check`: 0 errors,
  0 `cue.refused`, none of my cues rewritten for a variant (`/tmp/coach-cues13a/gc5.log`).
- [x] Step 3: proof-read (below); `check` after the fixes: 0 errors, 0 refused (`gc6.log`).
- [x] Step 4: translations: four sonnet helpers (de fr es it · nl pl pt-BR ru · tr vi ja · ko zh-CN
  zh-TW), 115 sentences each, every file checked again by me (`check_i18n.py`, problems 0 in all
  fourteen), merged: every overlay 1109 of 1109 (`/tmp/coach-cues13a/merge.log`; the "different
  numbers" warnings are beat numbers written as digits, which the brief allows). My fixes before the
  merge: G sharp written "G#" in every language, as all the overlays write it (the helpers had Gis,
  G dièse, G-диез...); pt-BR note and chord names back to letters (A, D menor, F, G) as its overlay
  writes them, string names kept as its overlay's (corda Sol, Ré, Lá, Si).
- [x] Step 5: gates (below).

## Gates (logs in `/tmp/coach-cues13a/`)

- `npm run paths -- check` (every pack): 16 Paths ok, 0 errors; sweep-picking 0 refused
  (`check-all.log`).
- `npx tsc --noEmit`: clean (`tsc.log`, after the merge).
- `npm run test`: 414 of 415 files, 30,759 of 30,759 tests passed (`vitest.log`); the one file is the
  known worktree-only `TabStage.render.test.tsx`.
- `npm run build`: ok (`build.log`).
- No Rust file changed; no layout run (the orchestrator's).

## Longest cue per language, and what wants a native read

en 47 · de 48 · fr 48 · es 48 · it 48 · pl 48 · pt-BR 48 · ru 48 · tr 48 · vi 48 · nl 47 · ko 29 ·
ja 26 · zh-CN 23 · zh-TW 23. Read first: ru's clipped stringChange cues on sweep-then-scale and
lick-to-bend ("Струна B после ... пулл-оффа"); ja in plain imperative where its overlay is です/ます;
ko 태핑 for "tap"; tr "es" for a rest (its overlay has no single word); pl and pt-BR cues trimmed to
fit 48 (blunter); D minor in nl/pl/ru (the overlays have no D minor to copy); "roll" (ロール, lăn,
yuvarla, roll in pl/ru/pt-BR).

## Twelve cues to read

- **"C major, the short reach"** (Beginner, turnaround). The three-string loop with a hammer and pull
  at the top. general "Keep it one loop: never stop at the bottom." · late "Hammer the top note on
  beats two and four." · early "Wait for the top note's beat before the hammer."
- **"Two strings, a run, and a bend"** (Beginner, phrases). A rolled sweep at fret 5 into a lick and a
  bend. general "Roll the index across fret 5, one string each." · heard "Press fret 5 as the pick
  reaches each string." · lastBars "Land the bend's note right on beat one."
- **"A minor with a tap on top"** (Intermediate, five-e-shape). The five-string A-shape with the top A
  tapped. general "Pull off to fret 12 right after the tap." · heard "Tap fret 17 firmly enough to hear
  it." · late "Put the tap right on beat three."
- **"A minor in two places"** (Intermediate, moving-shapes). E-shape at fret 5, A-shape at fret 12, a
  seven-fret shift. general "Use the rest to throw the hand up to fret 12." · heard "Press the first
  note after each jump fully." · shift "Jump back down on the last note."

## The numbers

255 cues on 37 Exercises (36 graded and 1 self-checked with the general cue only, of which 3 warm-ups),
115 distinct sentences. By trigger: general 37, heard 36, late 36, early 36, stringChange 36,
extras 33, shift 19, lastBars 19, afterHeld 3 (no `notes`, no `openString`: none possible here).
Refusals: first `check` 4 `cue.specific` errors and 109 `cue.refused` lines; reworded (below) to 0
and 0. None of my cues is said in other words for a variant (the Path's 34 `variant.rewritten`
lines are purposes and how-tos). Longest English cue 47 characters.

## Refusals and rewordings

`cue.specific`: "each G-string note" (read as the note G) -> "before each fret 14"; "the hammer to
17" (a number it cannot place) -> dropped the number; "Am up on the beat, G down on the next" (chord
symbols not declared) -> "One shape up, the other down, one per beat."; "on the D string, then the
G" -> "Press fret 14 one string at a time.". `cue.refused` on the varied Exercises: "Press each note
down as the pick reaches it." ("down" a direction, "reaches" a layout word) -> "Press each note
fully as the pick gets there." (and "Sound every note of the sweep, one by one." on the warm-ups);
"Move the hand as each bar starts." -> "Be in place before each bar starts."; "Follow the chords by
ear" -> "Keep your place by ear, not by counting."; "Keep the last chord as even as the first." on
big-round -> "Keep the end as even as the start."; triad-rolls' C to C minor pair refused "top three
strings" and "Name the new chord" -> "Keep the pick on the strings in use." and the stock lastBars;
four-chords-rock refused "Have the new shape ready" / "the next fingers" ("next" = which string) and
"Reach for the nearest shape" -> the stock heard cue and "Make each move as small as it can be.".

## The proof-read (two separate sonnet readers: Beginner; Intermediate Steps 6 to 9 and warm-ups)

32 objections (`/tmp/coach-cues13a/proof-sweep-picking/objections-{a,b}.md`), 31 taken, 1 answered.
Taken (was -> now): two-string-push heard "Let the pick rest on the second string first." (ambiguous)
-> "Let each of the two notes sound in turn." · picked-turn stringChange duplicated heard -> "Turn at
each end without a pause." · minor-mid general (two ideas) -> "Use one finger per note, no rolling." ·
minor-high general "or slide" (two options) -> "Reach the little finger to fret 17." ·
sweep-then-scale / lick-to-bend lastBars "Hold ... its full two beats" (length is not measured, and
duplicated afterHeld) -> "Land the last A right on beat one." / "Land the bend's note right on beat
one." · lick-to-bend stringChange "the pull-off" (two in the tab) -> "after the second pull-off" ·
triad-pair late/early "its beat" -> "Pull off to fret 10 on beats two and four." / "Wait for beats two
and four to pull off." · minor-inversions general duplicated shift -> "Know where the next shape sits
before you go."; lastBars "the fret-8 shape ... the first" (ambiguous) -> "Keep the last shape as even
as the first." · major-inversions general "Say E, G, C" (not hands or count; four shapes) -> "Start
each new shape on its lowest note." · dm-inversions heard "At fret 10, press only the string being
picked." (read as ringing strings; fret 10 is also a slide target) -> the stock heard cue ·
band-three general duplicated late -> "Play two loops of each chord with the band."; early "the
band's beat" against "the click" elsewhere -> the stock early cue · minor-cadence shift "a fret or
two" (Dm to E moves three on the B string) -> "Keep each shape close to the last one." · first-etude
general duplicated afterHeld -> "Play two loops of each shape, then the long A." · am-four, g-four,
am-e-shape heard "Press fret N only on the string being picked" duplicated the general's roll -> the
stock heard cue · c-five heard "the D string after the slide" (the note after it is fret 15 on the
A string) -> "Slide all the way to fret 15 and press." · g-five general duplicated early ("the rest")
-> "Turn at the bottom with the pick alone." · em-five shift duplicated the general -> "Land the hand
at fret 12 as the slide ends." · tap-octave general (three actions) -> "Pull off to fret 12 right
after the tap." · a-and-e shift "as each chord starts" contradicted lastBars (move in the rest) ->
"Move the index two frets between the chords." · am-two-shapes shift duplicated the general -> "Jump
back down on the last note."; its lastBars then duplicated that -> "Keep the fret-12 loop as even as
the first." · am-dm shift "Look at the new fret" (no rest, not hands) -> the stock shift cue ·
am-f-c-g lastBars duplicated the general -> "Be back on fret 12 as the loop starts again." ·
turn-in-the-middle general "Sing the top note" (not hands or count) -> "Start each new shape right on
beat one." · the two first warm-ups' lastBars duplicated heard -> "Keep the end as even as the start."

Answered, not changed:
- *big-round heard "Sound every note of the sweep, one by one." overlaps its general "Keep every note
  separate, however easy."*: the general is the warm-up's how-to (tempo), heard is the order at a
  missed note; the reader called it weak, not wrong. Kept.

## For cues13b (read before writing)

- **Reuse the constants** at the top of `sweep-picking-cues.ts`; do not write new ones for the same
  measured thing. late / early: `SWEEP_LATE`, `SWEEP_EARLY`, `NEW_SHAPE_LATE`, `LOOP_A_LATE`
  (five-string loops that start on the A string), `REST_EARLY` (loops ending in a two-note rest),
  `TOP_HAMMER` / `TURN_EARLY` (three- and four-string loops: the top hammer is on beats two and four),
  `TOP_THREE_EARLY`, `TAP_LATE` / `TAP_EARLY` (five-string A-shape: the top note on beat three).
  heard: `EACH_ARRIVES`, `AFTER_JUMP` (first note after a big shift), `ONE_BY_ONE` (varied Exercises).
  extras: `TOP_THREE`, `FOUR_ONLY`, `FIVE_ONLY`, `IN_USE` (varied Exercises; add a six-string one
  only if needed: "Keep the pick on the six strings only." is the obvious shape).
  stringChange: `OWN_MOMENT` (the bunching sweep), `DOWN_AS_UP`. shift: `MOVE_ON_LAST`,
  `MOVE_AT_START` (varied Exercises). lastBars: `SEPARATE_TO_END`, `LAST_AS_FIRST`, `END_AS_START`.
  Warm-ups: `WELL_UNDER`.
- Append below the marker comment at the end of the book, Level by Level.
- **Varied Exercises (key / progression / shapeOrder / stringSet):** the rewriter refuses these words
  when the move is not a plain transposition: `variantText.ts` `LAYOUT` (shape, box, barre, reach,
  reaches, stretch, span, apart...), `QUALITY` (major, minor, chord, chords, progression, changes,
  arpeggio, triad...), "down"/"up" as a direction when the contour differs, "the hand" / "move the
  hand" (position), "next" (which string is next), and string names when notes do not line up one to
  one. What worked: "Press each note fully as the pick gets there.", "Be in place before each bar
  starts.", "Keep the end as even as the start.", "Keep your place by ear, not by counting.".
  `NEW_SHAPE_LATE` ("shape's") passed on the key variants.
- No `notes` cue anywhere (right notes are not graded on this Path); warm-ups have no `extras`.
- `cue.specific` refuses a note letter the Exercise does not play ("G-string note" read as the note
  G), a chord symbol the Exercise does not declare ("Am up..."), and a bare number it cannot place
  ("the hammer to 17": write "fret 17").
