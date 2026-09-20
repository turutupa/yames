#!/usr/bin/env bash
# Compile Yames for the iPhone simulator and leave the .app where the
# screenshot script can find it.
#
# `tauri ios build` rather than a hand-written xcodebuild line: for a simulator
# target the CLI archives and then lifts the .app straight out of the archive,
# with no export and no signing anywhere in the path. It is also the command
# that knows how to build the Rust staticlib for the right architecture and
# hand it to Xcode.
#
# Runs on the GitHub macOS runner only — see .github/workflows/ios.yml.
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "==> building the app for the simulator"
npm run tauri -- ios build --debug --target aarch64-sim

echo "==> looking for the .app"
# `sort | head`, not `find | head`: head closing the pipe early kills find with
# SIGPIPE and `pipefail` turns that into a failed script.
APP=$(find src-tauri/gen/apple/build -name '*.app' -type d -maxdepth 4 -print | sort | head -1)
if [ -z "$APP" ]; then
  echo "::error::the simulator build produced no .app"
  find src-tauri/gen/apple/build -maxdepth 4 | sort
  exit 1
fi

echo "the app is at: $APP"
du -sh "$APP"

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "SIM_APP=$APP" >> "$GITHUB_ENV"
fi
