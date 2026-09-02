# T01 — Make the LLM buildable on every platform (Cargo features)

Size: L. Branch: `phase0/t01-llm-features`. Blocks: T02.

## Goal

`cargo build` with the coach LLM enabled succeeds on macOS, Windows and
Linux, with the right GPU backend per platform, and a loaded model
actually generates text on each.

## Why (context you would otherwise lack)

- `src-tauri/Cargo.toml` declares
  `llama-cpp-2 = { version = "0.1", features = ["metal"], optional = true }`
  and `coach-llm = ["llama-cpp-2"]`, `default = []`. The `metal` feature
  hardcodes a macOS-only backend, so enabling `coach-llm` on Windows or
  Linux fails.
- Because `default = []` and the release workflow never passes
  `--features`, **no shipped build contains the LLM**. `coach.rs::load_model`
  returns `Ok(true)` without the feature, so users download weights that
  are never read. Fixing the honest status is T03; your job is the build.
- The LLM code path is `src-tauri/src/coach.rs` (`mod llm`, gated on
  `#[cfg(feature = "coach-llm")]`). The lockfile pins
  `llama-cpp-2 0.1.146`.
- aubio already requires cmake at build time, so cmake is an accepted
  build dependency.

## Steps

1. Restructure features in `src-tauri/Cargo.toml`:
   - `llama-cpp-2 = { version = "0.1.146", optional = true }` (no default
     backend feature).
   - `coach-llm = ["dep:llama-cpp-2"]` — CPU backend.
   - `coach-llm-metal = ["coach-llm", "llama-cpp-2/metal"]`.
   - `coach-llm-vulkan = ["coach-llm", "llama-cpp-2/vulkan"]`.
   - Confirm the exact backend feature names by reading the
     `llama-cpp-sys-2` crate's `Cargo.toml` for the pinned version
     (`cargo metadata` or the registry source under `~/.cargo/registry`).
     If 0.1.146 lacks a working Vulkan feature, upgrade within 0.1.x, pin
     the new version, and note it.
2. Make `coach.rs` compile under all three feature sets. Any
   backend-specific params (e.g. `n_gpu_layers`) go in `LlmModel::load`
   behind `cfg(feature = ...)`; CPU builds set `n_gpu_layers = 0`.
3. Apply the thread rules from ROADMAP §3 in `LlmModel`/`generate`:
   `n_threads = max(1, physical_cores - 2)` (use `std::thread::available_parallelism`
   halved as a proxy for physical cores if no better source), and lower
   the priority of the thread that runs generation (the
   `spawn_blocking` worker in `commands.rs::coach_generate`) to below
   normal on each OS. Do not touch any audio thread.
4. Build and run on the OS you are on. The shipping feature per OS is
   the GPU one; CPU-only `coach-llm` is for development machines and CI
   fallback only:
   - macOS: `cargo build --manifest-path src-tauri/Cargo.toml --features coach-llm-metal`
   - Windows: `cargo build --manifest-path src-tauri/Cargo.toml --features coach-llm-vulkan`
     (install the LunarG Vulkan SDK; expect MSVC + cmake + Ninja;
     document what had to be installed).
   - Linux: `cargo build --manifest-path src-tauri/Cargo.toml --features coach-llm-vulkan`
     (expect `libvulkan-dev`, `glslc`/shaderc, `libclang-dev`, cmake; document).
   In `LlmModel::load` set `n_gpu_layers` to "all" on GPU builds so the
   GPU is always tried first. Verify that a Vulkan build on a machine
   without a usable GPU still loads and generates (llama.cpp should
   select CPU); if it does not, retry the load with `n_gpu_layers = 0`.
5. Add a Rust test under `#[cfg(feature = "coach-llm")]` in `coach.rs`
   that loads a GGUF from the path in env `YAMES_TEST_GGUF` (skip when
   unset), generates 8 tokens, asserts non-empty output.
6. Record the binary size before/after for your OS in the PR body.
7. Document the per-OS build prerequisites in `AGENTS.md` under a new
   "Building with the coach LLM" subsection (short).

## Acceptance

- `cargo build` with the platform-appropriate feature succeeds on the OS
  you are on, and you state which other OSes you could not test.
- `cargo test --features coach-llm --lib` passes with
  `YAMES_TEST_GGUF` pointing at any small GGUF.
- Default build (`bun run test:rust`, `--no-default-features`) still
  passes; the app still boots with `npm run tauri dev` (no feature) and
  with `npm run tauri dev -- --features coach-llm[-metal]`.
- No change to `onset.rs`, `engine.rs`, `timing.rs`, `audio_input.rs`.

## Do not

- Do not enable any `coach-llm*` feature in `default`. T02 turns the
  GPU feature on in CI per platform.
- Do not swap models or URLs (T04).
- Do not change `is_loaded()` semantics (T03).
