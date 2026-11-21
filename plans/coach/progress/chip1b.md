# Leg chip1b: the review fixes for chip1

Branch `coach-chip1` (the same worktree as chip1), `coach` merged in first (the stored keys leg's
host members and the `useSession.ts` split: a clean merge, both sides' host members kept). Review:
`/tmp/coach-orch/chip1-review.md` (MERGE AFTER FIXES). Logs: `/tmp/coach-chip1b/`, job logs under
`~/scratch/jobq/<id>-coach-chip1b-<what>.log`. No Rust, no new strings.

## The findings, as fixed

| Finding | Fix | Test that fails without it |
|---|---|---|
| M1 (a) held key | `noKeyRepeat` (`askTools.ts`): a tool button's `onKeyDown` / `onKeyUp`; an Enter or Space with `repeat` is marked and its default stopped; `onePress` drops a `detail` 0 click that follows a marked repeat. On the chip row (`AskPanel.tsx`) and on Undo, the proposal's two buttons and the "Which one?" choices (`AskToolTurn.tsx`). | `AskPanel.test.tsx` "a held Enter is one press" (the real chip button); `ask-tools.spec.ts` "a held Enter on a focused chip is one press" (Chromium, Playwright's `repeat: true`). |
| M1 (b) a run | `pressCoachChip(call, host, ctx, registry, prior)`: `prior` is the newest live chip Undo of the same tool (and key) in Ask. When the new press moved on from exactly the value `prior` left (`prior.args.at` = the new Undo's value), `chainUndo` issues one Undo `{...prior.args, at: <new at>}`, spends both single ones, and the receipt's `from` becomes the run's start ("Tempo 120 → 105 BPM"). The earlier receipts stay plain lines (`retireSameUndos`, as before). Not chained: a value moved since (or read before the echo: then the new Undo already holds the right `from`), and a run back to where it started (its own Undo stays). | `chipPress.test.ts` "a run of presses is one change to undo" (5); `AskPanel.test.tsx` "separate presses chain"; `askTools.test.tsx` "a second, separate press retires the first Undo; the run's Undo goes back to the start". |
| M1 in a Session | One rung per nudge is the Session's only door, so no single Undo can put a run back. A second chip press while the first one's Undo is live comes back as the **proposal** (as before chip1); the first Undo stays good. | `chipPress.test.ts` "in a Session a second press while the first one's Undo is live is the proposal". |
| M2 jam take | Host read `jamTakeRunning()` (`host.ts`, `useCoachToolHost.ts` from `jamTakes.recording` passed by `MainWindow`; named so no never-list regex (`/record/i`) matches a member). While true, `pressCoachChip` returns the proposal (two presses, as before chip1); a read that throws counts as true. | `chipPress.test.ts` "a jam take being written is a Take for the chip" (2). |
| L1 | Comments say the stale read lasts until the engine's echo over IPC (`useMetronome`'s state event), not one render (`askTools.ts` `retireSameUndos`, `noteAskUndos`). `noteAskUndos` leaves a chip Undo younger than `CHIP_UNDO_SETTLE_MS` (400 ms) alone; `UndoState.issued`. | `askTools.test.tsx` "a look inside the IPC echo's window does not retire the Undo just issued; a look after it ... does". |
| L2 (b) | `noteAskLoad()` retires every live chip Undo (held through a Take like `noteAskTake`); called from `handleLoadPreset` (MainWindow), `useJamSession.loadJam`, `applySetlistStep` (every setlist entry, selected or reached by the runner). | `askTools.test.tsx` "a preset, a jam or a setlist entry loaded retires every live chip Undo" and "every load path calls noteAskLoad" (source check). |
| L2 (c) | `useAskHost`: a loop's start in a Session calls `noteAskLoad`, panel open or closed. | `useAskHost.test.tsx` "a loop's start in a Session retires the chip Undos, panel closed or open". |
| L2 (d) | `noteAskToolView("settings")` leaves a chip Undo alone; `noteAskUndos` asks nothing under Settings (host view) and `useAskHost` does not call it there. Back on the screen the view and the step are checked again. | `askTools.test.tsx` "the Settings overlay does not retire a chip's Undo"; `useAskHost.test.tsx` (never under Settings). |
| L3 | `set_setting` out of `CHIP_PRESS`; the list is `set_tempo`, `click_subdivision`. Its `at` guard stays (harmless, stricter). | `chipPress.test.ts` "the list" and "a set_setting chip, for every safe key, is still a proposal". |
| L4 | `useAskHost.test.tsx` (new): `noteAskTake` once per Take (40 beats of re-renders, listening, result, a second Take), `noteAskUndos` on open / run moves, never per render, never during a Take, never under Settings. The double-click and held-key tests on the real chip button (the self-built button test removed). Citations of `registry.test.ts` for the chip walk corrected to `chipPress.test.ts` (`run.ts`, `registry.ts`, `types.ts`). `chipPress.test.ts`'s header says what it proves (members called and the fake's reads, not a real setter's side effects). `chip1.md` no longer says `noteAskUndos` runs after every press. | (these are the tests) |

## Decisions

- **Whether a tempo change should be proposable at all during a jam recording is left as it was**:
  M2 only takes the at-once path away (the proposal, two presses, is what it was before chip1).
- A Session run is not chained but falls back to the proposal (above): the only alternative was a
  multi-rung Undo, which the Session has no door for. Owner may prefer otherwise.
- `noKeyRepeat` holds one module-level flag (one keyboard); `onKeyUp` clears it, so a screen
  reader's `detail` 0 click after a held key is not dropped.
- The double tap on a phone (L4's last bullet) is still untested: whether WebView's second tap
  carries `detail` 2 needs a device.

## Gates

- tsc: pass (`coach-chip1b-tsc-2`, job 452, the final tree).
- vitest full (`coach-chip1b-vitest`, job 428, `/tmp/coach-chip1b/vitest.log`): 48454 passed, 10
  skipped; the one failed file is `TabStage.render.test.tsx` (known, the symlink).
- `npm run build`: pass (`coach-chip1b-build`, job 429).
- Layout (`coach-chip1b-pw`, job 430, `/tmp/coach-chip1b/pw.log`): ask, ask-tools, ask-typed,
  short-window, coach-session: 151 passed, 52 skipped, 0 failed; the new held-Enter scene passes.
  Not shown to fail without the fix in Chromium (no mutation run); the unit test on the real
  button is.
- Nothing a running Take renders changed, so no `smooth` run. Full layout suite owed.
