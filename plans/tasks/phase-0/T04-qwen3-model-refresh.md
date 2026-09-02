# T04 — Move the brain tiers to Qwen3

Size: S–M. Branch: `phase0/t04-qwen3`. Parallel-safe; final latency
gate needs a T01 build.

## Goal

Standard = Qwen3-4B Q4_K_M (the floor), Studio = Qwen3-8B Q4_K_M
(offered only on machines with ≥ 16 GB RAM), both Apache-2.0, running
with thinking disabled and sane generation settings, with a migration
path for users who downloaded the old models. There is no smaller tier:
a decent experience beats reaching very old hardware.

## Facts

- `src/hooks/useCoachDownload.ts` `MODEL_URLS`: Standard is
  `bartowski/Qwen2.5-1.5B-Instruct-GGUF` Q4_K_M, Full is
  `bartowski/Phi-3.5-mini-instruct-GGUF` Q4_K_M. The file is saved as
  `models/brain/model.bin` under the app data dir (`commands.rs`
  `load_coach_model`).
- `src-tauri/src/models.rs` handles download (curl, progress, size
  sanity checks) and `getModelStatus` (brain tier stored alongside).
- `src/locales/en.json` keys `settings.coach.brainStandardHint`,
  `brainFullHint`, and `fullSpec`/`fullDesc` (~line 582) carry sizes.
- `coach.rs::llm::LlmModel::generate` builds a prompt from
  `SYSTEM_PROMPT` + context, `n_ctx = CONTEXT_SIZE`, sampler
  temp 0.7 / top-p 0.9 / seed 42, and creates a new context per call.
- ROADMAP §3: never Qwen2.5-3B (non-commercial license).
- T01 (`phase0/t01-llm-features`) already made the LLM path compile,
  added `llm::BACKEND`, `requested_gpu_layers()`, `inference_threads()`,
  `generate_with_limit`, and the `YAMES_TEST_GGUF` smoke test. The prompt
  is still Phi-3 style (`<|system|>` … `<|assistant|>`), so Qwen3 output
  currently contains template artifacts — that is what this task fixes.

## Steps

1. URLs: point Standard at a Qwen3-4B Q4_K_M GGUF and Studio (keep the
   existing `full` tier id internally, rename the label) at Qwen3-8B
   Q4_K_M from the official `Qwen/*-GGUF` repos or `bartowski`. Record
   the exact URLs and file sizes in the PR. Update `MIN_*` size sanity
   floors in `models.rs` if they exist for the brain.
   Add a small IPC `getSystemMemoryMb()` (`sysinfo` crate or OS calls)
   and disable the Studio button with a hint when RAM < 16 GB.
2. Prompting for Qwen3 in `coach.rs`:
   - Use the GGUF's chat template (llama.cpp reads it from metadata;
     verify `llama-cpp-2 0.1.146` exposes `apply_chat_template` or build
     the ChatML string manually: `<|im_start|>system … <|im_end|>` etc.).
   - Disable thinking: append `/no_think` to the system prompt or set
     `enable_thinking=false` in the template; strip any `<think>…</think>`
     block from output defensively.
   - `n_ctx` 4096; keep temp 0.7 / top-p 0.9; set a max-token cap per
     call (rephrase 64, chat 256) — T01 added `generate_with_limit`; use it.
   - **Hoist the `LlamaContext` into `LlmModel`** and reuse it across
     calls (clear the KV cache per call). T01 measured Vulkan slower than
     CPU on a 0.6B model because `generate` re-creates the context (and a
     224 MiB KV buffer on the GPU) on every call. Re-measure after.
   - **Dedicated inference thread.** Replace the per-call
     `with_below_normal_priority` dance in `commands.rs::coach_generate`
     (T01) with one long-lived inference thread owned by the coach
     engine, priority lowered once at spawn, fed through a channel. On
     Linux an unprivileged thread cannot restore a lowered nice value,
     so the current restore is a no-op there and would leave tokio
     blocking-pool threads permanently demoted.
   - Keep T01's `YAMES_LLM_GPU_LAYERS` env override (T06 relies on it).
3. Migration: `getModelStatus` returns the stored tier; add a
   `brainFamily: "qwen3" | "legacy"` derived from a small marker file
   written by the downloader (`models/brain/model.json` with url, sha,
   family). Legacy = no marker. Settings shows "Update brain" (reuses the
   download flow) when legacy. Do not delete the old file automatically.
4. Update `en.json` hints with the new sizes/RAM (Standard ~2.5 GB /
   ~4 GB RAM, Studio ~5 GB / ~8 GB RAM, needs 16 GB).
5. Latency measurement (needs a T01 build): time 10 rephrase calls and
   5 chat calls for each tier on your machine; put a small table in the
   PR (OS, CPU/GPU, backend, p50/p95).

## Acceptance

- Downloads succeed for both tiers via the in-app downloader; marker
  file written.
- With a T01 build: rephrase p95 ≤ 1.5 s on Apple Silicon (Standard on
  Metal) or ≤ 4 s CPU-only fallback (Standard); output contains no
  `<think>` text.
- Legacy model detected and "Update brain" offered.
- Vitest for the family/marker logic; `tsc` clean.

## Do not

- Do not add a tier below 4B.
- Do not change `is_loaded()` semantics (T03).
