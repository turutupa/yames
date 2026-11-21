# win-mmcss: independent review findings

Reviewed: `b40d448d06` (the fix) and `1bb5014f92` (`plans/engine/win-mmcss.md`), branch
`win-audio-mmcss`, 2026-11-21. Read against cpal 0.15.3 (`host/wasapi/stream.rs`),
windows-sys 0.59 / windows-targets 0.52.6, audio_thread_priority 0.37, and the RTX logs in
`/tmp/win-mmcss-logs/`.

**Verdict: MERGE.** Nothing blocks. The Win32 use is correct, the stream can't fail because of the
promotion, other platforms compile to nothing, and the RTX numbers in the doc match the logs. The
findings below are small follow-ups (two of them are test gaps), plus some notes on behaviour that
was already there before this change.

## What was checked and holds

- **Handle types.** `AvSetMmThreadCharacteristicsW(PCWSTR, *mut u32) -> HANDLE` with
  `HANDLE = *mut c_void` (windows-sys 0.59). The null check is right. The handle is stored as `usize`
  only so the struct stays `Send`, and it is cast back for the revert. The fallback uses the
  pseudo-handle `GetCurrentThread()`, which is the exact fix for cpal's thread-id-as-HANDLE bug
  (cpal `stream.rs:325-333`). `PRIORITY_ERROR = 0x7FFFFFFF` matches `THREAD_PRIORITY_ERROR_RETURN`.
  `PRO_AUDIO` is 9 chars plus NUL in `[u16; 10]`.
- **Task index out-param.** It is a stack `u32` and its value is never needed afterwards. Fine.
- **Revert pairing.** One `AvSetMm…` gives at most one `AvRevert…`: `mem::take` empties `held` first,
  so a double drop is impossible. The warm-up reverts its own handle straight away.
- **Which thread runs the drop.** I verified this in cpal 0.15.3. The data callback is moved into the
  `spawn` closure (`stream.rs:106,139`), and `Stream::drop` sends Terminate and joins (`:161-163`).
  So the closure, and with it `CallbackPriority`, drops on the stream thread after
  `run_output`/`run_input` return. If the loop broke on a device error first, the thread still
  exits the same way. A closure whose build failed drops on the builder thread with
  `Held::Nothing`. The thread-id check (`callback_priority.rs:285`) is a correct backstop.
- **State is per stream, not per thread.** Every build site calls `CallbackPriority::new()` for each
  build: engine reopen and device change, both take-playback attempts, and each loopback macro
  expansion. So each stream promotes its own thread. cpal WASAPI uses one thread per stream and
  never reuses threads, and the crate has no `asio` feature. Pausing the output stream for
  `output_parked` keeps the same thread and closure, so the promotion persists, which is correct.
  Several streams on different threads register independently, and the counters only aggregate.
- **A stream never fails.** `promote` sets `tried = true` first, ignores every return value except
  to choose the outcome, and has no `?`, `unwrap` or panic path. `FAILED` just leaves the thread
  where cpal put it.
- **Platform isolation.** `windows-sys` is a `cfg(windows)` dependency, and `mod win`, `disabled()`
  and `Drop` are all `cfg(windows)`. Off Windows the type is a ZST with an empty inline
  `on_callback`. `report_once` and `counts` exist everywhere and read 0/0/0. On Android the cpal
  sites are `unreachable_code` but still compiled, so there are no dead-code warnings.
- **Linking.** The `windows_targets::link!` import goes through the `windows.0.52.0` import lib,
  which windows-targets ships for x86_64/aarch64/i686 MSVC, GNU and gnullvm. No target breaks, and
  Yames has no `#[link(name = "avrt")]` of its own. It is a load-time import (not delay-load), so
  "no LoadLibrary on the audio thread" is true.
- **The DGX run.** `cargo test --lib` (Linux) gave 1252 passed, 0 failed, 4 ignored, the same
  count as the doc.
- **RTX data.** I re-derived every row of the doc's table from the 24 `probe-*.log` JSON lines.
  The p99s, gap counts, max gaps and 0 allocs/frees/dropped all match. So do the means (0.688 vs
  0.975, 0.633 vs 0.910, 1.095 vs 1.125) and the gap totals (33/33). `mmcss=1` in all 12 fix
  arms, `YAMES_NO_CALLBACK_PRIORITY set` in all 12 off arms. `run.out` shows the
  callback thread at base 25 / cur 25 (fix) versus base 6 (off). `git-worktree.log` confirms the
  binary was built from `b40d448d` (the `fatal: cannot change to ' C:\yt-mmcss\wt'` line in
  `run.out` is a script quoting glitch and doesn't affect provenance). The RTX test log shows both
  Windows tests passing and no warnings from `callback_priority.rs`.

## Findings

### F1. Low: the TIME_CRITICAL fallback is never exercised by any test
`callback_priority.rs:259-272`, tests `:319-396`.
**Scenario.** On any machine where MMCSS works (the RTX, every dev box), both tests take the
`Held::Mmcss` branch. `GetLastError`, `GetThreadPriority`, `SetThreadPriority` and the
`TimeCritical(p)` revert have never run. A regression there (a wrong restore value, a revert that
leaves the thread at 15) would only show on a user machine with MMCSS disabled, which is exactly
the machine where it matters.
**Fix.** Make the task name a parameter of `promote` (keep `PRO_AUDIO` in production), and add a
Windows test that passes a task name absent from the registry (for example `"Yames No Such Task"`).
Assert `Held::TimeCritical`, `current_priority() == 15`, `LAST_ERROR != 0`, and that drop
restores `before`. That costs nothing at runtime.

### F2. Low: both Windows tests fail if `YAMES_NO_CALLBACK_PRIORITY` is set in the test environment
`callback_priority.rs:110-118, 323-331, 392`.
**Scenario.** The A/B switch is a documented thing people export. The RTX script set it for the off
arms. If someone runs `cargo test` in that shell, `new()` returns `tried = true`. Test 1 then
panics with "neither MMCSS nor SetThreadPriority took" and test 2 fails "not promoted", which reads
as a real regression. The `OnceLock` also means one test can't flip it.
**Fix.** In both tests, skip with an `eprintln!` when `disabled()` is true, or bypass `disabled()`
by building `Inner` directly in test 1.

### F3. Low: `report_once` can print an outcome twice, and can print `error 0`
`callback_priority.rs:82-87`, `:259` vs `:269`.
**Scenario.** (a) The load at `:82` and the `fetch_or` at `:86` aren't one RMW. Two concurrent
callers can both see the bit as new. That needs two engine event loops alive at once: a
`reopen_output` timeout detaches the old stream thread while a new one starts, and both run
`report_once`. The result is a duplicated log line. (b) `LAST_ERROR` is stored before the
`FALLBACK`/`FAILED` increment, but both are `Relaxed`. On ARM (the RTX is ARM64) the reader can
see `fallback > 0` with a stale `LAST_ERROR` and print `error 0`. `LAST_ERROR` is also
last-writer-wins across streams. Both effects are cosmetic, because the log is the only consumer.
**Fix.** `let new = seen & !REPORTED.fetch_or(seen, Relaxed);`, and use `Release` on the
counter increments and `Acquire` on the loads in `counts()`/`report_once`.

### F4. Low/doc: the callback-heap gate doesn't cover the promotion, and the warm-up claim is stronger than the evidence
`engine.rs:8580-8585` (outside `render`), the span at `engine.rs:6670`; `callback_priority.rs:36-40,
220-237`; doc lines 104-127.
**Scenario.** (a) The gate can't see the promote path. Today it allocates nothing on the Rust side
(I read it: stack `u32`, `'static` array, atomics). But if someone later adds an `eprintln!` or
`format!` to `promote` "for debugging", the probe would stay green. (b) The first callback still
makes blocking syscalls inside the WASAPI deadline: `AvSetMmThreadCharacteristicsW` reads the
registry task key and calls into MMCSS, and may allocate on the process heap. That process heap is
the same heap the Rust allocator uses on Windows, so it can wait on a heap lock held by an LLM
thread. This is standard practice (cpal 0.17, PortAudio and JUCE all do this from the audio thread)
and costs one buffer at stream start at most, so I accept it. But the warm-up only runs once per
process, so it only shields the first stream. It also doesn't serialise against
`audio_thread_priority`'s own first-call `Once` in `onset.rs:434`, which registers the analyzer
thread as MMCSS "Audio". The "service setup is never paid inside a buffer" claim is not measured.
**Fix.** (a) Move `priority.on_callback()` inside the probe span. In `render`, put it before
`_alloc_span` is dropped, or raise the span around both calls in the wrapper closure. Then the gate
proves the claim instead of asserting it. (b) Soften the doc to "keeps the process-first MMCSS
call off the audio thread; each stream's own registration costs one syscall in its first buffer",
and mention that the onset analyzer is already MMCSS "Audio" (the mic producer now outranks its
consumer, which is the right order).

### F5. Info, already there before: cpal's own misdirected `SetThreadPriority` still runs first
cpal `host/wasapi/stream.rs:272,301,325-333`.
**Scenario.** `HANDLE(thread_id)` usually fails. But thread ids and handle values are both
multiples of 4. In a process with a few thousand handles (Vulkan + llama), a small thread id
(`run.out` shows ids like 7856) can alias a real handle value. If that handle is a thread handle
with `THREAD_SET_INFORMATION` (for example an LLM worker thread's handle), cpal sets *that* thread
to TIME_CRITICAL. This change doesn't cause it, can't prevent it, and the off-arm data shows nothing
like it. Recorded so that a mystery TIME_CRITICAL thread is recognised.
**Fix.** None here. It goes away with the cpal 0.17 upgrade already in "Open".

### F6. Info, already there before: work that was already on the callbacks now runs at MMCSS priority 25
`audio_input.rs:651, 743` (a `Vec` per buffer); `:680, :762` (`eprintln!` on rec-buffer overflow);
`:1150` (`eprintln!` on the take-playback first callback).
**Scenario.** `eprintln!` takes Rust's stderr `ReentrantMutex`. If a priority-6 thread holds it
mid-print, the mic or playback callback waits on it. That is a priority inversion, and the
callback's new priority doesn't rescue it (Windows' starvation booster eventually does). It already
happened before, and it is rare (overflow and first callback only). The doc acknowledges the
`Vec`. Not a reason to hold the change.
**Fix.** Optional follow-up. Move those prints to counters reported off-thread, as this change does
for its own outcomes.

### F7. Info: what the tests do and don't prove
- `cpal_output_callback_thread_is_raised` is a real regression test for the cpal bug. With the old
  code (no `on_callback`) the callback reads `GetThreadPriority == 0`, so `p >= 15` fails. It
  passes on either MMCSS or the fallback, so it doesn't distinguish them. On a Windows CI runner
  with no audio endpoint it silently skips, so it only proves anything on hardware like the RTX.
- `promotes_on_first_call_and_reverts_on_drop` proves the promotion and the MMCSS revert restore
  the prior priority on the RTX. Nothing tests the "drop on another thread reverts nothing"
  path. It would be cheap: promote on thread A, send the value to B, drop it there, and assert A is
  still raised.

## Doc accuracy (plans/engine/win-mmcss.md)

- Everything in the before/after table and summary checks out against the logs (see above).
- Line 98: "about 0.1 ms in a 10 ms buffer, far inside `SystemResponsiveness`". This is fine for the
  engine output. The mic input callback does more work (a `Vec`, try-locks) but is still far under.
- Lines 119-124: soften as in F4.
- The claim that 7/8 against 5/8 is an improvement: on 8 runs a side the pass-rate difference alone
  isn't significant (Fisher p is about 0.57). The mean p99 drop (0.975 to 0.688 ms, t about 2.4) is
  the stronger evidence, and it is better cited first. The doc already says "improved, not
  guaranteed", which is fair.
