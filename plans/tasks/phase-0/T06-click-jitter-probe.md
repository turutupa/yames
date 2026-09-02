# T06 — Click-jitter probe (audio-safety gate)

Size: M. Branch: `phase0/t06-jitter-probe`. Parallel-safe to write;
passing requires a T01 build.

## Goal

A repeatable measurement that proves LLM inference does not disturb the
metronome, so every later phase can re-run it.

## Facts

- The engine is in `src-tauri/src/engine.rs` (`MetronomeEngine`,
  cpal output callback ~line 982, event loop ~line 1246, a beat log
  behind a mutex ~line 1325). Timing is sample-accurate inside the
  callback; beats are emitted as events with timestamps.
- Existing dev binaries live in `src-tauri/src/bin/` (`inspect-session`,
  `score-playground`, …) and are registered implicitly by Cargo;
  `default-run = "yames"` keeps `tauri dev` working.
- LLM generation runs in `commands.rs::coach_generate` via
  `spawn_blocking`; the model API is `coach::generate(&engine, ctx)`.
- ROADMAP §4 threshold: p99 callback-to-callback jitter < 1 ms and zero
  missed beats over 60 s while generating continuously.

## Steps

1. Expose what the probe needs from `engine.rs` without changing
   behaviour: a way to subscribe to callback timestamps (or beat
   timestamps with the sample position) — e.g. an optional
   `Arc<Mutex<Vec<(Instant, u64 samples)>>>` sink enabled only when the
   engine is constructed by the probe. Prefer an atomic/lock-free push
   into a preallocated ring so the probe itself adds no locking on the
   callback.
2. `src-tauri/src/bin/click-jitter-probe.rs`:
   - args: `--bpm 200 --subdivision 4 --seconds 60 --gguf <path>
     [--no-llm]`;
   - starts the engine on the default output device;
   - if a GGUF is given (needs `--features coach-llm` or
     `coach-llm-vulkan`), loops `coach::generate` on a background thread
     for the duration; force the CPU path with `YAMES_LLM_GPU_LAYERS=0`
     (T01's override) and also run once with the GPU on a Vulkan/Metal
     build — report both;
   - collects timestamps, computes expected beat interval from the
     stream sample rate and buffer size, reports p50/p95/p99 jitter,
     max gap, missed beats, and exits 1 above threshold.
3. Add `bun run yames:jitter-probe` to `package.json` scripts.
4. Run it twice on your machine: `--no-llm` baseline and with the LLM.
   Put both outputs in the PR.
5. Optional (only if the LLM run fails the gate): apply the Mozilla
   `audio_thread_priority` crate to the analyzer thread in `onset.rs`
   and the engine event-loop thread — never the cpal callback — and
   re-measure. Keep the change only if it moves the numbers.

## Acceptance

- Baseline run passes the threshold on your machine.
- LLM run passes, or the PR explains exactly which number fails and by
  how much (that is a valid outcome — it becomes a Phase 0 blocker to
  fix in T01's thread settings).
- `bun run test:rust` unchanged; no change to audio behaviour without
  the probe flag.
