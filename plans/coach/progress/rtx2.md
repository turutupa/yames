# rtx2: the trained small router (b1-06b-full) on the RTX, llama.cpp on Vulkan (2026-11-21)

Session 6, leg rtx2. Branch `coach-rtx2`. Everything through jobq (`--machine rtx --env any`); no ssh/scp
from the DGX; nothing installed; written only under `C:\yt-coach\` (`tools`, `bin`, `models`, `evals`,
`logs\s6`, `target`). Scripts and their `job submit` lines: `plans/coach/tools/rtx/README.md` (rtx2 section).

## What was done

1. **Sync** `C:\yt-coach\wt` to `b5170fca682a22cb903affdcab605562c4ee8935` (the snapshot the pipeline ran
   from; job `coach-rtx2-sync-b517`, PASS, 1 s). It was at 03c0ac9c (another leg's sync). At the end,
   back to `coach` = `e9f63895` (job `coach-rtx2-sync-coach`, PASS).
2. **Build** (job `coach-rtx2-build`): `cargo build --release --manifest-path src-tauri\Cargo.toml
   --features coach-llm-vulkan --bin coach-eval`, pv1's toolchain (vcvarsarm64, clang-cl, LLVM libclang,
   Ninja, OpenSSL/OpenMP off, `VULKAN_SDK=C:\Users\delgado\src\yames-tools\VulkanSDK-1.4.313.0`),
   `CARGO_TARGET_DIR=C:\yt-coach\target`, BelowNormal. **1 min 05 s** (target warm from pv1: only `yames`
   recompiled). No feature added, no code change: the eval bin only needs `coach-llm` (the CUDA feature
   on the DGX is eval-only and irrelevant here). Binary `C:\yt-coach\bin\coach-eval-vk.exe`, SHA-256
   `2958AD74...7D61236F`. Log `C:\yt-coach\logs\s6\build-coach-eval-b5170fca.log`.
3. **Files** (job `coach-rtx2-pull`, Windows `scp -B` pulled by the RTX, SHA-256 checked on both sides):
   `final-q8_0.gguf` `542ee44a...92bf56` (639,446,880 B), `final-q4_k_m.gguf` `95c33dde...b96c50`
   (396,704,608 B), the held-out `requests.jsonl` `53514312...92bf56` (6,586,597 B; the pipeline's own `heldout/alone/requests.jsonl`; identical to stock-4b's). Stock
   `Qwen3-4B-Q4_K_M.gguf` on the RTX = the DGX's (`7485fe6f...34fdf5`).
4. **Harness**: `scripts/coach-eval.mjs` imports `esbuild` (needs `node_modules`, which the RTX lacks), so the
   requests were rendered on the DGX (the pipeline's file, byte-identical), only the binary ran on the RTX,
   and the outcomes came back in the job's log (printed between markers) and were scored on the DGX with the
   b5170fca snapshot's harness: `score --grammar situation --prompt notes`, `chain` rules-first and
   model-first, exactly the held-out stage's arms.
5. **DGX side-by-side for Q4_K_M** (the pipeline held out only Q8_0): job `coach-rtx2-cuda-q4`, the frozen
   `coach-eval-cuda`, same arms; a line added to `runs/b1-06b-full/heldout/COUNT` (not used to choose).

Layers (every RTX run): `ggml_vulkan: 0 = NVIDIA RTX Spark N1X (6144-core Blackwell RTX GPU) (NVIDIA) | uma: 1
| fp16: 1 | bf16: 1 | ... | matrix cores: NV_coopmat2`, `using device Vulkan0 ... 47840 MiB free`,
**`load_tensors: offloaded 29/29 layers to GPU`** (stock 4B: 37/37). `[coach] loading ... (backend=vulkan,
n_gpu_layers=4294967295, n_threads=18)`.

## Results (447 held-out items; right tool of 183 calls; wrong action of 447)

| run | right tool | right args | wrong action | cards right | which | yours | none | no answer | median | p90 |
|---|---|---|---|---|---|---|---|---|---|---|
| Q8_0 alone, **CUDA** (DGX, pipeline) | 153 | 142 | 7 | 139/159 | 20/27 | 22/24 | 41/54 | 0 | 0.08 s | 0.13 s |
| Q8_0 alone, **Vulkan** run 1 | 152 | 141 | 7 | 139/159 | 20/27 | 22/24 | 41/54 | 1 (timedOut, en-001) | 0.062 s | 0.106 s |
| Q8_0 alone, **Vulkan** run 2 (warm) | 153 | 142 | 7 | 139/159 | 20/27 | 22/24 | 41/54 | 0 | 0.062 s | 0.104 s |
| Q8_0 chain rules-first, CUDA | 144 | 134 | 7 | 129/159 | 19/27 | 22/24 | 41/54 | 0 | 0.07 s | 0.12 s |
| Q8_0 chain rules-first, Vulkan run 1 | 144 | 134 | 7 | 129/159 | 19/27 | 22/24 | 41/54 | 0 | 0.057 s | 0.103 s |
| Q4_K_M alone, CUDA (rtx2's job) | 151 | 141 | 8 | 140/159 | 20/27 | 22/24 | 40/54 | 0 | 0.33 s* | 0.59 s* |
| Q4_K_M alone, **Vulkan** | 150 | 140 | 8 | 142/159 | 20/27 | 22/24 | 41/54 | 0 | 0.059 s | 0.098 s |
| Q4_K_M chain rules-first, CUDA | 142 | 133 | 8 | 129/159 | 19/27 | 22/24 | 40/54 | 0 | 0.29 s* | 0.57 s* |
| Q4_K_M chain rules-first, Vulkan | 142 | 133 | 8 | 131/159 | 19/27 | 22/24 | 41/54 | 0 | 0.053 s | 0.095 s |
| stock 4B Q4_K_M alone, CUDA (c3d2) | 160 | 146 | 55 | 81/159 | 0/27 | 0/24 | 9/54 | 1 | 1.29 s | 1.96 s |
| stock 4B Q4_K_M alone, **Vulkan** | 161 | 144 | 55 | 84/159 | 0/27 | 0/24 | 9/54 | 1 (truncated) | 0.29 s | 0.42 s |
| stock 4B chain rules-first, Vulkan | 151 | 138 | 38 | 79/159 | 11/27 | 11/24 | 9/54 | 1 | 0.27 s | 0.39 s |

\* the DGX was running six jobs (two trainings among them) during that job; its latency is that machine's load.

Per turn: median is over all answered items, first turn included (the harness's figure). Gate (right tool
>= 90%, wrong < 2%): no row passes, as on the DGX.

**Accuracy matches.** Q8_0 on Vulkan, warm: **447/447 answers identical to CUDA**, byte for byte. Run 1 differs in
one item only: `en-001` (the first turn after load) timed out under the 8 s deadline (see below); that cost 1
right tool and 1 right args alone, and nothing in the chain (the rules answered en-001). Q4_K_M Vulkan vs CUDA:
439/447 identical; 8 differ (en-010, es-012, de-056, fr-016, pl-001, pl-021, ru-005, zh-CN-021), net -1 right
tool, +2 cards right, same wrong actions: quantised-kernel noise at a near tie, not a backend defect. Stock 4B:
385/447 textually identical (half of the rest only JSON spacing), same totals within 1-3.

**Load and memory.** Load 1.2 s (Q8_0), 1.0 s (Q4_K_M), 2.1 s (stock 4B), warm file cache. llama.cpp
buffers on Vulkan0: Q8_0 model 604 MiB + KV 448 MiB + compute 309 MiB = **1,361 MiB** (CPU-mapped 158 MiB,
host compute 12 MiB); Q4_K_M 373 + 448 + 309 = **1,129 MiB**; stock 4B 2,376 + 576 + 302 = 3,254 MiB.
nvidia-smi memory.used (UMA, whole GPU) 1,429 MiB idle -> peak 2,844 (Q8_0), 2,799 (Q4_K_M), 5,132 (4B).
447 requests: 44 s (Q8_0 incl. the 8 s timeout), 36 s (Q8_0 warm), 39 s (Q4_K_M), 143 s (4B).
Tokens per second: not printed by `coach-eval` (no token counts in the outcomes); an answer is ~11 tokens
(training completion mean), so ~60 ms a turn is prompt (prefix cached: 5 ms median) plus ~11 decode steps.

## The finding for c3d3: the first turn on a cold Vulkan shader cache

The first request after load paid llama.cpp's Vulkan pipeline compile: Q8_0 > 8 s (timed out), Q4_K_M
5.2 s (`promptMs 5213`), the first time each quantisation ran on this machine. A second process with the same
file: 183 ms (the driver's shader cache kept them). Stock 4B's first turn was 737 ms (pv1 had already run that
quantisation here). So on a player's machine the first coach answer after install or after a driver
update can take 5-10 s, or miss the tip tier entirely. The app should warm the context after load (one
throwaway decode off the user's path, already its own thread) before the first real turn.

## Files

- DGX: `~/scratch/yames-rtx2/<label>/` (`joblog.txt`, `outcomes.jsonl`, `alone/`, `chain-*/` with
  `summary.md`, `results.json`, `errors.md`); labels `vk-final-q8_0` (+ `outcomes-r2.jsonl`),
  `vk-final-q4_k_m`, `vk-stock-4b`, `cuda-final-q4_k_m`.
- RTX: `C:\yt-coach\evals\<label>\` (outcomes, stderr, nvidia-smi samples), `C:\yt-coach\logs\s6\eval-<label>.log`,
  `build-coach-eval-b5170fca.log`.
- Jobs: coach-rtx2-{look, sync-b517, build, pull, eval-q8, eval-q4, eval-stock4b, eval-q8-r2, sync-coach}
  (RTX); coach-rtx2-{cuda-q4, score-q8, score-q4, score-stock4b} (DGX).
