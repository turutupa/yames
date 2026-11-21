# int1: coach-t2b, coach-c2b1b and coach-c4a2 onto coach (after chip1)

Worktree `/home/dgx-delgado/yames-coach-int1`, branch `coach-int1`, logs `/tmp/coach-int1/`.

## Merges

| Commit | Branch | Conflicts |
|---|---|---|
| `f5e8959a` | coach-t2b | none (`useSessionRun.ts` and the parity manifest auto-merged) |
| `8fc562fd` | coach-c2b1b | `AskPanel.tsx`, imports only |
| `ca32da79` | coach-c4a2 | `AskPanel.tsx` and `useAskHost.ts`, imports only |

### How each conflict was resolved

- **c2b1b, `AskPanel.tsx`**: the `./askCards` line from c2b1b (with `typedCardAnswerer`), the
  `./askTools` line from chip1 (`noKeyRepeat, onePress, pressChip`). c2b1b's `runAskCall` import is
  dropped because nothing in the panel calls it any more: chip1 routes the chip row through
  `pressChip`. The `setAskNextAnswerer` widening and c2b1b's one `useEffect` auto-merged.
- **c4a2, `AskPanel.tsx`**: c4a2's `./askStore` line (`askDraft, keepAskDraft, setAskTab, AskTab`),
  then c4a2's `./Notebook` import, then `./askTyped` with c2b1b's `setAskNextAnswerer` kept.
- **c4a2, `useAskHost.ts`**: c4a2's `registerNotebookSource` import from `./askStore`, then chip1's
  `./askTools` line whole (`noteAskLoad, noteAskTake, noteAskToolView, noteAskUndos,
  registerAskToolContext`).

### Auto-merges read after the c4a2 merge

- `AskPanel.tsx`: the tab strip in the head, the Notebook as the body on its tab, `AskFooter({tab})`,
  the draft from `askDraft` kept by `keepAskDraft`, the card answerer's effect (plugged on mount,
  unplugged by its return), the chip row's `onePress(pressChip)` / `noKeyRepeat` handlers: all present.
- `useAskHost.ts`: every chip1 effect (`noteAskTake`, `noteAskUndos` with `askShownOn(view)`, the
  loop-start effect, `noteAskLoad`) and c4a2's `registerNotebookSource` with
  `inRun = s.run.phase !== "idle"` (the run's phase alone).
- `run.ts`: `runCoachUndo` keeps chip1's jam-take backstop (refuse `notNow`, Undo kept) before c4a2's
  `undoDepth` bracket around `runIssuedUndo`; `coachUndoRunning()` exported.
- `useCoachToolHost.ts`: chip1's `jamTakeRunning` / `speedRampRunning` inputs and effects, and c4a2's
  `setGoal` passing `{ restore: coachUndoRunning() }`.
Nothing an auto-merge got wrong was found.

## Follow-ups

1. `src/coach/ask/cards.ts` `markedNotFair(row)` now returns `isMarkedNotFair(row)` from
   `src/session/progress.ts`; the test "the one fairness rule" checks the two agree row for row.
2. Own-exercise Takes: the Notebook reads `tendencies` / `windowOf`, which already leave out
   `CUSTOM_PATH_ID` (measured lines; `playedOf` counts them for minutes, as Progress). The history
   cards (`noteOf`, `whatChanged`, `improving`) read `takesOf(progress, pathId, exerciseId)` only, so
   a pack Exercise's history never holds an own-exercise Take: the filter was in effect, not missing.
   Two tests pin it (`cards.history.test.ts`: a custom Take is never "the one before"; custom Takes
   are not in "am I improving"'s window nor counted as left out). **Decision**: a Take of an own
   exercise is still compared with that same recipe's Takes (its id is the recipe's key, so the
   Takes are of identical music); declining there would need a new sentence in fifteen locales. If
   the orchestrator wants those cards silent on own exercises, that is a small follow-up.

## Gates

All after the follow-ups commit `6f2ccadd` (job logs under `/home/dgx-delgado/scratch/jobq/`):

- `npx tsc --noEmit`: pass (`coach-int1-tsc` on the c4a2 merge, `coach-int1-tsc-2` after the follow-ups).
- `npm run test`: 49812 passed, 11 skipped; 449 of 450 files; the one failed file is the known
  `src/containers/songs/TabStage.render.test.tsx` (cannot load through the `node_modules` symlink).
  `coach-int1-test`, `/tmp/coach-int1/test.log`.
- `npm run build`: pass (`coach-int1-build`).
- The choice grammar and the parity manifest: their tests pass in the full run, so neither was
  stale; not regenerated, and `npm run test:rust -- choice_grammar` not needed (fixture unchanged).
- Layout, the twelve named specs (`--lock coach-layout`): 426 passed, 52 skipped, 0 failed (`coach-int1-pw`).
- Owed: `smooth.spec.ts` and the full layout suite (the orchestrator's quiet run).
