# t2g: the phone's "Open Paths" after "Add it" (ask-make-phone.spec.ts:88)

## Cause: (b), the tap did not count, and it is the SPEC
- `tests/layout/ask-make-phone.spec.ts:105` taps "Add it" at (63,516); the receipt that replaces the
  proposal puts "Open Paths" at about (66,528). The spec's next tap (`:120`) lands there. When the two
  taps are inside Chromium's double-tap window, the chip's click has `detail` 2, and
  `onePress` (`src/containers/coach/askTools.ts:691`, `if (event.detail > 1) return;`) ignores it by
  design (a double tap on "Add it" must not also press what replaced it under the finger).
- Measured (probe, two taps 12 px apart): 100 / 250 / 350 ms apart give `detail` 2; 450 / 550 / 700 /
  900 ms give 1. Spec's own gap in my runs: 550-650 ms (passed 4 of 4); the orchestrator's runs on the
  main checkout fell inside the window (failed 3 of 3; its failure picture shows "Open Paths" focused,
  no new turn, view Today: exactly a press dropped by `onePress`, since `pressChip` always appends a turn).
- Reproduced on purpose: "Open Paths" tapped right after "Add it" gives click `detail=2`, view stays
  Today, Undo stays (2 of 2).
- No merged leg changed the product here (t2f..7e39c175 touches neither `askTools.ts` nor the
  receipt): t2f's spec had a timing race that its own branch happened to win.

## Fix
- Spec: waits until 700 ms after the "Add it" tap, then taps the chip by its name ("Open Paths")
  rather than `.first()`.
- t2d's open point 5 (two lines, same place): `noteAskToolView` drops a receipt's next chip that is
  `go_to` the screen now on screen; it does not come back. Unit test in `askMake.test.tsx` (the chip
  gone on Paths and after Today; "Opened Paths" keeps "Back to Today"). The phone spec asserts it too.
- `ask-make.spec.ts`: t2d's phone `test.fixme` dropped (the phone spec covers that scene).

## Gates
- vitest askMake + askTools: 691 passed (`coach-t2g-vt`)
- tsc (`coach-t2g-tsc`): green
- `npm run test` (`coach-t2g-test`, log `/tmp/coach-t2g/test.log`): 481 of 482 files, 51782 passed;
  the one failure is the known `TabStage.render.test.tsx` symlink load
- `npm run build` (`coach-t2g-build`): green
- layout, the five named specs, `--workers=2` (`coach-t2g-layout`): 58 passed

## Review diff
`/tmp/coach-orch/t2g-review.diff` (askTools.ts `noteAskToolView`, one hunk plus two `turn.body` → `body`).
