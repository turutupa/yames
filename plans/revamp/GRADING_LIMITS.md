# Grading limits: what the scorer has been shown to get right

> **Synthetic audio only.** Every number here comes from tones generated in
> `src-tauri/tests/audio_fixtures.rs` and fed through the real onset detector,
> `ScheduleRun` and `TakeGrade`. They show what the machinery does on signals
> built to be hard. They say nothing about a real guitar, a real rig or a real
> room. `src-tauri/tests/audio_fixtures/recordings/` is empty: no recording has
> been through this yet.

Regenerate with `npm run test:grading:measure` (a release build, then the four
`#[ignore]`d measurement tests). These tables were measured on 2026-11-16 (note identity re-measured on 2026-11-19) on
`revamp` at the detector the revamp ships: 256-sample hops, the ring cursor, the
noise floor that learns only from quiet hops, and the known-score refractory at
0.5 of the score's smallest gap (`onset.rs` `KNOWN_SCORE_REFRACTORY_FACTOR`).

This file was cited by the code before it existed in git: the original was
lost when the machine it was written on crashed (2026-11-10). The old-feed
figures it held (for example 16 to 25 of 128 sustained notes heard before the
noise floor fix, quoted in `audio_fixtures.rs`) came from code that no longer
exists and cannot be re-measured; the tests that pin the fixes still assert the
new behaviour.

## What the numbers say

- **Timing holds to sixteenths at about 260 BPM** on damped, clean, ringing and
  high-gain tones (a 58 ms gap): 95% of notes or more heard, no extras, and
  measured evenness within 0.05 of the truth. Past that, notes go unheard
  before anything else goes wrong. Sustained high gain gives out first, at
  240 BPM; the swept arpeggio at 260.
- **Evenness tracks the truth** across the range a pass bar cares about. With
  players whose timing spreads by 5 to 20 ms, the measured evenness sits within
  about 0.03 of the true value up to 120 BPM. Sloppier and faster, the detector
  starts losing notes and evenness reads **higher** than the truth (0.54 against
  0.30 at 160 BPM and 30 ms), because the notes it misses are the worst-placed
  ones. A pass bar on evenness is therefore only trustworthy where notes heard
  is also high, which is why every Alternate Picking bar pairs the two.
- **A constant rig lag costs almost nothing** with the lag correction on (a
  Session Take): up to 110 ms, every note is matched at 80 to 120 BPM and the
  evenness is unchanged; at 160 BPM one note of 128 is lost from 60 ms. The
  headline score starts to dip at 110 ms; the pass rule does not read it.
- **Note identity** is right on damped, clean and high-gain tones down to the
  75 ms gap the pass rule stops at (sixteenths at 200 BPM): 0.99 to 1.00
  through the production path, the one a Session Take takes
  (`ScheduleRun::report_with_notes`). Until 2026-11-19 it was not: the pass
  looked every note up at the detector's timestamp, which is aubio's
  peak-picking delay (24.5 ms at 48 kHz) after the attack, and at sixteenths
  above about 150 BPM it read each note from inside the next one (0.27 to 0.89
  right at 160 to 200 BPM, table below). The old table here was measured
  through the test's own `identify()` helper, which looks notes up where they
  were played, and so could not show it. It is mostly **unheard** on ringing
  and swept tones, where the next note starts over the last one. A Session
  Take's pass rule measures `noteIdentity` only where these numbers hold
  (`score/pass.rs` `notes_status`): notes at least 75 ms apart, at least 12
  heard notes with a pitch, a pitch for at least 60% of the heard notes (which
  is what rules out the ringing and swept rows), and no more than a quarter of
  them an octave out. Anywhere else it stays "not assessed", with the reason.
  On the swept tone the tracker also calls octaves (13 of 32 on a two-string
  sweep at 80 BPM), so sweeps read "not checked" either way. All of it is
  synthetic until a real rig says otherwise.
- **`MIN_MEDIAN_CONFIDENCE` (0.15)** and **`MIN_HEARD_RATIO` (0.5)** are not
  approached by any tone here at a sane input level. They are design values
  until a real rig has been through them.

## How long a Take is, and the slack in it (owner, 2026-11-17)

Not a measurement: the rule the numbers below are judged under.

- **A Take is the stretch it is judged over, plus two bars of slack.**
  `takeBarsOf` in `src/session/grade.ts`: `max(8, longest overBars) + 2`
  (`TAKE_SLACK_BARS`), and never less than one whole pass of the Exercise. A
  one-, two- or four-bar drill is 10 bars; a Stamina minute (`overBars` 16)
  is 18, the tapping minute (20) is 22; a 12-bar blues is still 12, a 16-bar
  etude still 16. Until 2026-11-17 it was `max(8, overBars)` rounded up to
  whole passes, so an 8-bar Take had to hold every bar, and one fluffed bar
  anywhere lost the clean tempo.
- **The last pass can stop part-way.** Rounding up to whole passes would make
  a 4-bar lick 12 bars and a 16-bar Stamina pattern 32, so the Take is cut on
  the bar line instead (`take.ts` `writtenOut`): a 4-bar lick plays two and a
  half times. Nothing depends on whole passes: the scorer reads the
  schedule's own length (`score.rs` `finished_bars_of`), the band plays bar
  `b` of its chart as `b mod form` (`takeBand.ts`), a note never crosses a bar
  line in a pack, and the engine stops on the last bar's sample.
- **Any 8 clean bars in a row earn the clean tempo, and pass.** `pass.rs`
  slides its `W`-bar window one bar at a time over the finished bars, and
  `heldBars` is the run of windows that held; 8 or more counts. So the first
  or the last bar of a 10-bar Take (or both, or the first two) can be fluffed
  and the Take still counts; a bad bar in the middle of a 10-bar Take leaves
  no 8 in a row, and it passes without moving the clean tempo. The TypeScript
  fallback (`grade.ts`, a build without `pass`) asks the same: its clean tempo
  needs the best 8-bar stretch of per-bar evenness to meet the bar.
- **`evennessHold` reads the end of the stretch, not of the Take**, so a
  Stamina minute whose 16 bars held is not lost to a fluffed bar in the slack.
- Every graded Exercise of every runnable Path is played as a Session Take of
  the new length in `path_exercises.rs`, clean, with the first bar fluffed and
  with the last: all pass and count. `tests/e2e` plays a Take whose first bar
  is 80 ms of scatter in the real app.
- **Benchmarks** (days 1, 7, 14, 21) play the same Exercise at the same tempo,
  and from 2026-11-17 at the new length. What they compare is ratios (evenness,
  notes heard per notes due, extras per four bars) and the clean verdict, which
  the length does not change; counts of notes do change (an 8-bar Take of 32
  notes is a 10-bar Take of 40). A benchmark row keeps its `bars`, so a
  before-and-after pair across the change can be told apart.

## Open, for the first real recordings

- The known-score refractory is at 0.5 (`onset.rs`). If real takes show extra
  notes over the bar inside fast runs, it goes back up.
- Whether a cached calibration from before the detector change still holds: the
  256-sample hops were chosen to keep the detector's latency, but that is
  measured here on synthetic audio only.

## Over the band (the real app, 2026-11-16)

Not synthetic tones through the fixtures: the built app on Linux (`tests/e2e`,
scenario `blues-band`), a Karplus-Strong guitar into a virtual input, "A on
every downbeat" (Blues and Pentatonics, a Texas shuffle, drums and bass from
`src/session/takeBand.ts`), 8 bars (the Take length until 2026-11-17; it is
10 now), Takes at 70, 80 and 90 BPM.

| Take | band 0.8, no bleed | band at 0 (click) | band 0.8, bleed -20 dB | band 0.8, bleed -30 dB |
|---|---|---|---|---|
| good (1.5 ms) | passed; even 0.998, 40/40, extras 0, notes 1.00 | passed; 0.998, 40/40, 0 | **failed**; 0.995, 40/40, extras 21 | **failed**; 0.992, extras 22 |
| sloppy 35 ms | passed; 0.80 | passed; 0.76 | failed on extras; reads **0.994** | failed on extras; reads 0.994 |
| sloppy 80 ms | failed; 0.56, 27/39, extras 11 | failed; 0.65, 30/40, extras 8 | failed; reads 0.992 | failed; reads 0.996 |
| wrong notes (every other one a semitone sharp) | failed; notes 0.50 | | failed; notes 0.53 | failed; notes 0.50 |

- **Through an interface (no bleed) the band changes nothing**: the same
  verdicts and numbers as the click, within run-to-run spread. The band's notes
  are not in the schedule, so nothing it plays is expected or graded.
- **Into a microphone the band breaks grading**, even 30 dB down: its strokes
  are onsets the scorer counts as extra notes (a clean take fails), and on a
  beat where the guitar is late the drummer's on-time stroke is matched instead
  (a sloppy take reads perfectly even). So a graded Take on an input that is
  not a recognised interface starts with the band OFF (`bandVolumeFor`), and
  the screen says to wear headphones and turn it up. The ungraded finisher
  always has the band.
- 35 ms of scatter passes this Exercise at 70-80 BPM band or no band: its
  evenness bar is 0.6 over the best four bars. That is the Exercise's bar.
- Open: discounting onsets that coincide with the band's own (the engine knows
  every band onset to the sample) would let a microphone player keep the band;
  that is scorer work in `src-tauri/src/score`.

## Timing, by signal and tempo

128 sixteenths per row. `evenness (true)`: measured, then the generator's own.
`holds`: at least 95% heard, extras at most 2%, evenness within 0.05 of the truth.

| Signal | gap ms | sixteenths at | heard | extra | evenness (true) | stamp sd ms | holds |
|---|---|---|---|---|---|---|---|
| damped | 187.5 | 80 | 128/128 | 0 | 0.99 (1.00) | 2.3 | yes |
| damped | 150.0 | 100 | 128/128 | 0 | 0.99 (1.00) | 1.9 | yes |
| damped | 125.0 | 120 | 128/128 | 0 | 0.99 (0.99) | 2.2 | yes |
| damped | 107.1 | 140 | 128/128 | 0 | 0.98 (0.99) | 2.2 | yes |
| damped | 93.8 | 160 | 128/128 | 0 | 0.98 (0.99) | 2.0 | yes |
| damped | 83.3 | 180 | 128/128 | 0 | 0.97 (0.98) | 2.2 | yes |
| damped | 75.0 | 200 | 128/128 | 0 | 0.98 (0.98) | 2.0 | yes |
| damped | 68.2 | 220 | 128/128 | 0 | 0.97 (0.98) | 2.2 | yes |
| damped | 62.5 | 240 | 127/128 | 0 | 0.96 (0.97) | 2.1 | yes |
| damped | 57.7 | 260 | 124/128 | 0 | 0.95 (0.97) | 2.2 | yes |
| damped | 53.6 | 280 | 103/128 | 0 | 0.94 (0.96) | 2.2 | **no** |
| damped | 50.0 | 300 | 83/128 | 0 | 0.94 (0.96) | 11.9 | **no** |
| clean | 187.5 | 80 | 128/128 | 0 | 0.99 (1.00) | 2.3 | yes |
| clean | 150.0 | 100 | 128/128 | 0 | 0.99 (1.00) | 1.9 | yes |
| clean | 125.0 | 120 | 128/128 | 0 | 0.99 (0.99) | 2.1 | yes |
| clean | 107.1 | 140 | 128/128 | 0 | 0.98 (0.99) | 2.1 | yes |
| clean | 93.8 | 160 | 128/128 | 0 | 0.98 (0.99) | 2.1 | yes |
| clean | 83.3 | 180 | 128/128 | 0 | 0.97 (0.98) | 2.2 | yes |
| clean | 75.0 | 200 | 128/128 | 0 | 0.97 (0.98) | 2.1 | yes |
| clean | 68.2 | 220 | 128/128 | 0 | 0.97 (0.98) | 2.0 | yes |
| clean | 62.5 | 240 | 128/128 | 0 | 0.95 (0.97) | 2.1 | yes |
| clean | 57.7 | 260 | 123/128 | 0 | 0.95 (0.97) | 2.2 | yes |
| clean | 53.6 | 280 | 101/128 | 0 | 0.94 (0.96) | 2.2 | **no** |
| clean | 50.0 | 300 | 83/128 | 0 | 0.93 (0.96) | 11.9 | **no** |
| ringing | 187.5 | 80 | 128/128 | 0 | 0.99 (1.00) | 2.3 | yes |
| ringing | 150.0 | 100 | 128/128 | 0 | 0.99 (1.00) | 2.0 | yes |
| ringing | 125.0 | 120 | 128/128 | 0 | 0.99 (0.99) | 2.4 | yes |
| ringing | 107.1 | 140 | 128/128 | 0 | 0.98 (0.99) | 2.6 | yes |
| ringing | 93.8 | 160 | 128/128 | 0 | 0.98 (0.99) | 2.3 | yes |
| ringing | 83.3 | 180 | 128/128 | 0 | 0.97 (0.98) | 2.5 | yes |
| ringing | 75.0 | 200 | 128/128 | 0 | 0.97 (0.98) | 2.4 | yes |
| ringing | 68.2 | 220 | 128/128 | 0 | 0.95 (0.98) | 2.3 | yes |
| ringing | 62.5 | 240 | 128/128 | 0 | 0.97 (0.97) | 2.2 | yes |
| ringing | 57.7 | 260 | 122/128 | 0 | 0.95 (0.97) | 2.1 | yes |
| ringing | 53.6 | 280 | 102/128 | 0 | 0.93 (0.96) | 2.2 | **no** |
| ringing | 50.0 | 300 | 82/128 | 0 | 0.93 (0.96) | 5.2 | **no** |
| high-gain | 187.5 | 80 | 128/128 | 0 | 1.00 (1.00) | 2.3 | yes |
| high-gain | 150.0 | 100 | 128/128 | 0 | 0.99 (1.00) | 2.1 | yes |
| high-gain | 125.0 | 120 | 128/128 | 0 | 0.99 (0.99) | 2.3 | yes |
| high-gain | 107.1 | 140 | 128/128 | 0 | 0.99 (0.99) | 2.3 | yes |
| high-gain | 93.8 | 160 | 128/128 | 0 | 0.98 (0.99) | 2.1 | yes |
| high-gain | 83.3 | 180 | 128/128 | 0 | 0.97 (0.98) | 2.3 | yes |
| high-gain | 75.0 | 200 | 128/128 | 0 | 0.97 (0.98) | 2.5 | yes |
| high-gain | 68.2 | 220 | 128/128 | 0 | 0.96 (0.98) | 2.6 | yes |
| high-gain | 62.5 | 240 | 128/128 | 0 | 0.96 (0.97) | 2.3 | yes |
| high-gain | 57.7 | 260 | 123/128 | 0 | 0.95 (0.97) | 2.5 | yes |
| high-gain | 53.6 | 280 | 102/128 | 0 | 0.94 (0.96) | 2.1 | **no** |
| high-gain | 50.0 | 300 | 82/128 | 0 | 0.94 (0.96) | 6.7 | **no** |
| high-gain-ringing | 187.5 | 80 | 128/128 | 0 | 0.99 (1.00) | 2.4 | yes |
| high-gain-ringing | 150.0 | 100 | 128/128 | 0 | 0.99 (1.00) | 2.2 | yes |
| high-gain-ringing | 125.0 | 120 | 128/128 | 0 | 0.98 (0.99) | 2.0 | yes |
| high-gain-ringing | 107.1 | 140 | 128/128 | 0 | 0.98 (0.99) | 2.1 | yes |
| high-gain-ringing | 93.8 | 160 | 128/128 | 0 | 0.98 (0.99) | 2.3 | yes |
| high-gain-ringing | 83.3 | 180 | 128/128 | 0 | 0.97 (0.98) | 2.5 | yes |
| high-gain-ringing | 75.0 | 200 | 128/128 | 0 | 0.97 (0.98) | 2.1 | yes |
| high-gain-ringing | 68.2 | 220 | 126/128 | 0 | 0.96 (0.98) | 2.2 | yes |
| high-gain-ringing | 62.5 | 240 | 120/128 | 0 | 0.96 (0.97) | 2.1 | **no** |
| high-gain-ringing | 57.7 | 260 | 108/128 | 0 | 0.96 (0.97) | 1.9 | **no** |
| high-gain-ringing | 53.6 | 280 | 79/128 | 0 | 0.95 (0.96) | 2.1 | **no** |
| high-gain-ringing | 50.0 | 300 | 49/128 | 0 | - (0.96) | 2.1 | **no** |
| swept | 187.5 | 80 | 128/128 | 0 | 0.99 (1.00) | 2.8 | yes |
| swept | 150.0 | 100 | 128/128 | 0 | 0.99 (1.00) | 2.5 | yes |
| swept | 125.0 | 120 | 128/128 | 0 | 0.99 (0.99) | 2.9 | yes |
| swept | 107.1 | 140 | 128/128 | 0 | 0.98 (0.99) | 2.7 | yes |
| swept | 93.8 | 160 | 128/128 | 0 | 0.98 (0.99) | 2.8 | yes |
| swept | 83.3 | 180 | 128/128 | 0 | 0.97 (0.98) | 2.4 | yes |
| swept | 75.0 | 200 | 128/128 | 0 | 0.97 (0.98) | 2.4 | yes |
| swept | 68.2 | 220 | 128/128 | 0 | 0.95 (0.98) | 2.4 | yes |
| swept | 62.5 | 240 | 128/128 | 0 | 0.96 (0.97) | 2.2 | yes |
| swept | 57.7 | 260 | 121/128 | 0 | 0.95 (0.97) | 2.5 | **no** |
| swept | 53.6 | 280 | 106/128 | 0 | 0.94 (0.96) | 2.4 | **no** |
| swept | 50.0 | 300 | 82/128 | 0 | 0.91 (0.96) | 7.0 | **no** |

## Sloppy players

The same 128 sixteenths, played with a spread of `player sigma ms` either way.

| Signal | BPM | player sigma ms | heard | extra | evenness (true) |
|---|---|---|---|---|---|
| clean | 80 | 5 | 128/128 | 0 | 0.99 (0.99) |
| clean | 80 | 10 | 128/128 | 0 | 0.95 (0.97) |
| clean | 80 | 15 | 128/128 | 0 | 0.93 (0.93) |
| clean | 80 | 20 | 128/128 | 0 | 0.87 (0.87) |
| clean | 80 | 30 | 123/128 | 3 | 0.75 (0.74) |
| clean | 120 | 5 | 128/128 | 0 | 0.98 (0.98) |
| clean | 120 | 10 | 128/128 | 0 | 0.92 (0.93) |
| clean | 120 | 15 | 128/128 | 0 | 0.86 (0.84) |
| clean | 120 | 20 | 123/128 | 2 | 0.75 (0.74) |
| clean | 120 | 30 | 112/128 | 7 | 0.60 (0.51) |
| clean | 160 | 5 | 128/128 | 0 | 0.96 (0.97) |
| clean | 160 | 10 | 128/128 | 0 | 0.85 (0.87) |
| clean | 160 | 15 | 122/128 | 3 | 0.77 (0.74) |
| clean | 160 | 20 | 113/128 | 6 | 0.67 (0.58) |
| clean | 160 | 30 | 91/128 | 17 | 0.54 (0.30) |
| clean | 200 | 5 | 128/128 | 0 | 0.96 (0.95) |
| clean | 200 | 10 | 121/128 | 0 | 0.82 (0.81) |
| clean | 200 | 15 | 106/128 | 4 | 0.65 (0.62) |
| clean | 200 | 20 | 92/128 | 11 | 0.55 (0.43) |
| clean | 200 | 30 | 79/128 | 17 | 0.43 (0.15) |
| high-gain-ringing | 80 | 5 | 128/128 | 0 | 0.99 (0.99) |
| high-gain-ringing | 80 | 10 | 128/128 | 0 | 0.95 (0.97) |
| high-gain-ringing | 80 | 15 | 128/128 | 0 | 0.93 (0.93) |
| high-gain-ringing | 80 | 20 | 128/128 | 0 | 0.86 (0.87) |
| high-gain-ringing | 80 | 30 | 123/128 | 3 | 0.76 (0.74) |
| high-gain-ringing | 120 | 5 | 128/128 | 0 | 0.97 (0.98) |
| high-gain-ringing | 120 | 10 | 128/128 | 0 | 0.92 (0.93) |
| high-gain-ringing | 120 | 15 | 128/128 | 0 | 0.86 (0.84) |
| high-gain-ringing | 120 | 20 | 122/128 | 3 | 0.76 (0.74) |
| high-gain-ringing | 120 | 30 | 111/128 | 6 | 0.61 (0.51) |
| high-gain-ringing | 160 | 5 | 128/128 | 0 | 0.95 (0.97) |
| high-gain-ringing | 160 | 10 | 128/128 | 0 | 0.86 (0.87) |
| high-gain-ringing | 160 | 15 | 120/128 | 3 | 0.75 (0.74) |
| high-gain-ringing | 160 | 20 | 115/128 | 4 | 0.66 (0.58) |
| high-gain-ringing | 160 | 30 | 92/128 | 16 | 0.55 (0.30) |
| high-gain-ringing | 200 | 5 | 128/128 | 0 | 0.94 (0.95) |
| high-gain-ringing | 200 | 10 | 120/128 | 1 | 0.82 (0.81) |
| high-gain-ringing | 200 | 15 | 107/128 | 2 | 0.67 (0.62) |
| high-gain-ringing | 200 | 20 | 93/128 | 12 | 0.66 (0.43) |
| high-gain-ringing | 200 | 30 | 78/128 | 16 | 0.49 (0.15) |

## A constant rig lag

Clean tone, 128 sixteenths, lag added to every note, the Session's lag
correction on.

| lag ms | 80 BPM | 100 BPM | 120 BPM | 160 BPM |
|---|---|---|---|---|
| 0 | 128/128 even 0.99 score 99 | 128/128 even 0.99 score 99 | 128/128 even 0.98 score 98 | 128/128 even 0.96 score 96 |
| 30 | 128/128 even 0.99 score 99 | 128/128 even 0.99 score 99 | 128/128 even 0.98 score 98 | 128/128 even 0.96 score 96 |
| 40 | 128/128 even 0.99 score 99 | 128/128 even 0.99 score 99 | 128/128 even 0.98 score 98 | 128/128 even 0.96 score 96 |
| 50 | 128/128 even 0.99 score 99 | 128/128 even 0.99 score 99 | 128/128 even 0.98 score 98 | 128/128 even 0.96 score 96 |
| 60 | 128/128 even 0.99 score 99 | 128/128 even 0.99 score 99 | 128/128 even 0.98 score 98 | 127/128 even 0.96 score 90 |
| 80 | 128/128 even 0.99 score 99 | 128/128 even 0.99 score 99 | 128/128 even 0.98 score 98 | 127/128 even 0.96 score 96 |
| 110 | 128/128 even 0.99 score 97 | 128/128 even 0.99 score 94 | 128/128 even 0.98 score 93 | 127/128 even 0.96 score 96 |

## Note identity, by signal and tempo

Measured 2026-11-19 through the production path: the detector's own onsets
with a 30 ms system lag on top, the lag measured and corrected by the scorer,
and `ScheduleRun::report_with_notes` running the pitch pass over the Take's
audio with the Alternate Picking `noteIdentity` bar loaded
(`measure_note_identity_limit_by_signal`). 96 sixteenths per row, played right
(3 ms of player jitter). `right`, `wrong`, `octave` and `unpitched` are the
pass rule's own counts (`NotesCheck`); `ratio` is right over right plus wrong
plus octave; `status` is what `notes_status` makes of it, and only `Measured`
reaches the verdict. Rows under 75 ms are `TooFast` whatever they read.

| Signal | gap ms | sixteenths at | right | wrong | octave | unpitched | ratio | status |
|---|---|---|---|---|---|---|---|---|
| damped | 187.5 | 80 | 95 | 0 | 0 | 1 | 1.00 | Measured |
| damped | 150.0 | 100 | 95 | 0 | 0 | 1 | 1.00 | Measured |
| damped | 125.0 | 120 | 95 | 0 | 0 | 1 | 1.00 | Measured |
| damped | 107.1 | 140 | 95 | 0 | 0 | 1 | 1.00 | Measured |
| damped | 93.8 | 160 | 95 | 0 | 0 | 1 | 1.00 | Measured |
| damped | 83.3 | 180 | 95 | 0 | 0 | 1 | 1.00 | Measured |
| damped | 75.0 | 200 | 94 | 1 | 0 | 1 | 0.99 | Measured |
| damped | 68.2 | 220 | 89 | 6 | 0 | 1 | 0.94 | TooFast |
| damped | 62.5 | 240 | 60 | 29 | 0 | 6 | 0.67 | TooFast |
| damped | 57.7 | 260 | 23 | 22 | 0 | 49 | 0.51 | TooFast |
| clean | 187.5 | 80 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| clean | 150.0 | 100 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| clean | 125.0 | 120 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| clean | 107.1 | 140 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| clean | 93.8 | 160 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| clean | 83.3 | 180 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| clean | 75.0 | 200 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| clean | 68.2 | 220 | 91 | 5 | 0 | 0 | 0.95 | TooFast |
| clean | 62.5 | 240 | 78 | 16 | 0 | 2 | 0.83 | TooFast |
| clean | 57.7 | 260 | 53 | 23 | 0 | 17 | 0.70 | TooFast |
| ringing | 187.5 | 80 | 46 | 0 | 0 | 50 | 1.00 | NotesRing |
| ringing | 150.0 | 100 | 29 | 0 | 0 | 67 | 1.00 | NotesRing |
| ringing | 125.0 | 120 | 16 | 0 | 0 | 80 | 1.00 | NotesRing |
| ringing | 107.1 | 140 | 9 | 0 | 0 | 87 | 1.00 | TooFew |
| ringing | 93.8 | 160 | 4 | 0 | 0 | 92 | 1.00 | TooFew |
| ringing | 83.3 | 180 | 2 | 0 | 0 | 94 | 1.00 | TooFew |
| ringing | 75.0 | 200 | 2 | 0 | 0 | 94 | 1.00 | TooFew |
| ringing | 68.2 | 220 | 1 | 0 | 0 | 95 | 1.00 | TooFast |
| ringing | 62.5 | 240 | 1 | 1 | 0 | 94 | 0.50 | TooFast |
| ringing | 57.7 | 260 | 1 | 1 | 0 | 91 | 0.50 | TooFast |
| high-gain | 187.5 | 80 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| high-gain | 150.0 | 100 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| high-gain | 125.0 | 120 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| high-gain | 107.1 | 140 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| high-gain | 93.8 | 160 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| high-gain | 83.3 | 180 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| high-gain | 75.0 | 200 | 96 | 0 | 0 | 0 | 1.00 | Measured |
| high-gain | 68.2 | 220 | 94 | 2 | 0 | 0 | 0.98 | TooFast |
| high-gain | 62.5 | 240 | 85 | 11 | 0 | 0 | 0.89 | TooFast |
| high-gain | 57.7 | 260 | 66 | 22 | 0 | 6 | 0.75 | TooFast |
| high-gain-ringing | 187.5 | 80 | 34 | 0 | 0 | 62 | 1.00 | NotesRing |
| high-gain-ringing | 150.0 | 100 | 20 | 0 | 0 | 76 | 1.00 | NotesRing |
| high-gain-ringing | 125.0 | 120 | 11 | 0 | 1 | 84 | 0.92 | NotesRing |
| high-gain-ringing | 107.1 | 140 | 2 | 0 | 0 | 94 | 1.00 | TooFew |
| high-gain-ringing | 93.8 | 160 | 1 | 0 | 0 | 95 | 1.00 | TooFew |
| high-gain-ringing | 83.3 | 180 | 1 | 0 | 0 | 95 | 1.00 | TooFew |
| high-gain-ringing | 75.0 | 200 | 1 | 0 | 0 | 95 | 1.00 | TooFew |
| high-gain-ringing | 68.2 | 220 | 1 | 0 | 0 | 93 | 1.00 | TooFast |
| high-gain-ringing | 62.5 | 240 | 1 | 1 | 0 | 87 | 0.50 | TooFast |
| high-gain-ringing | 57.7 | 260 | 1 | 1 | 0 | 79 | 0.50 | TooFast |
| swept | 187.5 | 80 | 44 | 0 | 1 | 51 | 0.98 | NotesRing |
| swept | 150.0 | 100 | 21 | 0 | 1 | 74 | 0.95 | NotesRing |
| swept | 125.0 | 120 | 8 | 0 | 3 | 85 | 0.73 | TooFew |
| swept | 107.1 | 140 | 3 | 0 | 1 | 92 | 0.75 | TooFew |
| swept | 93.8 | 160 | 2 | 0 | 1 | 93 | 0.67 | TooFew |
| swept | 83.3 | 180 | 1 | 0 | 0 | 95 | 1.00 | TooFew |
| swept | 75.0 | 200 | 1 | 0 | 0 | 95 | 1.00 | TooFew |
| swept | 68.2 | 220 | 1 | 0 | 0 | 95 | 1.00 | TooFast |
| swept | 62.5 | 240 | 1 | 1 | 0 | 94 | 0.50 | TooFast |
| swept | 57.7 | 260 | 0 | 0 | 0 | 91 | - | TooFast |

### What the 2026-11-19 fix changed

The pass used to read each note at its onset's timestamp. The timestamp is the
end of the hop in which aubio's peak picker called the onset, 4.6 hops (24.5 ms
at 48 kHz) after the attack, and the tracker then skips another 20 ms of
attack, so each note was read from about 45 ms after it began. Timing never
minded, because the scorer measures and removes a constant lag per Take; the
pitch pass is the one consumer that puts an onset's time onto the input's
samples. It now takes the detector's delay off every look-up and every cut
(`OnsetCore::detection_delay_ns`, carried with the Take's audio). Same rows,
before and after, everything else identical:

| Signal | gap ms | sixteenths at | as shipped (read at the stamp) | read at the attack |
|---|---|---|---|---|
| damped | 107.1 | 140 | 1.00 | 1.00 |
| damped | 93.8 | 160 | 0.83 | 1.00 |
| damped | 83.3 | 180 | 0.53 | 1.00 |
| damped | 75.0 | 200 | 0.27 | 0.99 |
| clean | 107.1 | 140 | 1.00 | 1.00 |
| clean | 93.8 | 160 | 0.83 | 1.00 |
| clean | 83.3 | 180 | 0.52 | 1.00 |
| clean | 75.0 | 200 | 0.31 | 1.00 |
| high-gain | 107.1 | 140 | 1.00 | 1.00 |
| high-gain | 93.8 | 160 | 0.89 | 1.00 |
| high-gain | 83.3 | 180 | 0.55 | 1.00 |
| high-gain | 75.0 | 200 | 0.36 | 1.00 |

At 140 BPM and slower nothing moved. At 150 BPM (100 ms) the gate test
`right_sixteenths_are_right_at_every_speed_the_pass_checks` read 0.95 clean,
0.91 damped and 0.98 high-gain before, 1.00 on all three after. Wrong notes are still wrong: a quarter of
the notes a semitone off at 180 BPM reads 0.75 and fails
(`wrong_sixteenths_are_still_wrong_at_speed`). Timing rows are unchanged: the
onsets' timestamps did not move.

