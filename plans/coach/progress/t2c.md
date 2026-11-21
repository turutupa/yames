# t2c: `make_exercise` with its preview (English half)

Branch `coach-t2c`. Brief `plans/tasks/coach/t2c-make-exercise-tool.md` (items 1 to 3, English).

## State

WIP: tool, host door, Ask preview, router recipe words written; tests and gates next.

## What landed (so far)

| File | What |
|---|---|
| `src/coach/tools/make.ts` (new) | `make_exercise` (confirm) and `undo_make_exercise` (app-only, its Undo); the lazy generator holder. |
| `src/session/myExerciseDoor.ts` (new) | The host's door: add / undo-add through `updateMyExercises` only. |
| `src/session/myExerciseWords.ts` (new) | `myExerciseLine` moved here (light), re-exported from `myExerciseBuild.ts`. |
| `src/containers/coach/MakeExercisePreview.tsx` (new) | The preview: line, notes on a small neck, first note, source. |
| `src/coach/tools/host.ts` | `addMyExercise`, `undoAddedExercise`. |
| `src/coach/tools/types.ts`, `run.ts` | `Proposal.preview`, `ToolDone.next`; `mint` copies `preview`. |
| `src/containers/coach/askTools.ts`, `AskToolTurn.tsx`, `toolWords.ts` | Generator load before a make call; older make proposals retired; settled refusal retires the Undo; Undo's `later`. |
| `src/coach/ask/commandTable.ts`, `router.ts`, `commands/en.json` | `recipe` word group, validator; `recipeCall` (verb and bare). |

## Owed

- "Hear it" chip: not built (see report).
