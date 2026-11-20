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
| `cost [--seconds N]` | the note model's CPU time per minute of audio, the pitch track's time, and when the tracker's grade and the full late grade would land for a Take of N seconds (default 60) | 5 s |

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
or two off), `silent` (nobody plays: the room alone through the chain), `noises` (a correct Take plus a brushed, damped string at -24 dB halfway between notes in every third gap), `dead_string` (a chord's middle string damped), `flat` (every
other bend 50 cents short), `ringing`, `no_vibrato`.

Metric names are `group|chain|kind|metric`; `all` pools a dimension.

| Group | Metric | Meaning | Gate |
|---|---|---|---|
| `good` | `onset_heard` | correct notes the live detector and matcher count as heard | higher |
| `good` | `pitch_right`, `pitch_wrong` | the right-notes pass (pitch tracker alone) on correct notes | wrong: lower |
| `good` | `final_right`, `final_wrong` | what the late grade's `noteIdentity` counts: tracker and verifier merged (`score::verify::merge_states`, M4); only notes the matcher heard | right: higher, wrong: lower |
| `good` | `verifier_yes` | correct notes the verifier confirms | higher |
| `good` | `verifier_no` | correct notes it calls not sounded or wrong | lower |
| `good` | `verifier_unsure` | correct notes it could not tell | info |
| `good` | `onset_scatter_ms`, `verifier_scatter_ms` | robust spread of start times against the truth, lag removed | lower |
| `good` | `lookup_bias_ms`, `cut_bias_ms` | size of the median error of where the right-notes pass reads and cuts, against the true attack | lower |
| `omitted` | `onset_heard`, `verifier_yes` | a left-out note judged present | lower |
| `omitted` | `verifier_caught` | a left-out note called not sounded | higher |
| `wrong` | `pitch_right`, `verifier_yes` | a wrong pitch judged right | lower |
| `wrong` | `verifier_caught` | a wrong pitch called wrong | higher |
| `wrong` | `final_right`, `final_caught` | a wrong pitch counted right / wrong by the late grade | right: lower, caught: higher |
| `dead` | `verifier_yes` | a damped chord string judged sounding | lower |
| `weak` | `onset_heard`, `verifier_yes` | very weak legato | info |
| `takes` | `spurious_per_min` | onsets the live detector emits on no played note (over 50 ms from every true attack, or a second on one attack), per minute, before the matcher (M6) | lower (tolerance 0.5) |
| `takes` | `silent_spurious_per_min`, `noises_spurious_per_min` | the same on the `silent` Take (nobody plays) and the `noises` Take (stray hand noises at -24 dB) | lower |
| `silent` | `onset_heard` | a note counted as heard with nobody playing | lower |
| `takes` | `good_passed` | correct Takes that pass their Exercise's own bars | higher |
| `takes` | `good_not_caught`, `faulty_passed` | "I didn't catch enough" on a correct Take; a Take with scripted mistakes passing | info |
| `bends` | `read` | bent notes heard and given a verdict by `score::curves` | info |
| `bends` | `within_25c`, `abs_err_cents` | good bends: held within 25 cents of what was played; median error | higher; lower (tolerance 3 cents) |
| `bends` | `flat_caught`, `false_flat` | a bend 50 cents flat called flat; a good one called flat | higher; lower |
| `bends` | `released`, `release_called_held` | a bend and release heard coming down (the rest: couldn't tell); called held up when it came down | info; lower |
| `bends` | `vibrato` `found`, `called_absent`, `missing_caught`, `false_present`, `depth_err_cents` | written vibrato played / left out | higher, lower, higher, lower, info |

Every accuracy comes as two numbers: sounded notes confirmed, and mistakes let
through. Quote both.

Tolerance of the check (`eval.rs::tolerance`): a share may get worse by two
points, or by two notes on a small sample, whichever is more; a time by 1 ms.
Costs are reported, not gated: they depend on the machine and its load.

**"A wrong pitch counted right" is a hard gate**: `wrong|*|final_right` (what
the grade counts) and `wrong|*|pitch_right` (the tracker alone). It is the one
mistake that tells a player a wrong note was right. The check gives these the
same two-point tolerance as any share, so a pass of `--check` is not enough
for them: read the two rows in `results/fast.md` after any change to the
right-notes path, treat any rise over the baseline as a failure of the change
whatever the exit code says, and never raise them with `--update-baseline`.

`takes|*|faulty_passed` is noisy per chain: n = 23 Takes a chain in the fast
bench (and `good_passed` n = 15), so one Take is 4 to 7 points and a chain's
number moves by that for no reason at all. Read the pooled row
(`takes|all|...`, n = 161), and remember most scripted mistakes are timing
ones, which is why it is info and not a gate.

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
| **All of the below but the probe** | `npm run test:detect` | `test:rust`, `test:rust:detect`, `test:grading`, `test:pitch`, `test:dsp`, `test:highbpm`, `detect:check`, in that order. Run it for any change to detection or grading |
| Unit tests | `npm run test:rust` | everything in the lib, without the model (includes `score::notes::tests`, the truth-vs-look-up check with the detector's delay in it) |
| The same with the model | `npm run test:rust:detect` | the whole lib with `detect-tract` (the shipped runtime), including the real model on a plucked A |
| Runtime parity | `npm run detect:parity` | tract against ONNX Runtime over the fast bench's posteriors (`RUNTIME.md`); after any change to `detect/model.rs`, the NNEF archive or the tract version |
| Fixture-level grading | `npm run test:grading` | `tests/audio_fixtures.rs`: the scorer on synthetic plucks, **including the M0 production-path tests**; not part of `test:rust` |
| Detector goldens | `npm run test:dsp`, `npm run test:highbpm` | onset detector and Songs scoring, byte for byte |
| Pitch tracker | `npm run test:pitch` | `pitch.rs` fixtures |
| The bench | `npm run detect:check` | this page |
| Audio safety | `npm run yames:jitter-probe -- --no-llm` (+ `--jam-swap --jam-move --jam-take`, `--song-loop --song-take`) | nothing may add jitter to the click |
| Android | `cargo check --lib --target aarch64-linux-android [--features detect-tract]` | that it still builds for a phone (a `cargo build --release --lib` proves it links) |

## Reproducing a player's report: "this Take graded wrong"

1. **Get the Take out of the app.** Settings, Support, "Keep my last Takes for
   troubleshooting" (off by default; see below; the choice is kept in the
   webview's local storage and handed to the engine at start-up,
   `src/settings/takeDiagnostics.ts`). With it on, every graded Take
   leaves two files in the app's data folder under `diagnostics/takes/`:
   `take-<unix ms>-<count>.wav` (the input exactly as the detector got it,
   the raw microphone recording, mono float, device rate: up to 23 MB for a
   120 s Take, 460 MB for the 20) and `take-<unix ms>-<count>.job.json` (what the app was told to expect: the
   schedule, the written pitches and techniques, the pass bars, where every
   click fell in the audio, the instrument). The last 20 are kept. Nothing
   leaves the machine; the player sends the two files themselves.
   Folder: Windows `%APPDATA%\com.yames.app\diagnostics\takes`, macOS
   `~/Library/Application Support/com.yames.app/diagnostics/takes`, Linux
   `~/.local/share/com.yames.app/diagnostics/takes`, Android: the app's files
   directory (pull with `adb`).
2. **Replay it.**
   ```sh
   npm run detect:bench -- replay take-1795616100.job.json --out /tmp/replay
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

A kept Take is written whatever the build. The verifier's verdicts need a
build with the note model: every shipped build has it since the runtime
moved to tract (`--features detect-tract`, `RUNTIME.md`). `YAMES_VERIFIER=0` turns the verifier off
in a build that has it. A Take with MIDI notes in it gets no pass over its
audio at all (`NotesPass::midi_seen`): a MIDI note's time is its attack, a
heard onset's is the detector's delay later, and the pass takes one delay out
of every onset of a Take.

## Privacy

There is no telemetry. Nothing in the detection path writes audio to disk or
sends anything anywhere unless the player turns on "Keep my last Takes", and
that only writes local files. Debug builds have the older `session_audio.rs`
dump; release builds do not.

## Free play: key, chord, inside/outside (M7)

The free-play engine (`src-tauri/src/harmony/`) is measured through the path
the app runs: audio, the note model on rolling windows (`stream.rs`, a window
every 0.55 s), the note decoder (`notes.rs`), the engine (`mod.rs`). No chart
is given, except where a metric says `chart_`.

- `run --fast` adds 21 synthetic recordings (per chain: two strummed
  progressions and one solo, 16 bars each; `run --full`: three of each) and
  about 25 s. They need the note model, so a `--no-model` run has none.
  `--only harmony` runs them alone; `--only harmony_C_I-vi-IV-V_solo` one.
- `npm run detect:bench -- harmony --guitarset ~/projects/.datasets/guitarset [--limit N]`
  runs GuitarSet's microphone recordings (`gs_mic`) and its annotated notes
  through the same engine (`gs_annotation`, a perfect capture layer) against
  its own key and chart. All 360 excerpts: about 10 minutes with `--jobs 6`.

Metrics are `harmony|chain|strummed or solo|metric`:

| Metric | Meaning | Gate |
|---|---|---|
| `chord_root` | beats (of the chart's tempo) whose chord root is right; a beat with no answer counts as wrong | higher (strummed) |
| `chord_answered` | beats given a chord at all; the rest read "couldn't tell" | info |
| `chord_root_when_answered` | root right among the beats answered | higher (strummed) |
| `key_15s`, `key_30s` | the leading key on the standard weighted score (1.0 exact, 0.5 a fifth away, 0.3 relative, 0.2 parallel), whatever its state | higher |
| `key_settled` | recordings where a key settled (the state the app shows a key in) | info |
| `key_settled_right` | settled keys that are the true key, or its relative shown as a pair | higher |
| `key_settle_s` | mean seconds until it settled | info |
| `inside_precision` | notes called inside the key that were played and are inside it | higher |
| `outside_precision` | notes called outside that were played and are outside (small n) | info |
| `notes_not_judged` | notes with no verdict: no key yet | info |
| `chart_outside_precision`, `chart_class_agrees` | solos with the chart as the prior: "outside" calls that are right; decoded notes whose class matches the same rule over the written notes | higher |

A wrong "played" in the precision metrics is a note the decoder made up (a
harmonic, a doubled attack): the player sees it as a note they did not play,
so it counts against the engine.

**The worker beside the click.** `click-jitter-probe --harmony` starts the
app's worker (`harmony::worker::Worker::start`: the shared model, its own
demoted thread) on a ring a feeder thread fills in real time with strummed
chords, and prints `harmony worker  read N s of input ... still listening at
the end`. Build the probe with `--features detect-tract` or there is no
model and the line says the worker ended by itself. Run it alone, with
`--jam-swap --jam-move --jam-take`, and with `--late-pass` (in the probe the
late pass does not take `verifier_hold`, so the two fight for the model: a
harder case than the app's).

## Public datasets (the heavy, local half)

`tools/detect-bench/` holds the adapters. They download into
`~/projects/.datasets/` (or `$YAMES_DATASETS`), never into the repo, and write
the same sidecars the bench reads. Licences and the commands are in
`tools/detect-bench/README.md`.

```sh
~/projects/.venvs/detect/bin/python tools/detect-bench/guitarset.py prepare
npm run detect:bench -- run --dir ~/projects/.datasets/guitarset-bench --out .detect-bench/guitarset
```
