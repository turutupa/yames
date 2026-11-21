#!/bin/bash
# DGX side of leg rtx2. Scores the RTX's Vulkan outcomes with the harness of the code snapshot the
# candidate was trained from (b5170fca), exactly as the pipeline's held-out stage does
# (`coach-eval.mjs score --grammar situation --prompt notes`, then `chain` rules-first and model-first),
# and runs the DGX's frozen CUDA binary on a GGUF the pipeline did not hold out (Q4_K_M), for the
# side-by-side. Run through jobq with run.sh. Output under ~/scratch/yames-rtx2/<label>/.
#
#   rtx2-score.sh score <label> <outcomes.jsonl>
#   rtx2-score.sh cuda <label> <gguf> <candidate-run-dir>   (appends a line to <run-dir>/heldout/COUNT)
set -eu
CODE=${CODE:-/home/dgx-delgado/scratch/yames-c3d/code/b5170fca}
OUT=${OUT:-/home/dgx-delgado/scratch/yames-rtx2}
BIN=${COACH_EVAL_BIN:-/home/dgx-delgado/scratch/yames-c3b-results/coach-eval-cuda}
export YAMES_LLM_GPU_LAYERS=99
mode=${1:?mode}; label=${2:?label}
d="$OUT/$label"
mkdir -p "$d"
chains() {
  for order in rules-first model-first; do
    node "$CODE/scripts/coach-eval.mjs" chain --out "$d/chain-$order" --outcomes "$1" --order "$order" --label "$label" > "$d/chain-$order.log" 2>&1
  done
}
case "$mode" in
  score)
    o=${3:?outcomes}
    node "$CODE/scripts/coach-eval.mjs" score --out "$d/alone" --outcomes "$o" --grammar situation --prompt notes > "$d/score.log" 2>&1
    chains "$o"
    ;;
  cuda)
    g=${3:?gguf}; run=${4:?run dir}
    echo "$(date -Iseconds) $g (leg rtx2: CUDA side-by-side for the RTX's Vulkan run; not used to choose)" >> "$run/heldout/COUNT"
    node "$CODE/scripts/coach-eval.mjs" model --bin "$BIN" --gguf "$g" --out "$d/alone" --grammar situation --prompt notes > "$d/model.log" 2>&1
    chains "$d/alone/outcomes.jsonl"
    ;;
  *) echo "usage: rtx2-score.sh score <label> <outcomes> | cuda <label> <gguf> <run-dir>"; exit 2 ;;
esac
for s in alone chain-rules-first chain-model-first; do echo "$s: $(grep '^| all ' "$d/$s/summary.md")"; done
echo "done $mode $label -> $d"
