# c4a2b: the review fixes for c4a2 (Notebook, goal, Suggestions row)

Branch `coach-c4a2` (worktree `/home/dgx-delgado/yames-coach-c4a2`), `coach` merged in first (clean merge).
Work list: `/tmp/coach-orch/c4a2-review.md` (MERGE AFTER FIXES). Logs in `/tmp/coach-c4a2b/`.

## Findings and their tests

| Finding | Fix | Test (fails without the fix) |
|---|---|---|
| M1 | `useAskHost.ts`: `inRun = s.run.phase !== "idle"` (no view test) | `useAskHost.test.tsx` "the Notebook's source": a running Session on Today passes its start; the Notebook rendered from the host shows the session note, only the Take before it, no goal question |
| M2 | `tendencies.ts`: `OWN_EXERCISES_PATH = CUSTOM_PATH_ID` (`"my-exercises"`); not-fair through `isMarkedNotFair` | `tendencies.test.ts` "never reads the player's own exercises (CUSTOM_PATH_ID)", including a mixed history whose numbers and count stay the Path Takes' |
| L1 | `Notebook.tsx` `useMounted()`: set true in the effect body | `Notebook.test.tsx` "under StrictMode the Undo still expires…", "Not now whose save does not land…" (StrictMode) |
| L2 | `store.ts`: `followSave` for `goal` and `suggestions`, `coachPressSettled` takes them; Notebook follows Undo and Save; Suggestions row follows its press | store "a goal or a Suggestions choice that could not be saved…"; Notebook "an Undo whose save does not land…", "a goal whose save does not land…"; row "a press whose save does not land says so…" |
| L3 | `saveGoal(text, now, { restore })`; `run.ts` `coachUndoRunning()` (true only inside `runCoachUndo`); the host passes it | store "a replaced goal typed again (not an Undo) is dated now"; `useCoachToolHost.test.tsx` "a goal typed again (not an Undo)…"; the undo-undo tests still pass |
| L4 | `askStore.ts` `askDraft` / `keepAskDraft` (memory, no listener); `AskConversation` starts from it | Notebook "a question typed and not sent is still there after a visit to the Notebook" |
| L5 | each left-out line keeps its own row (same height, read once at the press) and Undo, in its first-shown place | Notebook "a second Leave out keeps the first line's Undo…"; layout `notebook.spec.ts` (Undo where Leave out was, next line unmoved) |
| L6 | load: a malformed entry in a readable map is CLOSED in memory (card: dismissed twice; line: left out); `mapForDisk` writes any entry nobody pressed exactly as read (closed, future-dated, expired); `withSuppressed` no longer prunes | store "a malformed entry reads as dismissed…", "a press on one line leaves every other entry…", "leaving a line out keeps the ids whose thirty days are over" |
| L7 | the tests above; expiry writes nothing; notRead / notSaved on screen (notRead reached through a store mock: the screen cannot reach it by itself); the test host's `setGoal` throws like the real one | as listed |
| L8 | evenness averaged over the Takes counted, not per-Exercise means | tendencies "the percentages are the mean over the Takes counted…" (81, not 78) |
| Leave out glyph | the words "Leave out" as a quiet text button (36 px desktop, 44 px in the sheet), no bin | Notebook "Leave out is the words, not a bin icon"; `notebook.spec.ts` phone test |

`shownCleanTempoOf`: nothing in `tendencies.ts` quotes a clean tempo (the tempo-played line quotes tempos played), so there is nothing to switch.

No English changed (every sentence used already existed), so no locale work.

## Decisions

- L2's goal: the runner's receipt ("Goal kept") stays, with its Undo, and "This holds until Yames closes: it could not be saved." is shown under it in the Notebook when the save fails. The receipt in Ask's thread is the runner's (c2b1b / chip1 files) and is not changed.
- L6: a press on a closed card counts from "closed" (dismissed 2 → 3). Unreachable from any screen (the card is not shown).
- Expired suppressions now stay on disk for good (the list can grow by one entry per line ever left out; a few dozen ids at most).

## Gates

- `npx tsc --noEmit`: pass (`coach-c4a2b-tsc`).
- Named vitest files (store, tendencies, Notebook, useAskHost, useCoachToolHost, CoachSuggestionsRow, AskPanel): 164 pass (`coach-c4a2b-vt1`).
- `npm run test`: 49218 pass, 10 skipped, 436 of 437 files; the one failed file is the known `TabStage.render.test.tsx` (`coach-c4a2b-vitest`, `/tmp/coach-c4a2b/vitest.log`).
- `npm run build`: pass (`coach-c4a2b-build`).
- Layout, the eight named specs: 192 pass (`coach-c4a2b-pw`); after the last CSS touch (the left-out sentence centred), `notebook.spec.ts` again: 9 pass (`coach-c4a2b-pw2`). The full suite is the orchestrator's (owed).
- Pictures: `/tmp/coach-c4a2b/shots/notebook-*.png` (`notebook-ember-1440.png`, `notebook-ember-left-out.png`, phone).
