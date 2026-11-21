# Session 5's handoff (read after the first section of `HANDOFF-ORCHESTRATOR.md`, "How this build runs")

Kept current by session 5's orchestrator. Newer than every "SESSION" section in
`HANDOFF-ORCHESTRATOR.md`; where they differ, this wins. Last update: 2026-11-21, 02:45 by this
machine's clock.

## How session 5 ran (what changed in the method)

- **Every agent's prompt** is three parts: "read `/tmp/coach-orch/s5/RULES-INLINE.md` first" (the
  rules block; if `/tmp` was cleared, `plans/tasks/coach/RULES-FOR-PROMPTS.md` is the same list),
  `code-leg-prompt.md`, the leg's brief, then "decisions newer than the brief" and "legs beside you".
- **A fix leg works on the leg's own worktree** with the review file as its work list, then runs
  `git merge coach` itself and gates on the branch; the orchestrator test-merges
  (`git merge-tree --write-tree --name-only coach coach-<leg>`), merges, and gates `coach` in batches.
- **A reviewer writes `/tmp/coach-orch/<leg>-review.md`** whose first line is the verdict and whose
  last line is `VERDICT-WRITTEN`; wait with `wait-until --timeout 585 file … --grep VERDICT-WRITTEN`.
  Session 5's reviews found, again, a real defect in almost every leg (see `PROGRESS.md`): never skip
  one, and re-read a fix that touches the runner, a store or a sentence.
- **The Playwright lock is the bottleneck** (a dozen legs, one suite at a time, ten minutes each).
  The orchestrator's gates are split: `gates.sh` / `gates-rust.sh` with NO spec (no lock), and
  `plans/coach/tools/gates-layout.sh <log-name> [--in <checkout>] [specs]` with `--lock coach-layout`.
- **Under a load of 60 to 100** (all night): vitest takes 600 s instead of 160 s and a few 20 s to
  30 s tests time out (they pass alone; `packs`, `take`, `train` now have 120 s); `test:rust` loses
  one or two wall-clock tests (TTS, synth, harmony worker; they pass alone); `smooth.spec.ts` says
  nothing. Re-run a failure alone before believing it: `job submit … -- bash run.sh npx vitest run <files>`
  or `node scripts/rust-test.mjs --lib -- <module>`.
- **A leg's script once wrote an untracked file into the main checkout** (`src/locales/en/toolTips.json`)
  and failed the gate there: check `git status --porcelain` on the main checkout before a gate
  (`rm` asks: move a stray file to `~/scratch/`).

## Delivered this session

1o, 1p and 1q (`STATUS.md`). **`coach` is gated green at 1q** (c3b2a, lf1, c4b2 merged): tsc, vitest
50,370, build, `test:rust` 1,279, layout 467 on eleven specs (+1 load timeout that passes alone).
c3d2's scripts merged after that gate (nothing under `src/` or `src-tauri/`; one option added to
`scripts/coach-train.mjs`): the next gate covers it.

**Session 5 ended at its context limit with NO agent running.** Three training jobs run in the queue
on their own (the c3d2 row). Three branches are built, fixed and gated on their branch but NOT merged,
each waiting for one thing: `coach-rem2` (a bounded Songs read in the store), `coach-t2c` (a re-read
of its fix), `coach-c2b2a` (a re-read of its fix). Their rows say exactly what.

## State at the end (worktree `~/yames-coach-<leg>`; check `git branch --no-merged coach`)

| Leg | State | Next |
|---|---|---|
| **c3d2** (training; `progress/c3d2.md`; branch merged: scripts and the stock table only) | **The agent is finished; three queue jobs run with no agent**, one at a time (lock `coach-c3d-train`), from a frozen copy of the code at `~/scratch/yames-c3d/code/b5170fca`: `coach-c3d2-b1-06b-full` (the small router: about 4.8 h from 03:00), `coach-c3d2-b2-17b-lora` (est 9 h), `coach-c3d2-a-4b-lora` (est 22 h, low priority). The trial (0.6B LoRA, 300 steps): validation exact match 72% (Q8_0) / 64% (Q4_K_M) against the stock 4B's 28%; its misses lean to "none". **Stock on the 447 items, today's prompt** (`evals/coach/results/2026-11-21-c3d2-stock-447.md`): 4B chain right tool 82.0%, wrong action 8.3%; 8B chain 87.4%, 11.2%; no language passes. | `job ls`; read `~/scratch/yames-c3d/runs/<candidate>/STATUS` and `RESULT.md`; a stopped job is re-submitted with the same command and a `-2` name (it continues: `progress/c3d2.md` has the line); then `node evals/coach/train/env/tabulate.mjs --all ~/scratch/yames-c3d/runs evals/coach/results/<date>-c3d2.md` and commit. Not proven: converting B1's epoch-1 snapshot; the 1.7B and 4B merges at full size. The verdict decides c3d3 (the app loads the router: Rust in `coach.rs`, **R**, the probe with it loaded; hosting is the owner's decision) and which languages `MODEL_LANGS` gets. Gate: wrong action under 2% and right tool at least 90% in the chain, per language. |
| **rem2** (branch `coach-rem2`, with rem2b's fixes, `coach` merged in at 1p, gated on its branch: vitest 50,335, layout 135) | **NOT merged: the re-read (`/tmp/coach-orch/rem2b-review.md`) is MERGE AFTER FIXES.** M1: counting a Songs pass as practice (my decision) reads every stored attempt of every song on each check (megabytes for a big library; can land in a Take's first second). | **rem2c**, a small leg on that worktree: `since: Option<i64>` on `AttemptQuery` (`AND started_at >= ?` in `attempts_sql`, `src-tauri/src/db.rs`) or one read-only command returning `started_at` for all songs since a time; pass local midnight 21 days back; **R: the store reviewer**, `gates-rust.sh`; plus that review's LOW (a Takes read that fails reads as "no Takes"; the rest listed there). Then merge, layout `reminder today-line settings short-window`. If the owner prefers the smaller route: drop Songs from "practice" and reword the hint to "no Session yet" in fifteen locales. Open for the owner: the line says "guitar" for a bass player (L7). |
| **c4b2** (+ c4b2b, c4b2c) | **MERGED after 1p** (review, re-read, a third round whose tests were shown to fail on the old code; `progress/c4b2.md`, `c4b2b.md`, `c4b2c.md`). Gates on `coach`: jobs `coach-gates-s5d` and `coach-layout-s5d` (see "The last gate" below). `done-leg.sh c4b2` is owed. | **c4b3**: milestones beyond "+20 BPM" (each with a not-fair test), the Path suggestion and its `intents.ts` entry, fourteen locales for `companion.json` (the keys in `c4b2b.md` and `c4b2c.md`; keep `{{n}}`), scenes and a Progress seed with three Sessions last week. Open for the owner: "seen" is per app run; should On also lift a first Hide's seven days (today it does). |
| **t2c** (+ t2cb; branch `coach-t2c`, `coach` merged in before lf1 and c4b2, gated on its branch: vitest 50,502, layout 39) | **NOT merged: the fix leg's re-read is owed.** `progress/t2cb.md`; the fix commit is `04c9351e` (diff it alone: `git -C ~/yames-coach-t2c diff 04c9351e^..04c9351e -- src ':(exclude)src/locales'`). | A fresh reviewer on that commit: the typed matcher above all (the `recipe.article` rule: "a" is the root A only after "an / the / in" or before "minor/major pentatonic / 7"; what still proposes and what no longer does is listed in `t2cb.md`), the `settling` Undo state, `UNDO_AFTER_LATER`. Known: a MODEL's `make_exercise` call does not wait for the generator (refused as "loading"). Then merge (test-merge first: `AskToolTurn.tsx`, `askTools.ts` met c3b2a's hunks once already), gates `ask ask-tools ask-typed`; then **t2d** (fourteen word lists incl. the `recipe` group, Today's part, scenes; "Hear it" needs its own leg). |
| **c2b2a** (+ c2b2ab; branch `coach-c2b2a`, `coach` merged in before lf1 and c4b2, gated on its branch: vitest 50,746, `paths check`, layout 41) | **NOT merged: the fix leg's re-read is owed.** `progress/c2b2ab.md`; the fix commit is `d313b20e` (+ `8c6fa67c`, `823ddb8c`: the cards' short lines past the budget, the grammar fixture). Thirteen cards; the review's three HIGH are fixed with hand-written tests (the running Session's plan; each chord quality placed in a key, only scales holding every chord tone; a letter table for every quality: C9 = C E G Bb D). | A fresh reviewer on `git -C ~/yames-coach-c2b2a diff d313b20e^..823ddb8c -- src ':(exclude)src/locales'`: the `PLACED` table and five chords by hand, `CoachRun.plan` / `startedAt` (the bus's payload and `contextForModel` grew), `noteForTake` shared with the result screen, `cardLines`' short form (the prefix is 1,361 of 1,400; **the training data was rendered with the long card lines for seven cards: re-render before the next training run, or the router sees a prompt it was not trained on**). Then merge, gates `ask ask-tools ask-cards`; then **c2b2b** (sources line, fourteen locales, scenes; scale names through `SCALES[id].labelKey`) and **c2cb** (the help set: plugs into the answerer stack) → **delivery 2**. Open for the owner: `pass_mark_ms` answers a player who chose no grading. |
| **lf1** | **MERGED after 1p** (`progress/lf1.md`): Watch and Sound transitioned their size while the footer's fit was measured; the tools' bar could not shrink in German at 1024. | The full layout suite; watch tool bars between 900 and 1199 px (readouts stacked) and any other measured row still under `button { transition: all }`. |

## Not started, in the order I would run them

1. **The full layout suite**: `git -C ~/yames-coach-night merge --ff-only coach`, then
   `job submit --name coach-layout-full --ram 8G --est 40m --lock coach-layout --cwd ~/yames-coach-night -- bash ~/yames-coach-build/plans/coach/tools/gates-layout.sh layout-full --in /home/dgx-delgado/yames-coach-night`
   (after lf1 merges; text changed on Ask, Today, the result, Songs' review, the tools' tips).
2. **On a quiet machine (load under 6)**: the click-jitter probe for the hear-back
   (`plans/coach/tools/probe-c5b1.sh`; five runs; c5b1c changed the probe's arithmetic),
   `smooth.spec.ts` alone, the e2e probe for c5b2 (`npm run test:e2e:probe -- --no-build`).
3. **c2b2b ‖ c2cb ‖ c4b3 ‖ t2d** (after their parents merge), then **delivery 2** and **delivery 3**.
4. **pol2** (`pol2-tools-and-ask.md`, plus: `int1b-review.md`'s six LOW, `c4a2b-review.md`'s three
   LOW, chip1's fast-tap LOW, lb1b's three LOW, `c3b2ab-review.md` LOW 1 and 3, `c5b2-review.md` L5).
5. **tc2**: about 55 more tip lines (fatigue, check-in, stamina) that give the body as the reason;
   widen the lint (`progress/tc1.md`).
6. **c5a1** (Jam's line, theory answers on Jam, the finisher: high size risk, split at 170k), **c3c**
   (prose, after the router's verdict), **c6a** (Settings → Coach regrouped: the reminder row, the
   phone's "Practice reminder" section, the wizard's coach step), **c6b** (docs, last).
7. **For the leg that turns a language on (c3b2b / c3d3)**: `c3b2a-review.md` L1 (a Vulkan build with
   no usable GPU runs the model on the CPU while the gate says GPU; seed the CPU median), L4 to L6;
   `evalWorld.contextFor`'s `run.ungraded: false` (`progress/c3int.md`); the adapter-beside-stock
   artifact against the merged GGUF the training leg measures.

## Decisions made this session (also in `PROGRESS.md`'s rows)

- The choice prompt stays at c3bp's revision 2 (what the router is trained on); the stock models stay
  dark: better-formed calls raised wrong actions (4B 11% → 16%, 8B 7.5% → 15.5% in the chain).
- The prefix budget is 1,400 tokens (tools 1,100, cards 300).
- The due Songs line is gated on the raw input (a player with only My-exercises Takes gets it).
- The hear-back chip names the played bar for "yours" and the tune's bar for the demo.
- A Songs pass counts as practice for the reminder.
- Router candidates: 0.6B full fine-tune first (the small router), then a 1.7B LoRA, then a 4B LoRA;
  selection on the validation file only; the held-out set once per finished candidate.

## Worktrees left

`-night` (the pinned checkout for the full suite), `-base` (scratch), and the in-flight legs above.
Merged legs' worktrees were removed with `done-leg.sh` (branches kept).
