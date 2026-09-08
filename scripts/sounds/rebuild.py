"""Rebuild the metronome samples from their originals, and synthesise the ones
that have no original.

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

   THAT FIX DID NOT WORK, and it is worth knowing why before touching these
   numbers again. Measured after it shipped, the drum accent was still 0.5 dB
   *quieter* than the plain beat through a 200 Hz–4 kHz band-pass, and 2.1 dB
   quieter A-weighted. Three compounding reasons:

     a. The beater is 6 ms long and carries 0.45% of the kick's energy. A
        transient that short raises the PEAK almost 1:1 while adding almost no
        loudness — the worst possible currency when the budget is peak.
     b. It was added to a kick already peaking at 0.97, so this script's own
        `peak > 0.97` guard scaled the whole file — beater included — back
        down again.
     c. The engine then peak-normalises the three-layer premix, and that peak
        is set by the sub-120 Hz kick. So a frequency a laptop cannot
        reproduce was costing the metal and crash — the two layers it can —
        another 2.3 dB.

   The real fix needs loudness, not peak, and is in two parts. `drum_body`
   below is a 55 ms layer whose energy sits in 200 Hz–1.6 kHz, so it survives
   band-limiting; and `SoundBank::new` now soft-saturates the premix instead
   of dividing it by its peak, which turns the kick's inaudible sub energy
   into harmonics that land where a small speaker works. Together they take
   the accent from −0.5 dB to +6.4 dB against the beat on a laptop.

THE TRANSFORM STAGE IS NOT IDEMPOTENT — running it twice adds a second beater
to the kick. It refuses to run when every sample already ends in silence,
which is true only after it has run. To re-run it, restore the originals:

    git checkout <commit-before-the-sound-fixes> -- src-tauri/sounds

THE SYNTHESIS STAGE IS idempotent — those files are built from seeded noise
and arithmetic, not from an original, so it always runs and always produces
the same bytes.

Usage:  python scripts/sounds/rebuild.py [--check | --synth-only]
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


# ---------------------------------------------------------------------------
# Synthesis — the samples that have no original to rebuild from.
#
# All of it is deterministic: seeded RNG and arithmetic, no input files. That
# is what makes this stage safe to re-run, unlike the transform stage above.
# ---------------------------------------------------------------------------

SYNTH = ["drum_body.wav", "snare_low.wav", "snare_high.wav"]


def _noise(n, seed):
    return np.random.default_rng(seed).normal(0, 1, n)


def _band(x, lo, hi, sr):
    """Zero-phase band-pass done in the frequency domain.

    numpy only, on purpose: a build tool that needs scipy to produce the bytes
    we ship is a build tool that eventually stops working. An FFT mask is also
    easier to be sure of than hand-rolled biquad coefficients, and phase does
    not matter here — every caller feeds it white noise.

    The edges are raised-cosine over a half-octave rather than square, because
    a brick wall rings and the ringing is audible as a tone on a short hit."""
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / sr)
    mask = np.ones_like(f)
    with np.errstate(divide="ignore", invalid="ignore"):
        # Ramp up across [lo/1.4, lo] and back down across [hi, hi*1.4].
        up = np.clip(np.log2(np.maximum(f, 1e-9) / (lo / 1.4)) / np.log2(1.4), 0, 1)
        dn = np.clip(np.log2((hi * 1.4) / np.maximum(f, 1e-9)) / np.log2(1.4), 0, 1)
    mask = 0.5 * (1 - np.cos(np.pi * up)) * 0.5 * (1 - np.cos(np.pi * dn))
    return np.fft.irfft(np.fft.rfft(x) * mask, n)


def _norm(x, peak=1.0):
    """Normalise, after removing DC — a decaying sine that starts at phase zero
    has a non-zero mean, and point 2 above applies to synthesised samples just
    as much as to rebuilt ones."""
    x = x - np.mean(x)
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def _saturate(x, drive, ceil=0.97):
    """Soft limiting, not peak division. See `SoundBank::new` — the point is
    that a tanh curve keeps the peak under the ceiling while KEEPING the
    loudness that dividing by the peak throws away, and the harmonics it
    generates from a sub-bass fundamental land in the band a laptop can
    actually reproduce."""
    y = np.tanh(x * drive) / np.tanh(drive)
    y = y - np.mean(y)
    pk = np.max(np.abs(y))
    return y * (ceil / pk) if pk > ceil else y


def drum_body(sr):
    """The mid-band body the drum accent never had.

    Not a transient: 55 ms, with its energy in 200 Hz–1.6 kHz, because the
    6 ms beater that came before it added peak instead of loudness and was
    normalised straight back out (see point 3 in the module docstring). This
    is the beater on the head plus the shell speaking under it."""
    n = int(sr * 55.0 / 1000)
    t = np.arange(n) / sr
    shell = (
        np.sin(2 * np.pi * 210 * t) * np.exp(-t * 42) * 0.90
        + np.sin(2 * np.pi * 348 * t) * np.exp(-t * 58) * 0.55
        + np.sin(2 * np.pi * 620 * t) * np.exp(-t * 90) * 0.30
    )
    click = _band(_noise(n, 11), 900, 4200, sr) * np.exp(-t * 150)
    thwack = _band(_noise(n, 12), 250, 1400, sr) * np.exp(-t * 55)
    return fade_tail(_norm(shell * 0.55 + click * 1.5 + thwack * 1.1), sr)


def _kick(sr):
    """A kick with a pitch drop, the way a real head detunes as it stretches."""
    n = int(sr * 150.0 / 1000)
    t = np.arange(n) / sr
    f = 105 * np.exp(-t * 38) + 48
    body = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t * 19)
    beat = _band(_noise(n, 21), 700, 3800, sr) * np.exp(-t * 190) * 0.8
    return _norm(body + beat * 0.55)


def _snare(sr):
    """Shell tones plus the wires. The wires are the wide-band part, and they
    are what makes this read as a drum rather than as a cymbal."""
    n = int(sr * 140.0 / 1000)
    t = np.arange(n) / sr
    shell = (
        np.sin(2 * np.pi * 188 * t) * np.exp(-t * 30)
        + np.sin(2 * np.pi * 331 * t) * np.exp(-t * 38) * 0.7
    )
    wires = _band(_noise(n, 22), 260, 5200, sr) * np.exp(-t * 30)
    crack = _band(_noise(n, 23), 1200, 4800, sr) * np.exp(-t * 130)
    return _norm(shell * 0.75 + wires * 1.25 + crack * 0.9)


def snare_high(sr):
    """The SNARE kit's accent: kick and snare together, the backbeat of an
    actual kit. Mixed and limited here rather than in the engine, so the
    balance is fixed in the file and there is no premix to normalise it away."""
    k, s = _kick(sr), _snare(sr)
    n = max(len(k), len(s))
    y = np.zeros(n)
    y[: len(s)] += s
    y[: len(k)] += k * 0.70
    return fade_tail(_saturate(y, 1.0), sr)


def snare_low(sr):
    """The SNARE kit's plain beat: a side-stick — wood on the rim with the
    shell under it. Short and mid-focused on purpose, so it stays out of the
    accent's way. Peak 0.85 rather than 0.97 is what sets this kit's accent
    3 dB clear before the engine's BEAT_GAIN is even applied."""
    n = int(sr * 60.0 / 1000)
    t = np.arange(n) / sr
    wood = (
        np.sin(2 * np.pi * 780 * t) * np.exp(-t * 105)
        + np.sin(2 * np.pi * 1290 * t) * np.exp(-t * 150) * 0.6
    )
    shell = np.sin(2 * np.pi * 245 * t) * np.exp(-t * 60) * 0.45
    tick = _band(_noise(n, 24), 1500, 6000, sr) * np.exp(-t * 260) * 0.9
    return fade_tail(_norm(wood * 0.8 + shell + tick, 0.85), sr)


def synthesise(name, sr=SR):
    return {
        "drum_body.wav": drum_body,
        "snare_low.wav": snare_low,
        "snare_high.wav": snare_high,
    }[name](sr)


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
    synth_only = "--synth-only" in sys.argv

    # Synthesis first, and unguarded: these files are built from arithmetic
    # rather than from an original, so re-running is a no-op rather than a
    # second beater. This is also the only stage that still works after the
    # transform stage has run, which is the state the repo is normally in.
    if not check:
        for name in SYNTH:
            write(os.path.join(SND, name), synthesise(name), SR)
            print(f"synthesised {name}")

    if not synth_only:
        if not check and already_done():
            raise SystemExit(
                "\nEvery sample already ends in silence, so the transform stage has "
                "run before and running it again would add a second beater to the "
                "kick. The synthesised files above are up to date.\n"
                "To redo the transform stage, restore the originals first:\n"
                "  git checkout <commit-before-the-sound-fixes> -- src-tauri/sounds\n"
                "Or pass --synth-only to skip it deliberately."
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
        for name in (TARGETS if not synth_only else []) + SYNTH:
            with open(os.path.join(SND, name), "rb") as f:
                print(f"  {name:<17}{hashlib.sha256(f.read()).hexdigest()[:16]}")


if __name__ == "__main__":
    main()
