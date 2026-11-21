# nf1b: the review fixes for nf1, and Today's line said once

Branch `coach-nf1` (the same worktree as nf1), merged with `coach` (hd1, c2ca, the typed
commands). Work list: `/tmp/coach-orch/nf1-review.md` (M1, M2, L1 to L4). Logs in `/tmp/coach-nf1b/`.

## What landed

| Finding | Fix | Test that fails without it |
|---|---|---|
| M1, the 500-Take window | documented both directions in `shownCleanTempoOf`'s comment and here; behaviour pinned | `cleanTempo.test.ts` "nf1b M1: the 500-Take window, as it stands" |
| M2, plan reasons | `passedKeepGoing`, `warmUpClean` (focus warm-up and `warmupTempo` for the swap), `edgeCheck`, `backEased`, `newFromSibling` quote `shownCleanTempoOf`; every tempo, the ceiling, parking unchanged | `plannerQuotes.test.ts` (each case also checks the tempo equals the unmarked history's) |
| L1, fallback-graded Take | new `outcomeCountsTowardCleanTempo(progress, takeId)` = `countsTowardCleanTempo` of the saved row (true when no row is in memory); the result's clean line, the recap headline's "raised", Find my edge's reached, the recap's coach line read it | `cleanTempo.test.ts` "nf1b L1" |
| L2, frozen `cleanBefore` | new `cleanBeforeOutcome(progress, outcomes, first)`: the pre-Session "before" raised by this Session's earlier outcomes that still count; the edge recap reads it at render | `cleanTempo.test.ts` "nf1b L2" |
| L3, the model's context | "clean tempo now X" only when X > before and the row counts | `context.test.ts` "says 'clean tempo now' only…" |
| L4, shared rows | `src-tauri/fixtures/clean_tempo_rows.json` (27 rows, odd shapes: `newClean` null / "true" / 1, `countsForCleanTempo` 1 / "true", `fair` true / "No" / object, facts `null` / `[]` / `''` / garbled); read by `db.rs` `every_shared_clean_tempo_row_agrees` and `src/session/cleanTempoRows.test.ts`. The runner's wiring is pinned by a source test in the same file (no harness settles a graded Take through `useSessionRun`) | both, plus the source pin |
| Today's line | "That was N days ago." (`session.today.line.backAgo*`) removed from `todayLine.ts` and all fifteen locales (it was never in the frozen key list, so no `DELIBERATELY_REMOVED` entry); with no last number the line still opens with "Your last Session was N days ago." | `todayLine.test.ts` (three rows), `today-line.spec.ts` `headerSaysTheFact` |

`useSessionRun.ts`: not touched by nf1b (nf1's two lines, 1289 and 1364, stay as they were).
`db.rs`: one test added; SQL untouched. `PathsView.tsx`: not touched (t2b's).

## M1: why the real fix is not done

One source would be `listCleanTempoSpans()` loaded with the progress and its `bestBpm` used as
the shown tempo. Not done here because:
- the load belongs in `useSessionRun.refresh` (a third hunk in lb1's file tonight) and
  `PlayerProgress` gains a field every builder of one must fill;
- `listCleanTempoSpans` is documented "on demand, never at startup", and `refresh` runs as the
  learning side opens;
- spans are a snapshot: a Take settled or marked in the app must update them in memory too
  (best = max(span best unless its Take is in memory and now marked not fair, fair Takes in memory)).
  The span carries `bestAt`, not the Take's id, so the "is it marked now" check matches on
  `startedAt` + exercise.

The larger change, exactly: add `spans?: CleanTempoSpanRow[]` to `PlayerProgress`; load it in
`refresh` beside the ceilings (one indexed read, 6.5 ms at 5,000 Takes, never during a Take);
in `shownCleanTempo`, when a span exists, take `max(span.bestBpm unless the Take at
span.bestAt is in memory and marked not fair, fair Takes in memory)`; when the window holds a
Take marked not fair at the span's best, fall back to today's rule; flip the two M1 tests.
Until then, both directions need a player with more than 500 Takes, and nothing reads the long
view yet (c4b2's milestones will be its first reader).

## For the owner: sentences whose words and tempo now differ

Only when a Take marked not fair holds the ceiling (shown < ceiling):
1. Find my edge: "Last time it was 90 BPM." and the climb starts at 100 (the ceiling).
2. Back after a break: "ease back in under your clean 90" at a tempo eased from 100 (can be
   at or over 90).
3. Warm-up: "under your clean tempo of 75" at 80% of a ceiling of 100 = 80.
4. New from a sibling: "about 80% of your clean 90 BPM on X" at 80% of 110 (about 98% of 90).
5. "You've passed this at 80 BPM" when 80 is under the pass mark (85) and the ceiling (90)
   passed it; with no shown tempo at all the words quote the last passing Take's tempo.
6. Unchanged on purpose: a sibling with no shown clean tempo keeps the ceiling in the words
   (no honest string without a new key); `reviewDue` ("Two Takes at your clean tempo, N BPM",
   `rotation.ts`) quotes the tempo it plays, which is the ceiling.
The question: should the planner's arithmetic read the shown tempo too (owner's decision,
brief item 3), or should these reasons drop the number when the two differ?

## PathsView (t2b's file)

`src/containers/session/PathsView.tsx:816`: `const clean = cleanTempoOf(progress, path.id, exercise.id);`
becomes `const clean = shownCleanTempoOf(progress, path.id, exercise.id);` (and the import).
