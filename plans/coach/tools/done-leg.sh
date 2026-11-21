#!/usr/bin/env bash
# The orchestrator's clean-up for merged legs (AGENTS.md, "When a worktree's
# work is merged"): only a worktree whose HEAD is an ancestor of `coach` and
# whose tree is clean is removed; the node_modules link is unlinked first; the
# branch is kept.
#
#   bash plans/coach/tools/done-leg.sh <leg> [<leg> ...]
set -u
ROOT=/home/dgx-delgado/yames-coach-build
for leg in "$@"; do
  wt="/home/dgx-delgado/yames-coach-$leg"
  if [ ! -d "$wt" ]; then
    echo "SKIP $leg: no worktree"
    continue
  fi
  head="$(git -C "$wt" rev-parse HEAD)"
  if ! git -C "$ROOT" merge-base --is-ancestor "$head" coach; then
    echo "LEFT $leg: $head is not merged into coach"
    continue
  fi
  if [ -L "$wt/node_modules" ]; then unlink "$wt/node_modules"; fi
  dirty="$(git -C "$wt" status --porcelain)"
  if [ -n "$dirty" ]; then
    echo "LEFT $leg: not clean:"
    echo "$dirty" | head -n 5
    ln -s "$ROOT/node_modules" "$wt/node_modules"
    continue
  fi
  git -C "$ROOT" worktree remove "$wt" && echo "REMOVED $leg"
done
git -C "$ROOT" worktree prune
