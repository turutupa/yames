# t2e: "Add to today": a player's own exercise as a chosen part of today's Session (R)

Branch `coach-t2e` (from `coach` at 3f8ce04c). Brief: `plans/coach/progress/t2d-HANDOFF.md`, TOOLS 2.4.
No tool in the registry, no card in `intents.ts`, no Rust.

## What landed

| Step | Files |
|---|---|
| 1 store | `src/session/chosenToday.ts` (new, light), `src/session/myExercises.ts` (`queueMyExercisesWrite`) |
| 2 planner | `src/session/planner.ts` (`chosen`, `withChosen`, `chosenLeftOut`, reason `chosenToday`), `todayPlan.ts` (role `mine`), `swap.ts` (`canSwap` false for a chosen row) |
| 3 runner | `useSessionRun.ts`, `ChosenTodayParts.tsx` + `chosenTodayBuild.ts` (new), one line in `MainWindow.tsx`, `SessionView.tsx` (recap's next Session) |
| 4 UI | `MyExercises.tsx` (Add to today / Take off today, Undo, "In today's Session"), `TodayView.tsx` (one footnote) |
| 5 | 15 locales (`session.json`, 13 keys), scenes `today-mine`, `paths-mine-today` (+ phone), `tests/layout/today-mine.spec.ts` |

## The store

Settings key `myExercises.today` = `{ day: "yyyy-mm-dd", keys: [recipe key] }`, at most 4 (`CHOSEN_TODAY_MAX`).
Read as none on any other local day; nothing written on load or at midnight; a value of another shape is
unreadable and never written over. Only writer: `updateChosenToday(fn, now)`, in the same queue as the list's
writer. Only callers: the row's press and its Undo (`MyExercises.tsx`). A key whose exercise was removed from
the list stays stored and is not planned (Undo of the Remove brings it back to today).

## How `chosen` enters `planSession` (for c5a1b, "make this my finisher")

`planSession(input) = chosen?.length ? withChosen(planFromPaths(input), input, chosen) : planFromPaths(input)`.
`planFromPaths` is the old body, untouched. `withChosen` is a post-pass on the finished plan:
- each chosen exercise: a block of `CHOSEN_MINUTES` (3), id `mine-N`, role `next`, `context: chosenToday`,
  tempo from `tempoFor` (eased after a break), inserted right after the warm-up slot (index 1 from ten
  minutes; index 0 at five);
- room is made from the end: the planner's last blocks go (the lead last), then the lead shrinks to 3,
  then the lead goes; spare minutes go back to the lead, or to the last chosen block when the lead went;
- what fits: min(chosen, (minutes - warm-up) / 3, 4 graded - warm-up slot's - lead's); the rest is
  `plan.chosenLeftOut` (Today says it); `skipped` recomputed, `focusPathId` null if the lead went.
A finisher input would most naturally be a second post-pass after `withChosen` (it replaces the last
block), or a `planFromPaths` input if it must shape the planner's own choices. Swaps (`applySwaps`) run after
`planSession` in the runner; a chosen row cannot be swapped.

## The runner

Parts are built outside (`ChosenTodayParts`, memoised, mounted once in the shell, renders nothing; it loads
the list and the generator only when a key is stored) and handed in by `actions.setChosenParts`. The runner
picks today's by `planClock` (`chosenForToday`) and passes the same `chosen` to `basePlan`, `previewPlan`,
`moreMinutes` and (via `session.chosenToday`) the recap's next Session. `exportData.ts` left without it.
`runPaths` holds one custom document (`customDocOf`: the last played + every built part, whatever its day).
No new effect during a Take: the shell's per-beat renders do not reach the memoised builder; the runner's
new memos depend on the store, the parts and `planClock` only.

## Decisions / open points

- "5 more minutes" passes `chosen` too (the brief's "all four"): at five minutes the chosen part takes the
  whole five, so the player who just played it gets it again. Say if that should exclude parts played.
- Paths' row reads today's keys by `Date.now()`, the runner by `planClock` (only differs across midnight).
- `loopFrom` (Loop the first bar) still resolves against `paths` only, so a custom exercise has no loop: as
  before this leg, not changed.

## Gates

Logs under `/tmp/coach-t2e/`. `coach` merged in at the end: already up to date.
- `npx tsc --noEmit`: pass (coach-t2e-tsc-3). `npm run build`: pass (coach-t2e-build).
- `npm run test` (`vitest.log`): 51,805 passed; failures were the known `TabStage.render.test.tsx` (it cannot load
  through the symlink) and `parity/surface` (the new settings key). The manifest was regenerated with
  `UPDATE_PARITY_MANIFEST=1`, then `src/test/parity` passed (coach-t2e-parity-2). One "Timeout calling onTaskUpdate"
  under load.
- Layout (`layout.log`): today-line, my-exercises, coach-session, short-window, phone-learning, planner, swap,
  today-anchor, today-focus, paths-prereq: 444 passed, 4 failed, all `page.goto` / test timeouts under load (3
  `today-anchor` hero, 1 `short-window` session-ask-ready tab ember 1280). Re-run alone: 4 of 4 passed
  (coach-t2e-layout-2).
- `today-mine.spec.ts`: 4 passed (coach-t2e-scenes-3). Pictures in `/tmp/coach-t2e/shots/`: `today-mine-1440.png`,
  `today-mine-390.png`, `paths-mine-today-1440.png`.
- `smooth.spec.ts --workers=2` (`smooth.log`): 17 passed, 1 failed, "Ask commits nothing during a running Take"
  (long task 54 ms in the best of 3 windows). The same test alone, repeated 3 times, passed 3 of 3 on t2e and 3 of 3
  on `coach` untouched, so the first run was the busy machine.
- Not run: the full layout suite (the orchestrator's); `test:rust` (no Rust).
- Review: `/tmp/coach-orch/t2e-review.diff` (src, locales excluded).
