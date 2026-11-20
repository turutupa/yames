"""Render the synthetic set: every pack Exercise and the drills, each through
several capture chains, in parallel.

    python -m tools.ml.factory.render --name synth-v1 [--variants 4] [--drills 1500] [--jobs 18] [--limit N]

Deterministic: a job's seed is `seed * 1_000_003 + its index`, and the output
order is the job order whatever the number of workers.
"""
from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import time

import numpy as np
from scipy import signal

from . import chains, store, takes
from . import synth as gs

_EX = None


def jobs_of(seed: int, variants: int, n_drills: int):
    exs = takes.load_pack_exercises()
    rng = np.random.default_rng(seed)
    jobs = []
    for ei, ex in enumerate(exs):
        techs = {t for n in ex["notes"] for t in n["tech"]}
        ticks = {}
        for n in ex["notes"]:
            ticks[n["tick"]] = ticks.get(n["tick"], 0) + 1
        chordy = sum(1 for c in ticks.values() if c >= 3) >= 2
        styles = ["good", "good", "good", "sloppy", "omit", "wrong", "ringing"]
        if techs & {"hammer", "pull", "tap"}:
            styles += ["weak", "weak"]
        if chordy:
            styles += ["dead", "dead"]
        if "bend" in techs:
            styles += ["flat"]
        rungs = [r["bpm"] for r in ex.get("tempo", {}).get("rungs", [])] or [90]
        for v in range(variants):
            jobs.append({"kind": "pack", "ex": ei, "bpm": float(rng.choice(rungs)), "style": "good" if v == 0 else str(rng.choice(styles))})
    weights = np.array(list(takes.DRILLS.values()), dtype=float)
    kinds = rng.choice(list(takes.DRILLS.keys()), size=n_drills, p=weights / weights.sum())
    for i, k in enumerate(kinds):
        style = str(rng.choice(["good", "good", "sloppy", "omit", "wrong"] + (["weak"] if k in ("legato", "tap") else []) + (["dead"] if k == "chords" else [])))
        jobs.append({"kind": "drill", "drill": str(k), "idx": i, "style": style})
    for j, job in enumerate(jobs):
        job["job"] = j
        job["seed"] = seed * 1_000_003 + j
        job["split"] = "val" if j % 20 == 7 else "train"
    return jobs


def run(job: dict):
    global _EX
    if _EX is None:
        _EX = takes.load_pack_exercises()
    rng = np.random.default_rng(job["seed"])
    if job["kind"] == "pack":
        ex, bpm = _EX[job["ex"]], job["bpm"]
    else:
        ex = takes.drill(job["drill"], rng, job["idx"])
        bpm = ex["tempo"]["passAtBpm"]
    timbre = gs.Timbre.draw(rng)
    notes, labels, seconds = takes.build_take(ex, bpm, job["style"], job["seed"], timbre)
    dry = gs.render_strings(notes, seconds, seed=job["seed"] % (1 << 31), timbre=timbre)
    kinds = [str(rng.choice(["di", "di", "di_gain"]))] + [str(k) for k in rng.choice(chains.KINDS[2:], size=2, replace=False)]
    out = []
    for k in kinds:
        p = chains.draw(rng, k)
        y = chains.apply(dry, gs.SR, p)
        y = signal.resample_poly(y, 147, 320).astype(np.float32)
        out.append((p, y))
    meta = {"source": "synth", "licence": "own (procedural string model; tabs from the app's packs)", "split": job["split"], "exercise": ex["id"], "pack": ex.get("pack"),
            "bpm": bpm, "style": job["style"], "seed": job["seed"], "seconds": round(seconds, 3), "timbre": {k: (list(v) if isinstance(v, tuple) else v) for k, v in vars(timbre).items()}}
    return meta, labels, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="synth-v1")
    ap.add_argument("--seed", type=int, default=20261119)
    ap.add_argument("--variants", type=int, default=4)
    ap.add_argument("--drills", type=int, default=1500)
    ap.add_argument("--jobs", type=int, default=16)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    jobs = jobs_of(a.seed, a.variants, a.drills)
    if a.limit:
        jobs = jobs[:: max(1, len(jobs) // a.limit)][: a.limit]
    w = store.Writer(a.name)
    t0 = time.time()
    with mp.Pool(a.jobs) as pool:
        for i, (meta, labels, out) in enumerate(pool.imap(run, jobs, chunksize=4)):
            tid = w.take(meta, labels)
            for p, y in out:
                w.item(tid, y, {"split": meta["split"], "chain": p})
            if i % 200 == 0:
                print(f"{i}/{len(jobs)} takes, {w.offset / store.RATE / 3600:.2f} h, {time.time() - t0:.0f} s", flush=True)
    m = w.close({"name": a.name, "source": "synth", "licence": "own", "seed": a.seed, "variants": a.variants, "drills": a.drills,
                 "renderer": "tools/ml/factory/synth.py (extended Karplus-Strong), chains.py", "packs": "src/paths/packs/*.json"})
    print(json.dumps(m))


if __name__ == "__main__":
    main()
