# Leg t2b: the recipe store, "My exercises" on Paths, playing one (R)

Worktree `/home/dgx-delgado/yames-coach-t2b`, branch `coach-t2b`. Logs under `/tmp/coach-t2b/`.

PLAN's t2, second leg. **Needs t2a merged.** **R**: it adds a stored key and saves Takes of a custom
Exercise; any change to `useSessionRun.ts`'s runner or the SQLite path is read by the orchestrator's
reviewer before merge. It touches no Ask file: it may run beside the card legs, not beside a leg that
edits `PathsView.tsx` (none is briefed now; check `git worktree list`).

Read first: `plans/coach/progress/t2a.md` (`Recipe`, `buildCustomExercise`, the id rule, the `why`
values), `t1a2.md` (`play_exercise`: how it resolves and calls `actions.playExercise(path, step,
exercise)`; `resolveExerciseCall`), `c4a1.md` if merged (how the coach's keys were added to the
manifest: do the same). Design, read-only: `TOOLS.md` 2.4 ("stored as a recipe, not the notes";
"played, looped, added to Today as a chosen part, graded on timing and notes heard with default pass
marks; not part of any Path and passes nothing"), `DESIGN.md` 13 ("My exercises"), 9.5 (no new SQLite
table); mock `17`.

## What to build

1. **The store**: recipes in the settings store under one key (`myExercises` is the suggestion: a list
   of `{ recipe, name?, addedAt }`, at most fifty; say what you chose), a typed reader and writer, the
   key in the settings manifest (`src/test/parity/surface.test.ts`). A recipe that no longer builds
   (a generator change) is kept and shown as "can't be built any more", never dropped silently. A
   missing or malformed value reads as empty (tests). **Removing one is the player's own control on
   the list with an Undo; the coach never removes** (deleting stays a never-tool).
2. **"My exercises" on Paths**: a section on the Paths screen (after the player's Paths; empty: not
   shown at all), each row the recipe's summary sentence and its tempo, a Play button, a Remove control.
   Theme tokens, tonal buttons, 44 px targets on a phone. The words come from locale templates filled
   from t2a's `summary` (never a sentence stored with the recipe).
3. **Playing one**: Play starts a Session on the custom Exercise as `play_exercise` does for a pack one,
   through an in-memory one-Step Path document built from the recipe (read whether `playExercise`
   takes it as it is; if the runner must change, keep the change minimal and name it for review).
   Loop works as on any Exercise. **Grading follows `session.grading`** as everywhere (never turned on
   by this). **Its Takes**: decide with the code in front of you, and write it in the progress file: the
   default is to save them like any Take with a reserved Path id (`mine`, never a pack id) so the clean
   tempo is kept, and to leave `mine` out of Path standing, Path totals, Today's plan and tendencies
   (each a test). If saving them needs a schema change, do not: save nothing and say so.
4. **Strings**: the section's words in fifteen locales (sonnet helpers, `plans/COACH_I18N_BRIEF.md`):
   few keys (title, the summary template per shape, Play, Remove, its Undo, "can't be built any more").
5. **Layout**: Paths with two custom Exercises at 1440 and on a phone, Ember and Manuscript, one in
   German; the empty case shows nothing. Pictures only when `YAMES_SHOT_DIR` is set.

## Not yours

The generator (t2a). The `make_exercise` tool, the preview in Ask, the variant chips, Today's part (t2c).

## Gates

tsc, vitest (parity suites included), build; layout by name: the Paths specs (grep `tests/layout` for
the Paths screen's), `phone-learning.spec.ts`, `short-window.spec.ts`, your scenes; `npm run test:rust`
only if Rust changed (it should not). The full layout suite is the orchestrator's.

## Report

As the rules block's "The end of the leg": the key's name and shape, where Takes go and what leaves them
out, the screenshot paths, and a "diff for review" paragraph (the store, `useSessionRun.ts`, anything
that saves a Take).
