#!/usr/bin/env bash
# Downloads one Qwen3 base model (safetensors) from the publisher's own public
# Hugging Face repository, anonymously, then records every file's size and
# SHA-256. Run as a queue job, one model per job:
#
#   job submit --name coach-c3denv-dl-0p6b --ram 4G --est 30m \
#     --cwd /home/dgx-delgado/yames-coach-c3denv -- \
#     bash /home/dgx-delgado/yames-coach-build/plans/coach/tools/run.sh \
#     bash evals/coach/train/env/download_weights.sh Qwen3-0.6B
#
# Qwen/Qwen3-<size> is the post-trained (hybrid thinking) model the app's
# pinned Qwen/Qwen3-4B-GGUF was converted from; not -Base, not -2507.
set -euo pipefail

NAME="$1"
REV="${2:-main}"
ROOT="${YAMES_C3D_ROOT:-$HOME/scratch/yames-c3d}"
DEST="$ROOT/weights/$NAME"
mkdir -p "$DEST"

# No account, no token, no telemetry.
unset HF_TOKEN HUGGING_FACE_HUB_TOKEN
export HF_HUB_DISABLE_TELEMETRY=1
export HF_HUB_DISABLE_IMPLICIT_TOKEN=1
export HF_HOME="$ROOT/hf-home"

"$ROOT/venv/bin/hf" download "Qwen/$NAME" --revision "$REV" --local-dir "$DEST" --exclude "*.bin" --exclude "*.pth" --exclude "*.gguf"

# The commit the files came from (hf writes it under .cache).
find "$DEST/.cache" -name "*.metadata" -print -quit | xargs -r head -n 1 > "$DEST/REVISION" || true

( cd "$DEST" && find . -maxdepth 1 -type f ! -name SHA256SUMS ! -name SIZES -printf '%f\n' | sort | xargs sha256sum ) > "$DEST/SHA256SUMS"
( cd "$DEST" && find . -maxdepth 1 -type f ! -name SHA256SUMS ! -name SIZES -printf '%s %f\n' | sort -k2 ) > "$DEST/SIZES"
echo "== $NAME at $(cat "$DEST/REVISION" 2>/dev/null)"
cat "$DEST/SIZES"
cat "$DEST/SHA256SUMS"
