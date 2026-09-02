# T06b — Allocation-free beat queue; decide the event-loop promotion

Size: S–M. Branch: `phase0/t06b-callback-queue`. Depends on: T06 merged
(probe available) and the beat-grouping follow-ups (which remove the
other two allocations from the callback).

## Why

T06 measured the cpal callback with `click-jitter-probe` at 200 BPM
16ths for 60 s while Qwen3-4B generated:

| Config | p99 jitter | missed beats |
|---|---|---|
| no LLM | 0.39 ms | 0 |
| CPU inference, event loop at normal priority | 1.2–2.3 ms (4/4 runs FAIL) | 0 |
| CPU inference, event loop promoted to real-time | 0.49–1.19 ms (3/4 PASS) | 0 |
| GPU inference | 0.30 ms | 0 |

Promoting the *event loop* reduced *callback* jitter, which only makes
sense if the callback depends on the loop: the callback pushes a
`BeatNotification` into an unbounded `std::sync::mpsc` channel, and an
unbounded channel allocates when the consumer falls behind. The
promotion is treating a symptom. A real-time event loop that also does
`state.lock().unwrap()` and `app_handle.emit` is a priority-inversion
risk in the full app (T06 never booted the app with it).

Also from T06: `YAMES_LLM_GPU_LAYERS=0` on a Vulkan build still
registers the Vulkan backend and allocates a 630 MiB compute buffer,
so it is not a CPU-only switch; and `with_below_normal_priority`
demotes only the calling thread while llama.cpp's own worker threads
stay at normal priority (needs `llama_attach_threadpool` with
`GGML_SCHED_PRIO_LOW` via `llama-cpp-sys-2` — tracked in T04b).

## Deliverables

1. Replace the callback → event-loop channel with a bounded,
   preallocated queue (`std::sync::mpsc::sync_channel(N)` with
   `try_send`, or an SPSC ring such as `rtrb`); on a full queue the
   callback drops the notification and increments an atomic counter the
   probe reports as `dropped_notifications`. No allocation on the
   callback under any load.
2. Re-run the four T06 configurations with the event-loop promotion
   **removed**. If CPU inference passes without it, delete the
   promotion of the event loop (keep the analyzer promotion only if a
   measurement with audio input shows it helps — otherwise remove it
   too). If it still fails, keep the promotion but move the blocking
   work (`state.lock`, `emit`) off the real-time thread.
3. Probe: add `--idle-check` that refuses to run when system load is
   above a threshold, and print the CPU load alongside the numbers —
   T06 saw p99 2.46 ms with *no* LLM from other agents' builds alone.
4. Gate definition update (already applied to ROADMAP §4): hard gate =
   zero missed beats and zero dropouts; p99 < 1 ms is the target on an
   idle machine and advisory on shared CI runners.
5. Rename/clarify `YAMES_LLM_GPU_LAYERS=0` in AGENTS.md as "layers on
   CPU, backend still active"; a true CPU-only run uses the
   `coach-llm` build.

## Gates

- Four probe runs recorded in the PR with load figures; zero missed
  beats in all; `dropped_notifications` 0 at 200 BPM 16ths.
- All existing gates green; `npm run tauri dev` boots and plays with
  the new queue.
