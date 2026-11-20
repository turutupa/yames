#!/usr/bin/env bash
# The coach build's one wrapper for anything heavy (tsc, vitest, build,
# playwright, cargo). Usage, one plain command per call:
#
#   bash /home/dgx-delgado/yames-coach-build/plans/coach/tools/run.sh npm run test > /tmp/coach-<leg>/vitest.log 2>&1
#
# What it does, so no brief has to repeat it:
#   - stops (exit 75) when /tmp/yames-dgx-yield exists: commit a labelled
#     WIP, write the handoff, end the leg;
#   - sets the Rust environment every agent must use;
#   - waits until the machine has 16 GB of RAM available (it also runs the
#     account's LLM servers);
#   - on weekdays 7 AM to 8 PM Pacific runs the command under nice/ionice,
#     unless /tmp/yames-dgx-full exists.
set -u

if [ "$#" -eq 0 ]; then
  echo "usage: run.sh <command> [args...]" >&2
  exit 2
fi

if [ -e /tmp/yames-dgx-yield ]; then
  echo "YIELD: /tmp/yames-dgx-yield exists. Commit a labelled WIP, write the handoff, stop." >&2
  exit 75
fi

export PATH="$HOME/.cargo/bin:$PATH"
export CFLAGS='-std=gnu11 -Wno-implicit-function-declaration'
export CARGO_TARGET_DIR="$HOME/.target-coach"
export CARGO_BUILD_JOBS=8

while [ "$(free -g | awk '/Mem/{print $7}')" -lt 16 ]; do
  if [ -e /tmp/yames-dgx-yield ]; then
    echo "YIELD: /tmp/yames-dgx-yield exists. Commit a labelled WIP, write the handoff, stop." >&2
    exit 75
  fi
  timeout 120 tail -f /dev/null
done

if [ ! -e /tmp/yames-dgx-full ]; then
  dow="$(TZ=America/Los_Angeles date +%u)"
  hour="$(TZ=America/Los_Angeles date +%-H)"
  if [ "$dow" -le 5 ] && [ "$hour" -ge 7 ] && [ "$hour" -lt 20 ]; then
    exec nice -n 19 ionice -c3 "$@"
  fi
fi

exec "$@"
