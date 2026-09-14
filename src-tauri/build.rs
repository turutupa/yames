use std::fmt::Write as _;
use std::path::Path;

fn main() {
    tauri_build::build();
    embed_kits();
    // ADDING A VOICE IS ADDING A FOLDER, for the same reason and by the
    // same walk. A melodic bank is `sounds/voices/<voice>/voice.json` and
    // one WAV per sampled note, layer and round robin — the kit format with
    // a MIDI number where the drum's name is — so the embedding is the same
    // question asked of a different directory.
    embed_folders("sounds/voices", "voice.json", "SHIPPED_VOICES");

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

/// ADDING A KIT IS ADDING A FOLDER.
///
/// The five synthesised kits used to be forty `include_bytes!` lines and a
/// hand-written table in `engine.rs`, with the column order of the table
/// and the order of an enum held together by a test. A recorded kit is a
/// hundred and thirty-two files, and two of them are on the way
/// (`plans/JAM_SOUND.md` §5), so the table stops being something a person
/// writes.
///
/// This walks `sounds/kits/*/kit.json`, and for every folder it finds
/// writes an entry into `$OUT_DIR/kits_generated.rs`: the manifest as a
/// string constant and one `include_bytes!` per WAV beside it, keyed by
/// file name. `kit.rs` `include!`s the result and parses the manifests with
/// the same code it uses on a folder the musician points at, so a shipped
/// kit and somebody's own sample folder go through one loader.
///
/// It does NOT validate the manifests. A missing voice, a layer that is not
/// there, a rate the file disagrees with — all of those are the loader's to
/// report as a sentence at run time, and a build that refuses to compile
/// because a kit folder is half-written is a worse day than one that says
/// so when the kit is chosen.
fn embed_kits() {
    let out = walk("sounds/kits", "kit.json", "SHIPPED_KITS", true);
    write_generated(&out, false);
}

/// [`embed_kits`] for any other folder of folders, appended to the same
/// generated file.
///
/// `sounds/voices` may not exist at all — the melodic banks are rendered by
/// a tool and downloaded per file, and a checkout that has not got them yet
/// has to build and run with a synthesised bass, which is what it had
/// before they existed. So a missing root is an empty list rather than a
/// build that refuses, exactly as a half-written manifest is a sentence at
/// run time rather than a compile error.
fn embed_folders(root: &str, manifest: &str, constant: &str) {
    let out = walk(root, manifest, constant, false);
    write_generated(&out, true);
}

/// Every folder under `root` holding a `manifest`, as one `&[ShippedKit]`.
///
/// `required` is the difference between the kits, which the app cannot run
/// without, and the voices, which it can.
fn walk(root: &str, manifest: &str, constant: &str, required: bool) -> String {
    let base = Path::new(env!("CARGO_MANIFEST_DIR")).join(root);
    // A new folder, a new WAV in one, or an edited manifest all have to
    // re-run this. Watching the directory itself is what notices a folder
    // appearing; watching each folder is what notices a file inside one.
    println!("cargo:rerun-if-changed={root}");

    let read = match std::fs::read_dir(&base) {
        Ok(r) => Some(r),
        Err(e) if required => panic!("{root} is not readable: {e}"),
        Err(_) => None,
    };
    let mut dirs: Vec<_> = read
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.join(manifest).is_file())
        .collect();
    // Sorted, so the generated file is the same bytes on every machine and
    // a folder's index does not depend on the order the filesystem answered
    // in. Ids are looked up by name, but the ORDER is what the picker
    // shows and what a test can name.
    dirs.sort();

    let mut out = format!(
        "// Generated by build.rs from {root}/*/{manifest}. Do not edit.\n\
         pub static {constant}: &[ShippedKit] = &[\n"
    );
    for dir in &dirs {
        let name = dir.file_name().expect("a folder has a name");
        println!("cargo:rerun-if-changed={root}/{}", name.to_string_lossy());
        let file = dir.join(manifest);
        writeln!(out, "    ShippedKit {{").unwrap();
        writeln!(out, "        manifest: include_str!(r\"{}\"),", file.display()).unwrap();
        writeln!(out, "        files: &[").unwrap();
        let mut wavs: Vec<_> = std::fs::read_dir(dir)
            .unwrap_or_else(|e| panic!("{} is not readable: {e}", dir.display()))
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("wav"))
            })
            .collect();
        wavs.sort();
        for wav in wavs {
            let file = wav.file_name().expect("a WAV has a name").to_string_lossy();
            writeln!(
                out,
                "            (\"{}\", include_bytes!(r\"{}\")),",
                file.to_ascii_lowercase(),
                wav.display()
            )
            .unwrap();
        }
        writeln!(out, "        ],\n    }},").unwrap();
    }
    out.push_str("];\n");
    out
}

/// One generated file, `include!`d by `kit.rs`.
fn write_generated(text: &str, append: bool) {
    let dest = Path::new(&std::env::var("OUT_DIR").expect("cargo sets OUT_DIR"))
        .join("kits_generated.rs");
    let body = if append {
        let mut had = std::fs::read_to_string(&dest).unwrap_or_default();
        had.push_str(text);
        had
    } else {
        text.to_string()
    };
    std::fs::write(&dest, body)
        .unwrap_or_else(|e| panic!("could not write {}: {e}", dest.display()));
}
