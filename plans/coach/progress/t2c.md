# t2c: `make_exercise` with its preview (English half)

Branch `coach-t2c`. Brief `plans/tasks/coach/t2c-make-exercise-tool.md` (items 1 to 3, English). t2d does the
fourteen recipe word lists, the translations, Today's part and the scenes.

## What landed

| File | What |
|---|---|
| `src/coach/tools/make.ts` (new) | `make_exercise` (confirm) and `undo_make_exercise` (app-only, its Undo); the generator loaded on first use (`loadExerciseGenerator`), never in the shell. |
| `src/session/myExerciseDoor.ts` (new) | The host's door: add / undo-add through `updateMyExercises` and t2b's `addMyExercise` / `removeMyExercise` only. |
| `src/session/myExerciseWords.ts` (new) | `myExerciseLine` moved here (light: types only), re-exported from `myExerciseBuild.ts`. |
| `src/containers/coach/MakeExercisePreview.tsx` (new) | The preview: the line, the notes of one pass on a small neck (first note marked), "Starts on A: string 6, fret 5.", "Worked out by the app". |
| `src/coach/tools/host.ts`, `useCoachToolHost.ts` | `addMyExercise(recipe, addedAt)`, `undoAddedExercise(key, addedAt)`. |
| `src/coach/tools/types.ts`, `run.ts` | `Proposal.preview` (`ExercisePreview`), `ToolDone.next`; `mint` copies `preview` (one line). |
| `src/containers/coach/askTools.ts` | A make call waits for the generator; a new make proposal retires the open one (`dismissProposal`, "expired"); a receipt that settles as a refusal retires its Undo; an Undo's `later` settles its note; `next` carried. |
| `AskToolTurn.tsx`, `toolWords.ts`, `ask.css` | The preview and "what is graded" above the buttons, the variant chips, the receipt's `next` chips; `what` for the receipt. |
| `src/coach/ask/commandTable.ts`, `router.ts`, `commands/en.json` | `recipe` word group (shapes, chords, subdivisions, fret places, number suffixes) and its validator; `recipeCall` after the `make` verb and as a bare form. |
| `choice-grammar.gbnf` | Regenerated (`UPDATE_CHOICE_GRAMMAR=1`). |

## Decisions

- Arguments: `shape?`, `root?` (ROOT), `scale?` (SCALE), `chord?`, `position?` 0-15, `subdivision?` 1-4 (notes per
  beat), `bars?` 1-8. No `direction`: the choice prompt went to 1124 tokens of 1100 with it and an enum
  subdivision; up-and-back is the default (mock 17, and the one that loops).
- Defaults: eighths, up and back, the root's fret, the fewest bars one pass fits. With no fret named and the
  root's fret not holding the shape (an arpeggio from 5 runs off the neck), the nearest fret that does: a default
  the preview shows. A fret that was named is built or refused, never moved.
- The Undo is an app-only tool that takes out the entry with this recipe key AND this date; the host member is
  `undoAddedExercise` (not a delete: reached only through the issued Undo).
- "Open My exercises" is `go_to paths`, offered only when Paths is not already showing its list.
- "Hear it" not built: no door plays an Exercise outside a Session (the Watch demo is the Session's); it needs one.

## Gates (logs `/tmp/coach-t2c/`)

- tsc: pass (coach-t2c-tsc-4, on the last commit).
- vitest, full (coach-t2c-test, `vitest.log`): 50,260 passed, 3 files failed: the known `TabStage.render.test.tsx`;
  `i18n.songs-wave` plural forms (mine: fixed after, see below); `useSessionRun.listen` "plays the demo song" under
  load. After the fix: songs-wave, locales, listen, tendencies, myExercises 83 of 83 (coach-t2c-vt-3). Named
  Ask/tools/session suite before it: 3,443 passed (coach-t2c-vt-2, `vt2.log`).
- build: pass (coach-t2c-build-2). The generator is its own chunk now (`custom-*.js`, 100 kB; main 6,588 -> 6,488 kB).
- layout `ask.spec.ts` + `ask-tools.spec.ts`, `YAMES_LAYOUT_PORT=7493`: 37 passed (coach-t2c-layout-2,
  `layout2.log`). The first run (port 7471) was void: "something else answered" on the port, goto timeouts.
- Rust precheck of the regenerated grammar: `the_generated_choice_grammar_passes_the_precheck` ok (coach-t2c-rust-gbnf).
- Held-out eval, rules only: `coach-eval.mjs rules` summary identical on `coach` and here (`rules-coach/`, `rules-t2c/`).
