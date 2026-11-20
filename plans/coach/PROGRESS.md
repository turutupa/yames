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
| c1c loop + P1/P2 | merged | `coach-c1c` | 2026-11-20 | `progress/c1c.md`. Checked against mock 07: accepted. The loop lives in `RunState.loop` beside its Exercise (a plan step would count against the minutes). On `coach`: tsc, vitest 390 files / 11,860, build, layout `coach-loop`, `coach-session`, `ask`, `neck`, `short-window` 168 passed; its own full layout suite 1,285 passed, 0 failed. Probe `--song-loop --song-take` at load 12 to 13: 0 missed, 0 / 0 allocations and frees, 0 dropped; **p99 owed on a quiet machine** (`bash plans/coach/tools/run.sh bash /tmp/coach-c1c/probe.sh`; it needs `XDG_RUNTIME_DIR=/run/user/1000`). **For a polish leg:** under P1 the row has both "Up to N" and "Faster"; a fixture shows "10 bars in a row held" above a strip with two crossed bars (check the label against real data); the last block's P2 button reads "See how it went". |
| ms2 + ms2b | **merged** 2026-11-20 after two reviews; the re-read's defect (a cancelled download renamed over `model.bin` on the check-skip path) and two races fixed with tests. On `coach`: `test:rust` 1,218, tsc, vitest, build, layout 88. Known limits written in `progress/ms2.md`. Owed: Windows. The row below is the first review. | `coach-ms2` | 2026-11-20 | Reviewer on ms2: MERGE AFTER FIXES. One confirmed path (rare: a crash window in the old build) files an old brain under the wrong tier and a later download renames over it; a same-tier conflict leaves the player stuck; a superseded download thread shares the part file; stale residency; marker written before the rename; leftovers; plus the download command accepts any URL. All in the fix brief (the agent's prompt). |
| c4c cues field | merged | `coach-c4c` | 2026-11-20 | `progress/c4c.md`, `plans/coach/CUES_GUIDE.md`. 436 cues on all 59 Exercises of Alternate Picking, fifteen languages, proof-read by a separate reader (66 objections, most taken). A sample read by the orchestrator: orders, concrete, no diagnosis. `cueFor(exercise, note)`; the where-facts (after a held note, open string, shift) are read off the slipped bars' notes in `src/paths/cues.ts`. On `coach`: tsc, vitest 393 files / 13,687, build, layout 153 passed. Open: the neck version of the "Go again" order scene is missing from `smooth.spec`; de / fr / it / es want a native read. **Delivery 1c.** |
| cues for the other fifteen Paths | not started | – | – | Brief from `CUES_GUIDE.md`: `specs/<path>-cues.ts` with `withCues`; one general cue per Exercise and one per trigger it can produce; a separate proof-reader before translating; four Paths a leg. |
| c3ab worker review fixes | merged with c3a | `coach-c3a` | 2026-11-20 | Reviewer on c3a: MERGE AFTER FIXES, no confirmed way to crash the app. Findings: the precheck does not bound a grammar's expanded size; one sampling step is uninterruptible; `--llm-load` can start before and finish after the measured window; a runtime dead end reported as a grammar error; a truncated answer returned as an answer. Brief: `plans/tasks/coach/c3ab-worker-review-fixes.md`. |
| c3a worker (Rust), with c3ab | **merged** 2026-11-20 after two reviews (every finding fixed with a test: expanded-size and parse-stack bounds in the precheck, a deadline, `truncated` / `deadEnd` / `timedOut` results, the probe's window). On `coach`: `test:rust` 1,177 passed, tsc, vitest 390 files / 11,867, build. Still unbounded and documented: several live parses of an ambiguous grammar; one prompt chunk and one sampling step are uninterruptible. Nothing calls `coachAsk` yet (c3b). The row below is the build's own notes. | `coach-c3a` | 2026-11-20 | `progress/c3a.md` (on its branch). The grammar shipped: never in the sampler chain, every pick checked, end-of-generation never fed to accept, a precheck for the one input that hangs llama.cpp's parser. Prefix cache: a turn decodes about 40 tokens instead of about 940. Hard gates 0 in all five probe runs; p99 not readable (load 16 to 46). **Owed: the five probe runs on a quiet machine** (`bash /tmp/coach-c3a/probe-set.sh`) and the same with Qwen3 4B on Vulkan on the owner's machine. Model used: Qwen3-0.6B-Q8_0 (639 MB, `~/scratch/yames-c3a-models/`). |
| c2a1 Ask shell (+ c2a1b fixes) | merged | `coach-c2a1` | 2026-11-20 | `progress/c2a1.md`. Reviewer: `useSession` clean; six findings in the shell, all fixed with tests (focus consumed once; the dispatcher and the open panel no longer rebuilt per beat, plus a second per-beat rebuild the review missed; the tour's stop on the rail's Ask row; the Session's teardown no longer closes Ask; an answer arriving during a Take is held until it ends). The note's sentence, the recap line and each bar cell open Ask (not on a phone: targets under 44 px). On `coach`: tsc, vitest 387 files / 11,768, build, layout `ask`, `coach-model`, `neck`, `short-window`, `tour` 150 passed. **Open, for a polish leg:** with Ask open in a Session at 1024 px the head (with the Neck / Runway / Tab switch) and the note are partly covered by the drawer; DESIGN 3.3 wants the result's text column whole. |
| ms2 selector downloads | built, with the reviewer | `coach-ms2` | – | `progress/ms2.md` (on its branch). Both tiers on disk (`models/brain/<tier>/`, the old single brain adopted by one rename; eleven migration states tested); Pause / Resume / Cancel; SHA-256 pinned for both files from Hugging Face's published LFS hashes; low-storage refusal; bytes. No new commands (optional arguments). Windows free-space call not compiled here: **`npm run test:rust` once on the RTX is owed.** Metered warning only where the webview reports it. |
| c2a2 Listen, no Start | running | `coach-c2a2` | – | reviewer required (`useSession`) |

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
