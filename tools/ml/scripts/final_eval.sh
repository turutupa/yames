#!/bin/sh
# A finished run against the shipped model: the fast bench (+ check) and the
# held-out real recordings (GuitarSet player 05, never trained on).
#   tools/ml/scripts/final_eval.sh <run> [note logit bias]
# Needs the two baseline runs once:
#   npm run detect:bench -- run --fast --notes --out .detect-bench/base-bp
#   npm run detect:bench -- run --dir ~/projects/.datasets/guitarset-bench --only 05_ --jobs 4 --out .detect-bench/gs05-base
set -e
RUN=$1; NB=${2:-0}; TAG=$RUN-final$( [ "$NB" = 0 ] || echo "-nb$NB" )
M=${YAMES_ML_MODELS:-$HOME/projects/.models/yames-ml}
REPO=$(cd "$(dirname "$0")/../../.." && pwd); cd "$REPO"
PY=${YAMES_ML_PY:-$HOME/projects/.venvs/ml/bin/python}
export PATH=$HOME/.cargo/bin:$PATH CFLAGS='-std=gnu11 -Wno-implicit-function-declaration' CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-$HOME/projects/.target-ml}
echo "== $TAG"
tools/ml/scripts/bench_run.sh "$RUN" "$TAG" "$NB" | tail -3 | cut -c1-900
grep -c "^WORSE" "$M/$RUN/$TAG.bench.log" | sed 's/^/gated metrics worse: /'
grep "^WORSE" "$M/$RUN/$TAG.bench.log" | grep "|all|" | sed 's/ (n=.*//; s/WORSE //' | tr '\n' ';' | cut -c1-1200; echo
YAMES_NOTE_MODEL="$M/$RUN/$TAG.nnef.tar" npm run -s detect:bench -- run --dir "$HOME/projects/.datasets/guitarset-bench" --only 05_ --jobs 4 --out ".detect-bench/gs05-$TAG" > "$M/$RUN/$TAG.gs05.log" 2>&1
$PY -m tools.ml.scripts.compare .detect-bench/gs05-base ".detect-bench/gs05-$TAG" --gs
