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
| c0 plumbing | running (wave 1) | `coach-c0` | – | |
| ms1 model selector | running (wave 1) | `coach-ms1` | – | reviewer required |
| c1a take note | running (wave 1) | `coach-c1a` | – | |

## Decisions recorded while building

See PLAN.md, "Things the orchestrator decided". Additions go here with the date and the reason.
