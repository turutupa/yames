# Leg cues13b: Sweep Picking's cues, second half (one thing to try)

Branch `coach-cues13b`, worktree `/home/dgx-delgado/yames-coach-cues13b`, logs `/tmp/coach-cues13b/`.
Cues appended to `src/paths/specs/sweep-picking-cues.ts` below cues13a's marker; the first half is
unchanged. With this leg every Exercise of the Path has cues (75 of 75).

## What this leg covered (38)

Intermediate Steps 10 to 14 (`the-link` 3, `link-chains` 3, `minor-progressions` 4, `long-chains` 3,
`over-the-progression` 4: 17) and all of Advanced's Steps (`six-strings` 3, `six-string-changes` 3,
`fast-shifts` 3, `neoclassical` 5, `advanced-etude` 4, `over-a-heavy-band` 3: 21). That is 38, not the
35 cues13a's notes say (their own list adds to 38; 37 + 38 = 75). Self-checked, general cue only: `over-the-progression.your-chorus`,
`fast-shifts.inversion-runs`, `over-a-heavy-band.your-solo`.

## State

- [x] Step 1: read; cues13a's dump reused (`/tmp/coach-cues13a/sweep-picking-dump.txt`, same tabs).
- [x] Step 2: Intermediate Steps 10 to 14 (commit 1), Advanced (commit 2); `check` 0 errors,
  0 `cue.refused`, none of the new cues said in other words for a variant (`gc5.log`).
- [x] Step 3: proof-read (two sonnet readers: Intermediate, Advanced; below); `check` after: 0 errors,
  0 refused (`gc6.log`).
- [x] Step 4: translations: of 286 new cue keys per language, 181 have an English already translated
  in the overlay (cues13a's constants and reused sentences): filled from it
  (`/tmp/coach-cues13b/prefill.mjs`, `i18n-sweep-picking/prefill.<lng>.json`); 73 new sentences to
  four sonnet helpers (de fr es it · nl pl pt-BR ru · tr vi ja · ko zh-CN zh-TW). Every file checked
  again by me (`check_i18n.py`, problems 0 in all fourteen), merged: every overlay 1395 of 1395
  (`merge-prefill.log`, `merge.log`, `merge2.log`). My fixes before the merge: the etude's "Move one
  fret as the pick skips the D string" (the index drops 12 to 11) had "up" in de, fr, es, it and nl:
  set to down; ja's six-string-links general was two sentences: made one.
- [x] Step 5: gates (below).

## Gates (logs in `/tmp/coach-cues13b/`)

- `npm run paths -- check` (every pack): 16 Paths ok, 0 errors; sweep-picking 0 refused (`check-all.log`).
- `npx tsc --noEmit`: clean (`tsc.log`).
- `npm run test`: 415 of 416 files, 45,354 of 45,354 tests passed (`vitest.log`); the one file is the
  known worktree-only `TabStage.render.test.tsx`; one "Timeout calling onTaskUpdate" from the busy box,
  every test passing.
- `npm run build`: ok (`build.log`).
- No Rust file changed; no layout run (the orchestrator's).

## The numbers (this leg)

286 cues on 38 Exercises (35 graded, 3 self-checked with the general cue only), 73 new distinct
sentences (the rest reuse the first half's constants). By trigger: general 38, heard 35, late 35,
early 35, stringChange 35, extras 35, shift 33, lastBars 33, afterHeld 7. The whole Path now: 541
cues on 75 Exercises, 188 distinct. None of my cues is said in other words for a variant.

## Longest cue per language, and what wants a native read

en 48 · de 48 · fr 48 · es 48 · it 48 · nl 48 · pl 48 · pt-BR 48 · ru 48 · tr 48 · vi 46 · ko 27 ·
ja 23 · zh-CN 18 · zh-TW 18. Read first: the new word for "the link" (de Bindeton, fr liaison, es
enlace, it collegamento, nl linknoot, pl nuta łącząca, pt-BR nota de ligação, ru нота-связка, tr bağ
notası, vi nốt nối, ja つなぎの音, ko 연결음, zh 连接音 / 連接音); "fretting hand" written as the left
hand in it, pl and ko (wrong for a left-handed player); pl's two clipped cues on link-alone and
two-shapes; de band-big-chain general is not an imperative; es octave-jump shift drops "to jump".

## Twelve cues to read

- **"Up one chord, down the next"** (Intermediate, the-link). Up three strings, a link at the top, the
  next chord back down. general "Play it as one gesture, link in the middle." · afterHeld "Count the
  held note's two beats, then link." · late "Land the link note right on beat one."
- **"Five strings, in a chain"** (Intermediate, long-chains). One five-string loop per chord through
  four chords. general "Keep every note separate in the big loops." · early "Wait for beat three
  before the top hammer." · stringChange "Slow the hand so each string gets its moment."
- **"The octave jump"** (Advanced, fast-shifts). One triad twelve frets apart. general "Make the jump
  in the time of one note." · heard "Press the first note after each jump fully." · shift "Leave each
  loop's last note early to jump."
- **"The etude, part two"** (Advanced, advanced-etude). E minor high, A minor, B major home, a sweep up
  to a held E. general "Count the beat of rest before the last sweep." · shift "Move the index down
  three frets for A minor." · lastBars "Land the held E right on beat three."

## Constants added (reuse them)

The link (the first note of a new shape, hammered, pulled or slid on the same string): `LINK_HEARD`,
`LINK_LATE` / `LINK_EARLY` (the link is on beat one of every bar after the first), `CROSS_AFTER_LINK`,
`HELD_THEN_LINK`, `LAST_TWO_BEATS`. Loops with a slide on top in some bars: `TOP_NOTE_LATE` /
`TOP_NOTE_EARLY`. `REST_MOVE`, `ONE_PER_STRING` (extras on six-string shapes, where "the strings in
use" is every string), `THREE_TO_TWO` (quarter-note triplets), `TWO_LOOPS_EACH`, `HELD_E_COUNT` /
`HELD_E_LAND` (the etude's last bar), `SWAP_ONE` (the two self-checked "your own" Exercises).

## The proof-read (two separate sonnet readers)

14 objections (`/tmp/coach-cues13b/proof-sweep-picking/objections-{a,b}.md`), 9 taken, 5 answered.
Taken (was -> now): round-the-loop lastBars "Run the last loop straight into the first." repeated the
general -> `END_AS_START` · chain-five lastBars `SEPARATE_TO_END` repeated the general -> `END_AS_START`
· `LINK_HEARD` "Press the link note hard enough to hear it." ("press" is wrong where the link is a
pull-off: six-string-links, linked-phrase, band-six-links) -> "Sound the link note firmly, fretting hand
only." · octave-jump shift "Look at where you land before you jump." (the eyes, not the hands) ->
"Leave each loop's last note early to jump."; lastBars "Jump back down on the last note." (the last note
is played high; the drop comes after it) -> "Drop back down right after the last note." · band-six-links
stringChange `CROSS_AFTER_LINK` repeated heard and bar 1 has no link -> `OWN_MOMENT` · walking-triads
general "Keep your place by the chord names on the tab." (reading, not hands) -> "Start each new shape
right on beat one." · `SWAP_ONE` "Swap one bar for your own, then record it." (two ideas) -> "Swap one
bar for a line of your own."

Answered, not changed:
- *band-four and etude shift `MOVE_ON_LAST` "Move to the next shape on each bar's last note.": the shape
  changes after the last note*: it is the first half's stock order, read as "start the move while the
  last note sounds" (that note is on one string; the other fingers are free); kept for consistency.
- *minor-six general "Hammer on the low E and on the top string." and minor-into-major shift "Drop the
  index two frets for the top string." name strings / frets on key-varied Exercises*: their key variants
  are plain transpositions on the same strings, and `check` neither refused nor rewrote either cue.

## Refusals and rewordings

First `check` of Intermediate: 1 `cue.specific` error and 71 `cue.refused`.
- `openString` on `long-chains.chain-four`: only one variant (i-VI-III-VII) has an open string, and
  `cue.specific` refuses the cue on the others: dropped (the guide's "no cue for a trigger only some
  variants have"). cues13a's note that chain-four "can produce openString" is true of that variant only.
- "Cross only after the link note sounds." ("which string is next", on the progression variants) ->
  "Let the link note sound before you pick again."
- "Link on the top string, then come back down." (strings do not line up) -> "Play it as one gesture,
  link in the middle."
- "Look where the jump back to the start lands." (a direction; the contour differs) -> the stock
  `MOVE_AT_START`.
- "Move each finger one fret at most per change." (a distance, not a uniform transposition, on the-pull's
  keys) -> "Move only the fingers whose notes change." (cues13a's, already translated).
- minor-two-five-one's E and D keys are not a plain transposition: `TOP_THREE`, `TOP_NOTE_EARLY`,
  `MOVE_ON_LAST`, and "Play two loops a chord..." ("chord") refused -> `IN_USE`, `SWEEP_LATE` /
  `SWEEP_EARLY`, `MOVE_AT_START`, "Play two loops of each, then move on the click."
- chain-four's i-VII-VI-VII variant refused `TOP_HAMMER` / `TURN_EARLY` (contour) -> `SWEEP_LATE` /
  `SWEEP_EARLY`. chain-five refused `FIVE_ONLY`, `LOOP_A_LATE` and "Start each loop a fret or two from
  the last." -> `IN_USE`, `SWEEP_LATE`, "Keep every note separate in the big loops."
Advanced: 12 `cue.refused`. six-string-links "Link at each end, then take all six strings." (some
progressions are not six strings throughout) -> "Keep the link moving: no stop between passes.";
octave-jump "Throw the arm twelve frets in one note's time." and `TOP_THREE` (G and F are not a plain
transposition) -> "Make the jump in the time of one note." and `IN_USE`; inversion-runs "Learn one beat
of each shape before joining." -> "Learn each beat alone, then join them up."; big-shape-jumps
`FIVE_ONLY` -> `IN_USE`.
