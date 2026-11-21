# nf1: a Take marked "not fair" is left out of the clean tempo and of milestones

Branch `coach-nf1`. Status: in progress.

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

(filled in below as the leg lands)
