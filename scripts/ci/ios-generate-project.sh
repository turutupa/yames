#!/usr/bin/env bash
# Generate `src-tauri/gen/apple` — the Xcode project — from the Tauri config.
#
# Two commands, and the second one is not optional. `tauri ios init` writes the
# project with Tauri's own placeholder app icon in it; `tauri icon` is what
# replaces that with the Yames mark. Run one without the other and the app on
# the home screen is somebody else's logo.
#
# The background colour is the icon's own near-black rather than the default
# white: `icon-1024.png` has rounded, transparent corners, and iOS does not
# allow transparency in an app icon, so something has to fill them. White would
# put a bright halo around a dark icon.
#
# The drift check (ios-check-project-drift.sh) runs exactly these two commands
# again, which is why they live in a file rather than in the workflow.
set -euo pipefail

cd "$(dirname "$0")/../.."

npm run tauri -- ios init --skip-targets-install
npm run tauri -- icon src-tauri/icons/icon-1024.png --ios-color '#0b0a14'
