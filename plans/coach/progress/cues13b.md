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
- [ ] Step 3: proof-read (two sonnet readers: Intermediate, Advanced).
- [ ] Step 4: translations.
- [ ] Step 5: gates.

## Constants added (reuse them)

The link (the first note of a new shape, hammered, pulled or slid on the same string): `LINK_HEARD`,
`LINK_LATE` / `LINK_EARLY` (the link is on beat one of every bar after the first), `CROSS_AFTER_LINK`,
`HELD_THEN_LINK`, `LAST_TWO_BEATS`. Loops with a slide on top in some bars: `TOP_NOTE_LATE` /
`TOP_NOTE_EARLY`. `REST_MOVE`, `ONE_PER_STRING` (extras on six-string shapes, where "the strings in
use" is every string), `THREE_TO_TWO` (quarter-note triplets), `TWO_LOOPS_EACH`, `HELD_E_COUNT` /
`HELD_E_LAND` (the etude's last bar), `SWAP_ONE` (the two self-checked "your own" Exercises).

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
