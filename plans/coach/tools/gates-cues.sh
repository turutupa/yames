#!/usr/bin/env bash
# Post-merge gates for a cue (pack content) merge on the main checkout:
# the paths checker over every pack, then tsc, vitest and the build.
cd /home/dgx-delgado/yames-coach-build || exit 2
bash plans/coach/tools/run.sh npm run paths -- check > /tmp/coach-orch/paths-check.log 2>&1
echo "paths check exit $?"
grep -cE " ok\b" /tmp/coach-orch/paths-check.log
grep -iE "error" /tmp/coach-orch/paths-check.log | head -n 5
bash plans/coach/tools/gates.sh
echo "gates exit $?"
