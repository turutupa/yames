# c1c: the loop step, P1 (once more here), P2 (leave it), "for your eyes"

Branch `coach-c1c`. Frontend only: no Rust change (the loop uses the Songs scheduler as it is).

## What landed

| Where | What |
|---|---|
| `session/planner.ts` | `LoopStep` (`kind: "loop"`, pathId, exerciseId, variantSeed, fromBar, toBar, bpm, minutes, plus id / title / why so it is a well-formed `PlanStep`). Never put in `plan.steps`. |
| `session/runner.ts` | Phase `looping`; `RunState.loop` and `.afterLoop`; events `loop` (from `ready` and `result`, only the Exercise on screen) and `loopStopped` (back to `ready`: same step, same `bpm`, same `takes`, same `outcomes`); `setBpm` while looping moves the loop's tempo only. `loopOffer`, `loopBars`, `LOOP_RUNGS_DOWN = 2`. `TakeOutcome.spot` (`TakeSpot`: patternBars, repeat, onceMoreHere). `bigAction`: **P2** on `belowBar` with `spot.repeat === 3` -> onward with `leaveIt`; **P1** on a pass that would go up, with `spot.onceMoreHere` and no earlier pass at that tempo on this step -> `again` at the same tempo with `onceMore: { up }`. `endLoop` big action. `eyesOffer`, `EYES_EVERY = 5`, `UngradedWhy` `"eyes"`. |
| `session/take.ts` | `patternBars` (cut bars of the pattern on bar lines), `buildLoop` -> `LoopPlan` (a `TakePlan` with `buildSchedule(score, range, { loops: true })`). |
| `coach/takeNote.ts` | `spotOf(note)`: the note's facts the rules read. |
| `coach/loopLine.ts` | The loop's words: `loopButtonLine` ("Loop the first bar" / "Loop bar 3" / "Loop bars 2 and 3"), `loopTitleLine`, `loopHeardOf` (whole rounds only; "landed" = no note missed), `loopLine` (null ungraded or unheard). |
| `coach/sessionEvents.ts` | Back from a loop is not a fresh `stepReady` on the bus. |
| `session/progress.ts` | `TakeFacts.upstroke` with `upstrokeOf` / `withUpstroke`; `ungraded` may be `"eyes"`. |
| `useSessionRun.ts` | At the verdict, `takeNote` -> `spotOf` onto the outcome. `loop` (= `loopOffer`, with "Not yet" twice from the stored answers when ungraded), `loopPlan`, `startLoop` / `endLoop`, the loop's sound (setPlaying false, schedule free, `loadSong` of the loop transport with the band, `loadScoreSchedule` without pass marks only when graded and listening, play), its stop on leaving `looping` by any road, its live strip and round count from `onScoreOnset`, `nudgeTimed` for the loop's tempo. A Take's attempt and lights ignore the engine until it has stopped after a loop (`loopEngaged`). `upTo` (P1's tonal), `eyes`, `eyesTake`, `answerUpstroke`. |
| `SessionView.tsx`, `parts.tsx`, `highway/RunwayTake.tsx` | `LoopButton` (tonal, testid `session-loop`, `data-front`) in the ready row of both views and in the result's tonal row, before Slower when `front`; `UpToButton` (testid `session-up-to`) first in the result row under P1; the eyes tonal (`session-eyes`); `LoopScreen` (testid `session-loop-screen`): the chosen view drawing the `LoopPlan`, the loop's own - / +, the early / late strip only when graded, one foot line, "Stop the loop". Ungraded result: the loop after "Not yet" twice. `bigLabel`: `leaveIt` next reads "Move on"; `endLoop` "Stop the loop". |
| `SessionCoach.tsx` | The repeat line only when `bigAction` actually moved on for it; P1's line from `big.onceMore`; one line after a loop (`coach-after-loop`, an `extra` line, so it steps aside on short windows). The eyes Take: its ready headline, and its result question with Yes / No (`NoteAnswer` got optional `labels`). |
| Locales | `session.result.upTo`, `session.note.repeat.onceMore`, `session.loop.*`, `session.eyes.*` in all fifteen. Honesty lint (`noteStrings.test.ts`) now also reads `session.loop`, `session.eyes`, `session.result.upTo`. |
| Harness | Recipe `passSlip`; `again` (Takes before the stop); stops `loop`, `afterLoop`; scenes `coach-loop-front`, `coach-leave-it`, `coach-once-more`, `coach-loop`, `coach-after-loop` (+ phone). |
| Tests | `runner.loop.test.ts` (P1 once and only once, never on an Exercise-passing pass; P2 on the third repeat and on three falling, going again reachable; loop offer, from result and from ready and back, nothing stored or moved, jump away; eyes every fifth); `take.loop.test.ts` (every pack Exercise); `loopLine.test.ts`; `tests/layout/coach-loop.spec.ts`; a loop case in `smooth.spec.ts`. |

## Decisions and why

- **The loop is held beside its Exercise, not inserted into the plan.** It returns to "the same step"; a plan step would be a block in the Session bar, count minutes, and be marked done or skipped. `LoopStep` is still a `PlanStep` member, as the design says (only `todayPlan.roleOf` needed a case).
- **The rules read facts stored on the outcome** (`spot`, from `takeNote` at the verdict in the hook), so `bigAction` stays pure on `RunState` and the button, the pedal and the note agree. The note's lines that name what happens next are derived from `bigAction`'s result, never from `repeat` directly.
- **P2 at the last block** moves on to the recap: the solid button then reads the finish label ("See how it went"), not "Move on". Elsewhere it is "Move on".
- **P1 "once"** = no earlier pass at that tempo on this step. "Up to N" starts the Take (like Go again); Faster stays too (it goes to the ready screen).
- **Front**: `repeat >= 2` (also on the third time, where it sits beside Go again).
- **The loop's tempo** moves 5 BPM a press like a warm-up (`timedTempoAdjustable`), and a change restarts the loop from the top (the song is rebuilt; no live tempo path for a song).
- **What a loop says**: rounds heard whole, "landed" = no note of the round missed. Ungraded or input off: no schedule loaded, no strip, nothing said.
- **"For your eyes" is a tonal button on the result**, not a chip in the note: the mock rules say a chip never changes what happens next, and this starts a Take. Offered when the next Take on the step is the 5th, 10th, ...; never on a Test out or placement.
- With grading off the loop is offered only after "Not yet" twice (DESIGN 4.4), on the tune's first bar.

## What the design got wrong about the code

- `buildSchedule(score, range, { loops: true })` is the scorer's schedule; the engine loops through `buildTransport(..., { loops: true })` (as the finisher does). Both are used.
- A loop needs nothing from `findings.rs`; the place is the note's (`place.patternBars`), which may be "the whole tune": the loop then takes bars 1 and 2.
- The design's "Did any beat start on an upstroke?" assumes beats are downstrokes; the order during that Take says only "This time, watch your pick."

## Gates

See the final report for numbers and logs (`/tmp/coach-c1c/*.log`). Screenshots: `/tmp/coach-c1c/shots/`.

## For the next legs

- c1b2 (hotkeys): `actions.startLoop`, `actions.endLoop`, `actions.upTo`, `actions.eyesTake` exist; `session.loop` says whether the loop is offered.
- c2a1b (`onAsk` in notes): `ResultNote`'s history line now takes `session.big`; no other prop changed.
- Translations of "landed", "upstroke" and the loop's verb were judgement calls by the helpers (de "Aufschlag", nl "opslag", ja "決まりました", zh "到位了"); worth a native read.
