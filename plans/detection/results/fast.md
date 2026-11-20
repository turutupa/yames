# Detection bench

`{"chains":["di","di_gain","laptop_mic","phone_mic","phone_agc","laptop_noisy","laptop_reverb"],"mode":"fast","noteModel":"basic-pitch icassp-2022 on onnxruntime (ort)","notes":16415,"takes":343}`

Synthetic guitar (a string model, fixed seeds) through the production detector, scorer, right-notes pass and verifier. Every number is reproducible with `npm run detect:bench`; see `plans/detection/MEASURE.md`.

## Notes played as written

### Onset heard by the live detector and matcher

Share of correctly played notes the timing grade counts as heard.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 100% | 100% | 100% | 100% | 100% | 100% | 99% | 100% |
| picked_16ths_160_220 | 2016 | 99% | 100% | 99% | 100% | 94% | 99% | 99% | 100% |
| palm_mute | 280 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| hammer | 168 | 83% | 100% | 88% | 100% | 79% | 83% | 54% | 79% |
| pull | 168 | 86% | 100% | 92% | 100% | 71% | 83% | 67% | 92% |
| tap | 112 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| slide_to | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 63 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| bend_release | 56 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| vibrato | 7 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| harmonic | 112 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| sweep | 224 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| chord_tone | 168 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |

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
| picked | 1897 | 100% | 100% | 100% | 100% | 100% | 100% | 99% | 100% |
| picked_16ths_160_220 | 2016 | 99% | 100% | 99% | 100% | 94% | 99% | 99% | 100% |
| palm_mute | 280 | 98% | 100% | 100% | 100% | 90% | 92% | 100% | 100% |
| hammer | 168 | 83% | 100% | 88% | 100% | 79% | 83% | 54% | 79% |
| pull | 168 | 86% | 100% | 92% | 100% | 71% | 83% | 67% | 92% |
| tap | 112 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| slide_to | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 63 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| bend_release | 56 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| vibrato | 7 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| harmonic | 112 | 97% | 100% | 100% | 100% | 100% | 100% | 81% | 100% |
| sweep | 224 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |

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
| picked | 1897 | 94% | 96% | 89% | 99% | 95% | 96% | 88% | 94% |
| picked_16ths_160_220 | 2016 | 85% | 98% | 98% | 98% | 80% | 86% | 88% | 47% |
| palm_mute | 280 | 98% | 100% | 100% | 100% | 98% | 98% | 92% | 100% |
| hammer | 168 | 58% | 96% | 54% | 96% | 46% | 50% | 4% | 58% |
| pull | 168 | 54% | 100% | 71% | 92% | 21% | 21% | 0% | 71% |
| tap | 112 | 49% | 0% | 0% | 31% | 81% | 81% | 56% | 94% |
| slide_to | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 63 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend_release | 56 | 9% | 12% | 12% | 12% | 0% | 0% | 0% | 25% |
| vibrato | 7 | 86% | 100% | 100% | 100% | 100% | 100% | 0% | 100% |
| harmonic | 112 | 50% | 94% | 100% | 50% | 19% | 19% | 6% | 62% |
| sweep | 224 | 75% | 47% | 47% | 91% | 94% | 94% | 56% | 97% |

### Right-notes pass says wrong

Correct notes the pitch tracker calls wrong or an octave out.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1897 | 3% | 4% | 11% | 0% | 1% | 1% | 1% | 3% |
| picked_16ths_160_220 | 2016 | 4% | 2% | 1% | 2% | 7% | 5% | 4% | 7% |
| palm_mute | 280 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| hammer | 168 | 7% | 4% | 33% | 4% | 0% | 0% | 0% | 4% |
| pull | 168 | 5% | 0% | 21% | 0% | 0% | 0% | 0% | 17% |
| tap | 112 | 46% | 100% | 100% | 69% | 19% | 19% | 6% | 6% |
| slide_to | 28 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 63 | 97% | 100% | 100% | 100% | 100% | 100% | 78% | 100% |
| bend_release | 56 | 75% | 88% | 88% | 88% | 88% | 88% | 12% | 75% |
| vibrato | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 112 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 224 | 16% | 50% | 50% | 6% | 0% | 0% | 3% | 0% |

### Timing scatter of the live detector, ms

Robust spread of matched onset times against the true note times, each Take's constant lag removed.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| picked | 1895 | 2.6 | 2.6 | 2.8 | 2.7 | 2.1 | 2.6 | 2.7 | 2.7 |
| picked_16ths_160_220 | 1993 | 2.3 | 2.4 | 2.7 | 2.2 | 1.7 | 2.4 | 2.3 | 2.5 |
| palm_mute | 280 | 2.0 | 1.9 | 2.1 | 1.6 | 1.9 | 2.6 | 1.9 | 2.0 |
| hammer | 140 | 1.9 | 1.8 | 2.1 | 2.3 | 1.7 | 1.6 | 2.3 | 2.2 |
| pull | 145 | 1.2 | 1.1 | 1.0 | 0.9 | 1.4 | 1.1 | 1.3 | 1.0 |
| tap | 112 | 1.4 | 1.7 | 1.8 | 1.8 | 1.4 | 1.7 | 1.4 | 1.8 |
| bend | 63 | 1.6 | 1.6 | 3.1 | 1.6 | 1.6 | 1.5 | 1.6 | 1.6 |
| bend_release | 56 | 2.9 | 3.1 | 3.1 | 2.4 | 3.4 | 1.6 | 3.4 | 2.4 |
| vibrato | 7 | 0.2 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| harmonic | 112 | 1.9 | 2.5 | 2.5 | 1.9 | 1.6 | 1.3 | 1.9 | 1.9 |
| sweep | 224 | 2.2 | 2.1 | 2.5 | 2.4 | 1.9 | 2.3 | 2.2 | 2.3 |

### Where the right-notes pass reads a note, against its true attack, ms

Size of the median error of the production look-up time. Near zero or the pass reads the wrong note at speed (the M0 bug was +25).

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 5027 | 0.8 | 0.4 | 1.1 | 0.8 | 0.5 | 0.9 | 1.2 | 1.0 |

### Where the right-notes pass cuts its track, against the true attack, ms

The same for the cuts between notes.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 5027 | 0.8 | 0.4 | 1.1 | 0.8 | 0.5 | 0.9 | 1.2 | 1.0 |

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

## Bends and vibrato, read as curves (M5; reported, not graded)

### Bends read at all

Bent notes the matcher heard and the curve reading gave a verdict on (the rest: not heard, or couldn't tell).

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| bend | 175 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| bend_release | 112 | 99% | 100% | 100% | 100% | 100% | 100% | 94% | 100% |

### Bend held within 25 cents of what was played

M5 acceptance: at least 90%.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| bend | 63 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| bend_release | 55 | 98% | 100% | 100% | 100% | 100% | 100% | 86% | 100% |

### Bend amount error, median, cents

Held pitch against the bend played.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| bend | 63 | 1.8 | 1.5 | 1.5 | 1.8 | 2.1 | 2.2 | 2.9 | 1.2 |
| bend_release | 55 | 1.0 | 1.0 | 1.0 | 1.1 | 0.7 | 0.8 | 6.2 | 0.5 |

### A bend 50 cents flat called flat

M5 acceptance: at least 80%.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| bend | 35 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| bend_release | 28 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |

### A good bend called flat

M5 acceptance: under 5%.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| bend | 63 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| bend_release | 55 | 2% | 0% | 0% | 0% | 0% | 0% | 14% | 0% |

### A bend and release heard coming back down

The rest: couldn't tell (the quiet tail was lost), or the next row.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| bend_release | 55 | 53% | 100% | 100% | 62% | 0% | 0% | 0% | 100% |

### A bend and release called held up

It came down; the reading says it did not. Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| bend_release | 55 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |

### Written vibrato found

Vibrato played at 35 cents, 5.5 Hz.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| vibrato | 14 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |

### Written vibrato called absent when it was played

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| vibrato | 14 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |

### Vibrato left out, called absent



| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| vibrato | 7 | 86% | 100% | 100% | 100% | 100% | 100% | 0% | 100% |

### Vibrato left out, called present

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| vibrato | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |

### Vibrato depth error, median, cents

Information: the synth's depth against the reading.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| vibrato | 14 | 5.6 | 3.6 | 3.6 | 6.3 | 7.7 | 7.7 | 6.4 | 12.4 |

## Mistakes let through

### A left-out note counted as heard by the matcher

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 707 | 0% | 0% | 0% | 0% | 0% | 1% | 0% | 0% |
| picked | 168 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked_16ths_160_220 | 336 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 49 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 35 | 3% | 0% | 0% | 0% | 0% | 20% | 0% | 0% |
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
| all | 798 | 98% | 98% | 99% | 99% | 96% | 98% | 96% | 99% |
| picked | 196 | 99% | 96% | 100% | 100% | 100% | 100% | 96% | 100% |
| picked_16ths_160_220 | 406 | 100% | 100% | 100% | 100% | 98% | 100% | 98% | 100% |
| palm_mute | 56 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| hammer | 14 | 64% | 100% | 100% | 100% | 0% | 50% | 0% | 100% |
| pull | 28 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| tap | 21 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| slide_to | 7 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| harmonic | 21 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| sweep | 49 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |

### A wrong pitch called right by the right-notes pass

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 798 | 0% | 1% | 0% | 0% | 0% | 0% | 0% | 0% |
| picked | 196 | 1% | 4% | 0% | 0% | 0% | 0% | 0% | 0% |
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
| hammer | 168 | 9% | 12% | 50% | 0% | 0% | 0% | 0% | 0% |
| pull | 168 | 67% | 67% | 92% | 67% | 58% | 62% | 58% | 67% |
| tap | 112 | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |

## Takes

### Correctly played Takes that pass their Exercise's bars

Higher is better. A correct Take that fails is the app wronging the player.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 105 | 80% | 93% | 93% | 93% | 80% | 53% | 53% | 93% |

### Spurious onsets from the live detector, per minute

Onsets on no played note: over 50 ms from every true attack, or a second one on the same attack. Before the matcher, which drops most of them. Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 329 | 0.30 | 0.00 | 0.00 | 0.00 | 0.00 | 1.05 | 1.05 | 0.00 |

### Onsets from the live detector with nobody playing, per minute

The room alone through each chain (style `silent`): noise, and the automatic gain pumping it. Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 7 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

### Onsets on no written note in a Take with stray hand noises, per minute

A correct Take with a brushed, damped string at -24 dB halfway between notes, in every third gap (style `noises`; 34 of them a minute at 100 BPM). Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 7 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

### A note counted as heard with nobody playing

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 280 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |

### Correctly played Takes answered with "I didn't catch enough"



| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 105 | 12% | 0% | 0% | 0% | 13% | 40% | 33% | 0% |

### Takes with scripted mistakes that pass

Information: one note in five or six is wrong or missing in these.

| kind | n | all | di | di_gain | laptop_mic | phone_mic | phone_agc | laptop_noisy | laptop_reverb |
|---|---|---|---|---|---|---|---|---|---|
| all | 161 | 14% | 17% | 17% | 17% | 9% | 13% | 9% | 17% |

## Cost

Milliseconds of work per second of audio, wall clock on the machine that ran this (not gated: it depends on the machine and its load).

| stage | ms per s of audio | a 30 s Take |
|---|---|---|
| onset detector | 5.01 | 150 ms |
| scorer and right-notes pass | 10.40 | 312 ms |
| note model | 23.60 | 708 ms |
| verifier rule | 0.01 | 0 ms |

343 Takes, 89.9 minutes of audio.
