#!/usr/bin/env bash
# Build settings that have to be forced on Xcode from outside the project.
#
# Sourced, not run: `. scripts/ci/ios-xcode-env.sh`. xcodebuild reads build
# settings out of its environment, and this is the only way to reach it —
# `src-tauri/gen/apple` is generated from the Tauri config, so editing the
# project by hand is not an option, and `tauri ios build` is the only thing
# that can drive the build at all (its Xcode script phase talks back to the
# CLI process over a local socket, so a hand-written xcodebuild line cannot
# compile the Rust half).
#
# ## Why LIBRARY_SEARCH_PATHS is overridden
#
# The generated project points the linker at
# `$(TOOLCHAIN_DIR)/usr/lib/swift/$(PLATFORM_NAME)` for Swift's static
# back-deployment libraries. Under Xcode 26 on the GitHub runner,
# `TOOLCHAIN_DIR` resolves to the *Metal* toolchain, which has no Swift
# libraries in it:
#
#   ld: warning: search path '/var/run/com.apple.security.cryptexd/mnt/
#       …Metal.xctoolchain/usr/lib/swift/iphonesimulator' not found
#   ld: warning: Could not find or use auto-linked library 'swiftCompatibility56'
#   Undefined symbols for architecture arm64:
#     "__swift_FORCE_LOAD_$_swiftCompatibility56", referenced from:
#       …_$_tauri_plugin_yames_mobile in libapp.a[29](YamesMobilePlugin.swift.o)
#
# Anything with Swift in it fails to link, which since M06a is the whole app.
# The fix is to spell the default toolchain out absolutely, from
# `xcode-select`, rather than trust a variable Xcode has repurposed. The
# `Externals` entries have to be repeated because an environment override
# replaces the project's value rather than adding to it, and that is where
# `libapp.a` — the Rust half — is.
set -u

TOOLCHAIN="$(xcode-select -p)/Toolchains/XcodeDefault.xctoolchain"

echo "==> Swift back-deployment libraries in $TOOLCHAIN:"
for platform in iphoneos iphonesimulator; do
  dir="$TOOLCHAIN/usr/lib/swift/$platform"
  if [ -d "$dir" ]; then
    echo "    $platform: $(ls "$dir" | grep -ci compatibility) compatibility libraries"
  else
    echo "::warning::$dir does not exist — the link step may fail"
  fi
done

export LIBRARY_SEARCH_PATHS="\$(PROJECT_DIR)/Externals/arm64/\$(CONFIGURATION) \$(PROJECT_DIR)/Externals/x86_64/\$(CONFIGURATION) \$(SDKROOT)/usr/lib/swift $TOOLCHAIN/usr/lib/swift/\$(PLATFORM_NAME) $TOOLCHAIN/usr/lib/swift-5.0/\$(PLATFORM_NAME)"
echo "==> LIBRARY_SEARCH_PATHS=$LIBRARY_SEARCH_PATHS"
