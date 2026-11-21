# t2cc: the fixes from the second read of t2cb (`/tmp/coach-orch/t2cb-review.md`)

Branch `coach-t2c`, worktree `/home/dgx-delgado/yames-coach-t2c`, logs `/tmp/coach-t2c/`.

## Done (each with a test that fails on the code before it)

- **MEDIUM 1**: `coachTools.make.undoLeft` now says what is true: "The Undo ended when you left the
  screen this was added on. To take it out, use Remove on My exercises in Paths." (English, all
  fifteen `coachTools.json`; t2d translates). `askMake.test.tsx` asserts it, that "stayed" is gone,
  and that going back to Today brings no Undo back.
- **LOW 4**: `pressUndo` returns unless the Undo is `live` (`askTools.ts`): a second press while
  `settling` no longer writes `gone`, and a press after `done` no longer overwrites it. Test: presses
  twice while settling, once after the answer.
- **LOW 5**: `validateCommandTable`: every `recipe.article.words` entry must also be in `fillers`.
  Test: the English table without "a" in its fillers fails with that sentence.
- **LOW 6**: `why.make.undo.unreadable` is now "My exercises couldn't be read just now, so nothing
  was taken out." (all fifteen files, English). Trace: `undoAddedRecipe`
  (`src/session/myExerciseDoor.ts`) returns `unreadable` only when `updateMyExercises`
  (`src/session/myExercises.ts:259`) does, and that is only `state !== "read"` after the load (a
  failed read, or a stored value that is not a list), checked before `fn` runs and before any
  `storeSave`. So nothing was written in every such case: "nothing was taken out" is true. (A
  rejected promise is the `failed` sentence, not this one.) Test in `askMake.test.tsx`.
- **LOW 3**: added only "minor blues" to `rootBefore` (the exact parallel of "minor pentatonic";
  the preview names A before the press). Left out "7", "dominant 7", "dominant seventh",
  "seventh": "make a seventh arpeggio" / "a dominant 7 arpeggio" read as the article and a quality,
  so A would be a guessed key. Those three lines are in `KEYLESS` (the tool asks which key).
- **LOW 2**: `trailingKey` in `router.ts`: when the scale or chord had no key, or "a" was read as A
  only through `rootBefore` (now `"guess"` from `articleOrRoot`), a line ending in
  "in <root>" (a `rootAfter` word that is also a connector; English: "in") takes that root. "make a
  minor pentatonic exercise in e" is E minor pentatonic. Only at the end of the line and a lone
  root: "in e minor", "in e at the 5th fret", "on e", and a second key ("make a c major exercise
  in e") stay `none`. A table without `article` has no `rootAfter`, so other locales are unchanged.

Every new test was run against the old sources (put back from `HEAD~1` for the run, then restored):
11 failed, as they should (job `coach-t2cc-vbefore`, `/home/dgx-delgado/scratch/jobq/1034-*.log`).

## Commits and gates

`18ed6d83` (the fixes), a whitespace commit, then `merge coach` (lf1, c4b2 and the rest: clean, no
conflicts). Diff of the two commits: `/tmp/coach-orch/t2cc-fix.diff`.

Gates after the merge (logs `/home/dgx-delgado/scratch/jobq/<id>-<name>.log`):
- tsc: pass (1035).
- `npm run test`: 470 of 471 files, 50571 tests pass; the one failing file is the known
  `TabStage.render.test.tsx` that cannot load through the symlink (1036).
- build: pass (1037).
- layout, ask + ask-tools + ask-typed: run 1 (1038) 8 timeouts and run 2 (1063) 10 timeouts, all
  30 s timeouts at load average 43 to 47 (other legs' suites). Every test passed in one run or the
  other except `ask-tools:99` ember 1024. `ask-tools.spec.ts` alone with `--workers 2` (1071): 19 of 19
  pass. ask.spec and ask-typed: all passed in run 2.
