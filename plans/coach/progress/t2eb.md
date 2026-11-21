# t2eb: fixes from the t2e review (`/tmp/coach-orch/t2e-review.md`)

Branch `coach-t2e` (worktree `/home/dgx-delgado/yames-coach-t2e`), on top of t2e. `coach` merged in (clean).
No tool in the registry, no card, no Rust.

## Fixes

| Item | Where | What |
|---|---|---|
| M1 | `useSessionRun.ts` `moreMinutes`; `SessionView.tsx` recap; `chosenToday.ts` `chosenNotPlayed` | "5 more minutes" and the recap's next Session leave out a chosen part this Session played (by its outcomes); one not played (Session ended early) is still offered |
| M2 | `chosenToday.ts` `keysOnList` / `withKeyOnList`; `MyExercises.tsx` | only keys whose exercise is on the list count toward the cap; a removed exercise's key stays for the Remove's Undo and is dropped only by an Add press at the cap |
| M3 | `chosenToday.ts` `CHOSEN_TODAY_MAX = 3`; `planner.ts` `withChosen`; `TodayView.tsx`; strings | one rule: the lead is never dropped (keeps at least `MIN_BLOCK_MINUTES`), so 3 (= `MAX_GRADED - 1`) is what can ever be planned beside a Path. The plan carries `chosenLeftOutWhy` (`minutes` / `graded`) and `chosenPathPlaces`; Today says "Choose more minutes" only for `minutes`, and `chosenLeftOutGraded` ("More minutes won't make room") otherwise. `todayFull` says why the number is 3 |
| M4 | `useSessionRun.ts` `todayNow`, `planClock` exposed, an effect on `view`; `MyExercises.tsx` | one clock: the plan's. Every move between learning screens and every press moves it to the new day (same day: unchanged, no re-plan). Paths reads the row's state by it and writes by it. A press carries what the row said (`wasIn`), so a stale "Take off" never adds. A running Session keeps its plan |
| M5 | `runner.ts` `loopOffer` / `loopAt` (`OWN_EXERCISES_PATH_ID`, refusal `ownExercise`); `coach/tools/practice.ts`; `coachTools.why.refused.loopOwn` | no Loop on the player's own exercise: the Session's button is not offered and `loop_bars` refuses with a true sentence. The SessionView button itself is untouched (it shows when `session.loop` is non-null) |
| L1 | `ChosenTodayParts.tsx` `liveChosenKeys` | builds only for today's or yesterday's keys |
| L4 | `MyExercises.tsx` | the Undo keeps its day; pressed on another day it writes nothing and goes |
| L9 | `SessionView.tsx` | recap plans with `session.planClock` |

**Not built (named): looping an own exercise** (M5). It needs `loopFrom` / `chooseKey` to resolve through `runPaths`
and a check that the loop engine plays a generated Exercise; until then no door offers it.

## LOW left, with the reason
- L2 (a due review dropped without a word when a chosen part takes its block): needs a new Today line and a
  `skipped` reason; not a small hunk. Nothing is lost (it stays due).
- L3 (the byte-for-byte test compares new with new): a real snapshot must be produced on `coach`; not done here.
- L5 (export plans without `chosen`): left as t2e decided.
- L6 (Start before the builder resolves): a short window after launch; needs a "building" state on Today.
- L7 (`runPaths` identity on `chosenBuilt`): reshaping the memo key touches the Session's prepare effect; left.
- L8 (non-gradable chosen exercise): could not be produced by a recipe; not chased.

## Gates
(see below, filled as they run)
