#!/usr/bin/env bash
# Creates the coach training virtualenv OUTSIDE the repository and installs the
# pinned stack into it. Run as a queue job (it downloads ~3 GB of wheels):
#
#   job submit --name coach-c3denv-venv --ram 6G --est 20m \
#     --cwd /home/dgx-delgado/yames-coach-c3denv -- \
#     bash /home/dgx-delgado/yames-coach-build/plans/coach/tools/run.sh \
#     bash evals/coach/train/env/setup_venv.sh
#
# With no argument it installs the loose list below (first run); with
# `--frozen` it installs exactly requirements.txt (a rebuild of the same env).
# torch comes from the PyTorch CUDA 13.0 index: the same build
# (2.14.1+cu130, aarch64) that ~/services/photo-studio/venv runs on the GB10.
set -euo pipefail

ROOT="${YAMES_C3D_ROOT:-$HOME/scratch/yames-c3d}"
VENV="$ROOT/venv"
HERE="$(cd "$(dirname "$0")" && pwd)"
TORCH_INDEX="https://download.pytorch.org/whl/cu130"

mkdir -p "$ROOT"
if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
PIP="$VENV/bin/python -m pip"
$PIP install --upgrade pip

if [ "${1:-}" = "--frozen" ]; then
  $PIP install --extra-index-url "$TORCH_INDEX" -r "$HERE/requirements.txt"
else
  $PIP install --index-url "$TORCH_INDEX" "torch==2.14.1+cu130"
  # transformers pinned to photo-studio's (known to load on this torch);
  # the rest at their current releases. numpy < 3 for gguf-py.
  $PIP install \
    "transformers==5.23.0" peft datasets accelerate safetensors \
    sentencepiece protobuf "huggingface_hub[hf_xet]" "numpy<3"
fi

$PIP freeze > "$ROOT/requirements.installed.txt"
echo "venv ready: $VENV"
$VENV/bin/python --version
