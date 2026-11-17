# Grading limits: what the scorer has been shown to get right

> **Synthetic audio only.** Every number here comes from tones generated in
> `src-tauri/tests/audio_fixtures.rs` and fed through the real onset detector,
> `ScheduleRun` and `TakeGrade`. They show what the machinery does on signals
> built to be hard. They say nothing about a real guitar, a real rig or a real
> room. `src-tauri/tests/audio_fixtures/recordings/` is empty: no recording has
> been through this yet.

Regenerate with `npm run test:grading:measure` (a release build, then the four
`#[ignore]`d measurement tests). These tables were measured on 2026-11-16 on
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
- **Note identity** is right on damped, clean and high-gain tones to about
  200 BPM, and mostly **unheard** on ringing and swept tones, where the next
  note starts over the last one. Since 2026-11-16 a Session Take's pass rule
  measures `noteIdentity` from these numbers, and only where they hold
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
`src/session/takeBand.ts`), 8 bars, Takes at 70, 80 and 90 BPM.

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

96 notes per row. `ratio`: right over right plus wrong, of the notes heard.

| Signal | gap ms | sixteenths at | right | wrong | octave | unheard | ratio |
|---|---|---|---|---|---|---|---|
| damped | 187.5 | 80 | 95 | 0 | 0 | 1 | 1.00 |
| damped | 150.0 | 100 | 95 | 0 | 0 | 1 | 1.00 |
| damped | 125.0 | 120 | 95 | 0 | 0 | 1 | 1.00 |
| damped | 107.1 | 140 | 95 | 0 | 0 | 1 | 1.00 |
| damped | 93.8 | 160 | 95 | 0 | 0 | 1 | 1.00 |
| damped | 83.3 | 180 | 95 | 0 | 0 | 1 | 1.00 |
| damped | 75.0 | 200 | 94 | 1 | 0 | 1 | 0.99 |
| damped | 68.2 | 220 | 85 | 10 | 0 | 1 | 0.89 |
| damped | 62.5 | 240 | 59 | 29 | 0 | 8 | 0.67 |
| damped | 57.7 | 260 | 17 | 20 | 0 | 59 | 0.46 |
| clean | 187.5 | 80 | 96 | 0 | 0 | 0 | 1.00 |
| clean | 150.0 | 100 | 96 | 0 | 0 | 0 | 1.00 |
| clean | 125.0 | 120 | 96 | 0 | 0 | 0 | 1.00 |
| clean | 107.1 | 140 | 96 | 0 | 0 | 0 | 1.00 |
| clean | 93.8 | 160 | 96 | 0 | 0 | 0 | 1.00 |
| clean | 83.3 | 180 | 96 | 0 | 0 | 0 | 1.00 |
| clean | 75.0 | 200 | 96 | 0 | 0 | 0 | 1.00 |
| clean | 68.2 | 220 | 90 | 6 | 0 | 0 | 0.94 |
| clean | 62.5 | 240 | 74 | 20 | 0 | 2 | 0.79 |
| clean | 57.7 | 260 | 48 | 23 | 0 | 25 | 0.68 |
| ringing | 187.5 | 80 | 46 | 0 | 0 | 50 | 1.00 |
| ringing | 150.0 | 100 | 29 | 0 | 0 | 67 | 1.00 |
| ringing | 125.0 | 120 | 16 | 0 | 0 | 80 | 1.00 |
| ringing | 107.1 | 140 | 9 | 0 | 0 | 87 | 1.00 |
| ringing | 93.8 | 160 | 4 | 0 | 0 | 92 | 1.00 |
| ringing | 83.3 | 180 | 2 | 0 | 0 | 94 | 1.00 |
| ringing | 75.0 | 200 | 2 | 0 | 0 | 94 | 1.00 |
| ringing | 68.2 | 220 | 1 | 0 | 0 | 95 | 1.00 |
| ringing | 62.5 | 240 | 1 | 1 | 0 | 94 | 0.50 |
| ringing | 57.7 | 260 | 1 | 1 | 0 | 94 | 0.50 |
| high-gain | 187.5 | 80 | 96 | 0 | 0 | 0 | 1.00 |
| high-gain | 150.0 | 100 | 96 | 0 | 0 | 0 | 1.00 |
| high-gain | 125.0 | 120 | 96 | 0 | 0 | 0 | 1.00 |
| high-gain | 107.1 | 140 | 96 | 0 | 0 | 0 | 1.00 |
| high-gain | 93.8 | 160 | 96 | 0 | 0 | 0 | 1.00 |
| high-gain | 83.3 | 180 | 96 | 0 | 0 | 0 | 1.00 |
| high-gain | 75.0 | 200 | 96 | 0 | 0 | 0 | 1.00 |
| high-gain | 68.2 | 220 | 96 | 0 | 0 | 0 | 1.00 |
| high-gain | 62.5 | 240 | 92 | 4 | 0 | 0 | 0.96 |
| high-gain | 57.7 | 260 | 75 | 19 | 0 | 2 | 0.80 |
| high-gain-ringing | 187.5 | 80 | 34 | 0 | 0 | 62 | 1.00 |
| high-gain-ringing | 150.0 | 100 | 20 | 0 | 0 | 76 | 1.00 |
| high-gain-ringing | 125.0 | 120 | 11 | 0 | 1 | 84 | 0.92 |
| high-gain-ringing | 107.1 | 140 | 2 | 0 | 0 | 94 | 1.00 |
| high-gain-ringing | 93.8 | 160 | 1 | 0 | 0 | 95 | 1.00 |
| high-gain-ringing | 83.3 | 180 | 1 | 0 | 0 | 95 | 1.00 |
| high-gain-ringing | 75.0 | 200 | 1 | 0 | 0 | 95 | 1.00 |
| high-gain-ringing | 68.2 | 220 | 1 | 0 | 0 | 95 | 1.00 |
| high-gain-ringing | 62.5 | 240 | 1 | 1 | 0 | 94 | 0.50 |
| high-gain-ringing | 57.7 | 260 | 1 | 1 | 0 | 94 | 0.50 |
| swept | 187.5 | 80 | 44 | 0 | 1 | 51 | 0.98 |
| swept | 150.0 | 100 | 21 | 0 | 1 | 74 | 0.95 |
| swept | 125.0 | 120 | 8 | 0 | 3 | 85 | 0.73 |
| swept | 107.1 | 140 | 3 | 0 | 1 | 92 | 0.75 |
| swept | 93.8 | 160 | 2 | 0 | 1 | 93 | 0.67 |
| swept | 83.3 | 180 | 1 | 0 | 0 | 95 | 1.00 |
| swept | 75.0 | 200 | 1 | 0 | 0 | 95 | 1.00 |
| swept | 68.2 | 220 | 1 | 0 | 0 | 95 | 1.00 |
| swept | 62.5 | 240 | 1 | 1 | 0 | 94 | 0.50 |
| swept | 57.7 | 260 | 0 | 0 | 0 | 96 | - |
