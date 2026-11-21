# c5a1c: fixes after the review of c5a1 (the coach on Jam)

Branch `coach-c5a1` (worktree `/home/dgx-delgado/yames-coach-c5a1`). Work list: `/tmp/coach-orch/c5a1-review.md`
(MERGE AFTER FIXES). Logs: `/tmp/coach-c5a1/`, `job logs coach-c5a1c-*`. Diff for review (own commits, non-locale):
`/tmp/coach-orch/c5a1c-fix.diff`.

## Done

| Item | Where | What |
|---|---|---|
| M1 | `src/coach/ask/changeNote.ts` | Tones keep their raw interval (15 for a #9, no longer folded to 3). `roleOfInterval` (exported for the test): third = 3 or 4, seventh = 10 or 11 (9 in dim7), nothing else. Tests: Bm to E7#9 = F# up a whole step to G#, "G# is the third"; a hand-written role per stack position for every quality in `QUALITY_INTERVALS` (the stack itself restated by hand). |
| M2 | `heard.ts` (`jamHeardKey`, `jamStopLine`), `useHeard.ts` (`runKey`), `bus.ts` (`jamStopped.jam`), `MainWindow.tsx`, `ToolCoach.tsx` | The event carries the jam that played: its id and its chart as the Jam screen reads it (key, concert key, chords), as kept while it played (an effect, so the stop's own render showing another jam does not overwrite it). The line is said only beside a jam with the same key: not after another jam is picked, nor after this jam's key, transposition or chords were edited. Tests: `heard.test.ts` (same jam untouched, another jam, key edited, no jam on the event), `ToolCoach.test.tsx` (the same three through the component), `useHeard.test.ts` (the played jam is carried when the stop's render already shows another). |
| L2 | `heard.ts` | Floors: 8 beats with a chord in all (two bars of 4/4), and each chord named held 4 beats (a bar). Why these: `worker.rs` `Heard::summary` keeps any chord with 2 beats and a tenth of the chord beats, so a single 2-beat strum is a whole summary; at 8 chord beats the tenth is under one beat and adds nothing. Tests: 20 s of single notes with one 2-beat strum says nothing; 7 beats nothing; a 3-beat chord beside a long one is not named. |
| L3 | `tools/types.ts` (`ToolDone.forJam`), `read.ts`, `askTools.ts` (`bodyOf` carries it), `pinShape.ts`, `AskToolTurn.tsx` | `show_chord` on Jam records the jam's id; the press is refused with `jam.pin.otherJam` when another jam is on screen. New English string, translated into 14 locales. Tests: `pinShape.test.ts`, `read.test.ts`. |
| L4 | `pinShape.ts`, `AskToolTurn.tsx` | An Undo pressed during a Take stays `live` with the refusal note shown; pressable again after the Take within its time. The `refusedUndo` state is gone. Test in `pinShape.test.ts`. |
| L1 | `useHeard.ts` | Three tests: stop, play, stop (two events, each its own summary); a rejected stop (no `heard`); hearing off mid-run (nothing then; the stretch before the switch at the stop). Hardening applied: the run's end reads the hearing's stop one microtask after the cleanups, so it no longer depends on React's cleanup order. The audio stop is untouched (the hearing's cleanup still calls `harmonyStop` where it did); only the read of the promise moved. |

## Left, named

- **L5** (`read.ts`: the pin button is offered to a player with no neck; the press is refused with `jam.pin.noNeck`).
  Hiding it needs the raw instrument on `CoachToolHost` (`host.instrument()` maps everything to guitar or bass), a
  change to the host interface for a harmless case. Left.

## Gates

(filled in as they run)
