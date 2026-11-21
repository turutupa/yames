#!/usr/bin/env bash
# Session 3's gate for a delivery that holds cue merges, Rust and changed
# screens at once: the paths checker over every pack, then tsc, vitest, the
# build, the named layout specs and `npm run test:rust`.
#
#   job submit --name coach-gates-<x> --ram 12G --est 40m --lock coach-layout \
#     --cwd ~/yames-coach-build -- bash plans/coach/tools/gates-s3c.sh [layout specs]
cd /home/dgx-delgado/yames-coach-build || exit 2
echo "gates at $(git rev-parse --short HEAD)"
bash plans/coach/tools/run.sh npm run paths -- check > /tmp/coach-orch/paths-check.log 2>&1
echo "paths check exit $? ($(grep -c '^ok ' /tmp/coach-orch/paths-check.log) ok lines, $(grep -c '^error\|^FAIL' /tmp/coach-orch/paths-check.log) error lines)"
if [ "$#" -eq 0 ]; then
  set -- tests/layout/today-line.spec.ts tests/layout/coach-session.spec.ts tests/layout/coach-loop.spec.ts tests/layout/short-window.spec.ts tests/layout/neck.spec.ts tests/layout/planner.spec.ts
fi
bash plans/coach/tools/gates-rust.sh "$@"
echo "gates exit $?"
