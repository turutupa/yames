# ML track: small guitar models trained on the DGX Spark

Branch `mvp-ml` (from `mvp-detect` 21414fea). State of each item:
`plans/ml/PROGRESS.md`. Research behind it:
`~/projects/.preview/audio-research/REPORT.md` section 4 and M8 to M10.
Board: card #103.

## Rules (owner decisions)

- Training is offline, on this machine. The shipped app never trains.
- Every model ships small (a few MB at most), runs on every platform through
  the pure-Rust runtime (`tract`, `plans/detection/RUNTIME.md` on
  `mvp-detect-runtime`), and costs no more than the post-Take tier allows on a
  mid phone (Basic Pitch today: about 3 s per minute of audio on an A725).
- Every model is measured through the PRODUCTION path (`npm run detect:bench`,
  per technique and capture chain), before and after, fixed seeds.
- Every training file is in a manifest with its licence. Nothing
  non-commercial, nothing "by request". Allowed today: the app's own packs
  (ours), the procedural string model (ours), GuitarSet, Guitar-TECHS, EG-IPT,
  AG-PT-set, Five guitar dataset (all CC BY 4.0).
- Audio, datasets and checkpoints never enter the repo:
  `~/projects/.datasets/yames-synth/`, `~/projects/.models/yames-ml/`. The
  repo gets code, manifests, and exported models under 5 MB.
- LoRA is for the coach LLM (M10, a later leg), not for these models: they are
  trained whole.

## What the bench says is worth training for

Read from `plans/detection/results/fast.md` and `guitarset.md` (baseline,
Basic Pitch in the verifier):

| Weak cell | Today | Whose problem |
|---|---|---|
| "Onset heard" live on phone_mic / phone_agc / laptop_noisy (picked 65 to 70%, sixteenths 0 to 10%, hammer/pull 0 to 29%, slides 0%) | the live DSP detector | M6 (another agent, `onset.rs`). A post-Take model cannot make the live detector hear. **Proposal for the M4/M6 owners:** let the late grade re-match from the note model's onset posterior, so a note the live detector missed but the model confirms counts as heard. That is a grading decision, not taken here. |
| Chord tones confirmed: 57% bench (38% "couldn't tell"), 71 to 80% GuitarSet strummed | note model | **N1, first target** |
| Slid-to notes on phone_mic / laptop_noisy: 25% confirmed | note model | N1 |
| Palm mute on phone: 85 to 88%, 8 to 10% wrongly declined | note model | N1 |
| Harmonics / pull-offs in noise: 81% / 88% | note model | N1 |
| Left-out note caught: 75% (rest "couldn't tell") | note model + rule | N1 (sharper onsets and less ringing-on) |
| Techniques: nothing reports "that was picked, not hammered" | no model | **T1** |

So the note model's job is not "phone audio in general" (Basic Pitch already
confirms 100% of picked notes on every synthetic chain) but chords, slides,
mutes and the mistakes it lets through, without losing anything on real
guitar (GuitarSet solo 95% confirmed, 1% decoys).

## Work items

### A. Data factory (`tools/ml/factory/`)

One format for every source, at 22,050 Hz mono (the model rate):
`<shard>/<item>.flac` + `<item>.json` (notes: start, end, MIDI per frame-step
of pitch curve where it moves, string, technique, velocity, fault; the chain
and its parameters; the source and licence).

1. **Synthetic** from the 16 packs (815 Exercises, 28.7k written notes) plus
   procedural drills for what the packs or the DSL have little of (natural
   harmonics, bend and release, taps, slides, vibrato, strummed chords,
   palm-muted chugs). Renderer: the research's extended Karplus-Strong string
   model (`guitar_synth.py`, ported here and randomised: pick position,
   brightness, decay, inharmonic detune, body filter). It is NOT the bench's
   Rust synth (`detect-bench/synth.rs`), on purpose: the bench stays a test
   the model has not seen sample for sample. The capture chains are the same
   family as the bench's (they are stress conditions), with every parameter
   drawn at random; that makes the bench's per-chain numbers optimistic for a
   trained model, so the real-audio tables decide.
2. **Capture chains** (`chains.py`): DI, high gain, laptop mic, phone mic,
   phone with AGC and limiter, noisy room, reverberant room, Bluetooth-like
   (codec band limit; latency is a label offset, applied in the loader).
3. **Real, CC BY**: GuitarSet (mic and pickup mix; players 00 to 04 train,
   player 05 held out), Guitar-TECHS (DI and amp mic, MIDI labels, lag
   estimated per file; P3 held out). Each also re-recorded through random
   chains.
4. **Owner corpus (card #85), ready to drop in**: `ingest_corpus.py` takes a
   folder of `<take>.di.wav`, `<take>.laptop.wav`, `<take>.phone.wav` and the
   app's `<take>.job.json`, aligns the three by cross-correlation, labels from
   the job (later: confirmed by the verifier on the DI), writes the same
   format with `split: corpus`.
5. Manifest (`manifest.json`: every item, source, licence, seed, hours) and
   stats (`stats.md`: hours and notes per technique, chain, source).

### B. Models (`tools/ml/train/`)

- **N1, note and onset model.** Same contract as Basic Pitch (43,844 samples
  in, 172 x 88 note and onset out), so the verifier, the stitching and the
  runtime do not change.
  - N1a: Basic Pitch itself, fine-tuned whole (16.8k parameters, same cost).
  - N1b: Basic Pitch's front end (the CQT, frozen) with wider note and onset
    heads, up to about 2x its cost. Only if N1a leaves the chord cells weak.
  - Loss: weighted binary cross-entropy on note and onset frames; the
    original model's outputs on clean real audio as a soft anchor
    (distillation), so real-guitar behaviour does not drift.
  - Compare inside the verifier: `detect:bench run --fast`, GuitarSet (player
    05 only, never trained on), Five guitar (DI against phone agreement).
- **T1, technique classifier.** Per onset, 46 ms before to 139 ms after, log
  mel, a CNN of about 100k parameters. Classes: picked, hammer-on, pull-off,
  slide, tap, palm mute, harmonic. Trained on the synthetic set and
  Guitar-TECHS (palm mute, harmonics real; picked real); EG-IPT when its
  download is in. Used as a verifier ("the Exercise says hammer-on; was it
  picked?") with a high threshold; says nothing when unsure.
- **C1, chord/key (M7).** Not in leg 1 unless time is left. Baseline to beat:
  theory on notes, 79 to 82% of beats strummed (research 5.6).

### C. Wiring

`YAMES_NOTE_MODEL=<file.onnx>` makes `detect-bench` load a candidate behind
`NoteModel` (new file `detect/candidate.rs`; `detect/model.rs` is the runtime
agent's and is not edited here). A candidate becomes the default only if it
beats Basic Pitch across chains, with no regression in `detect:check` and no
rise in "a wrong pitch counted right", and loads in `tract`.

### Coach LLM LoRA (M10): readiness

Not started. What exists: the earlier PoC (`~/projects/.preview/lora/`,
Qwen3-4B, rank 16). What it waits for: the evaluation harness for coach
sentences (every number traced to the input record) and templates for the
verifier's new facts. The GPU is shared with dgx-delgado's LLM servers
(about 74 GB in use), so a 4B LoRA run needs a slot agreed with them.

## Reproduce

`tools/ml/reproduce.sh` (venv, factory, training, export, bench). Seeds are in
`tools/ml/config.json`. Environment that worked is recorded in
`plans/ml/PROGRESS.md`.
