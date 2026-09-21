#!/usr/bin/env bash
# Compile Yames for the iPhone simulator and leave the .app where the
# screenshot script can find it.
#
# `tauri ios build` first: for a simulator target the CLI archives and then
# lifts the .app straight out of the archive, with no export and no signing in
# the path, and it is the command that knows how to build the Rust staticlib
# for the right architecture and hand it to Xcode.
#
# If that refuses — it wants a signing identity in more situations than it
# should — the second attempt drives xcodebuild directly. `-sdk
# iphonesimulator` plus `CODE_SIGNING_ALLOWED=NO` is a build no identity can be
# needed for, and the project's own build phase still compiles the Rust half,
# so the app that comes out is the same one.
#
# Runs on the GitHub macOS runner only — see .github/workflows/ios.yml.
set -euo pipefail

cd "$(dirname "$0")/../.."

find_app() {
  # `sort | head`, not `find | head`: head closing the pipe early kills find
  # with SIGPIPE, and `pipefail` turns that into a failed script.
  find "$1" -maxdepth "${2:-4}" -name '*.app' -type d -print 2>/dev/null | sort | head -1
}

echo "==> attempt 1: the Tauri CLI"
if npm run tauri -- ios build --debug --target aarch64-sim; then
  APP=$(find_app src-tauri/gen/apple/build)
else
  echo "::warning::\`tauri ios build\` failed for the simulator; building with xcodebuild instead"
  APP=""
fi

if [ -z "${APP:-}" ]; then
  echo "==> attempt 2: xcodebuild"
  PROJECT=$(find src-tauri/gen/apple -maxdepth 1 -name '*.xcodeproj' -print | sort | head -1)
  test -n "$PROJECT" || { echo "::error::no .xcodeproj under src-tauri/gen/apple"; exit 1; }

  LIST=$(xcodebuild -project "$PROJECT" -list -json 2>/dev/null || true)
  read -r SCHEME CONFIG <<EOF
$(printf '%s' "$LIST" | python3 -c "
import json, sys
text = sys.stdin.read()
p = json.loads(text[text.find('{'):])['project']
schemes = p.get('schemes') or ['']
ios = [s for s in schemes if s.endswith('_iOS')]
configs = p.get('configurations') or ['debug']
config = next((c for c in ('debug', 'Debug') if c in configs), configs[0])
print((ios or schemes)[0], config)
")
EOF
  test -n "$SCHEME" || { echo "::error::could not read a scheme out of $PROJECT"; printf '%s\n' "$LIST"; exit 1; }
  echo "==> scheme: $SCHEME, configuration: $CONFIG"

  DD="$PWD/build/ios-sim"
  rm -rf "$DD"
  xcodebuild build \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration "$CONFIG" \
    -sdk iphonesimulator \
    -arch arm64 \
    -derivedDataPath "$DD" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY="" \
    | tail -80
  APP=$(find_app "$DD/Build/Products" 3)
fi

if [ -z "${APP:-}" ]; then
  echo "::error::the simulator build produced no .app"
  find src-tauri/gen/apple/build -maxdepth 4 2>/dev/null | sort || true
  exit 1
fi

echo "the app is at: $APP"
du -sh "$APP"

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "SIM_APP=$APP" >> "$GITHUB_ENV"
fi
