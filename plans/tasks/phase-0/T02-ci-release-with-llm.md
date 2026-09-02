# T02 — Release workflow builds the LLM per platform + smoke test

Size: M. Branch: `phase0/t02-ci-llm`. Depends on: T01 merged.

## Goal

Every release artifact (macOS arm64/x86_64, Ubuntu 22.04, Windows)
contains a working LLM backend, and CI proves it by generating tokens
on each OS before publishing.

## Facts

- `.github/workflows/release.yml` has a 4-entry matrix with per-entry
  `args` passed to `tauri-apps/tauri-action@dev` (`args: ${{ matrix.args }}`).
  macOS entries carry `--target ...`; Linux and Windows carry `''`.
- The release job only runs when the head commit message starts with
  `release` or on `workflow_dispatch`.
- Linux deps are installed in the "Install Linux dependencies" step
  (webkit, appindicator, rsvg, patchelf, alsa). aubio needs cmake there
  already; check it is present on the runner or add it.
- Feature names come from T01: `coach-llm` (CPU), `coach-llm-metal`,
  `coach-llm-vulkan`.

## Steps

1. Matrix `args`: append `-- --features coach-llm-metal` for both macOS
   entries and `-- --features coach-llm-vulkan` for Ubuntu and Windows. (Check
   how `tauri-action` forwards extra cargo args; `tauri build --
   --features x` is the documented form. Verify in the action's README
   for the pinned `@dev` ref, and consider pinning to a tagged version.)
2. Add per-OS build prerequisites to the workflow: cmake + Ninja +
   MSVC dev environment on Windows (`ilammy/msvc-dev-cmd` or the
   equivalent) plus the Vulkan SDK (`humbletim/setup-vulkan-sdk` or the
   LunarG installer), `libclang-dev` + `cmake` + `libvulkan-dev` +
   `glslc` on Ubuntu. Keep the steps minimal and commented.
3. Add a new job `llm-smoke` (runs on every push to a `phase0/*` or
   `main` branch, not just releases; same matrix; `fail-fast: false`):
   - build the Rust lib with the platform feature,
   - download a tiny GGUF for testing (a ~30 MB "stories"-class model;
     pin the URL and sha256; it is a CI fixture only, never shown to
     users),
   - run `cargo test --manifest-path src-tauri/Cargo.toml --features
     <platform feature> --lib` with `YAMES_TEST_GGUF` set (test added by
     T01).
   Make the release job `needs: llm-smoke`.
4. Cache cargo and the test model between runs (`actions/cache`).
5. Record binary sizes per platform in the job summary
   (`$GITHUB_STEP_SUMMARY`) so the ≤30 MB growth budget from ROADMAP
   §5.0.1 is visible.
6. Trigger the workflow with `workflow_dispatch` on your branch (ask the
   owner to run it if you lack permissions) and paste the run URL in the
   PR.

## Acceptance

- `llm-smoke` green on all four matrix entries.
- A `workflow_dispatch` release build completes on all four entries and
  the artifacts are produced (a draft release is fine; do not publish
  a version tag).
- Binary size deltas recorded.
- Vulkan must build on the Windows and Ubuntu runners. If it does not,
  report the exact error in the PR and stop; do not silently ship the
  CPU feature. (Runners have no GPU, so the smoke test exercises the
  runtime CPU fallback of a Vulkan build — that is the intended check.)

## Do not

- Do not push a commit whose message starts with `release` or `feat:`
  to `main`.
- Do not change application code; if T01 left something un-buildable
  on a runner, report it instead of patching around it silently.
