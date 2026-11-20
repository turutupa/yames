"""Capture chains with every parameter drawn at random.

The same family as the bench's (`detect-bench/synth.rs::capture`): a DI, a
high-gain DI, a laptop microphone, a phone microphone, a phone with automatic
gain and a limiter, a noisy room, a reverberant room, and a Bluetooth-headset
band. They are stress conditions, not measurements of a device: nobody has
published phone-microphone responses under an open licence. When the owner's
corpus (card #85) exists, the DI-to-phone pairs replace these.

`draw(rng, kind)` gives a plain dict (it goes into the manifest);
`apply(x, sr, params)` runs it. Works at any rate (48 kHz for the synth,
22.05 kHz for real recordings).
"""
from __future__ import annotations

import math

import numpy as np
from numba import njit
from scipy import signal

KINDS = ("di", "di_gain", "laptop_mic", "phone_mic", "phone_agc", "laptop_noisy", "laptop_reverb", "bt")
# what a recording that is already a microphone may be put through
MIC_SAFE = ("phone_mic", "phone_agc", "laptop_noisy", "laptop_reverb", "bt")


def draw(rng: np.random.Generator, kind: str) -> dict:
    u = rng.uniform
    p = {"kind": kind, "seed": int(rng.integers(1 << 31)), "eq": [[float(u(150, 5000)), float(u(-6, 6)), float(u(0.7, 2.5))] for _ in range(int(rng.integers(0, 4)))]}
    if kind == "di":
        p.update(lp=u(4000, 9000), hp=0.0, noise_db=u(-85, -60))
    elif kind == "di_gain":
        p.update(lp=u(3200, 5500), hp=u(60, 140), drive=u(4, 30), noise_db=u(-65, -45))
    elif kind == "laptop_mic":
        p.update(hp=u(80, 200), lp=u(6000, 10500), rt60=u(0.2, 0.5), direct_db=u(4, 12), noise_db=u(-50, -34))
    elif kind == "laptop_noisy":
        p.update(hp=u(80, 200), lp=u(6000, 10500), rt60=u(0.2, 0.5), direct_db=u(4, 12), noise_db=u(-32, -18), hum=float(rng.choice([0.0, u(0.0, 0.5)])))
    elif kind == "laptop_reverb":
        p.update(hp=u(80, 200), lp=u(6000, 10500), rt60=u(0.5, 1.0), direct_db=u(-3, 4), noise_db=u(-50, -34))
    elif kind in ("phone_mic", "phone_agc"):
        p.update(hp=u(120, 300), lp=u(5000, 9000), rt60=u(0.3, 0.7), direct_db=u(1, 9), noise_db=u(-40, -24))
        if kind == "phone_agc":
            p.update(agc=dict(target=u(0.06, 0.2), attack_ms=u(3, 20), release_ms=u(150, 900), max_gain=u(6, 20)), limit=u(1.0, 2.5))
    elif kind == "bt":
        p.update(hp=u(150, 300), lp=u(3400, 7000), rt60=u(0.2, 0.5), direct_db=u(3, 10), noise_db=u(-40, -26), bits=int(rng.integers(9, 13)),
                 agc=dict(target=u(0.08, 0.2), attack_ms=u(3, 20), release_ms=u(150, 900), max_gain=u(4, 12)), limit=u(1.0, 2.0))
    else:
        raise ValueError(kind)
    p["level"] = float(u(0.08, 0.9))
    return {k: (float(v) if isinstance(v, (np.floating, float)) else v) for k, v in p.items()}


def _peaking(sr, f0, gain_db, q):
    a = 10 ** (gain_db / 40.0)
    w = 2 * math.pi * min(f0, sr * 0.45) / sr
    alpha = math.sin(w) / (2 * q)
    b = np.array([1 + alpha * a, -2 * math.cos(w), 1 - alpha * a])
    den = np.array([1 + alpha / a, -2 * math.cos(w), 1 - alpha / a])
    return b / den[0], den / den[0]


def _room_ir(rng, sr, rt60, direct_db):
    n = int(rt60 * 1.2 * sr)
    t = np.arange(n) / sr
    tail = rng.normal(0, 1, n) * np.exp(-6.91 * t / rt60)
    tail[: int(0.004 * sr)] = 0.0
    tail /= np.sqrt(np.sum(tail ** 2)) + 1e-12
    ir = tail * 10 ** (-direct_db / 20.0)
    ir[0] = 1.0
    return ir


def _noise(rng, sr, n, tilt):
    x = rng.normal(0, 1, n)
    b, a = signal.butter(1, min(0.95, tilt * 2000.0 / (sr / 2)))
    x = signal.lfilter(b, a, x) + 0.25 * x
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-12)


@njit(cache=True)
def _agc_loop(x, a_att, a_rel, target, max_gain):
    out = np.zeros(x.shape[0])
    level = 1e-4
    for i in range(x.shape[0]):
        e = abs(x[i])
        if e > level:
            level = a_att * level + (1 - a_att) * e
        else:
            level = a_rel * level + (1 - a_rel) * e
        g = target / (level + 1e-5)
        if g > max_gain:
            g = max_gain
        out[i] = x[i] * g
    return out


def apply(x: np.ndarray, sr: int, p: dict) -> np.ndarray:
    """`x` mono float; returns float32 with peak `p['level']` at most."""
    rng = np.random.default_rng(p["seed"])
    nyq = sr / 2
    y = x / (np.max(np.abs(x)) + 1e-9)
    n = y.shape[0]
    for f0, g, q in p["eq"]:
        b, a = _peaking(sr, f0, g, q)
        y = signal.lfilter(b, a, y)
    if p.get("hp", 0) > 0:
        b, a = signal.butter(2, p["hp"] / nyq, btype="high")
        y = signal.lfilter(b, a, y)
    if "drive" in p:
        y = np.tanh(p["drive"] * y)
    if p.get("lp", 0) > 0 and p["lp"] < nyq * 0.98:
        b, a = signal.butter(2 if "drive" not in p else 3, p["lp"] / nyq)
        y = signal.lfilter(b, a, y)
    if "rt60" in p:
        y = signal.fftconvolve(y, _room_ir(rng, sr, p["rt60"], p["direct_db"]))[:n]
    y = y / (np.max(np.abs(y)) + 1e-9)
    y = y + 10 ** (p["noise_db"] / 20.0) * _noise(rng, sr, n, float(rng.uniform(0.3, 1.2)))
    if p.get("hum", 0) > 0:
        f = float(rng.choice([50.0, 60.0]))
        t = np.arange(n) / sr
        y = y + p["hum"] * 10 ** (p["noise_db"] / 20.0) * (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) + 0.3 * np.sin(2 * np.pi * 3 * f * t))
    if "agc" in p:
        g = p["agc"]
        y = _agc_loop(0.2 * y, math.exp(-1.0 / (g["attack_ms"] / 1000.0 * sr)), math.exp(-1.0 / (g["release_ms"] / 1000.0 * sr)), g["target"], g["max_gain"])
        y = np.tanh(p["limit"] * y) / p["limit"]
    if "bits" in p:
        q = 2.0 ** (p["bits"] - 1)
        y = np.round(y / (np.max(np.abs(y)) + 1e-9) * q) / q
    return (y * (p["level"] / (np.max(np.abs(y)) + 1e-9))).astype(np.float32)
