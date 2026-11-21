# lb1: `loop_bars`' bars door

Branch `coach-lb1`. Frontend only; no Rust, no new compute on the audio side (the loop's audio path is c1c's, unchanged).

## What landed

| File | Change |
|---|---|
| `session/runner.ts` | `loopAt(state, exercise, fromBar, toBar)` (pattern bars -> the `LoopStep` `loopOffer` builds, or a `LoopRefusal`), `printedLoopBars` (printed -> pattern bars), `loopAsked` (where first, then bars, then `loopAt`), `isLoopBars` (a bars argument, not a click event). `loopOffer`'s step literal moved into a private `loopStepOf`, shared; its behaviour is unchanged. |
| `useSessionRun.ts` | `startLoop(bars?)`: no argument (or the button's MouseEvent) = the Session's own offer, as before; bars = `loopAsked(run, exercise, ...)`. Returns null when a loop started, else the reason. Same demo stop, same `autoStart.current = false`, same `dispatch({ type: "loop" })`. |
| `coach/tools/host.ts` | New read `loopAsk(from, to)` -> `{ fromBar, toBar, bpm } | { refused }`; `loopBars` returns `"done" | LoopRefusal`. `loopBars` leaves `STILL_NOT_WIRED`. |
| `useCoachToolHost.ts` | `loopAsk` = `runner.loopAsked` on the Session's run; `loopBars` = `actions.startLoop({ fromBar, toBar })`. |
| `coach/tools/practice.ts` | `loop_bars` proposes "Loop bars 3 to 4 at 72 BPM, until you stop it", re-checks bars and tempo on the press, receipt "Looping bars ...". No undo (Stop the loop is the player's). |
| `toolChips.ts` | Comment only: no chip for `loop_bars` (the Session's own loop button already offers the bar that slipped). |
| Locales | 9 `coachTools` keys in all fifteen (`receipt.loopBar(s)`, `propose.loopBar(s)`, `verb.loop`, `why.notFound.loopBar`, `why.notFound.loopAcross`, `why.notNow.loopHere`, `why.refused.loopBackwards`). |

## The mapping rule

The Session prints pattern bars: the tab strip labels every segment by its bar of the pattern
(`tabStripModel.segmentPlace`), and the coach's own words name pattern bars ("Loop bar 3"). So a
number up to `exercise.bars` is a pattern bar. A number past it can only be a Take bar
(`takeBarsOf`: rounds of the pattern) and folds as `rounds.foldBar` does; past the Take's last bar is
outside the tune. Two bars in different rounds (4-5 of a four-bar tune) are refused, not guessed.

| Refusal | When | Tool says |
|---|---|---|
| `notHere` | not an Exercise's ready / result (idle, warm-up, Take, loop, recap) | notNow `loopHere` |
| `outsideTune` | bar < 1, past the pattern (`loopAt`) or past the Take (`printedLoopBars`) | notFound `loopBar` |
| `backwards` | to < from | refused `loopBackwards` |
| `acrossRounds` | a range across a round seam | notFound `loopAcross` |

## Gates

tsc 0; vitest 47,824 passed, only the known `TabStage.render.test.tsx` symlink failure; build 0;
layout `coach-loop` (+ the new lb1 case), `ask-tools`, `smooth`: see the report.
Probe: not run (no audio-side change).

## For the next leg

- The Ask chain: `AskToolTurn.tsx`'s `VERBS` has no `loop_bars` entry (falls back to "Go");
  `coachTools.verb.loop` ("Loop it") exists for it: add `loop_bars: "loop"`.
- The typed command is not wired to the panel's text box on `coach` yet; the layout case drives the
  router's call through `runAskCall`.
- c5b2 edits `useSessionRun.ts`: `startLoop` now takes `bars?` and returns `LoopRefusal | null`.
