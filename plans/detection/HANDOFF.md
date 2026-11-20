# Detection roadmap: handoff

The state a fresh session needs. History and numbers: `PROGRESS.md`. How to
re-measure anything: `MEASURE.md`. Plan: `~/projects/.preview/audio-research/REPORT.md`
section 6. Board: Personal board card #100 (M6), #85 (the owner's recordings),
#86 (public technique-labelled audio), #89 (Songs review pitch pass).

## Where it stands (2026-11-19, end of the M6 leg)

- `mvp-detect-runtime` is merged (`08e9c1ac`): the verifier runs on tract
  everywhere, `npm run detect:bench` / `detect:check` / `test:rust:detect`
  build with `detect-tract`, `detect:parity` compares it with `ort`. Its
  review nits 2 to 7 are fixed (`PROGRESS.md`, "Runtime merge and its review
  nits"); nit 1 (the Windows build) is the orchestrator's.

- Branch `mvp-detect`, worktree `~/projects/yames-mvp-detect`. M0, M2 to M6
  are in. The M2-M5 review's findings are fixed (`PROGRESS.md`, "Review of
  M2-M5: fixes"); review items 3 and 9 belong to the runtime worker on
  `mvp-detect-runtime`.
- M6 is two files: `src-tauri/src/onset_flux.rs` (the second detector, new)
  and `src-tauri/src/onset.rs` (`OnsetCore::analyse_hop`, `admit`,
  `SoftPending`, `VOUCHED_RISE`, `warmup_hops`). `pitch.rs` only made its
  `Fft` `pub(crate)`. Bench: `spurious_per_min`, styles `silent` and
  `noises` (`cases.rs`, `eval.rs`).
- Baselines `plans/detection/baselines/fast.json` and `fast-no-model.json`
  were regenerated for M6: 1,608 gated metrics.

## Owed before this branch merges

1. ~~Click-jitter probe~~: passed on M6 (five configurations) and again on
   the tract build after the merge (both `--late-pass` runs). The probe does
   not start the onset thread: `npm run test:e2e:probe` is the run with the
   detector live beside the click, and it has not been run on M6.
2. **Independent review of M6** (the onset thread): the Rust diff is
   `git diff cda60ed4..HEAD -- src-tauri/src/onset.rs src-tauri/src/onset_flux.rs src-tauri/src/pitch.rs src-tauri/src/lib.rs`.
   What to look at: no allocation per hop in `FluxDetector::process` /
   `rise_now` (stack arrays only), `admit` is the old gate-and-cluster body
   moved, soft onsets carry a timestamp up to one hop in the past (the
   refractory gate and the cluster see `ts_ns`, not "now").
3. **A reader for the merge**: `git show 08e9c1ac -- src-tauri/src/timing.rs`
   (`late_grade_staged`: tracker grade first, model inside `catch_unwind`)
   and `f97370f6`, `229462ed` (`detect/model.rs`: retiring a panicking model,
   where the model is warmed). Written by a helper, gated, not reviewed.
4. **A player's ear on real devices**: every M6 number is synthetic.

## Next, in order

1. M6 leftovers (`PROGRESS.md` M6, "Not done"): legato in noise through a
   live pitch-change detector; aubio's 50 ms minimum inter-onset interval;
   band onsets discounted live; matcher extras on chords ringing in noise.
2. Re-run GuitarSet and the Five-guitar set through the bench
   (`MEASURE.md`, "Public datasets") to see M6 on real audio:
   `plans/detection/results/guitarset.md` is still the pre-M6 detector.
3. M7 (free-play key/chord engine), M8+ planning.

## Rules that bit

- `node_modules` is a symlink: never `npm install`. No `tauri dev`. `sleep`
  is blocked.
- During the owner's day (7 AM to 8 PM PT) heavy commands run under
  `nice -n 19 ionice -c3` with `CARGO_BUILD_JOBS=6` and `--jobs 4`.
- Android `cargo check` needs `source ~/android-ndk-dl/env.sh` and
  `CARGO_TARGET_DIR=~/projects/.target-detect-android`.
- Update a baseline only with the change that moved it, and explain every
  moved gated number in `PROGRESS.md`.
