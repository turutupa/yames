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

export HOME="${HOME:-/home/dgx-delgado}"
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export CFLAGS='-std=gnu11 -Wno-implicit-function-declaration'
export CARGO_TARGET_DIR="$HOME/.target-coach"
export CARGO_BUILD_JOBS=8
# A temp directory of this account's own. /tmp is shared with another account
# that runs the same Rust suite, and tests that write fixed names under
# temp_dir() (take_video's fifteen) fail with PermissionDenied on its folders.
export TMPDIR="${TMPDIR:-/tmp/coach-tmp}"
mkdir -p "$TMPDIR"

while [ "$(free -g | awk '/Mem/{print $7}')" -lt 16 ]; do
  if [ -e /tmp/yames-dgx-yield ]; then
    echo "YIELD: /tmp/yames-dgx-yield exists. Commit a labelled WIP, write the handoff, stop." >&2
    exit 75
  fi
  timeout 120 tail -f /dev/null
done

# OWNER-UPDATES 2026-11-20 18:08: "full throttle, the DGX is lent": the daytime
# limits are lifted until the owner says otherwise. The orchestrator records
# that in /tmp/coach-orch/limits (one word: "full" = lifted, "day" = the
# weekday limits below apply again; overwrite the file, never delete it).
limits="$(cat /tmp/coach-orch/limits 2>/dev/null || echo day)"
if [ ! -e /tmp/yames-dgx-full ] && [ "$limits" != "full" ]; then
  dow="$(TZ=America/Los_Angeles date +%u)"
  hour="$(TZ=America/Los_Angeles date +%-H)"
  if [ "$dow" -le 5 ] && [ "$hour" -ge 7 ] && [ "$hour" -lt 20 ]; then
    # The owner works on this machine in these hours (OWNER-UPDATES,
    # 2026-11-20 11:45): four cargo jobs, two Playwright workers, four vitest
    # workers, and never two heavy commands at once across all agents. The
    # lock below is that last rule: a second command waits here for the first
    # to end, so run heavy commands in the background and wait for the log.
    export CARGO_BUILD_JOBS=4
    joined=" $* "
    case "$joined" in
      *" playwright test "*)
        case "$joined" in
          *" --workers"*) ;;
          *) set -- "$@" --workers=2 ;;
        esac
        ;;
      *" vitest "*)
        case "$joined" in
          *" --maxWorkers"*) ;;
          *) set -- "$@" --maxWorkers=4 ;;
        esac
        ;;
      " npm run test "*)
        case "$joined" in
          *" --maxWorkers"*) ;;
          *" -- "*) set -- "$@" --maxWorkers=4 ;;
          *) set -- "$@" -- --maxWorkers=4 ;;
        esac
        ;;
    esac
    echo "run.sh: daytime limits (nice, one heavy command at a time): $*" >&2
    exec flock /tmp/coach-heavy.lock nice -n 19 ionice -c3 "$@"
  fi
fi

# Evenings and weekends: commands run side by side, but under a shared hold on
# the same lock, so the orchestrator can take it alone (flock -x) for a
# click-jitter probe run, which needs a machine with nothing else on it.
exec flock -s /tmp/coach-heavy.lock "$@"
