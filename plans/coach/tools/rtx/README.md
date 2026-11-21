# The coach build's gates on the RTX (through jobq only)

The RTX (Windows 11 ARM64, RTX Spark N1X) is reached only with `job submit --machine rtx --env any`:
the job runs in the RTX's WSL, hidden, and these scripts call the Windows side by full path
(`/mnt/c/Windows/System32/...`; a jobq WSL job has no Windows PATH). Nobody runs ssh/scp from the DGX:
the RTX pulls from the DGX with its own Windows ssh config (host `dgx`, the one dgx-run uses), `scp -B`.

Everything written there is under `C:\yt-coach\` (`tools`, `bundles`, `logs\s6`, `wt`, `target`).
Low priority (nice 19, BelowNormal). One RTX job at a time; `--ram` honest (about 13 GB available).

| File | Where it runs | What |
|---|---|---|
| `rtx-bundle.sh` | DGX | thin bundle of a branch (since 406d084155, which the RTX has) -> prints sha + path |
| `rtx-job.sh` | RTX WSL (`C:\yt-coach\tools\`) | `check`, `tools <dgx-dir>`, `sync <sha> <bundle>`, `gate <step> [sha]` |
| `rtx-sync.ps1` | RTX Windows | fetch the bundle into `refs/remotes/dgx/*`, refuse on a dirty tree, checkout detached |
| `rtx-gate.ps1` | RTX Windows | `check`, `tsc`, `vitest`, `build`, `rust-lib`; log `C:\yt-coach\logs\s6\<step>-<sha8>.log`; last line PASS/FAIL + minutes |
| `look.sh` | RTX WSL | the first read-only look (argument of `bash -c`) |

## The lines

```sh
J=/home/dgx-delgado/.local/bin/job
# 0. after changing these scripts: copy them to C:\yt-coach\tools (the DGX folder holding them)
$J submit --name coach-<leg>-rtx-tools --machine rtx --env any --ram 1G --est 1m -- \
  bash /mnt/c/yt-coach/tools/rtx-job.sh tools /home/dgx-delgado/<worktree>/plans/coach/tools/rtx
# 1. bundle on the DGX (prints SHA and BUNDLE), then sync
bash plans/coach/tools/rtx/rtx-bundle.sh <branch>
$J submit --name coach-<leg>-rtx-sync --machine rtx --env any --ram 1G --est 3m -- \
  bash /mnt/c/yt-coach/tools/rtx-job.sh sync <SHA> <BUNDLE>
# 2. gates (each refuses unless C:\yt-coach\wt is at <sha8>)
$J submit --name coach-<leg>-rtx-rust-lib --machine rtx --env any --ram 10G --est 30m -- \
  bash /mnt/c/yt-coach/tools/rtx-job.sh gate rust-lib <sha8>
$J submit --name coach-<leg>-rtx-tsc    --machine rtx --env any --ram 6G  --est 5m  -- bash /mnt/c/yt-coach/tools/rtx-job.sh gate tsc <sha8>
$J submit --name coach-<leg>-rtx-vitest --machine rtx --env any --ram 12G --est 15m -- bash /mnt/c/yt-coach/tools/rtx-job.sh gate vitest <sha8>
$J submit --name coach-<leg>-rtx-build  --machine rtx --env any --ram 8G  --est 6m  -- bash /mnt/c/yt-coach/tools/rtx-job.sh gate build <sha8>
# read-only look at the tools, HEAD, node_modules, browsers, free RAM
$J submit --name coach-<leg>-rtx-check --machine rtx --env any --ram 1G --est 1m -- bash /mnt/c/yt-coach/tools/rtx-job.sh check
# follow
$J wait <name> --timeout 9m; $J logs <name> -n 40
```

Sync and gates are separate jobs on purpose (one RTX job at a time; the sha argument makes a gate refuse
a worktree some other leg moved). A thin bundle needs its base on the RTX: after a PASS sync of X, later
bundles may use `rtx-bundle.sh <branch> X`; `full` makes a whole-history one (~700 MB, slow).

## Known limits (2026-11-21)

- `C:\yt-coach\wt` has **no `node_modules`**: tsc, vitest and build FAIL at once with that reason. The fix is
  the owner's call (an install on the RTX, or copying one), not a leg's.
- The worktree's git directory is the owner's `C:\Users\delgado\src\yames\.git` (worktree `wt`): a sync
  adds objects there and moves `refs/remotes/dgx/<branch>`, exactly as the relay's `yames-coach-test.ps1`
  did; the owner's working tree, branches and HEAD are not touched.
- No Playwright browsers on the RTX; `VULKAN_SDK` is not set machine-wide (pv1 used
  `yames-tools\VulkanSDK-1.4.313.0` explicitly).
