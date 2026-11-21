# c2b1c: the review fixes for c2b1a (fact cards)

Same worktree and branch as c2b1a (`coach-c2b1a`). Work list: the independent review
(`/tmp/coach-orch/c2b1a-review.md`, MERGE AFTER FIXES, eleven findings). Each finding below:
what was wrong, the fix, the test that fails without it.

| # | What was wrong | Fix | Test |
|---|---|---|---|
| F1 | A self-checked Exercise (or a self-checked tempo rung) with grading on read "grading is off" | `ungradedLine(ctx, outcome, exercise)`: the player's reason when given; `gradingOff` only when `ctx.grading === "off"`; else `count.ungraded.selfChecked` (the Exercise) or `selfCheckedTempo` (the rung at that BPM) | `cards.test.ts`: two rows in "why didn't that count" and "grading on and the Exercise self-checked: never 'grading is off'" (all three cards) |
| F2 | The premise lines claimed a whole-Take lean ("your notes landed late", "didn't lean early"), which lag correction hides | `lean.premise.*` / `lean.premiseNone.*` now say the bars that leaned sat later/earlier **than the rest of it**, and "A lean the whole Take shares is something I don't measure." | `cards.test.ts`: "every premise line is relative to the Take and names what is not measured", and the English of the mock-15 answer |
| F3 | A pass with no clean tempo (fewer than 8 held bars) answered only "it did count" | after `count.passed`, `count.notClean` (need 8, longest run held) from `measures.pass.heldBars`; `count.notCleanPlain` without a scorer pass (`gradeTake` then withholds it only for want of the stretch); nothing when held >= 8 | `cards.test.ts`: row "a pass without a clean tempo" and "the clean-tempo line carries the held stretch" |
| F4 | Below the pass mark with every bar held read as a clean Take | `slip.none` followed by `note.lead` when `verdict === "belowBar"` | `cards.test.ts`: "below the pass mark with no bar slipped" (`failOn: notesHeard`) |
| F5 | The model's prompt got the Take's raw findings (whole-Take rushing, played-bar numbers, a not-caught Take's analysis) | `askModelContext(sources)` in `askContext.ts` builds the model's context with `review: undefined`; `useAskHost` uses it. The cards and tools keep the review through `registerAskToolContext`. `context.ts` untouched | `askContext.test.ts` "askModelContext": control (the plain context prints `findings: rushing`), then the model's has no findings and keeps the Take line |
| F6 | Matcher wrong matches; `answerCardFor` wrote a "no Take" card off a Session | `match.ts`: `ABOUT_ME` takes "it/that/this" only as the subject (`was it`, `did that`); `OTHER_TAKE` (take N, first/previous take, yesterday, last session...) → null; `MEANING` (mean, define) → null; count-in → null; `NOT_MY_TIMING` (metronome/click starts, ahead of schedule, behind on my ...); "why didn't X count" needs X = it/that/this/(my/the/last) take or a known metric. `answerCardFor` returns null and writes nothing when the card is the no-Take line (a chip still answers it) | `match.test.ts`: 16 new near-misses (every line the review names, plus variants) and 3 matches that must survive; `askCards.test.tsx`: off a Session and "another Take" → null, nothing written |
| F7 | The early-or-late card said "the notes there landed late" then "Bar 1: 20 ms earlier" (all rounds) | when the place and its direction are said, the lean-by-bar lines skip the place's pattern bars | `cards.test.ts`: "the place's bars are not also said from every round" (asserts the all-rounds mean really is early, so the test bites) |
| F8 | The card read the last Take with the step's current variant | `seedOfTake`: the stored row's `variantSeed` when the Take is stored, else the step's | `cards.test.ts`: "reads the Take with the variant it was played on" (step seed 3, Take and the one before on 7: the last-Take comparison appears) |
| F9 | "stopped after 1 bars" | `tooShort` / `count.tooShort` get `count`, `_other` forms in all fifteen locales | `cards.test.ts`: "a Take stopped in its first bar" |
| F10 | Card chips (3) plus tool chips (4) in one row | `withinChipCap`: card chips first, tool chips in the room left, total `MAX_ASK_CHIPS = 4`. Four, not three: the tools' own cap is four (t1b1's `MAX_CHIPS`, `AskPanel.test.tsx` holds it), so a screen without cards is unchanged | `askCards.test.tsx`: "at most four chips at once" (render: 3 cards + 1 tool) and the cap's table |
| F11 | "did count, as a Take below the pass mark" | **Not changed: the owner's call**, as the review says. Proposed: "Take {{take}} is kept, below the pass mark at {{bpm}} BPM." | none |

Not fixed, noted: the review's "Unverified" stale empty state after an "eyes"/"inputOff" Take (could
not be confirmed without running the app); "on 1 of 1 rounds" comes from the note's own
`session.note.place.*.all` strings (not this leg's).

## To translate (c2b1b), added or changed here

English text in the fourteen other locales: `ask.card.tooShort` / `tooShort_other`,
`lean.premise.{early,late}`, `lean.premiseNone.{early,late}` (new wording),
`count.tooShort` / `tooShort_other`, `count.notClean`, `count.notCleanPlain`,
`count.ungraded.selfChecked`, `count.ungraded.selfCheckedTempo`.

## The merge

`coach` merged in, then `coach-t1b2b` (not yet in `coach`): first at its WIP `90beef16`, which did
not type-check (`askTyped.ts` `go` possibly null), then again at `a65f3edb` once the branch moved
(tsc on `coach-t1b2b` alone passes). No conflict anywhere. `AskPanel.tsx`: t1b2b's send
(`answerTyped(draft, i18n.language)`) whole; the card turn kind, card chips and the cap from here.
Nothing is plugged into the slot.

## Gates (logs in /tmp/coach-c2b1c/), after the merge

- tsc: pass (`coach-c2b1c-tsc-2`). Build: pass (`coach-c2b1c-build-2`).
- vitest full (`vitest.log`): 48658 passed, 1 failed: `i18n.songs-wave` plural forms (the new
  `tooShort` plurals lacked `_many` / `_few` in es, fr, it, pt-BR, pl, ru); fixed in the next commit,
  then `src/test` + `src/coach/ask` + `src/containers/coach` re-run: 1818 passed. Plus the known
  `TabStage.render.test.tsx` load failure.
- Layout, the five specs (`layout.log`): 75 passed, 52 skipped, 3 failed, all `smooth` long tasks
  (91 to 121 ms) at a load average over 60; `smooth.spec.ts` alone (`layout-smooth.log`): 2 other
  long-task failures; the five failing tests alone (`layout-smooth-2.log`): 5 passed.

## For c2b1b

- The slot is t1b2b's `setAskNextAnswerer((text) => boolean)` in `askTyped.ts`. **It must be
  synchronous: a Promise counts as "not answered".** Plug in `(text) => answerCardFor(text) !== null`.
  `answerCardFor` is synchronous and writes its own turns (the player's, then the card's).
- `answerCardFor` now returns null for a question with no Take to read (Songs, Jam, Today): the model
  gets it. A chip still answers "no Take yet".
- Chips: `MAX_ASK_CHIPS` (4) is the total in Ask; card chips first.
