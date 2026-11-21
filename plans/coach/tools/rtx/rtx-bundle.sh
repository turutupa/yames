#!/bin/bash
# DGX side: make the bundle an RTX sync job fetches.
#   bash rtx-bundle.sh <branch> [<base-sha the RTX already has>]
# Prints two lines: the branch's sha and the bundle's path (pass both to `rtx-job.sh sync`).
# Thin by default: everything since 406d084155 (the coach commit the RTX's worktree came from,
# already in its repository as refs/remotes/dgx/coach). Give a later base once a sync has
# landed (any sha a PASS sync line printed), or "full" for a whole-history bundle (~700 MB).
set -eu
REPO=${REPO:-/home/dgx-delgado/yames-coach-build}
OUT=${OUT:-/home/dgx-delgado/scratch/yt-coach/rtx}
branch=${1:?branch}
base=${2:-406d084155f20ec4b56fbceb3901a5b68f0c80bf}
mkdir -p "$OUT"
sha=$(git -C "$REPO" rev-parse --verify "refs/heads/$branch^{commit}")
f="$OUT/$branch-${sha:0:8}.bundle"
if [ "$base" = full ]; then
  git -C "$REPO" bundle create "$f" "refs/heads/$branch" 2>/dev/null
else
  git -C "$REPO" merge-base --is-ancestor "$base" "$sha" || { echo "base $base is not an ancestor of $branch" >&2; exit 2; }
  git -C "$REPO" bundle create "$f" "refs/heads/$branch" "^$base" 2>/dev/null
fi
echo "$sha"
echo "$f"
