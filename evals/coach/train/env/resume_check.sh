#!/usr/bin/env bash
# Leg c3d2: the trainer's checkpoint, resume and epoch snapshot on 16 rows, LoRA and full (minutes).
#   bash resume_check.sh <rendered.jsonl with >= 16 rows> <out dir>
set -euxo pipefail
E="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
V="${YAMES_C3D_ROOT:-$HOME/scratch/yames-c3d}"
PY="$V/venv/bin/python"
data="$1" out="$2"
mkdir -p "$out"
head -n 16 "$data" > "$out/rows16.jsonl"
for mode in lora full; do
  flags=""
  [ "$mode" = full ] && flags="--full-finetune --grad-checkpointing"
  # shellcheck disable=SC2086
  "$PY" -I "$E/train_lora.py" --model "$V/weights/Qwen3-0.6B" --data "$out/rows16.jsonl" --eval-data "$out/rows16.jsonl" \
    --out "$out/$mode" --epochs 2 --batch-size 4 --max-len 2048 --save-every 1 --epoch-snapshots --resume $flags
  ls -la "$out/$mode" "$out/$mode/epoch-1"
  cat "$out/$mode/ckpt-latest.json"
  # Pretend the run stopped after its last checkpoint: resume it.
  # shellcheck disable=SC2086
  "$PY" -I "$E/train_lora.py" --model "$V/weights/Qwen3-0.6B" --data "$out/rows16.jsonl" --eval-data "$out/rows16.jsonl" \
    --out "$out/$mode" --epochs 2 --batch-size 4 --max-len 2048 --save-every 1 --epoch-snapshots --resume $flags 2>&1 | grep -E "resumed|done:|eval_loss"
done
echo RESUME_CHECK_OK
