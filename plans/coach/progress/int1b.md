# int1b: review fixes on coach-int1 (t2bb and c2b1b reviews)

Worktree `/home/dgx-delgado/yames-coach-int1`, branch `coach-int1`, logs `/tmp/coach-int1b/`. Base `7c829a11`.

## t2bb review (`/tmp/coach-orch/t2bb-review.md`)

1. MEDIUM, the "full" Undo notice: `restoreMyExercise` counts the store's entries (shown or not,
   `myExercisesStoredEntries()`) against `max(50, entriesBefore)` kept by `removeMyExercise`, so an Undo
   always gives back the place its Remove freed (sequence B now undoes); only an Add since the Remove
   refuses it (sequence A). Then the Undo goes and the notice says only "My exercises is full (50), so
   Undo can't put this one back." Tests: `myExercises.test.ts` "entries past the fifty shown stay in the
   store, and an Undo gives back the place its Remove freed", "an Add since the Remove filled the list";
   `MyExercises.test.tsx` "an Undo refused as full says only that, and goes".
2. LOW, order beside an unread row: `rowsFor` remembers the unread rows that followed a removed row
   (`followersOf`) and puts them back behind it on Undo. Test: "Undo puts an unread row that followed
   the removed one back behind it".
3. LOW, `planner.ts` `let warmup =focusClean`: space added.

## c2b1b review (`/tmp/coach-orch/c2b1b-review.md`)

1. `historyOf` in `cards.ts`: one variant's Takes (`variantIndex`, the seed modulo the count), the others
   counted with `history.otherNotes`; `changed.noneAlike` when only other-variant Takes came before.
2. `improving.even` names each figure's tempo and says "the oldest/newest of those".
3. `match.ts`: improving + a named metric -> `why_not_counted {what}`; "I feel" is not the metric.
4. `match.ts`: IMPROVING_HOW, DISTANCE's off/away needs "pass", A_BAR for CHANGED, CHANGED_OTHER widened,
   DISTANCE reads `passThis`.
5. Unnamed checks: `made.unnamed`, `distance.unnamed`; intro counts them.
6. `made.clean` reworded; `distance.short.*` plural on `count`; `distance.under.*`; `improving.cleanUnknown`;
   `notNow.notSaved`.
7. `askTyped.ts`: the next answerer is a stack.

## State

- Code, English and the fourteen locales: committed (sonnet helpers, spec `/tmp/coach-int1b/i18n-spec.md`).
  ko says 버전 and de Version for "version of this Exercise" (the others: a variant word).

## Gates

- `npx tsc --noEmit`: pass (`coach-int1b-tsc`).
- `npm run test`: 49917 passed, 11 skipped, 449 of 450 files; the one failed file is the known
  `TabStage.render.test.tsx`; one vitest RPC timeout ("onTaskUpdate") under load (`coach-int1b-test`).
- `npm run build`: pass (`coach-int1b-build`).
- Layout, six named specs: `coach-int1b-pw-2` 56 passed, 3 timed out in the first worker batch while the
  full vitest run and the build ran beside it; those two specs re-run alone (`coach-int1b-pw-3`, 4 workers):
  23 of 23 passed. (`coach-int1b-pw`, run while the helpers edited locale JSON under the dev server: void.)
