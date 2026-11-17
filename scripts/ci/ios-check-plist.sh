#!/usr/bin/env bash
# What the app asks a phone for — read off the built app, not off a source file.
#
# Yames on a phone has no microphone, no camera, no Bluetooth and no reason to
# look at the local network: the mic evaluation and the coach do not ship on
# mobile (MOBILE_IMPLEMENTATION_PLAN §1), and everything else it does happens
# inside itself. A usage-description string in the Info.plist is what makes iOS
# show a permission prompt, so the way to promise the app never asks is to
# check that none of those strings is in the bundle.
#
# The one thing it does declare is `UIBackgroundModes: audio`, which is what
# keeps the click going with the screen locked. That one is required, and its
# absence fails this check as loudly as a microphone string's presence.
set -euo pipefail

cd "$(dirname "$0")/../.."

PLIST=$(find artifacts/ios-device -maxdepth 2 -name 'Info.plist' -print | sort | head -1)
test -n "$PLIST" || { echo "::error::no built Info.plist to check"; exit 1; }
echo "==> reading $PLIST"

# Binary plists are the normal case in a built app; convert a copy to XML so it
# can be read as text.
XML=$(mktemp)
plutil -convert xml1 -o "$XML" "$PLIST"

FAIL=0

FORBIDDEN=(
  NSMicrophoneUsageDescription
  NSCameraUsageDescription
  NSBluetoothAlwaysUsageDescription
  NSBluetoothPeripheralUsageDescription
  NSLocalNetworkUsageDescription
  NSContactsUsageDescription
  NSLocationWhenInUseUsageDescription
  NSLocationAlwaysAndWhenInUseUsageDescription
  NSPhotoLibraryUsageDescription
  NSUserTrackingUsageDescription
  NSSpeechRecognitionUsageDescription
  NSMotionUsageDescription
  NSCalendarsUsageDescription
  NSRemindersUsageDescription
  NSAppleMusicUsageDescription
)

for key in "${FORBIDDEN[@]}"; do
  if grep -q "<key>$key</key>" "$XML"; then
    echo "::error::the built app declares $key — Yames asks a phone for nothing"
    FAIL=1
  fi
done

if ! /usr/libexec/PlistBuddy -c 'Print :UIBackgroundModes' "$PLIST" 2>/dev/null | grep -q audio; then
  echo "::error::UIBackgroundModes does not contain 'audio' — the click will stop when the screen locks"
  FAIL=1
fi

echo "==> UIBackgroundModes:"
/usr/libexec/PlistBuddy -c 'Print :UIBackgroundModes' "$PLIST" 2>/dev/null || echo "(absent)"
echo "==> UISupportedInterfaceOrientations:"
/usr/libexec/PlistBuddy -c 'Print :UISupportedInterfaceOrientations' "$PLIST" 2>/dev/null || echo "(absent)"

if /usr/libexec/PlistBuddy -c 'Print :UISupportedInterfaceOrientations' "$PLIST" 2>/dev/null \
  | grep -qiE 'landscape|PortraitUpsideDown'; then
  echo "::error::the app allows an orientation other than portrait — the plan locks v1 to portrait"
  FAIL=1
fi

echo "==> every usage-description string in the bundle (expected: none)"
grep -o '<key>NS[A-Za-z]*UsageDescription</key>' "$XML" || echo "(none)"

rm -f "$XML"

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
echo "the app asks a phone for nothing, and keeps playing with the screen off."
