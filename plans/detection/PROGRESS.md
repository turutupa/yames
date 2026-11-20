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

## M4. Grade from the verifier (part 1: the right-notes count; done)

**What.** `noteIdentity` now takes its verdicts from two witnesses, the pitch
tracker and the verifier, merged by `score::verify::merge_states` (a note is
right when the verifier confirmed it or the tracker heard it right and nobody
heard it wrong; wrong only when the verifier named another pitch and the
tracker did not disagree; anything weaker is "couldn't tell", which counts
neither way: decision 4). With the verifier in it, the tracker's give-up rules
(too fast, notes ring, octave unsure) stop applying; the minimum count still
does. `pass.notes.source` says `"verifier"` on such a grade, and is absent on a
tracker-only one, so old grades serialize as they did. Only notes the matcher
heard are counted, as before: a missed note is `notesHeard`'s.

Also in this change:

- The late pass runs whenever pitches are loaded and the build has the model
  (`ScheduleRun::wants_verifier`), not only on Exercises with a `noteIdentity`
  bar; the model is loaded once per process (`detect::model::with_shared`),
  `YAMES_VERIFIER=0` turns it off.
- The app sends each note's length, bend, string and techniques
  (`take.ts` `details`, `loadScoreSchedule`) so the verifier listens per
  technique.
- **Reported, not graded (decision 3):** the result's checks list carries one
  line for hammer-ons, pull-offs and taps, "N of M sounded[, K didn't].
  Reported, not graded." (`OtherChecks`, `takeMeasures.ts` `legatoOf`), 15
  locales. "Couldn't tell" is in M but never in K.
- **Repro of real Takes:** "Keep my last Takes for troubleshooting" in
  Settings, Support (off by default, local only, last 20;
  `take_diagnostics.rs`, `src/settings/takeDiagnostics.ts`); the sidecar is
  `detect-bench replay`'s `Job` with the real quarter times
  (`ScheduleRun::diagnostic_job`).
- **M0 review nits:** `score::notes::tests::every_look_up_and_cut_lands_on_the_true_attack`
  (lib, so in `test:rust`) fails at -25 ms (delay taken out twice) and at +25
  ms (not at all); both mutations were run and failed it. MIDI onsets: a Take
  with a MIDI note in it gets no pass over its audio (`NotesPass::midi_seen`,
  test `a_take_with_midi_notes_in_it_is_not_read_from_the_audio`), and the
  doc on `TakeAudio::detection_delay_ms` says so. `npm run test:detect` runs
  every production-path gate including `test:grading`.
- **Card #90:** the three `audio_fixtures` tests assumed
  `even-eighths.open-string` was two bars with no `noteIdentity` bar; the
  content pass made it four bars with one. They now build a Take of exactly
  the bars they mean and judge timing bars only (`timing_take`).
  `test:grading`: 29 passed, 0 failed.

**Before / after, fast bench, production path, 7 chains pooled**
(`results/fast.md`; before = the tracker alone, `pitch_*`; after = the grade,
`final_*`). Correct notes:

| Kind | Counted right, before | after | Counted WRONG, before | after |
|---|---|---|---|---|
| Picked | 78.7% | 87.0% | 5.5% | 0% |
| Picked sixteenths 160-220 | 60.2% | 71.8% | 3.7% | 0% |
| Palm mute | 94.3% | 93.9% | 0% | 0% |
| Hammer-on | 27.4% | 36.3% | 8.9% | 0% |
| Pull-off | 41.7% | 50.6% | 5.4% | 0% |
| Tap | 26.8% | 72.3% | 42.9% | 0% |
| Bend | 0% | 92.1% | 88.9% | 0% |
| Bend and release | 8.9% | 85.7% | 62.5% | 0% |
| Vibrato (n=7) | 71.4% | 85.7% | 0% | 0% |
| Harmonic | 47.3% | 80.4% | 0% | 0% |
| Sweep | 70.5% | 96.0% | 16.5% | 0% |

"Counted right, after" equals `onset_heard` in every row: the right-notes
count is now capped by what the live detector hears, not by the pitch pass
(hammer-ons 36%, pull-offs 51%: M6's problem, and why the verifier's own
account, 98 to 100% confirmed, is what the legato line reports).

Mistakes let through: a wrong pitch counted right 0.3% -> 0% (n=798); a wrong
pitch counted wrong 66.0% -> 75.4% (DI 97.4% -> 98.2%; phone_mic 30.7%, the
rest not counted either way). Takes: correct Takes passing their bars 54.3% ->
59.0% (n=105; DI 80.0 -> 86.7%), Takes with scripted mistakes passing 14.9% ->
12.4% (n=161; info: most scripted mistakes are timing ones). Without the model
(`--no-model`) every metric is unchanged, byte for byte
(`baselines/fast-no-model.json`).

**Against M4's acceptance** (which is on the recorded corpus, #85, not yet
recorded): on the synthetic bench, sounded picked / hammered / tapped notes
confirmed by the verifier 100% / 100% / 100% (DI) and 100% / 100% / 100%
(phone chain) of all correct notes (n = 271 / 24 / 16 per chain); scripted wrong or left-out
notes accepted 0% / 0.1% (target at most 2%); correct Takes failed by the
verifier: none (no correct note is counted wrong). Pass bars stay as they are
("report first").

**Not done here:** shipped builds do not have the model (`release.yml` builds
without `detect-ort`), so in the app all of this waits for that switch, which
is the owner's (bundle +20 MB; no prebuilt ONNX Runtime for Intel macOS).

## M5. Bends and vibrato as curves (done on the bench; reported, not graded)

**What.** `src-tauri/src/score/curves.rs`: for every bent or vibrato single
note the matcher heard, the shipped pitch track's frames (`pitch::track`,
octave errors folded back) between attack + 30 ms and the next attack - 30 ms,
read as start / peak / hold / end in cents against the fretted pitch, and a
wobble (linear trend removed; depth = half the 10-90 spread, rate from
crossings). Verdicts, thresholds at the top of the file: bend on pitch within
25 cents, flat below, sharp more than 35 over; released when it ends within 50
cents of the fret; vibrato present at >= 12 cents and 3-10 Hz, absent under 8.
Fewer than 10 voiced frames, or a release whose quiet tail the tracker loses
(under 75% of the note followed), is "couldn't tell", never a fault. Shapes:
up (median of the note's second half), release (median near the peak),
pre-bend (the start). On the late grade as `grade.curves`
(`ScheduleRun::report_late`), so the bench and the app read the same thing;
the late pass now also runs for a Take with bends or vibrato in it
(`wants_curves`). Result: one reported line each for bends and vibrato in the
checks list (15 locales). DSL: `b2r` (bend and release) and `B2` (pre-bend) ->
`PathNote.bendShape` -> `details.bendShape` (alphaTex `b (0 q 0)` /
`b (q q 0)`). No pack uses them yet (content is `mvp-paths3`'s).

**Numbers** (fast bench, 7 chains, `results/fast.md` "Bends and vibrato"):

| | Bend | Bend and release | M5 acceptance |
|---|---|---|---|
| Good bends within 25 cents | 100% (n=58) | 97.9% (n=47) | >= 90% |
| Median error | 1.8 cents | 1.0 cents | |
| 50-cent-flat bend called flat | 100% (n=33) | 100% (n=25) | >= 80% |
| Good bend called flat | 0% | 2.1% (1 of 47, laptop_noisy) | < 5% |
| Release heard coming down / called held | | 61.7% / 0% (the rest couldn't tell: phone_mic and laptop_noisy lose the quiet tail) | |
| Bends read at all | 92.6% (phone_agc 48%: the matcher misses them, M6) | 86.6% | |

Vibrato (n small in the fast bench): written vibrato found 100% (n=13),
called absent 0%; left out and called absent 83% (5 of 6), called present 0%.
Before M5 none of this was measured: the right-notes pass called 88.9% of
correct bends wrong (M4 table). The acceptance is on the recorded corpus
(#85); these are synthetic. All 1,464 earlier metrics unchanged; 129 `bends|*`
added to both baselines.

**Audio safety.** New background compute is one more pitch track per Take on
the post-Take thread. `click-jitter-probe --late-pass` (new) loops
`timing::late_grade` (verifier + right notes + curves, exactly the
`yames-take-notes` body, now one public function) on a demoted thread under
the click. **Not run yet**: the box was at load 10-11 every time.

## Review of M2-M5: fixes (2026-11-19)

An independent review of `21414fea`; items 3 and 9 (model loading, Cargo
features) are another worker's. Commits on `mvp-detect`:

| Item | Commit | What changed |
|---|---|---|
| 1 | `13c3cf6a` | **A long Take lost its late grade.** The post-Take pass on a 120 s Take could outlast the 5 s the result waits (`NOTES_WAIT_MS`), and the whole grade was dropped. Now the thread makes the grade from the pitch tracker alone first (right notes and curves) and publishes it as `NotesSlot::provisional`; the model's look and the merged grade replace it when they land. `get_take_grade_with_notes` hands the provisional grade over when its wait runs out (`timing::wait_for_late_grade`), so the frontend still asks once. A pass that has already spent `LATE_BUDGET_MS` (5 s) on the tracker does not start the model. `timing::late_grade_staged`; `late_grade` (the probe's) is it with no stop |
| 2 | `13c3cf6a` | The grade is in the slot before the Take is written for troubleshooting |
| 4 | `cc81f392` | Verifier: the written pitch at exactly +-12 semitones is Unsure ("couldn't tell"), not Wrong |
| 5 | `13c3cf6a` | `pass.notes.source` is `verifier` (tracker's too-fast / notes-ring / octave rules set aside) only when the verifier said right or wrong of at least half the notes counted (`verify::late_source`) |
| 6 | `c86dc925` | Kept Takes: `.tmp` then rename, names `take-<unix ms>-<count>` (two in one second no longer overwrite), size doc corrected (up to 23 MB a Take, 460 MB for 20), Settings hint says it keeps the raw microphone recording (15 locales) |
| 7 | `55a072f0` | `withRightNotes` keeps `curves` and `verifier` of a late grade with no `pass` (an Exercise with no pass bars); vitest |
| 8 | `13c3cf6a` | One `pitch::track` per Take: right notes and curves share it (`score::notes::LateScratch`) |
| 10 | `8a9a6892` | `midi_seen` is cleared at the Take's first downbeat, not only at load |
| 11 | this commit | `MEASURE.md`: "a wrong pitch counted right" is a hard gate; `faulty_passed` per chain is noisy; the gated-metric count above corrected to 1,562 |

**Item 1, timings** (`npm run detect:bench -- cost --seconds N`, release,
onnxruntime, one thread; the box was at load 10 to 60 throughout, so these
are ranges over 5 runs, not a quiet-machine number; the model's own CPU time
is the steadier column):

| Audio | Tracker's grade in (pitch track) | Model, wall | Model, CPU | Full grade in |
|---|---|---|---|---|
| 30 s | 0.08 to 0.19 s | 0.6 to 2.6 s | 0.6 to 1.3 s | 0.7 to 2.7 s |
| 60 s | 0.22 to 0.49 s | 2.0 to 3.8 s | 1.6 to 2.5 s | 2.2 to 4.2 s |
| 120 s | 0.36 to 0.71 s | 2.4 to 5.7 s | 2.2 to 3.2 s | 2.8 to 6.0 s |

So on this desktop-class box the full grade for a 120 s Take lands on either
side of the 5 s wait depending on load, and the tracker's grade is always in
well inside it. Before the fix the same Take needed the model plus two pitch
tracks before anything was published. No phone was measured.

**Bench.** `detect:check` after all of it: 343 Takes, 1,562 gated metrics,
0 worse, 0 better, 0 missing; no baseline line was edited. Items 4 and 5
move nothing on the synthetic bench (no scripted mistake is an octave out,
and the verifier decides nearly every counted note there); item 8 is
byte-identical by construction (same track, made once).

**Not covered by a test:** item 10's clear sits in the analyzer loop and has
no unit test; the budget stop is exercised only through `late_grade_staged`'s
callback, not against a slow machine. The click-jitter probe (`--late-pass`)
is still not run (load): the pass does the same work as before, less one
pitch track, in a different order.

## M6. Live detector: noise, reverb, automatic gain, legato (done on the bench; probe owed)

**What was wrong, measured before anything was changed** (each a bench run
with one thing switched, no note model; `onset_heard`, 7 chains pooled):

| Experiment | picked | 16ths | hammer | pull | chord | what it says |
|---|---|---|---|---|---|---|
| as shipped | 87% | 72% | 36% | 51% | 79% | |
| level gate off | 95% | 86% | 39% | 56% | 93% | the RMS gate is the whole loss on `di_gain` (picked 78 -> 100, chords 50 -> 100) and most of it on `phone_agc` (16ths 0 -> 99) |
| gate off, aubio threshold 0.15 -> 0.06 | 99% | 94% | 51% | 71% | 100% | the rest of `phone_mic` is aubio's own peak picker (16ths 11 -> 61); but a brushed string at -24 dB is now heard on DI (0 -> 11.8/min) |
| gate off, aubio `specflux` | 99% | 100% | 64% | 86% | 100% | hears everything, including every note-off: 14.5 spurious/min on clean DI, 47/min on the stray-noise Take |

So no setting of aubio wins: the complex-domain function is exact and deaf,
the flux one hears and cannot tell a note from its ending. aubio's threshold
and method are unchanged.

**What was built.** aubio stays the first detector, with its timestamps.
Beside it, on the same hops, a second one (`src-tauri/src/onset_flux.rs`,
`FluxDetector`):

- the spectrum (1024 points at 44.1/48 kHz, 2048 at 96 kHz: the window is in
  seconds) folded into quarter-octave bands, 80 Hz to 8 kHz;
- per band, the log of the rise against the larger of the frames two and
  three hops back, above a floor that is the larger of twice the band's own
  background (a minimum that doubles in two seconds) and 5% of the loudest
  the input has been lately (5 s half-life). Every term is a ratio: gain,
  automatic or not, moves nothing (`the_gain_of_the_input_changes_nothing`);
- a peak of the summed rise is an attack when it clears the median of its
  last 100 ms by 3 mean deviations + 1.0, and is at least a quarter of the
  median of the player's last 8 attacks (a stray sound is small beside the
  playing). Before 3 attacks have been heard there is nothing to be small
  beside, so the input as a whole must rise 1.6x across the peak: a room's
  noise moves band by band, not as a whole;
- the peak is placed between hops by a parabola and put on aubio's clock
  (attack + aubio's delay), so no calibration, lag or deadline moves.

In `OnsetCore::analyse_hop`: aubio's onset wins when both hear an attack
(within 16 ms); an attack only the second detector heard waits one hop past
its own timestamp and then goes through the same refractory gate and chord
cluster (`admit`). The level gate stays, but an aubio onset it refuses is let
through when the second detector saw the spectrum rise (`VOUCHED_RISE`): that
is the `di_gain` and automatic-gain fix. aubio's phantom onset on the first
window of a start (zeros to room) is dropped (`warmup_hops`): it was one
spurious onset at the top of every microphone Take.

Sweeps behind the constants (pooled picked / 16ths / hammer / pull heard,
spurious a minute on `laptop_noisy`): salience 0.25 -> 0.35 loses hammer
83 -> 66 for 7.4 -> 5.0; floor 3% -> 5% of the peak and half-life 2 -> 5 s
gave 4.9 at hammer 82; threshold 3 -> 5 deviations loses 16ths 98 -> 88.

**New in the bench** (so the cost side is measured too):
`takes|chain|all|spurious_per_min` (detector onsets on no played note: over
50 ms from every true attack, or a second on one attack; before the matcher),
style `silent` (nobody plays: `silent|...|onset_heard`,
`silent_spurious_per_min`) and style `noises` (a correct Take with a brushed
damped string at -24 dB between notes: `noises_spurious_per_min`). All gated,
lower is better.

**Numbers** (`npm run detect:bench -- run --fast --no-model`, 343 Takes;
"before" is the same bench on the old detector):

**Notes played as written that the live detector and matcher hear, `good|chain|kind|onset_heard`** (before -> after)

| kind | all | di | di_gain | laptop_mic | laptop_noisy | laptop_reverb | phone_mic | phone_agc |
|---|---|---|---|---|---|---|---|---|
| picked | 87% -> **100%** | 100% | 78% -> **100%** | 99% -> **100%** | 98% -> **99%** | 100% | 70% -> **100%** | 65% -> **100%** |
| picked_16ths_160_220 | 72% -> **99%** | 100% | 99% | 100% | 93% -> **99%** | 100% | 10% -> **94%** | 0% -> **99%** |
| palm_mute | 96% -> **100%** | 100% | 100% | 100% | 100% | 100% | 90% -> **100%** | 82% -> **100%** |
| hammer | 36% -> **83%** | 100% | 75% -> **88%** | 62% -> **100%** | 0% -> **54%** | 17% -> **79%** | 0% -> **79%** | 0% -> **83%** |
| pull | 51% -> **86%** | 100% | 79% -> **92%** | 75% -> **100%** | 0% -> **67%** | 67% -> **92%** | 4% -> **71%** | 29% -> **83%** |
| tap | 72% -> **100%** | 100% | 100% | 100% | 44% -> **100%** | 100% | 31% -> **100%** | 31% -> **100%** |
| slide_to | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 92% -> **100%** | 100% | 100% | 100% | 100% | 100% | 100% | 44% -> **100%** |
| bend_release | 86% -> **100%** | 100% | 100% | 100% | 100% | 100% | 100% | 0% -> **100%** |
| harmonic | 81% -> **100%** | 100% | 100% | 100% | 81% -> **100%** | 100% | 81% -> **100%** | 6% -> **100%** |
| sweep | 96% -> **100%** | 100% | 100% | 100% | 100% | 100% | 78% -> **100%** | 94% -> **100%** |
| chord_tone | 79% -> **100%** | 100% | 50% -> **100%** | 100% | 100% | 100% | 100% | 0% -> **100%** |

**Timing scatter of heard notes, ms, `onset_scatter_ms`** (before -> after)

| kind | all | di | di_gain | laptop_mic | laptop_noisy | laptop_reverb | phone_mic | phone_agc |
|---|---|---|---|---|---|---|---|---|
| picked | 2.7 -> **2.6** | 2.6 | 2.8 | 2.7 | 2.7 | 2.7 | 2.3 -> **2.1** | 2.6 |
| picked_16ths_160_220 | 2.4 -> **2.3** | 2.4 | 2.7 | 2.2 | 2.4 -> **2.3** | 2.5 | 1.7 | - -> **2.4** |
| palm_mute | 2.0 | 1.9 | 2.1 | 1.6 | 1.9 | 2.0 | 2.5 -> **1.9** | 2.7 -> **2.6** |
| hammer | 1.9 | 1.8 | 2.0 -> **2.1** | 2.1 -> **2.3** | - -> **2.3** | 0.7 -> **2.2** | - -> **1.7** | - -> **1.6** |
| pull | 1.2 | 1.1 | 1.3 -> **1.0** | 1.3 -> **0.9** | - -> **1.3** | 1.1 -> **1.0** | 0.0 -> **1.4** | 1.4 -> **1.1** |
| tap | 1.4 | 1.7 | 1.8 | 1.8 | 0.9 -> **1.4** | 1.8 | 0.8 -> **1.4** | 1.7 |
| sweep | 2.2 | 2.1 | 2.5 | 2.4 | 2.2 | 2.3 | 1.8 -> **1.9** | 2.2 -> **2.3** |

**Weak legato (a tenth of a pick) heard, `weak|...|onset_heard` (information)** (before -> after)

| kind | all | di | di_gain | laptop_mic | laptop_noisy | laptop_reverb | phone_mic | phone_agc |
|---|---|---|---|---|---|---|---|---|
| hammer | 0% -> **9%** | 0% -> **12%** | 0% -> **50%** | 0% | 0% | 0% | 0% | 0% |
| pull | 39% -> **67%** | 67% | 67% -> **92%** | 67% | 0% -> **58%** | 67% | 0% -> **58%** | 4% -> **62%** |
| tap | 59% -> **100%** | 100% | 100% | 100% | 6% -> **100%** | 100% | 6% -> **100%** | 0% -> **100%** |

**Left-out notes counted as heard, `omitted|...|onset_heard`** (before -> after)

| kind | all | di | di_gain | laptop_mic | laptop_noisy | laptop_reverb | phone_mic | phone_agc |
|---|---|---|---|---|---|---|---|---|
| all | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% -> **1%** |
| tap | 0% -> **3%** | 0% | 0% | 0% | 0% | 0% | 0% | 0% -> **20%** |

**Correct Takes that pass their own bars (no note model), `takes|chain|all|good_passed`** (before -> after)

| kind | all | di | di_gain | laptop_mic | laptop_noisy | laptop_reverb | phone_mic | phone_agc |
|---|---|---|---|---|---|---|---|---|
| all | 54% -> **77%** | 80% -> **87%** | 53% -> **80%** | 87% -> **93%** | 53% | 80% -> **93%** | 13% -> **80%** | 13% -> **53%** |

**Spurious onsets a minute, all played Takes, `takes|chain|all|spurious_per_min`** (before -> after)

| kind | all | di | di_gain | laptop_mic | laptop_noisy | laptop_reverb | phone_mic | phone_agc |
|---|---|---|---|---|---|---|---|---|
| all | 2.51 -> **0.30** | 0.00 | 0.00 | 2.68 -> **0.00** | 3.81 -> **1.05** | 3.49 -> **0.00** | 3.81 -> **0.00** | 3.81 -> **1.05** |

**Onsets a minute with nobody playing, `takes|chain|all|silent_spurious_per_min`** (before -> after)

| kind | all | di | di_gain | laptop_mic | laptop_noisy | laptop_reverb | phone_mic | phone_agc |
|---|---|---|---|---|---|---|---|---|
| all | 1.69 -> **0.00** | 0.00 | 0.00 | 0.00 | 3.95 -> **0.00** | 0.00 | 3.95 -> **0.00** | 3.95 -> **0.00** |

**Onsets a minute on stray hand noises at -24 dB, `takes|chain|all|noises_spurious_per_min`** (before -> after)

| kind | all | di | di_gain | laptop_mic | laptop_noisy | laptop_reverb | phone_mic | phone_agc |
|---|---|---|---|---|---|---|---|---|
| all | 1.69 -> **0.00** | 0.00 | 0.00 | 0.00 | 3.95 -> **0.00** | 0.00 | 3.95 -> **0.00** | 3.95 -> **0.00** |


Left-out taps on `phone_agc`: 1 of 5 now counted heard (the automatic gain
pumping the room up when a note stops); every other left-out row stays 0%.
Spurious onsets fell on every chain although the detector hears far more,
because 3.8/min of the old figure was the phantom at the start.

With the note model (`detect:check` before the baseline moved): 1,562 gated,
116 better, 9 "worse", every one an effect of hearing notes that had no
verdict before:

| Metric | Was | Is | Why |
|---|---|---|---|
| `good|phone_agc|bend|pitch_wrong`, `bend_release` | 44%, 0% | 100%, 88% | the tracker alone calls a bend wrong (M5, known); these bends were not heard at all before. `final_wrong`, what is graded, is 0% |
| `good|all|bend|pitch_wrong`, `bend_release`, `tap` | 89%, 62%, 43% | 97%, 75%, 46% | the same, pooled |
| `good|di_gain|pull|pitch_wrong` | 8% | 21% | 3 more pull-offs heard on high gain, read wrong by the tracker; `final_wrong` 0% |
| `good|phone_agc|picked_16ths_160_220|pitch_wrong` | 0% | 5% | 0 of 288 were heard before, 285 now |
| `good|laptop_reverb|hammer|onset_scatter_ms` | 0.7 (n=4) | 2.2 (n=19) | the old number was four notes |
| `good|phone_mic|pull|onset_scatter_ms` | 0.0 (n=1) | 1.4 (n=17) | the old number was one note |

Baselines updated in the same commit: `fast.json` 1,562 -> 1,608 gated
metrics (the new spurious / silent / noises rows), `fast-no-model.json`
likewise. Hard gates unchanged: `wrong|all|all|final_right` 0.0%,
`pitch_right` 0.1%, `omitted|all|all|onset_heard` 0.1% (1 of 707),
`good|*|final_wrong` 0%. Correct Takes passing with the model: 80% pooled
(`phone_mic` 13% -> 80%, `phone_agc` 13% -> 53%, `laptop_noisy` 53%).

**Against the report's M6 bar** (synthetic chains, not the corpus, which does
not exist yet: card #85):

| Bar | Result |
|---|---|
| picked heard >= 98% DI, >= 95% laptop and phone | 100 / 100 / 99-100 / 100; fast sixteenths 94% on `phone_mic` (was 10%) |
| scatter under 5 ms on every capture | 1.0 to 3.4 ms, every kind and chain |
| no deafness under automatic gain and noise | `phone_agc` picked 65 -> 100, 16ths 0 -> 99; `laptop_noisy` 98 -> 99 |
| extras per Take not increased | **not quite**: the matcher's extras go from 0 to 13 over 343 Takes (3 on correctly played Takes; all on `laptop_noisy` and `phone_agc`, chords ringing in noise and taps under automatic gain), while the detector's raw spurious onsets fall 2.51 -> 0.30 a minute |

**Cost.** `cost_per_hop` (ignored test in `onset_flux.rs`, release, this
machine under load 9): the second detector 7.5 us a hop; the whole core
(ring, aubio, gates, second detector) 22.1 us, so about 14.5 us before: 0.41%
of a 5.33 ms hop, was 0.27%. No allocation after construction (fixed arrays,
one FFT plan built in `new`), no lock, no system call. The cpal output
callback, the engine and the queue are untouched.

**Not done / known limits:**

1. **Click-jitter probe: run and passed** (2026-11-19 evening, load 1.8 to
   2.5 one-minute, 3.5 to 5.8 five-minute; `--features detect-ort` build of
   `eb484bea`). All hard gates 0 (missed beats, callback allocations and
   frees, dropped beats) in every run:

   | Run | p99 jitter |
   |---|---|
   | `--no-llm` | 0.90 ms |
   | `--no-llm --jam-swap --jam-move --jam-take` | 0.95 ms |
   | `--no-llm --song-loop --song-take` | 0.98 ms |
   | `--no-llm --late-pass` (104 late passes of 592 ms, verifier on; owed since M4/M5) | 0.55 ms |
   | `--no-llm --jam-swap --jam-move --jam-take --late-pass` (107 passes) | 0.56 ms |

   What this does and does not show: the probe runs the engine headless and
   **does not start the onset thread** (it has no input device), so it shows
   the output callback is as it was, which is expected since M6 touches
   nothing on that side. The onset thread's added load is the `cost_per_hop`
   figure above (7.5 us in every 5.33 ms). The run that has the detector
   live beside the click is `npm run test:e2e:probe`; it was not run in this
   leg.
2. Slid-to notes: still 0% (no attack; the verifier hears 69%).
3. Hammer-ons in noise stop at 54 to 83%: what is left sits at the salience
   of the spurious peaks (0.27 to 0.4 of a pick). The next lever is the
   research's pitch-change detector (a live pitch estimate), not a threshold.
4. The first attack out of silence is stamped up to two hops early by the
   second detector (nothing to measure its rise against yet); on a clean
   input aubio hears that note and its stamp is used.
5. Section 3.3's other items are not in this leg: aubio's 50 ms minimum
   inter-onset interval, hop and aubio window in milliseconds (the second
   detector's window is), band onsets discounted live.
6. The chains are stationary noise and a simple gain model. Real rooms
   (speech, a TV, a fan starting) are card #85's recordings and card #86.

## M7. Free-play engine (engine, bench and app surfaces done; the probe with the worker is in "M7 part 2", leg 3)

Leg of 2026-11-19 night. Card #106.

**First, the review of M6 and the staged late grade** (`df4a4633`): A1 the
second detector's lag is 10.7 ms in hops and its history holds 100 ms at
96 kHz, two peaks inside 10 ms are one attack, the same-attack window is
max(16 ms, 1.5 hops), tests at 16/44.1/96 kHz; A2/A3 `OnsetCore` tests; A4 a
non-finite level skips the hop; A5 `OnsetDetector::set_demo_gate` and
`OnsetCore::forget_recent_notes` when a listen demo ends; A7 the debug log;
B1 `timing::model_fits_budget`; B2 a comment; B3 `android.yml`. A6 (a soft
onset's amplitude from the attack hop) is not done: it moves
`Onset::amplitude`. `detect:check`: 1,608 gated metrics, 0 worse, 0 better.

**Built** (`src-tauri/src/harmony/`, nothing on a real-time thread):

- `mod.rs`: `Engine`. Notes in (`onset`, `sustain`), `tick`, a `Reading`
  out: key with a state (`Listening`, `Unsure`, `Settled`, `Chart`), scale
  (nine types), the relative pair flagged when the notes do not separate
  them, chord per beat (24 triads, sticky path, bass bonus, a seventh named
  when it sounds; "couldn't tell" unless the beat held a chord or goes on
  with the last one), per-note `ChordTone` / `ScaleTone` / `Approach` /
  `Outside` / `Unknown`. A `Chart` (key, chords per bar, bar marks) replaces
  estimation.
- `notes.rs`: `NoteDecoder`, notes from the model's posteriors, causal.
- `stream.rs`: `Stream`, the model on a window every 47 frames (0.55 s);
  the engine is about one second behind the input.
- `worker.rs`: `Worker`, the thread (`yames-harmony`, lowered priority,
  polls the input ring every 100 ms, shares the app's one model). **Written
  and compiled, not wired to a command and never run in the app.**
- Bench: `bin/detect-bench/harmony.rs`; metrics and commands in `MEASURE.md`,
  "Free play". Baseline `fast.json` gained 187 `harmony|...` metrics (the
  1,608 older gated ones did not move); `fast-no-model.json` is unchanged.

**Measured.** Synthetic (`run --fast`, pooled over the seven chains):
strummed chord root 96% of beats, key 0.95 at 15 s and 1.00 at 30 s, settled
in 12.8 s, 14 of 14 right. GuitarSet, 52 excerpts (every seventh file;
`results/harmony-guitarset-subset.md`):

| playing | chain | chord root right, all beats | beats given a chord | root right when given | key score at 15 s | key score at 30 s | key settled | settled key right | seconds to settle | "inside" right | "outside" right | "outside" right, with the chart |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo | gs_annotation | 2% (1511) | 8% (1511) | 28% (128) | 0.53 | 0.67 | 88% (26) | 83% (23) | 16.5 | 99% (1061) | 92% (86) | - |
| solo | gs_mic | 4% (1489) | 15% (1489) | 28% (230) | 0.64 | 0.64 | 85% (26) | 82% (22) | 13.5 | 83% (1468) | 50% (147) | 48% (192) |
| strummed | gs_annotation | 71% (1479) | 84% (1479) | 85% (1236) | 0.82 | 0.88 | 96% (26) | 84% (25) | 12.5 | 99% (3746) | 85% (155) | - |
| strummed | gs_mic | 70% (1457) | 84% (1457) | 84% (1218) | 0.82 | 0.83 | 96% (26) | 92% (25) | 14.4 | 76% (3632) | 51% (146) | - |

Against the M7 acceptance (strummed GuitarSet, microphone):

- key 0.82 at 15 s (bar 0.75) and 0.83 at 30 s (bar 0.80): **met** on the subset.
- chord root 70% of all beats (bar 78%): **not met**. It is 84% of the beats
  it answers and it answers 84%. The research's 79% used a Viterbi path with
  backtrace (it reads the future) and answered every beat. Next: a decision
  one beat late (fixed-lag) and counting a held chord through quiet beats.
- an unsure state whenever the margin is small: in the engine; no page shows it yet.
- zero jitter-gate regressions: not run in that leg; run in leg 3 ("M7 part 2"): hard gates 0.

Also seen: "inside" calls are right 73 to 83% of the time on the microphone
against 99% from annotated notes. The difference is notes the decoder makes
up (harmonics, doubled attacks). "Outside" calls from the microphone are
right about half the time: too weak to show a player as fact. A solo gets a
chord on 15% of beats and it is right 28% of those: the gate that says
"this beat is a line" still lets some through.

**Not done in this leg** (budget): the Tauri commands (`harmony_start`,
`harmony_mark_bar`, `harmony_stop`, event `harmony-reading`), the setting
(default off) and its parity-manifest entry, the Jam readout, the coach
line in 15 locales, the click-jitter probe with the worker running, the
full 360-excerpt GuitarSet run. `HANDOFF.md` has the design for each.

## M7 part 2. The engine in the app, and the chord root (2026-11-19 late; card #107)

**Chord root, second pass** (helper, `2893adb3`, `84c2f0a4`; `harmony/mod.rs`
only). A beat's chord is decided one beat late (`CHORD_LAG_BEATS = 1`, a
fixed-lag backtrace on the chord path), a seventh counts for its chord, a
chord needs three voices at one moment and 1.2 on average (was 1.6 on
average alone), one quiet beat keeps the chord. The live chord is therefore
the last beat but one: 0.5 to 1 s at 120 BPM on top of the capture's second.
Chart mode is unchanged. GuitarSet, before -> after (subset is the 52
excerpts it was tuned on; the full 360 were run once and not tuned on;
tables in `results/harmony-guitarset-subset.md` and `-full.md`):

| playing, chain | set | chord root, all beats | beats given a chord | right when given | key 15 s | key 30 s | "inside" right | "outside" right |
|---|---|---|---|---|---|---|---|---|
| strummed, mic | subset | 70% -> **78.6%** (1145/1457) | 84% -> 92% | 84% -> 86% | 0.82 = | 0.83 = | 76% = | 51% -> 49% |
| strummed, mic | full | 69% -> **77.6%** (7945/10236) | 83% -> 92% | 83% -> 84% | 0.75 = | 0.79 = | 75% = | 50% -> 48% |
| strummed, annotation | full | 71% -> 79% | 85% -> 91% | 83% -> 87% | 0.76 = | 0.78 = | 99% = | 89% -> 93% |
| solo, mic | subset | 4% = | 15% -> 13% | 28% -> 30% | 0.64 = | 0.64 = | 83% = | 50% -> 51% |
| solo, mic | full | 5% = | 16% -> 15% | 29% -> 32% | 0.65 = | 0.64 = | 79% = | 46% = |

Against the bar (78% of all beats): **met on the subset, 0.4 point short on
the full set.** By style on the full set: singer-songwriter 94%, rock 92%,
bossa nova 77%, jazz 63%, funk 61% (voicings without the root in the bass,
offbeat stabs ringing into the next beat, excerpts played off the instructed
chart). The key bar at 30 s (0.80) is met on the subset (0.83) and not on
the full set (0.79); the first leg only ran the subset. Not tuned further:
tuning on the full set would spend the test set.

Baseline `fast.json`: only `harmony|...` lines moved (73 metrics, 30 gated;
no other metric moved). Strummed `chord_root` pooled 96.1 -> 98.1% (every
chain up 0.8 to 3.9 points: the late decision names the first beat of a new
chord right), `chord_root_when_answered` up 0.8 to 5.4 points,
`inside_precision` -0.2 to +0.6 point (one drop, laptop_reverb strummed
92.59 -> 92.43, inside tolerance: a note's verdict now waits for its beat's
chord). Key metrics unchanged. **Worse, information only:** a synthetic solo
is now given a chord on 29.2% of beats (was 22.5%); at the old 1.6 average
it is 20.1% but GuitarSet strummed drops to 76.9%. Real solos (GuitarSet)
went down, so 1.2 stayed; the page does not show those single beats (below).

**I-vi-IV-V that did not settle**: the test's strum had the root in three
of five voices, so F major fit as well as C major and the lead changed hands
every two bars, never holding 6 s. Counting a pitch class once per beat
settles it but measured worse on GuitarSet (key at 30 s 0.83 -> 0.81), so
the engine is unchanged; the test strums a guitar shape and asserts
`Settled` again.

**The worker, made safe to run** (`harmony/worker.rs`; it had never run):

- It gives way to a Take. `paused()` is true while a Take's schedule is
  loaded in the timing analyzer (`set_take_loaded`, from
  `load_exercise_with_details` / `clear_score_schedule`) or the post-Take
  pass holds `verifier_hold()` (taken on `yames-take-notes` before it asks
  for the model). Paused, the worker runs no window and does not lock the
  ring; it asks before every window, so the verifier waits for one window at
  most (the one already running). After a pause it starts from nothing.
- It gives up when lapped: a poll that finds 3 s of input waiting ends the
  worker (`harmony-reading` null) instead of reading stale audio.
- The ring's lock is held for one copy into a buffer sized up front.
- `Shown`: the chord a page may show is the beat's chord once two beats
  running named it, kept through one stray beat, dropped after two beats
  without one. `Live.shownChord` is that; `Reading.chord` stays the raw
  beat. **Not measured on the bench** (the bench scores raw beats): owed.
- `Summary` on stop: the reading plus the chords shown most (at most four,
  each at least a tenth of the chord beats).
- Tests (10, fake models, a thread feeding the ring every 5 ms): reads and
  reports, the input's `try_lock` is turned away on under 2% of buffers; no
  window while paused and a fresh start after; a verifier that asks while
  five windows are queued sees at most one more window; no model, and
  lapped, each end it with one null; the debounce; the summary; the gate.

**Commands** (`commands.rs`, `lib.rs`): `harmony_start(chart, bpm) -> bool`
(false when the input is not listening or the build has no model; in turn
with input start/stop), `harmony_mark_bar(bar, bpm)`, `harmony_stop() ->
Option<Summary>` (the join is on a blocking thread), event `harmony-reading`
(`Live` or null). `stop_evaluation` ends the worker and emits null; the page
asks again up to three times (a device change restarts the input).

**The app** (off by default):

- Setting `jamHear`, "Hear what I play" (Settings, Coach, under Spoken
  cues); parity manifest gained the setting, three commands, four `ipc.ts`
  exports and one event, nothing removed.
- `src/jam/heard.ts`, `useHeard.ts`: the hook lives in `MainWindow` and runs
  only while the setting is on, the transport plays, the input listens and
  the mode is Jam (with the jam's chart: key and one chord per bar, concert
  pitch) or a Session's plain jam step (no chart; a finisher is a Take).
- Jam readout (`NowBlock.tsx`, `HeardLine`): "Heard: A minor · Dm",
  "Chart: ..." when the key is the chart's, "Couldn't tell yet",
  "Listening…"; both keys when the relative pair is not separated; a chord
  without a key while the key is open. **No inside/outside anywhere** (the
  orchestrator's call: 48 to 51% right for "outside").
- Recap line (`session.recap.heard`, `heardKey`, 15 locales): only a key the
  engine estimated and that settled, after 20 s of playing, with the chords
  shown most. A chart's key is not reported back.

**Gates** (leg 3, on the final tree, one at a time): `tsc --noEmit`; vitest
366 of 367 files, 10,879 tests (`TabStage.render.test.tsx`, worktree-only);
`npm run build`; `test:rust` 1,135 passed; `test:rust:detect` 1,137 passed
(the worker's nine tests in both); `detect:check` 1,704 gated metrics, 0
worse, 0 better, 0 missing; `test:layout` `jam.spec` + `session.spec` 139
passed, `settings.spec` passed (145 with the first two before the new
scenes); the click-jitter probe below.

**Not done:**

- ~~Click-jitter probe with the worker~~: run in leg 3, below.
- ~~The readout in a real browser~~: scenes `jam-heard` and
  `jam-heard-unsure` (leg 3, below).
- With a chart the readout repeats what the NOW block already says, and the
  model runs for it. Product question for the orchestrator: chart jams could
  send the key only (chords then estimated), or not listen at all.
- The Session's jam step is heard without a chart even when its jam has one.
- A schedule left loaded by a screen keeps the reading paused until cleared
  (quiet is the safe side); Songs' exit path was not audited for it.
- The setting sits in the Coach section; whether a phone shows that section
  was not checked.
- Reviewer: the Rust diff is `git diff 3f596af6..HEAD -- src-tauri/src`
  (worker.rs, commands.rs, lib.rs, timing.rs three lines, the probe).

**Leg 3 (2026-11-19 night): what leg 2 left, the probe, the scene.** Leg 2
was killed by a container restart; its tree was saved as a WIP commit and is
now the gated commits of this section (the WIP commit is gone). Read against
its notes, the code was complete: nothing in `src-tauri/src` or `src/` was
changed in leg 3 except the shot harness. What was missing was every gate
(above), the probe, and the scene.

*Click-jitter probe with the worker* (`--features detect-tract` release
build, load 2.7 to 4.4 one-minute and 2.9 to 3.6 five-minute, 60 s each, in
this order). Hard gates (missed beats, callback allocations and frees,
dropped beats) 0 in all nine runs; the worker read the whole run, settled a
key and was "still listening at the end" in every `--harmony` run; its lock
turned away 0 or 1 of about 12,000 input buffers.

| Run | p99 jitter ms | max ms |
|---|---|---|
| `--no-llm --harmony` | 1.10 | 1.42 |
| `--no-llm` | 1.19 | 1.57 |
| `--no-llm --harmony` | 0.78 | 1.23 |
| `--no-llm` | 0.71 | 0.99 |
| `--no-llm --harmony` | 0.65 | 1.21 |
| `--no-llm --harmony --jam-swap --jam-move --jam-take` | 0.99 | 1.46 |
| `--no-llm --harmony --late-pass` (82 passes of 760 ms) | 0.58 | 1.28 |
| `--no-llm --harmony --jam-swap --jam-move --jam-take --late-pass` (83 passes) | 0.59 | 1.03 |
| `--no-llm --jam-swap --jam-move --jam-take` | 0.77 | 1.16 |

The advisory p99 bar (1 ms) was missed twice, once with the worker and once
by the plain baseline right after it (1.10 and 1.19): the machine, not the
worker. With and without the worker the p99 sits in the same 0.6 to 1.2 ms
band. As with M6, the probe has no input device: it shows the output
callback beside the worker, not the input callback's `try_lock` against a
real driver (the feeder thread stands in for it).

*The readout in a browser.* `src/shots/scenarios.ts` has `jam-heard` and
`jam-heard-unsure` (`jam.heard`: the store's `jamHear`, a listening input,
`harmony_start` answered and one `harmony-reading` sent by `mockIpc.ts`).
`tests/layout/jam.spec.ts`, "the key and chord heard" (5 tests): one line
in its column at 760, 1100 and 1400 px, on screen, its words over no word or
control of the tempo cluster, "couldn't tell" for a reading with neither,
absent with the setting off, and no "inside" or "outside" in the block.
**Seen while writing it:** at 1100 px the NOW block is squeezed to 104 px
(before this branch too) and the 172 px column beside the chord reaches
under the tempo; the line makes that column one line taller, so its box now
also reaches the "Tempo" label. No words touch in English with "A7 in 2
bars"; a long next-chord line or a long locale at that width was not tried.
The mocked reading is a heard key in a jam that has a chart; the app would
say "Chart: ..." there (same length).

Still open from the list above: the reviewer on the Rust diff, the debounce
on the bench, the two product questions, funk and jazz roots, Songs' exit
path, the setting on a phone.

## M7 review fixes (2026-11-19 night; card #107)

`REVIEW-M7.md` (the independent review of `df4a4633..141c3fc2`) asked for one
blocker and four should-fix items before merge. Three commits: `0ccf85fa`,
`3c7f6ea6`, `5c356e50`. What changed, by finding:

- **B1, the pause that stuck.** The worker's pause no longer follows "a
  schedule is loaded". The analyzer's thread keeps a `TakeWatch`
  (`harmony/worker.rs`): a Take is a loaded schedule with the click marking
  quarter notes under it (count-in included), and it stops being one 4 s
  after the last quarter, when the schedule changes, or when the analyzer
  ends. Songs' schedule now leaves the engine when the app leaves Songs or
  the song closes (`useScheduleLeavesWithSong`, called from `MainWindow`
  with `mode === "songs" && score`: Settings over Songs clears nothing).
  And free play beginning is itself the word that no Take is loaded:
  `harmony_start(clear_stale: true)` clears a schedule it finds
  (`TimingAnalyzer::forget_stale_schedule`); a retry sends `false`.
- **S1, the backlog past one ring.** `RingBuffer` counts samples written in
  a `u64` (one add in `write`, nothing else on the callback). The worker
  keeps that count as its cursor: 3 s or more since the last poll ends it,
  however often the ring wrapped. The worker loads the model on its own
  thread before its first look at the ring (`Hooks::warm`), so a slow first
  load is not taken for a slow model.
- **S2, the input restarted.** `start_evaluation` ends the worker and sends
  the `null`, as `stop_evaluation` does. The worker also ends by itself when
  the ring's count goes backwards or its length changes.
- **S3, readings after stop.** Every `on_reading` and the clearing of
  `alive` pass through one lock (`voice`): after `stop`, `Drop` or
  `worker::end` returns, nothing more is said.
- **S4, start against stop.** `harmony_start` returns the worker's id and
  `harmony_stop(id)` stops only that worker (`worker::take_if`). `useHeard`
  runs its starts, stops and tempo changes in one queue, in the order asked.
- **Nits.** N1: `harmony_set_tempo` (a new command, in the frozen surface on
  purpose), sent on a tempo change. N2: a bar mark's time is the sample
  count at the poll less how long before the poll it was made, so it no
  longer drifts; not clamped at zero. N3, N6: the doc comments say what is
  true. N5: a poisoned ring is said. D1: `onset_flux` steps its history
  after the non-finite check. D3: `forget_recent_attacks` resets both.
  D4: a note beside `set_demo_gate`. N4, D2: not done (`HANDOFF.md`).

Regression tests: `worker.rs` `lapped_by_more_than_the_whole_ring_it_still_gives_up`,
`the_ring_counts_what_was_written_past_its_own_length` (S1),
`an_input_restarted_under_it_ends_it` (S2),
`ended_by_the_input_it_says_nothing_more` (S2, S3),
`a_stop_meant_for_an_earlier_worker_leaves_the_new_one_running` (S4),
`a_schedule_that_is_only_loaded_is_not_a_take_and_a_take_ends_with_its_click`
(B1), `a_slow_first_load_of_the_model_is_not_being_lapped`,
`a_tempo_change_reaches_a_worker_that_has_no_chart`; `timing.rs`
`free_play_starting_clears_a_schedule_that_was_left_loaded` (B1);
`src/jam/useHeard.test.ts` (S4, N1, the retry),
`src/containers/songs/useScheduleLeavesWithSong.test.ts` (B1). Not covered
by a test: that `start_evaluation` and `harmony_start` make the calls (they
need a Tauri app); the helpers they call are.

**Second review** (one fresh read-only reader, given the first review and
the diff): "merge after fixes", no blocker, twice. Its first pass found the
stale schedule under a jam's click still pausing the worker, the model's
load still able to lap it, a flag left set by an analyzer that panicked,
and the worker running through the count-in: all fixed in `3c7f6ea6`. Its
second pass found the Songs clear skipped on the usual way out, the first
bar mark clamped to zero, and a retry able to clear a later Take's
schedule: fixed in `5c356e50`. That last commit has not been read by it.

Gates on `5c356e50`: tsc, `npm run build`; vitest 10,886 passed (the one
failing file is `TabStage.render.test.tsx`, worktree-only as before);
`test:rust` 1144/0; `test:rust:detect` 1146/0; `detect:check` 1,704 gated
metrics, 0 worse, 0 better. Click-jitter probe `--no-llm --harmony`, seven
runs on the final Rust: hard gates 0 in all (missed beats, callback heap,
dropped beats); the worker read 60.9 s, 120 beats, key settled, still
listening; 0 to 2 of about 11,600 input buffers turned away. p99 with the
worker 0.87, 1.32, 1.06, 1.09, 1.08, 0.99 and 1.23 ms; the plain baseline
(`--no-llm` alone) run between the last ones read 0.59 and 1.22 ms at load
3 to 4. So the advisory 1 ms bar was missed five times with the worker and
once of twice without it: the same 0.6 to 1.3 ms band the earlier leg saw,
on a box where another agent was training all night. Not a clean pass; not
evidence against the worker.

Layout (`npx playwright test --trace off`): `songs` 106 of 106, `session`
92 of 92, `jam` 46 of 47. The one is `jam.spec.ts:684` (the groove editor,
"the setup drawer stayed open"): it fails in a parallel run on `141c3fc2`
too and passes run alone on both trees. With all three files at once and
the box at load 35 to 45, `songs.spec.ts:383` and `session.spec.ts:220`,
`:291` also failed once each and passed alone.

## Runtime merge and its review nits (2026-11-19 evening)

`mvp-detect-runtime` (`3a983dd1`: the verifier runs on tract, pure Rust, from
an NNEF model, in every shipped build; `ort` kept for `npm run
detect:parity`) is merged as `08e9c1ac`. `late_grade` keeps both sides: the
tracker's grade is published first (`13c3cf6a`) and the model call sits
inside the runtime branch's `catch_unwind`, so a panic leaves the tracker's
grade in place (`timing::late_grade_staged`). Details: `RUNTIME.md`.

| Commit | Review nit |
|---|---|
| `f97370f6` | 2: a model that panics while running is retired like one that failed to load; 3: outputs checked by exact name and shape |
| `229462ed` | 4: the model is loaded when an Exercise with pitches is loaded, off the Take's pass and off every real-time thread; `detect-bench cost` times the load (37 to 42 ms on a desktop big core, 65 to 73 ms on a phone mid core: `RUNTIME.md`, "Loading") |
| `eab273a5` | 6: `detect:parity` exits 1 on a posterior difference over 1e-3, a non-finite value or a verdict flip |
| `d978cfd6` | 5, 7: stale comments; `android.yml` type-checks with `detect-tract` |

Gates on the merged tree (`detect:bench`, `detect:check` and
`test:rust:detect` now build with `detect-tract`): `test:rust` 1101/0,
`test:rust:detect` 1103/0, `test:grading` 29/0, `test:pitch` 8/0, `test:dsp`,
`test:highbpm`, `detect:check` 1,608 gated, 0 worse, 0 better, 0 missing
against the M6 baselines (so tract moved no gated number), `detect:parity`
exit 0, Android `cargo check` plain, `detect-tract` and `detect-ort`, tsc,
vitest 364 of 365 files (`TabStage.render.test.tsx`, worktree-only), `npm
run build`.

Click-jitter probe on the tract build (load 2.9 to 3.3 one-minute, 4.9 to
5.8 five-minute), hard gates 0 in both: `--no-llm --late-pass` p99 0.51 ms
(86 late passes of 719 ms), `--no-llm --jam-swap --jam-move --jam-take
--late-pass` p99 0.90 ms (87 passes of 724 ms; 592 ms on `ort`).

A helper did the merge and the four fixes and was cut off by an API error
before its gates; the gates and the probe above were run on its tree
afterwards. Its merge resolution of `timing.rs` has had no second reader:
it is on the reviewer's list in `HANDOFF.md`.

## Opus interlude (2026-11-19, between ed8870d4 and the Fable agent's return)

A stand-in agent picked up the uncommitted M4 work, finished and gated it,
then did M5. Commits on `mvp-detect`:

| Commit | What |
|---|---|
| `b18f7be0` | M4 part 1: `noteIdentity` from tracker + verifier (`merge_states`), late pass whenever the model is in the build, note details from the app, legato "reported, not graded" line, "Keep my last Takes for troubleshooting" (Settings, Support), M0 nits (truth-vs-look-up lib test, MIDI Takes not read, `npm run test:detect`), card #90 fixed |
| `b618393b` | `git merge revamp` (clean) |
| `d8b5f4eb` | M5: `score/curves.rs`, `grade.curves`, DSL `b2r` / `B2`, bends and vibrato lines, `timing::late_grade`, probe `--late-pass`, bench `bends` group |

Bench numbers are in the M4 and M5 sections above; baselines
`fast.json` 1,112 -> 1,562 gated metrics (what `detect:check` reports; 1,593
was a miscount: the file also holds info metrics, which are not checked), `fast-no-model.json` likewise
extended, earlier values unchanged except the M4 `takes|*` improvements.

Gates run on the final tree: `test:rust` 1089/0, `test:rust:detect` 1083/0
(before M5), `test:grading` 29/0, `test:dsp`, `test:highbpm`, `test:pitch`,
`detect:check` 0 worse, Android `cargo check --lib --target
aarch64-linux-android` with and without `detect-ort`, tsc, vitest (all but
`TabStage.render.test.tsx`, worktree-only), `npm run build`.

**Not done / where it stands:**

1. **Click-jitter probe not run** for the added post-Take compute: load was
   10 to 11 all session. Run when `/proc/loadavg` 1- and 5-min < 6:
   `cargo run --release --manifest-path src-tauri/Cargo.toml --features
   detect-ort --bin click-jitter-probe -- --no-llm --late-pass` (and with
   `--jam-swap --jam-move --jam-take --late-pass`). Gate: the four numbers in
   AGENTS.md.
2. **Shipped builds have no model**: `release.yml` and `scripts/tauri.mjs`
   do not pass `detect-ort`, so M4/M5 verdicts reach players only once the
   owner accepts +20 MB and the Intel-Mac gap (M3 "Runtime").
3. **Reviewer**: `timing.rs` (late pass trigger, `midi_seen`, `late_grade`),
   `take_diagnostics.rs` (disk writes on the post-Take thread),
   `coach::lower_current_thread_priority` made `pub` (re-exported in
   `probe`), `score.rs` / `score/*`. No change to the engine, the cpal
   callback, the queue, the settings store or SQLite.
4. **Card #89** (Songs review pitch pass may read at the detector's stamp)
   untouched.
5. Next milestones: M6 (live detector robustness, the 36% / 51% onset_heard
   on hammer-ons / pull-offs and phone_agc 48% bends read are its targets),
   M7 (free-play engine), M8+ planning. No pack uses `b2r` / `B2` yet.

## Runtime: tract on every platform (2026-11-19, branch `mvp-detect-runtime`)

The owner asked for the best solution for all players: the verifier on
every platform, small and dependable. Measured and decided in
`RUNTIME.md`; in short:

- **tract** (`tract-nnef` 0.23.10, pure Rust) is now the verifier's runtime
  in every build people play on, feature `detect-tract`: `release.yml`,
  `beta.yml` (desktop), `scripts/tauri.mjs` (desktop dev/build and Android
  /iOS dev/build, so `android.yml` and the Android beta carry it). Intel
  macOS included, where ort cannot build at all. `detect-ort` stays for
  `npm run detect:parity`.
- Model: `nmp.nnef.tar`, converted from `nmp.onnx` by
  `tools/basic-pitch-nnef` (`npm run detect:nnef`; checked: max abs diff 0
  against the ONNX on tract).
- Parity with ort over the fast bench: verdicts identical on 15,855 of
  15,855 notes, all 2,113 metrics identical, posteriors within 1.8e-4;
  `detect:check` 0 worse on tract (and on `--no-model`).
- Speed, one thread, model only: 1.36 s per minute of audio on a Cortex-X925,
  2.71 s on a Cortex-A725 (phone-class core); ort 1.03 / 2.24. A 30 s Take on
  a mid phone is about 1.5 s, inside the 3-8 s tier.
- Size: +13.3 MB stripped (Android `.so` and Linux binary), against ort's
  +21.2 / +25.1 MB.
- Robustness (review items 3 and 9): a panic in the model call is caught in
  `timing::late_grade` on its own (`verifier.status = failed`, tracker grade
  kept); a panic in `load()` is caught and remembered as "no model";
  `Cargo.toml`'s feature comment says what ships. `YAMES_VERIFIER=0` is still
  the switch.
- `package.json`: `detect:bench`, `detect:check`, `test:rust:detect` now on
  `detect-tract`.

Gates: `test:rust` 1089/0, `test:rust:detect` 1091/0 (tract), the model
tests with both features (the plucked A on tract and on ort), `detect:check` 0 worse, Android `cargo check --lib` with and
without `detect-tract`, the Android release `.so` and `detect-bench` linked
for `aarch64-linux-android`. Not proven here: the Windows and macOS app
builds (no SDKs on this box; tract's crates `cargo check` for both macOS
targets, Windows needs MSVC's `ml64`/`lib.exe`). The next beta run is that
proof.
