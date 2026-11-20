"""Train N1 (`tools/ml/n1.py`): `python -m tools.ml.train.n1 --run n1a --arch a`.

Loss: weighted binary cross-entropy on note and onset frames against the
labels, plus, on real recordings as they were recorded (not re-chained), the
shipped Basic Pitch's own answer as a soft target (`--anchor`), so behaviour
on real guitar does not drift from the model the verifier was tuned on.

Resumable: `--run` names a folder in `~/projects/.models/yames-ml/`; a
`ckpt.pt` there is picked up. SIGTERM saves and exits (the 7 AM rule).
Deterministic data: every window is drawn from (seed, epoch, index).
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import signal
import time

import numpy as np
import torch
import torch.nn.functional as F

from .. import n1
from .data import Windows

MODELS = pathlib.Path(os.environ.get("YAMES_ML_MODELS", pathlib.Path.home() / "projects/.models/yames-ml"))
SETS = {"synth-v1": 0.55, "guitarset-v1": 0.25, "techs-v1": 0.20}
# Where Basic Pitch puts a frame, measured against each set's labels (its onset
# peak sits this many frames before the labelled attack): the labels are moved
# by it, so a trained head keeps the timing the verifier was tuned on. The real
# sets are later than the synthetic one because their annotations are (Basic
# Pitch learnt its timing from GuitarSet's).
SHIFT = {"synth-v1": 0.5, "guitarset-v1": 0.9, "techs-v1": 0.8}


def keep(take, item):
    # Guitar-TECHS writes a bend as extra notes with no attack: not a label to learn onsets from
    return "bend" not in str(take.get("group", "")).lower()


def bce(logit, target, pos_weight):
    return F.binary_cross_entropy_with_logits(logit, target, pos_weight=torch.tensor(pos_weight, device=logit.device))


def scores(pred, target, th=0.4):
    p, t = pred > th, target > 0.5
    return np.array([(p & t).sum().item(), p.sum().item(), t.sum().item()], dtype=np.float64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--arch", default="a")
    ap.add_argument("--width", type=int, default=24)
    ap.add_argument("--steps", type=int, default=12000)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--lr-new", type=float, default=1e-3)
    ap.add_argument("--note-pos", type=float, default=2.0)
    ap.add_argument("--onset-pos", type=float, default=5.0)
    ap.add_argument("--anchor", type=float, default=0.5)
    ap.add_argument("--seed", type=int, default=20261119)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--eval-every", type=int, default=1000)
    a = ap.parse_args()
    out = MODELS / a.run
    out.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(a.seed)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    front = n1.Front().to(dev).eval()
    head = n1.Head(a.arch, a.width).to(dev)
    teacher = n1.Head("a").to(dev).eval()
    new = [p for n, p in head.named_parameters() if n.startswith("r")]
    old = [p for n, p in head.named_parameters() if not n.startswith("r")]
    opt = torch.optim.AdamW([{"params": old, "lr": a.lr}, {"params": new, "lr": a.lr_new}], weight_decay=1e-4)
    base_lrs = [g["lr"] for g in opt.param_groups]
    step = 0
    ckpt = out / "ckpt.pt"
    if ckpt.exists():
        s = torch.load(str(ckpt), map_location=dev, weights_only=False)
        head.load_state_dict(s["head"]); opt.load_state_dict(s["opt"]); step = s["step"]
        print("resumed at step", step, flush=True)
    json.dump({**vars(a), "sets": SETS, "shift": SHIFT, "device": dev, "torch": torch.__version__}, open(out / "config.json", "w"), indent=1)

    def save():
        tmp = out / "ckpt.tmp"
        torch.save({"head": head.state_dict(), "opt": opt.state_dict(), "step": step, "arch": a.arch, "width": a.width, "args": vars(a)}, str(tmp))
        os.replace(tmp, ckpt)

    stop = {"now": False}
    signal.signal(signal.SIGTERM, lambda *_: stop.update(now=True))

    cache = {}

    def loader(split, length, seed, sets=SETS):
        key = (split, tuple(sets))
        if key not in cache:
            cache[key] = Windows(sets, split, length, seed=seed, shift_frames=SHIFT, keep=keep)
        ds = cache[key]
        ds.length, ds.seed = length, seed
        return torch.utils.data.DataLoader(ds, batch_size=a.batch, num_workers=a.workers, drop_last=split == "train", persistent_workers=False)

    def evaluate():
        head.eval()
        res = {}
        for name in SETS:
            agg = np.zeros(6)
            base = np.zeros(6)
            loss = 0.0
            nb = 0
            with torch.no_grad():
                for x, yn, yo, _, _ in loader("val", 640, 7, {name: 1.0}):
                    x, yn, yo = x.to(dev), yn.to(dev), yo.to(dev)
                    h = front(x)
                    ln, lo = head.logits(h)
                    tn, to = teacher(h)
                    loss += (bce(ln, yn, a.note_pos) + bce(lo, yo, a.onset_pos)).item(); nb += 1
                    agg += np.concatenate([scores(torch.sigmoid(ln), yn), scores(torch.sigmoid(lo), (yo >= 1).float())])
                    base += np.concatenate([scores(tn, yn), scores(to, (yo >= 1).float())])
            f = lambda v: [round(v[0] / max(1, v[1]), 3), round(v[0] / max(1, v[2]), 3)]
            res[name] = {"loss": round(loss / max(1, nb), 4), "note_PR": f(agg[:3]), "onset_PR": f(agg[3:]), "bp_note_PR": f(base[:3]), "bp_onset_PR": f(base[3:])}
        head.train()
        return res

    t0 = time.time()
    log = open(out / "train.jsonl", "a")
    epoch_len = a.eval_every * a.batch
    while step < a.steps and not stop["now"]:
        run_loss = []
        for x, yn, yo, _, real in loader("train", epoch_len, a.seed + step):
            if step >= a.steps or stop["now"]:
                break
            x, yn, yo, real = x.to(dev), yn.to(dev), yo.to(dev), real.to(dev)
            h = front(x)
            ln, lo = head.logits(h)
            loss = bce(ln, yn, a.note_pos) + bce(lo, yo, a.onset_pos)
            if a.anchor > 0 and real.sum() > 0:
                with torch.no_grad():
                    tn, to = teacher(h)
                m = real.bool()
                loss = loss + a.anchor * (F.binary_cross_entropy_with_logits(ln[m], tn[m]) + F.binary_cross_entropy_with_logits(lo[m], to[m])) * m.float().mean()
            lr_scale = min(1.0, (step + 1) / 200) * 0.5 * (1 + np.cos(np.pi * step / a.steps))
            for g, b in zip(opt.param_groups, base_lrs):
                g["lr"] = b * lr_scale
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(head.parameters(), 5.0)
            opt.step()
            step += 1
            run_loss.append(loss.item())
        save()
        rec = {"step": step, "train_loss": round(float(np.mean(run_loss)), 4) if run_loss else None, "minutes": round((time.time() - t0) / 60, 1),
               "gpu_gb": round(torch.cuda.max_memory_allocated() / 1e9, 2) if dev == "cuda" else 0, "val": evaluate()}
        log.write(json.dumps(rec) + "\n"); log.flush()
        print(json.dumps(rec), flush=True)
    save()
    if step >= a.steps:
        n1.export(n1.load_head(ckpt), out / f"{a.run}.onnx", note=f"run {a.run}, step {step}")
        (out / "done").write_text(str(step))
        print("done", flush=True)
    else:
        print("stopped at step", step, "- run the same command to resume", flush=True)


if __name__ == "__main__":
    main()
