# Leg c5b1: "Hear bar N", the engine half: the Take's audio kept in memory, a bar played back (R, audio)

Worktree `/home/dgx-delgado/yames-coach-c5b1`, branch `coach-c5b1`. Logs under `/tmp/coach-c5b1/`.

## Settle before launching (the orchestrator, not the leg)

**Does a Take's audio exist without recording? Partly, and only for a few seconds.** The design (4.2)
says the app "already holds [it] in memory for the pitch pass". The code (read at `494a9053`):

- The tap (`take_audio.rs`) is armed only when the Take's schedule is loaded with written pitches and
  one of: a `noteIdentity` pass bar, the note verifier compiled in and on (`detect::model::enabled()`:
  the `detect-tract` feature, which the betas ship; `default = []` does not), a bend or vibrato in the
  details, diagnostics, or the recording session (`timing.rs` 610-628). The Session sends pitches for
  every note (`session/take.ts` 121), so in a shipping build every Take the input heard is armed.
- It is handed over once at the Take's close to the `yames-take-notes` thread and **freed there as
  soon as the grade is published**: `drop(audio)` at `timing.rs` 3076. Nothing holds it afterwards.
- None at all: input off (ungraded without listening), a MIDI input (`timing.rs` 3212), a pull gap
  (`take_audio.rs` 191), a build without `detect-tract` on an Exercise with no `noteIdentity` bar.

So "yours" can be honest only where the audio was captured, and only if its life is extended. Options:

| | What | Memory | Stored? |
|---|---|---|---|
| **A** (recommended) | The notes thread moves the audio into one "last heard Take" slot instead of dropping it; replaced by the next Take's, dropped when the input stops (`stop_evaluation`) or on `forget_heard_take` | one Take: rate x length x 4 B; 48 kHz x 40 s = 7.7 MB; cap `MAX_SAMPLES` = 24 MB; two for a moment while one replaces the other | No: RAM only, never on disk, never in an event |
| B | A, and also arm the tap on every graded Take of a build without `detect-tract` | A's, on more Takes; the detector thread's `memcpy` on Takes that skip it today | No |
| C | Nothing kept; "yours" only with the recording session on | none | Yes, and recording is a never-tool: the coach may not turn it on, so in practice "demo only" |

Recording is never touched by this leg in any option. This brief is written for **A**.

## What it builds on

c1b1 (the note, `noteFinding`), c1c (the loop's bars), c1b2b (speech through the engine's stream).
Read: `AGENTS.md` "What in the output callback must not be touched" and the probe's four hard numbers;
`plans/coach/progress/c1b2b.md` (speech: how a cut was reviewed three times). Code: `take_audio.rs`
(whole, 373 lines); `timing.rs` 600-665, 2990-3146 (`start_notes_pass`, `capture_job`: how a bar maps to
samples via `diagnostic_job`'s `firstBeatMs`, `bpm`, `beatsPerBar`), 3191-3222; `take.rs` 337-380
(`TakePlayback`), 726-750 (`TakeParking`); `engine.rs` 7090-7150 (the take-playback branch);
`commands.rs` 5427-5463 (`play_take`, `stop_take_playback`), 266 and 311 (`toggle_playback`,
`set_playing`); `ipc.ts` 3141-3165 (`playTake`, `take-playback-ended`). Design, read-only: DESIGN 4.2
"Hear it back", 9.3, 10 (C5's gates).

**The design says "a playback path like the one speech uses (`speech_out.rs`)". A closer one exists:**
the jam's take listen-back, `TakeHandoff::set_play(Some(TakePlayback { pcm, sample_rate }))`. It
resamples on the fly, plays out of the same output pair, retires the buffer through `TakeParking`, and
reports its end by generation. **Use it; add no branch to the output callback.** If you find the
callback needs a change, stop at that point and report: that is a new review, not this leg.

## What to build

1. **The slot.** A `HeardTake` holder (in `take_audio.rs` or a new module beside it) with the
   audio, its rate, `first_ns`, the bar map (first beat in samples, samples per beat, beats per bar,
   count-in) and the Take's `notes_serial`. `start_notes_pass` moves the audio into it after the grade
   is published, instead of `drop(audio)`; the slot it replaces is dropped on that thread. A command
   `forget_heard_take` and the input's stop empty it (freed off the callback, off the detector thread).
   Rust tests: kept after the pass; replaced by the next; emptied by forget and by the input's stop;
   nothing kept on a gap, on MIDI, with no capture.
2. **`hear_take(serial, fromBar, toBar)`** (`commands.rs`, registered in `lib.rs`): refuses unless the
   slot holds that serial (the frontend shows nothing then); slices the bars (Take bars, 1-based, after
   the count-in) with a short margin before and after, copies the slice on the command thread into an
   `Arc<Vec<f32>>`, hands it to `TakeHandoff::set_play`, returns `{ generation, lengthMs }`. Refused
   while a jam take records (as `play_take` is). `stop_hear_take` clears only a playback it started
   (by generation). `heard_take(serial)`: whether it is there and how many bars it holds. Tests for the
   bar arithmetic (count-in, last bar, a bar past the end refused, a short capture).
3. **Start cuts it.** `set_playing(true)` / `toggle_playback` clear a hear-back playback before the
   transport flag rises (the take branch runs before the `is_playing` gate and would silence the
   click). A test on the command path; the jam's own listen-back is left as it is today.
4. **The typed wrappers** in `ipc.ts` (`hearTake`, `stopHearTake`, `heardTake`, `forgetHeardTake`),
   the typed mocks in `src/test/mocks.ts`, the parity manifest regenerated
   (`UPDATE_PARITY_MANIFEST=1`). No caller yet.
5. **A probe mode `--hear-take`** in `bin/click-jitter-probe.rs`: a fake capture in the slot (filled
   before the run), then repeatedly: click for a few seconds, stop, a two-bar hear-back handed in,
   played out or cut by a Start, click again. The four numbers over the whole run; missed beats
   counted over the click's spans only (say how in the progress file).

## Not yours

The chip, its states, the demo of a bar, the input gate during playback, the voice, strings, layout
(c5b2). The recording session, `capture.rs`, the jam's takes, `delete_take`: untouched. Anything that
writes audio to disk. The output callback, `BeatQueue`, `speech_out.rs`.

## Gates

`npm run test:rust` (12G / 30m); `npm run test:dsp`, `npm run test:highbpm`; tsc, vitest, build (the
wrappers). The probe on a quiet machine (load under 6), as pv1 ran it (`plans/coach/tools/probe-night.sh`'s
shape, through the queue with the heavy lock): baseline `--no-llm`; `--hear-take`; `--hear-take
--song-loop --song-take`; and the two standing pairs unchanged (`--jam-swap --jam-move --jam-take`,
`--song-loop --song-take`). Zero allocations, frees and dropped notifications in every run.

## Report

As the rules block's end of the leg: which option was built; the memory a 40 s Take costs measured;
the probe table; a **"Rust diff for review"** paragraph naming every hunk in `take_audio.rs`,
`timing.rs` (the hand-over), `commands.rs` (`hear_take`, `stop_hear_take`, the Start cut), `lib.rs`'s
handler list, `engine.rs` (there should be none), the probe, `ipc.ts`.
