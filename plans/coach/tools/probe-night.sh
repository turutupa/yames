#!/usr/bin/env bash
# The owed click-jitter probe runs, on a quiet machine. Run it alone under the
# build's lock, so no agent's heavy command runs beside it:
#
#   flock -x /tmp/coach-heavy.lock bash plans/coach/tools/probe-night.sh > /tmp/coach-orch/probe-night.log 2>&1
#
# It builds the probe from this checkout (CPU LLM backend, release), then
# makes six runs, each only once the 1-minute load average is under 6
# (AGENTS.md: a busy machine makes every number meaningless). A run that never
# gets a quiet machine inside its wait is SKIPPED, not made.
# Logs: /tmp/coach-orch/probe-<label>.log; one summary line per run on stdout.
set -u
ROOT=/home/dgx-delgado/yames-coach-build
OUT=/tmp/coach-orch
M=/home/dgx-delgado/scratch/yames-c3a-models/Qwen3-0.6B-Q8_0.gguf
V="--volume 0.01"
WAIT_MIN="${PROBE_WAIT_MIN:-20}"
# The relay's rule for session 3: a load average under 4 (AGENTS.md says under 6).
LOAD_MAX="${PROBE_LOAD_MAX:-4}"
export XDG_RUNTIME_DIR=/run/user/1000
export PATH="$HOME/.cargo/bin:$PATH"
export CFLAGS='-std=gnu11 -Wno-implicit-function-declaration'
export CARGO_TARGET_DIR="$HOME/.target-coach"
export TMPDIR="${TMPDIR:-/tmp/coach-tmp}"
mkdir -p "$OUT" "$TMPDIR"
cd "$ROOT" || exit 2

echo "[probe-night] build at $(git rev-parse --short HEAD), load $(cut -d' ' -f1 /proc/loadavg)"
if ! cargo build --release --manifest-path src-tauri/Cargo.toml --features coach-llm --bin click-jitter-probe > "$OUT/probe-build.log" 2>&1; then
  echo "[probe-night] BUILD FAILED: $OUT/probe-build.log"
  tail -n 20 "$OUT/probe-build.log"
  exit 2
fi
cp "$CARGO_TARGET_DIR/release/click-jitter-probe" "$OUT/click-jitter-probe" || exit 2
P="$OUT/click-jitter-probe"

quiet() {
  # Wait up to WAIT_MIN minutes for a 1-minute load under LOAD_MAX.
  local i=0
  while [ "$i" -lt "$WAIT_MIN" ]; do
    if awk -v l="$(cut -d' ' -f1 /proc/loadavg)" -v m="$LOAD_MAX" 'BEGIN{exit !(l < m)}'; then return 0; fi
    if [ -e /tmp/yames-dgx-yield ]; then return 1; fi
    timeout 60 tail -f /dev/null
    i=$((i + 1))
  done
  return 1
}

run() {
  local label=$1
  shift
  local log="$OUT/probe-$label.log"
  if quiet; then
    {
      echo "[probe-night] $label start load $(cut -d' ' -f1 /proc/loadavg): $*"
      "$P" "$@"
      echo "[probe-night] exit $? end load $(cut -d' ' -f1 /proc/loadavg)"
    } > "$log" 2>&1
  else
    echo "[probe-night] $label SKIPPED: load $(cut -d' ' -f1 /proc/loadavg) after ${WAIT_MIN} min (needs < ${LOAD_MAX})" > "$log"
  fi
  echo "$label: $(grep -E 'p99|missed|alloc|dropped|PASS|FAIL' "$log" | tr '\n' ' ' | cut -c1-400) | $(tail -n 1 "$log")"
}

run baseline --no-llm $V
run song --no-llm --song-loop --song-take $V
run jam --no-llm --jam-swap --jam-move --jam-take $V
run llm-load --gguf "$M" --llm-load $V
run llm-cancel --gguf "$M" --llm-cancel $V
run jam-llm --gguf "$M" --jam-swap --jam-move --jam-take $V
run song-llm --gguf "$M" --song-loop --song-take $V
echo "[probe-night] done"
