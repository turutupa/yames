#!/bin/bash
# The RTX side of the coach build's gate jobs. Runs inside the RTX's WSL, started by jobq
# (`job submit --machine rtx --env any ... -- bash /mnt/c/yt-coach/tools/rtx-job.sh ...`).
# Everything it writes is under C:\yt-coach\ (/mnt/c/yt-coach). Low priority throughout:
# nice 19 here, BelowNormal for the Windows processes (the .ps1 scripts set it themselves).
#
#   rtx-job.sh check                         interop, scp, Windows tools (read-only)
#   (copying these scripts to C:\yt-coach\tools is NOT a mode of this script: Windows cannot
#    overwrite the file bash is running. See README.md, line 0.)
#   rtx-job.sh sync <sha> <dgx-bundle-path>  copy the bundle from the DGX, fetch it, check <sha> out (detached) in C:\yt-coach\wt
#   rtx-job.sh gate <tsc|vitest|build|rust-lib> [sha]   one gate in C:\yt-coach\wt (refuses if HEAD is not sha)
#
# The DGX is reached only through the Windows side's existing ssh config (host `dgx`, the one
# dgx-run uses), with scp in batch mode: no prompts, no new keys.
set -u
renice -n 19 $$ >/dev/null 2>&1
W=/mnt/c/yt-coach
SYS=/mnt/c/Windows/System32
PS="$SYS/WindowsPowerShell/v1.0/powershell.exe"
SCP="$SYS/OpenSSH/scp.exe"
mkdir -p "$W/logs/s6" "$W/bundles" "$W/tools"
# Windows processes need a Windows current directory.
cd "$W" || exit 2

ps() { "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$@"; }

case "${1:-}" in
  check)
    echo "WSL_INTEROP=${WSL_INTEROP:-unset}"
    ls -la "$PS" "$SCP"
    "$SYS/cmd.exe" /c "ver"
    ps 'C:\yt-coach\tools\rtx-gate.ps1' -Step check
    ;;
  sync)
    sha=${2:-}; src=${3:-}
    [ -n "$sha" ] && [ -n "$src" ] || { echo "FAIL sync: usage sync <sha> <dgx-bundle-path>"; exit 2; }
    t0=$(date +%s)
    "$SCP" -B -q "dgx:$src" bundles/sync.bundle || { echo "FAIL sync: scp of the bundle exit $?"; exit 3; }
    echo "bundle copied in $(( $(date +%s) - t0 )) s, $(stat -c %s bundles/sync.bundle) bytes"
    ps 'C:\yt-coach\tools\rtx-sync.ps1' -Sha "$sha" -Bundle 'C:\yt-coach\bundles\sync.bundle'
    ;;
  gate)
    [ -n "${2:-}" ] || { echo "FAIL gate: which step?"; exit 2; }
    ps 'C:\yt-coach\tools\rtx-gate.ps1' -Step "$2" -Sha "${3:-}"
    ;;
  *)
    echo "usage: rtx-job.sh check | sync <sha> <dgx-bundle> | gate <step> [sha]"; exit 2
    ;;
esac
