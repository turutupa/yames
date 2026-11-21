# Leg chip1c: the re-read of chip1b (one MEDIUM, three LOW)

Branch `coach-chip1` (the chip1 worktree), review `/tmp/coach-orch/chip1b-review.md` (MERGE AFTER
FIXES). Logs `/tmp/coach-chip1c/`, jobs `coach-chip1c-*`. No Rust, no new strings (the "not now"
line is `coachTools.why.notNow.take`, already in every locale).

## The findings, as fixed

| Finding | Fix | Test that fails without it |
|---|---|---|
| MEDIUM: a chip Undo pressed while a jam take is written put the tempo back mid-recording | Both remedies. (1) `noteAskJamTake(running)` (`askTools.ts`), called by `useCoachToolHost` when `jamTakeRunning` flips: the runner spends every live chip Undo at the take's start, and nothing of Ask is written while the take records (the jam take does not hold Ask's answers the way a Session Take does, so the receipts are kept in `jamTakeHold` and drawn as plain lines when it ends; `retire` and `retireAskChipUndos` queue there while it is up). (2) The backstop: `runCoachUndo` answers `notNow` ("not during a Take") for a `confirm` undo while `host.jamTakeRunning()` is true (a read that throws counts as yes), and the Undo stays good for after it. | `askTools.test.tsx` "a jam take's start spends the chip's Undo, draws nothing while the take is written ..." (the same `turns` object across the start, a load, a look; the Undo pressed mid-take leaves 95); `chipPress.test.ts` "an Undo pressed while a jam take is written is 'not now' ..."; the wiring by source check ("the host tells Ask when a jam take flips ..."). |
| LOW 4: the `at` guard compares values, not history | Retire every live chip Undo (`noteAskLoad`) when the tempo moves with no press: the jam tempo trainer's per-chorus step and its revert on Stop (`useJamSession.ts`), and a speed ramp's start (`useCoachToolHost`, from `state.speedRamp.active` passed by `MainWindow` as `speedRampRunning`; this covers the Drill, the Zen view and a Session's ramp, every caller of `startSpeedRamp*`). **A hand change and back is left to the value guard**: the Undo is good again and puts back the value before the chip's press, a value the player had. | Source check, same test as above (each call site). |
| LOW 5: `keyRepeating` is one global flag | `watchKeyRepeat`: the first marked repeat installs window listeners (capture) for `keyup`, `blur` and `pointerdown` that clear the flag. `__setAskToolsForTests` resets it. | `askTools.test.tsx` "a key repeat marked on a button that went away does not swallow a later click". |
| LOW 2: in a Session, confirming the proposal a second chip press showed retired the first chip Undo | **The first Undo stays live** (the smaller fix; a chained Undo is impossible there: a Session's `set_tempo` undo is one rung, two rungs is refused). `pressProposal` keeps a chip Undo whose `at` is exactly the value the new Undo puts back (`retireSameUndos(next, keepStacked)`), and `noteAskUndos` keeps it while that newer Undo is live and good (`stackedBehind`). Way back: the newer Undo (while its clock runs), then the first. | `askTools.test.tsx` "in a Session, confirming the proposal a second chip press showed keeps the first Undo ..." (80 → 70 → 60, Undo, Undo: 80). |

## Left as it is

- **Fast separate Enter taps beating the engine's echo** (review chip1b LOW 3): a tap read before
  the IPC echo re-sets the same value and issues its own Undo, which is not chained; Undo then goes
  back one step fewer than the run, to a value the player really had, never a wrong one.
- **The first Undo pressed before the newer one** (LOW 2's arrangement): the older one's guard says
  no (the value is the newer one's), so it is refused and spent; the newer one still goes back one
  rung. Before this leg the older one was gone at the confirm anyway.
- An Undo still drawn live during a jam take and pressed then is refused ("undo gone"; it was spent
  at the take's start); that press is the player's, so it draws its answer.

## The merge of `coach`

Two conflicts: `AskPanel.tsx`'s imports (both kept: the fact cards' and `pressChip` /
`noKeyRepeat`), and `useAskHost.test.tsx` (an add/add): `coach`'s file stays as it is and chip1b's
hook tests moved to `useAskHost.undos.test.tsx` (its `askContext` mock now spreads the real module,
since `useAskHost` imports `askModelContext`). The loop door, `VERBS.loop_bars`, `STILL_NOT_WIRED
= []` came through clean.

The choice grammar fixture (`src/coach/ask/choice-grammar.gbnf`, from the registry) was stale on
this branch since chip1: the `at` guards chip1 added to `click_subdivision` and `set_setting` are
registry parameters, so they are in the grammar, as `set_tempo`'s already was. Regenerated
(`UPDATE_CHOICE_GRAMMAR=1`); the Rust precheck test that `include_str!`s it passes. **Open point**:
whether a model's call should be able to carry an `at` guard at all (it only makes a call stricter)
is for the grammar's owner (c3b).

## Gates

- tsc: pass (`coach-chip1c-tsc`, job 517, after the merge).
- vitest full: `coach-chip1c-vitest` (job 518, `/tmp/coach-chip1c/vitest.log`): 49213 passed, 11
  skipped; failed only the grammar fixture (fixed above) and `TabStage.render.test.tsx` (known, the
  symlink). `coach-chip1c-vitest-2` (job 527, `/tmp/coach-chip1c/vitest-2.log`, with a cargo build
  beside it): 49212 passed; two `useSessionRun` timing tests failed that passed in job 518 and pass
  alone (`coach-chip1c-vt-2`, job 540: 19/19 with the grammar test).
- `npm run build`: pass (`coach-chip1c-build`, job 519).
- Rust: `npm run test:rust -- choice_grammar` pass (`coach-chip1c-rust`, job 526).
- Layout (`coach-chip1c-pw`, job 522): see the report.
- Nothing a running Take renders changed; the full layout suite is owed.
