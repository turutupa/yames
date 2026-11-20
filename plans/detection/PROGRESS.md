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

## Opus interlude (2026-11-19, between ed8870d4 and the Fable agent's return)

A stand-in agent picked up the uncommitted M4 work, finished and gated it,
then did M5. Commits on `mvp-detect`:

| Commit | What |
|---|---|
| `b18f7be0` | M4 part 1: `noteIdentity` from tracker + verifier (`merge_states`), late pass whenever the model is in the build, note details from the app, legato "reported, not graded" line, "Keep my last Takes for troubleshooting" (Settings, Support), M0 nits (truth-vs-look-up lib test, MIDI Takes not read, `npm run test:detect`), card #90 fixed |
| `b618393b` | `git merge revamp` (clean) |
| `d8b5f4eb` | M5: `score/curves.rs`, `grade.curves`, DSL `b2r` / `B2`, bends and vibrato lines, `timing::late_grade`, probe `--late-pass`, bench `bends` group |

Bench numbers are in the M4 and M5 sections above; baselines
`fast.json` 1,112 -> 1,593 gated metrics, `fast-no-model.json` likewise
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
