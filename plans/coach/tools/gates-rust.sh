#!/usr/bin/env bash
# Post-merge gates for a merge that changed Rust: the usual gates (with any
# layout specs named), then the Rust unit suite, on the main checkout.
#
#   bash plans/coach/tools/gates-rust.sh [layout-spec ...]
cd /home/dgx-delgado/yames-coach-build || exit 2
bash plans/coach/tools/gates.sh "$@"
echo "gates exit $?"
bash plans/coach/tools/run.sh npm run test:rust > /tmp/coach-orch/rust.log 2>&1
echo "rust exit $?"
grep -E "^test result" /tmp/coach-orch/rust.log | tail -n 3
