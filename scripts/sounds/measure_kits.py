"""Measure the jam kits and print the table that goes into KITS.md.

Every number in `src-tauri/sounds/KITS.md` comes from here, so the table can
be regenerated rather than remembered:

    python generate_sounds.py --kits        # write the files
    python scripts/sounds/measure_kits.py   # measure them

THE ACCENT MARGIN IS THE ONE THAT MATTERS, and it is measured the way the
engine measures it, not broadband. `laptop_band_energy` below is a line-for-
line port of the function of the same name in `src-tauri/src/engine.rs`: four
cascaded one-pole high-pass sections at 200 Hz and two one-pole low-pass
sections at 4 kHz, which is roughly the band a laptop speaker radiates.

Four sections, not one, and each with its own state. A kick can carry 99.7% of
its energy below 120 Hz, so a 6 dB/octave roll-off still passes enough of it to
swamp everything else and report any accent as louder no matter what it sounds
like. At 24 dB/octave the sub-bass is genuinely gone. Scaling one section's
output four times is a gain and not a filter — the mistake is easy to make and
it silently turns the measurement green.

The engine asserts this margin is above 2.0 dB for every metronome kit. That
is a FLOOR AND NOT A TARGET, and the snare kit is the proof three times over:
it scored +4.89 and was rejected as shy, +6.39 and was rejected for buying the
margin with a plain beat that was a different drum, and +5.78 and was rejected
as "disproportionally loud and noisy". It ships at +4.24. A margin much wider
than the pack is a shout, not an accent.

Usage:  python scripts/sounds/measure_kits.py [--md]
"""
import math
import os
import sys
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SND = os.path.join(ROOT, "src-tauri", "sounds")

KITS = ("room", "tight", "brushes", "electronic")
VOICES = ("kick", "snare_hi", "snare_lo", "hat", "hat_open", "ride", "rim", "crash")

# The engine's own floor, from `every_accent_is_louder_than_its_beat_on_a_
# small_speaker`. Reproduced here so the files fail at generation time rather
# than in a Rust test the sound worker does not own.
MARGIN_FLOOR_DB = 2.0

# What the duration table in W3-SOUNDS.md allows, in ms.
DURATION_SPEC = {
    "kick": (120, 180),
    "snare_hi": (150, 220),
    "snare_lo": (120, 180),
    "hat": (50, 70),
    "hat_open": (220, 350),
    "ride": (250, 400),
    "rim": (40, 60),
    "crash": (400, 700),
}


def read(path):
    with wave.open(path, "rb") as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise SystemExit("%s: expected 16-bit, got %d" % (path, sw * 8))
    x = np.frombuffer(raw, dtype=np.int16)
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x.astype(np.float64), sr


def laptop_band_energy(buf, sr):
    """Energy through a 200 Hz-4 kHz band-pass: roughly what a laptop speaker
    radiates. Port of `laptop_band_energy` in src-tauri/src/engine.rs."""
    hp_n, lp_n = 4, 2
    hp_a = 1.0 / (1.0 + 2.0 * math.pi * 200.0 / sr)
    lp_a = 2.0 * math.pi * 4000.0 / sr
    prev_in = [0.0] * hp_n
    prev_out = [0.0] * hp_n
    lp = [0.0] * lp_n
    energy = 0.0
    for s in buf:
        v = float(s)
        for k in range(hp_n):
            out = hp_a * (prev_out[k] + v - prev_in[k])
            prev_in[k] = v
            prev_out[k] = out
            v = out
        for k in range(lp_n):
            lp[k] += lp_a * (v - lp[k])
            v = lp[k]
        energy += v * v
    return energy


def db(a, b):
    return 10.0 * math.log10(max(a, 1e-30) / max(b, 1e-30))


def measure(kit, voice):
    name = "kit_%s_%s.wav" % (kit, voice)
    x, sr = read(os.path.join(SND, name))
    peak_i16 = int(np.max(np.abs(x))) if len(x) else 0
    return {
        "name": name,
        "voice": voice,
        "sr": sr,
        "n": len(x),
        "ms": 1000.0 * len(x) / sr,
        # Peak as a fraction of full scale, from the int16 actually written.
        "peak": peak_i16 / 32767.0,
        "peak_i16": peak_i16,
        # Clipping is a sample sitting on the rail. At a 0.9 ceiling nothing
        # should come near it, so any hit here means a bug and not a choice.
        "clipped": int(np.sum(np.abs(x) >= 32767)),
        # A sample that ends mid-decay steps to zero, and the step is a second,
        # unintended click on every hit. The shipped samples ended at -20 to
        # -33 dBFS before anyone measured them; a faded one ends below -80.
        "tail_db": 20.0 * math.log10(max(abs(x[-1]) / 32768.0, 1e-9)) if len(x) else -999.0,
        # A non-zero mean thumps through a speaker and wastes headroom.
        "dc": float(np.mean(x)) / 32768.0 if len(x) else 0.0,
        "band": laptop_band_energy(x / 32768.0, sr),
        "bytes": os.path.getsize(os.path.join(SND, name)),
    }


def main():
    as_md = "--md" in sys.argv
    rows = {}
    problems = []

    for kit in KITS:
        rows[kit] = {}
        for voice in VOICES:
            m = measure(kit, voice)
            rows[kit][voice] = m
            lo, hi = DURATION_SPEC[voice]
            if not (lo - 0.5 <= m["ms"] <= hi + 0.5):
                problems.append(
                    "%s: %.0f ms is outside the %d-%d ms the brief allows"
                    % (m["name"], m["ms"], lo, hi)
                )
            if m["clipped"]:
                problems.append("%s: %d samples at full scale" % (m["name"], m["clipped"]))
            if abs(m["peak"] - 0.9) > 0.002:
                problems.append("%s: peak %.4f, expected 0.900" % (m["name"], m["peak"]))
            if m["sr"] != 44100:
                problems.append("%s: %d Hz, expected 44100" % (m["name"], m["sr"]))
            if m["tail_db"] > -60.0:
                problems.append(
                    "%s: ends at %.1f dBFS — truncated mid-decay, so the step is a click"
                    % (m["name"], m["tail_db"])
                )
            # 2e-4 rather than a round 1e-3: the loosest voice measures 7.4e-5,
            # so this is a guard with real headroom and not a line drawn round
            # today's numbers. It caught the brushes kick at 1.0e-3, which is
            # what `_krelease` exists for.
            if abs(m["dc"]) > 2e-4:
                problems.append("%s: DC offset %.4f" % (m["name"], m["dc"]))

    # Checked here rather than inside a print branch, so `--md` cannot report
    # a table whose numbers a plain run would have failed on.
    margins = {}
    for kit in KITS:
        r = rows[kit]
        sn = db(r["snare_hi"]["band"], r["snare_lo"]["band"])
        kh = db(r["kick"]["band"], r["hat"]["band"])
        margins[kit] = (sn, kh)
        if sn <= MARGIN_FLOOR_DB:
            problems.append("%s: snare_hi is only %+.2f dB over snare_lo" % (kit, sn))
        if kh <= MARGIN_FLOOR_DB:
            problems.append("%s: kick is only %+.2f dB over hat" % (kit, kh))

    if as_md:
        print("| kit | voice | file | peak | duration | size |")
        print("|---|---|---|---|---|---|")
        for kit in KITS:
            for voice in VOICES:
                m = rows[kit][voice]
                print(
                    "| %s | `%s` | `%s` | %.3f | %.0f ms | %.1f KB |"
                    % (kit, voice, m["name"], m["peak"], m["ms"], m["bytes"] / 1024.0)
                )
        print()
        print("| kit | snare_hi vs snare_lo | kick vs hat | kit size |")
        print("|---|---|---|---|")
        for kit in KITS:
            r = rows[kit]
            total = sum(r[v]["bytes"] for v in VOICES) / 1024.0
            print(
                "| %s | %+.2f dB | %+.2f dB | %.0f KB |"
                % (kit, margins[kit][0], margins[kit][1], total)
            )
    else:
        for kit in KITS:
            r = rows[kit]
            total = sum(r[v]["bytes"] for v in VOICES)
            print("=== %s ===  %d files, %.0f KB" % (kit, len(VOICES), total / 1024.0))
            for voice in VOICES:
                m = r[voice]
                print(
                    "  %-9s peak %.3f  %6.1f ms  %6.1f KB  band-energy %8.4g  "
                    "tail %6.1f dBFS  dc %+.1e"
                    % (
                        voice, m["peak"], m["ms"], m["bytes"] / 1024.0,
                        m["band"], m["tail_db"], m["dc"],
                    )
                )
            sn, kh = margins[kit]
            print("  small-speaker margins (200 Hz-4 kHz):")
            print(
                "    snare_hi vs snare_lo  %+6.2f dB   %s"
                % (sn, "ok" if sn > MARGIN_FLOOR_DB else "UNDER THE %.1f dB FLOOR" % MARGIN_FLOOR_DB)
            )
            print(
                "    kick     vs hat       %+6.2f dB   %s"
                % (kh, "ok" if kh > MARGIN_FLOOR_DB else "UNDER THE %.1f dB FLOOR" % MARGIN_FLOOR_DB)
            )
            print()

    if problems:
        print("\nPROBLEMS:")
        for p in problems:
            print("  " + p)
        raise SystemExit(1)
    if not as_md:
        print("all kits within spec: peak 0.900, no clipping, durations in range,")
        print("every accent margin over the engine's %.1f dB floor." % MARGIN_FLOOR_DB)


if __name__ == "__main__":
    main()
