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
| ms1 model selector | merged | `coach-ms1` | 2026-11-20 | `progress/ms1.md`. Reviewed (independent, read-only): call order in `useSession` sound; six loader findings fixed with tests before merge (memory is a warning and never a lock; no download over a brain on disk; retryable probe; no unload before the saved choice is read; residency re-asked after a double failure; no load starts during a Path Session). One brain on disk today: the second tier's Download waits for ms2. |
| pm pass mark + i18n brief | merged | `coach-pm` | 2026-11-20 | `progress/pm.md`, `plans/COACH_I18N_BRIEF.md`. Open: the passed chip reads "Passed · Pass mark 85%" (says pass twice): c1b1 or a polish pass rewords it. pt-BR "meta" wants a native read. |
| c1b1 line and note | merged | `coach-c1b1` | 2026-11-20 | `progress/c1b1.md`. Checked against mocks 03, 06, 07: accepted. tsc, vitest 384 files / 11,718, build green on `coach`. Left one layout regression (`neck.spec` 620×780, ring gap −0.66 px): leg fix1. |
| fix1 layout regressions | merged | `coach-fix1` | 2026-11-20 | `progress/fix1.md`. Causes confirmed: pm's longer sentence wrapped on the runway's ready screen (the pass mark now hides while the input-failed card shows there); c1b1's taller head and note shrank the neck at 620×780 (fixed in `coach.css`; margin now −0.35 against −0.5, the base was −0.17: thin, watch it). Chip: "Needs 85%". **Delivery 1b.** |
| c1c loop + P1/P2 | running | `coach-c1c` | – | probe gate |
| c3ab worker review fixes | briefed, waits for a slot | `coach-c3a` | – | Reviewer on c3a: MERGE AFTER FIXES, no confirmed way to crash the app. Findings: the precheck does not bound a grammar's expanded size; one sampling step is uninterruptible; `--llm-load` can start before and finish after the measured window; a runtime dead end reported as a grammar error; a truncated answer returned as an answer. Brief: `plans/tasks/coach/c3ab-worker-review-fixes.md`. |
| c3a worker (Rust) | built, with the reviewer | `coach-c3a` | – | `progress/c3a.md` (on its branch). The grammar shipped: never in the sampler chain, every pick checked, end-of-generation never fed to accept, a precheck for the one input that hangs llama.cpp's parser. Prefix cache: a turn decodes about 40 tokens instead of about 940. Hard gates 0 in all five probe runs; p99 not readable (load 16 to 46). **Owed: the five probe runs on a quiet machine** (`bash /tmp/coach-c3a/probe-set.sh`) and the same with Qwen3 4B on Vulkan on the owner's machine. Model used: Qwen3-0.6B-Q8_0 (639 MB, `~/scratch/yames-c3a-models/`). |
| c2a1 Ask shell | built; review fixes running (c2a1b) | `coach-c2a1` | – | `progress/c2a1.md` (on its branch). Reviewer: `useSession` clean; six findings in the shell (focus stolen after a Take, the dispatcher rebuilt per beat, the tour's coach stop, a per-beat re-render of the open panel on tool screens, the recap closing Ask, an answer landing during a Take). `messages` (the tools' feed) stays in `useSession`; Ask's conversation is `askStore`. |
| ms2 selector downloads | running | `coach-ms2` | – | reviewer required (Rust, model store) |

**Delivery 1a (2026-11-20):** c0 + c1a + pm + ms1 on `coach`: tsc clean, vitest 382 files / 11,508
tests, build clean, layout `coach-model`, `rail`, `coach-blocks`, `settings` 43 passed (logs
`/tmp/coach-orch/`; one vitest run under a load average of 70 reported a worker RPC timeout with every
test passing, and was clean on the re-run). `plans/coach/tools/gates.sh` is the post-merge gate command.

After c0 + c1a on `coach`: tsc clean, vitest 381 files / 11,475 tests, build clean (logs `/tmp/coach-orch/`).
In a worktree one vitest file (`TabStage.render.test.tsx`) cannot load through the `node_modules`
symlink; it passes in the main checkout.

## Decisions recorded while building

See PLAN.md, "Things the orchestrator decided". Additions go here with the date and the reason.

- 2026-11-20. **The cue legs move up** (c4c and `cues` start beside milestone 2, not in milestone 3).
  c1b1 measured it: 825 of 1,010 Exercises have a `coachLine` longer than 48 characters, so their Takes
  show no order at all, and many of the 185 that fit are not orders. "Feedback as you go" during a Take
  is mostly absent until the short cues are written. List: `progress/c1b1-long-cues.txt`.
- 2026-11-20. **The ready note between Takes is rarely seen**: "Go again" starts the count-in straight
  away (the design's mock 03 assumed a ready screen). The finding lives on the result, and so will the
  "one thing to try" once cues exist: c4c puts the cue chosen by the finding under the finding on the
  result, as well as on the ready note and as the Take's order. `bigAction` is not changed for this.
- 2026-11-20. **A leg that changes any text on a screen runs the full layout suite**, not only that
  screen's specs: pm's longer sentence broke a short-window scene in one theme that none of its named
  specs covered, and delivery 1a went out with it (fixed in fix1). Added to the shared brief.
- 2026-11-20. **`run.sh` sets `TMPDIR=/tmp/coach-tmp`.** `/tmp` is shared with the other account, which
  runs the same Rust suite: `take_video`'s fifteen tests write fixed names under `temp_dir()` and failed
  here with PermissionDenied on that account's folders (c3a's run). Not a code defect.
- 2026-11-20. `tuningSuspected` stays always false for now: the Session does not keep the pitch
  verdicts the note would need. Nothing is said about tuning in any case (owner decision 9).
