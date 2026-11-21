# Leg pv1: the click-jitter probe with Qwen3 4B on Vulkan, on this machine

> **NOT RUN (session 3, 2026-11-20).** The launch of this leg was refused by the session's
> permission mode, and by the owner's rule it was not tried another way. Nothing below was done:
> no download, no clone, no build. The Vulkan run needs the owner: either `libvulkan-dev` and
> `glslc` installed on the DGX (then steps 3 to 6 are an ordinary leg), or the run made on a
> machine that already builds `coach-llm-vulkan` (the RTX). Kept as the description of the work.

Worktree `/home/dgx-delgado/yames-coach-pv1`, branch `coach-pv1`. Logs under `/tmp/coach-pv1/`.

Owed since session 1 and ordered by the relay for tonight: the probe's LLM runs with the shipping
Standard model (Qwen3 4B, Q4_K_M) on the shipping backend (Vulkan). The CPU runs are done (session
3, `/tmp/coach-orch/probe-*.log`): no-LLM p99 0.85 / 0.68 / 0.77 ms; with a 0.6B model generating
on the CPU (18 threads on 20 cores) the hard gates are 0 and p99 is 3.4 to 4.5 ms, because CPU
inference is itself the load (AGENTS.md, "ggml's threadpool defeats ..."). The Vulkan run is the one
that says what a player's machine does.

No app code changes are expected. If one is needed, stop and report it.

## What is missing here, and what you may do about it

This DGX (aarch64 Linux, NVIDIA GB10) has the Vulkan runtime (`/usr/lib/aarch64-linux-gnu/libvulkan.so.1`,
`/usr/share/vulkan/icd.d/nvidia_icd.json`) but not what the build needs: no Vulkan headers
(`/usr/include/vulkan` is absent), no `glslc`, and the model file is not on disk. `apt-get` and
`sudo` are blocked by policy and are never attempted.

1. **Look first** (read-only, a few commands): is there already a `glslc`, Vulkan headers or a
   Vulkan SDK somewhere this account can read (`~/tools`, `~/android-ndk-local`, `$ANDROID_HOME`,
   `~/.cargo/registry` sources of a `shaderc` crate, `/usr/local`)? AGENTS.md ("Local test builds")
   says how the Android build got its tools on this machine.
2. **If not, a toolchain in your own folder** `~/scratch/vulkan-coach/` (never system paths, and
   nowhere else in the home folder):
   Vulkan-Headers (header-only; a release tarball or a shallow clone from KhronosGroup on GitHub,
   fetched with `git clone --depth 1` — public, no credentials, nothing of ours in the request), a
   `libvulkan.so` symlink to the system's `libvulkan.so.1` in your folder's `lib/`, and `glslc`
   built from source (google/shaderc with its `git-sync-deps`; cmake + ninja or make; a queue job:
   `--ram 12G --est 25m`). Then `VULKAN_SDK=~/scratch/vulkan-coach` and `PATH` with its `bin` for the
   cargo build (pass them with `--setenv` on the job, or in a two-line script).
   If a download or a clone is refused by the permission mode, **stop there**: do not try another
   route; report exactly what was refused.
3. **The model**: `Qwen3-4B-Q4_K_M.gguf`, the URL and SHA-256 pinned in
   `src-tauri/src/models.rs` (`grep -n "Qwen3-4B-Q4_K_M" src-tauri/src/models.rs`, and the `sha256`
   on the next lines). One `curl -L --fail -o ~/scratch/yames-c3a-models/Qwen3-4B-Q4_K_M.gguf <url>`
   (about 2.5 GB; run it as a queue job, `--ram 2G --est 15m`), then `sha256sum` against the pin. A
   mismatch means delete nothing, use nothing, report.
4. **Build**: `cargo build --release --manifest-path src-tauri/Cargo.toml --features coach-llm-vulkan
   --bin click-jitter-probe` as a queue job through `run.sh` (`--ram 16G --est 30m`), with
   `CARGO_TARGET_DIR=$HOME/.target-coach-vk` (set it with `--setenv`; `run.sh` keeps a value that is
   already set? Check: if it overwrites, write a two-line script that exports it after `run.sh`'s
   environment and calls cargo) so the build does not thrash the other legs' cache. Copy the binary
   to `/tmp/coach-pv1/click-jitter-probe-vk`.
5. **Run**, as one queue job that takes the build's lock alone and declares the GPU:
   `~/.local/bin/job submit --name coach-pv1-probe --ram 8G --gpu 6G --est 30m --cwd <worktree> -- flock -x /tmp/coach-heavy.lock bash /tmp/coach-pv1/probe-vk.sh`,
   where `probe-vk.sh` is `plans/coach/tools/probe-night.sh`'s shape (copy it; keep its `quiet`
   wait with `PROBE_LOAD_MAX` 4 and `PROBE_WAIT_MIN` 10; `XDG_RUNTIME_DIR=/run/user/1000`;
   `--volume 0.01`) with these runs, the binary and the model above:
   `--gguf M --llm-load`, `--gguf M --llm-cancel`, `--gguf M` (continuous generation, the gate's own
   wording), `--gguf M --jam-swap --jam-move --jam-take`, `--gguf M --song-loop --song-take`.
   Before it: `free -g` must show 16 GB available **after** the model's 6 GB; a machine-learning
   job from another account shares the GPU and memory tonight (`nvidia-smi` shows it): if the GPU
   cannot take the model, do not force it: say so. Confirm from each log that the layers really
   went to the GPU (`backend=vulkan`, `n_gpu_layers`, llama.cpp's "offloaded N/N layers" line): a
   run that fell back to the CPU is reported as a CPU run.
6. **Report the numbers honestly**: per run, load before and after, p50 / p99 / max, the four gates,
   generations completed, where the layers ran. A p99 over 1 ms with a load over 4 is "advisory fail
   on a busy machine", not a pass and not a regression. Also one line on tokens per second if the
   probe or llama.cpp prints it (c3b's speed gate will want it).

## Write down

`plans/coach/progress/pv1.md`: what was found, what was built where (so the next session can re-run
with one command), each run's numbers, what was refused if anything. Save the re-runnable script as
`plans/coach/tools/probe-vulkan.sh` (with the folder paths in variables at the top). Commit both.

## Report

At most 40 lines: what exists now under `~/scratch/vulkan-coach/` and `~/scratch/yames-c3a-models/`;
the table of runs; anything refused; the one command that repeats the runs.
