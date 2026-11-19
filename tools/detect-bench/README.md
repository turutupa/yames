# tools/detect-bench: public datasets for the detection bench

The bench itself is Rust (`src-tauri/src/bin/detect-bench/`, run with
`npm run detect:bench`; manual in `plans/detection/MEASURE.md`). This folder
is the heavy, local half: scripts that fetch public guitar recordings and
describe them with the sidecars the bench reads (`*.truth.json`, the shapes
in `cases.rs::TakeMeta`).

**Rules.** Audio never enters the repository. Datasets live in
`$YAMES_DATASETS` (default `~/projects/.datasets/`). Every dataset here is
licensed for training and for shipping what was trained on it; the ones that
are not are listed by `fetch.py list` so nobody adds them by accident. Keep the
`LICENCE.txt` `fetch.py` writes beside each download, and add a row to the
table below for anything new before using it.

| Dataset | Zenodo | Licence | Size | Used for |
|---|---|---|---|---|
| GuitarSet | 3371780 | CC BY 4.0 | 4.6 GB (mic + pickup mix + annotations) | real notes confirmed, wrong and left-out decoys (`guitarset.py`); key and chord engine |
| Five guitar dataset | 4988354 | CC BY 4.0 | 1.1 GB | the same performance through DI, phone and laptop |
| Guitar-TECHS | 14963133 | CC BY 4.0 | 4.1 GB | real techniques with MIDI labels (`guitartechs.py`) |
| EG-IPT | 15205644 | CC BY 4.0 | 24 GB | 19 techniques, DI + 6 mics (not fetched by default) |
| AG-PT-set | 10159492 | CC BY 4.0 | 6.8 GB | acoustic, ms-accurate onsets (not fetched by default) |

Not usable (no training, no shipping): IDMT-SMT-Guitar and IDMT-SMT-Chords
(CC BY-NC-ND), SynthTab (CC BY-NC), GOAT and DadaGP (by request, research
only), GAPS (YouTube-sourced).

```sh
PY=~/projects/.venvs/detect/bin/python     # any Python 3.10+; these scripts use the standard library only
$PY -I tools/detect-bench/fetch.py list
$PY -I tools/detect-bench/fetch.py guitarset
$PY -I tools/detect-bench/guitarset.py prepare
npm run detect:bench -- run --dir ~/projects/.datasets/guitarset-bench --out .detect-bench/guitarset
```

Attribution, as CC BY asks: GuitarSet, Q. Xi, R. Bittner, J. Pauwels, X. Ye,
J. P. Bello, ISMIR 2018. Guitar-TECHS, H. Pedroza et al., ICASSP 2025. EG-IPT,
NIME 2025. AG-PT-set, D. Stefani et al. Five guitar dataset, Zenodo 4988354.
