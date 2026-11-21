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
- [ ] Step 3: proof-read.
- [ ] Step 4: translations.
- [ ] Step 5: gates.

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
