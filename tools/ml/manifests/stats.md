# Training sets

Made by `tools/ml/factory/` (`render.py`, `real.py`); audio in `~/projects/.datasets/yames-synth/`, never in the repo.

## synth-v1

Source: synth. Licence: own (procedural string model; tabs from the app's packs) (4696 takes).
4696 takes, 14088 recordings, 73.2 h.

| split | hours |
|---|---|
| train | 69.61 |
| val | 3.64 |

| chain | hours |
|---|---|
| bt | 8.08 |
| di | 16.17 |
| di_gain | 8.25 |
| laptop_mic | 8.08 |
| laptop_noisy | 8.24 |
| laptop_reverb | 8.11 |
| phone_agc | 8.14 |
| phone_mic | 8.18 |

| technique label | notes (per take, before chains) |
|---|---|
| picked | 237757 |
| pull | 17623 |
| hammer | 16304 |
| palm_mute | 15376 |
| tap | 5110 |
| unlabelled | 2804 |
| harmonic | 2678 |
| slide | 2580 |

## guitarset-v1

Source: guitarset. Licence: CC BY 4.0 (360 takes).
360 takes, 1020 recordings, 8.6 h.

| split | hours |
|---|---|
| heldout | 1.02 |
| train | 7.05 |
| val | 0.57 |

| chain | hours |
|---|---|
| bt | 0.54 |
| laptop_noisy | 0.52 |
| laptop_reverb | 0.48 |
| phone_agc | 0.52 |
| phone_mic | 0.49 |
| real_mic | 3.05 |
| real_pickup | 3.05 |

| technique label | notes (per take, before chains) |
|---|---|
| unlabelled | 62476 |

## techs-v1

Source: guitar-techs. Licence: CC BY 4.0 (104 takes).
104 takes, 208 recordings, 10.0 h.

| split | hours |
|---|---|
| heldout | 0.27 |
| train | 8.99 |
| val | 0.78 |

| chain | hours |
|---|---|
| real_amp_mic | 5.02 |
| real_di | 5.02 |

| technique label | notes (per take, before chains) |
|---|---|
| picked | 16423 |
| unlabelled | 2165 |
| palm_mute | 282 |
| harmonic | 62 |
