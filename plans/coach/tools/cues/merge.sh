#!/bin/bash
# Merge translated cues: bash merge.sh <lng> [<lng> ...]
cd /home/dgx-delgado/yames-coach-cues2 || exit 2
for lng in "$@"; do
  npm run paths -- strings merge "$lng" "/tmp/coach-cues2/i18n-blues-pentatonics/done.$lng.json" || exit 1
done
