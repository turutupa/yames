#!/bin/bash
# DGX side of leg rtx2: cut the outcomes an RTX eval job printed (between its markers) out of the jobq log.
#   bash rtx2-outcomes.sh <jobq-log> <label> > outcomes.jsonl
set -eu
awk -v l="$2" '$0 == "=== OUTCOMES END " l { on = 0 } on { print } $0 == "=== OUTCOMES BEGIN " l { on = 1 }' "$1" | tr -d '\r'
