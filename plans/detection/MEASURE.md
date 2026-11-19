# Measuring detection

Everything Yames claims about hearing a guitar is a number somebody can
re-measure. This is how. If a number in `PROGRESS.md`, `HANDOFF.md` or
`plans/revamp/GRADING_LIMITS.md` cannot be reproduced with a command on this
page, the number is wrong or this page is; fix one of them.

One rule above the rest: **measure through the production path.** The bench
drives the shipped `OnsetCore`, `ScheduleRun`, right-notes pass and verifier,
wired the way `timing.rs` wires them (`src-tauri/src/bin/detect-bench/harness.rs`).
`GRADING_LIMITS.md` once measured note identity through a test helper that
did not have the detector's 25 ms delay in it, and reported "right to 200 BPM"
while the app failed correct sixteenths at 160.

## The one entry point

```sh
export PATH="$HOME/.nvm/versions/node/v20.15.1/bin:$HOME/.cargo/bin:$PATH"
npm run detect:bench -- <command>     # builds release, with the note model
```

| Command | What it does | Time here |
|---|---|---|
| `run --fast` | 329 synthetic Takes: one Exercise per technique, every chain | 20 to 30 s |
| `run --fast --check` (= `npm run detect:check`) | the same, and fails if a gated metric got worse than `plans/detection/baselines/fast.json` | 20 to 30 s |
| `run --full` | every Exercise of the selection, longer Takes | a few minutes |
| `run --dir <folder>` | recordings with sidecars: public datasets, the owner's corpus | by size |
| `replay <wav>` | one recording: JSON and a page to look at | seconds |
| `render <dir>` | write the synthetic Takes out as WAV + sidecars | |
| `cost` | the note model's CPU time per minute of audio | 5 s |

Useful flags for `run`: `--chains di,phone_mic`, `--only <substring of the
Take's name>`, `--out <dir>` (default `.detect-bench/<mode>/`, not tracked),
`--notes` (also write `notes.jsonl`, one line per written note per Take: the
truth and every system's answer), `--jobs N`, `--no-model` (skip the verifier),
`--update-baseline`, `--baseline <file>`.

Output of a run:

- `results.json`: `about`, `metrics` (name to `{value, n, better}`), `takes`
  (one row per Take: verdicts, counts, cost).
- `results.md`: the tables. `plans/detection/results/` keeps the copy that
  each milestone's numbers in `PROGRESS.md` were read from.
- `notes.jsonl` with `--notes`.

The run is deterministic: fixed seeds, a fixed poll pattern for the detector,
one inference thread. Two runs on one machine give identical `metrics` (checked
with `--jobs 8` against `--jobs 3`).

## What is measured

Techniques (the `kind` of a note): picked, picked sixteenths at 160 to 220 BPM,
palm mute, hammer-on, pull-off, tap, slid-to note, bend, bend with release,
vibrato, natural harmonic, sweep, chord tone. The Exercises are the shipped
packs' own (`src/paths/packs/*.json`, i.e. the tab DSL compiled), picked by
`cases.rs::SELECT`; harmonics, bend-and-release and the speed drills are
written in `cases.rs` because the DSL cannot write them yet.

Capture chains (`synth.rs::capture`): `di`, `di_gain` (high gain), `laptop_mic`
(quiet room), `phone_mic` (band-limited, livelier room, noisier), `phone_agc`
(the same with automatic gain and a limiter), `laptop_noisy` (one factor:
noise 26 dB under the peak), `laptop_reverb` (one factor: 0.7 s room, direct
equal to reverb). They are stress conditions, not measurements of a device.

Playing styles: `good`, `sloppy` (25 ms scatter), `weak` (legato at a tenth of
a pick), `omit` (every sixth note left out), `wrong` (every fifth a semitone
or two off), `dead_string` (a chord's middle string damped), `flat` (every
other bend 50 cents short), `ringing`, `no_vibrato`.

Metric names are `group|chain|kind|metric`; `all` pools a dimension.

| Group | Metric | Meaning | Gate |
|---|---|---|---|
| `good` | `onset_heard` | correct notes the live detector and matcher count as heard | higher |
| `good` | `pitch_right`, `pitch_wrong` | the right-notes pass on correct notes | wrong: lower |
| `good` | `verifier_yes` | correct notes the verifier confirms | higher |
| `good` | `verifier_no` | correct notes it calls not sounded or wrong | lower |
| `good` | `verifier_unsure` | correct notes it could not tell | info |
| `good` | `onset_scatter_ms`, `verifier_scatter_ms` | robust spread of start times against the truth, lag removed | lower |
| `good` | `lookup_bias_ms`, `cut_bias_ms` | size of the median error of where the right-notes pass reads and cuts, against the true attack | lower |
| `omitted` | `onset_heard`, `verifier_yes` | a left-out note judged present | lower |
| `omitted` | `verifier_caught` | a left-out note called not sounded | higher |
| `wrong` | `pitch_right`, `verifier_yes` | a wrong pitch judged right | lower |
| `wrong` | `verifier_caught` | a wrong pitch called wrong | higher |
| `dead` | `verifier_yes` | a damped chord string judged sounding | lower |
| `weak` | `onset_heard`, `verifier_yes` | very weak legato | info |
| `takes` | `good_passed` | correct Takes that pass their Exercise's own bars | higher |
| `takes` | `good_not_caught`, `faulty_passed` | "I didn't catch enough" on a correct Take; a Take with scripted mistakes passing | info |
| `bends` | see `PROGRESS.md` M5 | bend amount error, flat bends caught, false flags | |

Every accuracy comes as two numbers: sounded notes confirmed, and mistakes let
through. Quote both.

Tolerance of the check (`eval.rs::tolerance`): a share may get worse by two
points, or by two notes on a small sample, whichever is more; a time by 1 ms.
Costs are reported, not gated: they depend on the machine and its load.

`lookup_bias_ms` is the gate for the M0 bug and for its opposite. The synthetic
audio has no latency in it, so the time the right-notes pass reads a note from
(`ScheduleRun::pitch_lookups_ms`, the same code `notes::identify` runs) must sit
on the true attack. Leave the detector's delay in and it reads +25 ms; take it
out twice and it reads -25 ms; either fails the check whatever the pitch
verdicts happen to do. It reads about 1 ms today.

## Baselines

`plans/detection/baselines/fast.json` (with the note model) and
`fast-no-model.json` (`--no-model`, for a machine that cannot fetch ONNX
Runtime). One metric a line, so `git diff` on a baseline is the list of what
moved.

```sh
npm run detect:check                                  # the gate
npm run detect:bench -- run --fast --update-baseline  # after a change you can explain
npm run detect:bench -- run --fast --no-model --update-baseline
```

Update a baseline in the same commit as the change that moved it, and say in
the commit message which metrics moved and why. An improvement is not a
failure, but it is a reason to update: the check prints `better` lines.

## The other gates around detection

| Gate | Command | Covers |
|---|---|---|
| Unit tests | `npm run test:rust` | everything in the lib, without the model |
| The same with the model | `npm run test:rust:detect` | `detect::*`, including the real model on a plucked A |
| Fixture-level grading | `npm run test:grading` | `tests/audio_fixtures.rs`: the scorer on synthetic plucks, **including the M0 production-path tests**; not part of `test:rust` |
| Detector goldens | `npm run test:dsp`, `npm run test:highbpm` | onset detector and Songs scoring, byte for byte |
| Pitch tracker | `npm run test:pitch` | `pitch.rs` fixtures |
| The bench | `npm run detect:check` | this page |
| Audio safety | `npm run yames:jitter-probe -- --no-llm` (+ `--jam-swap --jam-move --jam-take`, `--song-loop --song-take`) | nothing may add jitter to the click |
| Android | `cargo check --lib --target aarch64-linux-android [--features detect-ort]` | that it still builds for a phone |

## Reproducing a player's report: "this Take graded wrong"

1. **Get the Take out of the app.** Settings, Advanced, "Keep my last Takes for
   troubleshooting" (off by default; see below). With it on, every graded Take
   leaves two files in the app's data folder under `diagnostics/takes/`:
   `take-<time>.wav` (the input exactly as the detector got it, mono, device
   rate) and `take-<time>.job.json` (what the app was told to expect: the
   schedule, the written pitches and techniques, the pass bars, where every
   click fell in the audio, the instrument). The last 20 are kept. Nothing
   leaves the machine; the player sends the two files themselves.
   Folder: Windows `%APPDATA%\com.yames.app\diagnostics\takes`, macOS
   `~/Library/Application Support/com.yames.app/diagnostics/takes`, Linux
   `~/.local/share/com.yames.app/diagnostics/takes`, Android: the app's files
   directory (pull with `adb`).
2. **Replay it.**
   ```sh
   npm run detect:bench -- replay take-20261119-141500.job.json --out /tmp/replay
   ```
   Prints the grade the production path gives it now, and writes
   `<name>.replay.json` (onsets, grade, per-note verdicts of the matcher, the
   right-notes pass and the verifier, the pitch track, the model's posteriors,
   costs) and `<name>.replay.html`: waveform with the attack envelope and the
   detector's onsets, spectrogram, and a piano roll with the model's output,
   every written note outlined in its verdict's colour, the pitch track, and
   the pitch heard instead where one was. Hover a note for its numbers.
   `node scripts/detect-replay-png.mjs <name>.replay.html` makes a PNG of it.
3. **A bare WAV works too** (`replay recording.wav`): onsets, pitch track and
   posteriors, no verdicts. Give it a sidecar to get verdicts: the smallest is
   `{"bpm": 100, "firstBeatMs": 2000, "schedule": {...}, "pitches": [...]}`
   (fields in `harness.rs::Job`; `render` writes hundreds of examples).
4. **Turn it into a regression.** Put the WAV and a `*.truth.json` beside it in
   a folder outside the repo (never commit audio), run
   `npm run detect:bench -- run --dir <folder>`, fix, re-run. If the case is
   one the synth can produce, add it to `cases.rs` so the fast check carries it.

## Privacy

There is no telemetry. Nothing in the detection path writes audio to disk or
sends anything anywhere unless the player turns on "Keep my last Takes", and
that only writes local files. Debug builds have the older `session_audio.rs`
dump; release builds do not.

## Public datasets (the heavy, local half)

`tools/detect-bench/` holds the adapters. They download into
`~/projects/.datasets/` (or `$YAMES_DATASETS`), never into the repo, and write
the same sidecars the bench reads. Licences and the commands are in
`tools/detect-bench/README.md`.

```sh
~/projects/.venvs/detect/bin/python tools/detect-bench/guitarset.py prepare
npm run detect:bench -- run --dir ~/projects/.datasets/guitarset-bench --out .detect-bench/guitarset
```
