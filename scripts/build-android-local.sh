#!/usr/bin/env bash
# Local arm64 APK of Yames, signed with the TEST key, built the way
# .github/workflows/beta.yml builds the Android beta:
#
#   YAMES_CHANNEL=beta YAMES_VERSION=<X.Y.0-beta.N> \
#     npm run tauri -- android build --apk --target aarch64 --config <overlay>
#
# (scripts/tauri.mjs adds --features detect-tract, YAMES_MOBILE=1 and the
# stripped release profile.)
#
# Works on an x86_64 Linux box with a normal SDK + NDK, and on an aarch64
# Linux host (the DGX Spark), where Google ships no host binaries:
#   * the NDK's prebuilt/linux-x86_64/bin is replaced by a shim directory
#     ($NDK_SHIM) whose clang wrappers call the host's clang-18 against the
#     NDK's own sysroot and compiler-rt (only sysroot/ and lib/ are needed
#     from the NDK); ar/readelf are the host's binutils;
#   * aapt2 and zipalign (x86_64) run under qemu-user via binfmt_misc, with
#     an x86_64 glibc unpacked at $X86_ROOT (libc6 + libgcc-s1 .debs).
#
# The keystore comes from $KEY_INFO (keystore=, alias=, password= lines).
# It refuses any alias other than yames-test: the Play upload key is never
# used here.
#
# Env knobs: ANDROID_HOME, NDK_SRC, NDK_SHIM, X86_ROOT, KEY_INFO, BETA_N
# (default: last beta.yml run + 1), OUT_DIR, RTX_DEST (scp target, empty to
# skip), NICE (default 0), CARGO_BUILD_JOBS, CARGO_TARGET_DIR.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"

: "${ANDROID_HOME:=$HOME/android-sdk}"
: "${NDK_SRC:=$HOME/android-ndk-dl/android-ndk-r26b}"
: "${NDK_SHIM:=$HOME/android-ndk-local}"
: "${X86_ROOT:=$ANDROID_HOME/x86_64-root}"
: "${KEY_INFO:=$HOME/secrets/yames-android-test.txt}"
: "${OUT_DIR:=$HOME/projects/.preview/yames-test}"
: "${RTX_DEST:=rtx:/mnt/c/Users/delgado/Desktop/yames-test/}"
: "${NICE:=0}"
: "${CARGO_BUILD_JOBS:=8}"
: "${CARGO_TARGET_DIR:=$HOME/projects/.target-android}"
export ANDROID_HOME CARGO_BUILD_JOBS CARGO_TARGET_DIR
# A JDK 17 (javac, not only a JRE: Gradle's toolchain check wants a compiler).
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/javac" ]; then
  for j in "$HOME"/tools/jdk-17* /usr/lib/jvm/java-17-openjdk-*; do
    [ -x "$j/bin/javac" ] && { JAVA_HOME=$j; break; }
  done
fi
[ -x "${JAVA_HOME:-}/bin/javac" ] || { echo "no JDK 17 with javac (e.g. Temurin 17 in ~/tools)" >&2; exit 2; }
export JAVA_HOME
export PATH="$HOME/.cargo/bin:$JAVA_HOME/bin:$PATH"
export CFLAGS=${CFLAGS:-"-std=gnu11 -Wno-implicit-function-declaration"}

t0=$(date +%s)
say() { printf '[%(%H:%M:%S)T] %s\n' -1 "$*"; }

[ -f "$ANDROID_HOME/platforms/android-36/android.jar" ] && [ -d "$ANDROID_HOME/build-tools/35.0.0" ] || {
  echo "Android SDK incomplete at $ANDROID_HOME. Install it with:" >&2
  echo "  sdkmanager --sdk_root=\$ANDROID_HOME 'platforms;android-36' 'build-tools;35.0.0'" >&2
  exit 2
}

# --- NDK ---------------------------------------------------------------------
if [ "$(uname -m)" = "aarch64" ]; then
  api=24
  pre="$NDK_SHIM/toolchains/llvm/prebuilt/linux-x86_64"
  src_pre="$NDK_SRC/toolchains/llvm/prebuilt/linux-x86_64"
  clang_ver=$(ls "$src_pre/lib/clang" | sort -V | tail -1)
  mkdir -p "$pre/bin"
  ln -sfn "$NDK_SRC/source.properties" "$NDK_SHIM/source.properties"
  ln -sfn "$src_pre/sysroot" "$pre/sysroot"
  ln -sfn "$src_pre/lib" "$pre/lib"
  # All four triples: the CLI writes a cargo config for every Android target,
  # though only aarch64 is built.
  for triple in aarch64-linux-android armv7a-linux-androideabi i686-linux-android x86_64-linux-android; do
    for cc in clang clang++; do
      cat > "$pre/bin/$triple$api-$cc" <<EOF
#!/bin/sh
exec /usr/bin/$cc-18 --target=$triple$api --sysroot=$pre/sysroot -resource-dir=$pre/lib/clang/$clang_ver -fuse-ld=/usr/bin/ld.lld-18 -rtlib=compiler-rt -unwindlib=libunwind "\$@"
EOF
      chmod +x "$pre/bin/$triple$api-$cc"
    done
  done
  ln -sfn /usr/bin/ar "$pre/bin/llvm-ar"
  ln -sfn /usr/bin/readelf "$pre/bin/llvm-readelf"
  ln -sfn /usr/bin/strip "$pre/bin/llvm-strip"
  export NDK_HOME="$NDK_SHIM" ANDROID_NDK_HOME="$NDK_SHIM"
  # Host x86_64 tools of the SDK (aapt2, zipalign) under qemu-user.
  [ -e "$X86_ROOT/lib64/ld-linux-x86-64.so.2" ] || { echo "no x86_64 glibc at $X86_ROOT (see header)" >&2; exit 2; }
  export QEMU_LD_PREFIX="$X86_ROOT"
  "$ANDROID_HOME/build-tools/35.0.0/aapt2" version >/dev/null || { echo "aapt2 does not run (qemu-x86_64 binfmt?)" >&2; exit 2; }
else
  export NDK_HOME="${NDK_HOME:-$NDK_SRC}" ANDROID_NDK_HOME="${NDK_HOME:-$NDK_SRC}"
  pre="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64"
fi
export BINDGEN_EXTRA_CLANG_ARGS="--sysroot=$pre/sysroot"
# The Tauri CLI ignores NDK_HOME: it always takes the newest $ANDROID_HOME/ndk/*.
ndk_ver=$(sed -n 's/^Pkg.Revision *= *//p' "$NDK_HOME/source.properties")
if [ "$(ls "$ANDROID_HOME/ndk" 2>/dev/null | sort -V | tail -1)" != "$ndk_ver" ] || [ "$(readlink -f "$ANDROID_HOME/ndk/$ndk_ver")" != "$(readlink -f "$NDK_HOME")" ]; then
  mkdir -p "$ANDROID_HOME/ndk"
  [ -L "$ANDROID_HOME/ndk/$ndk_ver" ] || [ ! -e "$ANDROID_HOME/ndk/$ndk_ver" ] || { echo "$ANDROID_HOME/ndk/$ndk_ver exists and is not our link" >&2; exit 2; }
  ln -sfn "$NDK_HOME" "$ANDROID_HOME/ndk/$ndk_ver"
fi

# --- signing: the TEST key only ----------------------------------------------
kv() { sed -n "s/^$1=//p" "$KEY_INFO" | head -1; }
ANDROID_KEYSTORE_PATH=$(kv keystore)
ANDROID_KEY_ALIAS=$(kv alias)
ANDROID_KEYSTORE_PASSWORD=$(kv password)
ANDROID_KEY_PASSWORD=${ANDROID_KEYSTORE_PASSWORD}
[ "$ANDROID_KEY_ALIAS" = "yames-test" ] || { echo "refusing: alias '$ANDROID_KEY_ALIAS' is not the test key" >&2; exit 2; }
[ -f "$ANDROID_KEYSTORE_PATH" ] || { echo "no keystore at $ANDROID_KEYSTORE_PATH" >&2; exit 2; }
export ANDROID_KEYSTORE_PATH ANDROID_KEY_ALIAS ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD

# --- version: the beta channel, numbered after the last CI beta --------------
stable=$(node -p "require('./src-tauri/tauri.conf.json').version")
if [ -z "${BETA_N:-}" ]; then
  last=$(gh run list -R turutupa/yames -w beta.yml -L 1 --json number -q '.[0].number' 2>/dev/null || echo 0)
  BETA_N=$(( ${last:-0} + 1 ))
fi
VERSION=$(node -e "import('./scripts/beta-feed.mjs').then(m=>console.log(m.betaVersion('$stable',$BETA_N)))")
overlay="$CARGO_TARGET_DIR/local-beta.conf.json"
mkdir -p "$CARGO_TARGET_DIR" "$OUT_DIR"
node scripts/beta-feed.mjs overlay "$VERSION" "$overlay" >/dev/null
export YAMES_CHANNEL=beta YAMES_VERSION="$VERSION"
sha=$(git rev-parse --short HEAD)
say "building $VERSION from $sha (jobs $CARGO_BUILD_JOBS, nice $NICE, NDK $NDK_HOME)"

nice -n "$NICE" npm run tauri -- android build --apk --target aarch64 --config "$overlay"

apk=$(find src-tauri/gen/android/app/build/outputs/apk -name '*.apk' ! -name '*unsigned*' -newer "$overlay" | sort | head -1)
[ -n "$apk" ] || { echo "no signed APK found" >&2; exit 1; }
dest="$OUT_DIR/Yames_${VERSION}_arm64_${sha}.apk"
cp "$apk" "$dest"
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --print-certs "$dest" | grep -m1 "certificate DN" || true
say "APK: $dest ($(du -h "$dest" | cut -f1)) in $(( ($(date +%s) - t0) / 60 )) min"
if [ -n "$RTX_DEST" ]; then
  ssh "${RTX_DEST%%:*}" "mkdir -p '${RTX_DEST#*:}'" && scp -q "$dest" "$RTX_DEST" && say "copied to $RTX_DEST"
fi
