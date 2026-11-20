#!/bin/sh
# A training run's current checkpoint through the production bench, against
# the shipped model's run (`.detect-bench/base-bp`, made with
# `npm run detect:bench -- run --fast --notes --out .detect-bench/base-bp`).
#   tools/ml/scripts/bench_run.sh <run> [tag] [note logit bias] [onset logit bias]
set -e
RUN=$1; TAG=${2:-$1}
M=${YAMES_ML_MODELS:-$HOME/projects/.models/yames-ml}
REPO=$(cd "$(dirname "$0")/../../.." && pwd); cd "$REPO"
PY=${YAMES_ML_PY:-$HOME/projects/.venvs/ml/bin/python}
[ -f "$M/$RUN/$TAG.pt" ] || cp "$M/$RUN/ckpt.pt" "$M/$RUN/$TAG.pt"
$PY -m tools.ml.n1 "$M/$RUN/$TAG.pt" "$M/$RUN/$TAG.onnx" ${3:-0} ${4:-0} 2>&1 | grep "export vs"
tools/ml/scripts/bench_candidate.sh "$M/$RUN/$TAG.onnx" "$TAG" > "$M/$RUN/$TAG.bench.log" 2>&1 || echo "detect:check FAILED (see $M/$RUN/$TAG.bench.log)"
tail -1 "$M/$RUN/$TAG.bench.log"
$PY -m tools.ml.scripts.compare .detect-bench/base-bp ".detect-bench/$TAG" --line
