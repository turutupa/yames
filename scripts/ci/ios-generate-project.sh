#!/usr/bin/env bash
# Generate `src-tauri/gen/apple` — the Xcode project — from the Tauri config.
#
# Two steps, and the second one is not optional. `tauri ios init` writes the
# project with Tauri's own placeholder logo in the asset catalogue; `tauri
# icon` is what replaces it with the Yames mark. Run one without the other and
# the app on the home screen is somebody else's icon.
#
# The background colour is the icon's own near-black rather than the default
# white: `icon-1024.png` has rounded, transparent corners, iOS does not allow
# an app icon with transparency, and white corners around a dark icon look
# like a mistake.
#
# `tauri icon` is pointed at a scratch directory rather than run in place. Left
# to itself it rewrites the Windows, macOS, Linux and Android icons too — every
# one of them committed, none of them anything to do with the iPhone — and a
# build must not move files nobody asked it to. Out of the scratch directory
# only the iOS set is copied in.
#
# The drift check (ios-check-project-drift.sh) runs this same script again,
# which is why it is a script and not four lines in the workflow.
set -euo pipefail

cd "$(dirname "$0")/../.."

npm run tauri -- ios init --skip-targets-install

SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
npm run tauri -- icon src-tauri/icons/icon-1024.png --ios-color '#0b0a14' --output "$SCRATCH"

ICONSET=src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset
test -d "$ICONSET" || { echo "::error::$ICONSET is missing — did \`ios init\` fail?"; exit 1; }
cp "$SCRATCH"/ios/*.png "$ICONSET/"
echo "==> $(ls "$ICONSET"/*.png | wc -l | tr -d ' ') app-icon sizes written"
