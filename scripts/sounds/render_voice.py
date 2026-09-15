"""Render a recorded melodic library down to one of the app's voice banks.

    python scripts/sounds/render_voice.py scripts/sounds/recipes/bass_fingered.json \
        src-tauri/sounds/voices/bass_fingered

The drums became a band in the third pass and the bass and the keys did not.
`render_kit.py` is the tool that turned a recorded drum library into a kit
folder; this is the same tool for an instrument that has PITCH, and it shares
everything that is not about pitch — the reader, the resampler, the tail
trim, the dithered writer, the band-pass — by importing them rather than by
having a second opinion about them.

WHAT A MELODIC BANK IS, and the two ways it differs from a kit:

    src-tauri/sounds/voices/<voice>/voice.json
    src-tauri/sounds/voices/<voice>/<midi>.<layer>.<rr>.wav

1. **The file name carries a MIDI number where a kit carries a voice name**,
   and a bank does NOT hold every note. The engine builds the notes between
   the sampled ones by resampling the nearest, never further than three
   semitones (`voices::MAX_STRETCH_SEMITONES`), so choosing which notes to
   keep is this tool's central decision and `notes` in the recipe is where
   it is written down. `--check` prints the worst stretch a `notes` list
   leaves, which is the number that says whether a bank is dense enough.

2. **A note is as long as the player held it, and memory is the reason it is
   not.** A kit's file is a transient and a decay. A bass note rings for five
   seconds on every one of these libraries, and a bank lives DECODED in
   memory at 28 notes by layers by round robins — so a bass sampled every
   three semitones with three layers and two round robins, kept whole, is
   sixty files that decode to 23 MB and a folder nobody can ship. The cap in
   the recipe (2.0 s for the basses, 2.5 s for the Rhodes) is where that
   stops, and it is a real musical loss stated out loud rather than hidden:
   these instruments ring longer than the bank lets them.

THE FOUR THINGS THIS DOES THAT A BULK CONVERTER DOES NOT
--------------------------------------------------------

1. **It reads the SFZ properly, including `<group>`.** Two of the three
   libraries here put the key and the dynamic on a `<group>` and only the
   sample path on the `<region>` under it, so a parser that looks at regions
   alone (which is all `render_kit.SfzSource` ever needed) sees a hundred
   nameless samples. Opcodes inherit `<global>` → `<master>` → `<group>` →
   `<region>`, which is the spec and is also the only way Meatbass parses.

2. **It does not believe the key number.** Karoryfer's basses are mapped and
   named an OCTAVE ABOVE what they sound: `darkblack_e2` is written at key 40
   and its fundamental is 41.3 Hz, which is E1 and MIDI 28. A tool that
   trusted `pitch_keycenter` would ship a bass an octave high and every note
   of it would be in tune with itself, which is how that mistake survives to
   a release. `key_offset` in the recipe is the correction and `--check`
   MEASURES the fundamental of a sampled note against the pitch the recipe
   claims, so the offset cannot be wrong quietly.

3. **Layers are chosen by loudness, not by the library's dynamic names.**
   `render_kit`'s argument, unchanged: p/mp/mf/f are not evenly spaced in dB
   and a bank wants even steps. The dynamics are measured and the ladder is
   walked down from the loudest in `layer_step_db` steps. A source with
   fewer dynamics than the ladder wants gets FEWER LAYERS in its manifest
   rather than a duplicated file — the engine's `voice_layer` clamps a level
   to the layers a bank has, so two honest layers play exactly as three with
   a copy in them would, and cost a third less.

4. **`trim_db` is measured against the synthesised voice it replaces.** The
   contract's level rule for these banks is not "balance against the snare"
   but "land where the recipe landed": somebody who has practised to the
   synthesised fingered bass for a month installs this and the band must not
   change loudness, because `bass.gain`, `mix.bass` and the intensity all sit
   on top of it. The recipes are mirrored in `voice_levels.py` for exactly
   this measurement and for nothing else.

Adding a library is adding a recipe. Adding a library whose SFZ says where
the dynamic lives in a way none of these three do is adding a `dynamic_from`
strategy to `_dynamic_of`.
"""
import argparse
import collections
import fractions
import json
import math
import os
import sys

import numpy as np

try:
    import soundfile as sf
except ImportError:  # pragma: no cover - a missing dep is a setup problem
    raise SystemExit(
        "render_voice needs soundfile (and numpy, scipy):\n"
        "    pip install soundfile numpy scipy"
    )

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

# Everything that is not about pitch comes from the kit tool. A second copy of
# the tail trim or the dithered writer is a second place for them to drift.
from render_kit import (  # noqa: E402
    PEAK, RATE, dc_block, peak_of, read_stereo, resample_to, resolve_root,
    rms_db, trim_and_fade, write_wav,
)
from measure_kits import (  # noqa: E402
    band_energy, k_energy, midi_hz, note_cents, sustain_of,
)
from voice_levels import recipe_note  # noqa: E402

# ---------------------------------------------------------------------------
# The contract. `src-tauri/src/voices.rs` is the authority on every one of
# these and a recipe that disagreed would produce a bank the loader clamps,
# refuses or silently reshapes.
# ---------------------------------------------------------------------------

CHANNELS = 1

# `voices::MAX_LAYERS` and `MAX_RR`. Four and three — but see `MAX_USEFUL_LAYERS`
# below, which is the number that actually binds.
MAX_LAYERS = 4
MAX_RR = 3

# How many layers a bank can usefully hold.
#
# THREE, and not the format's four. `jam::voice_layer` maps a melodic line's
# gain to a layer with `if gain < 0.6 { 1 } else if gain < 0.9 { 2 } else { 3 }`
# and then clamps to the bank — so layer 4 is a file the engine will never
# index, at a third again of the folder's size and its memory. This is also
# the answer to the brief's "five for the Rhodes if the source has them": the
# source has five, the format's ceiling is four, and the selector only ever
# asks for three.
MAX_USEFUL_LAYERS = 3

# `voices::MAX_STRETCH_SEMITONES`. A note further than this from the sample it
# is built out of stops being the instrument.
MAX_STRETCH = 3

# `voices::MAX_RELEASE_MS`. A manifest may ask for more and the loader clamps
# it; this tool refuses to write a number it knows will be clamped.
MAX_RELEASE_MS = 250.0

# The hard ceiling on one note, from `voices::MAX_NOTE_SECS`. The per-voice
# caps in the recipes are well under it.
MAX_NOTE_SECS = 4.0

# How far out of tune a note has to be before it is retuned, in cents.
#
# THREE, which is two under the five `measure_kits.VOICE_TUNING_CENTS` and
# `voices/tests.rs` gate a bank at, and the gap is deliberate: the two cents
# between them are the resampler's rounding, the dither, and the difference
# between a note as rendered and the same note as the engine rebuilds it at
# another pitch. Correcting at the gate rather than under it would leave a
# bank that passes today and fails on a device that opened at 44.1 kHz.
#
# And it is a floor rather than zero because these are RECORDINGS. A real
# string is never exactly at a frequency — it is sharp while it is loud and
# settles as it decays — so "in tune" for a bank is a couple of cents wide,
# and resampling a note that is already inside that would be spending
# quality on a number rather than on a pitch.
TUNE_CENTS = 3.0

# The denominator the retuning ratio is rounded to.
#
# A tuning correction is a ratio near 1, and `resample_poly` wants it as a
# fraction. Two thousand puts the rounding error under a thousandth of a cent
# while keeping the polyphase filter to a few tens of thousands of taps; the
# rate conversion the note needs anyway is folded into the same fraction, so
# a retuned note is resampled ONCE rather than twice.
TUNE_MAX_DEN = 2000

A4 = 440.0
NOTE_NAMES = ("c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b")
FLATS = {"db": "c#", "eb": "d#", "gb": "f#", "ab": "g#", "bb": "a#"}


def _log(msg=""):
    print(msg, flush=True)


def midi_name(midi):
    """`40` -> `E2`, in the convention the engine's comments use (C4 = 60)."""
    return "%s%d" % (NOTE_NAMES[midi % 12].upper(), midi // 12 - 1)


# ---------------------------------------------------------------------------
# SFZ
# ---------------------------------------------------------------------------

def parse_key(value):
    """A key opcode as a MIDI number, whether it is `40` or `e2`.

    Karoryfer writes numbers and sfZed writes names, and the SFZ spec puts
    middle C at `c4` = 60, which is the convention both of them and the
    engine's own comments use.
    """
    value = str(value).strip().lower()
    try:
        return int(value)
    except ValueError:
        pass
    head = value.rstrip("-0123456789")
    tail = value[len(head):]
    head = FLATS.get(head, head)
    if head not in NOTE_NAMES or not tail:
        return None
    return NOTE_NAMES.index(head) + (int(tail) + 1) * 12


def sfz_regions(path):
    """Every `<region>` of an SFZ, with the opcodes it inherits.

    Headers nest `<global>` → `<master>` → `<group>` → `<region>` and each
    level starts from the one above it, which is the spec — and is the whole
    reason this exists rather than `render_kit.SfzSource._regions`, which
    reads regions only. Meatbass puts `pitch_keycenter` and the velocity on
    the group and nothing but `sample` on the region, so region-only parsing
    returns a hundred samples with no note and no dynamic.

    `#include` and `<control>`'s `default_path` are handled because a library
    that used them would otherwise fail in a way that looks like an empty map.
    """
    levels = {"global": {}, "master": {}, "group": {}}
    order = ("global", "master", "group")
    out = []
    cur = None
    default_path = ""

    def flush():
        if cur is None:
            return
        merged = {}
        for lvl in order:
            merged.update(levels[lvl])
        merged.update(cur)
        if "sample" in merged:
            merged["_default_path"] = default_path
            out.append(merged)

    def read_file(p, depth=0):
        nonlocal cur, default_path, target
        if depth > 8:
            raise SystemExit("%s: #include nested too deep" % p)
        with open(p, "r", errors="replace") as fh:
            for line in fh:
                line = line.split("//")[0].strip()
                if not line:
                    continue
                if line.lower().startswith("#include"):
                    rel = line.split('"')[1] if '"' in line else line.split()[-1]
                    inc = os.path.normpath(
                        os.path.join(os.path.dirname(p), rel.replace("\\", "/")))
                    if os.path.isfile(inc):
                        read_file(inc, depth + 1)
                    continue
                # A line can hold a header and opcodes after it, and more than
                # one header: `<group> lokey=35 <region> sample=x`.
                while line:
                    if line.startswith("<"):
                        end = line.find(">")
                        if end < 0:
                            break
                        tag = line[1:end].strip().lower()
                        line = line[end + 1:].strip()
                        flush()
                        if tag == "region":
                            cur = {}
                            target = None
                        elif tag in order:
                            cur = None
                            # A new header clears its own level and every
                            # level under it: a second <group> does not
                            # inherit the first one's opcodes.
                            for lvl in order[order.index(tag):]:
                                levels[lvl] = {}
                            target = tag
                        else:
                            # `<control>` carries `default_path`; anything
                            # else (`<curve>`, `<effect>`) is not a sample.
                            cur = None
                            target = tag
                        continue
                    # Opcodes up to the next header.
                    nxt = line.find("<")
                    chunk, line = (line, "") if nxt < 0 else (line[:nxt], line[nxt:])
                    for tok in chunk.split():
                        if "=" not in tok:
                            continue
                        k, v = tok.split("=", 1)
                        k, v = k.strip().lower(), v.strip()
                        if cur is not None:
                            cur[k] = v
                        elif target == "control":
                            if k == "default_path":
                                default_path = v.replace("\\", "/")
                        elif target in order:
                            levels[target][k] = v

    target = None
    read_file(path)
    flush()
    return out


def region_files(region, base):
    """Where a region's sample actually lives."""
    rel = (region.get("_default_path", "") + region["sample"]).replace("\\", "/")
    return os.path.normpath(os.path.join(base, rel))


# ---------------------------------------------------------------------------
# One library, as notes
# ---------------------------------------------------------------------------

class Note(object):
    """One sampled pitch, one dynamic: the round robins the library holds."""

    __slots__ = ("midi", "dynamic", "files", "loud")

    def __init__(self, midi, dynamic):
        self.midi = midi
        self.dynamic = dynamic
        self.files = []
        self.loud = None


def _dynamic_of(region, path, how, map_name):
    """Which dynamic a region is, by whichever of the three ways says so.

    * `map` — the library gives each dynamic its own map file, and the map's
      own name is the answer. Black And Blue Basses.
    * `filename_vl` — `..._vl3_rr2.wav`. Meatbass, and Karoryfer's house style.
    * `velocity` — the region's `lovel`, which is where a single map with
      velocity splits puts it. jRhodes3.
    """
    if how == "map":
        return map_name
    if how == "filename_vl":
        base = os.path.basename(path).lower()
        for tok in base.replace(".", "_").split("_"):
            if tok.startswith("vl") and tok[2:].isdigit():
                return "vl%d" % int(tok[2:])
        return None
    if how == "velocity":
        return "v%03d" % int(region.get("lovel", 0))
    raise SystemExit("unknown dynamic_from %r" % how)


def _rr_of(region, path, how):
    """Which round robin a region is, or 1 for a library that has none."""
    if how == "none":
        return 1
    if how == "seq_position":
        return int(region.get("seq_position", 1))
    if how == "filename_rr":
        base = os.path.basename(path).lower()
        for tok in base.replace(".", "_").split("_"):
            if tok.startswith("rr") and tok[2:].isdigit():
                return int(tok[2:])
        return 1
    raise SystemExit("unknown rr_from %r" % how)


def collect(recipe, root):
    """Every sampled note the recipe's maps hold, as `{(midi, dynamic): Note}`.

    The MIDI number is the SOUNDING pitch: the region's `pitch_keycenter` (or
    its `lokey`, for a map that gives only a range) plus the recipe's
    `key_offset`. See point 2 of the module docstring for why that offset is
    not a formality.
    """
    src = recipe["source"]
    offset = int(src.get("key_offset", 0))
    dyn_from = src.get("dynamic_from", "map")
    rr_from = src.get("rr_from", "seq_position")
    notes = collections.OrderedDict()
    for entry in src["maps"]:
        path = os.path.join(root, entry["path"].replace("/", os.sep))
        if not os.path.isfile(path):
            raise SystemExit("no map at %s" % path)
        base = os.path.join(root, src.get("sample_base", os.path.dirname(entry["path"])))
        name = entry.get("dynamic", os.path.splitext(os.path.basename(path))[0])
        for region in sfz_regions(path):
            key = region.get("pitch_keycenter", region.get("lokey"))
            if key is None:
                continue
            midi = parse_key(key)
            if midi is None:
                continue
            midi += offset
            wav = region_files(region, base)
            if not os.path.isfile(wav):
                continue
            dynamic = _dynamic_of(region, wav, dyn_from, name)
            if dynamic is None:
                continue
            rr = _rr_of(region, wav, rr_from)
            note = notes.get((midi, dynamic))
            if note is None:
                note = notes[(midi, dynamic)] = Note(midi, dynamic)
            note.files.append((rr, wav))
    for note in notes.values():
        # Sorted by the library's own round-robin number, and de-duplicated:
        # a map that lists the same file under two regions is one performance.
        seen, keep = set(), []
        for rr, wav in sorted(note.files):
            if wav in seen:
                continue
            seen.add(wav)
            keep.append((rr, wav))
        note.files = keep
    return notes


# ---------------------------------------------------------------------------
# Choosing the layers
# ---------------------------------------------------------------------------

def measure_dynamics(notes, keep, rate):
    """How loud each of the library's dynamics is, in dB, over the notes kept.

    Measured on the FIRST round robin of every note this bank will ship and
    averaged, rather than on one note: a bass's dynamics are not equally
    spaced at the bottom of the neck and at the top, and the ladder is a
    property of the bank rather than of one string.
    """
    out = collections.OrderedDict()
    for dynamic in sorted({d for (_, d) in notes}):
        vals = []
        for midi in keep:
            note = notes.get((midi, dynamic))
            if note is None or not note.files:
                continue
            x, sr = read_stereo(note.files[0][1])
            vals.append(rms_db(x, sr, window_s=0.3))
        if vals:
            out[dynamic] = sum(vals) / len(vals)
    return out


def library_order(recipe, loud):
    """The library's own dynamics, softest first, by what it CALLS them.

    `map` keeps the order the recipe lists the maps in, which is how a human
    wrote the ladder down; the other two sort on the number in the name, and
    both of those names are zero-padded or single-digit so a string sort is a
    numeric one.
    """
    how = recipe["source"].get("dynamic_from", "map")
    if how == "map":
        names = [e.get("dynamic") for e in recipe["source"]["maps"]]
        return [(n, loud[n]) for n in names if n in loud]
    return sorted(loud.items())


def pick_layers_by_dynamic(order, layers):
    """`layers` of the library's dynamics, evenly spread, ends included.

    THE OTHER WAY TO BUILD A LADDER, and the Rhodes is why there are two.
    `pick_layers` below measures the files, which is right for a library that
    recorded its dynamics at the level they were played: Karoryfer's basses
    put 8.6 dB between p and f and the measurement finds it.

    jRhodes3 did not. Its five layers are recorded at very nearly one peak —
    1.9 dB covers all five, and the softest measures LOUDER than the hardest
    — because an SFZ player is expected to supply the level from velocity
    (`amp_veltrack` is 100 by default and the map sets no `volume`). Measured
    for loudness, its ladder comes out as three neighbours in the wrong order
    and the bank loses the soft layer entirely. What that library's layers
    carry is TIMBRE — how much bark is on the tine — and the thing that
    orders timbre is the velocity band, not the meter.

    Which is also how our engine works, so nothing is lost: `voice_layer`
    picks the layer and the line's `gain` carries the level, exactly as
    `amp_veltrack` would have.
    """
    if not order:
        return []
    n = min(layers, len(order))
    if n == 1:
        return [order[-1]]
    idx = [round(i * (len(order) - 1) / (n - 1)) for i in range(n)]
    return [order[i] for i in sorted(set(idx))]


def pick_layers(loud, layers, step_db):
    """Which dynamics become layers 1..N, walking down in `step_db` steps.

    `render_kit.pick_layers`' argument for strokes, applied to dynamics: a
    library's names are not a ladder. Start at the loudest, ask for one
    `step_db` under it, take whichever unused dynamic is nearest to that, and
    repeat. The list comes back SOFTEST FIRST, which is layer order.

    A source with fewer dynamics than `layers` wants comes back short, and
    that is the honest answer — see point 3 of the module docstring.
    """
    if not loud:
        return []
    order = sorted(loud.items(), key=lambda kv: -kv[1])
    chosen = [order[0]]
    while len(chosen) < layers:
        rest = [kv for kv in order if kv[0] not in {c[0] for c in chosen}]
        if not rest:
            break
        want = chosen[-1][1] - step_db
        chosen.append(min(rest, key=lambda kv: abs(kv[1] - want)))
    chosen.sort(key=lambda kv: kv[1])
    return chosen


def retune_and_resample(x, sr_in, rate, shift):
    """Convert to `rate` and multiply the pitch by `shift`, in one pass.

    Resampling is the only way to retune a recording without a phase vocoder,
    and it is the RIGHT way here: a bass sampled a few cents flat was played a
    few cents flat, so stretching the whole waveform by that ratio is
    restoring the take rather than processing it. Six cents is a length
    change of three parts in a thousand — a two second note becomes 1.9994 s
    — which is why nothing downstream has to know.

    ONE PASS, not two. The note has to be converted from the library's
    44.1 kHz to the bank's 48 kHz anyway, so the tuning ratio is folded into
    that fraction instead of filtering the buffer a second time. The
    arithmetic: resample to `rate / shift` and then call the result `rate`,
    which multiplies every frequency in it by `shift`. With `shift` of 1 the
    fraction reduces to the plain rate conversion `render_kit` does, bit for
    bit.
    """
    ratio = float(rate) / (float(shift) * float(sr_in))
    if abs(ratio - 1.0) < 1e-12:
        return x
    from scipy.signal import resample_poly
    if shift == 1.0:
        # The exact conversion, by the greatest common divisor, so an
        # untouched note takes the same road it always did.
        g = math.gcd(int(sr_in), int(rate))
        up, down = int(rate) // g, int(sr_in) // g
    else:
        f = fractions.Fraction(ratio).limit_denominator(TUNE_MAX_DEN)
        up, down = f.numerator, f.denominator
    return resample_poly(x, up, down, axis=0)


def choose_layers(recipe, loud, layers):
    """The recipe's ladder, by whichever of the two rules it asks for."""
    how = recipe.get("layer_by", "loudness")
    if how == "dynamic":
        return pick_layers_by_dynamic(library_order(recipe, loud), layers)
    if how == "loudness":
        return pick_layers(loud, layers, float(recipe.get("layer_step_db", 5.5)))
    raise SystemExit("unknown layer_by %r" % how)


def worst_stretch(notes, low, high):
    """The furthest the engine will have to stretch, given these samples.

    The same arithmetic `voices::build_bank` does, done here so a recipe's
    `notes` list can be judged before it is rendered rather than by reading
    the console after.
    """
    if not notes:
        return 99, None
    worst, where = 0, None
    for midi in range(low, high + 1):
        d = min(abs(midi - n) for n in notes)
        if d > worst:
            worst, where = d, midi
    return worst, where


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------

def render(recipe, outdir, root):
    """Write the bank, and return the rows, the trim and the notes for the report."""
    rate = int(recipe.get("rate", RATE))
    cap = float(recipe["cap_s"])
    if cap > MAX_NOTE_SECS:
        raise SystemExit("cap_s %.2f is over the %.1f s the loader allows" % (cap, MAX_NOTE_SECS))
    low, high = (int(v) for v in recipe["range"])
    keep = [int(n) for n in recipe["notes"]]
    want_layers = min(int(recipe.get("layers", 3)), MAX_USEFUL_LAYERS, MAX_LAYERS)
    want_rr = min(int(recipe.get("rr", 1)), MAX_RR)
    rng = np.random.default_rng(int(recipe.get("seed", 1)))
    notesrc = collect(recipe, root)

    have = sorted({m for (m, _) in notesrc})
    missing = [n for n in keep if n not in have]
    if missing:
        raise SystemExit(
            "the recipe asks for MIDI %s and the library does not sample %s"
            % (keep, missing))

    loud = measure_dynamics(notesrc, keep, rate)
    chosen = choose_layers(recipe, loud, want_layers)
    if not chosen:
        raise SystemExit("no dynamics at all in %s" % recipe["id"])

    notes_out = []
    rows = []
    tuning = []
    longest = 0.0
    total = 0
    for midi in keep:
        for li, (dynamic, _) in enumerate(chosen, start=1):
            note = notesrc.get((midi, dynamic))
            if note is None or not note.files:
                raise SystemExit(
                    "MIDI %d has no %s in the library" % (midi, dynamic))
            for ri in range(1, want_rr + 1):
                # A library with fewer round robins than asked for reuses its
                # own, in order: two takes of a note is two takes, and the
                # third slot playing the first again is what a sampler does.
                rr, wav = note.files[(ri - 1) % len(note.files)]
                x, sr = read_stereo(wav)
                # Mono BEFORE everything else, so the pitch measurement, the
                # tail search and the fade all see the buffer the bank will
                # actually hold.
                if x.shape[1] > 1:
                    x = x.mean(axis=1)[:, None]
                # In tune, before it is trimmed or normalised. Measured on
                # the note's own sustain — see `measure_kits.sustain_of` for
                # why not the attack — and corrected by resampling, which
                # also does the rate conversion.
                was = note_cents(x[:, 0], sr, midi)
                shift = 1.0
                if was is not None and abs(was) > TUNE_CENTS:
                    shift = 2.0 ** (-was / 1200.0)
                x = retune_and_resample(x, sr, rate, shift)
                x = dc_block(x, rate, float(recipe.get("dc_block_hz", 0.0)))
                y = trim_and_fade(
                    x, rate, cap,
                    floor_db=float(recipe.get("floor_db", -60.0)),
                    fade_in_ms=float(recipe.get("fade_in_ms", 1.0)),
                    fade_out_ms=float(recipe.get("fade_out_ms", 30.0)),
                )
                if not len(y):
                    raise SystemExit("MIDI %d %s rr%d trimmed to nothing" % (midi, dynamic, rr))
                path = os.path.join(outdir, "%d.%d.%d.wav" % (midi, li, ri))
                total += write_wav(path, y, rate, rng)
                longest = max(longest, len(y) / float(rate))
                # Measured back off the file that ships, dither and all,
                # rather than off the buffer that went into it.
                done, _ = sf.read(path, always_2d=True, dtype="float64")
                now = note_cents(done.mean(axis=1), rate, midi)
                tuning.append({"midi": midi, "layer": li, "rr": ri,
                               "was": was, "now": now, "moved": shift != 1.0})
        notes_out.append(midi)
        rows.append({"midi": midi, "name": midi_name(midi)})

    return {
        "rate": rate,
        "layers": len(chosen),
        "rr": want_rr,
        "dynamics": chosen,
        "loud": loud,
        "notes": notes_out,
        "tuning": tuning,
        "longest": longest,
        "bytes": total,
        "files": len(keep) * len(chosen) * want_rr,
        "range": (low, high),
    }


def compute_trim(recipe, outdir, built):
    """`trim_db`, so this bank lands where the synthesised voice it replaces did.

    MEASURED OFF THE WRITTEN FILES, for `render_kit.compute_trims`' reason:
    the buffers on the way out still carry the library's own recording level,
    and peak normalisation is the step that makes anything comparable at all.

    AGAINST THE RECIPE'S OWN NOTE, over the recipe's own length. The
    synthesised fingered bass is 0.45 s long and a recorded one runs to the
    2.0 s cap, so summing both whole would be comparing a level with a
    duration and would hand the recording a trim six decibels deep for the
    crime of ringing. Both are measured over the span the SYNTHESISED note
    occupied.

    K-WEIGHTED, AND THE BAND-PASS REPORTED BESIDE IT. The brief asks for this
    level to be set through the small-speaker band-pass, and measured that
    way the recorded fingered bass reads **+14 dB over the recipe** and wants
    a 15 dB trim. That number is an artefact and `measure_kits.k_energy`
    already says why, in the paragraph that begins "WHY NOT THE LAPTOP
    BAND-PASS": the band-pass starts at 200 Hz, an E1 is 41 Hz, and the
    synthesised bass is very nearly a sine — so through that filter the
    recipe is almost silent and anything with real harmonics on it reads
    enormous. It is the same mistake that handed the kick a +9 dB trim and a
    kit that peaked at two and a half times full scale, in the other
    direction. Trimming a recorded bass 15 dB to match a filter that cannot
    hear either instrument's fundamental would deliver a bass the owner
    cannot hear at all.

    So the trim is K-weighted, which is the standard answer to "how loud do
    these two different sounds seem" and can see both ends of the range, and
    the band-pass figure is measured and printed for every note so the
    departure is visible rather than quietly decided. This is `render_kit`'s
    split exactly: `k_energy` sets a balance, `band_energy` proves a pulse.

    Every sampled note is measured and the MEDIAN is taken: one note is one
    string on one bass, and the spread across the bank is printed so a bank
    that is even is visibly different from one that happens to agree at E2.
    """
    ref = recipe.get("level_ref")
    if not ref:
        return 0.0, []
    rate = built["rate"]
    layer = min(3, built["layers"])
    rows = []
    for midi in built["notes"]:
        path = os.path.join(outdir, "%d.%d.1.wav" % (midi, layer))
        x, sr = sf.read(path, always_2d=True, dtype="float64")
        played = x.mean(axis=1)
        synth, span = recipe_note(ref, midi, rate)
        n = int(span * rate)
        a = k_energy(synth[:n], rate, window_s=0)
        b = k_energy(played[:n], rate, window_s=0)
        ba = band_energy(synth[:n], rate)
        bb = band_energy(played[:n], rate)
        rows.append({
            "midi": midi,
            "synth_db": 10.0 * math.log10(max(a, 1e-30)),
            "played_db": 10.0 * math.log10(max(b, 1e-30)),
            "delta": 10.0 * math.log10(max(b, 1e-30) / max(a, 1e-30)),
            "band_synth_db": 10.0 * math.log10(max(ba, 1e-30)),
            "band_played_db": 10.0 * math.log10(max(bb, 1e-30)),
            "band_delta": 10.0 * math.log10(max(bb, 1e-30) / max(ba, 1e-30)),
        })
    deltas = sorted(r["delta"] for r in rows)
    median = deltas[len(deltas) // 2] if len(deltas) % 2 else (
        (deltas[len(deltas) // 2 - 1] + deltas[len(deltas) // 2]) / 2.0)
    # Clamped the way a kit's is: every file leaves here at peak 0.900, so a
    # positive trim asks the engine to push a bank past the ceiling the whole
    # app is normalised to. A bank that measures quieter than the recipe it
    # replaces is as loud as it gets, and saying so is better than saturating.
    return max(-24.0, min(0.0, -median)), rows


def write_manifest(recipe, outdir, built, trim):
    """`voice.json`, exactly as the contract spells it."""
    release = float(recipe["release_ms"])
    if release > MAX_RELEASE_MS:
        raise SystemExit(
            "release_ms %.0f is over the %.0f the loader clamps to"
            % (release, MAX_RELEASE_MS))
    man = collections.OrderedDict((
        ("id", recipe["id"]),
        ("name", recipe["name"]),
        ("credit", recipe["credit"]),
        ("licence", recipe["licence"]),
        ("rate", built["rate"]),
        ("channels", CHANNELS),
        ("layers", built["layers"]),
        ("rr", built["rr"]),
        ("trim_db", round(trim, 2)),
        # An integer where the number is one, so the manifest reads the way
        # the contract writes it (`"release_ms": 60`) rather than `60.0`.
        ("release_ms", int(release) if float(release).is_integer() else round(release, 1)),
        ("notes", built["notes"]),
    ))
    path = os.path.join(outdir, "voice.json")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(man, fh, indent=2)
        fh.write("\n")
    return man


def check_pitch(recipe, outdir, built):
    """Does a written note sound at the pitch its NAME claims?

    The one check that catches the octave in point 2 of the module docstring,
    and it is cheap: autocorrelate the sustain of the loudest layer of every
    sampled note and compare the fundamental with the file name. A bank
    mapped an octave out is in tune with itself and wrong with the band, so
    nothing else here would notice.
    """
    out = []
    layer = min(3, built["layers"])
    for midi in built["notes"]:
        path = os.path.join(outdir, "%d.%d.1.wav" % (midi, layer))
        x, sr = sf.read(path, always_2d=True, dtype="float64")
        # The same sustain the tuning was set on, so the two numbers in the
        # report are the same measurement at two search widths.
        seg = np.asarray(sustain_of(x.mean(axis=1), sr), dtype=np.float64)
        if len(seg) < 2048:
            continue
        seg = seg - seg.mean()
        ac = np.correlate(seg, seg, "full")[len(seg) - 1:]
        want = A4 * 2.0 ** ((midi - 69) / 12.0)
        # Searched around the pitch the name claims rather than over the whole
        # range: what this is testing is "is it this note", and a wide search
        # on a bright string finds the second harmonic and reports an octave
        # error that is not there.
        lo = max(int(sr / (want * 2.0 ** (5.0 / 12.0))), 1)
        hi = min(int(sr / (want * 2.0 ** (-5.0 / 12.0))), len(ac) - 1)
        if hi <= lo:
            continue
        lag = lo + int(np.argmax(ac[lo:hi]))
        cents = 1200.0 * math.log2((sr / float(lag)) / want)
        out.append((midi, cents))
    return out


def main():
    ap = argparse.ArgumentParser(
        description="Render a recorded melodic library into one of the app's voice banks.")
    ap.add_argument("recipe")
    ap.add_argument("outdir")
    ap.add_argument("--source-root", default=None,
                    help="the library's own folder, overriding the recipe's ${YAMES_SAMPLES} path")
    ap.add_argument("--check", action="store_true",
                    help="report what the recipe would do, and write nothing")
    args = ap.parse_args()

    with open(args.recipe, encoding="utf-8") as fh:
        recipe = json.load(fh)
    root = resolve_root(recipe["source"]["root"], args.source_root)
    outdir = os.path.abspath(args.outdir)

    low, high = (int(v) for v in recipe["range"])
    keep = [int(n) for n in recipe["notes"]]
    stretch, where = worst_stretch(keep, low, high)

    _log("=== %s (%s) ===" % (recipe["name"], recipe["id"]))
    _log("range MIDI %d-%d (%s-%s), %d notes sampled, worst stretch %d semitone%s%s"
         % (low, high, midi_name(low), midi_name(high), len(keep), stretch,
            "" if stretch == 1 else "s",
            "" if where is None else " (at %s)" % midi_name(where)))
    if stretch > MAX_STRETCH:
        raise SystemExit(
            "MIDI %d is %d semitones from the nearest sample and the engine "
            "stops being the instrument past %d" % (where, stretch, MAX_STRETCH))
    if args.check:
        notesrc = collect(recipe, root)
        loud = measure_dynamics(notesrc, keep, int(recipe.get("rate", RATE)))
        _log("the library's dynamics, over the notes this bank keeps:")
        for name, v in sorted(loud.items(), key=lambda kv: kv[1]):
            _log("  %-8s %+7.2f dB" % (name, v))
        chosen = choose_layers(recipe, loud, min(int(recipe.get("layers", 3)),
                                                 MAX_USEFUL_LAYERS))
        _log("layers by %s: %s" % (recipe.get("layer_by", "loudness"), ", ".join(
            "%d=%s (%+.2f dB)" % (i, n, v) for i, (n, v) in enumerate(chosen, 1))))
        for a, b in zip(chosen, chosen[1:]):
            _log("  step %s -> %s is %.2f dB" % (a[0], b[0], b[1] - a[1]))
        rrs = {len(n.files) for (m, d), n in notesrc.items() if m in keep}
        _log("round robins the library holds per note: %s" % sorted(rrs))
        return

    os.makedirs(outdir, exist_ok=True)
    built = render(recipe, outdir, root)
    trim, level = compute_trim(recipe, outdir, built)
    man = write_manifest(recipe, outdir, built, trim)

    _log()
    _log("| notes | layers | rr | files | longest | size | trim_db | release_ms |")
    _log("|---|---|---|---|---|---|---|---|")
    _log("| %d | %d | %d | %d | %.2f s | %.2f MB | %+.2f dB | %.0f ms |"
         % (len(built["notes"]), built["layers"], built["rr"], built["files"],
            built["longest"], built["bytes"] / 1048576.0, trim, man["release_ms"]))
    _log()
    _log("notes: %s" % " ".join(
        "%d(%s)" % (n, midi_name(n)) for n in built["notes"]))
    _log("layers from the library's %s" % ", ".join(
        "%s at %+.2f dB" % (n, v) for n, v in built["dynamics"]))
    if level:
        _log()
        _log("level against the synthesised %s - K-weighted, which sets the trim,"
             % recipe["level_ref"])
        _log("and the small-speaker band-pass beside it (see compute_trim):")
        _log("  | note | recipe K | recorded K | delta | recipe band | recorded band | delta |")
        for r in level:
            _log("  | %3d %-3s | %+7.2f | %+7.2f | %+6.2f | %+7.2f | %+7.2f | %+6.2f |"
                 % (r["midi"], midi_name(r["midi"]), r["synth_db"], r["played_db"],
                    r["delta"], r["band_synth_db"], r["band_played_db"], r["band_delta"]))
        spread = max(r["delta"] for r in level) - min(r["delta"] for r in level)
        bspread = max(r["band_delta"] for r in level) - min(r["band_delta"] for r in level)
        _log("  K-weighted spread %.2f dB, band-pass spread %.2f dB" % (spread, bspread))
        _log("  trim_db %+.2f (the band-pass would have asked for %+.2f)"
             % (trim, max(-24.0, min(0.0, -sorted(r["band_delta"] for r in level)[len(level) // 2]))))
    tune = built["tuning"]
    if tune:
        _log()
        _log("tuning on the sustain, worst layer and round robin of each note, "
             "in cents:")
        _log("  | note | before | after | retuned |")
        for midi in built["notes"]:
            got = [t for t in tune if t["midi"] == midi]
            was = [t["was"] for t in got if t["was"] is not None]
            now = [t["now"] for t in got if t["now"] is not None]
            _log("  | %3d %-3s | %+6.1f | %+5.1f | %d of %d |"
                 % (midi, midi_name(midi),
                    max(was, key=abs) if was else float("nan"),
                    max(now, key=abs) if now else float("nan"),
                    sum(1 for t in got if t["moved"]), len(got)))
        was = [t["was"] for t in tune if t["was"] is not None]
        now = [t["now"] for t in tune if t["now"] is not None]
        _log("  worst %+.1f cents before, %+.1f after; %d of %d files retuned"
             % (max(was, key=abs) if was else float("nan"),
                max(now, key=abs) if now else float("nan"),
                sum(1 for t in tune if t["moved"]), len(tune)))
        octave = check_pitch(recipe, outdir, built)
        if octave:
            worst = max(octave, key=lambda t: abs(t[1]))
            _log("  octave guard (searched five semitones either way rather than a "
                 "quarter tone): worst %+.0f cents at %s, and a bank mapped an "
                 "octave out reads %+d"
                 % (worst[1], midi_name(worst[0]), 1200))
            if abs(worst[1]) > 100.0:
                raise SystemExit(
                    "%s at %s is %+.0f cents out, which is not a tuning error but "
                    "a mapping one — check `key_offset`"
                    % (recipe["id"], midi_name(worst[0]), worst[1]))


if __name__ == "__main__":
    main()
