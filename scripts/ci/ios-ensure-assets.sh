#!/usr/bin/env bash
# Put back the one thing in the Xcode project that git cannot carry.
#
# `src-tauri/gen/apple/assets` is a symbolic link to the built frontend
# (`dist/`), created by `tauri ios init` and listed in the project as a folder
# reference, which is how the app's HTML, CSS and JavaScript get into the
# bundle. It is not committed: it points at a build output, it is a symlink
# (and this project is developed on Windows, where those do not survive a
# checkout), and it would be dangling in a fresh clone anyway.
#
# So every build makes it, pointing at wherever the Tauri config says the
# frontend was built to, rather than at a path spelled out here.
set -euo pipefail

cd "$(dirname "$0")/../.."

DIST=$(node -p "require('path').resolve('src-tauri', require('./src-tauri/tauri.conf.json').build.frontendDist)")
test -d "$DIST" || { echo "::error::the frontend has not been built — $DIST does not exist"; exit 1; }

LINK=src-tauri/gen/apple/assets
rm -rf "$LINK"
# Relative, the way `ios init` writes it, so the project is not tied to one
# checkout path.
ln -s "../../../$(basename "$DIST")" "$LINK"
ls -la src-tauri/gen/apple/assets
echo "==> the app's web assets: $(ls "$LINK" | tr '\n' ' ')"
