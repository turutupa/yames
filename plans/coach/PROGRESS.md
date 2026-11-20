# Coach build: progress index

The order of work is `PLAN.md`. Each leg writes `progress/<leg>.md`; this file is the index the
orchestrator keeps. Newest last.

## Owner updates applied

- 2026-11-20 (`~/yames-coach-design-out/OWNER-UPDATES.md`): the model selector in the bottom rail (Off /
  local tiers / Cloud later); the selected model stays loaded app-wide; no coach start / end sessions.
  Applied as leg `ms1` in milestone 1 and as a binding decision in `plans/tasks/coach/BRIEF.md`.

- 2026-11-20, second entry: a model that is not downloaded shows its size and a Download button in the
  selector (progress, pause / resume, checksum, cancel; warnings on mobile data and low storage), on the
  existing download path; delete stays in Settings; the coach itself never downloads. Applied to ms1's
  brief, with what ms1 cannot finish as leg ms2 in milestone 1.
- 2026-11-20, third entry (corrections to the orchestrator's readings): the selector sits at the bottom
  of the RIGHT-hand coach panel (the foot of the Ask dock), not the left rail; on phones the Ask sheet's
  head and Settings → Coach; Download in the selector, not a detour to Settings; naming by model and
  size is fine. Applied to PLAN.md (decisions 1 to 3), the shared brief, ms1 and c2a1.

## What happened to wave 1's first run

The orchestrator ended its turn while waiting and the runtime stopped the three agents (and ms1's
translators) after ten minutes. Their uncommitted work stayed in the worktrees (c0: 35 files, ms1: 24,
c1a: 9). Each leg was relaunched as a fresh agent that first commits what is there as a labelled WIP.
ms1's first run had put the selector in the left rail: the relaunch moves it to the panel's foot.

## Legs

| Leg | State | Branch | Merged at | Notes |
|---|---|---|---|---|
| c0 plumbing | merged | `coach-c0` | 2026-11-20 | `progress/c0.md`. Session events go through one wrapped dispatch (the reducer is pure), not a line per dispatch site: accepted. Events are published before React commits: subscribers read the payload. |
| c1a take note | merged | `coach-c1a` | 2026-11-20 | `progress/c1a.md`. `takeNote` returns data and proposes `session.note.*` keys; c1b1 writes them. `lean` is `(number \| null)[]`. `tuningSuspected` is kept and never said. |
| ms1 model selector | running (relaunched) | `coach-ms1` | – | reviewer required |
| pm pass mark + i18n brief | running | `coach-pm` | – | |
| c1b1 line and note | running | `coach-c1b1` | – | |

After c0 + c1a on `coach`: tsc clean, vitest 381 files / 11,475 tests, build clean (logs `/tmp/coach-orch/`).
In a worktree one vitest file (`TabStage.render.test.tsx`) cannot load through the `node_modules`
symlink; it passes in the main checkout.

## Decisions recorded while building

See PLAN.md, "Things the orchestrator decided". Additions go here with the date and the reason.
