# ML track: progress

Plan and rules: `PLAN.md`. Branch `mvp-ml` (has `mvp-detect` df4a4633 merged:
M4 to M6 and the tract runtime). Board: card #103.

## Environment that worked (DGX Spark, GB10, aarch64)

- venv `~/projects/.venvs/ml`, Python 3.12: `torch 2.14.1+cu130` from the
  PyTorch aarch64 CUDA wheels. **CUDA works on the GB10.** Also onnx 1.23,
  onnxruntime 1.32 (CPU), onnx2torch 1.5.15, scipy, soundfile, librosa, mido.
- GPU use of a training run: 0.6 GB (N1a) to 0.9 GB (N1b) at batch 32. The
  loaders are the bottleneck (CPU): one run alone does about 170 steps a
  minute with 7 workers, three at once about 110 each.
- Rust: `export PATH=$HOME/.cargo/bin:$PATH CFLAGS='-std=gnu11 -Wno-implicit-function-declaration' CARGO_TARGET_DIR=$HOME/projects/.target-ml`.

## A. Data factory: done for leg 1

All in `~/projects/.datasets/yames-synth/` (never in the repo), one format
(`tools/ml/factory/store.py`). Manifests and counts: `tools/ml/manifests/`.

| Set | What | Takes | Recordings | Hours | Licence |
|---|---|---|---|---|---|
| `synth-v1` | 801 pack Exercises x 4 variants (tempo rung, style: good, sloppy, omit, wrong, ringing, weak, dead, flat) + 1,500 procedural drills (chords, melody, legato, slides, taps, bends, vibrato, harmonics, arpeggios, palm-muted chugs); each through DI or high gain and two of laptop mic, phone, phone AGC, noisy, reverberant, Bluetooth-like | 4,696 | 14,088 | 73.2 | own |
| `guitarset-v1` | GuitarSet: mic, pickup mix, and (train) one random mic chain over the pickup; players 00 to 04 train/val, **player 05 held out** | 360 | 1,020 | 8.6 | CC BY 4.0 |
| `techs-v1` | Guitar-TECHS: DI and amp mic, MIDI labels aligned per file (pitch-aware lag, piecewise; 0 files dropped); P1, P2 train/val, **P3 held out** | 104 | 208 | 10.0 | CC BY 4.0 |

```sh
PY=~/projects/.venvs/ml/bin/python          # from the repo root
$PY -m tools.ml.factory.render --name synth-v1 --jobs 16     # 2.5 min, seed 20261119
$PY -m tools.ml.factory.real --set guitarset --jobs 6
$PY -m tools.ml.factory.real --set techs --jobs 6
$PY -m tools.ml.scripts.stats synth-v1 guitarset-v1 techs-v1  # manifests + stats.md
$PY -m tools.ml.scripts.check_labels synth-v1 400             # labels against Basic Pitch, per group and chain
```

Known gaps:

- 14 pack Exercises have no `bars` (the newer song-shaped ones) and are
  skipped (56 jobs), and 8 arpeggio drills draw an empty shape (`FAILED`
  lines in `synth-v1.log`). 64 of 4,760 jobs.
- Guitar-TECHS writes a bend as extra notes with no attack: its bend takes
  are left out of training (`train/n1.py::keep`). Only palm mute and
  harmonics are real technique labels there.
- EG-IPT: the download in `~/projects/.datasets/eg-ipt/` is a `.part` (18 of
  24 GB). Not used. AG-PT-set and Five guitar: not ingested (Five guitar is
  kept for evaluation only).
- Owner corpus (card #85): `ingest_corpus.py` is NOT written yet.
- Label timing: Basic Pitch's onset peak sits 0.5 frame before the synthetic
  labels and 0.8 to 0.9 before the real ones (it learnt GuitarSet's
  annotation timing). The loader moves labels by that per set
  (`train/n1.py::SHIFT`) so a trained head keeps the timing the verifier was
  tuned on.

## C. Wiring: done

`YAMES_NOTE_MODEL=<file.nnef.tar>` makes `detect::model::load()` read a
candidate (`src-tauri/src/detect/candidate.rs`; `TractModel::from_nnef`). It
must keep Basic Pitch's contract (input 1 x 43844 x 1, outputs named as the
shipped graph's). No shipped build sets it. Proof of the path: an untrained
N1b (refinement at zero) through `detect:check`: 0 of 1,608 gated metrics
moved.

```sh
tools/ml/scripts/bench_run.sh <run> [tag]        # checkpoint -> ONNX -> NNEF -> fast bench + check + table against .detect-bench/base-bp
tools/ml/scripts/bench_candidate.sh <model.onnx> <tag>
$PY -m tools.ml.scripts.compare .detect-bench/base-bp .detect-bench/<tag> [--rows]
```

Export: `tools/ml/n1.py::export` copies the shipped graph's front end node for
node and appends the trained head (torch export, opset 15, names made plain,
ending in a Reshape as the shipped graph does: tract keeps a Reshape's name
through its clean-up, not a Gather's). `tools/basic-pitch-nnef <onnx> <tar>`
then writes the archive and checks it against the ONNX on tract.

Cost through tract, one thread (`taskset -c N detect-bench cost`, with and
without `YAMES_NOTE_MODEL`), seconds per minute of audio:

| | A725 (phone mid core), model only | whole pass | X925, model only |
|---|---|---|---|
| Basic Pitch (shipped) and N1a (same graph) | 2.67 | 2.91 | 1.20 |
| N1b (50,950 weights, 0.39 MB ONNX) | 4.10 (1.54x) | 4.34 | 2.00 |

So N1b is about 2.2 s for a 30 s Take on a mid phone: inside the 3 to 8 s
post-Take tier, 0.7 s more than today.
