#!/usr/bin/env bash
# c5b1's click-jitter probe runs ("Hear bar N"), one per call, through the job
# queue. Two steps:
#
#   build: through run.sh (the shared lock), so it waits for nobody:
#     job submit --name coach-c5b1-probe-build --ram 12G --est 20m --cwd <worktree> -- \
#       bash /home/dgx-delgado/yames-coach-build/plans/coach/tools/run.sh \
#       bash plans/coach/tools/probe-c5b1.sh build <out-dir>
#   run: NOT through run.sh: it takes the build's lock alone (flock -x), so no
#   heavy command of any leg runs beside it, and holds it at most ten minutes:
#     job submit --name coach-c5b1-probe-<label> --ram 4G --est 15m --cwd <worktree> -- \
#       bash plans/coach/tools/probe-c5b1.sh run <out-dir> <label> --no-llm --hear-take --volume 0.01
#
# The run prints the 1-minute load average before and after: AGENTS.md says a
# p99 is only worth reading under 6. Log: <out-dir>/probe-<label>.log.
set -u
step="${1:-}"
out="${2:-}"
if [ -z "$step" ] || [ -z "$out" ]; then
  echo "usage: probe-c5b1.sh build <out-dir> | run <out-dir> <label> [probe args...]" >&2
  exit 2
fi
mkdir -p "$out"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}"
export PATH="$HOME/.cargo/bin:$PATH"
export CFLAGS='-std=gnu11 -Wno-implicit-function-declaration'
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.target-coach}"

case "$step" in
  build)
    # The shared target folder is every leg's: copy the binary out at once.
    cargo build --release --manifest-path src-tauri/Cargo.toml --features coach-llm --bin click-jitter-probe || exit 2
    cp "$CARGO_TARGET_DIR/release/click-jitter-probe" "$out/click-jitter-probe" || exit 2
    echo "[probe-c5b1] built $(git rev-parse --short HEAD) into $out/click-jitter-probe"
    ;;
  run)
    label="${3:-}"
    if [ -z "$label" ]; then
      echo "run needs a label" >&2
      exit 2
    fi
    shift 3
    if [ -e /tmp/yames-dgx-yield ]; then
      echo "YIELD: /tmp/yames-dgx-yield exists" >&2
      exit 75
    fi
    log="$out/probe-$label.log"
    # Wait up to 30 min for the lock alone; then at most 10 min inside it.
    flock -x -w 1800 /tmp/coach-heavy.lock bash "$0" inner "$out" "$label" "$@" > "$log" 2>&1
    code=$?
    grep -E 'mode|hear-backs|start to click|starts as fresh|p99|missed|alloc|frees|dropped|PASS|FAIL|load' "$log"
    exit "$code"
    ;;
  inner)
    label="$3"
    shift 3
    echo "[probe-c5b1] $label start load $(cut -d' ' -f1-3 /proc/loadavg): $*"
    timeout 600 "$out/click-jitter-probe" "$@"
    code=$?
    echo "[probe-c5b1] $label exit $code end load $(cut -d' ' -f1-3 /proc/loadavg)"
    exit "$code"
    ;;
  *)
    echo "unknown step $step" >&2
    exit 2
    ;;
esac
