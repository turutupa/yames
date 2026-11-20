"""Windows of audio with frame labels, from the sets `factory/store.py` writes."""
from __future__ import annotations

import numpy as np
import torch

from ..bp_torch import FRAMES, HOP, MIDI_LOW, PITCHES, RATE, WINDOW
from ..factory import store

DT = HOP / RATE


def frame_labels(notes: list, t0: float, frames: int = FRAMES):
    """Note and onset targets for frames at `t0 + j * DT` (pass `t0` moved by
    the model's own frame offset to keep Basic Pitch's timing)."""
    note = np.zeros((frames, PITCHES), np.float32)
    onset = np.zeros((frames, PITCHES), np.float32)
    t1 = t0 + frames * DT
    for n in notes:
        if n["end"] < t0 or n["t"] > t1 or n["midi"] is None:
            continue
        for a, b, m in n["segs"]:
            c = m - MIDI_LOW
            if not 0 <= c < PITCHES:
                continue
            ja, jb = int(np.ceil((a - t0) / DT)), int(np.floor((b - t0) / DT))
            if jb >= 0 and ja < frames:
                note[max(0, ja):min(frames, jb + 1), c] = 1.0
        for t, m in n["on"]:
            c = m - MIDI_LOW
            j = int(round((t - t0) / DT))
            if 0 <= c < PITCHES:
                for d, v in ((0, 1.0), (-1, 0.6), (1, 0.3)):  # Basic Pitch peaks half a frame early
                    if 0 <= j + d < frames:
                        onset[j + d, c] = max(onset[j + d, c], v)
    return note, onset


class Windows(torch.utils.data.Dataset):
    """Random two-second windows; an epoch is `length` draws, seeded per index."""

    def __init__(self, sets: dict, split: str, length: int, seed: int = 0, shift_frames=0.0, keep=None):
        # shift_frames: a number, or name -> frames (see train/n1.py SHIFT)
        # sets: name -> sampling weight
        self.readers, self.pools, self.weights, self.shifts = [], [], [], []
        for name, weight in sets.items():
            r = store.Reader(name)
            items = [i for i in r.items if i["split"] == split and i["samples"] > WINDOW // 2 and (keep is None or keep(r.takes[i["take"]], i))]
            if not items:
                continue
            self.readers.append(r)
            self.pools.append((items, np.cumsum([i["samples"] for i in items], dtype=np.float64)))
            self.weights.append(weight)
            self.shifts.append((shift_frames.get(name, 0.0) if isinstance(shift_frames, dict) else shift_frames) * DT)
        self.weights = np.array(self.weights) / np.sum(self.weights)
        self.length, self.seed = length, seed

    def __len__(self):
        return self.length

    def __getitem__(self, idx):
        rng = np.random.default_rng((self.seed, idx))
        k = int(rng.choice(len(self.readers), p=self.weights))
        r = self.readers[k]
        items, cum = self.pools[k]
        it = items[int(np.searchsorted(cum, rng.uniform(0, cum[-1])))]
        s0 = int(rng.integers(-WINDOW // 4, max(1, it["samples"] - WINDOW * 3 // 4)))
        a, b = max(0, s0), min(it["samples"], s0 + WINDOW)
        x = np.zeros(WINDOW, np.float32)
        x[a - s0:b - s0] = r.audio[it["offset"] + a:it["offset"] + b].astype(np.float32) / 32768.0
        x *= float(rng.uniform(0.3, 1.0)) / (np.max(np.abs(x)) + 1e-3) if rng.random() < 0.5 else 1.0
        note, onset = frame_labels(r.takes[it["take"]]["notes"], s0 / RATE + self.shifts[k])
        real = 1.0 if str(it["chain"].get("kind", "")).startswith("real_") else 0.0
        return torch.from_numpy(x), torch.from_numpy(note), torch.from_numpy(onset), k, real
