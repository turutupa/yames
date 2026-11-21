#!/usr/bin/env bash
# The end-to-end smoke test on Qwen3-0.6B: synthetic data -> LoRA -> GGUF adapter
# -> llama-cli (CUDA) with --lora and a GBNF grammar, against the base; then a
# full fine-tune -> GGUF -> quantised -> llama-cli under the same grammar.
# Queue job (GPU):
#
#   job submit --name coach-c3denv-smoke --ram 12G --gpu 6G --est 20m \
#     --cwd /home/dgx-delgado/yames-coach-c3denv -- \
#     bash /home/dgx-delgado/yames-coach-build/plans/coach/tools/run.sh \
#     bash evals/coach/train/env/smoke.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${YAMES_C3D_ROOT:-$HOME/scratch/yames-c3d}"
LLAMA="${LLAMA_CPP_SRC:-$HOME/src/llama.cpp}"
PY="$ROOT/venv/bin/python"
W="$ROOT/weights/Qwen3-0.6B"
S="$ROOT/smoke"
CLI="$LLAMA/build/bin/llama-cli"
QUANT="$ROOT/llama-build-cpu/bin/llama-quantize"
OLD_Q8="$HOME/scratch/yames-c3a-models/Qwen3-0.6B-Q8_0.gguf"
# llama.cpp's converters import modules beside them (conversion/), so they run
# without -I; our own scripts run with -I.
export PYTHONPATH="$LLAMA/gguf-py"
# Varying batch lengths fragment the caching allocator (reserved 14.8 GiB for
# 7.9 GiB allocated on the first run); expandable segments keep it near alloc.
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
export HF_HUB_OFFLINE=1
mkdir -p "$S/out"

step() { echo; echo "===== $* ($(date +%T))"; }

# One grammar-constrained, greedy answer. $1 label, $2 model, $3 probe, rest extra flags.
ask() {
  local label="$1" model="$2" probe="$3"; shift 3
  "$CLI" -m "$model" "$@" -sysf "$S/data/system.txt" -p "$probe" --grammar-file "$S/data/grammar.gbnf" \
    --temp 0 --seed 1 -n 96 -ngl 99 -c 2048 -st --reasoning off --simple-io --no-display-prompt \
    < /dev/null > "$S/out/$label.txt" 2> "$S/out/$label.err" || { echo "llama-cli FAILED: $label"; tail -n 20 "$S/out/$label.err"; return 1; }
  echo "[$label] $(grep -o '{"tool".*' "$S/out/$label.txt" | head -n 1)"
}

step "synthetic data"
"$PY" -I "$HERE/make_synthetic.py" "$W" "$S/data"
head -c 600 "$S/data/train.jsonl"; echo

step "LoRA, 80 steps"
"$PY" -I "$HERE/train_lora.py" --model "$W" --data "$S/data/train.jsonl" --out "$S/lora" \
  --steps 80 --batch-size 8 --lr 2e-4 --lora-r 16 --lora-alpha 32 --max-len 512 --log-every 10
ls -la "$S/lora"

step "base GGUF from the same safetensors (Q8_0 and BF16)"
"$PY" "$LLAMA/convert_hf_to_gguf.py" "$W" --outtype q8_0 --outfile "$S/base-q8_0.gguf" 2>&1 | tail -n 3
"$PY" "$LLAMA/convert_hf_to_gguf.py" "$W" --outtype bf16 --outfile "$S/base-bf16.gguf" 2>&1 | tail -n 3

step "adapter to GGUF"
bash "$HERE/convert.sh" lora "$S/lora" "$W" "$S/lora-f16.gguf" f16 2>&1 | tail -n 3

if [ -x "$QUANT" ]; then
  step "Q4_K_M of the base (the app ships 4B as Q4_K_M)"
  "$QUANT" "$S/base-bf16.gguf" "$S/base-q4_k_m.gguf" Q4_K_M 2>&1 | tail -n 2
fi

step "answers: base vs base + LoRA, under the grammar"
n=0
while IFS= read -r probe; do
  n=$((n + 1))
  echo "probe $n: $probe"
  ask "p$n-base-q8" "$S/base-q8_0.gguf" "$probe"
  ask "p$n-lora-q8" "$S/base-q8_0.gguf" "$probe" --lora "$S/lora-f16.gguf"
  if [ -f "$S/base-q4_k_m.gguf" ]; then
    ask "p$n-base-q4km" "$S/base-q4_k_m.gguf" "$probe"
    ask "p$n-lora-q4km" "$S/base-q4_k_m.gguf" "$probe" --lora "$S/lora-f16.gguf"
  fi
  if [ -f "$OLD_Q8" ]; then
    ask "p$n-c3aq8-base" "$OLD_Q8" "$probe" || true
    ask "p$n-c3aq8-lora" "$OLD_Q8" "$probe" --lora "$S/lora-f16.gguf" || true
  fi
done < "$S/data/probes.txt"
grep -h -i "lora\|adapter" "$S/out/p1-lora-q8.err" | head -n 5 || true

step "full fine-tune, 50 steps"
"$PY" -I "$HERE/train_lora.py" --model "$W" --data "$S/data/train.jsonl" --out "$S/full" --full-finetune \
  --steps 50 --batch-size 8 --lr 1e-5 --max-len 512 --log-every 10
ls -la "$S/full"
bash "$HERE/convert.sh" full "$S/full" "$S/full-q8_0.gguf" Q8_0 2>&1 | tail -n 2
if [ -x "$QUANT" ]; then
  bash "$HERE/convert.sh" full "$S/full" "$S/full-q4_k_m.gguf" Q4_K_M 2>&1 | tail -n 2
fi
n=0
while IFS= read -r probe; do
  n=$((n + 1))
  ask "p$n-full-q8" "$S/full-q8_0.gguf" "$probe"
  if [ -f "$S/full-q4_k_m.gguf" ]; then ask "p$n-full-q4km" "$S/full-q4_k_m.gguf" "$probe"; fi
done < "$S/data/probes.txt"

step "sizes and hashes"
ls -la "$S"/*.gguf "$S/lora/adapter_model.safetensors"
sha256sum "$S/lora-f16.gguf" "$S/base-q8_0.gguf"
echo "SMOKE DONE"
