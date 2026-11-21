# Session 6's handoff (read after `HANDOFF-ORCHESTRATOR.md`'s first section and `HANDOFF-S5.md`'s "How session 5 ran")

Kept current by session 6's orchestrator. Newer than `HANDOFF-S5.md`; where they differ, this wins.
Last update: 2026-11-21, 09:30 by this machine's clock. **Session 6 ended at its context limit with NO
agent running**; `coach` is gated green at delivery 2a (vitest 52,090, layout 413 + 250; `STATUS.md`).
One branch is unmerged on purpose: `coach-rules1` (its row below). Two training jobs run in the queue
on their own (B2, then A).

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

**1r** and **delivery 2** (`STATUS.md`; the plan's d4: Ask answers and acts with the selector on
Off). At delivery 2 `coach` was gated green: tsc, vitest **52,024**, build, `test:rust` 1,280 (1,276
on the RTX at 1r), the named layout specs; **the full layout suite at 1r: 1,493 passed, 6 timeouts
that pass alone** (151 of 151). Merged after delivery 2, **not yet gated on `coach`**: t2g (the phone
make scene's failure was the spec's own double tap inside Chromium's 450 ms window, which the press
guard ignores on purpose; the spec waits now; a receipt's chip to the screen already showing goes
away), rtx2 and c3da (notes and scripts). Gate with `gates.sh` and `ask-make-phone ask-make ask
ask-tools phone-header` after the next merge.

## State (worktree `~/yames-coach-<leg>`; check `git branch --no-merged coach`, `job ls`)

| Leg | State | Next |
|---|---|---|
| **t2e** (+ t2eb: My exercises in Today) | **merged** (review `t2e-review.md`, re-read `t2eb-review.md`: MERGE, five LOW for pol3); gates on `coach`: jobs `coach-gates-s6i`, `coach-layout-s6i` (see STATUS's last line for their result) | `done-leg.sh t2e`; `smooth.spec.ts` on a quiet machine |
| **rules1** (+ rules1b; branch `coach-rules1`, worktree `-rules1`: the typed rules' defects from `progress/c3da.md` 1c) | **NOT merged: the second re-read `/tmp/coach-orch/rules1b-review.md` is MERGE AFTER FIXES with a HIGH**: rules1b's "step 0" refuses musical-note lines as grades in es / pt-BR / fr / de ("toca la nota sin vibrato", "spiel die Note ohne Vibrato": "nota / Note" is also a note, and bare "without" words became act words); "how do I improve my score?" is refused in six languages; vi bare "tắt" matches "tóm tắt" | **rules1c** on that worktree with `rules1b-review.md` as its list (count a "without" word only right before a grades word; on a question-shaped line only negation / off / stop words count; drop vi bare "tắt"; ja "なし"; M4 comparatives read after the question checks), then **a third reader** (the never-list has now been wrong in both directions: do not skip it), merge, `ask ask-tools ask-typed`. No held-out line or paraphrase in a test. The chain's rules were fixed from held-out misses, so the CHAIN numbers on those fifteen items are no longer blind: say so beside any chain figure |
| **pol2** (the polish list, first part) | **merged** (short review `pol2-review.md`: no HIGH) | **pol3**: first `pol2-review.md`'s M1 (the "Now looking at" divider still lands after a chip's answer when Ask reopens on another screen: `setLookingAt(null)` while the panel is closed, clear `unplacedFrom` in `closeAsk`) and L1 to L3 (L2: `forceReveal` renders once when Start cuts the voice: return `prev` when no message has the id); then `progress/pol2-HANDOFF.md`'s list (brief items 1, 6, 7, 12, 15b; extras A4, A6 to A11, C13); B12: raising the cards' share of the choice prompt from 300 to 320 tokens lets `suggest_path`'s short be "which Path to try next": do it in c3d2b, before the data is rendered |
| **c3d2** training | B1 done (below); **B2 (1.7B LoRA) running since about 07:30, est 9 h; A (4B LoRA, est 22 h) after it**, same lock | `job ls`; `~/scratch/yames-c3d/runs/<candidate>/RESULT.md`; `tabulate.mjs --all`, commit |

## The router (c3d): what I decided and what is next

- **B1's numbers** (0.6B full fine-tune, 610 MiB Q8_0; `evals/coach/results/2026-11-21-c3d2-b1.md`):
  held-out wrong action **1.6%** (stock 4B 8.3%, 8B 11.2% in the chain), right tool **78.7% chain /
  83.6% alone** (gate 90%), validation exact match 93.3%, 0.07 s a turn. **On the RTX's Vulkan every
  answer equals the DGX's** (`progress/rtx2.md`; 0.06 s; 1.4 GB of GPU memory; load 1.2 s); **the first
  turn after a load on a cold shader cache takes 5 to 10 s: c3d3 must warm the context with one
  throwaway decode on the worker thread.** rtx2 also ran the frozen CUDA binary once on B1's Q4_K_M
  for a side-by-side (one more line in `heldout/COUNT`; not used to choose anything).
- **`progress/c3da.md`** reads the misses: the router says "which one?" too often (16 of 30), has
  seen too few `load_preset` / `load_jam` (37 records) and `set_tempo {bpm}` (74) lines, almost no
  questions about unmeasured things that should get "none" (87 against 1,995 card records); ten
  ordered changes to the data are in its section 5 (a leg that writes training data reads sections 3
  and 5 only: section 1c quotes held-out lines). **Per language the gate cannot be read**: twelve
  languages have 9 tool calls (one miss is 89%); about 456 more hand-written held-out items bring
  them to the size of en / es / de (its own leg, sonnet writers and a second reader per language);
  until then gate on the pooled numbers and say so. On the chain's order: keep the rules first, fix
  them (rules1), and let a Path search passage end the turn only when the model says none.
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

1. **c5a1b** ("Make this my finisher": item 5 of `c5a1-jam.md`; a `confirm` tool in the registry,
   its command words, `coach.finisher` in the settings store, a planner input beside t2e's `chosen`
   (`progress/t2e.md` says where); **R: the store reviewer**) once t2e and rules1 are merged. It is
   the last tool: after it and c3c's grammar hunk the catalogue is frozen for **c3d2b**.
   Then **pol3** (what `pol2-HANDOFF.md` lists, plus: the Italian Take gender in `ask.json`; looping
   an own exercise, which t2eb only stops offering; `t2e-review.md`'s LOW items t2eb left).
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
