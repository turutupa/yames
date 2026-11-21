# Windows: the audio callback threads get real-time scheduling (MMCSS)

Branch `win-audio-mmcss` (off `revamp`), 2026-11-21. For review: this is an
audio-callback change.

## The defect

cpal 0.15.3's WASAPI backend tries to raise each stream thread to
`THREAD_PRIORITY_TIME_CRITICAL` (`host/wasapi/stream.rs:325-333`,
`boost_current_thread_priority`). It passes `GetCurrentThreadId()` where
`SetThreadPriority` wants a thread HANDLE, so the call fails, and `let _ =`
throws the error away. Nothing else registers the thread with MMCSS.

Measured on the RTX (Windows ARM, NVIDIA, `/tmp/pv1-rtx-followup.md`): the
output callback thread runs at **base priority 6** in the probe's BelowNormal
process. That is plain `THREAD_PRIORITY_NORMAL`, the same level as the event
loop and every worker, and one step above the LLM threads (5). Raising it to
TimeCritical from outside took p99 under LLM load from 5 of 10 passing to 5 of 5.

The BeatQueue comment in `engine.rs` and AGENTS.md both said the callback ran at
TIME_CRITICAL. Both are corrected.

## The change

New module `src-tauri/src/callback_priority.rs`, with a `CallbackPriority`
value that lives inside each stream's data closure:

- **On the first callback** (cpal has no thread-start hook), the thread is
  registered with MMCSS **"Pro Audio"** through `AvSetMmThreadCharacteristicsW`
  and raised within the task to `AVRT_PRIORITY_HIGH`. If MMCSS refuses (the
  service is stopped or the task is missing), it falls back to what cpal meant
  to do: `SetThreadPriority(GetCurrentThread(), TIME_CRITICAL)`. If that fails
  too, the stream plays as before. **Promotion never fails a stream.**
- **The handle lives as long as the stream.** cpal moves the closure into its
  stream thread, and drops it there when the stream is dropped (`run_output` /
  `run_input` return, then the closure goes). So `Drop` runs on the promoted
  thread, and it reverts what was done: `AvRevertMmThreadCharacteristics`, or
  it restores the old priority. A closure that never ran (its stream failed to
  build) holds nothing. The thread id is checked, so a drop on any other thread
  reverts nothing.
- **Logging happens once, and never from the callback.** Outcomes are counted
  in static atomics (`mmcss` / `fallback` / `failed`, plus the last error).
  `report_once()` prints each outcome the first time it is seen. It runs from
  the engine's event loop, next to the beat-queue overflow report, and costs
  three relaxed loads when there is nothing new. The probe prints
  `callback thread priority: mmcss=.. fallback=.. failed=..`.
- **The A/B switch:** `YAMES_NO_CALLBACK_PRIORITY=1` keeps the old behaviour.
  It is read once, on the stream-building thread. The RTX runs below used it
  so that both arms ran the same binary. It also serves as an escape hatch if a
  driver ever misbehaves with an MMCSS thread.

Where it applies (every cpal stream the app opens):

| stream | file |
|---|---|
| engine output (click, band, coach, take ring); **what the probe measures** | `engine.rs`, the `build_output_stream` under "Build the output stream" |
| mic input, f32 and i16 | `audio_input.rs` |
| take playback, both config attempts | `audio_input.rs` |
| WASAPI loopback capture (all three formats via the macro) | `loopback.rs` |

These are not touched: the silent pre-flight stream in `engine.rs`, which is
built and dropped at once, and the loopback test's render stream. The probe
builds no cpal stream of its own. It runs `MetronomeEngine::start_headless`,
so it measures exactly the engine output path above.

### Why not upgrade cpal

cpal 0.16 still has the thread-id-as-handle bug unless you build it with its
optional `audio_thread_priority` feature. cpal 0.17 fixes the fallback
(`GetCurrentThread()`), and with that feature it registers MMCSS **"Audio"**.
I checked both in the crate sources (`/tmp/pv1-rtx-followup.md`). An upgrade
would mean API churn across `engine.rs`, `audio_input.rs`, `loopback.rs` and
the Android/Oboe paths. It would also change Linux and macOS (the feature
promotes ALSA threads too), all for the same effect as about 150 lines here.
That makes it a separate decision for later. When cpal is upgraded, this module
can go: remove it in the same change.

### Why not `audio_thread_priority::promote_current_thread_to_real_time`

It is already a dependency (`onset.rs`), but it would be wrong on the callback
for two reasons:

- On its Windows path the first call runs `OnceLock` + `LoadLibraryW("avrt.dll")`,
  every success runs `log::info!` (which formats), and every failure builds a
  `String`.
- Its handle has **no `Drop`**, so a revert would have to be an explicit
  `demote_*` call that the callback has no moment to make.

The raw calls give the same MMCSS registration (in a higher task) with nothing
to warm up beyond the service itself.

### "Pro Audio" rather than "Audio"

The defaults are Scheduling Category High (priorities 23-26) for Pro Audio and
Medium (16-22) for Audio. Both sit above every thread a Normal process can have
(max 15), so either one beats the LLM's and the UI's threads. Pro Audio is the
task MMCSS documents for low-latency audio, and the callback costs about 0.1 ms
in a 10 ms buffer, far inside MMCSS's `SystemResponsiveness` reservation. On
the RTX the registered thread reads **base 25 / current 25** (the off arm reads
base 6).

## The allocation argument

The probe's callback-heap gate counts Rust allocations and frees inside the
body of our closure (`alloc_probe::Span`, raised in `render`). The promotion
runs before `render`, so it sits outside the span. It also allocates nothing,
which is the claim that matters:

- **Every callback after the first** does one `bool` test (`#[inline(always)]`;
  the promote path is `#[cold] #[inline(never)]`).
- **The first callback** makes three Win32 calls (`GetCurrentThreadId`,
  `AvSetMmThreadCharacteristicsW`, `AvSetMmThreadPriority`; on the fallback,
  `GetLastError` / `GetThreadPriority` / `SetThreadPriority`). Their arguments
  are a stack `u32` and a `'static` UTF-16 array built at compile time. After
  that come a few relaxed atomic stores. There is no `String`, no `Vec`, no
  formatting, no lock and no log.
- **`avrt.dll` is a load-time import** (windows-sys links it), so there is no
  `LoadLibrary` on the audio thread.
- **The warm-up:** `CallbackPriority::new()` runs on the thread that builds the
  stream, never the audio thread. The first time in the process, it registers
  that thread with Pro Audio and reverts it straight away (`Once`). That keeps
  the MMCSS service's one-off first-call setup out of the first buffer, and it
  serialises the first call, which the avrt crate saw fail with
  `ERROR_PATH_NOT_FOUND` when made concurrently.
- Whatever the OS does inside `AvSetMmThreadCharacteristicsW` happens once per
  stream, on the first buffer, inside the probe's 1.5 s warm-up. It is OS code,
  not the Rust heap.
- **`Drop`** runs at stream teardown, on a thread that is leaving.

Measured: `callback_allocs = 0`, `callback_frees = 0` and
`dropped_notifications = 0` in all 24 RTX runs, with MMCSS active in all 12
"fix" runs.

The mic input callback in `audio_input.rs` already allocates (`Vec` per
buffer) and takes `try_lock`s. That was true before this change, and that
callback is not under the probe's gate. Promoting it makes capture more timely.
It does not make that allocation any less legal than it was.

## Linux, macOS, Android: unchanged

Everywhere but Windows, `CallbackPriority` is an empty struct and both calls
compile to nothing. The reasons not to change the other platforms:

- **CoreAudio** already runs its IO thread at real-time priority.
- **Oboe** asks for its own priority.
- **ALSA (Linux)** was never promoted. A SCHED_RR thread there depends on
  rlimits and rtkit, and nothing has measured it. That would be a behaviour
  change needing its own bench.

`report_once` and `counts()` exist on every platform and read `0/0/0` off
Windows.

## Tests

- **DGX:** `cargo test --lib` passed: 1252 passed, 0 failed (Linux, so the
  Windows tests are cfg-gated out). The `callback_priority.rs` module, tests
  included, type-checks for `aarch64-pc-windows-msvc` and
  `x86_64-pc-windows-msvc` in a scratch crate (windows-sys 0.59, cpal 0.15.3)
  with no warnings. The full crate cannot be checked for Windows from the DGX,
  because the C build scripts need MSVC.
- **RTX:** both Windows-only tests pass (`node scripts\rust-test.mjs --release
  --features coach-llm-vulkan --lib callback_priority`):
  - `promotes_on_first_call_and_reverts_on_drop`: a plain thread is raised on
    its first call, a second call does nothing, and drop restores the old
    priority.
  - `cpal_output_callback_thread_is_raised`: a real cpal output stream on the
    default device reports, from inside its first callback, that it was
    promoted and that `GetThreadPriority >= 15`. With no device it is skipped.

## RTX before/after

The machine, model (Qwen3-4B Q4_K_M, Vulkan, all layers on the GPU) and flags
are the same as pv1: 60 s, 200 BPM 16ths (240 for the jam), 48 kHz, 480 frames,
`--volume 0`, AC power, Balanced plan, probe at BelowNormal, hidden, no Windows
setting changed.

- **Binary:** one binary, built from `b40d448d06` (`C:\yt-mmcss\bin\click-jitter-probe-mmcss.exe`).
- **Arms:** fix = as shipped. off = `YAMES_NO_CALLBACK_PRIORITY=1`, which is
  the old behaviour.
- **Order:** interleaved fix/off.
- **CPU:** 3-7 % before each run.
- **Gaps:** gaps >2xbuf come from `/tmp/pv1-fu-analyze.py`.
- **Files:** script `/tmp/win-mmcss-rtx.ps1` (on the RTX
  `C:\Users\delgado\src\win-mmcss-rtx.ps1`), logs and CSVs in
  `/tmp/win-mmcss-logs/` (on the RTX `C:\yt-mmcss\logs\`).

| run | p99 ms | p99 < 1 | gaps >2xbuf | longest gap ms | missed | allocs/frees | dropped |
|---|---|---|---|---|---|---|---|
| base-fix-1 | 1.067 | FAIL | 0 | 14.2 | 0 | 0/0 | 0 |
| base-off-1 | 1.146 | FAIL | 0 | 16.0 | 0 | 0/0 | 0 |
| base-fix-2 | 1.145 | FAIL | 0 | 17.3 | 0 | 0/0 | 0 |
| base-off-2 | 1.075 | FAIL | 0 | 17.4 | 0 | 0/0 | 0 |
| base-fix-3 | 0.999 | PASS | 0 | 16.3 | 0 | 0/0 | 0 |
| base-off-3 | 1.110 | FAIL | 0 | 17.1 | 0 | 0/0 | 0 |
| base-fix-4 | 1.170 | FAIL | 0 | 16.3 | 0 | 0/0 | 0 |
| base-off-4 | 1.168 | FAIL | 0 | 17.3 | 0 | 0/0 | 0 |
| gen-fix-1 | 0.613 | PASS | 4 | 31.9 | 0 | 0/0 | 0 |
| gen-off-1 | 0.764 | PASS | 2 | 22.7 | 0 | 0/0 | 0 |
| gen-fix-2 | 0.554 | PASS | 4 | 21.6 | 0 | 0/0 | 0 |
| gen-off-2 | 0.751 | PASS | 1 | 20.3 | 0 | 0/0 | 0 |
| gen-fix-3 | 0.564 | PASS | 3 | 28.9 | 0 | 0/0 | 0 |
| gen-off-3 | 1.227 | FAIL | 7 | 33.5 | 0 | 0/0 | 0 |
| gen-fix-4 | 0.800 | PASS | 5 | 27.3 | 0 | 0/0 | 0 |
| gen-off-4 | 0.900 | PASS | 8 | 33.2 | 0 | 0/0 | 0 |
| jam-fix-1 | 1.078 | FAIL | 6 | 30.6 | 0 | 0/0 | 0 |
| jam-off-1 | 0.629 | PASS | 4 | 37.1 | 0 | 0/0 | 0 |
| jam-fix-2 | 0.685 | PASS | 4 | 24.6 | 0 | 0/0 | 0 |
| jam-off-2 | 0.805 | PASS | 2 | 25.4 | 0 | 0/0 | 0 |
| song-fix-1 | 0.611 | PASS | 4 | 37.5 | 0 | 0/0 | 0 |
| song-off-1 | 1.311 | FAIL | 5 | 36.6 | 0 | 0/0 | 0 |
| song-fix-2 | 0.597 | PASS | 3 | 25.4 | 0 | 0/0 | 0 |
| song-off-2 | 1.409 | FAIL | 4 | 30.5 | 0 | 0/0 | 0 |

Summary:

| | fix (MMCSS) | off (as before) |
|---|---|---|
| no-LLM baseline, p99 pass | 1/4 (0.999-1.170, mean 1.095) | 0/4 (1.075-1.168, mean 1.125) |
| llm-gen, p99 pass | **4/4** (0.554-0.800, mean 0.633) | 3/4 (0.751-1.227, mean 0.910) |
| jam + song (LLM), p99 pass | 3/4 (0.597-1.078) | 2/4 (0.629-1.409) |
| all LLM runs, p99 pass | **7/8**, mean 0.688 | 5/8, mean 0.975 |
| gaps >2xbuf, LLM runs | 33 in 8 runs (4.1/min) | 33 in 8 runs (4.1/min) |
| gaps >2xbuf, baseline | 0 | 0 |
| missed / allocs / frees / dropped | 0 / 0 / 0 / 0 everywhere | 0 / 0 / 0 / 0 everywhere |
| callback thread base priority | 25 (MMCSS Pro Audio) | 6 |

What this says:

1. **Under LLM load, MMCSS does what raising the thread from outside did.** p99
   passes 7 of 8 runs against 5 of 8, and the mean p99 falls by about 30 %
   (0.98 to 0.69 ms). llm-gen is now 4/4, at 0.55-0.80 ms. This sample is small,
   and one jam run with the fix failed at 1.078 ms, so the gate is improved, not
   guaranteed.
2. **The idle baseline does not move** (mean 1.10 against 1.13 ms). That was
   expected: the follow-up showed the miss is C-state wake-up latency, not
   scheduling, and priority cannot fix it. The gate's idle threshold is a
   separate question (see the follow-up's conclusion 1).
3. **The 20-37 ms gaps under the LLM do not move** (33 against 33). They are
   not CPU scheduling either: the ~7.35 s period points at GPU or driver work.
   They are still open (follow-up, section 2), and they caused no missed beat.

## Open

- The >2-buffer gaps under the LLM (GPU or driver, ~7.35 s beat). This needs a
  probe that timestamps generation phases into the CSV, then possibly a
  WPR/LatencyMon DPC trace taken by the owner.
- The idle-baseline p99 gate on this machine (needs a per-machine baseline, or
  no idle requirement).
- Upgrade to cpal 0.17 later, and drop this module in the same change.
