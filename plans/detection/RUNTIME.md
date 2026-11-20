# The note verifier's runtime: tract, on every platform

Owner's brief (2026-11-19): "the best possible solution for all users". The
verifier (Basic Pitch, `src-tauri/src/detect/`) ran only on ONNX Runtime
(`ort`, feature `detect-ort`), which no shipped build carried: +20 MB, and no
prebuilt ONNX Runtime for Intel Macs, so Intel-Mac players would never get
it. This page is the measurement and the decision. Branch
`mvp-detect-runtime` (from `mvp-detect` 21414fea).

## Decision

**tract (pure Rust, `tract-nnef` 0.23.10) is the runtime of every build
people play on: Windows, macOS Apple Silicon AND Intel, Linux, Android.**
Feature `detect-tract`, passed explicitly by `release.yml`, `beta.yml` and
`scripts/tauri.mjs` (which is what `android.yml` and the Android beta go
through). `ort` stays as `detect-ort`, for `npm run detect:parity` only.

Why, by the numbers below:

- **Parity**: identical verdicts on 15,855 of 15,855 bench notes and every
  one of the bench's metrics identical (the requirement was >= 99.9% and
  +-0.2 points). Posteriors differ by at most 1.8e-4.
- **Platforms**: one code path everywhere. `ort` cannot build for
  `x86_64-apple-darwin` at all ("no prebuilt binaries available", checked
  here). `ort`'s build also downloads its library from pyke's servers; tract
  fetches nothing.
- **Size**: smaller than ort (Android `.so` +13.3 MB vs +21.2 MB, see below).
- **Speed**: 1.2-1.3x slower than ort on one thread, well inside the tier
  the pass lives in (AGENTS.md "Mid-session report", 3-8 s after a Take):
  a 30 s Take is about 0.7 s on a desktop big core, 1.4 s on a phone-class
  core.

Kill switch unchanged: `YAMES_VERIFIER=0`. A model that fails or panics while
loading is remembered as "no model" (not retried every Take) and grading is
the tracker's; a panic inside the verifier is caught at the model call in
`timing::late_grade` and reported as `verifier.status = failed`, with the
tracker's grade kept.

## Parity (tract vs ort, same audio)

`npm run detect:parity` (`detect-bench parity --fast`): both runtimes over
the posteriors of every fast-bench Take (329 Takes, 5,179 s of audio,
78.5 M values), then the bench run on each (`--notes`) and the two
`notes.jsonl` / `results.json` compared.

| | tract-onnx (first try) | tract-nnef (shipped) |
|---|---|---|
| Max abs diff, note posterior | 8.2e-5 | 8.2e-5 |
| Max abs diff, onset posterior | 1.8e-4 | 1.8e-4 |
| Mean abs diff | 1.4e-7 | 1.4e-7 |
| Values crossing 0.3 / 0.5 / 0.7 | 2 / 0 / 1 of 78.5 M | 2 / 0 / 1 of 78.5 M |
| Notes with a different verdict | 0 of 15,855 | 0 of 15,855 |
| Metrics that differ (of 2,113) | 0 | 0 |
| `detect:check` against `fast.json` | 0 worse, 0 better | 0 worse, 0 better (no-model: 0 worse) |
| Max diff of `verifierAct` | 7.8e-5 | |

The NNEF archive against the ONNX file, both on tract
(`tools/basic-pitch-nnef`): max abs difference 0.

## Speed (one thread, the thread count we use)

`detect-bench cost --runtime <r>`, a minute of the bench's DI playing,
thread CPU time (holds on a loaded box; load was 10-20 all session). "Model"
is the total less the same pass with a model that answers zeros at once
(resampling to 22,050 Hz and the attack envelope). This DGX is a GB10: ten
Cortex-X925 (desktop-class big cores) and ten Cortex-A725 (the mid core of
2024-25 phones), so `taskset` gives both classes on real silicon.

| ms per minute of audio | tract (nnef) | ort | tract / ort |
|---|---|---|---|
| X925, model only | 1,362 | 1,025 | 1.33 |
| X925, whole pass | 1,497 | 1,164 | |
| A725, model only | 2,711 | 2,236 | 1.21 |
| A725, whole pass | 2,962 | 2,490 | |

Phone estimate: a mid phone's performance cores (Cortex-A78/A715/A720 at
2.2-2.6 GHz) are about an A725, so about 3 s per minute of audio, 1.5 s for
a 30 s Take. A budget phone of only Cortex-A55 cores is about 3x slower:
about 9 s a minute, 4.5 s for a 30 s Take, still inside the 3-8 s tier but
at its edge; the post-Take thread runs below normal priority, so on a
big.LITTLE phone it may also land on a little core. The brief's "a few
hundred ms per minute" is not reachable by either runtime on one thread:
Basic Pitch costs about 1 s a minute even on a desktop big core with ONNX
Runtime. Not run on the Cuttlefish emulator: it was not running (adb
connection refused), and an emulator's numbers would say little about a
phone anyway.

Not tried, on purpose: more threads (`multithread-mm`). The pass runs beside
a metronome (AGENTS.md, the audio-safety gate) and one thread is the rule
for ort too.

## Size

Release, symbols stripped (`CARGO_PROFILE_RELEASE_STRIP=symbols`, what the
Android build does), measured here on aarch64.

| | none | + tract-onnx | + tract-nnef (shipped) | + ort (static) |
|---|---|---|---|---|
| Android `libyames_lib.so` (aarch64) | 45.6 MB | +18.3 MB | **+13.3 MB** (58.9) | +21.2 MB |
| Linux `yames` (aarch64) | 51.3 MB | +18.2 MB | **+13.3 MB** (64.5) | +25.1 MB |

What the tract MBs are (`nm` on a standalone loader): tract-core's ops
monomorphised over its element types, ndarray behind them, tract-linalg's
kernels, rustfft (tract's STFT op). The NNEF reader drops tract's ONNX front
end and its protobuf parser (about 5 MB on a standalone loader, 18.6 ->
13.6 MB). `opt-level = "s"` on tract-core/data/nnef and ndarray would save
another 2 MB at a few % speed: not done, the profile is the app's.

Windows and macOS were not built here (no MSVC, no Apple SDK). Estimate: the
same Rust, so about the Linux delta; x86_64 adds tract-linalg's AVX/FMA
kernels, so add a little. The installers compress: the download grows by
less than the binary. ort's alternative there would have been its static
library, +21 to +25 MB like here, and nothing at all on Intel macOS.

## Builds checked

| Target | How | Result |
|---|---|---|
| aarch64-linux-android | `cargo build --release --lib` none / tract / ort; `detect-bench` linked | builds and links |
| aarch64-unknown-linux-gnu | full gates, bench, app binary | builds, runs |
| x86_64-unknown-linux-gnu | `cargo check` of tract (scratch crate) | ok |
| aarch64-apple-darwin | `cargo check` of tract (scratch crate) | ok |
| x86_64-apple-darwin | `cargo check` of tract (scratch crate) | ok; **ort: fails, no prebuilt** |
| x86_64-pc-windows-msvc | `cargo check` of tract (scratch crate) | needs `lib.exe` / `ml64.exe` from MSVC (tract-linalg assembles its x86 kernels with MASM). Not available on Linux; the Windows CI runner and the Windows dev box have MSVC already (llama.cpp needs it). First proof is the next beta's Windows job |

The whole app is not checkable for the Apple / Windows targets from here
(its C build scripts need those SDKs); the beta run is the proof for them.

## How to reproduce

```sh
npm run detect:nnef      # nmp.onnx -> nmp.nnef.tar, checked against the ONNX on tract
npm run detect:parity    # tract vs ort posteriors over the fast bench (needs ort: downloads it)
npm run detect:check     # the bench on the shipped runtime, against fast.json
cargo run --release --manifest-path src-tauri/Cargo.toml --features detect-tract,detect-ort \
  --bin detect-bench -- cost --runtime tract     # or ort; prefix `taskset -c N`
YAMES_DETECT_RUNTIME=ort npm run detect:bench -- run --fast --notes --out /tmp/ort  # bench on ort
```

Sizes: `cargo build --release --lib --target aarch64-linux-android
[--features detect-tract|detect-ort]` with `CARGO_PROFILE_RELEASE_STRIP=symbols`
(and `source ~/android-ndk-dl/env.sh`), `stat` the `.so`.

## Code (summary for the reviewer)

- `src/detect/model.rs`: `tract_backend::TractModel` (NNEF from
  `NNEF_BYTES`, outputs checked to be (note, onset) by name, optimised plan
  run per window); `compiled()` is either feature; `runtimes()`,
  `load_runtime(name)`; `load()` picks tract, or `YAMES_DETECT_RUNTIME`;
  `with_shared` catches a panic in `load()` and caches "no model". The
  plucked-A test runs every runtime in the build; a size test for the
  archive.
- `src/timing.rs` `late_grade`: only the model call is wrapped in its own
  `catch_unwind` (-> `VerifierStatus::Failed`), so the tracker's grade
  survives. Nothing else in the late pass moved (the M6 agent is reordering
  it on `mvp-detect`).
- `detect-bench`: `parity` subcommand, `cost --runtime` and a model-only
  figure, `noteModel` no longer names ort.
- `Cargo.toml`: `tract-nnef` optional, `detect-tract` feature, comments
  corrected (they claimed tauri.mjs/release enabled `detect-ort`; they did
  not).
- `tools/basic-pitch-nnef/`: standalone converter (own lock, `[workspace]`).
- Builds: `release.yml` / `beta.yml` desktop features `+detect-tract`;
  `scripts/tauri.mjs` adds it for desktop dev/build (also with
  `YAMES_DEV_NO_LLM=1`) and for `android|ios dev|build`.
- `package.json`: `detect:bench`, `detect:check`, `test:rust:detect` on
  `detect-tract`; `detect:parity`, `detect:nnef` added.

## Open

1. Windows and both macOS builds of the app with `detect-tract`: first
   proven by the next beta run (not run from here, CI frugal).
2. Click-jitter probe with the late pass (PROGRESS.md "Opus interlude" item
   1) now applies to tract: run `--late-pass` when the box is quiet.
3. On a real budget phone, time one Take (the A55 estimate is the weakest
   number here).
