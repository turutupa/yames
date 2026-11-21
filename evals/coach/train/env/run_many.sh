#!/usr/bin/env bash
# Several candidates one after another in one queue job; a failure in one does not stop the next.
#   bash run_many.sh <candidate> <config> [<candidate> <config> ...]
set -u
E="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rc=0
while [ "$#" -ge 2 ]; do
  bash "$E/pipeline.sh" "$1" "$2" || rc=1
  shift 2
done
exit "$rc"
