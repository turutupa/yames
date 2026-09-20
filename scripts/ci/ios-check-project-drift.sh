#!/usr/bin/env bash
# The committed Xcode project is what `ios init` produces.
#
# `src-tauri/gen/apple` is committed the way `gen/android` is, because the
# build has to be reproducible from a checkout and because anything
# hand-adjusted inside it would be thrown away by a regeneration nobody
# noticed. So this re-runs the generator and fails if the tree moved: either
# someone edited the project by hand instead of editing the Tauri config, or
# the Tauri CLI changed what it writes and the committed copy is now stale.
#
# Runs last in the job, because it rewrites the working tree.
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "==> regenerating"
bash "$(dirname "$0")/ios-generate-project.sh"

# A build leaves its own output inside the project directory; only tracked
# files are the question here.
CHANGED=$(git status --porcelain -- src-tauri/gen/apple | grep -v '^??' || true)

if [ -n "$CHANGED" ]; then
  echo "::error::re-running \`tauri ios init\` changes the committed Xcode project."
  echo "$CHANGED"
  echo
  echo "--- what moved ---"
  git --no-pager diff --stat -- src-tauri/gen/apple
  git --no-pager diff -- src-tauri/gen/apple | head -200
  exit 1
fi

echo "the committed project is exactly what the generator writes."
