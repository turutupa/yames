# Phase 0 task briefs — "Ship the brain everywhere"

Each `T0x-*.md` file is a self-contained brief for one coding agent
session (Opus 5 or similar). Hand a worker exactly one file. The worker
must read `AGENTS.md` and `plans/ROADMAP.md` §1–§5 first; the brief
tells it what to build, where, and how it is judged.

## Order and parallelism

```
T01 cargo features + local LLM builds  ──►  T02 CI release with LLM
T03 honest brain status      (parallel-safe, can start now)
T04 Qwen3 model refresh      (parallel-safe; full testing needs a T01 build)
T05 voice on Windows/Linux   (parallel-safe)
T06 click-jitter probe       (parallel-safe to write; passing needs T01)
T07 deterministic adaptive drill (parallel-safe, smallest — good first task)
```

Start T01, T03, T05 and T07 at the same time. T04 and T06 can start
in parallel too but their final gates wait for T01. T02 starts when T01
is merged.

## Rules every worker follows

- One branch per task: `phase0/t0N-short-name`. Open a PR; do not merge.
- Commit prefixes `feat:` / `fix:` trigger a release from `main`. Use
  them in the PR title only when the change deserves a release; use
  `chore:` / `refactor:` for the commits themselves.
- No file rewrites; surgical edits (AGENTS.md).
- Validation chain after every step, in this order:
  `bun run tsc --noEmit` → `bun run test` → `bun run test:rust` →
  `bun run test:dsp` → `bun run test:highbpm`. Rust changes to the LLM
  path also need `cargo test --manifest-path src-tauri/Cargo.toml
  --features coach-llm --lib` on a machine where that builds.
- The metronome click is sacred: nothing may run on the cpal callback
  thread, nothing may hold `SharedState` longer than today.
- Route every new Tauri command through `src/ipc.ts`.
- New user-visible strings go in `src/locales/en.json`; other locales
  fall back to English automatically (see `src/i18n.ts`).
- Report back with: what was done, exact commands run and their
  results, which OS you ran on, anything you could not verify, and
  open questions. Never say "done" for a gate you did not run.

## Owner's machines

Development happens on macOS (Apple Silicon) and Windows 11. CI builds
macOS (arm64 + x86_64), Ubuntu 22.04 and Windows. A worker on one OS
must say which gates it could not run.
