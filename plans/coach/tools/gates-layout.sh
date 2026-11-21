#!/usr/bin/env bash
# The orchestrator's layout gate alone, on a named checkout (default: the main
# one), so the tsc / vitest / build gates need not hold the Playwright lock:
#
#   bash plans/coach/tools/gates-layout.sh <log-name> [--in <checkout>] [layout-spec ...]
#
# No spec named = the full suite. Submit it with `--lock coach-layout`.
set -u
ROOT=/home/dgx-delgado/yames-coach-build
RUN="$ROOT/plans/coach/tools/run.sh"
LOGS=/tmp/coach-orch
mkdir -p "$LOGS"
name="$1"
shift
where="$ROOT"
if [ "${1:-}" = "--in" ]; then
  where="$2"
  shift 2
fi
cd "$where" || exit 2
if bash "$RUN" npx playwright test --trace off "$@" > "$LOGS/$name.log" 2>&1; then
  echo "PASS $name"
  code=0
else
  code=$?
  echo "FAIL $name (exit $code) — $LOGS/$name.log"
  grep -E "^ +[0-9]+\) " "$LOGS/$name.log" | head -n 40
fi
grep -E "^ +[0-9]+ (passed|failed|flaky|skipped|did not run)" "$LOGS/$name.log"
exit "$code"
