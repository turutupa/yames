# Leg c4b1: the long-view store query and `src/session/totals.ts` (R, Rust)

Worktree `/home/dgx-delgado/yames-coach-c4b1`, branch `coach-c4b1`. Logs under `/tmp/coach-c4b1/`.

PLAN's leg c4b, first half: the data the companion's long view needs, and nothing visible. **R**: a
new query in `src-tauri/src/db.rs` (the SQLite store) and a new call in `src/ipc.ts`; the orchestrator's
reviewer reads the diff before merge. Needs nothing unmerged and touches no Ask file: it may run beside
c4a1 and any card, search or cue leg.

Read: `plans/tasks/coach/BRIEF.md` ("Owner decisions"); `plans/coach/progress/c1a.md` (`TakeFacts`
inside `facts_json`). Design, read-only: `/home/dgx-delgado/yames-coach-design-out/DESIGN.md` 6 (the
opening paragraph: the store is read 500 Takes deep, about five weeks; the milestones that need the
long view get **one read-only query**), 6.2, 6.5 (the "Clean tempo up 20 BPM" and "Benchmark improved"
rows), 9.1 (the "Totals" row), 9.3 (the last row: "first and best clean tempo per Exercise with
dates"). Code: `db.rs` (`path_takes`, its two indexes, `exercise_ceilings`, `list_path_takes` near line
1635), `commands.rs` `list_path_takes` (near line 2754), `ipc.ts`, `ProgressView.tsx` `totalsFrom`
(line ~125).

## What to build

1. **One read-only query** in `db.rs`: per Exercise (`path_id`, `exercise_id`), the first clean tempo
   with its date and the best clean tempo with its date, over **all** stored Takes, not the 500-Take
   window. Read what "clean tempo" means in the code today (`cleanTempoOf()`, the tests
   `a_take_and_its_clean_tempo_are_kept_together`, `a_clean_tempo_only_rises`, `exercise_ceilings`)
   and compute it the same way: say in the progress file which table it reads and why. Uses the
   existing indexes (an `EXPLAIN QUERY PLAN` line in a test or in the progress file); **no migration,
   no new table, no new index unless the plan shows a full scan over a large store** (then say so and
   stop for the orchestrator: a schema change is its own review). Never writes.
2. **The command** in `commands.rs` and its typed wrapper in `ipc.ts` (`listCleanTempoSpans()` or the
   name the neighbouring calls suggest), the typed mock in `src/test/mocks.ts`, the parity manifest
   updated (`UPDATE_PARITY_MANIFEST=1`). Off the main thread as the other store reads are. Called on
   demand only (c4b2 calls it when Progress opens), never at startup, never during a Take.
3. **Rust tests**: an empty store; one Exercise with rising and falling tempos; a Take not caught or
   marked not fair (left out exactly as `cleanTempoOf` leaves it out); two Paths sharing an Exercise id
   (they must not mix); a store larger than 500 Takes (the first clean tempo comes from beyond the
   window).
4. **`src/session/totals.ts`**: `totalsFrom` moved out of `ProgressView.tsx` unchanged (Progress imports
   it; its tests move with it), plus `weekTotals(takes, now, weekStart)`: Sessions, minutes and Takes for
   one calendar week in the player's locale (the week's first day from the locale, as the rest of the
   app does it: grep), and the week before. Pure, with table tests (a week across a month end, a DST
   change, zero Sessions).
5. Nothing visible changes. No strings.

## Not yours

The weekly look-back, plateaus, milestones, the Progress dot, the Path suggestion and their strings
(c4b2). The coach's stored keys (c4a1). The audio engine and anything near it.

## Gates

tsc, vitest (parity suites included), build, `npm run test:rust` (through the queue: 12G / 30m). No
layout run.

## Report

As the rules block's "The end of the leg": the query's SQL, its plan, the numbers on a 5,000-Take fixture
store (time), the command's name and shape, and a **"Rust diff for review"** paragraph (every hunk in
`db.rs`, `commands.rs`, `lib.rs`'s handler list, `ipc.ts`).
