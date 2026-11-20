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

## M7 leg (2026-11-19 night): where it stopped

Card #106. `PROGRESS.md` "M7" has what was built and measured. The Rust
engine, the bench and the baselines are in; **the app does not use the
engine yet**. In order:

1. **Commands and the worker** (`commands.rs`, `lib.rs`): manage a
   `harmony::worker::SharedHarmony`; `harmony_start(chart: Option<harmony::Chart>, bpm)`
   takes the ring and rate from `SharedAudioInput` (`ai.ring()`,
   `ai.sample_rate()`) and calls `Worker::start(.., |r| app.emit("harmony-reading", r))`;
   `harmony_mark_bar(bar, bpm)` (the page calls it when `BeatEvent.formBar`
   changes; the engine needs bar lines to know which chart chord sounds);
   `harmony_stop() -> Option<Reading>`. Stop it in `stop_evaluation` too.
   The chart goes in concert pitch: `jamHarmony(jam).concert` and
   `chordNotes(chord)` for `tones`, `chordName` for `label` (`src/jam/harmony.ts`, `display.ts`).
2. **Setting**, default off: copy `jamCues` end to end
   (`useUiPreferences.ts`, `CoachSettingsSection.tsx`, `jam.cues.*` keys),
   then `UPDATE_PARITY_MANIFEST=1 npx vitest run src/test/parity/surface.test.ts`
   (the manifest only gains entries: the setting, three commands, one event).
3. **Jam readout**: in `NowBlock.tsx` under `.jam-now-scales`, same type
   size and `var(--text-faint)`: key and chord when `keyState` is `settled`
   or `chart`, "couldn't tell yet" otherwise. Do not show "outside" as fact
   from a microphone (half of those calls are wrong, see `PROGRESS.md`).
4. **Coach line**: there is no localized coach report; the localized home is
   the Session recap (`SessionView.tsx` `RecapScreen`, `session.recap.*`, 15
   locales, `i18n.locales.test.ts`). One line from `harmony_stop`'s reading:
   key and the share of notes inside it, or the "couldn't tell" line.
5. **Probe**: `click-jitter-probe` with the worker running (it adds a model
   window every 0.55 s on a lowered-priority thread); see how `--late-pass`
   loops the late grade and do the same with `Stream::step`.
6. Chord root on GuitarSet from 70% to the 78% bar, then the full run
   (`MEASURE.md`, "Free play").
7. TS gates were not run in this leg (no TS changed).

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
3. M7's app half (the section above), then M8+ planning.

## Rules that bit

- `node_modules` is a symlink: never `npm install`. No `tauri dev`. `sleep`
  is blocked.
- During the owner's day (7 AM to 8 PM PT) heavy commands run under
  `nice -n 19 ionice -c3` with `CARGO_BUILD_JOBS=6` and `--jobs 4`.
- Android `cargo check` needs `source ~/android-ndk-dl/env.sh` and
  `CARGO_TARGET_DIR=~/projects/.target-detect-android`.
- Update a baseline only with the change that moved it, and explain every
  moved gated number in `PROGRESS.md`.
