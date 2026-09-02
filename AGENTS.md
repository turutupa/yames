# Yames — Agent notes

Quick reference for Claude / Wibey / other coding agents working in this repo.

## Tech stack

- **Frontend**: React 18 + TypeScript + Vite 6
- **Desktop shell**: Tauri 2 (Rust backend in `src-tauri/`)
- **Package manager**: project uses **bun** locally, but Tauri's
  `beforeDevCommand` / `beforeBuildCommand` invoke **npm** (see
  `src-tauri/tauri.conf.json`)
- **Test runner**: Vitest (`bun run test`) + cargo (`bun run test:rust`)

## Running the app

The full desktop app boots through Tauri. Don't try to verify with `vite`
alone — that only spins the web view and misses any Rust-side breakage.

```sh
# From a non-interactive shell (no nvm / cargo on PATH by default):
export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
npm run tauri dev
```

Notes:
- The first cold compile of the Rust crate takes ~1–2 minutes; incremental
  rebuilds are seconds.
- `bun run tauri dev` works too, but Tauri's `beforeDevCommand` shells out
  to `npm run dev`, so `npm` must still be on PATH.
- A successful boot logs `App listening on …` and opens the window. Look
  for `error[`, `error:`, `panic`, or `FAILED` in the output to detect
  breakage.

## Building with the coach LLM

`default = []`, so a plain build has **no** LLM — `coach.rs` runs the
template engine. Turn it on with exactly one Cargo feature:

| Feature | Backend | Use |
|---|---|---|
| `coach-llm` | CPU only | dev machines, CI fallback, the jitter probe |
| `coach-llm-metal` | Metal | shipping macOS |
| `coach-llm-vulkan` | Vulkan | shipping Windows + Linux |

The GPU features imply `coach-llm`; never enable two backends at once.
The inference worker asks for all layers on a GPU build and llama.cpp
keeps them on the CPU when it finds no usable device, so one binary serves
both — set `YAMES_LLM_GPU_LAYERS=0` to force CPU inference on a GPU build.

The model, its `LlamaContext` and the llama.cpp backend live on a single
long-lived thread (`coach::llm::LlmWorker`), demoted to below-normal
priority once at spawn. Do not move inference back onto the tokio
blocking pool: `LlamaContext` is not `Send`, `LlamaBackend::init()` is a
process-wide one-shot, and lowering a pool thread's priority per call
cannot be undone on Linux.

```sh
cargo build --manifest-path src-tauri/Cargo.toml --features coach-llm-metal   # macOS
cargo build --manifest-path src-tauri/Cargo.toml --features coach-llm-vulkan  # Windows / Linux
```

Prerequisites beyond the usual Rust + cmake (aubio already needs cmake):

- **All platforms**: cmake, a C/C++ compiler, and `libclang` for bindgen
  (`LIBCLANG_PATH` must point at the directory holding `libclang.dll` /
  `.so` / `.dylib`).
- **macOS**: Xcode command line tools. Metal needs nothing extra.
- **Windows**: the MSVC toolchain (`stable-x86_64-pc-windows-msvc` plus
  VS Build Tools) and the LunarG Vulkan SDK (`VULKAN_SDK` set,
  `%VULKAN_SDK%\Bin` on PATH for `glslc.exe`). MSVC is **required** for
  the LLM features: on `x86_64-pc-windows-gnu` the `cmake` crate falls
  back to the MSYS Makefiles generator and `llama-cpp-sys-2`'s build
  script then panics on `assert_ne!(llama_libs.len(), 0)` because the
  install step lays the libraries out where it does not look. The
  default (no-LLM) build still works fine on GNU.
  Build from a short path, or set `CARGO_TARGET_DIR` to one: llama.cpp's
  CMake TryCompile tree pushes the default `src-tauri/target/...` past
  MAX_PATH and MSBuild's CL tracker then fails with
  `MSB6003 ... cmTC_*.tlog` not found.
  With `CMAKE_GENERATOR=Ninja`, **`ninja.exe` must be on PATH** — use the
  copy shipped with VS Build Tools
  (`…\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja`),
  never w64devkit's. If it is missing, cmake caches
  `CMAKE_MAKE_PROGRAM-NOTFOUND` and every later build fails with an empty
  build-tool name (`CMake Error: Generator: build tool execution failed,
  command was:  -j 16 install`) even after ninja is added, because the
  configure step is skipped. Delete
  `$CARGO_TARGET_DIR/debug/build/llama-cpp-sys-2-*/` to recover.
- **Linux**: `libvulkan-dev`, `glslc` (shaderc), `libclang-dev`, cmake.

Smoke test — skipped when the env var is unset, so it is safe in CI:

```sh
YAMES_TEST_GGUF=/path/to/tiny.gguf \
  cargo test --manifest-path src-tauri/Cargo.toml --features coach-llm --lib
```

## Fast validation chain (no app boot)

After a refactor / surgical edit, run these in order — they catch the
overwhelming majority of breakage without paying the Rust compile cost:

```sh
$HOME/.local/bin/bun run tsc --noEmit   # strict TS, no emit
$HOME/.local/bin/bun run test           # Vitest unit suite
$HOME/.local/bin/bun run build          # tsc + vite production build
```

Only once these are green should you spin up `tauri dev` to verify the app
actually opens.

## Repo layout (top-level `src/`)

- `containers/main-window/` — the app shell (`MainWindow`, header,
  floating play button, theme effects, share menu) and its dedicated
  hooks under `containers/main-window/hooks/`.
- `containers/metronome/` — the metronome screen (`MetronomeView`).
- `containers/drill/` — drill / speed-ramp tab.
- `containers/pocket-check/` — track-evaluation tab.
- `containers/practice-coach/` — coach card, feed, history, session
  detail.
- `containers/settings/` — settings overlay + all section components,
  modals, and `SettingsView` composition.
- `containers/zen/` — fullscreen / zen-mode view + transition.
- `components/` — reusable presentational components.
  - `components/presets/` — `PresetSidebar`, `PresetSaveBar` (used by
    multiple containers).
- `hooks/` — app-wide custom hooks (metronome, MIDI, gamepad, drag, tap
  tempo, keybindings, evaluation, session, etc.).
- `ipc.ts` — single typed wrapper around all Tauri `invoke` / `listen`
  calls. Always route IPC through here, never inline.

## Refactor conventions

- **No file rewrites.** Edit surgically. Rewriting a large file has shipped
  broken code before (v0.7.0).
- **Hooks before re-orgs.** When a `*View` or container grows past
  ~600 lines, extract effect-heavy logic into a dedicated hook in
  `containers/<name>/hooks/`. Keep app-wide hooks in `src/hooks/`.
- **Validate after every step.** Run `tsc --noEmit` + tests after each
  extraction — don't batch.
- **Imports**: dedicated hook folders use relative imports
  (`../../../ipc`, `../../../types`, etc.). Run `tsc --noEmit` after
  moving files; TS `noUnusedLocals` will flag any orphaned imports.

## Roadmap & plans

- `plans/ROADMAP.md` is the single active planning document (mission,
  current state, phased work with acceptance gates, non-goals). Read it
  before starting any coach / DSP / curriculum work.
- `plans/archive/DSP_AND_COACH_PLAN.md` is the archived design spec for
  the shipped scoring pipeline — code comments cite it for the *why*.
- `plans/ONBOARDING_PLAN.md` is the first-run / product-polish track
  (wizard, tour, hints, empty states).
- `plans/tasks/<phase>/T0N-*.md` are self-contained briefs, one per
  worker session. If you were handed one, follow it and its README.
- `plans/MOBILE_IMPLEMENTATION_PLAN.md` is out of the current horizon.

## Building on Windows (MSVC — matches CI)

The repo carries a `rustup override` to `stable-x86_64-pc-windows-msvc`
(set 2026-09-02). Do not build Yames with the `-gnu` toolchain: Rust
test binaries fail to start (`STATUS_ENTRYPOINT_NOT_FOUND`,
`TaskDialogIndirect` — no manifest, so comctl32 5.82 is loaded) and the
cdylib link fails (`export ordinal too large`). Both are GNU-only
defects; CI's `windows-latest` uses MSVC.

Prerequisites (all installed on the owner's laptop):
- Visual Studio 2022 Build Tools with the "Desktop development with
  C++" workload (MSVC 14.44 + Windows SDK 10.0.26100). rustc, `cc`
  and cmake find it via vswhere; no `vcvars` needed.
- cmake (aubio-sys, llama-cpp-sys).
- LLVM 17 (`C:\Program Files\LLVM`) for `libclang` — aubio-sys uses
  bindgen 0.58, which rejects clang ≥ 18. Set
  `LIBCLANG_PATH=C:\Program Files\LLVM\bin` (user env var on the
  owner's machine; agent shells do NOT inherit user env — export it).
- Vulkan SDK 1.4.x (`C:\VulkanSDK\<ver>`, `VULKAN_SDK` machine-wide)
  for the `coach-llm-vulkan` feature; `glslc.exe` is in `Bin`.

Fast check that the toolchain is sane (clean target dir, ~3 min):

```sh
LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test --manifest-path src-tauri/Cargo.toml --lib --no-default-features
```

## Audio-safety gate — the click-jitter probe

ROADMAP §1 principle 1 says nothing may add jitter to the metronome, and
§4 makes that testable: **p99 callback-to-callback jitter < 1 ms and zero
missed beats over 60 s while the LLM generates continuously.** Re-run it
whenever a change adds background compute.

```sh
bun run yames:jitter-probe -- --no-llm                  # baseline
# LLM runs need the feature, so call cargo directly:
cargo run --release --manifest-path src-tauri/Cargo.toml \
  --features coach-llm-vulkan --bin click-jitter-probe -- --gguf model.gguf
YAMES_LLM_GPU_LAYERS=0 cargo run --release ... --gguf model.gguf   # force CPU
```

The probe runs the real `MetronomeEngine` headless (`start_headless`,
no Tauri app) and times the cpal callback from inside it via
`CallbackProbe` — a preallocated lock-free arena, `None` unless the probe
built the engine, so the shipping callback pays one null check per
buffer. `--dump-csv` writes the raw capture so a run can be re-analysed
without re-running it. Exit 0 = pass, 1 = gate failure, 2 = setup error.

Two things the numbers depend on, and one that is not a Yames bug:

- **Other load on the box invalidates a run.** A parallel `cargo test`
  taking six cores pushed the *baseline* p99 from 0.35 ms to 2.46 ms.
  Check the machine is quiet before believing a failure.
- **cpal already runs its WASAPI stream thread at
  `THREAD_PRIORITY_TIME_CRITICAL`** (`cpal-0.15.3/src/host/wasapi/
  stream.rs`). Do not try to "fix" jitter by touching the callback.
- **ggml's threadpool defeats `with_below_normal_priority`.** That helper
  demotes only the calling thread; llama.cpp's worker threads start at
  `THREAD_PRIORITY_NORMAL` and `ggml_thread_apply_priority` explicitly
  disables power throttling on them. llama-cpp-2 0.1.146 exposes no
  `GGML_SCHED_PRIO` knob, so CPU inference is measurably noisier than GPU
  inference.

## Coaching pipeline — latency tiers

Every coach feature belongs to exactly one tier. When adding pitch analysis,
coach messages, or new DSP features, use this to decide where it fits.

| Tier | Acceptable delay | Trigger | Examples |
|------|-----------------|---------|---------|
| **Real-time** | < 30 ms | Continuous, per audio hop | Onset dots, live timing ring, metronome click sync |
| **Mid-session tip** | 1–3 s | Fires while the user is actively playing | "Dragging the last 8 bars", dead note alert, legato credit |
| **Mid-session report** | 3–8 s | User finishes an exercise — hits Stop on the metronome | Segment mini-report, pitch technique summary for that exercise |
| **Post-session report** | 5–15 s | User ends a full practice session | Full session analysis, bend accuracy, key inference, coach narrative |

Key rules:
- **Real-time tier**: no I/O, no LLM, no model inference — DSP only.
- **Mid-session tips**: no *blocking* inference on the tip path. The
  gatekeeper and the template engine own what the tip says; the model
  may only rephrase it, and only within the 3 s budget on a GPU
  backend. On a CPU-only backend (`BACKEND == "cpu"`) tips skip the LLM
  entirely and ship the template — a CPU generation measured 7–11 s,
  three to four times the whole tier. Enforced in `coach::generate`,
  which takes `GenKind::Tip` and the compile-time backend into account
  before it touches the worker.
- **Mid-session / post-session reports**: correct home for ONNX pitch analysis (Basic-pitch processes a 30 s session in ~3–6 s; user is already reading the timing score — no perceived delay).
- The post-session window is **free real estate**: the coach LLM summary already runs here. Pitch analysis merges into the same report in parallel with zero additional perceived latency.

## Commit / branch hygiene

- Conventional prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
- A commit message starting with `feat:` or `fix:` triggers a release
  via the CI pipeline. Pick the prefix that matches the actual change
  scope — don't bump a release for a docs-only change.
- Never run destructive git on uncommitted work (`reset --hard`,
  `checkout .`, `restore .`, `clean -fd`). A day of work was lost to
  this on 2026-05-14.
