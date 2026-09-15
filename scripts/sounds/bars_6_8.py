"""Render two bars of 6/8 per click preset, exactly as the engine plays them.

The owner's ear is the only instrument that can judge a middle stroke, and it
cannot be pointed at a Rust test. `ab_click.html` is the interactive answer and
needs a browser and a local server; this is the answer that fits in a message:
eight WAVs, one per preset, of the bar the middle stroke was built for.

    python scripts/sounds/bars_6_8.py                      # into the default out
    python scripts/sounds/bars_6_8.py --out DIR --bpm 120

WHAT IT PLAYS, and it is the engine's arithmetic and not an impression of it:
6/8 is the meter `[3, 3]`, so the bar is six beats and the accent mode "Group
starts" marks beat 1 and beat 4. Beat 1 is `high_id()` at 1.0, beat 4 is
`mid_id()` at `MEDIUM_GAIN`, and the other four are `low_id()` at `BEAT_GAIN`.
Nothing else: no subdivision ticks, no humanising, no reverb. Two bars, because
one bar does not tell you whether a middle reads as a middle — it tells you
whether it reads as a downbeat.

ONE SCALE FACTOR ACROSS ALL EIGHT FILES. Per-file normalisation would make
every preset the same loudness and throw away the other half of what these are
for, which is that a cowbell cuts through a room and sticks do not. The factor
is whatever keeps the loudest of the eight off the ceiling, and it is printed.

`drum` has no accent file and no middle file: both are premixed in
`SoundBank::new` from the four layers that ship separately, so they are premixed
here too, the same way and in the same order. If that code changes, this must.
"""

import argparse
import os
import sys
import wave

import numpy as np

RATE = 44100

# The engine's own constants. If these drift from `engine.rs` the page lies.
BEAT_GAIN = 0.65
MEDIUM_GAIN = 1.0

SND = os.path.join("src-tauri", "sounds")

DEFAULT_OUT = os.path.join(
    os.environ.get("TEMP", "."),
    "claude", "C--Users-alber-Dev-yames",
    "c91391ca-5187-4311-ba2c-30e326a5256c", "scratchpad", "listen-w5-round2",
)

ALT_DIR = os.path.join("scripts", "sounds", "alternates")
"""Where `--alt <name>` looks for a stroke before it looks in `src-tauri/sounds`.

A middle stroke is a judgement, and twice now the version that measured better
was the wrong sound. So a rejected candidate can be rendered beside the shipped
one rather than described: put `<preset>_mid.wav` (or `_low.wav`) here, pass
`--alt <name>`, and the bar comes out as `6-8_<preset>__<name>.wav`. Nothing in
this folder is embedded by the app and nothing is tracked; it exists so the
owner hears the choice instead of reading about it."""

# `SoundKit::ALL`, in the order the menu offers them.
KITS = ["click", "sticks", "wood", "beep", "drum", "kit", "snare", "cowbell"]

GROUPS = (3, 3)
"""6/8. The accent falls on the beat that opens each group, which is beat 1 and
beat 4 — `accent_for` in `engine.rs`, and the whole of the reporter's
complaint."""


def read(name, alt=None):
    """One stroke, from the alternates folder if `alt` names one and it holds
    a file for this stroke, otherwise from what the app embeds."""
    path = os.path.join(SND, name + ".wav")
    if alt:
        cand = os.path.join(ALT_DIR, alt, name + ".wav")
        if os.path.isfile(cand):
            path = cand
    with wave.open(path, "rb") as w:
        ch, sr, n = w.getnchannels(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if sr != RATE:
        raise SystemExit("%s is %d Hz, not %d" % (name, sr, RATE))
    return x


def drum_premix(mid):
    """`SoundBank::new`'s two premixes, spelled the same way.

    The accent is kick + hat + crash + body with the kick held down to 0.70
    because it carries 99.7% of its energy below 120 Hz and at 1.0 it sets a
    ceiling the audible layers cannot be heard through. The middle is the same
    thing with the metal and the crash taken off — the cymbal is what says
    "one". Both through the same tanh at drive 1.0.
    """
    high, metal, crash, body = (read("drum_high"), read("drum_metal"),
                                read("drum_crash"), read("drum_body"))
    parts = ([(high, 0.70), (body, 1.0)] if mid else
             [(high, 0.70), (metal, 0.70), (crash, 0.45), (body, 1.0)])
    n = max(len(p) for p, _ in parts)
    y = np.zeros(n)
    for p, g in parts:
        y[: len(p)] += p * g
    y = np.tanh(y * 1.0) / np.tanh(1.0)
    peak = np.max(np.abs(y))
    ceil = 0.93 if mid else 0.97
    # The accent is scaled only if it is over; the middle lands on its peak
    # exactly, which is what the seven files do and what the engine does.
    if mid or peak > ceil:
        y = y * (ceil / peak)
    return y


def strokes(kit, alt=None):
    if kit == "drum":
        return drum_premix(False), drum_premix(True), read("drum_low")
    return (read(kit + "_high", alt), read(kit + "_mid", alt),
            read(kit + "_low", alt))


def bar(kit, bpm, bars, alt=None):
    """Two bars of 6/8, summed into one buffer at the engine's gains."""
    high, mid, low = strokes(kit, alt)
    step = int(round(RATE * 60.0 / bpm))
    beats = sum(GROUPS)
    starts = set()
    cursor = 0
    for g in GROUPS:
        starts.add(cursor)
        cursor += g
    tail = max(len(high), len(mid), len(low))
    out = np.zeros(step * beats * bars + tail)
    for b in range(beats * bars):
        at = b * step
        within = b % beats
        if within == 0:
            buf, gain = high, 1.0
        elif within in starts:
            buf, gain = mid, MEDIUM_GAIN
        else:
            buf, gain = low, BEAT_GAIN
        out[at: at + len(buf)] += buf * gain
    return out


def write(path, x, scale, rng):
    y = np.asarray(x) * scale
    d = rng.random(y.shape) + rng.random(y.shape) - 1.0
    q = np.clip(np.rint(y * 32767.0 + d), -32767, 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(q.tobytes())
    return os.path.getsize(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--bpm", type=float, default=120.0,
                    help="the eighth-note pulse; 6/8 is six of them a bar")
    ap.add_argument("--bars", type=int, default=2)
    ap.add_argument("--alt", action="append", default=[],
                    help="also render every preset an alternate exists for, "
                         "from scripts/sounds/alternates/<name>/")
    args = ap.parse_args()

    if not os.path.isdir(SND):
        raise SystemExit("run this from the repository root")
    os.makedirs(args.out, exist_ok=True)

    rendered = {k: bar(k, args.bpm, args.bars) for k in KITS}
    # Alternates go through the same scale as the shipped set, or the A/B is
    # between two loudnesses rather than between two sounds.
    for alt in args.alt:
        for kit in KITS:
            if any(os.path.isfile(os.path.join(ALT_DIR, alt, kit + "_" + t + ".wav"))
                   for t in ("high", "mid", "low")):
                rendered["%s__%s" % (kit, alt)] = bar(kit, args.bpm, args.bars, alt)
    loudest = max(float(np.max(np.abs(v))) for v in rendered.values())
    # 0.97, the same ceiling an accent file is allowed, so that a bar of the
    # loudest preset ends up exactly where its own downbeat already is.
    scale = 0.97 / loudest if loudest > 0 else 1.0
    print("one scale for all eight: x%.4f (the loudest bar peaked at %.3f)"
          % (scale, loudest))

    rng = np.random.default_rng(4116)
    for kit in sorted(rendered, key=lambda n: (KITS.index(n.split("__")[0]), n)):
        x = rendered[kit]
        path = os.path.join(args.out, "6-8_%s.wav" % kit)
        size = write(path, x, scale, rng)
        print("  %-8s peak %.3f  %5.2f s  %7d B  %s"
              % (kit, float(np.max(np.abs(x))) * scale, len(x) / RATE, size, path))


if __name__ == "__main__":
    main()
