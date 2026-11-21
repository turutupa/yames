# Leg rem2c: the reminder's re-read fixes (rem2b review) and the instrument in the line

Review: `/tmp/coach-orch/rem2b-review.md` (MERGE AFTER FIXES). Branch `coach-rem2`. Logs `/tmp/coach-rem2/`,
job logs `/home/dgx-delgado/scratch/jobq/<n>-coach-rem2c-*.log`.

## M1: the Songs read, bounded in the store

The second of the review's two options: one new read-only command, `list_attempt_times_since(since)`
(`Db::attempt_times_since`, `src-tauri/src/db.rs`; `commands.rs`; registered in `lib.rs`): `started_at` only,
every song in the library (joined to `scores`, as the per-song reads it replaces were), oldest first. One IPC
and a few numbers instead of `listScores` + one `queryAttempts` per song with 15 columns each.
`AttemptQuery` / `attempts_sql` / `query_attempts` are not touched, so every existing caller is byte for byte
as before (the Rust test also re-reads one song through `query_attempts`).

- It uses `store.with`, not `read_or`: an unavailable store REJECTS, and the reminder then says nothing. All
  three reminder reads share that store, so "store unavailable" no longer shows the line to a player who
  practised (it did in rem2b, documented).
- The bound: `reminderReadFrom(now)` = local midnight 21 days back (`LOOK_BACK_DAYS`). `reminderQuiet` looks at
  days 1..21 back and `reminderLine` at today; nothing older is ever asked, so the list is complete for every
  day consulted (`full: false` stays right). Test: the line and the quiet answer are identical with the whole
  history and with the bounded one (`reminder.test.ts`).
- No index on `attempts(started_at)`: the query scans the attempts table (onsets are in their own table), which
  is milliseconds for thousands of rows; adding one would be a migration, not worth it here.
- When: unchanged from rem2b: never while the click sounds or a Session runs (`coachHeld` / `held`), and only on
  mount/On, the timer, the window's return, the hold ending: never per render.
- Tests: Rust `attempt_times_since_leaves_out_what_started_before_the_bound`; TS "asks for Songs once, bounded at
  local midnight 21 days back, never song by song", "a Songs read that rejects ... says nothing" (with control),
  the focus-after-midnight test checks the new day's bound.

## The LOW items

- L1/L2: `useSessionRun` exposes `takesKnown` (the Takes read answered); Today hands the reminder its Takes only
  then, else null, which says nothing. Covers a failed read and the `[]` a press builds from NO_PROGRESS.
  Left (in `useReminder.ts`'s comment): a store slower than OPEN_WAIT at launch that opens later reads the
  Session's Takes as `[]` (read_or) for that run; telling that apart needs `list_path_takes` to reject, which
  changes every caller. Tests: `useSessionRun.startPath.test.tsx` (takesKnown), `TodayView.reminder.test.tsx`.
- L3: English now "if no practice has been saved today" / "with no practice saved ... after your next saved
  practice", 14 locales translated (sonnet) and proof-read by a separate sonnet helper: all OK.
- L4: `focus` re-reads too. Test: a sleep across midnight read again on focus.
- L5: a comment on `subscribeCoachSessionBusy` (no rename: callers in other legs).
- L6: noted only, nothing to do.

## The instrument (owner relay 2026-11-21 03:50)

`reminderLineKey`: electric/acoustic guitar → `lineGuitar`, `bass` → `lineBass`, `drums`, `piano`; "other" or
no choice → `line`, which names no instrument ("Your reminder: practice at 18:00."). MainWindow passes
`instrumentChosen`, and Today hands the instrument to the line only then (the electric-guitar fallback before a
choice is not the player's). ja, ko, vi, zh-CN, zh-TW use a "practise X" verb frame. For a native read:
zh 练鼓 vs 打鼓; it/es/pt-BR "alle/a las/às {{time}}" is wrong at 1:00 (pre-existing in the old line too).
Layout: a drummer's Today says drums (`reminder.spec.ts`).

## Merge and gates

`merge coach` clean (no conflicts). Gates after the merge (job logs `/home/dgx-delgado/scratch/jobq/`):
- tsc 0 (1042); build 0 (1051).
- `npm run test` (1043): 3 failures, all expected: TabStage.render (the known symlink) and the parity
  manifest's three "added on purpose" (regenerated with UPDATE_PARITY_MANIFEST=1, job 1065, committed).
  Changed files re-run (1075): all pass but `useSessionRun.startPath` "loads the Paths off the learning side",
  which fails when the file runs alone on `coach` untouched too (1088); passes in the full suite.
- `npm run test:rust` (1044): 1279 of 1280, the failure `harmony::worker::...waits_for_one_window_at_most`
  ("waited 20s", a timing test on a loaded box; passed pre-merge in 1022 and re-run alone in 1089: 17/17).
  The new store test passes (1022, 1044).
- Layout reminder today-line settings short-window phone-learning (1074): 334 passed, 1 failed (my new drummer
  check: that scene has no practice so the quiet rule held); fixed to Today's line scene with
  `?instrument=bass` (harness param added), reminder.spec re-run 12/12 (1090).

Review diff: `/tmp/coach-orch/rem2c-review.diff` (2bbe3fd0^..0baf24c7, src + src-tauri, locales excluded).
