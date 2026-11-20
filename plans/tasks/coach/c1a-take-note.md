# Leg c1a: the note's brain (`takeNote`, rounds, lean, heardIt)

Worktree `/home/dgx-delgado/yames-coach-c1a`, branch `coach-c1a`. Logs under `/tmp/coach-c1a/`.
Read `plans/tasks/coach/BRIEF.md` first. Design: DESIGN.md sections 2 (the voice table), 4.1, 4.2, 4.4
and the rows of 9.3 for `TakeFacts.lean` and `TakeFacts.heardIt`; REVIEW.md "The ten that mattered most"
rows 1 to 3 (the mistakes this leg exists to avoid). Pure TypeScript, no component, no visible change.
Another leg (ms1) owns `useSession.ts`, the model and the quiet session: do not touch them.

## What to build

1. **`src/coach/rounds.ts`**: fold a Take's bars onto the bars of the tune. A Take repeats a short pattern
   (`exercise.bars`), so bars 1, 5 and 9 of a four-bar tune are one pattern bar. Functions to map a Take
   bar to (round, pattern bar), to count "on two rounds of three", and to key comparisons on
   (variant, pattern bar). Count-in and partial last rounds are handled and tested.
2. **`src/coach/takeNote.ts`**: `takeNote(outcome, review, earlier, exercise)`, a thin layer over what
   already exists. It decides nothing about the grade.
   - Leads with what decided the verdict (`decidingCheck(grade)`; `takeLine()` already words the verdict
     cases: wrap it, do not re-decide), then says where.
   - Uses `review.findings` (ranked in Rust, `findings.rs`) for the place; folds bars to pattern bars.
   - Says the direction only when it was measured, **relative to the rest of the Take** (the scorer's lag
     correction absorbs a whole-Take lean): from `Rushing` / `Dragging` and the per-note deviations of the
     bars that slipped.
   - Adds what only history knows: `closer`, `sameSpot`, `stuck`, `goingDown`, `newClean`, `tooEasy`, with
     the thresholds DESIGN 4.2 gives.
   - The repeat table of 4.2: first, second, third time at the same spot and tempo (`repeat: 1 | 2 | 3`),
     which the Session will use for the buttons (P1 / P2 are a later leg; only report the state).
   - `notCaught` and ungraded Takes: no claim about the playing.
   - It never says why. It never says "check your tuning" (owner decision 9: not until the app has a
     tuner); when most wrong notes are off the same way, the fact is kept in the data as
     `tuningSuspected` and nothing is said.
   **Output is data, not sentences**: a `TakeNote` of typed parts (the finding, the place, the direction,
   the history facts, the fact-line items with their check / cross / dash, the bar-strip cells with their
   rounds, i18n keys with their arguments). The leg that draws it (c1b1) writes the sentences into the
   locale files; give it the keys and arguments it will need and a short table of them in your progress
   file. No English prose assembled in code.
3. **`TakeFacts.lean?: number[]`** (signed mean deviation per pattern bar, ms, relative to the Take's
   median) and **`TakeFacts.heardIt?: "yes" | "notYet"`**: the types and the pure functions that compute
   or carry them in `src/session/progress.ts`, and `exportData.ts` (with its test). Both live inside
   `facts_json`: no migration, no Rust.
4. **Writing them with a Take.** In `src/containers/session/hooks/useSessionRun.ts`: `lean` computed and
   stored where the Take's facts are built for `savePathTake`; `heardIt` written like `fair` (a re-save of
   the row) through a small action the Session screen can call later. Minimal hunks: another leg (c0)
   adds one-line publishes beside the dispatches in the same file.

## Gates

tsc, vitest, build. The table test DESIGN asks for: **one fixture Take per finding kind**
(`ConsistentMiss`, `Rushing`, `Dragging`, `AfterShift`, `FallsApart`, `Extras`, `Uneven`, `TempoCeiling`,
`Improved`, `Clean`), plus a variant (the same Exercise with another `variantSeed`), a `notCaught`, an
ungraded Take, a pass that still contains last Take's slipped pattern bar (the overclaim of REVIEW row 1:
the note must say "caught you on one round of three; last Take it was two", never "held"), and the three
rows of the repeat table. Fixtures are built from the real types (see `src/session/testKit.ts`), not
loose objects cast to them. `savedFormats` / export tests still pass.

## Report

As BRIEF "The end of a leg". Include the table of `TakeNote` parts and the i18n keys and arguments you
propose for each, so the next leg can write the sentences.
