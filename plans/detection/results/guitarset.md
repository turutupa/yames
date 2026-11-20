# Detection bench

`{"chains":["gs_mic_comp","gs_pickup_comp","gs_mic_solo","gs_pickup_solo"],"mode":"recordings","noteModel":"basic-pitch icassp-2022 on onnxruntime (ort)","notes":391676,"takes":2160}`

Synthetic guitar (a string model, fixed seeds) through the production detector, scorer, right-notes pass and verifier. Every number is reproducible with `npm run detect:bench`; see `plans/detection/MEASURE.md`.

## Notes played as written

### Onset heard by the live detector and matcher

Share of correctly played notes the timing grade counts as heard.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| picked | 47766 | 57% | 43% | 32% | 63% | 73% |
| chord_tone | 77186 | 72% | 71% | 74% | 56% | 73% |

### Confirmed by the verifier

Share of correctly played notes the note model confirms.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| picked | 47766 | 87% | 71% | 73% | 95% | 95% |
| chord_tone | 77186 | 80% | 78% | 80% | 90% | 88% |

### Verifier: couldn't tell

Correct notes the verifier gives no verdict on. Never a miss, never blocks a pass.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| picked | 47766 | 9% | 20% | 21% | 2% | 3% |
| chord_tone | 77186 | 15% | 15% | 15% | 6% | 8% |

### Verifier: wrongly declined

Correct notes the verifier calls not sounded or wrong. The number that must stay near zero.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| picked | 47766 | 4% | 9% | 7% | 2% | 2% |
| chord_tone | 77186 | 5% | 6% | 5% | 4% | 4% |

### Right-notes pass says right

The pitch tracker's verdict on correct notes, when asked (whether a Take is graded on it depends on its pass bars).

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| picked | 47766 | 41% | 14% | 11% | 53% | 62% |

### Right-notes pass says wrong

Correct notes the pitch tracker calls wrong or an octave out.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| picked | 47766 | 9% | 11% | 9% | 7% | 10% |

### Timing scatter of the live detector, ms

Robust spread of matched onset times against the true note times, each Take's constant lag removed.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| picked | 26948 | 3.7 | 4.0 | 3.3 | 4.4 | 3.2 |

### Where the right-notes pass reads a note, against its true attack, ms

Size of the median error of the production look-up time. Near zero or the pass reads the wrong note at speed (the M0 bug was +25).

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| all | 27048 | 8.6 | 7.6 | 9.5 | 7.8 | 9.2 |

### Where the right-notes pass cuts its track, against the true attack, ms

The same for the cuts between notes.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| all | 26987 | 8.5 | 7.6 | 9.5 | 7.6 | 9.2 |

### Timing scatter of the verifier, ms

The same for the verifier's own start times.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| picked | 41432 | 3.0 | 5.3 | 4.7 | 2.7 | 2.5 |

## Mistakes let through

### A left-out note counted as heard by the matcher

Lower is better.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| all | 16820 | 9% | 8% | 4% | 16% | 8% |
| picked | 16820 | 9% | 8% | 4% | 16% | 8% |

### A left-out note confirmed by the verifier

Lower is better.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| all | 16820 | 1% | 1% | 1% | 1% | 0% |
| picked | 16820 | 1% | 1% | 1% | 1% | 0% |

### A left-out note caught by the verifier

Called not sounded. The rest are couldn't-tell.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| all | 16820 | 76% | 68% | 72% | 80% | 86% |
| picked | 16820 | 76% | 68% | 72% | 80% | 86% |

### A wrong pitch called right by the right-notes pass

Lower is better.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| all | 8112 | 0% | 0% | 0% | 1% | 1% |
| picked | 8112 | 0% | 0% | 0% | 1% | 1% |

### A wrong pitch confirmed by the verifier

Lower is better.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| all | 8112 | 1% | 0% | 0% | 1% | 1% |
| picked | 8112 | 1% | 0% | 0% | 1% | 1% |

### A wrong pitch caught by the verifier

Called wrong or not sounded.

| kind | n | all | gs_mic_comp | gs_pickup_comp | gs_mic_solo | gs_pickup_solo |
|---|---|---|---|---|---|---|
| all | 8112 | 97% | 96% | 97% | 98% | 98% |
| picked | 8112 | 97% | 96% | 97% | 98% | 98% |

## Weak legato (a tenth of a pick's strength)

## Takes

## Cost

Milliseconds of work per second of audio, wall clock on the machine that ran this (not gated: it depends on the machine and its load).

| stage | ms per s of audio | a 30 s Take |
|---|---|---|
| onset detector | 2.69 | 81 ms |
| scorer and right-notes pass | 3.04 | 91 ms |
| note model | 17.79 | 534 ms |
| verifier rule | 0.01 | 0 ms |

2160 Takes, 1096.8 minutes of audio.
