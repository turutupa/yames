#!/usr/bin/env bash
# From a train_lora.py output to the GGUF the app (or llama-cli) loads.
#
#   convert.sh lora <adapter dir> <base safetensors dir> <out.gguf> [f16|bf16|q8_0|f32]
#       PEFT adapter -> GGUF LoRA adapter (default f16). Load it with
#       `llama-cli -m <base>.gguf --lora <out.gguf>` or, in the app's crate,
#       LlamaModel::lora_adapter_init + LlamaContext::lora_adapter_set.
#   convert.sh full <model dir> <out.gguf> [Q8_0|Q4_K_M|BF16|...]
#       full fine-tune -> BF16 GGUF -> llama-quantize to the type asked
#       (default Q8_0; the app ships its 4B as Q4_K_M).
#
# No GPU needed; queue it (`--ram 8G --est 10m`) for the 1.7B / 4B.
set -euo pipefail

LLAMA="${LLAMA_CPP_SRC:-$HOME/src/llama.cpp}"
ROOT="${YAMES_C3D_ROOT:-$HOME/scratch/yames-c3d}"
PY="$ROOT/venv/bin/python"
QUANT="${LLAMA_QUANTIZE:-$ROOT/llama-build-cpu/bin/llama-quantize}"
# The converters import modules that sit beside them: no -I here.
export PYTHONPATH="$LLAMA/gguf-py"
export HF_HUB_OFFLINE=1

mode="${1:?lora|full}"
case "$mode" in
  lora)
    adapter="$2" base="$3" out="$4" type="${5:-f16}"
    "$PY" "$LLAMA/convert_lora_to_gguf.py" --base "$base" --outtype "$type" --outfile "$out" "$adapter"
    ;;
  full)
    model="$2" out="$3" type="${4:-Q8_0}"
    if [ "$type" = "Q8_0" ] || [ "$type" = "BF16" ] || [ "$type" = "F16" ]; then
      lower="$(echo "$type" | tr 'A-Z' 'a-z')"
      "$PY" "$LLAMA/convert_hf_to_gguf.py" "$model" --outtype "$lower" --outfile "$out"
    else
      tmp="${out%.gguf}.bf16.gguf"
      "$PY" "$LLAMA/convert_hf_to_gguf.py" "$model" --outtype bf16 --outfile "$tmp"
      "$QUANT" "$tmp" "$out" "$type"
      echo "kept the BF16 intermediate: $tmp (overwrite it next time; nothing deletes it)"
    fi
    ;;
  *) echo "usage: convert.sh lora|full ..." >&2; exit 2 ;;
esac
ls -la "$out"
sha256sum "$out"
