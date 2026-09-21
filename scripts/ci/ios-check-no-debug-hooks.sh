#!/usr/bin/env bash
# The screenshot hooks are not in a build meant for a phone.
#
# `src/platform.ts` has two marker values that let the CI simulator job put the
# app on the settings pane or in zen, because nothing can tap a tab bar there.
# They are behind a build-time constant that is only true when
# `YAMES_MOBILE_DEBUG=1`, so in any other build the branches fold away and the
# strings go with them. This is what turns that from a claim into a check: run
# it against `dist/` after a build that did not set the variable.
set -euo pipefail

cd "$(dirname "$0")/../.."

test -d dist/assets || { echo "::error::no dist/assets to check — build the frontend first"; exit 1; }

FAIL=0
for marker in 'debug:settings' 'debug:zen'; do
  if grep -rl -- "$marker" dist/assets >/dev/null 2>&1; then
    echo "::error::the bundle still contains the screenshot hook '$marker'"
    grep -rl -- "$marker" dist/assets
    FAIL=1
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo "This build was made with YAMES_MOBILE_DEBUG set. It must not be."
  exit 1
fi
echo "no screenshot hooks in this bundle."
