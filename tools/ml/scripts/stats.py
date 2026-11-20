"""Manifests and counts of the training sets, for the repo.

    python -m tools.ml.scripts.stats synth-v1 guitarset-v1 techs-v1

Writes `tools/ml/manifests/<set>.json` (the set's manifest: source, licence,
seed, how it was made) and `tools/ml/manifests/stats.md` (hours and notes per
split, chain and technique). The per-item list (every file, its source,
licence, seed and chain) stays beside the audio: `<set>/takes.jsonl` and
`items.jsonl` in `~/projects/.datasets/yames-synth/`.
"""
import collections
import json
import pathlib
import sys

from ..factory import store, takes

OUT = pathlib.Path(__file__).resolve().parents[1] / "manifests"
OUT.mkdir(exist_ok=True)
md = ["# Training sets", "", "Made by `tools/ml/factory/` (`render.py`, `real.py`); audio in `~/projects/.datasets/yames-synth/`, never in the repo.", ""]
for name in sys.argv[1:]:
    r = store.Reader(name)
    json.dump(r.manifest, open(OUT / f"{name}.json", "w"), indent=1)
    hours = collections.Counter()
    chain = collections.Counter()
    notes = collections.Counter()
    licences = collections.Counter()
    for it in r.items:
        h = it["samples"] / store.RATE / 3600
        hours[it["split"]] += h
        chain[it["chain"].get("kind", "?")] += h
    for t in r.takes:
        licences[t.get("licence", r.manifest.get("licence"))] += 1
        for n in t["notes"]:
            c = n.get("cls")
            notes[takes.CLASSES[c] if isinstance(c, int) and 0 <= c < len(takes.CLASSES) else "unlabelled"] += 1
    md += [f"## {name}", "", f"Source: {r.manifest.get('source')}. Licence: {', '.join(f'{k} ({v} takes)' for k, v in licences.items())}.",
           f"{len(r.takes)} takes, {len(r.items)} recordings, {sum(hours.values()):.1f} h.", "",
           "| split | hours |", "|---|---|"] + [f"| {k} | {v:.2f} |" for k, v in sorted(hours.items())] + ["", "| chain | hours |", "|---|---|"] + \
          [f"| {k} | {v:.2f} |" for k, v in sorted(chain.items())] + ["", "| technique label | notes (per take, before chains) |", "|---|---|"] + [f"| {k} | {v} |" for k, v in notes.most_common()] + [""]
open(OUT / "stats.md", "w").write("\n".join(md))
print("\n".join(l for l in md if l.startswith("## ") or " takes, " in l))
