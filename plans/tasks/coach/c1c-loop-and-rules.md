# Leg c1c: the loop step, "once more here" and "leave it"

Worktree `/home/dgx-delgado/yames-coach-c1c`, branch `coach-c1c`. Logs under `/tmp/coach-c1c/`.
Read `plans/tasks/coach/BRIEF.md` first, then `plans/coach/progress/c1a.md` (`TakeNote.repeat`,
`onceMoreHere`) and `plans/coach/progress/c1b1.md` (where the note and the action row sit). Design:
DESIGN.md 4.2 ("A finding that repeats…", "The fix is the Session's own button", "Loop a bar", "Watch
your pick") and the `PlanStep` `loop` row of 9.3. Mocks: `03-step-ready-graded`, `06-result-below`,
`07-result-pass` (the tonal "Loop the first bar" button and the "once more here" pass).

The owner confirmed both rule changes (P1 and P2). Plain code decides; the coach narrates.

## What to build

1. **The loop step.** A new `PlanStep` kind
   `loop { pathId; exerciseId; variantSeed; fromBar; toBar; bpm; minutes }` and a `RunEvent` `loop`,
   valid from `ready` and `result`, that returns to the same step when the player stops it. The pattern
   bar (or two) on a loop, **two rungs under the Take's tempo** with Slower and Faster on it
   (`timedTempoAdjustable`), not graded, the early/late strip live, running until the player stops it;
   then back to the same ready screen with one line about the loop when grading is on and something was
   measured ("the open Bs landed on the last three rounds"), and nothing about the playing when it is
   not. Built with `buildSchedule(score, range, { loops: true })`, the Songs path that already loops:
   `fromBar` / `toBar` are bars of the pattern (see `src/coach/rounds.ts`). It stores no Take, moves no
   tempo, passes nothing.
2. **The button.** "Loop the first bar" (the words follow the bar: "Loop bars 2 and 3") is an ordinary
   accent-tonal button with the tempo controls, on the ready screen (later Takes) and the result, shown
   when the note names a place. On the second time at the same spot and tempo (`repeat === 2`) it moves
   to the front of the tonal row.
3. **P1, once more here.** A pass that still contains the pattern bar that slipped in the previous Take
   (`onceMoreHere`) offers the same tempo once as the solid button before the next rung; "Up to N" stays
   one tap away as a tonal button. Once: the next pass at that tempo goes up as today.
4. **P2, leave it.** On the third time at the same spot and tempo, or three Takes falling
   (`repeat === 3`, `goingDown`), the solid button becomes Move on, and the note's line is the one c1a
   named (`session.note.repeat.leaveIt`). The other buttons stay reachable.
   Both rules live in `runner.ts` (`bigAction`), as pure code with tests; every "next" sentence the note
   shows is derived from `bigAction`'s actual result, never the other way round.
5. **"This one is for your eyes"** (DESIGN 4.2, "Watch your pick"): on an Exercise where
   `pickDirectionMatters`, every fifth Take a chip offers one ungraded Take watching the pick, and one
   question after ("Did any beat start on an upstroke?"), stored like `heardIt`. The honest line was
   said once already; this does not repeat it.

## Hunks you own in shared files

`planner.ts`, `runner.ts`, `take.ts`; in `useSessionRun.ts` the loop's start / stop and the new event; in
`SessionView.tsx` the tonal row and the loop's screen. Leg c1b2 (Today's line, speech, hotkeys) and leg
c2a2 (the tools' Listen) run beside you and do not touch the Session's runner.

## Gates

tsc, vitest (`runner.test`, `runner.jump.test`, `planner.test`: the loop from `ready` and from `result`
and back; P1 once and only once; P2 on the third repeat and on three falling; nothing stored by a loop;
ungraded Sessions), build; `npm run test:paths:rust` (`path_exercises`); `npm run test:layout` for the
Session specs with new scenes (the tonal row with Loop first, the loop screen, the P1 pass, the P2
result) at 1440, 1024 × 700 and a phone; `smooth.spec.ts` (the loop is a per-beat screen: nothing new may
re-render per beat); **the click-jitter probe `--song-loop --song-take`** on a quiet machine (load under
6; see AGENTS.md, "Audio-safety gate"), with the numbers in your report; strings in fifteen locales with
`plans/COACH_I18N_BRIEF.md`; the English honesty test.

## Report

As BRIEF "The end of a leg", with the probe's four numbers, the screenshot paths and how a Session with
P1 and P2 differs from before in one table.
