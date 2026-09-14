"""Measure the jam kits and print the table that goes into KITS.md.

Every number in `src-tauri/sounds/KITS.md` comes from here, so the table can
be regenerated rather than remembered:

    python generate_sounds.py --kits          # write the synthesised files
    python scripts/sounds/render_kit.py ...   # render a recorded kit
    python scripts/sounds/measure_kits.py     # check them, print this table

A kit is a folder: `src-tauri/sounds/kits/<id>/kit.json` and beside it
`<voice>.<layer>.<rr>.wav`. The script walks whatever folders are there, so
adding a kit is adding a folder here as much as it is in the engine. The five
synthesised kits are also still checked in their older flat form
(`kit_<kit>_<voice>.wav` directly under `sounds/`) for as long as those files
exist, so this passes on a branch where they have not been moved yet and on
one where they have.

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

WHAT THE MARGIN MEANS ONCE A KIT HAS LAYERS, and why it stops being a raw
file-to-file number there. In a recorded kit every file is peak 0.900, the
layer a hit reaches for is chosen by its level, and the gain that level plays
at is fixed by the contract; the balance between voices lives in `trim_db` in
the manifest. All three of those are the kit. Measure only the files and the
measurement asks a recording to do something a recording cannot: a real snare
struck at 36 velocities and normalised to one peak carries the same in-band
energy at every one of them, within 2.5 dB and not monotonically. The flat
synthesised kits clear the floor because `snare_lo` was BUILT with a third of
the wire — see `kit_margins` for the full argument.

So both margins are measured as the engine plays them, and both print the raw
number beside the gated one so nothing hides behind a gain:

  * snare accent vs ghost — layer 3 at 1.0 against layer 1 at 0.45.
  * kick vs hat — each voice's accent layer, carrying its `trim_db`.

Usage:  python scripts/sounds/measure_kits.py [--md] [--kit <id>]
"""
import json
import math
import os
import sys
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SND = os.path.join(ROOT, "src-tauri", "sounds")
KITS_DIR = os.path.join(SND, "kits")

# The five synthesised kits in their pre-folder form. Checked only while the
# files are still there.
LEGACY_KITS = ("room", "tight", "brushes", "electronic", "raw")
LEGACY_VOICES = ("kick", "snare_hi", "snare_lo", "hat", "hat_open", "ride", "rim", "crash")

# The eleven the contract names, in the contract's order.
VOICES = (
    "kick", "snare", "rim", "hat", "hat_open", "hat_pedal",
    "ride", "ride_bell", "crash", "tom_hi", "tom_lo",
)

# The engine's own floor, from `every_accent_is_louder_than_its_beat_on_a_
# small_speaker`. Reproduced here so the files fail at generation time rather
# than in a Rust test the sound worker does not own.
MARGIN_FLOOR_DB = 2.0

# The contract's hard ceiling on any one file, in seconds, and the per-voice
# caps the render brief sets. A voice may come in under its cap; going over it
# is a kit that eats memory and smears into the next bar.
MAX_SECONDS = 3.0
VOICE_CAP_S = {
    "kick": 0.8, "snare": 1.0, "rim": 0.5, "hat": 0.4, "hat_open": 1.5,
    "hat_pedal": 0.4, "ride": 2.5, "ride_bell": 2.0, "crash": 3.0,
    "tom_hi": 1.5, "tom_lo": 1.5,
}

# What the duration table in W3-SOUNDS.md allows for the flat synth files, ms.
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
    """A WAV as float samples in int16 units, mixed to mono, plus its rate."""
    with wave.open(path, "rb") as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise SystemExit("%s: expected 16-bit, got %d" % (path, sw * 8))
    x = np.frombuffer(raw, dtype=np.int16)
    if ch > 1:
        x = x.reshape(-1, ch)
    return x.astype(np.float64), sr, ch


def laptop_band_energy(buf, sr):
    """Energy through a 200 Hz-4 kHz band-pass: roughly what a laptop speaker
    radiates. Port of `laptop_band_energy` in src-tauri/src/engine.rs.

    This is the reference implementation and it is deliberately the engine's
    loop, sample by sample. `band_energy` below is the same filter written for
    numpy and is what everything calls; `--check-filter` proves they agree.
    """
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


def band_energy(buf, sr):
    """`laptop_band_energy`, vectorised.

    Same filter, same coefficients, same order — expressed as four one-pole
    high-pass sections and two one-pole low-pass sections run by `lfilter`
    instead of by a Python loop. A layered kit is a few hundred files of up to
    three seconds each, which is tens of millions of samples; the scalar loop
    turns a measurement into a coffee break and a measurement nobody runs is
    not a gate.
    """
    from scipy.signal import lfilter
    hp_a = 1.0 / (1.0 + 2.0 * math.pi * 200.0 / sr)
    lp_a = 2.0 * math.pi * 4000.0 / sr
    v = np.asarray(buf, dtype=np.float64)
    for _ in range(4):
        v = lfilter([hp_a, -hp_a], [1.0, -hp_a], v)
    for _ in range(2):
        v = lfilter([lp_a], [1.0, -(1.0 - lp_a)], v)
    return float(np.sum(v * v))


# BS.1770 K-weighting, the 48 kHz coefficients from the recommendation: a
# high-shelf for the head's diffraction and a 38 Hz high-pass. Used to set the
# balance between voices, never to gate them; see `k_energy`.
_K_SHELF = ([1.53512485958697, -2.69169618940638, 1.19839281085285],
            [1.0, -1.69065929318241, 0.73248077421585])
_K_HPF = ([1.0, -2.0, 1.0],
          [1.0, -1.99004745483398, 0.99007225036621])


def k_energy(buf, sr, window_s=0.4):
    """Loudness of one stroke: K-weighted energy over a fixed window.

    WHY NOT THE LAPTOP BAND-PASS. Because the band-pass is a gate and not a
    meter, and asking it to set the balance between two different drums gives
    an answer that is wrong on every device. Measured on the Club kit, it puts
    the kick 10 dB UNDER the snare at the same peak — it cannot see a 55 Hz
    drum at all, which is precisely the property it was built for — so a
    balance derived from it hands the kick a +9 dB trim and the kit arrives
    with a kick that peaks at two and a half times full scale. The same
    measurement puts the hat 13 dB down for the mirror-image reason: a hi-hat
    lives at 8-15 kHz and the low-pass is at 4 kHz.

    K-weighting is the standard answer to "how loud do these two different
    sounds seem", it can see both ends of the kit, and on the same files it
    puts the kick 6.6 dB OVER the snare, which is what a kick does.

    WHY A FIXED WINDOW. Energy summed over a whole file is partly a measure of
    how long the file is: a 3 s crash accumulates 2.4 dB more than its own
    first 400 ms. A drummer balances the kit by how hard each drum hits, so
    every voice is compared over the same 400 ms from its onset.

    The band-pass keeps the job it has always had, in `kit_margins`: proving
    an accent beats its own soft stroke on the speaker the owner practises on.
    """
    from scipy.signal import lfilter
    x = np.asarray(buf, dtype=np.float64)
    if sr != 48000:
        # The coefficients are defined at 48 kHz. Anything else is a synth kit
        # at 44.1 and the shelf lands a few per cent off; that is well inside
        # the tolerance of a balance number quoted to one decimal.
        pass
    y = lfilter(_K_SHELF[0], _K_SHELF[1], x)
    y = lfilter(_K_HPF[0], _K_HPF[1], y)
    if window_s:
        y = y[:int(window_s * sr)]
    return float(np.sum(y * y))


def db(a, b):
    return 10.0 * math.log10(max(a, 1e-30) / max(b, 1e-30))


def stats(path, x, sr, ch):
    mono = x.mean(axis=1) if x.ndim > 1 else x
    peak_i16 = int(np.max(np.abs(x))) if len(x) else 0
    flat = x.reshape(-1) if x.ndim > 1 else x
    ends = []
    if len(x):
        first = x[0] if x.ndim == 1 else x[0]
        last = x[-1] if x.ndim == 1 else x[-1]
        ends = [float(np.max(np.abs(np.atleast_1d(first)))),
                float(np.max(np.abs(np.atleast_1d(last))))]
    return {
        "path": path,
        "name": os.path.basename(path),
        "sr": sr,
        "ch": ch,
        "n": len(mono),
        "ms": 1000.0 * len(mono) / sr,
        # Peak as a fraction of full scale, from the int16 actually written.
        "peak": peak_i16 / 32767.0,
        "peak_i16": peak_i16,
        # Clipping is a sample sitting on the rail. At a 0.9 ceiling nothing
        # should come near it, so any hit here means a bug and not a choice.
        "clipped": int(np.sum(np.abs(flat) >= 32767)),
        # A sample that ends mid-decay steps to zero, and the step is a second,
        # unintended click on every hit. The shipped samples ended at -20 to
        # -33 dBFS before anyone measured them; a faded one ends below -80.
        "tail_db": 20.0 * math.log10(max(ends[1] / 32768.0, 1e-9)) if ends else -999.0,
        "head_db": 20.0 * math.log10(max(ends[0] / 32768.0, 1e-9)) if ends else -999.0,
        # A non-zero mean thumps through a speaker and wastes headroom.
        "dc": float(np.mean(flat)) / 32768.0 if len(flat) else 0.0,
        "band": band_energy(mono / 32768.0, sr),
        "bytes": os.path.getsize(path),
    }


# ---------------------------------------------------------------------------
# Folder kits
# ---------------------------------------------------------------------------

def find_kits():
    if not os.path.isdir(KITS_DIR):
        return []
    out = []
    for name in sorted(os.listdir(KITS_DIR)):
        if os.path.isfile(os.path.join(KITS_DIR, name, "kit.json")):
            out.append(name)
    return out


def measure_kit(kit, problems):
    kdir = os.path.join(KITS_DIR, kit)
    with open(os.path.join(kdir, "kit.json")) as fh:
        man = json.load(fh)

    for field in ("id", "name", "credit", "licence", "rate", "channels", "voices"):
        if field not in man:
            problems.append("%s/kit.json: no %r" % (kit, field))
    if man.get("id") != kit:
        problems.append("%s/kit.json: id is %r but the folder is %r" % (kit, man.get("id"), kit))

    files = {}
    for voice, spec in man.get("voices", {}).items():
        if voice not in VOICES:
            problems.append("%s: %r is not one of the eleven voices" % (kit, voice))
            continue
        layers = int(spec.get("layers", 1))
        rr = int(spec.get("rr", 1))
        for li in range(1, layers + 1):
            for ri in range(1, rr + 1):
                name = "%s.%d.%d.wav" % (voice, li, ri)
                path = os.path.join(kdir, name)
                if not os.path.isfile(path):
                    problems.append("%s: the manifest promises %s and it is not there" % (kit, name))
                    continue
                x, sr, ch = read(path)
                m = stats(path, x, sr, ch)
                m["voice"], m["layer"], m["rr"] = voice, li, ri
                files[(voice, li, ri)] = m

                if m["sr"] != man.get("rate"):
                    problems.append("%s/%s: %d Hz, the manifest says %s"
                                    % (kit, name, m["sr"], man.get("rate")))
                if m["ch"] != man.get("channels"):
                    problems.append("%s/%s: %d channels, the manifest says %s"
                                    % (kit, name, m["ch"], man.get("channels")))
                if m["clipped"]:
                    problems.append("%s/%s: %d samples at full scale" % (kit, name, m["clipped"]))
                if m["peak"] > 0.902:
                    problems.append("%s/%s: peak %.4f, over the 0.900 ceiling" % (kit, name, m["peak"]))
                if m["ms"] > MAX_SECONDS * 1000.0 + 0.5:
                    problems.append("%s/%s: %.0f ms, over the %.1f s ceiling"
                                    % (kit, name, m["ms"], MAX_SECONDS))
                cap = VOICE_CAP_S.get(voice)
                if cap and m["ms"] > cap * 1000.0 + 0.5:
                    problems.append("%s/%s: %.0f ms, over the %.2f s cap for %s"
                                    % (kit, name, m["ms"], cap, voice))
                if m["tail_db"] > -60.0:
                    problems.append(
                        "%s/%s: ends at %.1f dBFS — truncated mid-decay, so the step is a click"
                        % (kit, name, m["tail_db"]))
                # A recorded file starts on zero because the render tool
                # puts 2 ms of silence and a 1 ms fade in front of the
                # transient. The synthesised files start ON their transient
                # by construction (generate_sounds.py has always written
                # them that way, and the engine has always played them), so
                # the rule is the render tool's, not theirs.
                synthesised = str(man.get("credit", "")).startswith("Synthesised")
                if m["head_db"] > -60.0 and not synthesised:
                    problems.append("%s/%s: starts at %.1f dBFS, not on zero"
                                    % (kit, name, m["head_db"]))
                # 2e-4 rather than a round 1e-3: the loosest synthesised voice
                # measures 7.4e-5, so this is a guard with real headroom and
                # not a line drawn round today's numbers.
                if abs(m["dc"]) > 2e-4:
                    problems.append("%s/%s: DC offset %.4f" % (kit, name, m["dc"]))

        for ch in spec.get("choked_by", []):
            if ch not in man.get("voices", {}) and ch != "hat_pedal":
                problems.append("%s: %s is choked_by %r, which the kit does not have"
                                % (kit, voice, ch))

    # Anything on disk the manifest does not mention is a file the engine will
    # never load: either a leftover from a re-render with fewer layers, or a
    # manifest that was hand-edited out of step with the folder.
    for name in sorted(os.listdir(kdir)):
        if not name.endswith(".wav"):
            continue
        bits = name[:-4].split(".")
        key = None
        if len(bits) == 3:
            try:
                key = (bits[0], int(bits[1]), int(bits[2]))
            except ValueError:
                key = None
        if key is None or key not in files:
            problems.append("%s: %s is on disk but not in the manifest" % (kit, name))

    return man, files


def accent(files, voice):
    """The file the engine reaches for on an accent: level 3, clamped."""
    layers = [k[1] for k in files if k[0] == voice]
    if not layers:
        return None
    return files[(voice, min(3, max(layers)), 1)]


# The engine's own level gains, from the contract in plans/tasks/jam-v3/BRIEF.md:
# 0 off, 1 hit, 2 accent, 3 ghost, 4 peak. An accent plays layer 3 at 1.0 and a
# ghost plays layer 1 at 0.45.
LEVEL_GAIN = (0.0, 0.8, 1.0, 0.45, 1.0)
GHOST_GAIN = LEVEL_GAIN[3]


def kit_margins(man, files):
    """(snare accent over snare ghost, kick over hat) — as the engine plays them.

    WHY THE GAINS ARE IN THE NUMBER, when KITS.md is emphatic that the flat
    kits' margins are quoted raw. Because for a layered kit the raw number
    measures something that cannot vary. Every file in a recorded kit leaves
    the render tool at peak 0.900, and a real snare struck at 36 different
    velocities, each normalised to the same peak, carries almost exactly the
    same energy through a 200 Hz-4 kHz window: measured across the whole of
    Virtuosity's snare, from the softest stroke to the hardest, the spread is
    2.5 dB and it is not even monotonic. The flat kits clear the floor by 3 to
    6 dB because `snare_lo` was SYNTHESISED with a third of the wire and a
    faster decay — a luxury a recording does not have.

    What separates a ghost note from a backbeat in a recorded kit is the
    engine's LEVEL_GAIN, which is fixed by the contract and is as much a
    property of the kit as the files are. So the margin is measured with it
    applied, and the raw file-to-file number is printed beside it so that the
    timbre's contribution stays visible and nobody can mistake the gain for
    the whole story.

    `kick vs hat` carries each voice's `trim_db` for the same reason: the
    balance between two different voices is something the manifest states.
    """
    trims = {v: float(s.get("trim_db", 0.0)) for v, s in man.get("voices", {}).items()}
    sn = sn_raw = kh = None
    a = accent(files, "snare")
    soft = files.get(("snare", 1, 1))
    if a is not None and soft is not None:
        sn_raw = db(a["band"], soft["band"])
        sn = sn_raw + 20.0 * math.log10(1.0 / GHOST_GAIN)
    k, h = accent(files, "kick"), accent(files, "hat")
    if k is not None and h is not None:
        kh = db(k["band"], h["band"]) + trims.get("kick", 0.0) - trims.get("hat", 0.0)
    return sn, kh, sn_raw


# ---------------------------------------------------------------------------
# The legacy flat kits
# ---------------------------------------------------------------------------

def legacy_present():
    return all(
        os.path.isfile(os.path.join(SND, "kit_%s_%s.wav" % (k, v)))
        for k in LEGACY_KITS for v in LEGACY_VOICES
    )


def measure_legacy(problems):
    rows = {}
    for kit in LEGACY_KITS:
        rows[kit] = {}
        for voice in LEGACY_VOICES:
            name = "kit_%s_%s.wav" % (kit, voice)
            path = os.path.join(SND, name)
            x, sr, ch = read(path)
            m = stats(path, x, sr, ch)
            rows[kit][voice] = m
            lo, hi = DURATION_SPEC[voice]
            if not (lo - 0.5 <= m["ms"] <= hi + 0.5):
                problems.append("%s: %.0f ms is outside the %d-%d ms the brief allows"
                                % (name, m["ms"], lo, hi))
            if m["clipped"]:
                problems.append("%s: %d samples at full scale" % (name, m["clipped"]))
            if abs(m["peak"] - 0.9) > 0.002:
                problems.append("%s: peak %.4f, expected 0.900" % (name, m["peak"]))
            if m["sr"] != 44100:
                problems.append("%s: %d Hz, expected 44100" % (name, m["sr"]))
            if m["tail_db"] > -60.0:
                problems.append("%s: ends at %.1f dBFS — truncated mid-decay, so the step is a click"
                                % (name, m["tail_db"]))
            if abs(m["dc"]) > 2e-4:
                problems.append("%s: DC offset %.4f" % (name, m["dc"]))
    margins = {}
    for kit in LEGACY_KITS:
        r = rows[kit]
        sn = db(r["snare_hi"]["band"], r["snare_lo"]["band"])
        kh = db(r["kick"]["band"], r["hat"]["band"])
        margins[kit] = (sn, kh)
        if sn <= MARGIN_FLOOR_DB:
            problems.append("%s: snare_hi is only %+.2f dB over snare_lo" % (kit, sn))
        if kh <= MARGIN_FLOOR_DB:
            problems.append("%s: kick is only %+.2f dB over hat" % (kit, kh))
    return rows, margins


# ---------------------------------------------------------------------------

def check_filter():
    """Prove the vectorised band-pass is the engine's loop and not a lookalike."""
    rng = np.random.default_rng(7)
    for sr in (44100, 48000):
        x = rng.standard_normal(4000) * 0.3
        a, b = laptop_band_energy(x, sr), band_energy(x, sr)
        rel = abs(a - b) / max(a, 1e-30)
        print("  %d Hz: scalar %.10g  vectorised %.10g  relative %.2e"
              % (sr, a, b, rel))
        if rel > 1e-9:
            raise SystemExit("the vectorised band-pass has drifted from the engine's")
    print("  the two implementations agree.")


def main():
    as_md = "--md" in sys.argv
    if "--check-filter" in sys.argv:
        check_filter()
        return
    only = None
    if "--kit" in sys.argv:
        only = sys.argv[sys.argv.index("--kit") + 1]

    problems = []
    kits = [k for k in find_kits() if only in (None, k)]
    measured = {}
    for kit in kits:
        measured[kit] = measure_kit(kit, problems)

    legacy = None
    if only is None and legacy_present():
        legacy = measure_legacy(problems)

    if as_md:
        print("| kit | voice | layers | rr | peak | longest | trim_db | size |")
        print("|---|---|---|---|---|---|---|---|")
        for kit in kits:
            man, files = measured[kit]
            for voice in VOICES:
                got = [m for k, m in files.items() if k[0] == voice]
                if not got:
                    continue
                spec = man["voices"][voice]
                print("| %s | `%s` | %d | %d | %.3f | %.0f ms | %+.1f | %.0f KB |"
                      % (kit, voice, spec["layers"], spec["rr"],
                         max(m["peak"] for m in got),
                         max(m["ms"] for m in got),
                         float(spec.get("trim_db", 0.0)),
                         sum(m["bytes"] for m in got) / 1024.0))
        print()
        print("| kit | files | snare accent vs ghost | kick vs hat (trimmed) | kit size |")
        print("|---|---|---|---|---|")
        for kit in kits:
            man, files = measured[kit]
            sn, kh, sn_raw = kit_margins(man, files)
            print("| %s | %d | %s | %s | %.2f MB |"
                  % (kit, len(files),
                     "%+.2f dB" % sn if sn is not None else "-",
                     "%+.2f dB" % kh if kh is not None else "-",
                     sum(m["bytes"] for m in files.values()) / 1048576.0))
    else:
        for kit in kits:
            man, files = measured[kit]
            total = sum(m["bytes"] for m in files.values())
            print("=== %s (%s) ===  %d files, %.2f MB, %d Hz, %d ch"
                  % (kit, man.get("name", "?"), len(files), total / 1048576.0,
                     man.get("rate", 0), man.get("channels", 0)))
            for voice in VOICES:
                got = sorted([(k, m) for k, m in files.items() if k[0] == voice])
                if not got:
                    continue
                spec = man["voices"][voice]
                a = accent(files, voice)
                print("  %-10s %d x %d  peak %.3f  longest %6.1f ms  %7.1f KB  "
                      "trim %+5.1f dB  band %8.4g  tail %6.1f dBFS  dc %+.1e"
                      % (voice, spec["layers"], spec["rr"],
                         max(m["peak"] for _, m in got),
                         max(m["ms"] for _, m in got),
                         sum(m["bytes"] for _, m in got) / 1024.0,
                         float(spec.get("trim_db", 0.0)),
                         a["band"] if a else 0.0,
                         max(m["tail_db"] for _, m in got),
                         max((m["dc"] for _, m in got), key=abs)))
            sn, kh, sn_raw = kit_margins(man, files)
            print("  small-speaker margins (200 Hz-4 kHz):")
            if sn is not None:
                print("    snare accent vs ghost    %+6.2f dB   %s   (files alone %+.2f dB,"
                      " the ghost's %.2f gain the rest)"
                      % (sn, "ok" if sn > MARGIN_FLOOR_DB
                         else "UNDER THE %.1f dB FLOOR" % MARGIN_FLOOR_DB,
                         sn_raw, GHOST_GAIN))
            if kh is not None:
                print("    kick vs hat (trimmed)    %+6.2f dB   %s"
                      % (kh, "ok" if kh > MARGIN_FLOOR_DB
                         else "UNDER THE %.1f dB FLOOR" % MARGIN_FLOOR_DB))
            print()

        if legacy:
            rows, margins = legacy
            for kit in LEGACY_KITS:
                r = rows[kit]
                total = sum(r[v]["bytes"] for v in LEGACY_VOICES)
                print("=== %s (flat, pre-folder) ===  %d files, %.0f KB"
                      % (kit, len(LEGACY_VOICES), total / 1024.0))
                sn, kh = margins[kit]
                print("  snare_hi vs snare_lo %+6.2f dB   kick vs hat %+6.2f dB" % (sn, kh))
            print()

    for kit in kits:
        man, files = measured[kit]
        sn, kh, _ = kit_margins(man, files)
        if sn is not None and sn <= MARGIN_FLOOR_DB:
            problems.append("%s: the snare accent is only %+.2f dB over its ghost" % (kit, sn))
        if kh is not None and kh <= MARGIN_FLOOR_DB:
            problems.append("%s: the kick is only %+.2f dB over the hat" % (kit, kh))

    if problems:
        print("\nPROBLEMS:")
        for p in problems:
            print("  " + p)
        raise SystemExit(1)
    if not as_md:
        n = len(kits) + (len(LEGACY_KITS) if legacy else 0)
        print("%d kits within spec: peak at or under 0.900, no clipping, every file" % n)
        print("inside its cap and landing on zero, every margin over the engine's")
        print("%.1f dB floor." % MARGIN_FLOOR_DB)


if __name__ == "__main__":
    main()
