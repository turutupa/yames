#!/usr/bin/env bash
# The orchestrator's post-merge gates on the main checkout, one command:
#
#   bash plans/coach/tools/gates.sh [layout-spec ...]
#
# Runs tsc, vitest and the production build through run.sh (which waits for
# RAM and honours the yield file), then any layout specs named. Full logs go
# to /tmp/coach-orch/; this prints one line per gate and the tail of a
# failure. Exit code: 0 when every gate passed.
set -u
ROOT=/home/dgx-delgado/yames-coach-build
RUN="$ROOT/plans/coach/tools/run.sh"
LOGS=/tmp/coach-orch
mkdir -p "$LOGS"
cd "$ROOT" || exit 2

failed=0
gate() {
  local name="$1"
  shift
  if bash "$RUN" "$@" > "$LOGS/$name.log" 2>&1; then
    echo "PASS $name"
  else
    local code=$?
    echo "FAIL $name (exit $code) — $LOGS/$name.log"
    tail -n 25 "$LOGS/$name.log"
    failed=1
    if [ "$code" -eq 75 ]; then exit 75; fi
  fi
}

gate tsc npx tsc --noEmit
gate vitest npm run test
grep -E "Test Files|Tests " "$LOGS/vitest.log" | tail -n 2
# Under a high load average vitest's worker RPC times out ("Timeout calling
# onTaskUpdate") and the run exits 1 with every test passing. Say which it was.
if grep -q 'Timeout calling "onTaskUpdate"' "$LOGS/vitest.log"; then
  if grep -E "Test Files|Tests " "$LOGS/vitest.log" | grep -q "failed"; then
    echo "NOTE vitest: a worker RPC timeout AND failing tests"
  else
    echo "NOTE vitest: exit 1 is the worker RPC timeout under load; no test failed"
  fi
fi
gate build npm run build
if [ "$#" -gt 0 ]; then
  gate layout npx playwright test --trace off "$@"
  grep -E "^ +[0-9]+ (passed|failed|flaky|skipped)" "$LOGS/layout.log"
fi
exit "$failed"
