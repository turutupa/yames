"""Rebuild the metronome samples from their originals.

WHAT THIS FIXES, and how it was found: every number below came from measuring
the shipped files, not from listening. See the commit that introduced this
script for the full table.

1. TAILS. The samples were truncated mid-decay rather than faded, so the
   waveform steps to zero and the step is a click — a second, unintended click
   on every beat. `drum_high` ended at -20 dBFS, `drum_crash` -24,
   `drum_metal` -27, `click_high` -29, `click_low` -33. A 4 ms raised-cosine
   fade removes all of them and is inaudible on the decay itself.

2. DC. A non-zero mean thumps through a speaker and wastes headroom. Removed
   before the fade, so the fade lands on true zero.

3. THE KICK ON A SMALL SPEAKER. `drum_high` had 100% of its energy below
   120 Hz — a 50 Hz sub-kick. Measured through a 200 Hz high-pass (roughly
   what a laptop radiates) the drum accent stood only +0.2 dB above the plain
   beat, so the downbeat effectively vanished on the speaker most people use.
   A beater transient at ~1.9 kHz gives it something a small driver can
   reproduce. Headphones keep the sub; laptops gain the click.

THIS SCRIPT IS NOT IDEMPOTENT — running it twice adds a second beater to the
kick. It refuses to run when every sample already ends in silence, which is
true only after it has run. To re-run it, restore the originals first:

    git checkout <commit-before-the-sound-fixes> -- src-tauri/sounds

Usage:  python scripts/sounds/rebuild.py [--check]
"""
import hashlib
import os
import sys
import wave

import numpy as np

SND = os.path.join("src-tauri", "sounds")
SR = 44100
FADE_MS = 4.0

TARGETS = [
    "click_low.wav", "click_high.wav",
    "wood_low.wav", "wood_high.wav",
    "beep_low.wav", "beep_high.wav",
    "drum_low.wav", "drum_high.wav",
    "drum_metal.wav", "drum_crash.wav",
    "chime_up.wav", "chime_down.wav",
]


def read(path):
    with wave.open(path, "rb") as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise SystemExit(f"{path}: expected 16-bit, got {sw * 8}")
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x, sr


def write(path, x, sr):
    x = np.clip(x, -1.0, 1.0)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


def fade_tail(x, sr):
    n = min(len(x), int(sr * FADE_MS / 1000))
    if n < 2:
        return x
    y = x.copy()
    y[-n:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, n)))
    return y


def beater(sr):
    """The click of the beater on the head — the part of a kick that a laptop
    speaker can actually make. Deterministic seed so the file is reproducible."""
    n = int(sr * 6.0 / 1000)
    t = np.arange(n) / sr
    env = np.exp(-t * 520)
    tone = np.sin(2 * np.pi * 1900 * t) * 0.6 + np.sin(2 * np.pi * 5130 * t) * 0.4
    noise = np.random.default_rng(7).normal(0, 1, n) * np.exp(-t * 1400)
    y = tone * env + noise * 0.5 * env
    return y / np.max(np.abs(y))


def rebuild(name):
    path = os.path.join(SND, name)
    x, sr = read(path)
    y = fade_tail(x - np.mean(x), sr)
    if name == "drum_high.wav":
        b = beater(sr) * 0.5
        y[: len(b)] += b
        peak = np.max(np.abs(y))
        if peak > 0.97:
            y *= 0.97 / peak
    return path, y, sr


def already_done():
    """Every target already ending in near-silence means this has run before.
    Cheaper and more honest than a checksum list that has to be kept current:
    a truncated original ends at -20 to -33 dBFS, a faded one at -80 or below."""
    tails = []
    for name in TARGETS:
        x, _ = read(os.path.join(SND, name))
        tails.append(abs(x[-1]))
    return max(tails) < 1e-4


def main():
    check = "--check" in sys.argv
    if not check and already_done():
        raise SystemExit(
            "Every sample already ends in silence, so this has run before and "
            "running it again would add a second beater to the kick.\n"
            "Restore the originals first:\n"
            "  git checkout <commit-before-the-sound-fixes> -- src-tauri/sounds"
        )
    for name in TARGETS:
        path, y, sr = rebuild(name)
        if check:
            print(f"{name:<17} tail now {20 * np.log10(max(abs(y[-1]), 1e-9)):>7.1f} dBFS")
        else:
            write(path, y, sr)
            print(f"rebuilt {name}")
    if not check:
        print("\nsha256 of the results:")
        for name in TARGETS:
            with open(os.path.join(SND, name), "rb") as f:
                print(f"  {name:<17}{hashlib.sha256(f.read()).hexdigest()[:16]}")


if __name__ == "__main__":
    main()
