# t2d handoff: Today's part of My exercises is leg t2e

Brief `plans/tasks/coach/t2c-make-exercise-tool.md` item 5 ("A part in Today", TOOLS 2.4: "added to
Today as a chosen part": from My exercises, "Add to today" on a row; `start_today` / the planner treat
it as a part the player chose; it counts toward the minutes; it is never chosen by the planner on its
own; it passes nothing). NEXT-LEGS decision 17: optional if it needs more than a planner input and one
runner hook. **It does**, so t2d stopped before it (no change to `planner.ts`, `useSessionRun.ts`, the
runner or any store in t2d). What it needs, read at coach 7cb9c9c9:

1. **A store for "chosen for today"**: nothing holds it now. A settings-store key (DESIGN 9.5: no new
   table), e.g. `myExercises.today = { day: "<local yyyy-mm-dd>", keys: [<recipe key>] }`, read as
   empty on any other day; written only by the player's press ("Add to today" / "Take off today" on a
   My exercises row, `src/containers/session/MyExercises.tsx`), never by the coach; Undo as Remove has
   it. It goes through `myExercises.ts`'s one door (`updateMyExercises`-style read, then write), so
   it is a store change: **R**.
2. **A planner input**: `PlannerInput.chosen?: ReadonlyArray<{ path: PathDoc; exercise: Exercise }>`
   in `src/session/planner.ts`: each becomes an `exercise` step (`pathId` = `MY_EXERCISES_PATH_ID`,
   a role of its own or `focus` with a `why` that says the player chose it), its minutes taken from the
   plan's total (the plan's other blocks shrink; `PLAN_MINUTES` unchanged), placed after the warm-up.
   With `chosen` absent the plan must be byte-identical (a test over the existing fixtures, as
   `focus.test.ts` does for `focused`).
3. **More than one runner hook** (why this is its own leg): `useSessionRun.ts` holds ONE custom
   document (`customPath`, set by `playExercise`, line ~1685) and adds it to `runPaths` (~802). Today
   with two chosen parts needs a list, and the documents are built by the generator
   (`paths/custom.ts`, `buildMyExercises`), which the runner keeps out on purpose (comment at line 68):
   they must be built outside (Today / Paths, async, `loadExerciseGenerator`) and handed in. And
   `planSession` is called in four places that must all pass `chosen` or Today and the Session
   disagree: `basePlan` (~699), `previewPlan` (~725, the coach's `set_minutes` / `set_focus` preview),
   ~2329, `SessionView.tsx` "tomorrow" (~1869); `exportData.ts:127` may stay without it.
4. **What Today shows**: the chosen part as a row in Today's plan like any other, with its line
   (`myExerciseLine`); `TodayView.tsx` is shared with rem2c and c4b3 tonight: keep its hunk small.
5. **Tests**: planner (minutes add up, never chosen without the input, nothing passed:
   `useSessionRun` line ~1475 already moves no Path for a custom Exercise), the store (day roll-over,
   Undo), `MyExercises.test.tsx` (the press), layout `today-*` specs and `my-exercises.spec.ts`.
6. Review: the diff to `/tmp/coach-orch/t2e-review.diff`, every hunk in `planner.ts`,
   `useSessionRun.ts` and the store named; the `reviewer` agent is required (stores).

Also owed from t2c (not this leg): "Hear it" (no door plays an Exercise outside a Session).
