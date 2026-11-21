# t2cb: fixes to t2c (`make_exercise`) from the review (`/tmp/coach-orch/t2c-review.md`)

Branch `coach-t2c` (same worktree). Logs and messages under `/tmp/coach-t2cb/`.

## Fixes

| Finding | Fix | Test |
|---|---|---|
| MEDIUM 1, typed matcher | `recipe.shapes.box` loses "shape" / "pattern"; `recipe.fret` loses "position #". Without a verb, a shape or a fret is no longer "the exercise word" (a subdivision, a bars count or "exercise" is). New `recipe.article` group: the letter "a" is the root only after `rootAfter` ("an", "the", "in") or before `rootBefore` ("minor pentatonic", "major pentatonic", "minor 7", "major 7", ...); before a later root it is the article; otherwise the key was never said and the call goes without `root`, so the tool answers `why.make.root`. "pentatonic" alone stays `minorPentatonic`: the same scale table `show_scale` reads ("show me c pentatonic" is C minor pentatonic). | `recipe.router.test.ts`: the near-miss list (every review example), `KEYLESS` (→ `why.make.root`, nothing stored), "what a player types to SEE a scale" (show_scale or nothing) |
| MEDIUM 2, the door untested | `src/session/myExerciseDoor.test.ts` on the mocked store | add+undo; already+undo leaves the older; hand Remove then undo: gone, no write; same key other date; add and undo back to back before the read |
| MEDIUM 3, the chip | Chosen: label "Open Paths" (`coachTools.make.openPaths`), offered only outside a Session, not on Paths' list, and not when Paths keeps a Path's page (`pathsChipHere`). The `movePaths` + scroll alternative needs a new player tool or a `go_to` argument (grammar budget) and a scroll target in PathsView: not small. The add's Undo is retired by the move as before, but the receipt now says so: `coachTools.make.undoLeft` ("The Undo stayed on the screen this was added on. To take it out, use Remove on My exercises in Paths."). | `make.test.ts` "the chip is 'Open Paths' ..."; `askMake.test.tsx` "Open Paths goes to Paths; the receipt says ..." |
| LOW 4, "Undone." early | Undo state `settling` (the note "Taking it back out…", no "Undone.") until the store answers; the add's Undo hidden (and `pressUndo` a no-op) while the receipt settles. | `askMake.test.tsx` "no Undo before the store kept the add ..." |
| LOW 5, failed load | `lastLoadFailed`: after a failed import the tool says `why.make.loadFailed` ("The app couldn't load the exercise maker, so nothing was made."); the next call still tries the load first. | `make.test.ts` "a generator that will not load ..." |
| LOW 7, followLater's rule | Scoped: `UNDO_AFTER_LATER` (only `undo_make_exercise`) in `askTools.ts`; `ToolDone.later`'s doc says how a next tool joins it. | covered by the settling test |
| LOW 6, "Hear it" | Not built (no door plays an Exercise outside a Session). Owed: its own card. | - |

## For t2d (to translate)

- `commands/<lng>.json` `recipe`: `shapes.box` no longer has "shape" / "pattern"; `fret` no longer has "position #"; the new optional `article` group (`words`, `rootAfter`, `rootBefore`) is only for a language whose article is also a root letter (English "a"; check Portuguese "a", Italian/Spanish "a" as a preposition before a root).
- Locale keys new in all fifteen (English in the fourteen until t2d): `coachTools.make.openPaths` (replaces `openList`), `coachTools.make.undoLeft`, `coachTools.why.make.loadFailed`.

## Gates

After `merge(coach): into coach-t2c` (conflicts: `askTools.ts`, where `runAskCallAs` and coach's `modelCallBody` / Take listeners were both kept; `AskToolTurn.tsx`, where the proposal shows the model's "reading" line, then the preview). The grammar fixture regenerated with `UPDATE_CHOICE_GRAMMAR=1`: no change. Choice prefix: 1,342 tokens (tools and format 1,095 of 1,100; the 7 cards 245).

- tsc: pass (coach-t2cb-tsc-2).
- vitest full (coach-t2cb-test): 50,502 passed, 10 skipped; 1 file failed: the known `TabStage.render.test.tsx` (node_modules symlink). Training-file and held-out tests pass with `make_exercise` in the registry.
- build: pass (coach-t2cb-build).
- Rust precheck `the_generated_choice_grammar_passes_the_precheck`: ok (coach-t2cb-rust-gbnf).
- layout `ask`, `ask-tools`, `ask-typed` (port 7495, lock coach-layout): 39 passed (coach-t2cb-layout).

A model call to `make_exercise` (coach's `modelCallBody`) does not wait for the generator as a typed one does: before the first load it is refused ("loading") and the rule-made answer stands.
