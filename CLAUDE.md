# Yames — read this first, every session

The repository's working notes live in `AGENTS.md` (stack, gates, the
Windows toolchain, the audio-safety gate, conventions). Claude Code loads
this file automatically; the import below makes sure the notes come with
it, so no session or worker has to be told to read them.

@AGENTS.md

## Orchestration, in this repo

The global rules in `~/.claude/CLAUDE.md` apply. Things specific here:

- Branch policy: nothing is committed on `main`. A fix gets a branch or
  worktree, merged when green; a feature that needs several workers gets
  a feature branch, and the worktrees merge into that.
- Briefs live in `plans/tasks/<wave>/`: one `BRIEF.md` shared by the
  wave (the contract, the ownership table, the gates) and one file per
  worker. Workers read this file, then the brief.
- The gates for a change are the ones `AGENTS.md` names for the files it
  touches. The Rust runner is `npm run test:rust` (never bare `cargo
  test --lib` on Windows); a stylesheet or a screen's shape needs
  `npm run test:layout`; anything that adds background compute re-runs
  the click-jitter probe.
- Worktrees start without `node_modules`: copy it from the main checkout
  (robocopy) or link it, never `npm install`. When a linked
  `node_modules` is removed, unlink it first.
- `npm run tauri dev` uses the owner's real settings store and port 1420:
  one instance at a time, and workers do not start it unless the brief
  says so.
- The `reviewer` agent is required for changes under `src-tauri/src/`
  that touch the audio callback, the engine, the queue between them, or
  the settings and SQLite stores.
