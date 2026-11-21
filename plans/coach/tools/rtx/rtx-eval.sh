#!/bin/bash
# The RTX side of leg rtx2: the coach router's held-out eval on Vulkan. Runs inside the RTX's WSL,
# started by jobq (`job submit --machine rtx --env any ... -- bash /mnt/c/yt-coach/tools/rtx-eval.sh ...`).
# Writes only under C:\yt-coach\ (models, bin, target, evals, logs\s6). nice 19 here; the .ps1 sets
# BelowNormal for the Windows side.
#
#   rtx-eval.sh look                                 read-only: pv1's build lines, the Vulkan SDK, models, bin, GPU tools
#   rtx-eval.sh pull <dgx-path> <dest> <sha256>      Windows scp -B from the DGX to C:\yt-coach\<dest>, refuse on a hash mismatch
#   rtx-eval.sh hash <dest>                          sha256 of C:\yt-coach\<dest>
#   rtx-eval.sh build <sha>                          cargo build --release --features coach-llm-vulkan --bin coach-eval (rtx-eval.ps1)
#   rtx-eval.sh eval <gguf-under-models> <label> <sha256>   run the held-out requests, print outcomes between markers
set -u
renice -n 19 $$ >/dev/null 2>&1
W=/mnt/c/yt-coach
SYS=/mnt/c/Windows/System32
PS="$SYS/WindowsPowerShell/v1.0/powershell.exe"
SCP="$SYS/OpenSSH/scp.exe"
mkdir -p "$W/logs/s6" "$W/evals" "$W/models" "$W/bin"
cd "$W" || exit 2

ps() { "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$@"; }

case "${1:-}" in
  look)
    p=/mnt/c/Users/delgado/src/pv1-rtx-probe.ps1
    ls -la "$p"
    grep -n -i 'vulkan\|cargo build\|CARGO_\|vcvars\|clang\|LIBCLANG\|CMAKE\|RUSTUP\|PriorityClass\|nvidia-smi' "$p" | head -60
    ls -d /mnt/c/Users/delgado/yames-tools/* /mnt/c/yames-tools/* 2>/dev/null | head -20
    ls -la "$W/models" "$W/bin" "$W/target" 2>&1 | head -30
    ls -la "$SYS/nvidia-smi.exe" "/mnt/c/Program Files/NVIDIA Corporation/NVSMI/nvidia-smi.exe" 2>&1
    sha256sum "$W/models/Qwen3-4B-Q4_K_M.gguf"
    df -h /mnt/c | tail -1
    ;;
  pull)
    src=${2:-}; dest=${3:-}; want=${4:-}
    [ -n "$src" ] && [ -n "$dest" ] && [ -n "$want" ] || { echo "FAIL pull: usage pull <dgx-path> <dest> <sha256>"; exit 2; }
    t0=$(date +%s)
    "$SCP" -B -q "dgx:$src" "$dest" || { echo "FAIL pull: scp exit $?"; exit 3; }
    got=$(sha256sum "$dest" | cut -d' ' -f1)
    echo "pulled $src -> C:\\yt-coach\\$dest in $(( $(date +%s) - t0 )) s, $(stat -c %s "$dest") bytes, sha256 $got"
    if [ "$got" != "$want" ]; then mv -f "$dest" "$dest.bad"; echo "FAIL pull: sha256 mismatch (want $want), moved to $dest.bad"; exit 4; fi
    echo "PASS pull $dest"
    ;;
  hash)
    sha256sum "${2:?dest}"
    ;;
  build)
    ps 'C:\yt-coach\tools\rtx-eval.ps1' -Step build -Sha "${2:-}"
    ;;
  eval)
    g=${2:-}; label=${3:-}; want=${4:-}
    [ -n "$g" ] && [ -n "$label" ] && [ -n "$want" ] || { echo "FAIL eval: usage eval <gguf> <label> <sha256>"; exit 2; }
    got=$(sha256sum "models/$g" | cut -d' ' -f1)
    [ "$got" = "$want" ] || { echo "FAIL eval: models/$g sha256 $got, want $want"; exit 4; }
    echo "model sha256 OK $got"
    got=$(sha256sum evals/requests.jsonl | cut -d' ' -f1)
    echo "requests sha256 $got"
    ps 'C:\yt-coach\tools\rtx-eval.ps1' -Step eval -Gguf "C:\\yt-coach\\models\\$g" -Label "$label"
    code=$?
    echo "=== OUTCOMES BEGIN $label"
    cat "evals/$label/outcomes.jsonl"
    echo "=== OUTCOMES END $label"
    exit $code
    ;;
  *)
    echo "usage: rtx-eval.sh look | pull <dgx-path> <dest> <sha256> | hash <dest> | build <sha> | eval <gguf> <label> <sha256>"; exit 2
    ;;
esac
