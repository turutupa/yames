#!/usr/bin/env bash
# Compile Yames for a real iPhone, unsigned.
#
# The point is to leave M06b with exactly one unknown — whether the owner's
# certificate and profile work — rather than two. Building and linking the
# arm64 binary, the Swift half and the asset catalogue for `iphoneos` is
# everything except the signature itself, and none of it needs an identity in
# a keychain.
#
# It goes through `tauri ios build` because nothing else can: the Xcode
# project's Rust build phase reads its options over a socket from the CLI
# process, so a hand-written `xcodebuild` line dies before it compiles
# anything. Signing is switched off through the environment instead, the same
# way the Swift library search path is (see ios-xcode-env.sh).
#
# The CLI archives first and *then* exports an IPA, and exporting is the one
# step that genuinely cannot happen without a signing identity. So a non-zero
# exit is expected here, and the thing this script actually checks is whether
# the archive holds a built app. If it does, the compile is proven and only
# the signature is missing — which is exactly the state M06b starts from.
set -euo pipefail

cd "$(dirname "$0")/../.."

bash scripts/ci/ios-ensure-assets.sh
bash scripts/ci/ios-xcode-env.sh

# Signing is switched off in the project itself, not from here — see the
# `CODE_SIGN_STYLE: Manual` block in `src-tauri/ios-project.yml` for why it
# has to be there. Build settings cannot be forced on Xcode from this script:
# the Tauri CLI runs xcodebuild through `duct … .full_env(env.explicit_env())`,
# which replaces the environment with a short allow-list, so anything exported
# here is thrown away before xcodebuild sees it.
#
# No credentials are invented either. The CLI reads APPLE_API_KEY,
# APPLE_API_ISSUER and APPLE_API_KEY_PATH, validates the key as a PEM, and
# nothing in M06a creates or handles one.
echo "==> building for a real iPhone (export is expected to fail: nothing here is signed)"
if npm run tauri -- ios build --target aarch64 --export-method debugging; then
  echo "==> the CLI got all the way through"
else
  echo "==> the CLI stopped, as expected without a signing identity; looking for the archive"
fi

# `grep -v -- -sim`: a simulator .app from the screenshot step earlier in the
# job is sitting in the same tree, and it is not what this step is about.
find_app() {
  find "$1" -maxdepth "${2:-8}" -name 'Yames.app' -type d -print 2>/dev/null \
    | grep -v -- '-sim' | sort | head -1
}

APP=$(find_app src-tauri/gen/apple/build)
[ -n "$APP" ] || APP=$(find_app "$HOME/Library/Developer/Xcode/Archives")
[ -n "$APP" ] || APP=$(find_app "$HOME/Library/Developer/Xcode/DerivedData")

if [ -z "$APP" ]; then
  echo "::error::nothing was built for a real iPhone"
  find src-tauri/gen/apple/build -maxdepth 5 2>/dev/null | sort | head -50 || true
  exit 1
fi
echo "==> built app: $APP"

BIN="$APP/Yames"
test -f "$BIN" || BIN=$(find "$APP" -maxdepth 1 -type f -perm -111 -print | sort | head -1)

# Refuse an app that is secretly a simulator build — the whole point of this
# step is that the arm64 iPhone slice links.
ARCHS=$(lipo -archs "$BIN" 2>/dev/null || echo '?')
PLATFORM=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleSupportedPlatforms:0' "$APP/Info.plist" 2>/dev/null || echo '?')
if [ "$PLATFORM" != "iPhoneOS" ]; then
  echo "::error::this is a $PLATFORM build, not a real-iPhone one"
  exit 1
fi

mkdir -p artifacts/ios-device
rm -rf artifacts/ios-device/Yames.app
cp -R "$APP" artifacts/ios-device/
cp "$APP/Info.plist" artifacts/ios-device/Info.plist

# ROADMAP 5.0.1 budgets 80 MB per platform, and on a phone the binary is
# essentially all of it. An .app directory is not what anyone downloads — the
# App Store re-packages and thins it — so both numbers are reported and
# neither is called "the download size".
{
  echo "### The iPhone app, unsigned"
  echo
  echo '| | |'
  echo '|---|---|'
  echo "| .app on disk | $(du -sh "$APP" | cut -f1) |"
  [ -n "$BIN" ] && echo "| the binary inside it | $(du -h "$BIN" | cut -f1) |"
  echo "| architectures | $ARCHS |"
  echo "| platform | $PLATFORM |"
  echo "| minimum iOS | $(/usr/libexec/PlistBuddy -c 'Print :MinimumOSVersion' "$APP/Info.plist" 2>/dev/null || echo '?') |"
  echo "| bundle id | $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist" 2>/dev/null || echo '?') |"
  echo "| version | $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist" 2>/dev/null || echo '?') |"
  echo
  echo 'Unsigned on purpose: no certificate, key or profile reaches this workflow.'
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
