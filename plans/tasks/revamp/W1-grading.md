# W1 grading: continuation (2026-11-10)

Read `CLAUDE.md`, then `plans/tasks/revamp/BRIEF.md` (the wave contract,
ownership and rules), then this.

Worktree `/home/turutupa/Dev/yames-w1-grading`, branch `revamp-w1-grading`.
Your earlier session stopped mid-task. Its uncommitted work was saved as
`044ea279 wip(grading): ...` (score.rs, onset.rs, timing.rs, audio_input.rs,
pitch.rs, commands.rs, lib.rs, `tests/audio_fixtures.rs` + `signals.rs`,
`tests/path_exercises.rs`, `test:grading` scripts in package.json). None of it
has been run through a gate.

## Goal
Grading for the first playable build: Alternate Picking graded on a real
guitar from mic or direct input, producing what the Session needs (Takes with
a pass/fail against the Exercise's bar, and the clean tempo per BRIEF.md
"Decisions"). Plain code decides; nothing comes from a model.

1. Get what is there green. 2. Finish what the build still needs from you;
read `plans/revamp/CONVERSION_AUDIT.md` for the items in your ownership.
3. Stop when the grading the first playable build needs is complete and green,
or when you need a change in someone else's files (W3 owns `src/` and
`db.rs`). Then report.

## Constraints
- Ownership as in BRIEF.md. Do not touch `src/`, `db.rs`, or `engine.rs`'s
  output callback.
- `audio_input.rs` runs an input callback: the same rules as the output
  callback in AGENTS.md apply (no allocations, no frees, no `lock()`, only
  `try_lock`). The `reviewer` agent will review this before merge, so keep the
  diff readable.
- Existing scoring for tools (Pocket Check, drill, coach) must not change
  behaviour: `test:dsp`, `test:highbpm` and `test:pitch` must pass unchanged,
  and no fixture gets re-baked to make them pass.
- Commit as you go on your branch (conventional prefixes, no `release`). Do
  not push, do not start `tauri dev`, do not merge.

## Gates (all must pass)
```sh
export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
export CFLAGS='-std=gnu11 -Wno-implicit-function-declaration'
npm run test:rust && npm run test:dsp && npm run test:highbpm && npm run test:pitch && npm run test:grading
```
Plus `cargo test --manifest-path src-tauri/Cargo.toml --test path_exercises`.
`node_modules` is a symlink to the main checkout; do not `npm install` into it.

## Report
Short summary of what grading now does and doesn't do, `git diff --stat
revamp...HEAD`, the gate output (pass counts), anything you changed in the
audio input callback (so the reviewer can be pointed at it), and open
questions or cross-worker needs.
