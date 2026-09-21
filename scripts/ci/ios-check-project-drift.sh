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

# From scratch, not on top of what the build left behind. Two things get in
# the way otherwise, and neither is drift:
#
#   * `Externals/` fills up with the compiled Rust library once a build has
#     run, and the next `xcodegen` pass adds file references for everything it
#     finds there — forty lines of `libapp.a` groups that exist only because
#     this job already built the app.
#   * `yames_iOS/Info.plist` is rewritten during a build (that is where
#     `Info.ios.plist` is merged in), and `ios init` leaves an existing one
#     alone, so what would be compared is the build's file, not the
#     generator's.
#
# Deleting the directory first and regenerating the whole thing is what
# actually answers the question this check asks: is the copy in the repository
# what the generator writes? Anything the generator does not write back comes
# out as a deletion, which is the right answer too.
echo "==> regenerating from scratch"
rm -rf src-tauri/gen/apple
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
