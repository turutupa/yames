# Detection bench

`{"chains":["di","di_gain","laptop_mic","phone_mic","phone_agc","laptop_noisy","laptop_reverb"],"mode":"fast","noteModel":"basic-pitch icassp-2022 on onnxruntime (ort)","notes":15855,"takes":329}`

Synthetic guitar (a string model, fixed seeds) through the production detector, scorer, right-notes pass and verifier. Every number is reproducible with `npm run detect:bench`; see `plans/detection/MEASURE.md`.

## Notes played as written

### Onset heard by the live detector and matcher

Share of correctly played notes the timing grade counts as heard.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 87% | 100% | 78% | 99% | 70% | 65% | 98% | 100% |
| picked_16ths_160_220 | 2016 | 72% | 100% | 99% | 100% | 10% | 0% | 93% | 100% |
| palm_mute | 280 | 96% | 100% | 100% | 100% | 90% | 82% | 100% | 100% |
| hammer | 168 | 36% | 100% | 75% | 62% | 0% | 0% | 0% | 17% |
| pull | 168 | 51% | 100% | 79% | 75% | 4% | 29% | 0% | 67% |
| tap | 112 | 72% | 100% | 100% | 100% | 31% | 31% | 44% | 100% |
| slide_to | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 63 | 92% | 100% | 100% | 100% | 100% | 44% | 100% | 100% |
| bend_release | 56 | 86% | 100% | 100% | 100% | 100% | 0% | 100% | 100% |
| vibrato | 7 | 86% | 100% | 0% | 100% | 100% | 100% | 100% | 100% |
| harmonic | 112 | 81% | 100% | 100% | 100% | 81% | 6% | 81% | 100% |
| sweep | 224 | 96% | 100% | 100% | 100% | 78% | 94% | 100% | 100% |
| chord_tone | 168 | 79% | 100% | 50% | 100% | 100% | 0% | 100% | 100% |

### Confirmed by the verifier

Share of correctly played notes the note model confirms.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| picked_16ths_160_220 | 2016 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| palm_mute | 280 | 95% | 100% | 100% | 100% | 85% | 88% | 95% | 100% |
| hammer | 168 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| pull | 168 | 98% | 100% | 100% | 100% | 100% | 100% | 88% | 100% |
| tap | 112 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| slide_to | 28 | 75% | 100% | 100% | 100% | 25% | 75% | 25% | 100% |
| bend | 63 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| bend_release | 56 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| vibrato | 7 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| harmonic | 112 | 97% | 100% | 100% | 100% | 100% | 100% | 81% | 100% |
| sweep | 224 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| chord_tone | 168 | 57% | 67% | 25% | 62% | 71% | 58% | 62% | 50% |

### Verifier: couldn't tell

Correct notes the verifier gives no verdict on. Never a miss, never blocks a pass.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked_16ths_160_220 | 2016 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 280 | 2% | 0% | 0% | 0% | 5% | 5% | 5% | 0% |
| hammer | 168 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| pull | 168 | 1% | 0% | 0% | 0% | 0% | 0% | 8% | 0% |
| tap | 112 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 28 | 21% | 0% | 0% | 0% | 75% | 25% | 50% | 0% |
| bend | 63 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend_release | 56 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| vibrato | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 112 | 3% | 0% | 0% | 0% | 0% | 0% | 19% | 0% |
| sweep | 224 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| chord_tone | 168 | 38% | 21% | 54% | 38% | 29% | 38% | 33% | 50% |

### Verifier: wrongly declined

Correct notes the verifier calls not sounded or wrong. The number that must stay near zero.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked_16ths_160_220 | 2016 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 280 | 2% | 0% | 0% | 0% | 10% | 8% | 0% | 0% |
| hammer | 168 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| pull | 168 | 1% | 0% | 0% | 0% | 0% | 0% | 4% | 0% |
| tap | 112 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 28 | 4% | 0% | 0% | 0% | 0% | 0% | 25% | 0% |
| bend | 63 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend_release | 56 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| vibrato | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 112 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 224 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| chord_tone | 168 | 6% | 12% | 21% | 0% | 0% | 4% | 4% | 0% |

### Right notes as graded: counted right

What `noteIdentity` counts once the pitch pass and the verifier are merged (`score::verify::merge_states`). Only notes the matcher heard can be counted.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 87% | 100% | 78% | 99% | 70% | 65% | 98% | 100% |
| picked_16ths_160_220 | 2016 | 72% | 100% | 99% | 100% | 10% | 0% | 93% | 100% |
| palm_mute | 280 | 94% | 100% | 100% | 100% | 80% | 78% | 100% | 100% |
| hammer | 168 | 36% | 100% | 75% | 62% | 0% | 0% | 0% | 17% |
| pull | 168 | 51% | 100% | 79% | 75% | 4% | 29% | 0% | 67% |
| tap | 112 | 72% | 100% | 100% | 100% | 31% | 31% | 44% | 100% |
| slide_to | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 63 | 92% | 100% | 100% | 100% | 100% | 44% | 100% | 100% |
| bend_release | 56 | 86% | 100% | 100% | 100% | 100% | 0% | 100% | 100% |
| vibrato | 7 | 86% | 100% | 0% | 100% | 100% | 100% | 100% | 100% |
| harmonic | 112 | 80% | 100% | 100% | 100% | 81% | 6% | 75% | 100% |
| sweep | 224 | 96% | 100% | 100% | 100% | 78% | 94% | 100% | 100% |

### Right notes as graded: counted wrong

Correct notes the grade counts as wrong. The player is wronged by these.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked_16ths_160_220 | 2016 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 280 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| hammer | 168 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| pull | 168 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 112 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 63 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend_release | 56 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| vibrato | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 112 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 224 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |

### Right-notes pass says right

The pitch tracker's verdict on correct notes, when asked (whether a Take is graded on it depends on its pass bars).

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 79% | 95% | 65% | 97% | 59% | 60% | 84% | 91% |
| picked_16ths_160_220 | 2016 | 60% | 98% | 98% | 98% | 3% | 0% | 79% | 47% |
| palm_mute | 280 | 94% | 100% | 100% | 100% | 88% | 80% | 92% | 100% |
| hammer | 168 | 27% | 96% | 29% | 54% | 0% | 0% | 0% | 12% |
| pull | 168 | 42% | 100% | 71% | 71% | 0% | 0% | 0% | 50% |
| tap | 112 | 27% | 0% | 0% | 31% | 25% | 19% | 19% | 94% |
| slide_to | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 63 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend_release | 56 | 9% | 12% | 12% | 12% | 0% | 0% | 0% | 25% |
| vibrato | 7 | 71% | 100% | 0% | 100% | 100% | 100% | 0% | 100% |
| harmonic | 112 | 47% | 94% | 100% | 50% | 19% | 0% | 6% | 62% |
| sweep | 224 | 71% | 47% | 47% | 91% | 66% | 91% | 56% | 97% |

### Right-notes pass says wrong

Correct notes the pitch tracker calls wrong or an octave out.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 6% | 4% | 12% | 2% | 11% | 3% | 2% | 5% |
| picked_16ths_160_220 | 2016 | 4% | 2% | 1% | 2% | 7% | 0% | 7% | 7% |
| palm_mute | 280 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| hammer | 168 | 9% | 4% | 46% | 8% | 0% | 0% | 0% | 4% |
| pull | 168 | 5% | 0% | 8% | 0% | 0% | 12% | 0% | 17% |
| tap | 112 | 43% | 100% | 100% | 69% | 6% | 12% | 6% | 6% |
| slide_to | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 63 | 89% | 100% | 100% | 100% | 100% | 44% | 78% | 100% |
| bend_release | 56 | 62% | 88% | 88% | 88% | 88% | 0% | 12% | 75% |
| vibrato | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 112 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 224 | 17% | 50% | 50% | 6% | 6% | 0% | 3% | 0% |

### Timing scatter of the live detector, ms

Robust spread of matched onset times against the true note times, each Take's constant lag removed.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1651 | 2.7 | 2.6 | 2.8 | 2.7 | 2.3 | 2.6 | 2.7 | 2.7 |
| picked_16ths_160_220 | 1448 | 2.4 | 2.4 | 2.7 | 2.2 | 1.7 | - | 2.4 | 2.5 |
| palm_mute | 269 | 2.0 | 1.9 | 2.1 | 1.6 | 2.5 | 2.7 | 1.9 | 2.0 |
| hammer | 61 | 1.9 | 1.8 | 2.0 | 2.1 | - | - | - | 0.7 |
| pull | 85 | 1.2 | 1.1 | 1.3 | 1.3 | 0.0 | 1.4 | - | 1.1 |
| tap | 81 | 1.4 | 1.7 | 1.8 | 1.8 | 0.8 | 1.7 | 0.9 | 1.8 |
| bend | 58 | 1.8 | 1.6 | 3.1 | 1.6 | 1.6 | 1.7 | 1.6 | 1.6 |
| bend_release | 48 | 3.0 | 3.1 | 3.1 | 2.4 | 3.4 | - | 3.4 | 2.4 |
| vibrato | 6 | 0.1 | 0.0 | - | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| harmonic | 90 | 2.1 | 2.5 | 2.5 | 1.9 | 1.8 | - | 1.3 | 1.9 |
| sweep | 215 | 2.2 | 2.1 | 2.5 | 2.4 | 1.8 | 2.2 | 2.2 | 2.3 |

### Where the right-notes pass reads a note, against its true attack, ms

Size of the median error of the production look-up time. Near zero or the pass reads the wrong note at speed (the M0 bug was +25).

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 4013 | 0.9 | 0.4 | 1.1 | 0.8 | 0.9 | 0.9 | 1.3 | 1.0 |

### Where the right-notes pass cuts its track, against the true attack, ms

The same for the cuts between notes.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 4013 | 0.9 | 0.4 | 1.1 | 0.8 | 0.9 | 0.9 | 1.3 | 1.0 |

### Timing scatter of the verifier, ms

The same for the verifier's own start times.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 2.0 | 1.8 | 2.3 | 2.3 | 1.9 | 1.9 | 1.9 | 1.9 |
| picked_16ths_160_220 | 2016 | 2.1 | 2.1 | 2.3 | 2.2 | 2.1 | 2.1 | 2.1 | 2.0 |
| palm_mute | 267 | 2.0 | 1.9 | 2.5 | 2.1 | 1.8 | 1.8 | 2.2 | 2.1 |
| hammer | 168 | 2.5 | 2.4 | 2.0 | 1.1 | 2.9 | 2.8 | 2.2 | 3.0 |
| pull | 165 | 1.7 | 1.7 | 1.5 | 1.7 | 2.1 | 2.0 | 2.2 | 1.3 |
| tap | 112 | 1.3 | 1.1 | 1.1 | 0.8 | 1.1 | 1.1 | 1.3 | 0.8 |
| slide_to | 21 | 16.5 | 1.2 | 20.3 | 1.2 | 0.0 | 2.5 | 0.0 | 1.2 |
| bend | 63 | 2.0 | 1.8 | 2.0 | 2.4 | 2.0 | 2.0 | 1.8 | 2.4 |
| bend_release | 56 | 1.4 | 1.0 | 3.0 | 1.1 | 1.0 | 1.2 | 1.8 | 1.0 |
| vibrato | 7 | 0.8 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| harmonic | 109 | 2.1 | 1.7 | 2.3 | 1.8 | 1.7 | 2.2 | 2.2 | 1.8 |
| sweep | 224 | 1.7 | 1.6 | 1.3 | 2.2 | 1.7 | 1.7 | 1.5 | 1.5 |

## Mistakes let through

### A left-out note counted as heard by the matcher

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 707 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked | 168 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked_16ths_160_220 | 336 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 49 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 35 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 14 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 21 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 35 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| chord_tone | 42 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |

### A left-out note confirmed by the verifier

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 707 | 0% | 0% | 0% | 0% | 0% | 1% | 0% | 0% |
| picked | 168 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked_16ths_160_220 | 336 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 49 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 35 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 14 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 21 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 35 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| chord_tone | 42 | 2% | 0% | 0% | 0% | 0% | 17% | 0% | 0% |

### A left-out note caught by the verifier

Called not sounded. The rest are couldn't-tell.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 707 | 85% | 86% | 86% | 88% | 86% | 80% | 82% | 86% |
| picked | 168 | 99% | 100% | 100% | 100% | 100% | 96% | 96% | 100% |
| picked_16ths_160_220 | 336 | 98% | 100% | 100% | 100% | 96% | 96% | 96% | 96% |
| palm_mute | 49 | 41% | 29% | 29% | 29% | 57% | 57% | 57% | 29% |
| tap | 35 | 57% | 100% | 100% | 100% | 0% | 0% | 0% | 100% |
| slide_to | 7 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| bend | 14 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| harmonic | 21 | 81% | 100% | 100% | 100% | 100% | 33% | 33% | 100% |
| sweep | 35 | 43% | 0% | 0% | 60% | 100% | 40% | 60% | 40% |
| chord_tone | 42 | 33% | 33% | 33% | 17% | 33% | 33% | 50% | 33% |

### A wrong pitch counted right by the grade

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 798 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked | 196 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked_16ths_160_220 | 406 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 56 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| hammer | 14 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| pull | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 21 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 21 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 49 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |

### A wrong pitch counted wrong by the grade

The rest are not counted either way.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 798 | 75% | 98% | 96% | 97% | 31% | 23% | 85% | 97% |
| picked | 196 | 82% | 96% | 93% | 96% | 54% | 39% | 96% | 96% |
| picked_16ths_160_220 | 406 | 72% | 100% | 100% | 100% | 10% | 0% | 93% | 100% |
| palm_mute | 56 | 93% | 100% | 100% | 100% | 75% | 75% | 100% | 100% |
| hammer | 14 | 36% | 100% | 50% | 50% | 0% | 0% | 0% | 50% |
| pull | 28 | 61% | 100% | 100% | 100% | 0% | 25% | 0% | 100% |
| tap | 21 | 67% | 100% | 100% | 100% | 0% | 67% | 0% | 100% |
| slide_to | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 21 | 76% | 100% | 100% | 100% | 67% | 0% | 67% | 100% |
| sweep | 49 | 94% | 100% | 100% | 100% | 86% | 86% | 86% | 100% |

### A wrong pitch called right by the right-notes pass

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 798 | 0% | 0% | 1% | 0% | 1% | 0% | 0% | 0% |
| picked | 196 | 1% | 0% | 4% | 0% | 4% | 0% | 0% | 0% |
| picked_16ths_160_220 | 406 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 56 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| hammer | 14 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| pull | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 21 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 21 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 49 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |

### A wrong pitch confirmed by the verifier

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 805 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked | 196 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked_16ths_160_220 | 406 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 56 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| hammer | 14 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| pull | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 21 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 21 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 49 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| chord_tone | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |

### A wrong pitch caught by the verifier

Called wrong or not sounded.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 805 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| picked | 196 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| picked_16ths_160_220 | 406 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| palm_mute | 56 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| hammer | 14 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| pull | 28 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| tap | 21 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| slide_to | 7 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| harmonic | 21 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| sweep | 49 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| chord_tone | 7 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |

### A dead string in a chord confirmed by the verifier

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| chord_tone | 14 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |

## Weak legato (a tenth of a pick's strength)

### Confirmed by the verifier

Information: a hammer-on this weak arguably should read as weak.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| hammer | 168 | 77% | 100% | 100% | 75% | 58% | 79% | 54% | 75% |
| pull | 168 | 76% | 100% | 100% | 67% | 67% | 67% | 62% | 67% |
| tap | 112 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |

### Weak legato heard by the live detector

Information.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| hammer | 168 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| pull | 168 | 39% | 67% | 67% | 67% | 0% | 4% | 0% | 67% |
| tap | 112 | 59% | 100% | 100% | 100% | 6% | 0% | 6% | 100% |

## Takes

### Correctly played Takes that pass their Exercise's bars

Higher is better. A correct Take that fails is the app wronging the player.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 105 | 59% | 87% | 67% | 87% | 20% | 13% | 53% | 87% |

### Correctly played Takes answered with "I didn't catch enough"



| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 105 | 23% | 0% | 7% | 0% | 40% | 80% | 33% | 0% |

### Takes with scripted mistakes that pass

Information: one note in five or six is wrong or missing in these.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 161 | 12% | 17% | 13% | 17% | 0% | 9% | 13% | 17% |

## Cost

Milliseconds of work per second of audio, wall clock on the machine that ran this (not gated: it depends on the machine and its load).

| stage | ms per s of audio | a 30 s Take |
|---|---|---|
| onset detector | 3.03 | 91 ms |
| scorer and right-notes pass | 8.32 | 250 ms |
| note model | 21.06 | 632 ms |
| verifier rule | 0.01 | 0 ms |

329 Takes, 86.3 minutes of audio.
