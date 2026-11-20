"""One line per evaluation of a training run: `python -m tools.ml.scripts.progress n1a [n1b ...] [--last N]`."""
import json
import os
import pathlib
import sys

M = pathlib.Path(os.environ.get("YAMES_ML_MODELS", pathlib.Path.home() / "projects/.models/yames-ml"))
last = int(sys.argv[sys.argv.index("--last") + 1]) if "--last" in sys.argv else 3
for run in [a for a in sys.argv[1:] if not a.startswith("--") and not a.isdigit()]:
    rows = [json.loads(l) for l in open(M / run / "train.jsonl")]
    for d in rows[:1] + rows[1:][-last:]:
        v = d["val"]
        cells = "  ".join(f"{k.split('-')[0][:6]} loss {x['loss']:.4f} note P/R {x['note_PR'][0]:.2f}/{x['note_PR'][1]:.2f} (bp {x['bp_note_PR'][0]:.2f}/{x['bp_note_PR'][1]:.2f}) on {x['onset_PR'][0]:.2f}/{x['onset_PR'][1]:.2f}" for k, x in v.items())
        print(f"{run} step {d['step']} train {d['train_loss']} {d['minutes']} min {d['gpu_gb']} GB | {cells}")
