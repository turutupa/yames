# c5b1c: the four LOW findings of c5b1b's audio review

Branch `coach-c5b1c` (from `coach`). Work list: `/tmp/coach-orch/c5b1b-review.md`, L1 to L4,
plus the "starts as fresh" hardening. Nothing in `engine.rs`, the output callback, `BeatQueue`,
the packed word or the stream set-up. No TypeScript.

## Done

- **L1** (`take_audio.rs`, `HeardTakeSlot::clear` / `stop`): the take slot is emptied
  (`clear_play_if(generation)`) BEFORE the claim is dropped (CAS `playing` g → `NO_HEAR`). A Start
  whose `cut` lands between the two finds the claim and an already-empty slot; one landing before
  both clears it itself and the clear's `clear_play_if` misses. `stop` checks the claim with a
  load first and refuses `NO_HEAR`. The bodies are `clear_with` / `stop_with` with a `between`
  seam for the test. `clear_play_if`'s leading `drain_retired()` stays where it is: with the new
  order the slot is empty before the claim goes, so where the drain sits no longer opens a window,
  and moving it after the play lock would not bring the first click any sooner (the Start's thread
  still runs it before `engine.start`).
  Test: `take_audio::tests::a_start_between_a_clears_two_steps_finds_the_take_slot_empty`.
- **L2** (`click-jitter-probe.rs`, `analyse`): missed beats from the sum of each span's POSITIVE
  shortfall, `(span_wall - span_audio).max(0.0)`, floored once. One span: `0.0 + (w-a).max(0)`
  floors to exactly what `(w-a)` floored and clamped did. `wall_s` / `audio_s` are still reported.
  Test: `a_span_ahead_does_not_hide_another_spans_starvation` (the bin's tests).
- **L3** (`take_audio.rs`): a `HearSlice` carries the epoch read under the held Take's lock when it
  was cut; `start` compares it, and records the generation, under the held Take's lock (which every
  `forget` takes to move the epoch). So a forget either came first (refused, the copy freed outside
  the lock) or comes after the claim is recorded and its `clear` takes the bar out. Stricter than
  "compare under the state lock": a check under the state lock alone still let a forget land
  between the check and `set_play`. Test: `a_slice_cut_before_a_forget_is_refused_after_it`.
- **L4** (`commands.rs`, `stop_evaluation`): `HeardInputStopsAgain`, a drop guard made right after
  the first `heard_input_stops`; dropped explicitly where the second call was (after the join), and
  on every other exit (`?`, the idempotency return, a panic). Neither step panics on a poisoned
  lock. Test: `commands::tests::the_inputs_second_stop_runs_on_an_early_return_and_a_panic`.
- **"Starts as fresh"** (the probe's `--hear-take` loop): the beat log is emptied right before each
  Start, so a beat of the span before (a Bluetooth output's latency) cannot be taken for the new
  span's first.

## Lock order left (the review's table, one change)

`hear_take` / `hear_take_in`: engine (r, temporary) → held Take (copy) (r) → take session → state →
**held Take** (epoch check) → `retired` (r) → `play` (`set_play`), then the `playing` store, all
under the held Take's lock. Global order unchanged: EVALUATION_TURN, engine, take session, state,
held Take, `retired` / `play` / `record`. Nothing that holds `retired` or `play` takes the held
Take's lock; `keep` (under `verifier_hold`) and `forget` take only the held Take's. No Start door
takes a new lock: `cut` is still one swap plus `clear_play_if` when a claim is recorded.
`clear` / `stop` take the same locks as before, in a different sequence of the same two steps.

## Gates

(filled in below as they run)

## Owed

- The probe RUNS on a quiet machine (the orchestrator's): `--hear-take` above all.
