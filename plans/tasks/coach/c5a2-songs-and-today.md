# Leg c5a2: the coach on Songs: the verdict in the same note, the dock on Songs, due passages in Today's line

Worktree `/home/dgx-delgado/yames-coach-c5a2`, branch `coach-c5a2`. Logs under `/tmp/coach-c5a2/`.

PLAN's c5a, second half. **Needs merged: c1b2a** (Today's line), **nf1** (it edits `todayLine.ts`),
**hd1** and **rem2** if they are open at the same time (all three edit `TodayView.tsx` or the line:
merge them first, or run this after). It may run beside c5a1 (locales differ: `songs` / `session`
here, `jam` / `coachTools` there), c3b2b, c3d, c6b. Not beside c4b2 (it edits `TodayView.tsx`).

Read: `plans/coach/progress/c0.md` (the bus; `songs/verdict.ts` sets the source), `c1b1.md`
(`CoachNote.tsx`: the note's parts), `c1b2a.md` (Today's line, its cases, `songDue` typed and never
chosen), `c2a1.md` / `c2a2.md` (Ask's shapes; "nothing on Songs" for the tools' coach), `nf1.md`.
Code: `src/songs/verdict.ts` (`blocksFor`, `sentenceFor`, `printedBarsOf`, `VERDICT_SOURCE`),
`src/containers/songs/review/SongReview.tsx`, `useSongAttempt.ts` (where a pass settles),
`src/songs/due.ts` and `listDue()` in `ipc.ts` (`ScoreDue`: **played-bar indices**, a local `dueDay`),
`src/coach/todayLine.ts`, `src/coach/bus.ts` (`songPassReviewed`: typed, published by nobody),
`useAskHost.ts` (`askShownOn` already allows Songs), `src/styles/ask.css`. Design, read-only:
`DESIGN.md` 3.1 (Songs' row), 3.2, 6.1, 8 (Songs' row: "The review's behaviour does not change").
`NEXT-LEGS-s4b.md` judgement calls 18 and 19.

## The owner's rules where they bite here

- **Silent during a pass**: nothing built or rendered per beat; the note appears when the pass settles,
  as the verdict does today. Nothing commits a React render during a pass (`smooth.spec.ts`).
- **The review's behaviour does not change**: same findings, same actions, same scheduling of due
  passages; only where and how the verdict is drawn.
- Only measured facts: the due line states what the store holds (bars, the song); no streak, no
  "overdue", no "you forgot".
- Theme tokens only; the note is the Session's note component, not a copy of it.

## What to build

1. **Publish `songPassReviewed`** where a pass settles in `useSongAttempt.ts`, once per pass (a test).
2. **The verdict in the same note**: `SongReview.tsx` draws the verdict's blocks (`blocksFor`) inside
   `CoachNote.tsx`, as a Session's result does: the finding, the bar strip where the review has one,
   one fact line, the source label "Measured" (`VERDICT_SOURCE`). Every existing action button keeps
   its behaviour and its test. If `CoachNote` needs a prop for Songs (no Exercise, no rung), add it
   without changing what a Session draws (`CoachNote.test.tsx` unchanged, plus Songs cases).
3. **The dock on Songs**: Ask already mounts there (`askShownOn`) and `ask.css` docks it from 1160 px;
   DESIGN 3.1's "Songs has none today" predates c2a1. Measure it: Songs with the dock open at 1160, 1440
   and 1920, the drawer at 1024, the tab stage not overlapped and its controls inside their rows. Fix
   only what the scenes show; if nothing, say so.
4. **Due passages in Today's line**: `todayLine` chooses `songDue` (judgement call 18): on a day with at
   least one passage due today or earlier (`dueDay` ≤ today), one sentence after the Path line, about
   the passage due longest ago, in **printed** bars (convert from played-bar indices as `printedBarsOf`
   does; a test with a pickup bar and a repeat): proposed English "Bars 17 to 24 of {{song}} are due
   today." / "Bar 9 of {{song}} is due today." Not on the first day, not when Today's line would be
   only the `first` case, at most one passage named. The song's title from the score library; a song
   since deleted is skipped. `listDue()` is read once when Today mounts, with the plan.
5. **Fifteen locales** for the new keys, by sonnet helpers with `plans/COACH_I18N_BRIEF.md`.
6. **Layout scenes** (pictures only when `YAMES_SHOT_DIR` is set): a settled pass with the note (1440
   with the dock, 1024 without), Today with the due sentence (1440, a phone), one Manuscript, one
   Russian.

## Not yours

Jam (c5a1). Hearing a Take back (c5b). The review's findings, thresholds and scheduling (unchanged).
Today's header (hd1), the reminder line (rem2).

## Gates

tsc, vitest, build; layout by name: `songs-review.spec.ts`, `songs.spec.ts`, `songs-stage.spec.ts`,
`coach-blocks.spec.ts`, `today-line.spec.ts`, `ask.spec.ts`, `short-window.spec.ts`,
`phone-learning.spec.ts`, `smooth.spec.ts`, your scenes.

## Report

As the rules block's "The end of the leg": what the note looks like on Songs, what the dock scenes
showed, the due sentence and its conditions, and a "diff for review" paragraph for `useSongAttempt.ts`,
`SongReview.tsx`, `CoachNote.tsx` and `todayLine.ts`.
