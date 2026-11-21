# c5a2b: the review's findings on coach-c5a2, then coach merged in

Branch `coach-c5a2` (same worktree). Work list: `/tmp/coach-orch/c5a2-review.md`.

## Findings

| # | Fix | Test |
|---|---|---|
| 1 | `session.today.line.songDue.{one,range}` say "is due / is waiting" in all fifteen; no locale names today (en "Bars 9 to 12 of X are due."). A sonnet helper re-read the fourteen: all OK (vi range takes "Các"). | `songDue.test.ts` "the due sentence never says the day was today, in any locale" (15 rows, a "today" word per language); "a passage that came due days ago is still said"; `todayLine.test.ts` rows and `today-line.spec.ts` updated to the new English |
| 2 | `useSongTakes.ts`: `lastTake` cleared at EVERY pass start (an `isPlaying` effect), and a stop's take that lands after the next pass began is not handed on (`passRef`). Nothing starts, stops or files a recording differently. | `useSongTakes.test.ts` "stops being this pass's take when the next pass starts unrecorded", "a stop's take that lands after the next pass began is not that pass's" |
| 3c | `songs/due.ts` `compareSongDue` (dueDay, song, start, end); `songDueNow` takes the first by it; `coach/songDue.ts` `duePassagesOn` sorts by it. | `songDue.test.ts` "names the passage Songs opens: one order for both" |
| 4 | `useSongDue.ts` skips a row whose bars run past the current score; `songDue.ts` comment says min/max over every played bar, not `printedBarsOf`'s endpoints. | `songDue.test.ts` "a passage running past the score as it is now is skipped" |
| 5 | `songFacts` takes `hits`; "no extras" has no check when `hits` is 0. | `SongReview.note.test.tsx` "no check for 'no extras' on a pass where nothing was heard" |
| 6 | Left (review: no fix required; the line can pop in after Today draws, never during a Take). | - |
| 7 | `bus.ts` comment on `songPassReviewed`: a future subscriber must check it is not inside a Take. | comment only |
| 8 | Dead rule `.songs-review-said .coach-block-sentence` deleted. | - |

## Merge with coach (int1)

Orchestrator's decision: `todayLine(rawInput)` → `withoutCustomTakes(rawInput)` → `pathTodayLine(input)` → the songDue gate on `rawInput` (a player whose only Takes are My-exercises Takes still gets the due line). Test row for that player.

## Gates

(filled in below as they run; logs in /tmp/coach-c5a2b/)
