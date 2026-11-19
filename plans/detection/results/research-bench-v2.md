# Detection bench

`{"chains":["di","di_gain","laptop_mic","phone_agc","phone_mic"],"mode":"recordings","noteModel":"basic-pitch icassp-2022 on onnxruntime (ort)","notes":60075,"takes":705}`

Synthetic guitar (a string model, fixed seeds) through the production detector, scorer, right-notes pass and verifier. Every number is reproducible with `npm run detect:bench`; see `plans/detection/MEASURE.md`.

## Notes played as written

### Onset heard by the live detector and matcher

Share of correctly played notes the timing grade counts as heard.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| picked | 8955 | 77% | 100% | 94% | 100% | 41% | 50% |
| picked_16ths_160_220 | 3200 | 60% | 99% | 97% | 99% | 0% | 6% |
| palm_mute | 975 | 80% | 100% | 70% | 100% | 73% | 56% |
| hammer | 1315 | 49% | 89% | 79% | 66% | 8% | 2% |
| pull | 1360 | 47% | 88% | 73% | 53% | 19% | 1% |
| tap | 520 | 67% | 100% | 100% | 100% | 26% | 10% |
| slide_to | 110 | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 105 | 91% | 100% | 100% | 100% | 67% | 90% |
| vibrato | 45 | 87% | 100% | 100% | 100% | 67% | 67% |
| sweep | 2320 | 74% | 100% | 100% | 100% | 25% | 46% |
| chord_tone | 1485 | 68% | 100% | 59% | 100% | 22% | 60% |

### Confirmed by the verifier

Share of correctly played notes the note model confirms.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| picked | 8955 | 100% | 100% | 100% | 100% | 100% | 100% |
| picked_16ths_160_220 | 3200 | 100% | 100% | 100% | 100% | 100% | 100% |
| palm_mute | 975 | 96% | 100% | 81% | 100% | 99% | 99% |
| hammer | 1315 | 100% | 100% | 100% | 100% | 100% | 99% |
| pull | 1360 | 96% | 100% | 100% | 99% | 93% | 86% |
| tap | 520 | 100% | 100% | 100% | 100% | 100% | 100% |
| slide_to | 110 | 69% | 100% | 100% | 55% | 55% | 36% |
| bend | 105 | 100% | 100% | 100% | 100% | 100% | 100% |
| vibrato | 45 | 100% | 100% | 100% | 100% | 100% | 100% |
| sweep | 2320 | 100% | 100% | 100% | 100% | 100% | 100% |
| chord_tone | 1485 | 64% | 75% | 45% | 74% | 62% | 65% |

### Verifier: couldn't tell

Correct notes the verifier gives no verdict on. Never a miss, never blocks a pass.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| picked | 8955 | 0% | 0% | 0% | 0% | 0% | 0% |
| picked_16ths_160_220 | 3200 | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 975 | 4% | 0% | 19% | 0% | 0% | 0% |
| hammer | 1315 | 0% | 0% | 0% | 0% | 0% | 1% |
| pull | 1360 | 4% | 0% | 0% | 1% | 7% | 14% |
| tap | 520 | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 110 | 11% | 0% | 0% | 14% | 18% | 23% |
| bend | 105 | 0% | 0% | 0% | 0% | 0% | 0% |
| vibrato | 45 | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 2320 | 0% | 0% | 0% | 0% | 0% | 0% |
| chord_tone | 1485 | 23% | 11% | 37% | 16% | 27% | 25% |

### Verifier: wrongly declined

Correct notes the verifier calls not sounded or wrong. The number that must stay near zero.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| picked | 8955 | 0% | 0% | 0% | 0% | 0% | 0% |
| picked_16ths_160_220 | 3200 | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 975 | 0% | 0% | 0% | 0% | 1% | 1% |
| hammer | 1315 | 0% | 0% | 0% | 0% | 0% | 0% |
| pull | 1360 | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 520 | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 110 | 20% | 0% | 0% | 32% | 27% | 41% |
| bend | 105 | 0% | 0% | 0% | 0% | 0% | 0% |
| vibrato | 45 | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 2320 | 0% | 0% | 0% | 0% | 0% | 0% |
| chord_tone | 1485 | 13% | 13% | 18% | 10% | 11% | 10% |

### Right-notes pass says right

The pitch tracker's verdict on correct notes, when asked (whether a Take is graded on it depends on its pass bars).

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| picked | 8955 | 70% | 95% | 85% | 94% | 37% | 39% |
| picked_16ths_160_220 | 3200 | 57% | 96% | 92% | 94% | 0% | 2% |
| palm_mute | 975 | 79% | 100% | 70% | 100% | 71% | 56% |
| hammer | 1315 | 42% | 83% | 59% | 59% | 7% | 2% |
| pull | 1360 | 39% | 77% | 63% | 50% | 5% | 0% |
| tap | 520 | 18% | 7% | 7% | 53% | 15% | 8% |
| slide_to | 110 | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 105 | 0% | 0% | 0% | 0% | 0% | 0% |
| vibrato | 45 | 71% | 100% | 100% | 89% | 44% | 22% |
| sweep | 2320 | 56% | 67% | 66% | 93% | 20% | 31% |

### Right-notes pass says wrong

Correct notes the pitch tracker calls wrong or an octave out.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| picked | 8955 | 7% | 5% | 9% | 5% | 3% | 10% |
| picked_16ths_160_220 | 3200 | 3% | 2% | 4% | 4% | 0% | 4% |
| palm_mute | 975 | 0% | 0% | 0% | 0% | 0% | 0% |
| hammer | 1315 | 7% | 6% | 21% | 6% | 1% | 0% |
| pull | 1360 | 7% | 11% | 10% | 1% | 12% | 1% |
| tap | 520 | 49% | 93% | 93% | 47% | 10% | 2% |
| slide_to | 110 | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 105 | 86% | 100% | 100% | 95% | 57% | 76% |
| vibrato | 45 | 2% | 0% | 0% | 0% | 11% | 0% |
| sweep | 2320 | 17% | 32% | 33% | 6% | 2% | 12% |

### Timing scatter of the live detector, ms

Robust spread of matched onset times against the true note times, each Take's constant lag removed.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| picked | 6903 | 2.3 | 2.3 | 2.3 | 2.3 | 2.1 | 2.1 |
| picked_16ths_160_220 | 1929 | 2.4 | 2.2 | 2.5 | 2.4 | - | 2.1 |
| palm_mute | 777 | 2.4 | 2.5 | 2.2 | 2.2 | 2.3 | 2.7 |
| hammer | 637 | 2.2 | 2.2 | 2.1 | 2.0 | 2.6 | - |
| pull | 639 | 2.3 | 2.6 | 2.4 | 2.4 | 2.1 | 1.3 |
| tap | 347 | 2.8 | 3.1 | 2.3 | 2.7 | 2.3 | 2.2 |
| bend | 96 | 2.6 | 2.2 | 2.7 | 2.9 | 2.3 | 2.4 |
| vibrato | 39 | 0.9 | 1.1 | 1.3 | 1.1 | 0.8 | 0.7 |
| sweep | 1720 | 2.4 | 2.4 | 2.4 | 2.3 | 2.3 | 2.1 |

### Timing scatter of the verifier, ms

The same for the verifier's own start times.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| picked | 8955 | 2.2 | 2.2 | 2.4 | 2.1 | 2.1 | 2.1 |
| picked_16ths_160_220 | 3198 | 2.2 | 2.2 | 2.4 | 2.1 | 2.2 | 2.2 |
| palm_mute | 933 | 2.2 | 2.5 | 2.4 | 2.3 | 1.9 | 1.9 |
| hammer | 1312 | 2.2 | 2.1 | 2.2 | 2.3 | 2.1 | 2.2 |
| pull | 1302 | 2.2 | 2.2 | 2.0 | 2.4 | 2.4 | 2.4 |
| tap | 520 | 1.9 | 1.7 | 1.8 | 2.3 | 1.8 | 1.8 |
| slide_to | 76 | 13.2 | 2.3 | 3.7 | 2.4 | 12.6 | 5.2 |
| bend | 105 | 1.9 | 1.9 | 2.0 | 2.2 | 1.6 | 1.7 |
| vibrato | 45 | 2.2 | 2.4 | 2.3 | 2.3 | 2.2 | 2.2 |
| sweep | 2320 | 2.0 | 2.0 | 2.1 | 2.2 | 2.0 | 2.0 |

## Mistakes let through

### A left-out note counted as heard by the matcher

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| all | 2535 | 0% | 0% | 0% | 0% | 0% | 0% |
| picked | 1355 | 0% | 0% | 0% | 0% | 0% | 0% |
| palm_mute | 170 | 0% | 0% | 0% | 0% | 0% | 0% |
| hammer | 190 | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 80 | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 5 | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 20 | 0% | 0% | 0% | 0% | 0% | 0% |
| vibrato | 5 | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 420 | 0% | 0% | 0% | 0% | 0% | 0% |
| chord_tone | 290 | 0% | 0% | 0% | 0% | 0% | 0% |

### A left-out note confirmed by the verifier

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| all | 2535 | 0% | 0% | 1% | 0% | 1% | 0% |
| picked | 1355 | 1% | 0% | 0% | 1% | 1% | 0% |
| palm_mute | 170 | 0% | 0% | 0% | 0% | 0% | 0% |
| hammer | 190 | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 80 | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 5 | 0% | 0% | 0% | 0% | 0% | 0% |
| bend | 20 | 0% | 0% | 0% | 0% | 0% | 0% |
| vibrato | 5 | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 420 | 0% | 0% | 0% | 0% | 0% | 0% |
| chord_tone | 290 | 1% | 0% | 5% | 0% | 0% | 0% |

### A left-out note caught by the verifier

Called not sounded. The rest are couldn't-tell.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| all | 2535 | 75% | 76% | 77% | 78% | 69% | 75% |
| picked | 1355 | 82% | 84% | 83% | 82% | 77% | 82% |
| palm_mute | 170 | 29% | 26% | 26% | 26% | 32% | 35% |
| hammer | 190 | 89% | 100% | 100% | 100% | 63% | 82% |
| tap | 80 | 59% | 100% | 100% | 94% | 0% | 0% |
| slide_to | 5 | 100% | 100% | 100% | 100% | 100% | 100% |
| bend | 20 | 100% | 100% | 100% | 100% | 100% | 100% |
| vibrato | 5 | 100% | 100% | 100% | 100% | 100% | 100% |
| sweep | 420 | 84% | 75% | 79% | 89% | 85% | 92% |
| chord_tone | 290 | 51% | 48% | 50% | 48% | 52% | 55% |

### A wrong pitch called right by the right-notes pass

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| all | 2585 | 1% | 0% | 0% | 0% | 0% | 3% |
| picked | 1415 | 1% | 0% | 0% | 0% | 0% | 3% |
| palm_mute | 195 | 2% | 3% | 0% | 3% | 0% | 3% |
| hammer | 170 | 0% | 0% | 0% | 0% | 0% | 0% |
| pull | 205 | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 105 | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 20 | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 475 | 1% | 0% | 0% | 0% | 0% | 3% |

### A wrong pitch confirmed by the verifier

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| all | 2675 | 1% | 4% | 0% | 0% | 0% | 0% |
| picked | 1415 | 2% | 8% | 0% | 0% | 0% | 0% |
| palm_mute | 195 | 0% | 0% | 0% | 0% | 0% | 0% |
| hammer | 170 | 0% | 0% | 0% | 0% | 0% | 0% |
| pull | 205 | 0% | 0% | 0% | 0% | 0% | 0% |
| tap | 105 | 0% | 0% | 0% | 0% | 0% | 0% |
| slide_to | 20 | 0% | 0% | 0% | 0% | 0% | 0% |
| sweep | 475 | 0% | 0% | 0% | 0% | 0% | 0% |
| chord_tone | 90 | 0% | 0% | 0% | 0% | 0% | 0% |

### A wrong pitch caught by the verifier

Called wrong or not sounded.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| all | 2675 | 99% | 95% | 100% | 100% | 100% | 100% |
| picked | 1415 | 98% | 92% | 100% | 100% | 100% | 100% |
| palm_mute | 195 | 100% | 100% | 100% | 100% | 100% | 100% |
| hammer | 170 | 100% | 100% | 100% | 100% | 100% | 100% |
| pull | 205 | 100% | 100% | 100% | 100% | 100% | 100% |
| tap | 105 | 100% | 100% | 100% | 100% | 100% | 100% |
| slide_to | 20 | 95% | 100% | 100% | 100% | 75% | 100% |
| sweep | 475 | 100% | 100% | 100% | 100% | 100% | 100% |
| chord_tone | 90 | 92% | 89% | 94% | 89% | 94% | 94% |

### A dead string in a chord confirmed by the verifier

Lower is better.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| chord_tone | 60 | 0% | 0% | 0% | 0% | 0% | 0% |

## Weak legato (a tenth of a pick's strength)

### Confirmed by the verifier

Information: a hammer-on this weak arguably should read as weak.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| hammer | 1160 | 86% | 100% | 100% | 86% | 77% | 66% |
| pull | 1210 | 80% | 100% | 100% | 69% | 67% | 62% |
| tap | 520 | 100% | 100% | 100% | 100% | 100% | 100% |

### Weak legato heard by the live detector

Information.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| hammer | 1160 | 20% | 34% | 32% | 31% | 1% | 0% |
| pull | 1210 | 29% | 48% | 49% | 47% | 1% | 0% |
| tap | 520 | 61% | 100% | 100% | 100% | 3% | 3% |

## Takes

### Correctly played Takes that pass their Exercise's bars

Higher is better. A correct Take that fails is the app wronging the player.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| all | 220 | 58% | 91% | 77% | 95% | 20% | 7% |

### Correctly played Takes answered with "I didn't catch enough"



| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| all | 220 | 30% | 0% | 5% | 0% | 73% | 73% |

### Takes with scripted mistakes that pass

Information: one note in five or six is wrong or missing in these.

| kind | n | all | di | di_gain | laptop_mic | phone_agc | phone_mic |
|---|---|---|---|---|---|---|---|
| all | 350 | 21% | 33% | 31% | 33% | 4% | 4% |

## Cost

Milliseconds of work per second of audio, wall clock on the machine that ran this (not gated: it depends on the machine and its load).

| stage | ms per s of audio | a 30 s Take |
|---|---|---|
| onset detector | 3.75 | 112 ms |
| scorer and right-notes pass | 4.75 | 143 ms |
| note model | 21.24 | 637 ms |
| verifier rule | 0.01 | 0 ms |

705 Takes, 288.0 minutes of audio.
