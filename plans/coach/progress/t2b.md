# t2b: My exercises, the recipe store and the list on Paths (R)

Branch `coach-t2b`. Brief `plans/tasks/coach/t2b-recipe-store-and-list.md`.

## What landed

| File | What |
|---|---|
| `src/session/myExercises.ts` (new) | The key `myExercises`, `readMyExercises`, `addMyExercise`, `removeMyExercise` / `restoreMyExercise`, `buildMyExercises`, `isCustomTake`, `myExerciseLine` (the words), and the list as the app holds it (`loadMyExercises`, `saveMyExercises`, `useMyExercises`). |
| `src/containers/session/MyExercises.tsx` (new) | The section on Paths, and `playableDoc` (the one-Step document Play hands the runner). |
| `src/containers/session/PathsView.tsx` | One line: the section after the tracks. |
| `src/containers/session/hooks/useSessionRun.ts` | Four small hunks (diff for review below). |
| `src/styles/session.css` | `.session-myex*`. |
| `src/locales/*/session.json` | `session.myExercises.*`. |
| `src/test/parity/manifest.json` | The key `myExercises` (regenerated, not hand-written). |

## The key

`myExercises` in `settings.json`: a list, newest first, of `{ recipe, addedAt, name? }`, at most fifty.

- Read: not a list, missing, or a failed read: empty. An entry that is not `{ recipe: object, addedAt: number }` is
  left out (it never was a recipe). A recipe object that does not build (a later generator refuses it, or `v` is one
  this build does not know) is **kept** and its row says "This one can't be built any more", with Remove.
- Add (`addMyExercise`, for t2c): at the top; refused with `already` (same recipe key: `"root"` and its fret are the
  same), `badRecipe`, or `full` (fifty). A full list never drops an old one.
- Remove: the player's control on the row; Undo under the list puts it back at its place, until the next Remove.
  Nothing else removes (the coach never does).
- `name` is read and kept; nothing sets it yet.

## Playing one, and its Takes

Play builds `customPathDoc` from the recipe's Exercise with the row's own words as title and purpose, a localized
"how to", and the section's title as the Path's and Step's title (`playableDoc`), and calls
`actions.playExercise(doc, step, exercise)` like a Step page's Play this. The runner holds that document for the
Session (`customPath`) so the stage resolves it; it is never in `paths`.

Takes are saved like any Take (no schema change: `path_takes.path_id` is free text), under **`CUSTOM_PATH_ID` =
`"my-exercises"`**, t2a's constant (the judgement call said `mine`; t2a had already fixed the id and the brief says the
generator is not this leg's, so the one reserved id is t2a's, and no pack uses it: tested). Step id `my`, Exercise id
`my.<key>`. The clean tempo is kept (`exercise_ceilings` key `my-exercises/my.<key>`) and the row shows it.

Left out, each tested in `src/session/myExercises.test.ts`:
- Path standing (`currentStepOf`, `isStepPassed`): they resolve Takes by pack Path id.
- Per-Path totals on Progress (`groupsFrom`): no group (it skips a Path id with no document).
- Today's plan (`planSession`): never planned, also when it was the last thing played (`recapPick` finds no document).
- Starting a Path: the runner skips `my-exercises` when it subscribes the Paths a Session plays, and a custom
  Take moves no Path state (`moved` is null).
- Tendencies: c4a1 (in review, not on this branch) reads the Takes; `isCustomTake(take)` is the test it should use.

Not left out, on purpose: the overall minutes, Sessions and streak (`totalsFrom`): playing a custom Exercise is
practice, as an ungraded Take is.

Grading follows `session.grading` as for any Exercise (nothing here turns it on).
