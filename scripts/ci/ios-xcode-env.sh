#!/usr/bin/env bash
# Print where Swift's static back-deployment libraries actually are.
#
# This exists because of the failure that cost this task two CI rounds. The
# stock Tauri Xcode project sends the linker to
# `$(TOOLCHAIN_DIR)/usr/lib/swift/$(PLATFORM_NAME)` for them, and under
# Xcode 26 on the GitHub runner `TOOLCHAIN_DIR` resolves to the *Metal*
# toolchain, which has none — so `swiftCompatibility56` is not found and
# nothing containing Swift links, which since M06a is the whole app.
#
# The fix is in `src-tauri/ios-project.yml` (`DT_TOOLCHAIN_DIR`), not here.
# What is here is the evidence: if this ever prints zero, that fix has stopped
# working and the link error further down the log is the symptom, not the
# cause.
#
# Overriding the setting through the environment does NOT work, and was tried:
# the project assigns `LIBRARY_SEARCH_PATHS[arch=arm64]` at target level, and
# a target-level assignment beats an environment one. Hence the template.
set -u

TOOLCHAIN="$(xcode-select -p)/Toolchains/XcodeDefault.xctoolchain"
echo "==> Swift back-deployment libraries under $TOOLCHAIN:"
for platform in iphoneos iphonesimulator; do
  dir="$TOOLCHAIN/usr/lib/swift/$platform"
  if [ -d "$dir" ]; then
    n=$(ls "$dir" | grep -ci compatibility || true)
    echo "    $platform: $n"
    [ "$n" -gt 0 ] || echo "::warning::no compatibility libraries for $platform — the link step will fail"
  else
    echo "::warning::$dir does not exist — the link step will fail"
  fi
done
