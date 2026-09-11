fn main() {
    tauri_build::build();

    // Link the C++ runtime on Android (found by the M00 spike).
    //
    // `oboe-sys` 0.6.1 (pulled in by cpal 0.15's Android backend) compiles
    // the Oboe C++ sources but its build.rs has the stdc++ link COMMENTED
    // OUT — see oboe-sys-0.6.1/build.rs:38-42. The resulting cdylib carries
    // undefined `__cxa_pure_virtual`, `__cxa_throw`, `_ZTVN10__cxxabiv1...`
    // and friends with no DT_NEEDED that provides them, so the app dies at
    // `System.loadLibrary` with
    //   java.lang.UnsatisfiedLinkError: dlopen failed: cannot locate symbol
    //   "__cxa_pure_virtual" referenced by ".../libyames_lib.so"
    // before a single line of Rust runs. `libc++_shared.so` also has to be
    // packaged into the APK (see gen/android/app/src/main/jniLibs/<abi>/).
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-lib=c++_shared");
    }

    // Windows/MSVC: give `cargo test` integration-test binaries the
    // Common-Controls v6 manifest they would otherwise never get. Without
    // it, a harness that links Tauri code importing `TaskDialogIndirect`
    // dies at load with STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) before a
    // single test runs — see src-tauri/tests-common-controls-v6.manifest.
    //
    // `-tests` and not the plain `rustc-link-arg`: this must never reach a
    // binary target. `tauri_build::build()` above already embeds a manifest
    // resource in `yames.exe`, and a second one fails the link with
    // `CVT1100: duplicate resource` / `LNK1123`.
    //
    // Cargo has no equivalent key for the `--lib` unit-test harness, so that
    // one is handled by `RUSTFLAGS` in `.github/workflows/ci.yml` and in
    // `scripts/rust-test.mjs` — `cargo test --lib` builds no bins, so
    // setting it for that invocation alone is safe.
    #[cfg(all(windows, target_env = "msvc"))]
    {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests-common-controls-v6.manifest");
        println!("cargo:rerun-if-changed=tests-common-controls-v6.manifest");
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }
}
