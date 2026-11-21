# c5b1b: the fixes from c5b1's independent audio review (progress)

Branch `coach-c5b1` (the same worktree as c5b1). Work list: the review (verdict MERGE AFTER
FIXES; M1, L1 to L6, Q8's untested list). The output callback in `engine.rs` is untouched; no
lock, allocation or free was added on the audio thread; the lock order stays acyclic (below).

## What landed, finding by finding

| finding | fix | test (fails without the fix) |
|---|---|---|
| **M1** a Take closing while the input stops kept its audio | `stop_evaluation` calls `heard_input_stops` twice: before the idempotency guard (as before) and again right after `ta.stop()` has joined the analyzer, when no Take can close and no pass can start | `commands::hear_take_tests::the_inputs_stop_empties_the_slot_even_for_a_pass_begun_during_it` (a real pass thread reads the epoch between the two calls and keeps after the join) |
| **L1** the hear-back's slice stayed in the take slot | `HeardTakeSlot::clear(handoff, playing_too)`: takes the hear-back (never a jam's take) out of the take slot and drains `retired`. The input's stop: any hear-back (it ends the Session). `forget_heard_take` and a jam take's start (`start_take`, under the take session's lock): a finished one only, so a played-out bar no longer refuses a jam take. "Finished" is `TakeHandoff::has_ended(generation)` (atomic loads; seen whether or not the event thread has reported it yet) | `take_audio::tests::a_forget_clears_a_finished_hear_back_and_the_inputs_stop_any`, `a_clear_drains_what_the_audio_thread_retired`; `commands::hear_take_tests::the_inputs_stop_takes_a_hear_back_out_of_the_take_slot` |
| **L2** per-span flooring of missed beats | the spans' `(wall - audio)` summed, floored once (one span is the old formula exactly); each Start stamped and the longest Start-to-first-click-buffer time printed (`start to click`, advisory) | probe `tests::missed_beats_are_floored_once_across_the_spans` (two spans 0.6 tick short each: 1, was 0), `the_start_to_click_time_is_the_longest_over_the_starts` |
| **L3** one silent buffer after a cut | nothing to fix (benign, the review agrees); now measured inside `start to click` | |
| **L4** the slice ignored the input's latency | `take_audio::bars_as_heard`: the bars moved by the late grade's `calibration.offset_ms` less the detector's delay, the shift `score::notes::lookups` gives every expected attack; computed on the `yames-take-notes` thread from the grade it already holds (no lock). No grade (the pass failed): the beat map's lines | `take_audio::tests::the_bars_are_moved_by_the_calibrated_input_latency` |
| **L5** recording check and `set_play` not atomic | `hear_take`'s body is `hear_take_in`, which holds the take session's lock across the state check and the hand-over (`start_take` checks `is_playing_back` under the same lock) | `commands::hear_take_tests::hear_take_refuses_while_the_click_runs_and_while_a_jam_take_records` |
| **L6** bar numbers are played bars | a contract note for c5b2 (below) | |
| **Q8** engine-level: first beat and counters after a hear-back's Start | there is no offline harness for the output callback (it is a closure inside the stream thread), so the probe checks it on the real callback: after each Start that cut a hear-back, the first `beat_log` entry must be beat 0, downbeat, subdivision 0, and the first click buffer must open at sample 0. Hard gate (`starts as fresh`) for the click; printed only, not gated, in a song run | probe `tests::the_start_to_click_time_is_the_longest_over_the_starts` (the counter half); the run itself |
| Q8 cosmetic | the assert message "the tap's spare room is kept" now says "was not freed" | |
| (found here) | `--late-pass`'s doc comment had been pushed onto `FAKE_TAKE_BARS` by c5b1's insertion; moved back onto `start_late_pass` | |

## Threads and locks of every Rust hunk

- `commands.rs` `stop_evaluation` (command thread, async, under `EVALUATION_TURN`): engine lock
  (released at once, for the take handoff), then `HeardTakeSlot.take` (forget), then the handoff's
  `retired` and `play` locks (clear), never nested. The second call after the analyzer's join.
- `commands.rs` `forget_heard_take` (command thread): engine (released), then as above.
- `commands.rs` `start_take` (command thread): adds `clear(.., false)` under the take session's
  lock, before `session.start`; take session -> handoff locks, which `session.start` already takes.
- `commands.rs` `hear_take` / `hear_take_in` (command thread): engine (released) -> held Take
  (copy, released) -> take session -> app state -> handoff. Nothing takes the take session while
  holding the app state (checked: `start_take`, `stop_take`, `delete_take`, `play_take`, the quit
  path in `lib.rs`), so no cycle.
- `take.rs` `TakeHandoff::has_ended` (command thread): three atomic loads.
- `take_audio.rs` `HeardTakeSlot::clear` (command thread), `bars_as_heard` (notes thread, pure).
- `timing.rs` (inside c5b1's own hunk in `start_notes_pass`'s spawned closure, the
  `yames-take-notes` thread): the bars passed to `HeardTake::new` go through `bars_as_heard`.
- The probe (main thread of the probe binary): spans, the Start stamps, the first-beat check (the
  beat log's lock, which only the event loop shares, never the callback).

## Open (older than this leg, or a design decision)

- **`play_take` has the same race as L5** (review: "`play_take` has the same race. It needs two
  screens' buttons within microseconds."). Pre-existing; the same fix (hold the take session's lock
  across `set_play`) would do, but it is the jam's command, not this leg's.
- **The callback's own copy after a clear.** A clear takes the slice out of the slot and drains
  what was retired; the callback retires its clone on its NEXT buffer, into `retired`, for the next
  drain. The input's stop drains again after the analyzer's join (tens of ms later), which catches
  it while the output stream runs. After `forget_heard_take` or a jam take's start it waits for the
  next command-side drain (any `set_play`, clear, stop, take start or stop). A parked output stream
  keeps its clone until it wakes. Bounded by one slice (a bar or two); closing it fully needs the
  event thread to drain, which is a design decision (the review's alternative: "have the event
  thread clear a hear-back's generation once its ending has been acknowledged").
- **The probe's quiet-machine runs** (review, "Gate not met") stay with the orchestrator.

## What c5b2 must know

- **L6, bar numbers are played bars** (review: "'Bar N' counts played bars from beat 0 of the run
  (`BeatMap::complete_bars_ms`). For a looping exercise, bar 5 can be the second pass's bar 1. For a
  song range, bar 1 is the first played bar, not the printed bar number."). Ask `hearTake` with
  played-bar indices, as `bar_at_beat` counts them.
- **L4 needs nothing passed in**: the shift is taken from the Take's own late grade on the notes
  thread. A Take whose pass failed keeps unshifted bars.
- `forgetHeardTake()` now also clears a finished hear-back; a playing bar plays out. Still call
  `stopHearTake(generation)` on `take-playback-ended`: it frees the slot at once.
- A finished hear-back no longer refuses a jam take (`start_take` clears it); one still playing
  does, as a jam's own listen-back does.
- `stop_evaluation` now takes the engine's state (Tauri injects it; no frontend change).

## Gates

(filled in below as they run)
