#!/usr/bin/env bash
# Installs bitsandbytes into the coach training venv (ours, under ~/scratch) and
# checks its 4-bit path on the GB10. Queue job (download + GPU):
#
#   job submit --name coach-c3denv-bnb --ram 4G --gpu 2G --est 5m \
#     --cwd /home/dgx-delgado/yames-coach-c3denv -- \
#     bash /home/dgx-delgado/yames-coach-build/plans/coach/tools/run.sh \
#     bash evals/coach/train/env/bnb_check.sh
set -euo pipefail
ROOT="${YAMES_C3D_ROOT:-$HOME/scratch/yames-c3d}"
HERE="$(cd "$(dirname "$0")" && pwd)"
"$ROOT/venv/bin/python" -m pip install --no-deps "bitsandbytes==0.50.2"
"$ROOT/venv/bin/python" -I "$HERE/bnb_check.py"
