# Leg c3d: a trained router for tool choice: a plan to launch on c3b2b's numbers (c3d1, c3d2; c3d3 only if it wins)

Worktrees `/home/dgx-delgado/yames-coach-c3d1` / `-c3d2` / `-c3d3`, branches `coach-c3d1` / `-c3d2` /
`-c3d3`. Logs under `/tmp/coach-c3d1/` and so on.

**Launch only on c3b2b's verdict**: the owner approved training on 2026-11-20 18:35 (OWNER-UPDATES)
"once the LLM probe has measured the stock Qwen3 4B / 8B on tool selection and latency, and if they fall
short on either". Short means: in the chain (c3b2b item 2), right tool under 90% in a language for a
tier, or a median turn over 8 s on the target (the relay's RTX numbers). Read c3b2b's "Verdict for c3d"
first; if it says no router is wanted, this brief is not launched. Design, read-only: `TOOLS.md` 3.1 to
3.6 (the data plan, what training can and cannot fix, the costs), `DESIGN.md` 13 ("Fine-tuning", T4,
T5). Progress: `c3b1.md` (the held-out set, its hashes), `c3b2b.md` (the table), `t1a1.md` (the runner
as the judge), `c3a.md` (the worker, the grammar).

## What I found on this machine (2026-11-20; marked **unknown** where I could not find out)

- **No Python environment of the build's own.** Two services' virtualenvs have CUDA PyTorch:
  `~/services/photo-studio/venv` (Python 3.12, torch 2.14.1+cu130, transformers 5.23.0, safetensors,
  tokenizers, sentencepiece) and `~/services/openwebui/venv` (torch 2.15.0 with CUDA 13 libraries,
  transformers 5.5.4, accelerate 1.13.0, scikit-learn 1.9.1, sentence-transformers, onnxruntime 1.26).
  **Neither has `peft`, `trl` or `datasets`.** They belong to running services: never install into
  them. Whether a training job may borrow one read-only (`python -I`) is the orchestrator's call;
  otherwise a new venv needs `pip install`, which the rules forbid a leg: a question for the owner.
  Whether either torch sees the GB10 under the queue: **unknown** (nothing was run).
- **No base weights to train.** A LoRA needs the Hugging Face (safetensors) weights; none of Qwen3
  0.6B / 1.7B / 4B are here (the HF cache holds two Nemotron GGUFs, `all-MiniLM-L6-v2` (English only),
  and a Qwen3.8-27B GGUF). Only `~/scratch/yames-c3a-models/Qwen3-0.6B-Q8_0.gguf` (639 MB, GGUF, not
  trainable). A download: a question for the orchestrator.
- **Conversion and loading exist.** `~/src/llama.cpp/convert_lora_to_gguf.py`, `convert_hf_to_gguf.py`
  and `gguf-py/` (source tree, no pip package needed with `PYTHONPATH`); a CUDA build of llama.cpp at
  `~/src/llama.cpp/build/bin` (`llama-cli`, `llama-server`, `llama-bench`). The app's pinned
  llama-cpp-2 0.1.146 exposes `LlamaModel::lora_adapter_init` and `LlamaContext::lora_adapter_set` /
  `lora_adapter_remove` (grep, `model.rs:821`, `context.rs:315`): an adapter can be loaded at this
  version. That it works with Qwen3 and the grammar sampler, and what a per-turn set / remove costs:
  **unknown** until c3d2 runs it.
- **Where it runs**: queue jobs on the DGX with `--gpu` and `--est` (TOOLS 3.6: under 20 GB of GPU
  memory; a Yames ML leg from another account shares the GPU tonight). The RTX shows 29 GB of free GPU
  memory in `job state`, but a Python ML stack on Windows ARM64 is **unknown**: DGX only.

## The data (c3d1: no GPU, no model training; a TS script and a paraphrase job)

1. **Never the held-out set.** Before writing anything, check c3b1's hashes of `evals/coach/tools/*.jsonl`;
   the training files live elsewhere (`evals/coach/train/`). A test fails on any training item whose
   normalised text (lower case, punctuation and spaces folded) equals a test item's, or is within an
   edit distance of 3 of one, in the same language.
2. **Situations and right answers by code** (TOOLS 3.4 items 1, 2): `scripts/coach-train.mjs` (esbuild,
   as `coach-eval.mjs`) walks screens, Session phases, Paths / Steps / Exercises with their real
   titles from `src/paths/packs/i18n/<lng>/`, and for each emits the calls the runner accepts
   (`checkCall`, `when(ctx)`, resolution); the expected answer is never written by a model.
3. **What a player would say**: seeds from the fifteen command tables (`src/coach/ask/commands/`),
   the registry's descriptions and the card and help questions; paraphrases (terse, chatty, typo,
   slang) by a **local** model as a queue job (judgement call 9). The hard cases on purpose: cards,
   "that one is yours", "which one?", wrong screen; the 4 / 4 / 2 mix; tool lists shuffled and some
   withheld (TOOLS 3.3) so the model reads the list.
4. **May be generated**: wordings, situations, distractor lists. **May not**: an expected answer, a
   never-tool as a target (only as "yours"), any player data, any number about a player, anything
   copied from the test set. A sonnet helper per language re-reads a sample of 50 for sense.
5. Size 8,000 to 15,000, at least 300 per language; counts per language × kind in the progress file.

## The trial (c3d2: GPU queue jobs, then the harness)

6. **A one-hour trial first** (TOOLS 3.6): one job that trains the smallest candidate for a few hundred
   steps, to turn the estimates into numbers (time per step, GPU memory) before any full run.
7. **Candidates, in this order**: (A) a **LoRA of the 4B** for choice turns only (`--gpu 20G`, an
   evening at most by TOOLS' estimate): helps choosing, does not make anything faster; (B) a **small
   router**, Qwen3-1.7B or 0.6B fine-tuned for choices only, under the same grammar in the same worker:
   the only route to free wording on a CPU-only machine; (C) a sentence-encoder classifier over tool and
   card ids, arguments from the existing router: a research note only (no multilingual encoder here;
   the shipped `tract-nnef` could run it, but a tokenizer in Rust is a new crate). Pick A if the gap is
   accuracy on a GPU, B if it is latency on a CPU.
8. **Measured as c3b2b measured** (the same set, hashes, build and flags; way (d)), against the stock
   rows of `c3b2b.md`, per language, chain included; time on the DGX's CPU stated as such.

## What shipping would need (c3d3, for the orchestrator to decide; T5 in DESIGN 13)

GGUF adapter (A: tens of MB, loaded beside Standard) or a GGUF model (B: Q8_0 0.6B is 639 MB); tagged
with the `TOOL_CATALOGUE_VERSION` it learnt (a mismatch → ignored, stock used); hosted with a pinned
URL, size and SHA-256 in `BRAIN_ARTIFACTS`, downloaded only by the player's press in the selector; the
load in `coach.rs` (**R**), the prefix cache keyed on the adapter; the click-jitter probe with it
loaded; the harness per release. Hosting is the owner's decision.

## Not yours

The app path (c3b2a); stock measurements (c3b2b); anything in `src-tauri/` before c3d3.

## Gates

c3d1: tsc, vitest (the leakage test, the generator's tests). c3d2: the trial's numbers and the harness
table; no app gate. c3d3: tsc, vitest, build, `npm run test:rust` with `coach-llm`, the probe.

## Report

The counts, the leakage test, the trial's time and memory, the table against stock, and what you could
not find out.
