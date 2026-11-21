# c4b2c: the fixes from c4b2b's re-read (`/tmp/coach-orch/c4b2b-review.md`)

Branch `coach-c4b2` (no new worktree). Logs `/tmp/coach-c4b2c/`, jobs `coach-c4b2c-*`.

## The fact under MEDIUM 1 (the planner, read, not changed)

`openWork` (`src/session/planner.ts`) never drops a parked Exercise: it orders the worklist
fresh, then swapped-away, then parked. So a parked Exercise is still in today's plan when its
Path has nothing else open (the focus or keep-warm block, with the "parked" context), and the
warm-up (the focus Exercise at 80%), a review, a recap and the band's finisher
(`finisherPick`, any jam-backed Exercise with a clean tempo) can play it too. "The plan rests it
till {day}" is true only on a day no part of the plan plays it.

## Findings → fixes (each test run once against the old code: all eight failed there)

- **MEDIUM 1**: `planPartOn` (any part whose `pathId`/`exerciseId` is the stuck Exercise) and
  `plateauWords` in `CompanionCard.tsx`. Held: "…without a new clean tempo; it is part {{n}} of
  today's plan." and no Rest chip; the question is "Keep at it, or try it another way?" when an
  Exercise part can be swapped, else "Keep at it?". Not held: the old sentence, Rest and
  "as the plan already has it" stay. Tests: `CompanionCard.test.tsx` "with today's part on it…
  (MEDIUM 1)", "held by a part that is not an Exercise block (the warm-up)… (MEDIUM 1)", and
  "left out of today's plan: the plan rests it, and Rest is offered".
- **LOW 2**: a failed `listCleanTempoSpans` sets the spans to `"unread"`; `lookBack` then has
  `needsSpans` false, no moved rows, no milestone, and the counts sentence (`say.ungraded` /
  `ungradedLeftOut`), never "held". The card shows, so the dot clears. Tests: `weekly.test.ts`
  "a long view that could not be read… (LOW 2)", `CompanionCard.test.tsx` "a long view that
  fails… (LOW 2)".
- **LOW 3**: `bpmMilestones` reads the week's own top clean Take when the best came after the
  week (Takes back to the first required, `crossedBefore` as before). Test "says a crossing in
  the week whose best was passed after it, as the week's own top (LOW 3)".
- **LOW 4**: the line says "lets these come back"; On follows the cards' write: a failed save
  shows "not saved", an unreadable `coach.cards` says `companion.cardsNotRead` (nothing changed,
  not even in memory, so "holds until Yames closes" would be false). Tests in
  `CoachSuggestionsRow.test.tsx`: "On says the hidden cards stay hidden when coach.cards could
  not be read…", "On says it did not land when the cards' save fails…", "On with no card hidden
  writes coach.suggestions alone…" (characterises).
- **LOW 5**: one rule: `withVariant` picks by `variantIndexOf`; `cards.ts` imports it and its
  `variantIndex` is gone; the orphaned comment is back above `withVariant`. A refactor: no test
  can fail on the old code (the existing cards and benchmark tests cover it).
- **LOW 8**: a first clean tempo in the week with the best after it needs the Takes back to the
  first (`complete`). Test "says no first clean tempo of the week when the Takes read do not
  reach back to it (LOW 8)".
- Left: **LOW 6** (each line true; optional wording, no new string spent), **LOW 7** (a
  MainWindow render test is heavy; the wiring was read correct), **LOW 4's owner question**
  (should On also lift a first Hide's seven days? today it does), the Settings hint not naming
  On as the way back (an omission, not a false line).

## Strings (English in all fifteen `companion.json`; c4b3 translates)

- `companion.hiddenUntilAsked`: "…lets it come back." → "…lets these come back."
- removed `companion.plateau.ask` ("Keep at it, try it another way, or let it rest?").
- new `companion.plateau.sayToday`, `companion.plateau.sayRangeToday`,
  `companion.plateau.askToday`, `companion.plateau.askKeep`, `companion.cardsNotRead`.

## Merge and gates

`git merge coach`: "Already up to date" (c4b2b's `a2939fe6` already holds `coach`'s tip
`fb4c5193`, the model's wiring in Ask included), so no merge commit.

- tsc 0 (`coach-c4b2c-tsc-2`); build 0 (`coach-c4b2c-build`).
- `npm run test`: 466 of 467 files, 50363 passed, 10 skipped; the one failed file is the known
  `TabStage.render.test.tsx` (node_modules symlink) (`/home/dgx-delgado/scratch/jobq/990-coach-c4b2c-vitest.log`).
- Layout `rail`, `today-line`, `short-window`: 120 passed (`coach-c4b2c-pw`).
- The eight new tests against the old source (`coach-c4b2c-vold`): all eight failed.

## For c4b3

Translate the strings above (and c4b2b's). The plateau question now has three shapes; a
translation must keep `{{n}}` in `sayToday` / `sayRangeToday`.
