# W2 parity: continuation (2026-11-10)

Read `CLAUDE.md`, then `plans/tasks/revamp/BRIEF.md`, then this.

Worktree `/home/turutupa/Dev/yames-w2-parity`, branch `revamp-w2-parity`.
Your earlier session stopped mid-task; its work was saved as `1f02fda9
wip(parity): ...`. Three tests in the new
`src/containers/metronome/MetronomeView.parity.test.tsx` fail today
(MET-28 accent modes, MET-32 count-in switch, RMP-34 Adaptive ramp).

## Goal
Parity tests pin down, against today's code, that rows in
`plans/revamp/TOOLS_PARITY.md` work, so W3's shell changes can't silently
lose any of them.

1. For each failing test, decide: is the test wrong (selector, timing, wrong
   assumption) or is the product missing the behaviour? Fix the test in the
   first case. In the second, mark it `it.todo`/`it.fails` with the row id and
   list it in your report. Never change production code.
2. Then continue covering `TOOLS_PARITY.md`, highest-risk rows first: the
   ones the revamp's shell touches (tab hotkeys `tab-1`..`tab-5`, `setView`,
   `app_ready`, first-run detection, `useSession` call order, settings keys,
   saved formats). Keep a running list of covered row ids in
   `src/test/parity/COVERAGE.md`.
3. Stop after a solid batch (aim for the shell-adjacent rows in full) and
   report.

## Constraints
- New test files and `src/test/parity/` only. No production code.
- Tests must pass against `revamp` (today's behaviour), not against W3's
  unfinished screens.
- Commit as you go; no push, no `tauri dev`, no merge.

## Gates
```sh
export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$HOME/.local/bin:$PATH"
npx tsc --noEmit && npx vitest run
```
Both green.

## Report
Summary, which rows are now covered (count and ids by area), any product
gaps found, `git diff --stat revamp...HEAD`, gate pass counts.
