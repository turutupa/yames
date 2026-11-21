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
| coach-rtx1-sync | sync 9757b3f6 | PASS | 1 s copy + 2 s fetch/checkout |
