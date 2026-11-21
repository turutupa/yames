# Leg c4a1b: the review fixes for c4a1

Branch `coach-c4a1` (the same worktree as c4a1), logs in `/tmp/coach-c4a1b/`. Work list:
`/tmp/coach-orch/c4a1-review.md` (MERGE AFTER FIXES: M1, M2, L1 to L7).

## What changed, finding by finding (each with a test that fails without it)

| Finding | Fix | Test |
|---|---|---|
| M1: a `coach.cards` / `coach.suppressed` write before the load wiped the other entries | The four map writers go through `writeMap`: before the load the press is queued (shown in memory at once), replayed in order onto what the load reads, and the map saved then. `saveUnsuppressed` / `saveCardAsked` before the load are queued the same way and act on what is on disk. Every writer returns `Written` (`saved` / `queued` / `unchanged` / `notRead`) so the caller can say what happened. A map key whose read failed is never written over (`notRead` after the load; an early press is kept in memory only). | `store.test.ts`: "a dismissal and a leave-out before the load are replayed onto what is on disk, not over it"; "an undo of a leave-out and an asked card before the load act on what is on disk"; "a press before the load that changes nothing on what is read writes nothing"; "a map key that could not be read is never written over" |
| M2 (orchestrator's decision) | `saveCardShown`, `withCardShown` and `CardRecord.lastShown` removed. An older record's `lastShown` is not read back. | "stores no \"last shown\"" |
| L1: `tooFewTakes` beside a noticed line | `tooFewTakes = noticed.length === 0 && playedOf(rows).length < MIN_TAKES`: fewer than five Takes played (what Progress counts), so no line can exist. | `tendencies.test.ts` notebookFrom: the fixture that asserted `tooFewTakes: true` beside a line now asserts false; "\"too few Takes\" only under five Takes played, and never beside a noticed line" |
| L2: "your last N Takes" said more than was counted | The English now says "{{hits}} of the {{count}} most recent Takes where it could be measured" (place lines: "with such bars where it could be measured", "of it where ..."). `verdictOf`'s comment defines "could be measured" as exactly the code's set: in the window (not marked not fair, not `mine`), graded, heard, a lean of two bars or more, and for a place line a bar with and a bar without. | "counts only the Takes where the lean could be measured, and names exactly those" (ungraded, unheard, not-fair and one-bar Takes in between are not counted); `notebookStrings.test.ts` "says which Takes it counted" |
| L3: minutes left out played Takes; 2 Sessions against 2 | `minutesLine` reads `playedOf(rows)` (the 500 newest, nothing filtered): the same Takes and the same length rule as Progress's `totalsFrom`, a Take marked not fair and one on `mine` included. `MIN_SESSIONS` 4 → 6 (three against three). The sentence says "minutes played in Takes". | "needs 6 Sessions, three against three"; "counts the minutes Progress counts, a Take marked not fair included" (compares with `totalsFrom`); the ungraded fixture moved to six Sessions |
| L4: undoing a second goal re-dated the first | `saveGoal` remembers the goal it replaced; the same text put back gets that goal's own date. | `store.test.ts` "putting back the goal a new one replaced brings back its own date"; the host test checks the date on disk after `set_goal`'s undo |
| L5: a failed read of `coach.goal` read as "no goal" | Per-key read failures (`coachStoredUnread`). `coachGoalKnown()` is false before the load and after a failed read; the host's `goal()` / `setGoal` answer `notWiredYet` (set_goal says "not yet", nothing written), and `saveGoal` refuses too. The same for `coachSuggestions` (no proposal "from" a value nobody read); `saveSuggestions` itself stays allowed (a whole value the player chose). | `store.test.ts` "a goal that could not be read is unknown"; "before the load, the goal is not known and is not written"; host test "a goal whose read failed is unknown" |
| L6: the hook test's pre-load check was conditional | The hook test mocks `ipc`'s `storeLoad` / `storeSave` with an in-memory store whose reads can be held; the pre-load assertions are unconditional. | `useCoachToolHost.test.tsx` "the goal and Suggestions wait for the coach's keys to be read" |
| L7: dates in the future kept a card or line held | `readCards(raw, now)` / `readSuppressed(raw, now)` clamp a date after `now` to `now` (the load passes the time of the read). The file is not rewritten; the next press on that key writes the clamped map. | "a dismissal dated in the future reads as the moment it was read"; "a line left out at a date in the future..."; "a date in the future on disk reads as now and the file is not rewritten" |

## Decisions

- **For c4b2: "a card was shown" lives in memory only** unless the owner says otherwise. The coach stores nothing
  the player did not press; nothing read `lastShown`. "One card per app open" is an in-memory flag by nature.
- `tooFewTakes` means "fewer than five Takes played". Five or more with nothing noticed is the other empty state
  ("nothing noticed yet"), c4a2's to word.
- Minutes count every played Take, `mine` included, because that is what Progress shows for the same Sessions
  (`totalsFrom` reads `session.progress.takes` unfiltered). The measured lines still never read `mine` or not-fair
  Takes.
- The goal's undo is recognised by text: putting back, in the same run, the exact text the last `saveGoal` replaced
  restores its date. A player who types that same text again by hand straight after gets the old date too; that is
  the same goal.
- `src/coach/tools/settings.ts` (an Ask file, c2b1c / t1b2d's tonight) was not touched: L4 is fixed in the store.

## For c4a2 and c4b2

- The writers now return `Written`. `"queued"`: shown, saved once the load finishes. `"notRead"`: nothing changed;
  say the coach could not read its notes this time. `"unchanged"`: nothing to do.
- No `saveCardShown`. The goal offer: Not now is `saveCardDismissed("goal", now)`.
- `coachGoalKnown()` before showing "your goal" as absent: false means unknown, not none.
- `readCards` / `readSuppressed` now take `now`.
- Strings: the lean / place / minutes sentences changed (English in all fifteen files, still c4a2's to translate).

## Merge of `coach`

`git merge coach` (c4b1 and the rest) went through without a conflict; `manifest.json` auto-merged. Regenerated
with `UPDATE_PARITY_MANIFEST=1` on `surface.test.ts` (job `coach-c4a1b-parity`): no change, and it holds both sides
(c4a1's four `coach.*` settings keys; `list_clean_tempo_spans` / `listCleanTempoSpans` from `coach`). After the merge
`totalsFrom` lives in `src/session/totals.ts`; the minutes line now sums with it directly, so it cannot drift from
Progress.

## Gates (logs: `job logs <name>`; the full vitest log at `/tmp/coach-c4a1b/vitest.log`)

- `npx tsc --noEmit`: pass (`coach-c4a1b-tsc`, after the merge `coach-c4a1b-tsc-2`).
- The five touched test files: 213 pass (`coach-c4a1b-vt1`).
- `npm run test` (full, after the merge): 48083 pass, 1 fail, in 421 files (`coach-c4a1b-vitest`). The failures:
  the known `TabStage.render.test.tsx` (not loadable through the linked `node_modules`), and one
  `ToolCoach.test.tsx` case ("after Listen goes off ...": the rendered body was empty), a file this leg does not
  touch; re-run alone it passes 11 of 11 (`coach-c4a1b-vt-toolcoach`): a flake under load.
- `npm run build`: pass (`coach-c4a1b-build`).
- No layout run: no screen or stylesheet changed.
