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

1o and 1p (`STATUS.md`). `coach` was gated green at 1p (`eb118004` + docs): tsc, vitest 50,237,
build, `test:rust` 1,276 (+1 timing test that passes alone), layout 243 on eight specs. **Merged after
1p, not yet gated on `coach`: c3b2a** (the model's wiring, dark; reviewed and re-read: MERGE).

## In flight when this was written (worktree `~/yames-coach-<leg>`; check `git branch --no-merged coach`)

| Leg | State | Next |
|---|---|---|
| **c3d2** (training) | running: builds `evals/coach/train/env/pipeline.sh`, a one-hour trial, the stock 4B / 8B re-measured on the 447 items, then queue jobs `coach-c3d2-stock`, `coach-c3d2-b1-06b-full`, `coach-c3d2-b2-17b-lora`, `coach-c3d2-a-4b-lora` (lock `coach-c3d-train`) that run with no agent | read `~/scratch/yames-c3d/runs/<candidate>/STATUS` and `RESULT.md`; merge `coach-c3d2` (scripts, tables); the verdict decides c3d3 (the app loads the router: Rust in `coach.rs`, **R**, the probe with it loaded; hosting is the owner's decision) and which languages `MODEL_LANGS` gets. Gate: wrong action under 2% and right tool at least 90% in the chain, per language. |
| **rem2b** (on `-rem2`) | fixing the review (`rem2-review.md`): a midnight timer; **decided: a Songs pass counts as practice**; nothing of the reminder runs during a Take; no re-read per press | re-read `/tmp/coach-orch/rem2b-fix.diff` (the store, the timers), merge, layout `reminder today-line settings short-window` |
| **c4b2b** (on `-c4b2`) | fixing the review (`c4b2-review.md`: five MEDIUM) | re-read `/tmp/coach-orch/c4b2b-fix.diff`, merge, `gates-rust.sh`; then **c4b3** (milestones beyond "+20 BPM", the Path suggestion, a `CompanionCard` render test, fourteen locales, scenes) |
| **t2cb** (on `-t2c`) | fixing the review (`t2c-review.md`: the typed matcher's wrong proposals; the store door's test; the "Open My exercises" chip) | re-read `/tmp/coach-orch/t2cb-fix.diff` (the matcher above all), merge; then **t2d** (fourteen word lists, Today's part, scenes; R if `planner.ts` changes) |
| **c2b2ab** (on `-c2b2a`) | fixing the review (`c2b2a-review.md`: H1 plan cards read Today's plan, H2 scales that clash, H3 chord spelling) | re-read `/tmp/coach-orch/c2b2ab-fix.diff` (music theory by hand), merge; then **c2b2b** (sources line, fourteen locales, scenes; `theory.scale` names through `SCALES[id].labelKey`) and **c2cb** (the help set: plugs into the answerer stack) → **delivery 2** |
| **lf1** | two layout scenes that fail on `coach` itself (the phone Session footer at 360 px; the tools' header in German at 1024) | merge, then the full layout suite |

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
