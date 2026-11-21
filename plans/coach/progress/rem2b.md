# Leg rem2b: the reminder's fixes from the independent review

Review: `/tmp/coach-orch/rem2-review.md` (MERGE AFTER FIXES). Branch `coach-rem2`. Logs `/tmp/coach-rem2b/`.

## What counts as practice now (M2, the orchestrator's decision)

A stored Path Take (My exercises included, a Take marked "not fair" included: it is still practice), a saved
tool run, a stored Songs attempt. Songs are read with `listScores()` then `queryAttempts({ scoreId,
includeOnsets: false })` per song (read-only; no date-bounded command exists and none was added, so every
attempt of every song is read, without onsets, once per read). The quiet note's English changed from
"without a Session ... after your next Session" to "without practice ... after you next practise".

## Fixes

- M1: one timer at the earlier of the reminder's time today and the next local midnight, + 500 ms
  (`reminderNextCheck`); it re-reads and re-arms. `visibilitychange` (visible) re-reads. Cleared on unmount
  and on a change of on/time/days. Tests: "left open from 23:59 on a reminder day into a day that is not
  one: the line goes", "left open before the time ... the window coming back reads again", the
  `reminderNextCheck` table.
- M2: above. Test: "a Songs attempt today counts as practice (rem2b M2); the same without it says the line".
- L1: no quiet note on a day already practised. Test "no quiet note on a day already practised".
- L2: comment in `useReminder.ts` says the store answers `[]` when unavailable and the line can then show;
  tests "the practice store unavailable answers empty lists ..." and "a read that rejects says nothing".
- L3: "No days are chosen, so Today will not mention it." under the row. Test "On with no day chosen ...".
- L4: `coachLoadGate.ts` gains `setCoachClickPlaying` / `coachHeld` (driven from `useCoachModelDriver`);
  nothing is read and no timer armed while the click sounds or a Session is in progress; Today passes
  `sessionBusy` (run phase not idle/recap) and hides the line. Tests "opened in the middle of a Take ...",
  "says nothing and reads nothing between the Takes of a running Session".
- L5: reads keyed on On, a timer tick, the window's return and held→free only; a press re-arms the timer
  but reads nothing. Today hands in `session.progress.takes` (null while `NO_PROGRESS`), so it no longer
  reads the Takes twice. Tests "a day or a time pressed reads nothing again", "uses the Session's Takes".
- L8: the 14 locales now quote the Today screen's name in hint / quiet / noDays / unreadable (sonnet
  helper). Native read wanted: pl (neuter subject, "ćwiczenia"), tr, vi, ko (unquoted "오늘 화면").
- L9: Off/On is `role="group"` named "Practice reminder". Test "the Off/On pair is a group ...".
- L10: positive controls added; a cleared time writes nothing; unknown fields of a valid value kept.

## Left

- L6 (a press over an unreadable value writes a whole value): documented and consistent with Suggestions.
- L7 ("guitar" fixed in the line): the owner's English, a decision for the owner.
