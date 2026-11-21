# rtx1: the coach build's gates on the RTX, through jobq only

Session 6, leg rtx1. Branch `coach-rtx1`. Scripts: `plans/coach/tools/rtx/` (README there).

## What is on the RTX (looked 2026-11-21 03:27 PT, job `coach-rtx1-look`, `coach-rtx1-boot`)

- `C:\yt-coach\`: `wt` (a worktree of the owner's `C:\Users\delgado\src\yames`, `.git` -> its
  `.git/worktrees/wt`; was at 406d084155, clean), `target` (debug + release from pv1), `bin`
  (`click-jitter-probe-vk.exe`), `models` (`Qwen3-4B-Q4_K_M.gguf`, 2.5 GB), `logs` (pv1, pv1fu, rust-*.log).
- **No `node_modules` in `C:\yt-coach\wt`.** So tsc, vitest, build and Playwright cannot run there yet.
- Windows side: git, node v26.13.0, npm, cargo/rustc (stable-aarch64-pc-windows-msvc), cmake,
  clang-cl + libclang (LLVM), VS Build Tools (ninja comes with vcvars). `VULKAN_SDK` is not set
  machine/user-wide (pv1 used `yames-tools\VulkanSDK-1.4.313.0`). No Playwright browsers
  (`%LOCALAPPDATA%\ms-playwright` missing).
- WSL side: git, node, npm, python3, ssh/scp, curl; no cargo. In a jobq WSL job the Windows
  PATH is not appended (`cmd.exe` not found), but interop works by full path
  (`/mnt/c/Windows/System32/...`).
- WSL ssh config knows only `dgx-personal`; the Windows side's `C:\Users\delgado\.ssh\config`
  has `dgx` (= this account, the alias dgx-run uses). Windows `scp.exe -B` from a WSL job reaches
  it without prompts: that is how a bundle moves.

## How a commit gets there (works)

1. DGX: `bash plans/coach/tools/rtx/rtx-bundle.sh <branch>` -> thin bundle since 406d084155
   under `~/scratch/yt-coach/rtx/` (coach at 9757b3f6: 7 MB).
2. RTX job: `rtx-job.sh sync <sha> <bundle>`: Windows scp pulls it to `C:\yt-coach\bundles\sync.bundle`,
   `rtx-sync.ps1` fetches `refs/heads/*` into `refs/remotes/dgx/*` (as the relay's script did), refuses on a
   dirty tree, checks the sha out detached in `C:\yt-coach\wt`.

## Proof runs

| job | what | result | time |
|---|---|---|---|
| coach-rtx1-sync | sync 9757b3f6 (coach HEAD) | PASS | 1 s copy + 2 s fetch/checkout |
| coach-rtx1-rust-lib | `node scripts\rust-test.mjs --lib --no-default-features` at 9757b3f6 | PASS: 1275 passed, 0 failed, 4 ignored (tests 230.7 s) | 4.8 min incl. the incremental build (target warm from pv1) |
| coach-rtx1-rtx-tsc | tsc at 9757b3f6 | FAIL at once: no `node_modules` (by design: this leg may not install) | 0 min |

vitest and build not run: same refusal as tsc. Logs on the RTX: `C:\yt-coach\logs\s6\{sync,rust-lib,tsc}-9757b3f6.log`.

## Lessons

- `rtx-job.sh` cannot refresh itself (Windows scp: "open local ... Broken pipe" on the file bash is
  running). The refresh is the README's line 0 (`bash -c` scp, then `check`).
- `Select-String` is case-insensitive by default: "FAILED" matched test names like `a_failed_...`; now `-CaseSensitive`.

## What the next leg needs

- **node_modules for tsc / vitest / build / Playwright** (owner's call): either an install in
  `C:\yt-coach\wt` on the Windows side (the repo has `bun.lock`, no `package-lock.json`; Windows
  ARM64 native packages: esbuild, rollup), or run the node gates in the RTX's WSL with a copy of a
  Linux arm64 `node_modules` (WSL has node; its version and arch still to check).
- **Playwright layout shards**: the above, plus browsers (`%LOCALAPPDATA%\ms-playwright` is missing),
  plus lock `coach-layout` and nothing visible (headless only).
- **Vulkan evals**: `coach-eval` is not built there (only `bin\click-jitter-probe-vk.exe`). Build it
  like pv1 built the probe (`C:\Users\delgado\src\pv1-rtx-probe.ps1`, build phase: vcvarsarm64,
  clang-cl, `VULKAN_SDK` = pv1's `yames-tools\VulkanSDK-1.4.313.0`, not set machine-wide),
  `cargo build --release --features coach-llm-vulkan --bin coach-eval` with `CARGO_TARGET_DIR=C:\yt-coach\target`.
  Model there: `C:\yt-coach\models\Qwen3-4B-Q4_K_M.gguf` only; any other GGUF must be pulled with scp from the DGX the same way.
