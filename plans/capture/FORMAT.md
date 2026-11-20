# Recording session: on-disk format (`yames-capture/1`)

The contract between the app (`src-tauri/src/capture.rs`, writer) and the DGX
ingest (`tools/corpus/ingest.py`, reader). Card #109.

```
<app data dir>/capture/<YYYYMMDD-HHMMSS>/      one recording session
  session.json            what the session was (below); rewritten at start, end, and every 10 Takes
  chirp.wav               the sync chirp exactly as played (mono f32, output rate)
  marks.jsonl             one line a "felt off" press: {"ns": u64, "wallMs": f64}
  take-<unix ms 13>-<n 4>.wav        a Take's input, as the detector got it (mono f32, input rate)
  take-<unix ms 13>-<n 4>.job.json   what it was (below)
  <anything else>.wav|.flac|.mp3|.ogg   a second recorder's file, dropped in by the owner
  second/…                 (same, in a subfolder)
```

Clock: `ns` values are the app's monotonic `clock::now_ns` (same clock as the
onsets and the beat map). `session.json.clock` pairs one `ns` with one wall ms.

## session.json

```jsonc
{
  "format": "yames-capture/1",
  "session": "20261120-033000",
  "startedWallMs": 1795600000000.0, "endedWallMs": null,      // set by the end of the session
  "clock": {"ns": 123456789, "wallMs": 1795600000000.0},
  "app": {"version": "1.2.2", "platform": "windows|macos|linux|android|ios", "arch": "x86_64"},
  "inputRate": 48000, "outputRate": 48000, "outputLatencyUs": 10667,
  "device": { ...from the frontend: input, output, channel, instrument },
  "latency": { ...from the frontend: the latency calibration in use },
  "settings": { ...from the frontend: a snapshot of the app's settings },
  "chirps": [
    {"kind": "start"|"end", "played": true,
     "playNs": 123456789,       // clock ns at which the chirp's FIRST SAMPLE leaves the DAC
                                //   (engine callback entry + output latency, the convention the clicks use)
     "wallMs": 1795600000000.0, "outputLatencyUs": 10667, "rate": 48000,
     "samples": 21600, "f0": 600.0, "f1": 7000.0, "seconds": 0.45, "amp": 0.35, "shape": "log-sweep x2, 0.15 s gap",
     "cut": false}             // true: a coach line replaced it before it finished (its start still holds)
    // "played": false, "error": "…" when there was no output stream or the coach was speaking
  ],
  "takes": 12, "bytes": 123456789,
  "warnBytes": 5368709120, "capBytes": 10737418240, "stoppedAtCap": false
}
```

## take-….job.json

Everything `detect-bench replay` reads (`harness.rs::Job`: audio, bpm,
firstBeatMs, beatsPerBar, quartersMs, instrument, schedule, pitches, details,
passBars) is there as before. A free-play/jam segment has `bpm` and maybe
`quartersMs`, no schedule. Added:

```jsonc
"capture": {
  "session": "20261120-033000",
  "kind": "take" | "jam" | "freeplay",
  "mode": "graded" | "ungraded",
  "context": { "pathId", "stepId", "exerciseId", "variantSeed", "stepKind", "takeNumber", "bpm", "countInBars", ... },
  "rate": 48000, "samples": 1440000,
  "audioStartNs": 123456789,          // clock ns of sample 0
  "audioStartWallMs": 1795600000000.0,
  "firstBeatSample": 96000,           // beat 0 of the schedule (the first played note's bar), in samples
  "countInStartSample": 0,            // first count-in click, in samples (may be negative: before the audio)
  "countInBeats": 4,
  "marks": [123456789],               // "felt off" presses inside the Take's span (ns); ingest also resolves marks.jsonl
  "segment": 0, "last": true, "runId": "…",  // jam/freeplay only: a long jam is cut into segments
                                      //   a little under what the tap holds (110 s at 48 kHz, 52 s at 96 kHz),
                                      //   with a few ms of audio lost at each cut
  "detectionDelayMs": 25.0            // how far the live onset stamps sit behind the attacks
},
"live":  { "grade": TakeGrade, "results": [OnsetResult], "onsets": [{"ms": 812.4, "amp": 0.31, "conf": 0.9}] },
"late":  { "grade": TakeGrade (with .verifier), "results": [OnsetResult] } | null,
"heard": { ...jam/freeplay: the key/chord reading (HeardSummary), last segment only } | absent
```

`onsets[].ms` and every other time here is milliseconds from sample 0 of the wav.

Notes:
- `countInStartSample` assumes `firstBeatMs` is beat 0 and the count-in is
  `countInBars × beatsPerBar` quarters before it, at `bpm`. Unverified on a real
  Take (the beat map may or may not log the count-in's clicks); the labels do
  not depend on it (they come from `quartersMs` / `firstBeatMs`, as in replay).
- A Take with no written pitches (a rhythm Take) is kept too: `late` is null.
- Takes are kept from Session Takes (graded or "Just play"), the Session's
  jam steps and finishers, and the Jam screen. Songs passes are not.
- The store's item `chain` is `{"kind": "real_app"|"real_phone"|…, "name": …}`
  (the ML loader reads `chain["kind"]`).
