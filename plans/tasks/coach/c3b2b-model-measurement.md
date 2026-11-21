# Leg c3b2b: stock Standard and Studio measured on the held-out tool set; the per-language switch filled

Worktree `/home/dgx-delgado/yames-coach-c3b2b`, branch `coach-c3b2b`. Logs under `/tmp/coach-c3b2b/`.

> **Question for the orchestrator before launch: the two model files are not on this machine.**
> Found on the DGX on 2026-11-20: `~/scratch/yames-c3a-models/Qwen3-0.6B-Q8_0.gguf` (639 MB) and
> `~/scratch/pr2012/models/Qwen3.8-27B-UD-Q4_K_M.gguf` (16.5 GB, another project's), nothing in
> `~/.cache/huggingface/hub` of Qwen3 4B or 8B, no app data folder (`~/.local/share/com.yames.metronome`
> does not exist). The leg needs `Qwen3-4B-Q4_K_M.gguf` (2,497,280,256 B, SHA-256 `7485fe6f…34fdf5`)
> and `Qwen3-8B-Q4_K_M.gguf` (5,027,783,488 B, `d98cdcbd…745785`), the files `BRAIN_ARTIFACTS` pins
> (`progress/ms2.md`). The leg downloads nothing: someone with the right to download puts them in
> `~/scratch/yames-c3a-models/` and the leg checks both hashes before the first run.

PLAN's c3b, the measuring half. **Needs c3b2a merged.** It edits `scripts/coach-eval.mjs`,
`src-tauri/src/bin/coach-eval.rs` and one data line in `src/coach/ask/model.ts`; it may run beside any
leg that does not touch those (the c5, c6, rem2 legs; not c3c, which edits `model.ts`).

Read: `plans/coach/progress/c3b1.md` (the harness, its flags, the rule baseline, "For c3b2"),
`c3b2a.md`, `c3a.md` (finding 6, "Numbers"), `PROGRESS.md` (the probe section). Design: `TOOLS.md`
3.5 (the four ways and the gates), `DESIGN.md` 5.5. `OWNER-UPDATES.md`: the relay's Vulkan numbers for
Qwen3 4B on the RTX will be appended there; latency on the target comes from them, not from here.

## What the DGX can and cannot measure (found 2026-11-20)

- **Build**: `coach-llm` (CPU) only for the app's features. This DGX has no Vulkan headers and no
  `glslc` (PROGRESS, pv1); do not start pv1 here (OWNER-UPDATES 20:05). CUDA 13 (`nvcc`) is installed
  and llama-cpp-2 0.1.146 has a `cuda` feature: an **eval-only** Cargo feature `coach-llm-cuda`
  (`["coach-llm", "llama-cpp-2/cuda"]`, never in a shipped build, never with another backend) would
  run the accuracy set on the GB10 in minutes. Optional, judgement call 7: try it once as a queue job;
  if it does not build in one attempt, use the CPU and say so.
- **Accuracy** does not depend on the backend (greedy under a grammar): measure it here. **Latency on
  a player's machine** does: report the DGX's times as the DGX's, and take the target's from the
  relay's RTX numbers (Qwen3 4B Q4_K_M, Vulkan). If those are not in OWNER-UPDATES when you finish,
  say the latency gate is owed.
- **Time** (an estimate to replace with a measurement): on the CPU, about 3 to 6 s an item for the 4B
  and twice that for the 8B with the prefix cached, so a 300-item run is about 15 to 30 min (4B) and
  30 to 60 min (8B); six model runs, 3 to 5 hours of queue time. First run **20 items** of each model
  (`--ram 8G` for 4B, `--ram 12G` for 8B, `--est 10m`), then declare `--est` from that. Set
  `--setenv YAMES_LLM_THREADS=8` so the run leaves the machine to other legs' gates.

## What to build

1. **The ways of TOOLS 3.5**, as harness flags: (a) **plain**: no grammar, the descriptions in the
   prompt, the output parsed as JSON (malformed = no answer); (b) **grammar, names only**: c3b1's grammar,
   tool and card names without descriptions; (c) **grammar and descriptions**: c3b1's `choicePrompt` as
   the app sends it. The fourth way, a trained model, is c3d's. Tests: each flag builds the request it
   names (a fixture per way); `--out` is required (never a fixed `/tmp` path).
2. **The chain's numbers**: besides the model alone, score what the app does: router, cards, help
   first; the model only on the items they left (c3b2a's order). This is the number that ships.
3. **The runs**, each a queue job: rules baseline (`--engine rules`, again on today's `coach`), then
   Standard (a), (b), (c), then Studio (a), (b), (c). Results under
   `/home/dgx-delgado/yames-coach-c3b2b/evals/coach/runs/<date>-<model>-<way>/` (`results.json`,
   `summary.md`), committed. The set's file hashes checked against c3b1's before every run.
4. **The table per language** in `plans/coach/progress/c3b2b.md`: right tool, right arguments,
   wrong-action rate, asked when unsure, no-answer column (by status), median and slowest tenth, for
   every model × way and for the chain. Gates read from it: **right tool ≥ 90%** turns free wording on
   in that language for that tier; **wrong action < 2%** is recorded for the owner's later "goes at
   once" question and changes nothing in this build (model calls stay one-press, c3b2a).
5. **Fill `MODEL_LANGS`** in `model.ts` from the table, way (c) only, a language with fewer than 20
   items stays off; a test pins the list to the committed `summary.md`.
6. **A tip's time with and without the cached Ask prefix** (c3a review finding 6): a `--tip-latency`
   mode in `coach-eval.rs`, same model and backend, ten tips with the Ask prefix resident and ten after
   `AskPrefix::forget`. If the resident prefix costs a tip more than 10%, add the forget before a tip
   in the worker (that is Rust in `coach.rs`: **R**, and the probe follows) or say it is owed.
7. **Verdict for c3d** in the progress file: for each tier, "meets the gates in N of 15 languages" and
   whether a router is wanted (any language below 90% in the chain, or a chain median over 8 s on the
   relay's target numbers).

## Not yours

The wiring (c3b2a). Training (c3d). A probe on this DGX with a model (the c3a set is the orchestrator's
on a quiet machine; the target's is the relay's). Downloading a model.

## Gates

tsc, vitest, build; `npm run test:rust` if `coach-eval.rs` or `coach.rs` changes (and with
`--features coach-llm` and `YAMES_TEST_GGUF` for the new mode). No layout run.

## Report

As the rules block's "The end of the leg": the table per language (way (c) and the chain), the run
times as measured, which build ran, the hashes, the switch as filled, the tip-latency numbers, the
verdict for c3d, and a "diff for review" paragraph for any hunk in `coach.rs` or `Cargo.toml`.
