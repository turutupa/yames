# nf1: a Take marked "not fair" is left out of the clean tempo and of milestones

Branch `coach-nf1`. Status: done, gates green; `db.rs` and `useSessionRun.ts` await the reviewer.

## Gates (logs in /tmp/coach-nf1/)

- `npm run test:rust`: 1230 passed, 0 failed (`rust.log`, job `coach-nf1-rust`). The 5,000-Take
  test alone: plan `SCAN path_takes USING INDEX path_takes_exercise`, no temp B-tree, 6.5 ms
  (c4b1: 5.6 ms), with a seventh of the rows marked not fair (job `coach-nf1-rust-span`).
- `npx tsc --noEmit`: pass (`coach-nf1-tsc-2`). `npm run build`: pass (`coach-nf1-build`).
- `npm run test`: 47922 passed; only the known `TabStage.render.test.tsx` cannot load
  (`vitest.log`).
- Layout `today-line` + `session` (Progress, the result, the recap): 105 passed (`layout.log`). No
  seed holds a Take marked not fair, so no screen's number changed. Full suite owed.

## What the next leg must know

- c4b2 (milestones): `listCleanTempoSpans()` already leaves Takes marked not fair out; its `bestBpm`
  equals `shownCleanTempoOf` within the 500-Take window, not always `cleanTempoOf`.
- c4a1 (`tendencies.ts`, in review): its own `factsOf(t).fair !== "no"` should become
  `!isMarkedNotFair(t)`, and anything it says about a clean tempo should read
  `countsTowardCleanTempo` / `shownCleanTempoOf`, not the ceiling.
- `shownCleanTempoOf` recomputes from the Takes in memory only when a Take marked not fair holds the
  ceiling; for a player with more than 500 Takes it may then miss an older fair clean Take that the
  long view finds.

## The ground

- **The mark.** `facts.fair` on a `path_takes` row (`"yes" | "no"`, absent = not asked or not
  answered; `TakeFacts.fair` in `src/session/progress.ts`). Set by `answerFair` in
  `useSessionRun.ts` (the result's "Was this grade fair?" tap, `FairTap`): the same row saved again
  with `savePathTake(next, null)` (`INSERT OR REPLACE`, no clean tempo with it). The latest tap
  wins. So the mark lives in `facts_json`, readable by the long-view query with `json_extract`: no
  schema change, no migration.
- **The ceiling** (`exercise_ceilings`, `cleanTempoOf`) keeps only the highest clean tempo ever
  saved, and a Take marked not fair after it raised the ceiling stays in it. It has no history, so
  it cannot leave a Take out by itself. It stays what the planner, the Step's pass and the standing
  read (brief item 3).

## The rule (TypeScript and Rust, the same reading)

- `heldCleanTempo(take)` (`progress.ts`) = `clean_tempo_spans_sql`'s WHERE without the fair clause:
  caught and passed, then `newClean === true` → yes; else the scorer's
  `measures.pass.countsForCleanTempo` → that; else a row with a `newClean` (false) → no; else (rows
  from before `newClean`) `bars >= 8`.
- `countsTowardCleanTempo(take)` = held and not `fair: "no"`.
- `shownCleanTempoOf(progress, path, ex)`: the ceiling, unless a Take marked not fair at or above it
  holds it; then the fastest Take that counts (from the 500 Takes in memory), or null. Never 0.
- `shownCleanTempoTakeOf`: the Take that set the shown tempo (Today's "earned").
- Rust `list_clean_tempo_spans`: the same WHERE, plus `fair <> 'no'`. Rows with `newClean = false`
  and `countsForCleanTempo = true` now count (they passed clean without raising the ceiling); with
  no Take marked not fair that changes no first and no best (such a row is later than, and no faster
  than, the Take that raised the ceiling).

## Every place that reads a clean tempo, and what a not-fair Take does there now

| Place | Reads | A Take marked not fair, now |
|---|---|---|
| Progress (`ProgressView.groupsFrom`: the Path's top clean, each Exercise's "played N, clean at X", the sparkline) | `countsTowardCleanTempo` | left out; only such Takes → "no clean tempo" |
| Long view `list_clean_tempo_spans` (`db.rs`) / `listCleanTempoSpans` (`ipc.ts`; c4b2's milestones) | same WHERE + `fair <> 'no'` | left out of first and best; only such Takes → no span |
| Today's line, `earned` (`todayLine.ts`) | `shownCleanTempoTakeOf` | not the Take that earned it; a later fair clean Take that now sets the shown tempo is ("went up to 85") |
| Today's line, `back` / `slipped`; the Step page's line | `markedUnfair` (c1b2a) | already no line (unchanged) |
| The result's "clean tempo" line (`SessionView` `CleanTempoLine`) | `isTakeIdMarkedNotFair` | hidden once the player answers No; back on Yes |
| The result's / notes' "before" (`TakeOutcome.cleanBefore`, set in `useSessionRun`) → `CleanTempoLine` "from", the note's `history.newClean`, the recap's "raised", the coach context's "clean tempo before" | `shownCleanTempoOf` | not quoted as "before" |
| The recap's headline "clean tempo went up", Find my edge's recap number, the recap's coach line (`recapLineText`: "raised" and "held at X") | `isTakeIdMarkedNotFair`, `shownCleanTempoOf` | not quoted |
| **Unchanged (brief item 3):** `cleanTempoOf` / the ceiling: whether a Take raised it (`raised`, `newClean`, what is stored), the Step's pass (`isExercisePassed`, `isStepPassed`), the planner's tempos and parking, rotation, levels, warm-ups, test-out | the ceiling | **still counts** (open point) |
| Paths page Exercise row "played N, clean at X" (`PathsView.tsx:816`, owned by t2b tonight) | `cleanTempoOf` | **still the ceiling** (open point: one-word change to `shownCleanTempoOf` once t2b merges) |
| Plan reasons that quote a clean tempo (`planner.ts`: `passedKeepGoing` bpm, `warmUpClean` clean, `edgeCheck` clean, back `clean`, sibling start `clean`) | the ceiling (the planner's own input) | **still the ceiling** (open point: changing the words alone would quote a number the tempo was not computed from) |
| Coach tools' `read` answers, the Ask fact cards | quote no clean tempo on `coach` (grepped) | - |
| Export (`exportData.ts`) | the ceilings and the raw rows (with `fair`) | unchanged: it is the store, not a quote |
