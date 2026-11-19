# Detection roadmap: progress

Branch `mvp-detect`. Plan: `~/projects/.preview/audio-research/REPORT.md`
section 6 (M0 to M10). How every number here is reproduced:
`plans/detection/MEASURE.md`. Tables each milestone was read from:
`plans/detection/results/`.

## Owner decisions in force

The owner confirmed all eight (2026-11-19). Where each one bites:

| # | Decision | Where it lives |
|---|---|---|
| 1 | Offline training of small audio models is allowed; the app never trains | `plans/ROADMAP.md` section 10 (amended); M8 |
| 2 | Basic Pitch may sit in the grading path as a verifier with deterministic thresholds | `src-tauri/src/detect/verifier.rs` (constants at the top) |
| 3 | An unsounded hammer-on is reported, not graded | `score/verify.rs` (`note_states`: only notes the matcher heard reach the right-notes count) |
| 4 | Weak evidence reads "couldn't tell", never "missed", never blocks a pass | `Heard::Unsure`; `note_states` maps it to unpitched |
| 5 | Recordings are the owner's (card #85); the pipeline ingests DI + laptop + phone | `detect-bench run --dir`, sidecars in `MEASURE.md` |
| 6 | Android microphone grading is beta until phone data exists | M4 copy |
| 7 | Free-play key/chord engine in Jam and the coach's report, off by default | M7 |
| 8 | ONNX Runtime through `ort` first, behind a feature and one file | `detect/model.rs`, feature `detect-ort` |

## M2. The bench (done)

**What.** `detect-bench` (`src-tauri/src/bin/detect-bench/`, `npm run
detect:bench`): a Rust port of the research's technique synth and capture
chains, Takes built from the shipped packs' own Exercises, the production
detector, scorer, right-notes pass and verifier run over each, truth compared
note by note, JSON + Markdown out, a baseline check (`npm run detect:check`,
20 to 30 s, 1,112 gated metrics), a replay tool for one recording with an HTML
page, and adapters for public datasets (`tools/detect-bench/`).
`research-detect` is gone: `detect-bench replay` replaces it (it no longer
compiled after M0 anyway).

**Reproduces the research.** The same 705 research Takes
(`~/projects/.datasets/bench_v2`, `run --dir`) through this code:

| Notes played as written, 5 chains pooled | Research: Yames today | Here: live detector | Research: verifier (Python) | Here: verifier (Rust) |
|---|---|---|---|---|
| Picked | 77% | 77% | 100% | 100% |
| Picked sixteenths 160-220 | 60% | 60% | 99% | 100% |
| Palm mute | 80% | 80% | 96% | 96% |
| Hammer-on | 49% | 49% | 100% | 100% |
| Pull-off | 47% | 47% | 93% | 96% |
| Tap | 67% | 67% | 100% | 100% |
| Slid-to | 0% | 0% | 68% | 69% |
| Bend | 91% | 91% | 100% | 100% |
| Sweep | 74% | 74% | 100% | 100% |
| Chord tone | 68% | 68% | 63% | 64% |

Per note, the Rust verifier agrees with the Python prototype on 99.07% of
60,075 notes (`results/research-bench-v2.md`).

**The M0 fix, seen from here.** Right-notes pass on correct sixteenths at 160
to 220 BPM, DI chain: research 8% right pooled (51% called wrong); now 96%
right on DI, 57% pooled (the phone chains do not hear the onsets at all, which
is M6's problem, not the look-up's). `lookup_bias_ms`, the gate for it: 0.4 to
1.3 ms on every chain (it read +25 before M0; taking the delay out twice would
read -25).

**New in the fast bench** beyond the research's kinds: bend with release,
vibrato, natural harmonics; chains `laptop_noisy` and `laptop_reverb`.

## M3. Basic Pitch and the verifier in Rust (done; phone timing not measured)

**What.** `src-tauri/src/detect/`: `model.rs` (Basic Pitch, 225 KiB, compiled
in with `include_bytes!`, run through ONNX Runtime behind `NoteModel` and the
`detect-ort` feature; exact frame-time stitching, so the 10 ms-per-window slip
of the Python package cannot happen), `flux.rs` (the attack envelope),
`verifier.rs` (the rule, plus the "couldn't tell" band the prototype did not
have), `fft.rs`. `score/verify.rs` places a Take's written notes in its audio
and tallies verdicts per technique. It runs on the post-Take thread
(`yames-take-notes`, below normal priority), never on audio.

**Acceptance.**

| Criterion | Result |
|---|---|
| Parity with the Python prototype within 1 point | Yes: table above; pull-offs are 3 points BETTER (96 vs 93) |
| A 30 s Take under 1 s on a laptop | 0.50 s: 0.99 CPU-seconds per minute of audio, one thread, on this box (`detect-bench cost`) |
| Under 4 s on the slowest supported phone | Not measured (no device). Estimate from the research's core ratios: 1.5 s mid-range, 4 to 5 s low-end. Ships as beta (decision 6) |
| Bundle growth under 5 MB | **No.** The model is 225 KiB, but statically linked ONNX Runtime adds about 20 MB to a stripped binary (25.1 MB for a test program that only loads the model). tract measured 19.6 MB for the same program and ran the graph with identical outputs at about the same speed. See "Runtime" below |
| Jitter gates green | see M4 |

**Real guitar** (GuitarSet, 720 recordings, the annotation as the score;
`results/guitarset.md`):

| | Research (Python) | Here |
|---|---|---|
| Solo, real notes confirmed, mic / pickup | 94.5% / 94.6% | 95% / 95% (+2 to 3% "couldn't tell", 2% declined) |
| Wrong-pitch decoy confirmed | 1.0% | 1% |
| Nothing-played decoy confirmed | 0.8 to 1.0% | 0 to 1% |
| Strummed, real notes confirmed | 82.6% to 85.7% | 71 to 80% confirmed, 15 to 21% "couldn't tell", 5 to 9% declined |

The strummed row is lower because this run uses the chord rule (listen after
the strum has crossed the strings) on GuitarSet's strums, which the prototype
did not. Chords stay report-only (M8 is the chord model).

**Mistakes let through** on the research Takes: left-out note confirmed 0 to 1%
(prototype 3%), wrong pitch confirmed 1% (1%), dead chord string confirmed 0%
(0%). Left-out notes caught 75%; the rest are "couldn't tell".

**Runtime (decision 8).** `ort` 2.0.0-rc.15, pinned. Its prebuilt ONNX Runtime
table covers Windows MSVC x64/arm64, macOS arm64, Linux x64/arm64, Android
arm64/x86_64 and iOS. Two things for the owner: (1) there is **no prebuilt for
x86_64 macOS** in that table, so an Intel Mac build needs ONNX Runtime built
from source or the tract fallback; (2) the binary grows about 20 MB. tract
(pure Rust) was tried on the same model: it loads it, gives the same numbers to
four decimals, and costs about the same; it is the fallback if either point
matters, behind the same `NoteModel` trait.
