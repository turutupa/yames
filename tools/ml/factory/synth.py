"""A six-string plucked-string synth with playing techniques, for TRAINING data.

Ported from the research prototype (`prototypes/bench/guitar_synth.py`), with
a `Timbre` drawn per Take so no two guitars are alike. It is deliberately not
the bench's Rust synth (`detect-bench/synth.rs`).


Synthetic means synthetic: this is an extended Karplus-Strong model, not a
guitar. It exists so that every technique Yames writes in a tab (picked,
hammer-on, pull-off, tap, slide, bend, vibrato, palm mute, dead note, strum,
ringing sweep) has audio with exact ground truth, through capture chains that
roughly stand for a DI, a high-gain DI, a laptop microphone and a phone
microphone. It says what a detector does on signals built to be hard in the
ways those techniques are hard; it says nothing final about a real rig.

Model, per string: a delay line whose length follows a per-sample f0 curve
(fractional read), a one-pole loop low-pass and a per-sample loop gain.
  * pick          a filtered noise burst one period long, plus a 2 ms click
  * hammer / tap  no burst: the delay length jumps to the new fret, the loop
                  loses a little energy and a small low thump is added
  * pull-off      the length jumps down and a weak pluck is added
  * slide         the f0 curve steps through the frets in between
  * bend/vibrato  the f0 curve moves continuously
  * palm mute     heavy loop loss and a darker loop filter
  * dead note     a pick on a string that is damped at once
A string holds one note at a time; a new note on a string replaces the old
one, and notes on different strings overlap for as long as each is held (or
past that when `ring` is set), as on the instrument.
"""
from __future__ import annotations

import dataclasses
import math
from typing import Dict, List, Optional, Sequence

import numpy as np
from numba import njit
from scipy import signal

SR = 48_000
STANDARD_TUNING = [64, 59, 55, 50, 45, 40]  # string 1..6, as the packs write it


def midi_hz(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69.0) / 12.0)


@dataclasses.dataclass
class Note:
    """One written note as it is actually played."""

    t: float  # seconds, when the note starts to sound
    dur: float  # seconds it is held
    string: int  # 1..6
    midi: float
    tech: Sequence[str] = ()
    vel: float = 1.0  # pick strength, 0..1
    legato_strength: float = 0.35  # level of a hammer/pull/tap against a pick
    bend: float = 0.0  # semitones the note is bent up to
    bend_ms: float = 180.0
    release: bool = False  # the bend comes back down
    prebend: bool = False  # starts bent and is let down
    slide_from: Optional[float] = None  # midi the slide starts from
    slide_ms: float = 70.0
    vibrato_cents: float = 0.0
    ring: bool = False  # not damped at the end of `dur`
    # bookkeeping for ground truth
    onset_id: int = -1
    note_id: int = -1
    written_midi: Optional[float] = None  # what the score asked for
    present: bool = True  # False: written but not played


@dataclasses.dataclass
class Timbre:
    """One guitar, one set of strings, one pick, as far as this model goes."""

    sustain: float = 1.0  # exponent on the loop loss: >1 dies sooner
    bright: float = 0.0  # added to the loop low-pass coefficient (darker when positive)
    pick_cutoff: float = 1.0  # scale of the pick burst's cutoff
    pick_pos: float = 0.0  # 0: none; else the comb of a pick at this share of the string
    click: float = 0.12  # level of the pick's click
    detune_cents: float = 0.0  # the whole guitar
    string_cents: Sequence[float] = (0, 0, 0, 0, 0, 0)

    @staticmethod
    def draw(rng: np.random.Generator) -> "Timbre":
        return Timbre(
            sustain=float(rng.uniform(0.6, 2.2)),
            bright=float(rng.uniform(-0.2, 0.3)),
            pick_cutoff=float(rng.uniform(0.5, 1.8)),
            pick_pos=float(rng.choice([0.0, rng.uniform(0.08, 0.3)])),
            click=float(rng.uniform(0.0, 0.25)),
            detune_cents=float(rng.normal(0, 6)),
            string_cents=tuple(float(v) for v in rng.normal(0, 3, 6)),
        )


@njit(cache=True)
def _string_loop(f0: np.ndarray, exc: np.ndarray, gain: np.ndarray, lp: np.ndarray, sr: int) -> np.ndarray:
    n = f0.shape[0]
    size = 2048
    buf = np.zeros(size)
    out = np.zeros(n)
    w = 0
    y_lp = 0.0
    for i in range(n):
        f = f0[i]
        if f <= 0.0:
            y = exc[i]
            y_lp = 0.0
        else:
            d = sr / f - 0.5  # the loop filter costs about half a sample
            if d < 2.0:
                d = 2.0
            if d > size - 4:
                d = size - 4
            di = int(d)
            frac = d - di
            r0 = (w - di) % size
            r1 = (w - di - 1) % size
            x = buf[r0] * (1.0 - frac) + buf[r1] * frac
            a = lp[i]
            y_lp = (1.0 - a) * x + a * y_lp
            y = exc[i] + gain[i] * y_lp
        buf[w] = y
        w = (w + 1) % size
        out[i] = y
    return out


def _burst(rng: np.random.Generator, n: int, cutoff_hz: float) -> np.ndarray:
    x = rng.uniform(-1.0, 1.0, n)
    if n > 8:
        b, a = signal.butter(1, min(0.99, cutoff_hz / (SR / 2)))
        x = signal.lfilter(b, a, x)
    x -= x.mean()
    peak = np.max(np.abs(x)) + 1e-9
    return x / peak


def render_strings(notes: Sequence[Note], seconds: float, seed: int = 1, timbre: Optional[Timbre] = None) -> np.ndarray:
    """The dry sum of the six strings, mono, float64."""
    rng = np.random.default_rng(seed)
    tb = timbre or Timbre()
    n = int(seconds * SR)
    mix = np.zeros(n)
    click = np.zeros(n)
    for s in range(1, 7):
        mine = sorted((x for x in notes if x.string == s and x.present), key=lambda x: x.t)
        if not mine:
            continue
        f0 = np.zeros(n)
        exc = np.zeros(n)
        gain = np.full(n, 0.0)
        lp = np.full(n, 0.35)
        for k, note in enumerate(mine):
            i0 = max(0, int(round(note.t * SR)))
            if i0 >= n:
                continue
            nxt = mine[k + 1].t if k + 1 < len(mine) else seconds
            held_end = min(note.t + note.dur, nxt)
            sound_end = nxt if note.ring else held_end
            i_held = min(n, int(round(held_end * SR)))
            i_end = min(n, int(round(sound_end * SR)))
            i_next = min(n, int(round(nxt * SR)))
            tech = set(note.tech)
            f_note = midi_hz(note.midi + (tb.detune_cents + tb.string_cents[s - 1]) / 100.0)

            # --- pitch curve over the life of the note
            span = np.arange(i_next - i0) / SR
            cents = np.zeros(i_next - i0)
            if note.bend > 0:
                rise = np.clip(span / (note.bend_ms / 1000.0), 0.0, 1.0)
                shape = 0.5 - 0.5 * np.cos(np.pi * rise)
                if note.prebend:
                    cents += note.bend * 100.0 * (1.0 - shape)
                elif note.release:
                    half = max(1e-3, (held_end - note.t) / 2.0)
                    up = np.clip(span / (note.bend_ms / 1000.0), 0.0, 1.0)
                    down = np.clip((span - half) / (note.bend_ms / 1000.0), 0.0, 1.0)
                    cents += note.bend * 100.0 * ((0.5 - 0.5 * np.cos(np.pi * up)) - (0.5 - 0.5 * np.cos(np.pi * down)))
                else:
                    cents += note.bend * 100.0 * shape
            if note.vibrato_cents > 0:
                depth = np.clip((span - 0.12) / 0.15, 0.0, 1.0)
                cents += note.vibrato_cents * depth * np.sin(2 * np.pi * 5.5 * span)
            if note.slide_from is not None:
                steps = int(round(note.midi - note.slide_from))
                if steps != 0:
                    frac = np.clip(span / (note.slide_ms / 1000.0), 0.0, 1.0)
                    # fret by fret: the pitch moves in semitone steps
                    pos = np.floor(frac * abs(steps) + 1e-9)
                    pos = np.minimum(pos, abs(steps))
                    cents += -100.0 * np.sign(steps) * (abs(steps) - pos)
            f0[i0:i_next] = f_note * 2.0 ** (cents / 1200.0)

            # --- loop gain and brightness
            sustain = 0.9985 if note.midi < 52 else 0.998 if note.midi < 64 else 0.9972
            bright = 0.30
            if "palmMute" in tech:
                sustain, bright = 0.972, 0.72
            if "dead" in tech:
                sustain, bright = 0.90, 0.80
            if "harmonic" in tech:
                sustain, bright = 0.9992, 0.55
            sustain = sustain ** tb.sustain
            bright = float(np.clip(bright + tb.bright, 0.05, 0.9))
            gain[i0:i_end] = sustain
            lp[i0:i_next] = bright
            if i_end < i_next:
                # the finger comes off or the hand damps: gone in about 15 ms
                gain[i_end:i_next] = 0.90
            if i_held < i_end:
                pass  # ringing on past its written length

            # --- how the note starts
            period = max(2, int(round(SR / f_note)))
            previous_sounding = k > 0 and (mine[k - 1].ring or mine[k - 1].t + mine[k - 1].dur >= note.t - 0.03)
            legato = bool(tech & {"hammer", "pull", "tap", "slide"}) and previous_sounding
            from_nowhere = bool(tech & {"hammer", "tap"}) and not previous_sounding
            if legato and "slide" in tech and note.slide_from is not None:
                # the string keeps sounding; a little friction, a little loss
                m = min(i_next - i0, int(note.slide_ms / 1000.0 * SR))
                gain[i0:i0 + m] = min(sustain, 0.994)
                exc[i0:i0 + m] += 0.01 * note.vel * rng.uniform(-1, 1, m)
            elif legato:
                strength = note.legato_strength * note.vel
                keep = int(min(period * 2, i_next - i0))
                # the string loses energy when its length changes under a finger
                gain[i0:i0 + keep] = sustain * (0.80 if "pull" not in tech else 0.72)
                if "pull" in tech:
                    m = min(period, i_next - i0)
                    exc[i0:i0 + m] += 0.5 * strength * _burst(rng, m, 2500.0)[:m]
                else:
                    m = min(int(0.004 * SR), i_next - i0)
                    thump = _burst(rng, m, 900.0) * np.hanning(m)
                    exc[i0:i0 + m] += 0.9 * strength * thump
                    # the finger landing also drives the new length directly
                    m2 = min(period, i_next - i0)
                    exc[i0:i0 + m2] += 0.35 * strength * _burst(rng, m2, 1800.0)[:m2]
            elif from_nowhere:
                strength = max(0.25, note.legato_strength) * note.vel
                m = min(period, i_next - i0)
                exc[i0:i0 + m] += 0.8 * strength * _burst(rng, m, 1500.0)[:m]
                gain[i0:i0 + 1] = 0.0
            else:
                # picked: the old note on this string stops, a burst starts the new
                cutoff = (1800.0 if "palmMute" in tech else 4200.0) * tb.pick_cutoff
                if "harmonic" in tech:
                    cutoff = 2500.0
                m = min(period, i_next - i0)
                burst = note.vel * _burst(rng, m, cutoff)[:m]
                exc[i0:i0 + m] += burst
                if tb.pick_pos > 0 and not ("harmonic" in tech):
                    # a pick at a share of the string notches the harmonics there
                    lag = max(1, int(period * tb.pick_pos))
                    m2 = min(m, i_next - i0 - lag)
                    if m2 > 0:
                        exc[i0 + lag:i0 + lag + m2] -= 0.8 * burst[:m2]
                gain[i0:i0 + 1] = 0.0  # the pick stops the string for an instant
                c = min(int(0.002 * SR), n - i0)
                click[i0:i0 + c] += tb.click * note.vel * rng.uniform(-1, 1, c) * np.linspace(1.0, 0.0, c)
        mix += _string_loop(f0, exc, gain, lp, SR)
    return mix + click
