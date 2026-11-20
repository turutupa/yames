# Review M7: free-play harmony worker (df4a4633..141c3fc2, src-tauri/src)

Verdict: **merge after fixes** (B1, S1-S4). The audio path is clean. The input callback only ever `try_lock`s the ring (audio_input.rs:618/706). The worker holds the lock for one copy into a Vec that already has 3 s of capacity, and `read_since` never grows it. The worker does nothing on the output callback. `cargo test --lib harmony` passes: 25/25.

## Blocker (for the feature; it is off by default, so nothing breaks for users who leave it off)
B1 A pause flag that sticks on: worker.rs:90, timing.rs:626/638, src/containers/songs/SongsView.tsx:507-509.
   SongsView calls `pushSchedule` → `load_score_schedule` every time a score is open and not playing, so opening a song is enough.
   Only a finished attempt calls `clear_score_schedule`. Open a song, go to Jam, and turn on "Hear what I play": `TAKE_LOADED` is still
   true, `paused()` holds forever, and the page shows "listening" for the rest of the session. worker.rs:88 says outright that this is accepted.
   Fix: pause on a Take that is actually running (the analyzer active and inside a segment, or a flag set by the take/segment start and
   cleared on segment close or `TimingAnalyzer::stop`), not on "a schedule is loaded". Also clear the schedule when Songs unmounts.

## Should-fix
S1 The 3 s backlog check is defeated once the worker falls more than one ring behind: worker.rs:352-362 and audio_input.rs:165-166.
   `new` is computed modulo the 4 s ring, so a gap of 4.0-7.0 s looks like 0-3 s. The worker reads the newest slice, joins audio across
   the hole without noticing, and keeps going. The engine's sample time and the wall-clock bar marks then drift apart by 4 s at a time.
   When the model is about 1.4x slower than real time (0.8 s per window on a phone), each poll's gap grows from 2.9 s to over 4 s and
   wraps, so the worker never gives up and keeps one core at 100%. The first step also loads the model lazily, inside `with_shared`
   (seconds), which can produce the same gap. The test (worker.rs:599) only writes 3.5 s.
   Fix: keep an `Instant` of the last read and give up when the time since it is ≥ BACKLOG_S, or give the ring a monotonic u64
   write counter. Optionally, call `warm_in_background()` in `harmony_start`.
S2 `start_evaluation` restarts the input without ending the worker: commands.rs:1383, audio_input.rs:418.
   `ai.start` replaces the ring in place (same Arc) at the new device's rate. The worker keeps its old `rate`, so a 44.1→48 kHz change
   resamples wrongly and gives wrong pitches and chords, silently. Fix: `take()` the harmony worker in `start_evaluation`, as
   `stop_evaluation` does and with the same null event, or keep a ring generation or rate check in the worker.
S3 Events after stop: commands.rs:1663-1666 (`stop_evaluation`) and 2139 (`harmony_start`) drop the worker without joining it.
   A window that is already running finishes, then `publish` emits `Some(live)` after the `null` stop_evaluation sent. The page shows
   a stale reading after the input stopped, or the old worker's reading over the new one's. Until that window ends, two workers run
   and contend for the model. Fix: check `alive` inside `publish` before `on_reading`, which makes the race tiny. For a hard
   guarantee, give each worker a generation number that the emit closure checks against a shared atomic.
S4 Start/stop race on a chart change: src/jam/useHeard.ts:73 and commands.rs:2128-2173.
   The cleanup's `harmony_stop` and the new effect's `harmony_start` are concurrent async commands, and only start takes
   EVALUATION_TURN. If start runs first, it drops the old worker without its Summary (the recap loses that stretch). Stop then takes
   the NEW worker and stops it with `alive` already false, so no `null` is sent: the page thinks it is running and nothing reads.
   Fix: `harmony_start` returns an id and `harmony_stop(id)` stops only that worker. Or run stop under EVALUATION_TURN too and
   await it in JS before restarting.

## Nits
N1 useHeard.ts:77 does not depend on `bpm`, and `mark_bar` is only sent with a chart. A tempo change in a jam with no chart keeps the
   beat length from start (worker beat_s), so the beat grid is wrong.
N2 Bar marks are wall-clock time since `t0_ns` (worker.rs:354/367). The engine's time counts samples. Input latency, IPC/JS delay
   and callback buffers turned away by the lock all shift marks against audio. The 30 ms tolerance hides this now; it will drift over a long jam.
N3 Model loading is lazy in the worker's first step (model.rs:205), under the slot lock, so the verifier waits for a load (seconds),
   not "one window" as worker.rs:16 claims.
N4 The probe's `--harmony` combined with `--late-pass` does not exercise the pause: the probe's late pass calls `late_grade`
   directly, without `verifier_hold`. Also, `block` (probe :2133) can reallocate if the feeder falls behind by more than 1 s.
N5 Poisoned locks: `mark_bar` and `stop` swallow them (fine), but `run` returns on a poisoned ring (worker.rs:352) without an
   eprintln explaining why.
N6 `harmony_start` does not check the setting on the backend. Every caller does (useHeard `active` includes `jamHear`, which defaults
   to false), but one line in the doc comment saying "the page is the gate" would help.

## Nits left by df4a4633
D1 onset_flux.rs:252 vs :268: the non-finite skip returns after `mag_pos` has advanced and before `mags[mag_pos] = now`, so a stale
   frame from lag+2 hops ago serves as the rise reference later. Advance `mag_pos` after the check, or write zeros.
D2 A6 (the soft onset's amplitude from the attack hop) is still open. It needs a card or a tracking line.
D3 `forget_recent_attacks` resets `recent_count` but not `last_recent_ns`. That is harmless today; say so, or reset both.
D4 The demo-gate edge (onset.rs) is only seen when the onset thread wakes, and the gate is read with Relaxed ordering. That is fine,
   but a demo shorter than one wake is never forgotten. Note this beside `set_demo_gate`.

Checked and fine: lock order (harmony std mutex → no other lock; EVALUATION_TURN → harmony; the verifier holds only the model slot);
`verifier_hold` is taken before `with_shared` and released even on unwind; a model panic retires the model, is caught at worker.rs:250,
and leads to one `None`; memory is bounded (Engine VecDeques capped, `segs` retained per beat, `marks` ≤ 256, `Stream.raw` drained);
thread priority goes through `coach::lower_current_thread_priority` (Windows, Android and Linux handled per thread);
on app exit the thread is detached, which is harmless.
