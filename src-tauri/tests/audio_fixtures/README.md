# Audio fixtures

`tests/audio_fixtures.rs` runs audio through the shipped onset detector
(`onset::OnsetCore`, fed through the real `RingBuffer` the way the detector's
thread is) and the shipped scorer (`score::ScheduleRun`), and compares the
`TakeGrade` that comes out with what was really played.

- `signals.rs` builds the synthetic takes: Karplus-Strong plucks from
  `tests/pitch_fixtures/synth.rs`, shaped into clean, ringing, damped,
  high-gain and swept tones, over a DI, room-mic or noisy floor.
- `recordings/` is where real guitar goes. It is empty: **nothing in this
  suite has met a real guitar yet.**

```sh
npm run test:grading                 # the gates
npm run test:grading -- -- --nocapture  # with one report line per take
npm run test:grading:measure         # the limit tables (release, slow)
```

## Adding a recording

Drop two files into `recordings/`:

1. `name.wav` (or anything `kit.rs` decodes): mono or stereo (two channels
   are averaged, as `pitch::decode_mono_file` does), any rate, any bit depth. Record the guitar alone, dry if you can: a DI track,
   or the mic track without the click in it.
2. `name.json`, the sidecar, written **before** listening to what the suite
   makes of the take:

```json
{
  "description": "DI, bridge pickup, high gain, 16ths at 120",
  "firstBeatMs": 2000.0,
  "bpm": 120,
  "beatsPerBar": 4,
  "sixteenths": 128,
  "playedMs": [2003.1, 2128.4],
  "expect": { "minHeardRatio": 0.95, "maxExtra": 2, "evennessTolerance": 0.05 }
}
```

- `firstBeatMs`: where beat 0 of the exercise is in the file. The count-in
  before it is ignored, as it is in the app.
- Say what was played with either `sixteenths` (that many straight
  sixteenths) or `schedule` (a `ScoreSchedule` exactly as
  `src/songs/schedule.ts` writes it, so an Exercise from `src/paths/packs`
  works).
- `playedMs` is optional ground truth: when each note really sounded, from
  hand labels or a DAW's transient markers. Without it the run prints its
  report but cannot check evenness against a reference.
- `expect` is the bar the recording must meet. Use
  `"verdictDidntCatchEnough": true` for a take that should be refused (for
  example a mic in a loud room).

`every_recording_meets_the_bars_it_set` runs every sidecar in the folder.
The WAV is taken to be on its own clock with no system lag; the lag of a real
rig is the live path's problem, and `score::CalibrationPolicy` deals with it
there.

What has been measured on synthetic audio, and what has not been shown at
all, is in `plans/revamp/GRADING_LIMITS.md`.
