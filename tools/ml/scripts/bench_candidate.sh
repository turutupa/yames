#!/bin/sh
# A candidate note model through the production path.
#   tools/ml/scripts/bench_candidate.sh <model.onnx> <tag> [extra detect-bench run args]
# Writes <model>.nnef.tar beside the ONNX (the archive tract loads), runs the
# fast bench with it (`.detect-bench/<tag>/`), then the check against the
# shipped baseline (its exit code is the script's).
set -e
ONNX=$(realpath "$1"); TAG=$2; shift 2
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
NNEF="${ONNX%.onnx}.nnef.tar"
export PATH=$HOME/.cargo/bin:$PATH CFLAGS='-std=gnu11 -Wno-implicit-function-declaration'
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-$HOME/projects/.target-ml}
cd "$REPO"
cargo run -q --release --manifest-path tools/basic-pitch-nnef/Cargo.toml -- "$ONNX" "$NNEF"
export YAMES_NOTE_MODEL="$NNEF"
npm run -s detect:bench -- run --fast --notes --out ".detect-bench/$TAG" "$@"
npm run -s detect:bench -- run --fast --check --out ".detect-bench/$TAG-check" "$@"
