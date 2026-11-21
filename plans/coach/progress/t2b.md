# t2b: My exercises, the recipe store and the list on Paths (R)

Branch `coach-t2b`. Brief `plans/tasks/coach/t2b-recipe-store-and-list.md`.

## What landed

| File | What |
|---|---|
| `src/session/myExercises.ts` (new, light) | The key `myExercises`, `MY_EXERCISES_PATH_ID`, `readMyExercises`, `removeMyExercise` / `restoreMyExercise`, `isCustomTake`, and the list as the app holds it (`loadMyExercises`, `saveMyExercises`, `useMyExercises`). No generator import. |
| `src/session/myExerciseBuild.ts` (new) | `keyOf`, `addMyExercise` (t2c's door), `buildMyExercises`, `myExerciseLine` (the words). Imports the generator. |
| `src/containers/session/MyExercisesSection.tsx` (new) | Renders nothing while the list is empty; else `React.lazy` of the list. |
| `src/containers/session/MyExercises.tsx` (new) | The section (default export, lazy) and `playableDoc` (the one-Step document Play hands the runner). |
| `src/containers/session/PathsView.tsx` | Two lines: the import, the section after the tracks. |
| `src/shots/scenarios.ts`, `src/shots/mockIpc.ts`, `tests/layout/my-exercises.spec.ts` | Scene `paths-mine` (+ `phone-paths-mine` via `PHONE_LEARNING_SCENES`) and its spec. |
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

## The generator stays out of the first load

`paths/custom.ts` brings `generate.ts`, `validate.ts` and the templates. Imported by the runner and the Paths
screen, it slowed the shell's first load enough that phone-learning's "footer is one row after a Watch" at 360 px
failed on this branch and passed on its base (`coach-night` at 0c00c6ba). Hence the split above: the runner reads
the id from the light store module (a test holds `MY_EXERCISES_PATH_ID === CUSTOM_PATH_ID`), and the list is lazy.
After it the test passes alone 2 of 2 (job coach-t2b-layout-5); in the batch of four specs it failed once by 1 px
(333 against 332, under load). t2c: import `addMyExercise` from `myExerciseBuild.ts`, never from the store.

## The words

`session.myExercises.*`: title, intro, `shape.<shape>` templates ({{root}} {{scale}} / {{chord}} / {{position}} /
{{string}}), `direction.<dir>`, `line`, `bars` (plural), remove, removeLabel, removed, undo, cantBuild, howTo.
Scale names reuse `scale.*` (jam.json); the arpeggio's chord is a symbol (Am7), the same in every language;
tempo and Play reuse `session.paths.tempoRange` / `playThis` / `playedClean`. Fifteen locales by sonnet helpers;
helpers' doubts: es / pl / tr / vi wording of "the box", fr follows the file's "vous", ko's {{what}}을(를).

## Gates (logs under `/tmp/coach-t2b/`)

- tsc: pass (coach-t2b-tsc-4).
- vitest named (store, list, runner, parity, PathsView): 265 passed (coach-t2b-vt2). Full `npm run test` after the
  split (coach-t2b-vitest-2, `vitest.log`): 47,934 passed, 420 of 421 files; the one file is the known
  `TabStage.render.test.tsx` (symlink).
- `npm run build`: pass.
- Layout (`layout.log`): `my-exercises`, `paths-prereq`, `phone-learning`, `short-window`: 317 passed, 1 failed
  (the 1 px footer above; passes alone). Port 7777 (the checkout's derived port) is held by an unrelated python
  service on the DGX: runs used `YAMES_LAYOUT_PORT=7471`.
- Pictures (`YAMES_SHOT_DIR=/tmp/coach-t2b/shots`): `paths-mine-{1440,390}-{ember,manuscript}.png`,
  `paths-mine-{1440,390}-ember-de.png`.
- Not run: the full layout suite (the orchestrator's); `test:rust` (no Rust changed).
