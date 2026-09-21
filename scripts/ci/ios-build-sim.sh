#!/usr/bin/env bash
# Compile Yames for the iPhone simulator and leave the .app where the
# screenshot script can find it.
#
# `tauri ios build` is not one option among several — it is the only one. The
# Xcode project's "Build Rust Code" phase runs `tauri ios xcode-script`, and
# that command reads its options over a local socket from the `tauri` process
# that started the build. Run `xcodebuild` by hand and the phase dies with
# `failed to read CLI options: … Connection refused` before it compiles a
# line. So everything Xcode does here goes through the CLI, and anything that
# has to be said to Xcode is said through the environment
# (`ios-xcode-env.sh`).
#
# For a simulator target the CLI archives and then lifts the .app straight out
# of the archive: no export, no signing anywhere in the path.
#
# Runs on the GitHub macOS runner only — see .github/workflows/ios.yml.
set -euo pipefail

cd "$(dirname "$0")/../.."

bash scripts/ci/ios-ensure-assets.sh
# shellcheck source=./ios-xcode-env.sh
. scripts/ci/ios-xcode-env.sh

npm run tauri -- ios build --debug --target aarch64-sim

# `sort | head`, not `find | head`: head closing the pipe early kills find with
# SIGPIPE, and `pipefail` turns that into a failed script.
APP=$(find src-tauri/gen/apple/build -maxdepth 4 -name '*.app' -type d -print 2>/dev/null | sort | head -1)

if [ -z "$APP" ]; then
  echo "::error::the simulator build produced no .app"
  find src-tauri/gen/apple/build -maxdepth 4 2>/dev/null | sort || true
  exit 1
fi

echo "the app is at: $APP"
du -sh "$APP"

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "SIM_APP=$APP" >> "$GITHUB_ENV"
fi
