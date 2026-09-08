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

4. THE SNARE KIT, WHICH LEARNED POINT 3 AND STILL CAME OUT SHY. "The snare
   does not sound at all like the drums of a drum kit, it's super
   underwhelming — I was expecting to feel it and all I got was a shy sound."

   The lesson from point 3 — put the energy where a speaker radiates — was
   necessary and not sufficient, because it is a lesson about RATIOS. The
   snare kit passed the band-limited accent test at +4.89 dB and was still
   the quietest thing the app could play: one bar measured −24.9 LUFS
   against the drum kit's −22.0. A ratio between two quiet sounds is quiet.

   Three measured causes, in order of how much they mattered:

     a. The plain beat was a side-stick, 60 ms and 29 energy units against
        `drum_low`'s 130 ms and 106 — and three of every four events in a
        bar are the plain beat. It also had 48% of its energy around 780 Hz,
        which is a description of the `wood` kit, so most of what you heard
        was a wood block belonging to a kit you had not chosen.
     b. The snare's wire tail was truncated: 140 ms of a decay still at
        −36 dBFS when the file ended. Loudness at a fixed peak comes from
        duration, and the duration had been cut off.
     c. Inside the accent, kick and snare were balanced by PEAK. A sine has
        an 11 dB crest factor and noise has 20, so normalising both to 1.0
        handed the kick 9 dB — 64.5% of the accent's energy ended up below
        120 Hz and 9.5% in the whole range where a snare lives.

   Rebuilt as a snare-and-kick over a tom, measured 44.1 kHz:

     snare kit        one bar    accent vs beat   accent peak   beat energy
     before         −24.9 LUFS      +5.03 dB           0.970            29
     after          −21.5 LUFS      +6.50 dB           0.970           156

   against a drum kit at −22.0 LUFS, +3.63 dB, and a `drum_low` of 106. The
   accent's peak is unchanged, so nothing clips that did not before.

5. THE SNARE KIT AGAIN, LOUD ENOUGH AND STILL NOT COHERENT. "The 'big' accent
   on snare really sounds out of place compared to the normal snare beats,
   can we work on that?"

   Point 4 fixed the level and left a musical problem behind it. What the kit
   actually played was a snare-and-kick on the accent and a MID TOM on the
   other three beats, so a 4/4 bar was snare, tom, tom, tom: two instruments
   alternating, which is a drum fill and not a pulse. A metronome accent is
   the same drum hit harder, not a different drum — and the owner said so
   themselves by calling the unaccented beats "the normal snare beats".

   The plain beat is now the same drum as the accent, struck softly:
   `_snare(sr, hard=False)`. Measured against the accent's snare layer with
   level divided out and sub-60 Hz excluded, so that only timbre is left:

     plain beat        band-fraction distance    centre frequency ratio
     mid tom (before)          1.065                     5.25x
     soft snare (after)        0.368                     1.23x

   COHERENCE COSTS ACCENT MARGIN, and that is not a bug in the numbers. The
   tom measured loud in the bar and small against the accent at the same time
   because it was loud somewhere else — a 165 Hz sine, under the band a
   laptop radiates. Once the beat is the same drum, the two sounds occupy the
   same bands and level is all that separates them:

     snare kit          bar    accent vs beat   accent vs beat   beat
                       LUFS     200Hz–4kHz       K-weighted      peak
     tom (before)    −21.91       +6.50 dB         +7.88 dB      0.93
     soft snare      −21.62       +5.82 dB         +7.06 dB      0.72

   The bar is 0.29 dB LOUDER, not quieter — the wire ring gives back what the
   lower ceiling costs — so point 4 does not regress. The accent gives up
   0.68 dB band-limited and keeps a margin wider than the `drum` kit's own
   +3.63 dB, which is the accent the owner has already accepted.

   `snare_high` is BYTE-IDENTICAL to what point 4 shipped. The accent was the
   half of this kit the owner stopped complaining about, so it was not
   touched; every number above moved because the beat moved.

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


def _hit(t, decay, attack_ms=1.0):
    """A struck envelope: a raised-cosine rise, then an exponential decay.

    `np.exp(-t * d)` alone starts at 1.0 on sample zero, which is a step —
    a DC jump that `_norm` then has to spend headroom on and that reads as a
    click rather than as a stick. A 1 ms rise costs nothing audible and lets
    the peak belong to the drum instead of to the discontinuity."""
    a = np.clip(t / (attack_ms / 1000.0), 0, 1)
    return 0.5 * (1 - np.cos(np.pi * a)) * np.exp(-t * decay)


def _kick(sr):
    """A kick with a pitch drop, the way a real head detunes as it stretches.

    Tuned higher than the first version (148 → 57 Hz rather than 105 → 48) so
    its fundamental lands where a speaker is still working, and 190 ms rather
    than 150 so it thumps instead of clicking."""
    n = int(sr * 190.0 / 1000)
    t = np.arange(n) / sr
    f = 148 * np.exp(-t * 44) + 57
    body = np.sin(2 * np.pi * np.cumsum(f) / sr) * _hit(t, 17, 1.5)
    beater = _band(_noise(n, 21), 700, 4200, sr) * np.exp(-t * 165)
    return _norm(body + beater * 0.45)


# The three shell modes of the snare drum, as (frequency, decay, gain). This
# is the drum's IDENTITY and it is shared by both dynamics on purpose — see
# `_snare`. Changing a number here changes which drum the kit is; changing one
# in the `hard`/`soft` table below only changes how hard it is hit.
SNARE_SHELL = ((196, 24, 1.00), (292, 32, 0.62), (421, 44, 0.34))

# What a player's arm changes, and nothing else.
#
#            ms   ring decay  crack gain  stick gain  noise seeds
# The wires damp sooner on a soft stroke because they are not thrown as far,
# and a soft stroke is darker: less crack off the head, less stick in the
# attack. The shell and ring GAINS are identical in both, because the drum
# resonates the same way however hard you hit it — only the amount changes,
# and `_norm` plus the ceiling in each caller set the amount.
_HARD = (300.0, 13, 0.55, 0.30, (22, 23, 25))
_SOFT = (190.0, 30, 0.36, 0.20, (52, 53, 55))


def _snare(sr, hard=True):
    """ONE snare drum, struck hard for the accent or soft for the plain beat.

    "The 'big' accent on snare really sounds out of place compared to the
    normal snare beats, can we work on that?"

    The owner's phrase is the diagnosis: they call the other beats "the normal
    snare beats" and expect them to be the same instrument as the accented
    one. They were not. The accent was this drum and the plain beat was a mid
    tom at 165 Hz, so a 4/4 bar played snare, tom, tom, tom — two instruments
    alternating, which is a drum FILL and not a pulse. A metronome accent is
    the same drum hit harder. That is what this function now is, and why it
    takes a dynamic instead of coming in two unrelated copies.

    Measured against the accent's own snare layer, level divided out and
    sub-60 Hz excluded so only timbre is left, the tom sat 1.065 away in
    summed band-fraction distance with 5.25x the centre frequency. The soft
    stroke sits at 0.368 and 1.23x — still slightly darker than the accent,
    which is what a soft stroke IS, but recognisably the same drum.

    What stays fixed is `SNARE_SHELL`: the same three modes at the same
    frequencies with the same decays. Shell modes are the drum, so voicing
    them identically is the whole claim. What changes is only what a harder
    arm changes, and the layers are otherwise the same three decays:
      - `stick`, 400/s, gone in 10 ms: the impact.
      - `crack`, 85/s: the head, the part that says "snare" and not "cymbal".
      - `ring`: the wires, and — on the accent — the loudness.

    THE RING IS STILL WHERE THE LOUDNESS LIVES, and the first version of this
    drum is why that is written down. It was 140 ms with the wires decaying at
    30/s, so the file ended while the tail was still at −36 dBFS: cut off
    rather than decayed. It measured a respectable peak and almost no
    loudness, which is what "shy" sounds like. A decaying noise bed adds
    energy for 250 ms without touching the peak, which is the only currency
    available when the peak is already spent. So the accent keeps its 13/s
    ring over the full 300 ms; only the soft stroke gives that up, and
    `snare_low` explains what it buys back."""
    ms, ring_decay, crack_gain, stick_gain, seeds = _HARD if hard else _SOFT
    n = int(sr * ms / 1000)
    t = np.arange(n) / sr
    shell = sum(
        np.sin(2 * np.pi * f * t) * _hit(t, d) * g for f, d, g in SNARE_SHELL
    )
    ring = _band(_noise(n, seeds[0]), 330, 8000, sr) * np.exp(-t * ring_decay)
    crack = _band(_noise(n, seeds[1]), 1100, 6500, sr) * np.exp(-t * 85)
    stick = _band(_noise(n, seeds[2]), 2800, 9500, sr) * np.exp(-t * 400)
    return _norm(shell * 0.60 + ring + crack * crack_gain + stick * stick_gain)


def snare_high(sr):
    """The SNARE kit's accent: kick and snare together, the backbeat of an
    actual kit. Mixed and limited here rather than in the engine, so the
    balance is fixed in the file and there is no premix to normalise it away.

    THE KICK IS THE JUNIOR PARTNER HERE, and it was not before. At gain 0.70
    against a peak-normalised snare it carried four times the snare's energy,
    74% of it below 120 Hz — the accent was a sub-bass kick with a whisper of
    snare on it, which is the exact disease `drum_body` was written to cure,
    reproduced in the kit that was supposed to be the cure. Measured: 64.5%
    of the accent's energy under 120 Hz and 9.5% in the whole 250 Hz–6 kHz
    range where a snare lives. At 0.50 it is 30% and 23%, and what you hear
    first is a snare.

    Balancing two layers by PEAK is the same mistake one level down: the
    kick is a sine with an 11 dB crest factor and the snare is mostly noise
    with 20 dB, so normalising both to 1.0 hands the kick 9 dB of loudness
    for free. 0.50 is what a sweep of the mix's spectrum and its band-limited
    energy chose, rather than what makes the two peaks match.

    The kick lands 5 ms after the snare because a beater has further to
    travel than a stick, and because two coincident attacks spend peak the
    limiter then takes back off everything.

    THE KICK STAYS, now that the plain beat is the same snare played softly.
    It is the one thing the accent has that the beat categorically does not,
    so it does more for "this is the downbeat" than another decibel of level
    would — and kick-with-snare is the most ordinary thing a drummer plays on
    a "1". Taking it out would have cost the band-limited margin and the bar
    loudness at once, which is the complaint before this one."""
    s, k = _snare(sr), _kick(sr)
    delay = int(sr * 5.0 / 1000)
    n = max(len(s), delay + len(k))
    y = np.zeros(n)
    y[: len(s)] += s
    y[delay : delay + len(k)] += k * 0.50
    return fade_tail(_saturate(y, 1.0), sr)


def snare_low(sr):
    """The SNARE kit's plain beat: the SAME snare, struck softly.

    "The 'big' accent on snare really sounds out of place compared to the
    normal snare beats, can we work on that?"

    This was a mid tom at 165 Hz, and before that a side-stick. Both were a
    different instrument from the accent, so a 4/4 bar of this kit played
    snare, tom, tom, tom — two instruments alternating, which is a drum fill
    rather than a pulse. The owner's own words give the fix away: they call
    the other beats "the normal snare beats", meaning they expect the drum
    that is accented and the drum that is not to be the same drum. It is now
    `_snare(sr, hard=False)` — same three shell modes at 196/292/421 Hz, same
    wire band, fewer wires and less crack and no kick under it.

    THE CEILING IS 0.72, NOT THE TOM'S 0.93, and that number is the whole
    trade in this change. The tom got its loudness from a 165 Hz sine, which
    is below the 200 Hz a laptop radiates and which a K-weighted meter counts
    at full value — so it could be loud in the bar while measuring small
    against the accent through a band-pass. That is exactly why it was loud
    AND why it was incoherent: the two sounds were loud in different places.
    A snare beat lives in the same bands as the snare accent, so once it is
    the same drum, level is the only thing separating them and it has to be
    spent deliberately. 0.72 is what a sweep of ceiling against the accent
    margin chose: the last point where the bar does not get quieter than the
    tom's while the accent keeps a margin wider than the `drum` kit's.

      snare kit          bar    accent vs beat   accent vs beat   beat
                        LUFS     200Hz–4kHz       K-weighted      peak
      tom (before)    −21.91       +6.50 dB         +7.88 dB      0.93
      soft snare      −21.62       +5.82 dB         +7.06 dB      0.72
      `drum` kit      −22.63       +3.63 dB         +3.84 dB      0.71

    So the bar is 0.29 dB LOUDER than the tom's, not quieter — the shorter,
    quieter hit gets it back from the wire ring, which the tom did not have.
    The accent gives up 0.68 dB band-limited and 0.82 dB K-weighted, and
    still stands wider over its beat than the accent of the kit the owner has
    already accepted. It also keeps something the beat categorically does not
    have: the kick underneath it.

    190 ms rather than the accent's 300, and the wires damp at 30/s rather
    than 13/s, because a soft stroke does not throw them as far. Still well
    over the 100 ms that `the_snare_kit_is_not_quieter_than_the_drum_kit`
    requires, and 126 energy units against `drum_low`'s 106.

    Saturated at 1.5 rather than peak-normalised, for the reason in
    `_saturate`: the noise layers have the loudness and the shell modes have
    the peak, so dividing by the peak would throw the noise away."""
    return fade_tail(_saturate(_snare(sr, hard=False), 1.5, 0.72), sr)


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
