# Session 6's handoff (read after `HANDOFF-ORCHESTRATOR.md`'s first section and `HANDOFF-S5.md`'s "How session 5 ran")

Kept current by session 6's orchestrator. Newer than `HANDOFF-S5.md`; where they differ, this wins.
Last update: 2026-11-21, 06:45 by this machine's clock.

## How session 6 ran (what changed in the method)

- Prompts as in session 5: "read `/tmp/coach-orch/s5/RULES-INLINE.md` first" (if `/tmp` was cleared:
  `plans/tasks/coach/RULES-FOR-PROMPTS.md`), then `code-leg-prompt.md`, then the brief, then
  "decisions newer than the brief" and "beside you". Small legs had their brief in the prompt itself
  (the leg copies what matters into its progress file).
- **Every leg got a fresh reviewer, and every review but two found a sentence that could be false or
  a wrong proposal** (the list is in `STATUS.md`, delivery 1r). The reviewer's prompt asks concrete
  questions and for hand-traced examples; it writes `/tmp/coach-orch/<leg>-review.md` (first line the
  verdict, last line `VERDICT-WRITTEN`). The fix leg works on the same worktree with that file as its
  work list, merges `coach` itself and gates on the branch. A fix that changed shared code (the
  typed-command router) got a short second reader; a fix of sentences I read myself.
- **A leg that adds English sentences about what a metric or a trigger measures**: tell it (or the
  next leg) to check each sentence against the code that computes it. c2b2b found the accents pass
  mark described wrongly in four shipped places that way; tc2's review found stamina lines claiming
  "around minute N".
- **Merges**: `git merge-tree --write-tree --name-only coach coach-<leg>` first; never into the main
  checkout while a `coach-gates-*` or `coach-layout-*` job runs there; gate in batches
  (`gates-rust.sh` when Rust or a grammar file changed, else `gates.sh`; `gates-layout.sh <name>
  <specs> --workers=4` with `--lock coach-layout`). Under tonight's load (40 to 70) 30 s layout
  timeouts are normal: re-run the failed specs alone with `--workers=2` before believing them.
  `ToolCoach.test.tsx` "after Listen goes off" and `useSessionRun.startPath` fail now and then in a
  full vitest run and pass alone.
- **The RTX is in the queue** (`plans/coach/tools/rtx/README.md`): `rtx-bundle.sh coach`, a `sync`
  job, then `gate rust-lib <sha8>` (4.5 min, 1,276 tests on Windows ARM64). tsc, vitest, the build
  and Playwright cannot run there (no `node_modules` in `C:\yt-coach\wt`, no browsers): the owner's
  call. A sync writes objects and `refs/remotes/dgx/*` into the owner's repository there (said in
  STATUS). A Vulkan `coach-eval` build there is the next RTX leg (see c3d below).
- `job cancel` was refused by this session's permission mode (my own idle probe job): do not start a
  job that waits a long time for a quiet machine while legs are gating; it holds a queue slot.

## Delivered this session

**1r** (`STATUS.md`): t2c (+ t2cc), c2b2a (+ c2b2ac), rem2 (+ rem2c), tc2 (+ tc2b), c4b3 (+ c4b3b),
c2b2b, rtx1. `coach` gated green there (vitest 51,270, `test:rust` 1,280 here and 1,276 on the RTX).
Merged after 1r and gated (tsc, vitest **51,788**, build): **t2f** (the phone's Ask sheet lost every
press made with the keyboard up), **t2d** (+ t2dc: the exercise command in fourteen more languages).
The Ask layout specs after that merge: 66 passed, 1 failed (`ask-make-phone.spec.ts:88`: after the
"Open Paths" chip the Undo is still there); job `coach-layout-s6d-2` re-runs it alone three times.
**If it fails alone it is a real defect of the t2f + t2d merge** (t2f's spec passed on its branch,
before t2d): give it to a small leg. Delivery 1s is owed once that is settled and c4b4 is merged.

## State (worktree `~/yames-coach-<leg>`; check `git branch --no-merged coach`, `job ls`)

| Leg | State | Next |
|---|---|---|
| **c4b4** (companion scenes; `pathSuggest.next` reworded) | reported, gated on its branch, **not merged** only because a layout job was queued on the main checkout | test-merge, merge, `companion rail phone-learning short-window paths-prereq session` |
| **c2cc** (on `-c2cb`: the help set's review fixes `c2cb-review.md` + its scenes) | running | read `/tmp/coach-orch/c2cc-fix.diff` (the tuning refusal's patterns above all), merge → **delivery 2** (Ask answers and acts with the selector on Off). Open point from c4b4: the "Suggest a Path" chip under the heading "About your last Take:" (c2cb's `takeCards` condition should fix it) |
| **c6ab** (on `-c6a`: `c6a-review.md`: an unreadable `coach.suppressed` entry blanks the app in Settings) | running | read `/tmp/coach-orch/c6ab-fix.diff`, merge, `coach-settings settings firstrun phone-tabs reminder coach-model`; then **c6b** (docs, last) |
| **c5a1c** (on `-c5a1`: `c5a1-review.md`: the #9 called a third; the stop line beside another jam) | running | a short re-read of `/tmp/coach-orch/c5a1c-fix.diff` (`useHeard.ts` if it changed), merge, `jam jam-watch jam-coach tool-coach ask ask-tools`; then **c5a1b** ("Make this my finisher": brief item 5 of `c5a1-jam.md`; registry + command tables + settings store + `planner.ts`; **R**; after t2e merges, both add a planner input) |
| **t2e** (My exercises in Today: a store key, `PlannerInput.chosen`, the runner's custom documents) | running | **R: the store reviewer on `/tmp/coach-orch/t2e-review.diff`** (store, `planner.ts`, `useSessionRun.ts`), fix, merge, `gates.sh` + `today-line my-exercises coach-session short-window phone-learning planner swap smooth` |
| **c3d2** training | **B1 (0.6B full) finishes about 07:45**; B2 (1.7B LoRA) and A (4B LoRA) follow on the same lock | see "The router" below |
| **full layout suite** | job `coach-layout-full-s6` (low priority, in `~/yames-coach-night` at delivery 1r) | read `/tmp/coach-orch/layout-full-s6.log`; a real failure gets a small leg |

## The router (c3d): what I decided and what is next

- **The three candidates running are a SELECTION run** on the old prompt (seven cards, long card
  lines). The choice prompt has changed since (21 cards, each with a hand-written `short`; 1,397 of
  1,400 tokens) and will change again: c5a1b adds a tool (`make_finisher`), c3c adds the "advice"
  alternative to the grammar. So: read each candidate's `RESULT.md` (`tabulate.mjs --all`, commit the
  table), pick the size and recipe, and **when the catalogue is frozen (after c5a1b and c3c's grammar
  hunk) run leg c3d2b**: re-render the training data and the held-out items' prompts from `coach`,
  add training records and hand-written held-out items for the 14 cards and the tools added since
  (never from the held-out set), re-measure stock on the new prompt, train the winner again (own lock
  name per job, honest `--ram` / `--gpu`; `dgx-mode full` exists if a job waits for memory).
- The gate: in the chain, wrong action under 2% and right tool at least 90%, per language.
- Then **c3d3** (the app loads the router: Rust in `coach.rs`, **R**, the probe with it loaded; an
  optional download in the selector, pinned by SHA-256, a GitHub Release asset: the relay confirms
  with the owner before the first upload; Settings → Coach's Answers group has room for its row) and
  a **Vulkan measurement on the RTX** (build `coach-eval` there as pv1 built the probe).
- The cards' 300-token share is full: `suggest_path`'s short is "a Path". If a card is added, raise
  the share or shorten others, and say so (the router is trained on it).

## Not started, in the order I would run them

1. **pol2** (`pol2-tools-and-ask.md`) after c2cc merges (it touches every Ask file). Add to its list:
   `rem2c-review.md` L1 to L6; `t2dc-review.md` L1, L2, L5 (de "1 takt"; a bar count equal to an
   ordinal fret; the missing cases); `c2b2ab-review.md` leftovers; c2b2b's: a long quote cut between
   words into two blocks each with its own source line, the "accents landed N%" strings, the Italian
   Take gender; c4b4's: the plateau button shows a time with the day, the suggestion card 34 px short
   of the grid on Paths; t2d's: the old receipt keeps its "Open Paths" chip on Paths; `c6a-review.md`
   L3, L4; the two flaky tests named above; plus HANDOFF-S5's list.
2. **tc3**: about 60 tip lines that credit a hand ("Picking hand is landing before the click") or
   give body instructions, and two lines named in `progress/tc2b.md`.
3. **"Hear it"** for an exercise's preview (no door plays an Exercise outside a Session: its own leg,
   audio reviewer).
4. **c3c** (prose), **c6b** (docs, last).
5. **Quiet-machine items, still owed**: `/tmp/coach-orch/s6/probe-all.sh` (the five hear-back probe
   runs; the binary is built at `/tmp/coach-orch/s6/probe/click-jitter-probe`; rebuild if `engine.rs`
   moved), `smooth.spec.ts` alone, the e2e probe for the hear-back chip. Tried at 03:26: the load was
   69 (another account's Rust suites) and every run was skipped.

## Decisions made this session

- Each fact card has a hand-written `short` for the choice prompt (not "the first three words").
- A milestone's "was shown" stays in memory only (nothing stored without a press): it can show again
  on a later launch until the next Session.
- The wizard's question "Should the coach also answer in its own words?" stays if a loaded model
  does answer free questions with labelled general advice (c6ab verifies).
- German / Polish / Russian "b" is left unread (not read as B flat) in typed scale and chord names.
- Bare 五声 / "ngũ cung" is left unread (it is not the minor pentatonic to everyone).
- c5a1 was cut to its items 1 to 4; the finisher tool is c5a1b.

## Questions with the owner (in STATUS 1r; none blocks a leg)

The wizard's fallback instrument reads as chosen; a milestone can repeat across launches; the
fatigue tips have no detector; Jam's stop line needs chord names off (an engine change would lift
that); the RTX sync writes into the owner's repository there.
