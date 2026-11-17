#!/usr/bin/env bash
# Build rhasspy/piper natively on a macOS runner and package it the way
# Yames expects: piper/{piper,piper_phonemize,espeak-ng,*.dylib,espeak-ng-data}.
# Usage: build-piper-macos.sh <asset-arch: aarch64|x64> <expected `file` arch: arm64|x86_64>
set -euo pipefail
ASSET_ARCH="$1"; FILE_ARCH="$2"
: "${PIPER_REF:?}" "${PHONEMIZE_REF:?}"
ROOT="$PWD"; WORK="$ROOT/work"; OUT="$ROOT/out"
rm -rf "$WORK" "$OUT"; mkdir -p "$WORK" "$OUT"

[ "$(uname -m)" = "$FILE_ARCH" ] || { echo "runner is $(uname -m), expected $FILE_ARCH"; exit 1; }

git clone --depth 1 -b "$PIPER_REF" https://github.com/rhasspy/piper "$WORK/piper"
cd "$WORK/piper"
# Pin piper-phonemize (upstream CMake fetches the moving master branch).
sed -i '' "s#piper-phonemize/archive/refs/heads/master.zip#piper-phonemize/archive/${PHONEMIZE_REF}.zip#" CMakeLists.txt
grep -q "$PHONEMIZE_REF" CMakeLists.txt

cmake -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$WORK/_install/piper"
cmake --build build --config Release -j "$(sysctl -n hw.ncpu)"
cmake --install build

PKG="$WORK/_install/piper"
# Upstream's install rule skips *.dylib; bundle them (keep symlinks).
cp -a build/pi/lib/*.dylib "$PKG/"
rm -rf "$PKG"/*.dSYM "$PKG/pkgconfig"

# Let every binary find the bundled dylibs next to it without
# DYLD_LIBRARY_PATH, then re-sign: editing load commands invalidates
# the linker's ad-hoc signature, and arm64 kills unsigned code.
for f in "$PKG"/*; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  file "$f" | grep -q "Mach-O" || continue
  if file "$f" | grep -q executable || [[ "$(basename "$f")" == libpiper_phonemize* || "$(basename "$f")" == libespeak-ng* ]]; then
    install_name_tool -add_rpath @loader_path "$f" 2>/dev/null || true
  fi
  codesign --force --sign - "$f"
done

echo "== contents"; ls -la "$PKG"
echo "== arch"
for f in piper piper_phonemize espeak-ng; do
  file "$PKG/$f"
  file "$PKG/$f" | grep -q "$FILE_ARCH" || { echo "$f is not $FILE_ARCH"; exit 1; }
  file "$PKG/$f" | grep -v "$FILE_ARCH" | grep -q -E "x86_64|arm64" && { echo "$f has a foreign slice"; exit 1; }
done
for d in "$PKG"/*.dylib; do [ -L "$d" ] || { file "$d"; file "$d" | grep -q "$FILE_ARCH" || { echo "$d wrong arch"; exit 1; }; }; done
otool -L "$PKG/piper"

# Speech test from a clean copy of the tarball, the way the app runs it.
tar -C "$WORK/_install" -czf "$OUT/piper_macos_${ASSET_ARCH}.tar.gz" piper
T="$WORK/t"; mkdir -p "$T"; tar -C "$T" -xzf "$OUT/piper_macos_${ASSET_ARCH}.tar.gz"
V="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
curl -fsSL -o "$T/v.onnx" "$V"; curl -fsSL -o "$T/v.onnx.json" "$V.json"
speak() {  # $1 = label; remaining args = env
  local wav="$T/$1.wav"; rm -f "$wav"
  echo "Four bars at one twenty. Ready." | env -u DYLD_LIBRARY_PATH "${@:2}" "$T/piper/piper" \
    --model "$T/v.onnx" --espeak_data "$T/piper/espeak-ng-data" --output_file "$wav"
  local sz; sz=$(stat -f%z "$wav"); echo "$1: $sz bytes"
  [ "$sz" -gt 20000 ] || { echo "$1 produced no speech"; exit 1; }
}
"$T/piper/piper" --help >/dev/null
speak no-env
speak dyld-env DYLD_LIBRARY_PATH="$T/piper"
# Yames' post_extract_fixups adds an absolute rpath and re-signs; prove that still runs.
install_name_tool -add_rpath "$T/piper" "$T/piper/piper"; codesign --force --sign - "$T/piper/piper"
speak after-app-fixup DYLD_LIBRARY_PATH="$T/piper"

cd "$OUT"; shasum -a 256 "piper_macos_${ASSET_ARCH}.tar.gz" | tee "piper_macos_${ASSET_ARCH}.tar.gz.sha256"
ls -la "$OUT"
