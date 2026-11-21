# Leg lb1: `loop_bars`' bars door: "loop bars 3-4" runs the Session's loop (R, Session runner)

Worktree `/home/dgx-delgado/yames-coach-lb1`, branch `coach-lb1`. Logs under `/tmp/coach-lb1/`.

Small. The typed command already parses ("loop bars 3-4", `router.ts` 599-601 → `loop_bars { from,
to }`), the tool is registered and typed (`src/coach/tools/practice.ts` 379-392: `confirm`, `when: !takeRunning`,
`propose` / `commit` answer `notWiredYet`), the host has the slot (`host.ts` 220 `loopBars(fromBar,
toBar)`, listed in `STILL_NOT_WIRED` at 298), and its chip says "not yet" (`toolChips.ts` 11). What is
missing is the door: `actions.startLoop()` takes no bars; it plays only what `loopOffer` chose from the
last Take's place (`useSessionRun.ts` 1846-1853). **R**: `useSessionRun.ts` changes. Not beside c5b2
(both edit `useSessionRun.ts`) nor t2c / t2d (both edit `practice.ts`); the Ask chain's files are not
touched.

Read: `plans/coach/progress/c1c.md` (the loop: held beside its Exercise, never in `plan.steps`, back to
the same ready screen with the same tempo, Takes and outcomes), `t1a2.md` (line 67: the door it asked
for), `t1b1.md` (receipts and proposals). Design, read-only: DESIGN 4.2 "Loop a bar", 9.3 (the `loop`
row); TOOLS.md 2.2 (`loop_bars`), 3 (confirm tools: one press). Code: `src/session/runner.ts` 640-725
(the `loop` event's checks at 655-658, `LOOP_RUNGS_DOWN`, `LOOP_MAX_BARS`, `loopBars`, `loopOffer`),
`useSessionRun.ts` 854 (`loopPlan`), 1846-1880, `src/session/take.ts` 41-45 and 131 (`TakePlan.bars`,
`patternBars`), `useCoachToolHost.ts`.

## What must not change

A loop is slow (two rungs under the Take's tempo), ungraded unless the Session listens and grades,
never a plan step, never counted against the minutes, nothing stored, back to the same step. The
offer the Session makes by itself (`loopOffer`, its `front`, P1 / P2) is unchanged. Nothing during a
Take: the tool's `when` already refuses, and the runner's `loop` event is valid only from `ready` and
`result`.

## What to build

1. **The runner's door**: a pure `loopAt(state, exercise, fromBar, toBar)` in `runner.ts` that
   returns the `LoopStep` `loopOffer` would build (same id, tempo rule, `minutes: 0`) for the asked
   bars, or a reason it cannot: not on an Exercise's ready or result screen, a bar outside the
   pattern, `to < from`. Table tests beside `runner.loop.test.ts`, including a fresh step with no
   Take yet (the runner allows it; the tempo is still two rungs under).
2. **Bars as the player reads them**: the tool's `from` / `to` are "as printed". Decide from the
   Session's screen whether the printed bar numbers are the pattern's (`exercise.bars`) or the
   Take's (`takeBarsOf`, rounds of the pattern); map a Take bar to its pattern bar the way
   `patternBars` and the note's rounds do; a range that maps backwards across a round seam is refused
   with its reason. Tests for both.
3. **`actions.startLoop(bars?)`** in `useSessionRun.ts`: with no argument, exactly today's behaviour
   (a test pins it); with bars, the step from item 1 through the same `dispatch({ type: "loop" })`,
   the listen demo stopped first as today. Nothing else in the hook changes.
4. **The tool**: `propose` says what will loop and at what tempo ("Loop bars 3 and 4 at 72, until you
   stop it"), `commit` calls `host.loopBars`, which `useCoachToolHost` wires to `startLoop(bars)`;
   the receipt says what started. `loopBars` leaves `STILL_NOT_WIRED`; `toolChips.ts` drops it from the
   "not yet" list. Refusals in words from item 1. Tests in `practice.test.ts`, `run.test.ts`,
   `registry.test.ts`.
5. **Fifteen locales** for the few new `coachTools.*` keys (proposal, receipt, refusals), by a sonnet
   helper or yourself with `plans/COACH_I18N_BRIEF.md`.

## Not yours

The loop's screen, its sound, its strip, its words after (c1c's). The note's loop button. The
router's parsing (t1b2a: a defect you find is fixed with a test and named). Any Ask panel file.

## Gates

tsc, vitest, build. Layout by name: `coach-loop.spec.ts`, `ask-tools.spec.ts` (a typed "loop bars
3-4" on a ready screen reaches the loop screen after one press), `smooth.spec.ts`
(`--lock coach-layout`). The probe `--song-loop --song-take` on a quiet machine, through the queue
(c1c's gate; nothing in Rust changes, so it is a regression run: say so).

## Report

As the rules block's end of the leg: the mapping rule for printed bars and why; the refusals' table;
the probe's four numbers; a **"diff for review"** paragraph naming every hunk in `useSessionRun.ts`
and `runner.ts`.
