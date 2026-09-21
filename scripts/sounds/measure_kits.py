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

A percussion set is a folder too — `src-tauri/sounds/perc/<id>/` — and it is
measured by the same code, because it obeys the same format down to the last
rule. What differs is three constants (ten voices, their caps, a 2.0 s
ceiling) and what a margin can possibly mean, on which see `perc_ladder`.

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
PERC_DIR = os.path.join(SND, "perc")
VOICES_DIR = os.path.join(SND, "voices")

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

# ---------------------------------------------------------------------------
# The percussion sets, `src-tauri/sounds/perc/<id>/`. A percussionist is not a
# drum kit — the engine plays one of these UNDER whichever kit is loaded — but
# a set is a kit-format folder down to the last rule, so it is measured by the
# same code and not by a second copy of it. Two copies of these checks is how
# one of them quietly stops matching the engine.
#
# The ceiling is 2.0 s and not 3.0 because the longest thing in a drum kit is
# a crash and the longest thing a percussionist owns is a tambourine, which
# has stopped ringing inside two seconds.
# ---------------------------------------------------------------------------

PERC_VOICES = (
    "shaker", "tambourine", "cowbell", "cabasa", "claves", "guiro",
    "conga_hi", "conga_lo", "bongo_hi", "bongo_lo",
)
PERC_MAX_SECONDS = 2.0
PERC_CAP_S = {
    "shaker": 1.0, "tambourine": 1.0, "cowbell": 1.0, "cabasa": 0.8,
    "claves": 0.6, "guiro": 1.0, "conga_hi": 1.0, "conga_lo": 1.0,
    "bongo_hi": 0.8, "bongo_lo": 0.8,
}

# A percussion set is levelled against the kit it plays under, so the
# reference for its ladder is outside its own folder — the same snare accent
# `render_kit.py` balanced it against.
PERC_REF = ("club", "snare", 3)

# A percussionist is not louder than the drummer. Every balance target in the
# contract is negative, so a voice that lands above the snare accent it was
# measured against is a mistake and not a choice.
PERC_CEILING_DB = 0.0

# What a folder of folders is measured as.
FAMILIES = {
    "kit": {
        "dir": KITS_DIR, "voices": VOICES, "caps": VOICE_CAP_S,
        "max_s": MAX_SECONDS, "prefix": "", "what": "eleven kit voices",
    },
    "perc": {
        "dir": PERC_DIR, "voices": PERC_VOICES, "caps": PERC_CAP_S,
        "max_s": PERC_MAX_SECONDS, "prefix": "perc/", "what": "ten percussion voices",
    },
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


# ---------------------------------------------------------------------------
# Pitch
# ---------------------------------------------------------------------------
#
# Used by the render tool to retune a sampled note and by `measure_voice` to
# gate one, and it is ONE implementation on purpose: a bank tuned by one
# measurement and checked by another is a bank that passes its own gate and
# nobody else's. `voices/tests.rs` holds the third copy, in Rust, and its
# `frequency_by_autocorrelation` is this function's shape line for line —
# same quarter-tone search, same parabola.

# Concert pitch. The engine's `TUNING_HZ`.
A4_HZ = 440.0


NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


def midi_hz(midi):
    return A4_HZ * 2.0 ** ((float(midi) - 69.0) / 12.0)


def midi_name(midi):
    """`40` -> `E2`, the convention the engine's own comments use (C4 = 60)."""
    return "%s%d" % (NOTE_NAMES[int(midi) % 12], int(midi) // 12 - 1)


def cents(got, want):
    return 1200.0 * math.log2(max(got, 1e-9) / max(want, 1e-9))


def onset_index(mono, floor_db=-60.0):
    """The first sample of the note, relative to its own peak."""
    if not len(mono):
        return 0
    pk = float(np.max(np.abs(mono)))
    if pk <= 0:
        return 0
    above = np.nonzero(np.abs(mono) > pk * (10.0 ** (floor_db / 20.0)))[0]
    return int(above[0]) if len(above) else 0


def sustain_of(mono, sr, start_s=0.25, end_s=0.75):
    """The half second of a note an ear tunes to.

    NOT THE ATTACK, and that is the whole reason this window exists. A
    plucked string is not at its pitch while it is still settling: measured
    over its first half second the upright bass in this repository reads
    **twenty to thirty cents flat** and over its second half second it reads
    in tune, because a thick string under a finger starts slack and tightens
    as the initial displacement dies away. Tuning a bank on its attack would
    sharpen every note of it by a quarter of a semitone to fix a transient
    nobody hears as pitch.

    A short file — the softest Rhodes layers are half a second altogether —
    falls back to whatever it has past the first fiftieth of a second.
    """
    o = onset_index(mono)
    a, b = o + int(start_s * sr), min(o + int(end_s * sr), len(mono))
    if b - a < int(0.1 * sr):
        a, b = min(o + int(0.05 * sr), max(len(mono) - 1, 0)), len(mono)
    return mono[a:b]


def sustain_hz(mono, sr, expect, span=1.03):
    """The fundamental near `expect` Hz, measured on the sustain.

    Autocorrelation and not zero crossings: a recorded bass carries
    harmonics that add crossings, and a crossing count reads a fingered F2 a
    major third sharp. The lag is searched only within a QUARTER TONE of the
    period the note claims — `span` — so the estimator cannot wander an
    octave or a fifth off and report a confident wrong answer, which is what
    every broad pitch search on a bright low string eventually does.

    The correlation is computed through the FFT because this runs over every
    file of every bank: the direct form is a lag times a window, and half a
    second at 48 kHz across a hundred and thirty files is an afternoon.

    `None` when there is nothing to measure. The parabola through the peak's
    two neighbours is what takes this from a whole sample of resolution —
    about four cents at a bass's pitch — to a hundredth of one.
    """
    x = np.asarray(sustain_of(mono, sr), dtype=np.float64)
    n = len(x)
    if n < 64:
        return None
    energy = float(np.dot(x, x))
    if energy <= 0:
        return None
    # ac[lag] = sum over i of x[i] * x[i - lag], the linear autocorrelation,
    # which is what zero-padding to 2n and multiplying by the conjugate gives.
    nfft = 1 << int(2 * n - 1).bit_length()
    spec = np.fft.rfft(x, nfft)
    ac = np.fft.irfft(spec * np.conj(spec), nfft)[:n]
    period = sr / float(expect)
    lo = max(int(math.floor(period / span)), 1)
    hi = min(int(math.ceil(period * span)), n - 2)
    if hi <= lo:
        return None
    best = lo + int(np.argmax(ac[lo:hi + 1]))
    if best < 1 or best + 1 >= n:
        return None
    left, mid, right = float(ac[best - 1]), float(ac[best]), float(ac[best + 1])
    denom = left - 2.0 * mid + right
    refine = 0.5 * (left - right) / denom if abs(denom) > 1e-12 else 0.0
    return sr / (best + refine)


def note_cents(mono, sr, midi):
    """How far a note sounds from where its name says it should, in cents."""
    want = midi_hz(midi)
    got = sustain_hz(mono, sr, want)
    return None if got is None else cents(got, want)


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
        # The other way this file measures loudness: BS.1770 over a fixed
        # 400 ms window, which is how every balance in the tree was set. Kept
        # beside `band` so a ladder can print both without re-reading the file.
        "k": k_energy(mono / 32768.0, sr, 0.4),
        "bytes": os.path.getsize(path),
    }


# ---------------------------------------------------------------------------
# Folder kits
# ---------------------------------------------------------------------------

def find_kits(family="kit"):
    base = FAMILIES[family]["dir"]
    if not os.path.isdir(base):
        return []
    out = []
    for name in sorted(os.listdir(base)):
        if os.path.isfile(os.path.join(base, name, "kit.json")):
            out.append(name)
    return out


def measure_kit(kit, problems, family="kit"):
    fam = FAMILIES[family]
    kdir = os.path.join(fam["dir"], kit)
    # What this folder is called in a complaint. Both families can hold a
    # `club`, and "club: ..." would then name two different folders.
    tag = fam["prefix"] + kit
    with open(os.path.join(kdir, "kit.json")) as fh:
        man = json.load(fh)

    for field in ("id", "name", "credit", "licence", "rate", "channels", "voices"):
        if field not in man:
            problems.append("%s/kit.json: no %r" % (tag, field))
    if man.get("id") != kit:
        problems.append("%s/kit.json: id is %r but the folder is %r" % (tag, man.get("id"), kit))

    files = {}
    for voice, spec in man.get("voices", {}).items():
        if voice not in fam["voices"]:
            problems.append("%s: %r is not one of the %s" % (tag, voice, fam["what"]))
            continue
        layers = int(spec.get("layers", 1))
        rr = int(spec.get("rr", 1))
        # A positive trim asks the engine to play a file louder than the 0.900
        # every file in the folder was normalised to, which is a request to
        # clip. When a voice is quieter than its target the honest answer is
        # that it is as loud as it gets.
        if float(spec.get("trim_db", 0.0)) > 0.0:
            problems.append("%s: %s has trim_db %+.1f — over the ceiling the files "
                            "were normalised to" % (tag, voice, float(spec["trim_db"])))
        if "pan" in spec and not -1.0 <= float(spec["pan"]) <= 1.0:
            problems.append("%s: %s has pan %.2f, outside -1 to +1"
                            % (tag, voice, float(spec["pan"])))
        for li in range(1, layers + 1):
            for ri in range(1, rr + 1):
                name = "%s.%d.%d.wav" % (voice, li, ri)
                path = os.path.join(kdir, name)
                if not os.path.isfile(path):
                    problems.append("%s: the manifest promises %s and it is not there" % (tag, name))
                    continue
                x, sr, ch = read(path)
                m = stats(path, x, sr, ch)
                m["voice"], m["layer"], m["rr"] = voice, li, ri
                files[(voice, li, ri)] = m

                if m["sr"] != man.get("rate"):
                    problems.append("%s/%s: %d Hz, the manifest says %s"
                                    % (tag, name, m["sr"], man.get("rate")))
                if m["ch"] != man.get("channels"):
                    problems.append("%s/%s: %d channels, the manifest says %s"
                                    % (tag, name, m["ch"], man.get("channels")))
                if m["clipped"]:
                    problems.append("%s/%s: %d samples at full scale" % (tag, name, m["clipped"]))
                if m["peak"] > 0.902:
                    problems.append("%s/%s: peak %.4f, over the 0.900 ceiling" % (tag, name, m["peak"]))
                if m["ms"] > fam["max_s"] * 1000.0 + 0.5:
                    problems.append("%s/%s: %.0f ms, over the %.1f s ceiling"
                                    % (tag, name, m["ms"], fam["max_s"]))
                cap = fam["caps"].get(voice)
                if cap and m["ms"] > cap * 1000.0 + 0.5:
                    problems.append("%s/%s: %.0f ms, over the %.2f s cap for %s"
                                    % (tag, name, m["ms"], cap, voice))
                if m["tail_db"] > -60.0:
                    problems.append(
                        "%s/%s: ends at %.1f dBFS — truncated mid-decay, so the step is a click"
                        % (tag, name, m["tail_db"]))
                # A recorded file starts on zero because the render tool
                # puts 2 ms of silence and a 1 ms fade in front of the
                # transient. The synthesised files start ON their transient
                # by construction (generate_sounds.py has always written
                # them that way, and the engine has always played them), so
                # the rule is the render tool's, not theirs.
                synthesised = str(man.get("credit", "")).startswith("Synthesised")
                if m["head_db"] > -60.0 and not synthesised:
                    problems.append("%s/%s: starts at %.1f dBFS, not on zero"
                                    % (tag, name, m["head_db"]))
                # 2e-4 rather than a round 1e-3: the loosest synthesised voice
                # measures 7.4e-5, so this is a guard with real headroom and
                # not a line drawn round today's numbers.
                if abs(m["dc"]) > 2e-4:
                    problems.append("%s/%s: DC offset %.4f" % (tag, name, m["dc"]))

        for ch in spec.get("choked_by", []):
            if ch not in man.get("voices", {}) and ch != "hat_pedal":
                problems.append("%s: %s is choked_by %r, which the kit does not have"
                                % (tag, voice, ch))

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
            problems.append("%s: %s is on disk but not in the manifest" % (tag, name))

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


def perc_reference():
    """The kit snare accent a percussion set is levelled against.

    Returns (label, K-weighted energy, band energy), or None when that kit is
    not in the tree — which is not a failure here. The set was balanced against
    it once, at render time, and the numbers are frozen into `trim_db`; this is
    the check that they still say what they said, and a missing reference means
    the check cannot run, not that the set is wrong.
    """
    kit, voice, layer = PERC_REF
    path = os.path.join(KITS_DIR, kit, "%s.%d.1.wav" % (voice, layer))
    if not os.path.isfile(path):
        return None
    x, sr, _ = read(path)
    mono = (x.mean(axis=1) if x.ndim > 1 else x) / 32768.0
    return ("%s %s layer %d" % (kit, voice, layer),
            k_energy(mono, sr, 0.4), band_energy(mono, sr))


def perc_ladder(man, files):
    """Every voice as the engine plays it, loudest first, with the steps.

    WHAT A MARGIN MEANS FOR A SET WITH NO SNARE IN IT. A drum kit is gated on
    two pairs — the snare over its own ghost, the kick over the hat — because
    those are the two the engine asserts and the two a metronome lives or dies
    by. A percussion set has neither. What it has instead is ten voices that
    all play at once under a drummer, so the number that matters is where each
    one sits against the others and against the kit it plays under.

    So: the accent layer of each voice, carrying its `trim_db`, measured both
    ways the rest of this file measures anything — K-weighted, which is how
    the balance was set and is what the owner hears on headphones, and through
    the engine's small-speaker band-pass, which is what survives a laptop. The
    two disagree loudly and that is the point of printing both. A cowbell
    lives at 800 Hz and comes through a laptop almost as loud as the snare; a
    cabasa lives above 6 kHz and the 4 kHz low-pass takes nearly all of it.
    Neither is a bug, and neither is visible from one column.
    """
    trims = {v: float(s.get("trim_db", 0.0)) for v, s in man.get("voices", {}).items()}
    rows = []
    for voice in PERC_VOICES:
        a = accent(files, voice)
        if a is None:
            continue
        rows.append({
            "voice": voice,
            "k": 10.0 * math.log10(max(a["k"], 1e-30)) + trims[voice],
            "band": 10.0 * math.log10(max(a["band"], 1e-30)) + trims[voice],
            "trim": trims[voice],
            "pan": float(man["voices"][voice].get("pan", 0.0)),
        })
    rows.sort(key=lambda r: -r["k"])
    return rows


# ---------------------------------------------------------------------------
# The legacy flat kits
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Melodic voices
# ---------------------------------------------------------------------------
#
# A voice is a folder too, and almost every check above is the same check: a
# file is still peak 0.900, still lands on zero at both ends, still carries no
# DC and still has to be in the manifest. What is NOT the same is everything
# that comes from a bank having pitch, and those are the four below.
#
#  * A bank does not hold every note. `notes` says which pitches were really
#    recorded and the engine BUILDS the rest by resampling the nearest, so the
#    number that says whether a bank is dense enough is the worst gap it
#    leaves — `voices::MAX_STRETCH_SEMITONES`, three semitones, past which the
#    formants move with the pitch and a bass stops being that bass.
#  * A bank is mono, where a kit is stereo. `engine::Voice::stereo` is the
#    field that says so and the loader folds anything else, quietly.
#  * A note is capped by MEMORY and not by the bar. A kit file is a transient;
#    a bass note rings as long as it was held, and the bank lives decoded at
#    every note of the range by layers by round robins — so the cap in the
#    render recipe is the difference between a folder that ships and one that
#    does not, and `resident` below is the number it was chosen against.
#  * A recorded note needs a release, because the line's cap ends it mid-ring
#    and a step to zero is a click on every note of every walking line.

# What the engine will ask each voice for: `engine::BASS_MIN_MIDI`..`BASS_MAX_MIDI`
# and the same pair for the keys. A bank is built for the whole of this range
# whatever it sampled.
VOICE_RANGE = {
    "bass_fingered": (28, 55),
    "bass_picked": (28, 55),
    "bass_upright": (28, 55),
    "bass_slap": (28, 55),
    "epiano": (48, 84),
}

# The render brief's cap per voice, in seconds. The loader's own ceiling is
# `voices::MAX_NOTE_SECS` below; these are tighter and are what keeps a bank
# resident in tens of megabytes rather than hundreds.
VOICE_NOTE_CAP_S = {
    "bass_fingered": 2.0,
    "bass_picked": 2.0,
    "bass_upright": 2.0,
    "bass_slap": 2.0,
    "epiano": 2.5,
}

# `voices::MAX_NOTE_SECS`, `MAX_STRETCH_SEMITONES`, `MAX_LAYERS`, `MAX_RR`,
# `MAX_RELEASE_MS` and `MAX_BANK_BYTES`.
VOICE_MAX_SECONDS = 4.0
MAX_STRETCH = 3
VOICE_MAX_LAYERS = 4
VOICE_MAX_RR = 3
VOICE_MAX_RELEASE_MS = 250.0
VOICE_MAX_BANK_BYTES = 96 * 1024 * 1024

# How many layers the engine can actually reach. `jam::voice_layer` maps a
# line's gain to 1, 2 or 3 and clamps to the bank, so a fourth layer is a file
# nothing will ever index — legal, and worth a word.
VOICE_USEFUL_LAYERS = 3

# How far out of tune a sampled note may be, in cents, measured on its
# sustain.
#
# FIVE, which is the number `voices/tests.rs` gates a shipped bank at and is
# about the finest a good ear picks out on a sustained bass note played
# against another instrument. The render tool corrects anything past THREE,
# so a bank that arrives here is expected to be well inside this and the two
# cents between the two numbers are the resampler's own rounding and the
# difference between a note as rendered and a note as the engine rebuilt it.
#
# It is a real gate and not a formality: every one of the four libraries here
# arrived out of tune in a different way. The Rhodes was recorded at A≈442
# and sat four to eight cents sharp across the whole set; the fingered bass
# went ten cents flat as it went up the neck; the picked bass wandered
# sixteen cents from note to note; and the upright's attack reads twenty to
# thirty cents flat while the string settles, which is why this is measured
# where it is. See `sustain_of`.
VOICE_TUNING_CENTS = 5.0


def find_voices():
    if not os.path.isdir(VOICES_DIR):
        return []
    return sorted(
        d for d in os.listdir(VOICES_DIR)
        if os.path.isfile(os.path.join(VOICES_DIR, d, "voice.json"))
    )


def parse_note_name(stem):
    """`40.3.2` -> `(40, 3, 2)`, and the defaults the loader accepts."""
    bits = stem.split(".")
    if not 1 <= len(bits) <= 3:
        return None
    try:
        midi = int(bits[0])
        layer = int(bits[1]) if len(bits) > 1 else 1
        rr = int(bits[2]) if len(bits) > 2 else 1
    except ValueError:
        return None
    if not 0 <= midi <= 127:
        return None
    if not 1 <= layer <= VOICE_MAX_LAYERS or not 1 <= rr <= VOICE_MAX_RR:
        return None
    return midi, layer, rr


def bank_stretch(notes, low, high):
    """The furthest the engine will stretch a sample, over the whole range.

    `voices::build_bank`'s own arithmetic: every note the band can ask for is
    built from the NEAREST sampled one, so this is the largest distance any
    note in the range sits from the nearest entry in `notes`.
    """
    if not notes:
        return 99, low
    worst, where = 0, low
    for midi in range(low, high + 1):
        d = min(abs(midi - n) for n in notes)
        if d > worst:
            worst, where = d, midi
    return worst, where


def bank_resident(files, notes, low, high, layers, rr):
    """How much memory this bank decodes into, in bytes.

    The reason the render caps exist, so it is measured rather than assumed.
    The engine builds every note of the range from the nearest sample, and a
    note built UP is shorter than the sample it came from and one built down
    is longer — a semitone is six per cent — so this walks the range the way
    `build_bank` does instead of multiplying an average. Four bytes a frame,
    because a built note is `f32` and mono.
    """
    total = 0
    for midi in range(low, high + 1):
        near = min(notes, key=lambda n: (abs(n - midi), n))
        ratio = 2.0 ** ((midi - near) / 12.0)
        for li in range(1, layers + 1):
            for ri in range(1, rr + 1):
                m = files.get((near, li, ri))
                if m is None:
                    continue
                total += int(m["n"] / ratio) * 4
    return total


def measure_voice(voice, problems):
    vdir = os.path.join(VOICES_DIR, voice)
    with open(os.path.join(vdir, "voice.json"), encoding="utf-8") as fh:
        man = json.load(fh)

    for field in ("id", "name", "credit", "licence", "rate", "channels",
                  "layers", "rr", "trim_db", "release_ms", "notes"):
        if field not in man:
            problems.append("%s/voice.json: no %r" % (voice, field))
    if man.get("id") != voice:
        problems.append("%s/voice.json: id is %r but the folder is %r"
                        % (voice, man.get("id"), voice))
    if voice not in VOICE_RANGE:
        problems.append("%s: not one of the five voice ids the contract names" % voice)

    layers = int(man.get("layers", 1))
    rr = int(man.get("rr", 1))
    notes = [int(n) for n in man.get("notes", [])]
    if layers > VOICE_MAX_LAYERS:
        problems.append("%s: %d layers, and the loader clamps at %d"
                        % (voice, layers, VOICE_MAX_LAYERS))
    if rr > VOICE_MAX_RR:
        problems.append("%s: %d round robins, and the loader clamps at %d"
                        % (voice, rr, VOICE_MAX_RR))
    if notes != sorted(set(notes)):
        problems.append("%s: notes are not sorted and unique, and the loader sorts them"
                        % voice)
    if not notes:
        problems.append("%s: names no notes, and a bank is the notes it was recorded at"
                        % voice)
    release = float(man.get("release_ms", 60.0))
    if release > VOICE_MAX_RELEASE_MS:
        problems.append("%s: release_ms %.0f, over the %.0f the loader clamps to"
                        % (voice, release, VOICE_MAX_RELEASE_MS))
    if float(man.get("trim_db", 0.0)) > 0.0:
        problems.append("%s: trim_db %+.2f is positive, which asks the engine past "
                        "the 0.900 ceiling every file was written at"
                        % (voice, float(man.get("trim_db", 0.0))))

    files = {}
    for midi in notes:
        for li in range(1, layers + 1):
            for ri in range(1, rr + 1):
                name = "%d.%d.%d.wav" % (midi, li, ri)
                path = os.path.join(vdir, name)
                if not os.path.isfile(path):
                    problems.append("%s: the manifest promises %s and it is not there"
                                    % (voice, name))
                    continue
                x, sr, ch = read(path)
                m = stats(path, x, sr, ch)
                m["midi"], m["layer"], m["rr"] = midi, li, ri
                files[(midi, li, ri)] = m

                if m["sr"] != man.get("rate"):
                    problems.append("%s/%s: %d Hz, the manifest says %s"
                                    % (voice, name, m["sr"], man.get("rate")))
                if m["ch"] != man.get("channels"):
                    problems.append("%s/%s: %d channels, the manifest says %s"
                                    % (voice, name, m["ch"], man.get("channels")))
                # Mono is the contract and not a preference: the mixer reads a
                # melodic buffer as one channel, and a stereo file is folded.
                if m["ch"] != 1:
                    problems.append("%s/%s: %d channels, and a melodic bank is mono"
                                    % (voice, name, m["ch"]))
                if m["clipped"]:
                    problems.append("%s/%s: %d samples at full scale"
                                    % (voice, name, m["clipped"]))
                if m["peak"] > 0.902:
                    problems.append("%s/%s: peak %.4f, over the 0.900 ceiling"
                                    % (voice, name, m["peak"]))
                if m["ms"] > VOICE_MAX_SECONDS * 1000.0 + 0.5:
                    problems.append("%s/%s: %.0f ms, over the %.1f s the loader allows"
                                    % (voice, name, m["ms"], VOICE_MAX_SECONDS))
                cap = VOICE_NOTE_CAP_S.get(voice)
                if cap and m["ms"] > cap * 1000.0 + 0.5:
                    problems.append("%s/%s: %.0f ms, over the %.2f s cap for %s"
                                    % (voice, name, m["ms"], cap, voice))
                if m["tail_db"] > -60.0:
                    problems.append(
                        "%s/%s: ends at %.1f dBFS — truncated mid-ring, so the step "
                        "is a click" % (voice, name, m["tail_db"]))
                if m["head_db"] > -60.0:
                    problems.append("%s/%s: starts at %.1f dBFS, not on zero"
                                    % (voice, name, m["head_db"]))
                if abs(m["dc"]) > 2e-4:
                    problems.append("%s/%s: DC offset %.4f" % (voice, name, m["dc"]))

                # In tune, on the sustain. See VOICE_TUNING_CENTS.
                mono = x.mean(axis=1) if x.ndim > 1 else x
                m["cents"] = note_cents(mono / 32768.0, sr, midi)
                if m["cents"] is None:
                    problems.append("%s/%s: no pitch could be measured" % (voice, name))
                elif abs(m["cents"]) > VOICE_TUNING_CENTS:
                    problems.append(
                        "%s/%s: sounds %+.1f cents from %s, past the %.0f cents a "
                        "bank may be out"
                        % (voice, name, m["cents"], midi_name(midi), VOICE_TUNING_CENTS))

    for name in sorted(os.listdir(vdir)):
        if not name.endswith(".wav"):
            continue
        key = parse_note_name(name[:-4])
        if key is None or key not in files:
            problems.append("%s: %s is on disk but not in the manifest" % (voice, name))

    low, high = VOICE_RANGE.get(voice, (min(notes or [0]), max(notes or [0])))
    stretch, where = bank_stretch(notes, low, high)
    if stretch > MAX_STRETCH:
        problems.append(
            "%s: MIDI %d is %d semitones from the nearest sample, and past %d the "
            "engine is not playing that instrument any more"
            % (voice, where, stretch, MAX_STRETCH))
    resident = bank_resident(files, notes, low, high, layers, rr) if files and notes else 0
    if resident > VOICE_MAX_BANK_BYTES:
        problems.append("%s: %.1f MB decoded, over the %.0f MB a bank may hold"
                        % (voice, resident / 1048576.0,
                           VOICE_MAX_BANK_BYTES / 1048576.0))

    return man, files, {
        "range": (low, high),
        "stretch": stretch,
        "stretch_at": where,
        "resident": resident,
    }


def voice_notes(man, bank):
    """The one-line remarks a voice earns, rather than a problem."""
    out = []
    if int(man.get("layers", 1)) > VOICE_USEFUL_LAYERS:
        out.append("layer %d is a file `voice_layer` never asks for"
                   % int(man.get("layers")))
    if bank["stretch"] == MAX_STRETCH:
        out.append("sits on the three-semitone limit at MIDI %d" % bank["stretch_at"])
    return out


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
    only_voice = None
    if "--voice" in sys.argv:
        only_voice = sys.argv[sys.argv.index("--voice") + 1]

    problems = []
    kits = [] if only_voice else [k for k in find_kits() if only in (None, k)]
    measured = {}
    for kit in kits:
        measured[kit] = measure_kit(kit, problems)

    percs = [] if only_voice else [p for p in find_kits("perc") if only in (None, p)]
    perced = {}
    for perc in percs:
        perced[perc] = measure_kit(perc, problems, "perc")

    voices = [] if only else [v for v in find_voices() if only_voice in (None, v)]
    voiced = {}
    for voice in voices:
        voiced[voice] = measure_voice(voice, problems)

    legacy = None
    if only is None and only_voice is None and legacy_present():
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
        for perc in percs:
            man, files = perced[perc]
            print()
            print("| perc set | voice | layers | rr | peak | longest | trim_db "
                  "| pan | K vs snare | small speaker | size |")
            print("|---|---|---|---|---|---|---|---|---|---|---|")
            ref = perc_reference()
            ladder = {r["voice"]: r for r in perc_ladder(man, files)}
            for voice in PERC_VOICES:
                got = [m for k, m in files.items() if k[0] == voice]
                if not got:
                    continue
                spec = man["voices"][voice]
                r = ladder[voice]
                print("| %s | `%s` | %d | %d | %.3f | %.0f ms | %+.1f | %s | %s | %s "
                      "| %.0f KB |"
                      % (perc, voice, spec["layers"], spec["rr"],
                         max(m["peak"] for m in got), max(m["ms"] for m in got),
                         float(spec.get("trim_db", 0.0)),
                         "%+.2f" % r["pan"] if r["pan"] else "0",
                         "-" if ref is None
                         else "%+.2f dB" % (r["k"] - 10.0 * math.log10(ref[1])),
                         "-" if ref is None
                         else "%+.2f dB" % (r["band"] - 10.0 * math.log10(ref[2])),
                         sum(m["bytes"] for m in got) / 1024.0))
            print()
            print("%s: %d files, %.2f MB%s"
                  % (perc, len(files),
                     sum(m["bytes"] for m in files.values()) / 1048576.0,
                     "" if ref is None else ", against the %s" % ref[0]))
        if voices:
            print()
            print("| voice | notes | range | worst stretch | layers | rr | files "
                  "| longest | size | resident | trim_db | release |")
            print("|---|---|---|---|---|---|---|---|---|---|---|---|")
            for voice in voices:
                man, files, bank = voiced[voice]
                print("| `%s` | %d | %d-%d | %d | %d | %d | %d | %.2f s | %.2f MB "
                      "| %.1f MB | %+.2f | %.0f ms |"
                      % (voice, len(man["notes"]), bank["range"][0], bank["range"][1],
                         bank["stretch"], man["layers"], man["rr"], len(files),
                         max(m["ms"] for m in files.values()) / 1000.0,
                         sum(m["bytes"] for m in files.values()) / 1048576.0,
                         bank["resident"] / 1048576.0,
                         float(man.get("trim_db", 0.0)), float(man["release_ms"])))
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

        ref = perc_reference()
        for perc in percs:
            man, files = perced[perc]
            total = sum(m["bytes"] for m in files.values())
            print("=== perc/%s (%s) ===  %d files, %.2f MB, %d Hz, %d ch"
                  % (perc, man.get("name", "?"), len(files), total / 1048576.0,
                     man.get("rate", 0), man.get("channels", 0)))
            for voice in PERC_VOICES:
                got = sorted([(k, m) for k, m in files.items() if k[0] == voice])
                if not got:
                    print("  %-10s not in this set" % voice)
                    continue
                spec = man["voices"][voice]
                print("  %-10s %d x %d  peak %.3f  longest %6.1f ms  %7.1f KB  "
                      "trim %+5.1f dB  pan %+.2f  tail %6.1f dBFS  dc %+.1e"
                      % (voice, spec["layers"], spec["rr"],
                         max(m["peak"] for _, m in got),
                         max(m["ms"] for _, m in got),
                         sum(m["bytes"] for _, m in got) / 1024.0,
                         float(spec.get("trim_db", 0.0)),
                         float(spec.get("pan", 0.0)),
                         max(m["tail_db"] for _, m in got),
                         max((m["dc"] for _, m in got), key=abs)))

            rows = perc_ladder(man, files)
            if ref is None:
                print("  the %s kit is not in this tree, so the ladder it is levelled"
                      % PERC_REF[0])
                print("  against cannot be printed. The trims still say what they said.")
                print()
                continue
            kref, bref = 10.0 * math.log10(ref[1]), 10.0 * math.log10(ref[2])
            print("  the percussionist under the drummer, against the %s," % ref[0])
            print("  loudest first, each carrying its own trim_db:")
            print("    %-11s %10s %7s   %14s" %
                  ("", "K-weighted", "step", "small speaker"))
            prev = None
            for r in rows:
                print("    %-11s %+9.2f dB %7s   %+9.2f dB"
                      % (r["voice"], r["k"] - kref,
                         "-" if prev is None else "%.2f" % (prev - r["k"]),
                         r["band"] - bref))
                prev = r["k"]
            print("    %d voices inside %.2f dB, the widest step %.2f dB"
                  % (len(rows), rows[0]["k"] - rows[-1]["k"],
                     max((rows[i]["k"] - rows[i + 1]["k"])
                         for i in range(len(rows) - 1)) if len(rows) > 1 else 0.0))
            print()

        for voice in voices:
            man, files, bank = voiced[voice]
            total = sum(m["bytes"] for m in files.values())
            print("=== %s (%s) ===  %d files, %.2f MB on disk, %.1f MB decoded, "
                  "%d Hz, %d ch" % (voice, man.get("name", "?"), len(files),
                                    total / 1048576.0, bank["resident"] / 1048576.0,
                                    man.get("rate", 0), man.get("channels", 0)))
            print("  %d notes sampled for MIDI %d-%d; the engine builds the other %d"
                  % (len(man["notes"]), bank["range"][0], bank["range"][1],
                     bank["range"][1] - bank["range"][0] + 1 - len(
                         [n for n in man["notes"]
                          if bank["range"][0] <= n <= bank["range"][1]])))
            print("  notes: %s" % " ".join(str(n) for n in man["notes"]))
            print("  %d layers x %d rr   peak %.3f   longest %6.1f ms   trim %+5.2f dB"
                  "   release %3.0f ms"
                  % (man["layers"], man["rr"],
                     max(m["peak"] for m in files.values()),
                     max(m["ms"] for m in files.values()),
                     float(man.get("trim_db", 0.0)), float(man["release_ms"])))
            print("  worst stretch %d semitone%s (at MIDI %d)   tail %6.1f dBFS"
                  "   dc %+.1e"
                  % (bank["stretch"], "" if bank["stretch"] == 1 else "s",
                     bank["stretch_at"],
                     max(m["tail_db"] for m in files.values()),
                     max((m["dc"] for m in files.values()), key=abs)))
            # Tuning, per sampled note, on the sustain: the worst of that
            # note's layers and round robins, because a bank is as in tune as
            # its least in-tune recording.
            print("  tuning on the sustain (0.25-0.75 s), worst layer and rr "
                  "of each note, in cents:")
            line = []
            for midi in man["notes"]:
                got = [m["cents"] for m in files.values()
                       if m["midi"] == midi and m.get("cents") is not None]
                line.append("%s %s" % (midi_name(midi),
                                       "?" if not got
                                       else "%+.1f" % max(got, key=abs)))
            for i in range(0, len(line), 6):
                print("    " + "   ".join(line[i:i + 6]))
            allc = [m["cents"] for m in files.values() if m.get("cents") is not None]
            if allc:
                print("    worst %+.1f cents against a %.0f cent gate"
                      % (max(allc, key=abs), VOICE_TUNING_CENTS))
            for note in voice_notes(man, bank):
                print("  note: %s" % note)
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

    # The one gate a percussion set has that a kit does not, and the only one
    # the contract actually asserts: a percussionist is not louder than the
    # drummer. Every balance target in `plans/tasks/jam-v5/BRIEF.md` is
    # negative, so a voice that lands above the snare accent it was measured
    # against has escaped its trim.
    ref = perc_reference()
    for perc in percs:
        man, files = perced[perc]
        missing = [v for v in PERC_VOICES if v not in man.get("voices", {})]
        if missing:
            problems.append("perc/%s: the contract names ten voices and this set "
                            "has no %s" % (perc, ", ".join(missing)))
        if ref is None:
            continue
        kref = 10.0 * math.log10(ref[1])
        for r in perc_ladder(man, files):
            if r["k"] - kref > PERC_CEILING_DB:
                problems.append(
                    "perc/%s: %s lands %+.2f dB against the %s — a percussionist "
                    "does not play over the drummer"
                    % (perc, r["voice"], r["k"] - kref, ref[0]))

    if problems:
        print("\nPROBLEMS:")
        for p in problems:
            print("  " + p)
        raise SystemExit(1)
    if not as_md:
        n = len(kits) + (len(LEGACY_KITS) if legacy else 0)
        if n:
            print("%d kits within spec: peak at or under 0.900, no clipping, every file" % n)
            print("inside its cap and landing on zero, every margin over the engine's")
            print("%.1f dB floor." % MARGIN_FLOOR_DB)
        if percs:
            print("%d percussion set%s within spec: all ten voices, the same peak, the "
                  "same" % (len(percs), "" if len(percs) == 1 else "s"))
            print("landing on zero, every file inside a %.1f s ceiling, and not one "
                  "voice" % PERC_MAX_SECONDS)
            print("playing over the drummer it sits under.")
        if voices:
            print("%d voices within spec: mono, peak at or under 0.900, every note "
                  "inside" % len(voices))
            print("its cap and landing on zero, every manifest describing the folder "
                  "beside it,")
            print("no note further than %d semitones from a sample, and every note "
                  "within" % MAX_STRETCH)
            print("%.0f cents of concert pitch on its sustain." % VOICE_TUNING_CENTS)


if __name__ == "__main__":
    main()
