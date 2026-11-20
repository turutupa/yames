"""Vendored copy of `tools/ml/factory/store.py` (branch mvp-ml): the same on-disk format.

ingest.py imports the real module when it exists and falls back to this one.
Keep the two identical (the body below is the mvp-ml file as it was).


    <set>/audio.i16      every item's audio end to end: mono, 22,050 Hz, int16
    <set>/takes.jsonl    one line a performance: its labels (what sounds, when)
    <set>/items.jsonl    one line a recording of a take: where it is in
                         audio.i16, through which chain, which split
    <set>/manifest.json  what the set is, from what, under which licence

A take recorded through three chains is three items and one set of labels.
"""
from __future__ import annotations

import json
import os
import pathlib

import numpy as np

RATE = 22_050
ROOT = pathlib.Path(os.environ.get("YAMES_ML_DATA", pathlib.Path.home() / "projects/.datasets/yames-synth"))


class Writer:
    def __init__(self, name: str):
        self.dir = ROOT / name
        self.dir.mkdir(parents=True, exist_ok=True)
        self.audio = open(self.dir / "audio.i16", "wb")
        self.takes = open(self.dir / "takes.jsonl", "w")
        self.items = open(self.dir / "items.jsonl", "w")
        self.offset = 0
        self.n_takes = 0
        self.n_items = 0

    def take(self, meta: dict, notes: list) -> int:
        tid = self.n_takes
        self.takes.write(json.dumps({"take": tid, **meta, "notes": notes}) + "\n")
        self.n_takes += 1
        return tid

    def item(self, take: int, audio: np.ndarray, meta: dict):
        """`audio`: float in -1..1 at RATE."""
        a = np.clip(np.round(audio * 32767.0), -32768, 32767).astype("<i2")
        self.audio.write(a.tobytes())
        self.items.write(json.dumps({"item": self.n_items, "take": take, "offset": self.offset, "samples": int(a.shape[0]), **meta}) + "\n")
        self.offset += int(a.shape[0])
        self.n_items += 1

    def close(self, manifest: dict):
        for f in (self.audio, self.takes, self.items):
            f.close()
        manifest = {**manifest, "rate": RATE, "takes": self.n_takes, "items": self.n_items, "hours": round(self.offset / RATE / 3600, 3)}
        json.dump(manifest, open(self.dir / "manifest.json", "w"), indent=1)
        return manifest


class Reader:
    def __init__(self, name: str):
        self.dir = ROOT / name
        self.manifest = json.load(open(self.dir / "manifest.json"))
        self.takes = [json.loads(l) for l in open(self.dir / "takes.jsonl")]
        self.items = [json.loads(l) for l in open(self.dir / "items.jsonl")]
        self.audio = np.memmap(self.dir / "audio.i16", dtype="<i2", mode="r")
