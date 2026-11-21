#!/usr/bin/env bash
# The orchestrator's set-up for one or more legs: a worktree and a branch from
# `coach`, the node_modules link, the log folder.
#
#   bash plans/coach/tools/new-leg.sh <leg> [<leg> ...]
set -u
ROOT=/home/dgx-delgado/yames-coach-build
for leg in "$@"; do
  wt="/home/dgx-delgado/yames-coach-$leg"
  if [ -e "$wt" ]; then
    echo "SKIP $leg: $wt exists"
    continue
  fi
  git -C "$ROOT" worktree add -q "$wt" -b "coach-$leg" coach || { echo "FAIL $leg: worktree"; continue; }
  ln -s "$ROOT/node_modules" "$wt/node_modules" || { echo "FAIL $leg: link"; continue; }
  mkdir -p "/tmp/coach-$leg"
  echo "OK $leg: $wt at $(git -C "$wt" rev-parse --short HEAD)"
done
