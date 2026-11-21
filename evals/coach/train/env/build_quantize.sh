#!/usr/bin/env bash
# Builds llama.cpp's `llama-quantize` (CPU only: quantising needs no GPU) from
# the source tree at ~/src/llama.cpp into a build directory of our own, so the
# shared CUDA build in ~/src/llama.cpp/build is never touched. Queue job:
#
#   job submit --name coach-c3denv-quantize --ram 6G --est 15m \
#     --cwd /home/dgx-delgado/yames-coach-c3denv -- \
#     bash /home/dgx-delgado/yames-coach-build/plans/coach/tools/run.sh \
#     bash evals/coach/train/env/build_quantize.sh
set -euo pipefail

SRC="${LLAMA_CPP_SRC:-$HOME/src/llama.cpp}"
ROOT="${YAMES_C3D_ROOT:-$HOME/scratch/yames-c3d}"
BUILD="$ROOT/llama-build-cpu"

cmake -S "$SRC" -B "$BUILD" -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DGGML_CUDA=OFF -DLLAMA_CURL=OFF -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=OFF -DLLAMA_BUILD_WEBUI=OFF
cmake --build "$BUILD" --target llama-quantize -j 8
"$BUILD/bin/llama-quantize" --help 2>&1 | head -n 5 || true
ls -la "$BUILD/bin/llama-quantize"
