# c5c2m: coach merged into coach-c5c2, the audio review applied, gated

Branch `coach-c5c2` (worktree `/home/dgx-delgado/yames-coach-c5c2`). Logs `/tmp/coach-c5c2m/`.
Review: `/tmp/coach-orch/c5c2b-review.md`.

## Merge

- `0bad8c5d merge(coach): into coach-c5c2`: no textual conflict (git merged `commands.rs`,
  `timing.rs`, `ipc.ts` itself). c5b1 wrote no `BeatTick { }` literal (none in
  `click-jitter-probe.rs`, `take_audio.rs`, `commands.rs`); every literal in the tree already
  carries `bar_beat`.
- `cargo check --all-targets` (job #593): pass. `tsc --noEmit` (#594): pass.

## Review findings (verdict MERGE AFTER FIXES)

- M-1 fixed: ceiling and drift say "notes on the click" (they count only notes matched to a
  tick the click sounded). Test: `toolFinding.test.ts` (ceiling x2, drift x2), `ToolCoach.test.tsx`.
- L-1 fixed: subdivision says "beats where it was counted". Test: `toolFinding.test.ts`, layout
  `tool-coach.spec.ts`.
- L-4 fixed: "than the other beats' average". Test: `toolFinding.test.ts` (beat x2).
- L-2 fixed: `notifySettingsChange` (ipc.ts) calls the local `onSettingsChangeNotified`
  subscribers; `useRunFindings` drops the earlier segment's finding while the click runs.
  Tests: "a settings change mid-run, whose close is silent, clears an earlier segment's finding
  (review L-2)" (fails without the fix, checked) and "... after the run stopped leaves the stopped
  run's finding". Parity manifest updated.
- L-3 fixed: the subdivision finding's `referenceBpm` from every counted tick of the weak position.
  Test: `a_position_never_played_still_names_the_clicks_tempo`.
- L-5 left: informational, pre-existing, the sentences stay true.
- Locales: 14 by a sonnet helper; pt-BR and tr already said "the other beats' average".

## Gates (logs `~/scratch/jobq/<n>-coach-c5c2m-*.log`)

- test:rust 1274 passed, 0 failed (#617). tsc pass (#652). build pass (#654).
- vitest 49291 passed, 1 file failed: the known TabStage.render.test.tsx (#669; #653 also failed
  the parity surface before `onSettingsChangeNotified` was declared).
- layout `tool-coach.spec.ts` 57 passed (#658).
- Re-read diff: `/tmp/coach-orch/c5c2m-fix.diff`.
