"""The synthesised bass and keys recipes, mirrored so a recording can be
levelled against them — and for nothing else.

`render_voice.compute_trim` has to answer one question: how loud was the
voice this bank replaces? The contract's level rule for a melodic bank is not
the kit's ("balance against the snare") but "land where the recipe landed",
because a musician who has practised to the synthesised fingered bass for a
month installs the recorded one and every dial they have set — `bass.gain`,
`mix.bass`, the intensity — sits on top of that level. So the reference has
to be the recipe itself, and the recipe lives in Rust.

WHY A MIRROR AND NOT A MEASUREMENT OF THE RUNNING ENGINE. The engine renders
these notes inside `set_jam`, on a command thread, into a bank that never
reaches a file; there is no build of the app that will write one out, and
adding one would be adding Rust to a sound-design branch. Forty lines of
arithmetic that anyone can diff against `engine.rs` is the smaller risk.

**`src-tauri/src/engine.rs` is the authority.** This file is a copy and a
copy can go stale, so it is kept honest three ways:

* It is a LEVEL REFERENCE and never ships anything. Nothing here is written
  into a WAV, a manifest or the app — the only thing that leaves is a number
  of decibels.
* The port is a transcription, not a re-derivation: the same partial tables,
  the same envelope, the same `one_pole_magnitude`, the same peak
  normalisation to 0.9, in the same order.
* `--self-test` renders every voice and prints its length, peak and in-band
  level, which is what a drift would show up in.

If a recipe in `engine.rs` changes, the banks want re-levelling, and that is
true whether or not this file is updated — a trim measured against the old
recipe is a bank that no longer lands where the new one does.
"""
import math

import numpy as np

# `engine::TUNING_HZ`.
TUNING_HZ = 440.0
# `engine::VOICE_PEAK` — every synthesised note is normalised to this, which
# is also what `render_kit.PEAK` writes every recorded file at, which is why
# the two are comparable at all.
VOICE_PEAK = 0.9
# `engine::PARTIAL_CEILING`.
PARTIAL_CEILING = 0.45
# `engine::HELD` — a partial that does not decay.
HELD = float("inf")


def _p(n, amp, tau=HELD):
    return (n, amp, tau)


# The bite in FINGERED and the click in PICKED are truncated harmonic series
# written out one entry per harmonic, exactly as `engine.rs` has them.
FINGERED = {
    "secs": 0.45, "attack_secs": 0.002, "body_tau": 0.15, "release_fraction": 0.2,
    "partials": [
        _p(1, 1.0), _p(2, 0.22),
        _p(1, 0.420, 0.014), _p(2, 0.210, 0.014), _p(3, 0.140, 0.014),
        _p(4, 0.105, 0.014), _p(5, 0.084, 0.014), _p(6, 0.070, 0.014),
        _p(7, 0.060, 0.014), _p(8, 0.053, 0.014), _p(9, 0.047, 0.014),
        _p(10, 0.042, 0.014), _p(11, 0.038, 0.014), _p(12, 0.035, 0.014),
    ],
    "filter": None,
}

PICKED = {
    "secs": 0.38, "attack_secs": 0.001, "body_tau": 0.11, "release_fraction": 0.2,
    "partials": [
        _p(1, 1.0), _p(2, 0.30), _p(3, 0.14, 0.030),
        _p(6, 0.22, 0.006), _p(7, 0.22, 0.006), _p(8, 0.20, 0.006),
        _p(9, 0.18, 0.005), _p(10, 0.17, 0.005), _p(11, 0.15, 0.005),
        _p(12, 0.14, 0.004), _p(13, 0.12, 0.004), _p(14, 0.11, 0.004),
        _p(15, 0.10, 0.004), _p(16, 0.09, 0.003),
    ],
    "filter": None,
}

UPRIGHT = {
    "secs": 0.32, "attack_secs": 0.012, "body_tau": 0.10, "release_fraction": 0.25,
    "partials": [
        _p(1, 1.0), _p(2, 0.34, 0.060), _p(3, 0.18, 0.035),
        _p(4, 0.10, 0.025), _p(5, 0.06, 0.020),
    ],
    "filter": (2.5, 110.0, 400.0),
}

EPIANO = {
    "secs": 0.70, "attack_secs": 0.003, "body_tau": 0.70 / 3.0, "release_fraction": 0.2,
    "partials": [
        _p(1, 1.0), _p(2, 0.30, 0.70 / 6.0), _p(3, 0.15, 0.70 / 9.0),
    ],
    "filter": None,
}

RECIPES = {
    "fingered": FINGERED,
    "picked": PICKED,
    "upright": UPRIGHT,
    "epiano": EPIANO,
}


def _one_pole_magnitude(freq, cutoff):
    return 1.0 / math.sqrt(1.0 + (freq / cutoff) ** 2)


def recipe_note(name, midi, sr):
    """One note of one synthesised voice, and how long it lasts.

    Returns `(samples, seconds)`. The second value is the window
    `render_voice.compute_trim` measures both sides over: the recorded note
    runs to the bank's cap and this one does not, so comparing them whole
    would compare a duration rather than a level.
    """
    recipe = RECIPES.get(name)
    if recipe is None:
        raise SystemExit("no synthesised recipe called %r" % name)
    sr_f = float(sr)
    freq = TUNING_HZ * 2.0 ** ((midi - 69.0) / 12.0)
    n = int(recipe["secs"] * sr_f)
    if n <= 0 or freq <= 0:
        return np.zeros(0), 0.0
    top = max(int(PARTIAL_CEILING * sr_f / freq), 1)

    # The filter resolved into per-partial gains once, which is the whole of a
    # one-pole's magnitude response: it does not change with time.
    partials = recipe["partials"]
    if recipe["filter"] is not None:
        mult, lo, hi = recipe["filter"]
        cutoff = min(max(freq * mult, lo), hi)
        partials = [(k, amp * _one_pole_magnitude(freq * k, cutoff), tau)
                    for (k, amp, tau) in partials]

    t = np.arange(n, dtype=np.float64) / sr_f
    phase = 2.0 * math.pi * freq * t
    out = np.zeros(n, dtype=np.float64)
    for k, amp, tau in partials:
        if k > top:
            continue
        a = np.full(n, amp) if tau == HELD else amp * np.exp(-t / tau)
        # `partials_at` skips a partial once it is under a millionth of full
        # scale; below that it is arithmetic and not sound either way.
        out += np.where(np.abs(a) < 1e-6, 0.0, a) * np.sin(k * phase)

    env = np.ones(n) if recipe["body_tau"] == HELD else np.exp(-t / recipe["body_tau"])
    attack = max(recipe["attack_secs"] * sr_f, 1.0)
    i = np.arange(n, dtype=np.float64)
    head = i < attack
    env[head] *= 0.5 - 0.5 * np.cos(math.pi * np.clip(i[head] / attack, 0.0, 1.0))
    release_from = int(n * (1.0 - recipe["release_fraction"]))
    if n > release_from:
        j = i[release_from:] - release_from
        env[release_from:] *= 0.5 + 0.5 * np.cos(
            math.pi * np.clip(j / float(n - release_from), 0.0, 1.0))
    out *= env

    peak = float(np.max(np.abs(out))) if n else 0.0
    if peak > 0:
        out *= VOICE_PEAK / peak
    return out, recipe["secs"]


def _self_test():
    """Render every voice at a few pitches and print what came out.

    Not a proof that the port matches Rust — only `engine.rs` can be that —
    but the shape of a drift: a wrong envelope changes the length, a wrong
    partial table changes the in-band level, and a missing normalisation
    changes the peak.
    """
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from measure_kits import band_energy
    for name in RECIPES:
        for midi in (28, 40, 55, 60, 72):
            x, secs = recipe_note(name, midi, 48000)
            e = band_energy(x, 48000)
            print("%-9s MIDI %3d  %5.3f s  peak %.3f  band %+7.2f dB"
                  % (name, midi, secs, float(np.max(np.abs(x))),
                     10.0 * math.log10(max(e, 1e-30))))


if __name__ == "__main__":
    _self_test()
