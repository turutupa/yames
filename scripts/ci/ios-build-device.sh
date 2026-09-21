#!/usr/bin/env bash
# Compile Yames for a real iPhone, unsigned.
#
# The point is to leave M06b with exactly one unknown — whether the owner's
# certificate and profile work — rather than two. `CODE_SIGNING_ALLOWED=NO`
# builds and links the arm64 binary, the frameworks and the asset catalogue
# for `iphoneos` without any identity in the keychain, which is everything
# except the signature itself.
#
# `xcodebuild archive` directly rather than `tauri ios build`: that command
# exports an IPA, and exporting is the one step that cannot happen without a
# signing identity. The archive is the part that can.
set -euo pipefail

cd "$(dirname "$0")/../.."

PROJECT=$(find src-tauri/gen/apple -maxdepth 1 -name '*.xcodeproj' -print | sort | head -1)
test -n "$PROJECT" || { echo "::error::no .xcodeproj under src-tauri/gen/apple"; exit 1; }
echo "==> project: $PROJECT"

# The scheme and configuration names come out of the project rather than being
# hardcoded: they are cargo-mobile2's, not a promise. `-list -json` puts
# warnings ahead of the JSON often enough that the payload has to be found
# rather than parsed from the first byte.
LIST=$(xcodebuild -project "$PROJECT" -list -json 2>/dev/null || true)
read -r SCHEME CONFIG <<EOF
$(printf '%s' "$LIST" | python3 -c "
import json, sys
text = sys.stdin.read()
start = text.find('{')
p = json.loads(text[start:])['project']
schemes = p.get('schemes') or ['']
ios = [s for s in schemes if s.endswith('_iOS')]
configs = p.get('configurations') or ['release']
config = next((c for c in ('release', 'Release') if c in configs), configs[-1])
print((ios or schemes)[0], config)
")
EOF
test -n "$SCHEME" || { echo "::error::could not read a scheme out of $PROJECT"; printf '%s\n' "$LIST"; exit 1; }
echo "==> scheme: $SCHEME, configuration: $CONFIG"

ARCHIVE="$PWD/build/ios-device.xcarchive"
rm -rf "$ARCHIVE"

xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -sdk iphoneos \
  -arch arm64 \
  -archivePath "$ARCHIVE" \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGN_ENTITLEMENTS="" \
  | tail -60

APP=$(find "$ARCHIVE/Products/Applications" -maxdepth 1 -name '*.app' -type d -print | sort | head -1)
test -n "$APP" || { echo "::error::the archive holds no .app"; find "$ARCHIVE" -maxdepth 4 | sort; exit 1; }

mkdir -p artifacts/ios-device
cp -R "$APP" artifacts/ios-device/
cp "$APP/Info.plist" artifacts/ios-device/Info.plist

# ROADMAP 5.0.1 budgets 80 MB per platform, and on a phone the binary is
# essentially all of it. An .app directory is not what a user downloads — the
# App Store re-packages and thins it — so both numbers are reported and
# neither is called "the download size".
BIN=$(find "$APP" -maxdepth 1 -type f -perm -111 -print | sort | head -1)
{
  echo "### The iPhone app, unsigned"
  echo
  echo '| | |'
  echo '|---|---|'
  echo "| .app on disk | $(du -sh "$APP" | cut -f1) |"
  [ -n "$BIN" ] && echo "| the binary inside it | $(du -h "$BIN" | cut -f1) |"
  echo "| architectures | $(lipo -archs "$BIN" 2>/dev/null || echo '?') |"
  echo "| minimum iOS | $(/usr/libexec/PlistBuddy -c 'Print :MinimumOSVersion' "$APP/Info.plist" 2>/dev/null || echo '?') |"
  echo "| bundle id | $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist" 2>/dev/null || echo '?') |"
  echo "| version | $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist" 2>/dev/null || echo '?') |"
  echo
  echo 'Unsigned on purpose: no certificate, key or profile reaches this workflow.'
} | tee -a "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
