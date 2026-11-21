# c3denv: the training environment, built and proven (2026-11-20/21)

Branch `coach-c3denv`. No app code touched. Everything large is outside the repository under
`~/scratch/yames-c3d/` (`venv/`, `weights/`, `smoke/`, `timing/`, `timing-data/`, `llama-build-cpu/`);
the scripts are in `evals/coach/train/env/`. Job logs: `~/scratch/jobq/<id>-coach-c3denv-*.log`.

## 1. The venv (`setup_venv.sh`, `requirements.txt`; proof: `gpu_check.py`, job 602)

`~/scratch/yames-c3d/venv`, made with the system `python3 -m venv` (Python 3.12.3; nothing borrowed
from a service venv beyond reading its `pip list`). torch **2.14.1+cu130** from
`https://download.pytorch.org/whl/cu130`, the same build `~/services/photo-studio/venv` runs (that venv
has no pip.conf; the `+cu130` local tag names the index). transformers 5.23.0 (photo-studio's),
peft 0.22.0, datasets 5.2.0, accelerate 1.16.0, safetensors 0.8.0, sentencepiece 0.2.3, protobuf 7.36.2,
huggingface_hub 2.4.0, numpy 2.5.5; bitsandbytes 0.50.2 added later (below). Under the queue with
`--gpu 2G`: `cuda available True`, `NVIDIA GB10 capability (12, 1)`, bf16 4096^3 matmul 1.65 ms
(83 TFLOP/s), error vs CPU fp32 2.8e-3. `setup_venv.sh --frozen` rebuilds it from requirements.txt.

## 2. Base weights (`download_weights.sh`, jobs 604-606; anonymous, `Qwen/<name>` on Hugging Face)

The app pins `Qwen/Qwen3-4B-GGUF` / `Qwen3-8B-GGUF` (`models.rs` `BRAIN_ARTIFACTS`): Qwen's own GGUFs of
the post-trained hybrid-thinking `Qwen/Qwen3-4B`, not `-Base` and not the `-2507` instruct split. So:
`Qwen/Qwen3-0.6B`, `Qwen/Qwen3-1.7B`, `Qwen/Qwen3-4B` (bf16 safetensors). Each folder has `SIZES`,
`SHA256SUMS` and `REVISION` (the commit downloaded).

| model | commit | weight files (bytes) | SHA-256 |
|---|---|---|---|
| Qwen3-0.6B | c1899de289a04d12100db370d81485cdf75e47ca | model.safetensors 1,503,300,328 | f47f71177f32bcd101b7573ec9171e6a57f4f4d31148d38e382306f42996874b |
| Qwen3-1.7B | 70d244cc86ccca08cf5af4e1e306ecf908b1ad5e | 00001 3,441,185,608 / 00002 622,329,984 | 169ad53ec313c3a34b06c0809216e4fc072cce444a5d4ff2b59690d064130ed5 / 912becff8d60672aa8628ef08c05898d9adf17c2ad4ae3caf99b065622fdeff9 |
| Qwen3-4B | 1cfa9a7208912126459214e8b04321603b3df60c | 00001 3,957,900,840 / 00002 3,987,450,520 / 00003 99,630,640 | 328a91d3122359d5547f9d79521205bc0a46e1f79a792dfe650e99fc2d651223 / 6cd087b316306a68c562436b5492edbcf6e16c6dba3a1308279caa5a58e21ca5 / e4bf436957184f4eeb86a80e9db394503f1f56446b2e6b7edeac5b81470f4ca1 |

Tokenizer files are identical across the three (tokenizer.json aeb13307…, vocab.json ca10d7e9…).

## 3. The trainer (`train_lora.py`)

Plain PyTorch + transformers + peft. JSONL `{"prompt", "completion"}`; the prompt is used verbatim
(c3d1 writes it chat-formatted with thinking off, as `make_synthetic.py` does with
`apply_chat_template(..., enable_thinking=False)`), the tokenizer's EOS (`<|im_end|>`) appended to the
completion. Loss on completion tokens only, and the LM head is applied to those positions only (the
151,936-word logits of a whole 8 x 1024 batch were 5 GB in fp32). Flags: `--lora-r --lora-alpha
--lora-dropout --target-modules --lr --steps|--epochs --batch-size --grad-accum --max-len --seed
--grad-checkpointing --full-finetune [--no-master-fp32] --eval-data --no-save`. Logs loss, steps/s,
tokens/s, peak GPU memory and the load average; writes `metrics.json`. A LoRA saves
`adapter_model.safetensors` + `adapter_config.json`; a full fine-tune saves bf16 safetensors + tokenizer
+ chat template.

What the timing runs taught (all measured, 0.6B, LoRA, 8 x 1024):
- **No padding mask.** A padded batch carries a mask; it made a step 8.3 s (job 645). Batches are now
  length-grouped and a batch without padding passes no mask (causal flash path). `sdpa_check.py`:
  flash and cuDNN attention run on sm_121 (25-28 ms a layer fwd+bwd at this shape), memory-efficient
  62 ms, math 315 ms; with a mask, flash is unavailable.
- **peft's fp32 input cast and LoRA dropout are expensive here**: an fp32 copy of every activation into
  every adapted layer. Turned off by default (`--lora-cast-input`, `--lora-dropout` bring them back):
  7.56 -> 5.89 s per fwd+bwd in `profile_step.py`, peak 19.4 -> 15.1 GiB.
- **torch.compile does not work**: inductor needs `Python.h` (no python3-dev on this machine; apt is not
  ours). The remaining time is memory-bound elementwise kernels (RMSNorm, SiLU, casts).
- **bitsandbytes 0.50.2 has an aarch64 wheel and its NF4 path works on the GB10** (`bnb_check.sh`, job
  651: Linear4bit fwd+bwd, 9% mean error vs bf16). Not needed: the 4B LoRA fits in 11 GiB without it.

## 4. The smoke test (`smoke.sh`, `make_synthetic.py`; jobs 615, 644, 787)

200 synthetic records (system turn = 8 tools; completion = one JSON call whose args end with
`"src":"c3d"`, a marker no base model can produce by itself), GBNF `smoke/data/grammar.gbnf`.
LoRA r16 / alpha 32, 80 steps, batch 8 -> adapter 40.4 MB safetensors -> `convert.sh lora` ->
`lora-f16.gguf` 20.2 MB. Base GGUFs converted from the SAME safetensors (`base-q8_0.gguf` 805 MB,
`base-q4_k_m.gguf` 484 MB via our CPU `llama-quantize`). `llama-cli` (CUDA build b12372-5193ef1d4),
greedy, `--grammar-file`, `--reasoning off`:

| probe | base | base + `--lora` |
|---|---|---|
| put the metronome on 133 (Q8_0) | `{"tool":"set_tempo","args":{"bpm":133}}` | `{"tool":"set_tempo","args":{"bpm":133,"src":"c3d"}}` |
| please begin a drill for the tremolo exercise (Q8_0) | `{"tool":"start_drill","args":{"exercise":"tremolo"}}` | `{"tool":"start_drill","args":{"exercise":"tremolo","src":"c3d"}}` |
| the same, Q4_K_M base | `{"tool":"start_metronome","args":{"bpm":120}}` (wrong) | `{"tool":"start_drill","args":{"exercise":"tremolo","src":"c3d"}}` |

The adapter **also loads on `~/scratch/yames-c3a-models/Qwen3-0.6B-Q8_0.gguf`** (639 MB, other
provenance) and gives the same marked answers. (That file is smaller than ours because it has no separate
`output.weight`: the 0.6B's embeddings are tied; our converter wrote both.)
Full fine-tune, 50 steps, lr 1e-5, fp32 master weights -> `convert.sh full` -> Q8_0 639 MB and Q4_K_M
397 MB: both answer `{"tool":"set_tempo","args":{"bpm":133,"src":"c3d"}}` and
`{"tool":"start_drill","args":{"exercise":"tremolo","src":"c3d"}}` under the grammar.

## 5. The app's crate and today's adapter format (reading only)

llama-cpp-sys-2 0.1.146 does not name its llama.cpp revision (`.cargo_vcs_info.json` is the
llama-cpp-rs commit 4afdaf07). Matching git blobs against `~/src/llama.cpp`: its `src/llama-model.cpp`
exists only between 865ff06b2 and fae3a2807, so the vendored tree is **llama.cpp of 2026-04-11..14
(about b8760-b8790)**; the local build is b12372 (2026-11-13). Its `llama-adapter.cpp` reads exactly
what today's `convert_lora_to_gguf.py` writes: `general.type = "adapter"`, `adapter.type = "lora"`,
`adapter.lora.alpha` (f32), the optional `adapter.alora.invocation_tokens`, tensors named
`<base>.lora_a` / `.lora_b`, and rejects only an untransposed lora_a (the old `finetune` format, which
the converter does not write). The format is compatible. **Not proven by a load** in that revision:
that needs Rust (c3d3).

## 6. Timing (100 steps each, batch 8 x 1,024 tokens, no padding, `timing-data/` = long synthetic prompts)

**The machine was busy for all of them (load average 74-92 on 20 cores; other legs' vitest, builds and
an 8B eval on the same GPU). The GB10's memory is shared with the CPU, so these are pessimistic.**

| run | flags | s/step | peak GPU (alloc) | 10,000 rows x 3 epochs (3,750 steps) |
|---|---|---|---|---|
| 0.6B LoRA r16 | no checkpointing | 2.76 | 14.8 GiB | 2.9 h |
| 1.7B LoRA r16 | grad checkpointing | 4.91 | 5.3 GiB | 5.1 h |
| 4B LoRA r16 | grad checkpointing | 13.41 | 10.8 GiB | 14.0 h |
| 0.6B full, fp32 master | grad checkpointing | 4.67 | 11.2 GiB | 4.9 h |
| 1.7B full, pure bf16 (`--no-master-fp32`) | grad checkpointing | 7.05 (load 105) | 16.1 GiB | 7.3 h |

Time scales about linearly with tokens per row: at the app's real prompt length (unknown here: c3d1 has
not written its data yet) the hours scale by (real tokens per row / 1,024). The 4B fits in 20 GiB with
LoRA at a useful batch; no 4-bit needed.

## The commands the training leg runs

`V=~/scratch/yames-c3d`, `E=evals/coach/train/env`, `R=bash ~/yames-coach-build/plans/coach/tools/run.sh`,
from the leg's worktree. `--save-every`, `--eval-data` checked in job 880.

(a) LoRA of the 4B, through to a GGUF adapter for the app's Standard brain:
```sh
job submit --name coach-c3d2-4b-lora --ram 16G --gpu 20G --est 16h --setenv PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True --cwd <wt> -- \
  $R $V/venv/bin/python -I $E/train_lora.py --model $V/weights/Qwen3-4B --data <train.jsonl> --eval-data <dev.jsonl> \
  --out $V/runs/4b-lora --epochs 3 --batch-size 8 --max-len 1024 --lora-r 16 --lora-alpha 32 --lr 2e-4 \
  --grad-checkpointing --save-every 500
job submit --name coach-c3d2-4b-gguf --ram 8G --est 10m --cwd <wt> -- \
  $R bash $E/convert.sh lora $V/runs/4b-lora $V/weights/Qwen3-4B $V/runs/4b-lora-f16.gguf f16
llama-cli -m Qwen3-4B-Q4_K_M.gguf --lora $V/runs/4b-lora-f16.gguf --grammar-file … -st --reasoning off   # check
```
(b) full fine-tune of the 0.6B (fp32 master weights) / 1.7B (pure bf16 to stay under 20 GiB), to a GGUF:
```sh
job submit --name coach-c3d2-0p6b-full --ram 12G --gpu 16G --est 6h --setenv PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True --cwd <wt> -- \
  $R $V/venv/bin/python -I $E/train_lora.py --model $V/weights/Qwen3-0.6B --data <train.jsonl> --eval-data <dev.jsonl> \
  --out $V/runs/0p6b-full --full-finetune --epochs 3 --batch-size 8 --max-len 1024 --lr 1e-5 --grad-checkpointing
#   1.7B: --model $V/weights/Qwen3-1.7B --out $V/runs/1p7b-full --no-master-fp32 --gpu 20G --est 9h
job submit --name coach-c3d2-0p6b-gguf --ram 8G --est 10m --cwd <wt> -- \
  $R bash $E/convert.sh full $V/runs/0p6b-full $V/runs/0p6b-full-q8_0.gguf Q8_0      # or Q4_K_M
```

## Open / unknown

- Seconds per step on a quiet machine (every run here had load 74-92).
- The real rows' length (c3d1), which sets the hours.
- An adapter loaded by the app's vendored llama.cpp (c3d3, Rust).
- torch.compile (needs python3-dev, an apt install: the owner's call).
- No mid-run resume: a stopped run keeps only its last `--save-every` adapter snapshot (LoRA only).
- Whether the app's pinned `Qwen3-4B-Q4_K_M.gguf` was converted from the same `Qwen/Qwen3-4B` commit
  as our weights (1cfa9a72): not checkable from the GGUF; the 0.6B adapter did load and act on a
  0.6B GGUF of other provenance.
- Pure-bf16 full fine-tuning (the 1.7B row) has no fp32 master copy: fine for a short run, can stall
  small updates; the fp32 master for the 1.7B needs ~28 GiB + activations.
