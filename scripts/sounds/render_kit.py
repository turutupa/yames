"""Render a recorded drum library down to one of the app's kit folders.

    python scripts/sounds/render_kit.py scripts/sounds/recipes/club.json \
        src-tauri/sounds/kits/club
    python scripts/sounds/render_kit.py scripts/sounds/recipes/perc-club.json \
        src-tauri/sounds/perc/club

A recipe names the source library, the mic mix, and for each of the contract's
voices which articulation to draw from and how many velocity layers and round
robins to keep. The library itself never enters the repository — only the
rendered files do, the way `generate_sounds.py --kits` is the source of the
synthesised kits and no WAV is hand-edited.

TWO CONTRACT VOICE LISTS, one tool. `"set": "kit"` is the eleven drum voices
and `"set": "perc"` is the percussionist's ten, and a percussion set is a
kit-format folder in every other respect — same rate, same peak, same
`trim_db`, same `<voice>.<layer>.<rr>.wav`. The three things a percussionist
needed that a drum kit did not are each a recipe field and each documented
where it is implemented: `mic_tag` (`SfzSource`), `layers_from_rr`
(`rank_rr_as_dynamics`), and a voice drawn from more than one articulation
(`voice_parts`). `balance_ref` is the fourth: a set with no snare in it is
levelled against the snare of the kit it plays under.

WHY A TOOL AND NOT A ONE-OFF SCRIPT. The kits are going to be re-rendered.
The first listen will say "more room" or "less hat", and the answer to that
has to be a number in a recipe and a re-run, not an afternoon of re-deriving
what was done the first time. Everything a listener might ask to change is a
field in the recipe; everything that is a property of the contract is in here.

THE FIVE THINGS THIS DOES THAT A BULK CONVERTER DOES NOT
--------------------------------------------------------

1. **Layers are chosen by loudness, not by velocity number.** A library's
   velocity indices are not evenly spaced in dB — Virtuosity's snare walks
   34 dB across 36 steps but spends eleven of them inside 3 dB. Slicing that
   range into four equal *index* bands gives two layers that sound identical
   and a gap in the middle. `pick_layers` measures every candidate and walks
   down from the hardest hit in equal dB steps.

2. **Round robins come from the source where the source has them, and from
   neighbouring velocities where it does not.** Virtuosity is split down the
   middle on this: cymbals have 3-4 real round robins per velocity and the
   drums have none, but the drums have 16-36 velocity steps. The hit one
   notch softer is a different performance of the same stroke, which is what
   a round robin is for. No file is used twice inside one voice.

3. **The mics are time-aligned before they are summed.** A room mic 3 m off
   the kit arrives 6-10 ms after the close mic, measured on this library
   below. Summed as-is that is a comb filter on every transient, and the
   audible result is a kick with a hole in it rather than a kick in a room.
   Alignment is done on the energy envelope, not the waveform: correlating a
   50 Hz kick waveform against a room mic locks onto whichever cycle happens
   to match and reports a lag one period out.

4. **Peak is uniform and balance lives in the manifest.** Every file leaves
   here at 0.900 like every other sound in the app, so a layer carries its
   timbre and its duration and nothing else; `trim_db` per voice carries the
   balance, measured through the same small-speaker band-pass the engine
   uses. This is the split `src-tauri/sounds/KITS.md` argues for at length,
   and the argument is the same one: a file cannot be made audible by being
   normalised, only by having energy in the band a laptop radiates.

5. **Tails are landed, not cut.** A cymbal that stops mid-decay is a click,
   and the click is on every hit. Each file gets a raised-cosine fade and
   both end samples forced to true zero.

Adding a source format is adding a class with `voices()` and `load()`.
"""
import argparse
import collections
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

import numpy as np

try:
    import soundfile as sf
except ImportError:  # pragma: no cover - a missing dep is a setup problem
    raise SystemExit(
        "render_kit needs soundfile (and numpy, scipy):\n"
        "    pip install soundfile numpy scipy"
    )

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

# The band-pass is the engine's, ported once, in the measurement script. Import
# it rather than copying it: two copies of that filter is exactly how the
# measurement quietly stops matching what the engine hears.
from measure_kits import band_energy, k_energy  # noqa: E402

# ---------------------------------------------------------------------------
# The contract. These are not recipe fields because they are not opinions —
# they are `plans/tasks/jam-v3/BRIEF.md`, and a recipe that disagreed with one
# of them would produce a kit the loader rejects.
# ---------------------------------------------------------------------------

VOICES = (
    "kick", "snare", "rim", "hat", "hat_open", "hat_pedal",
    "ride", "ride_bell", "crash", "tom_hi", "tom_lo",
)

# The percussion set — `plans/tasks/jam-v5/BRIEF.md`. A percussionist is not a
# drum kit, and the engine plays this folder *under* whichever kit is loaded,
# so it is a second contract voice list and not eleven voices with ten of them
# missing. It is a kit-format folder in every other respect, which is why the
# whole of this file works on it unchanged apart from the list and the cap.
PERC_VOICES = (
    "shaker", "tambourine", "cowbell", "cabasa", "claves", "guiro",
    "conga_hi", "conga_lo", "bongo_hi", "bongo_lo",
)

# A recipe says which set it renders with `"set"`. The ceiling differs because
# the longest thing in a drum kit is a crash and the longest thing a
# percussionist owns is a tambourine, which has stopped ringing inside two
# seconds; a percussion file over that is a mistake and not a cymbal.
SETS = {
    "kit": {"voices": VOICES, "max_seconds": 3.0},
    "perc": {"voices": PERC_VOICES, "max_seconds": 2.0},
}

RATE = 48000
CHANNELS = 2
PEAK = 0.90
MAX_SECONDS = 3.0
MAX_LAYERS = 4
MAX_RR = 3

# Peak as an int16 target. 0.90 * 32767 = 29490.3, and `measure_kits` reads the
# peak back as peak_i16 / 32767, so 29490 is the value that reads as 0.900.
PEAK_I16 = 29490


def _log(msg=""):
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# Sample sources
# ---------------------------------------------------------------------------

class Take(object):
    """One recorded stroke: a dynamic, a round-robin index, and the file each
    mic captured it through."""

    __slots__ = ("vel", "rr", "files", "rms")

    def __init__(self, vel, rr, files):
        self.vel = vel          # source dynamic index, ascending = harder
        self.rr = rr            # source round-robin index within that dynamic
        self.files = files      # {mic: path}
        self.rms = None         # filled in by measure_takes

    def __repr__(self):
        return "Take(vel=%s, rr=%s)" % (self.vel, self.rr)


class TakeList(list):
    """The strokes of one articulation, and what the search did not find.

    A plain list everywhere it is used; `missing` rides along so a mic that
    the library turns out not to have for this instrument is reported once
    rather than inferred from a mix that sounds thin.
    """

    def __init__(self, takes, missing=None):
        list.__init__(self, takes)
        self.missing = missing or collections.Counter()


class SfzSource(object):
    """Virtuosity Drums and anything else shipped as per-mic SFZ maps.

    The maps live at `Programs/mappings/<mic>/<articulation>_map.sfz` and their
    `sample=` paths are relative to `Programs/`, because that is the directory
    of the file that `#include`s them. Regions carry `lovel`/`hivel` for the
    dynamic and `seq_position` for the round robin, but both of those are also
    in the file name (`..._vl3_rr2.flac`) and the file name is the more
    reliable of the two: a handful of maps in this library give every region
    the same `seq_length` without a `seq_position` on the first one.

    TWO NAMING DIALECTS IN ONE LIBRARY, and the second one is why `mic_tag`
    exists. Virtuosity's drums put the mic in front of the file name and in
    the directory — `Samples/oh/snare/oh_snare_buzz_vl7.flac` — so finding the
    same stroke on another mic is one substitution done twice. Its auxiliary
    percussion, which came from VSCO 2 and was mapped separately, puts the mic
    in the directory as `oh` but at the END of the file name as a word:
    `Samples/perc/oh/conga/Conga_22_HitN_1_50_rr1_Overhead.wav`, and the close
    mic of that stroke is `..._rr1_Close.wav` under `perc/close/`. A recipe
    whose library does that names the translation:

        "mic_tag": {"oh": "Overhead", "close": "Close", "room": "Far"}

    Without it the close mic is simply never found, the mix quietly loses the
    channel it was weighted for, and the only symptom is a percussion set with
    no proximity in it — which is a bug you hear months later and cannot
    explain. With it, the miss is still not fatal (a library may genuinely not
    have miked one instrument close) but it is counted and reported.
    """

    format = "sfz"

    def __init__(self, root, cfg):
        self.root = root
        self.programs = os.path.join(root, cfg.get("programs", "Programs"))
        # `mappings` because one library can hold more than one instrument
        # family: Virtuosity's drums are mapped at `mappings/<mic>/` and its
        # auxiliary percussion one level further down at `mappings/perc/<mic>/`.
        self.mappings = os.path.join(self.programs,
                                     *cfg.get("mappings", "mappings").split("/"))
        self.mic_tag = cfg.get("mic_tag", {})
        if not os.path.isdir(self.mappings):
            raise SystemExit("no SFZ mappings under %s" % self.mappings)

    def _map_path(self, mic, articulation):
        return os.path.join(self.mappings, mic, "%s_map.sfz" % articulation)

    def _candidates(self, abspath, primary, mic):
        """Where the same stroke might live for `mic`, best guess first."""
        base = os.path.basename(abspath)
        out = []
        # The drums: the mic is the directory and the file name's prefix.
        out.append(abspath.replace(os.sep + primary + os.sep, os.sep + mic + os.sep)
                          .replace(primary + "_", mic + "_", 1))
        # The percussion: the mic is the directory and the file name's suffix,
        # spelled as a word that the recipe translates.
        tag_from, tag_to = self.mic_tag.get(primary), self.mic_tag.get(mic)
        if tag_from and tag_to:
            out.append(os.path.join(
                os.path.dirname(abspath).replace(
                    os.sep + primary + os.sep, os.sep + mic + os.sep),
                base.replace("_" + tag_from + ".", "_" + tag_to + ".")))
        # The blunt one, for a library that only moves the directory.
        out.append(os.path.join(
            os.path.dirname(os.path.dirname(abspath)).replace(
                os.sep + primary, os.sep + mic),
            os.path.basename(os.path.dirname(abspath)), base))
        return out

    def _regions(self, path):
        """Every `sample=` in an SFZ, with the opcodes of its region."""
        out = []
        cur = None
        with open(path, "r", errors="replace") as fh:
            for line in fh:
                line = line.split("//")[0].strip()
                if not line:
                    continue
                if line.startswith("<region>"):
                    if cur is not None:
                        out.append(cur)
                    cur = {}
                    line = line[len("<region>"):].strip()
                    if not line:
                        continue
                if line.startswith("<"):
                    continue
                if cur is None:
                    continue
                for tok in line.split():
                    if "=" in tok:
                        k, v = tok.split("=", 1)
                        cur[k.strip()] = v.strip()
        if cur is not None:
            out.append(cur)
        return [r for r in out if "sample" in r]

    def takes(self, articulation, mics):
        """Collect every stroke of `articulation` across `mics`.

        The primary mic's map defines which strokes exist; the others are
        matched by file name, because every mic in this library recorded every
        stroke and the names differ only in where the mic is written. See
        `_candidates` for the two places that is.

        `missing` on the returned list counts strokes that lost a non-primary
        mic, per mic, so the caller can say so rather than silently render a
        thinner mix than the recipe asked for.
        """
        primary = mics[0]
        path = self._map_path(primary, articulation)
        if not os.path.isfile(path):
            raise SystemExit(
                "no map for %s on mic %s (looked for %s)" % (articulation, primary, path)
            )
        grouped = collections.OrderedDict()
        missing = collections.Counter()
        seq = collections.Counter()
        for region in self._regions(path):
            rel = region["sample"].replace("\\", "/")
            abspath = os.path.normpath(os.path.join(self.programs, rel))
            if not os.path.isfile(abspath):
                continue
            base = os.path.basename(abspath)
            vel, rr = _parse_vl_rr(base)
            if vel is None:
                # No dynamic in the name. The map's own velocity band is what
                # orders these — the percussion writes its range into the file
                # name as words (`..._51_100_...`) rather than as an index, and
                # a single-dynamic articulation has no band at all.
                vel = int(region.get("hivel", region.get("lovel", 127)))
            if rr is None:
                # No round robin in the name either. Number them in map order
                # within the dynamic, because collapsing eight real round
                # robins onto rr 1 would throw seven of them away.
                seq[vel] += 1
                rr = seq[vel]
            files = {}
            ok = True
            for mic in mics:
                for cand in self._candidates(abspath, primary, mic):
                    if os.path.isfile(cand):
                        files[mic] = cand
                        break
                else:
                    if mic == primary:
                        ok = False
                    else:
                        # Not fatal: the mix loses that channel for this
                        # stroke. Counted, and reported by the caller.
                        missing[mic] += 1
            if not ok:
                continue
            grouped.setdefault((vel, rr), Take(vel, rr, files))
        takes = list(grouped.values())
        takes.sort(key=lambda t: (t.vel, t.rr))
        return TakeList(takes, missing)


class DrumGizmoSource(object):
    """DRSKit and the other DrumGizmo kits.

    A kit XML at the root (`DRSKit_full.xml` and friends) lists the channels
    and points at one XML per instrument. Each instrument's `<samples>` block
    lists strokes with a `power` attribute — the library's own measure of how
    hard the stroke was, so it plays the part `vl` plays in an SFZ — and an
    `<audiofile>` per channel. In DRSKit every channel of a stroke lives in
    ONE 13-channel WAV and `filechannel` indexes into it, which is why reads
    are cached: a four-mic mix would otherwise open and decode the same file
    four times.

    Round robins: DrumGizmo does not have them. It has 11 to 30 strokes per
    instrument with every power different, which the layer picker treats as a
    deep velocity ladder and borrows neighbours from, exactly as it does for
    Virtuosity's drums.

    STEREO PAIRS. The overheads and the ambience arrive as two mono channels
    (`OHL`/`OHR`, `AmbL`/`AmbR`), not as a stereo file, so the recipe names
    them as a pair and they are recombined into one stereo source here. Summed
    to mono instead — which is what treating them as two separate mics would
    do — the kit loses the entire stereo image, which is most of what "a kit
    in a room" means on headphones.
    """

    format = "drumgizmo"

    def __init__(self, root, cfg):
        self.root = root
        name = cfg.get("kit_file", "drumkit.xml")
        self.kitdir, self.kitfile = self._find_kit(root, name)
        self.pairs = cfg.get("pairs", {})
        self.channels, self.instruments = self._read_kit()

    @staticmethod
    def _find_kit(root, name):
        for base, dirs, files in os.walk(root):
            if name in files:
                return base, os.path.join(base, name)
            dirs[:] = [d for d in dirs if d.lower() != "samples"]
        raise SystemExit("no %s under %s" % (name, root))

    def _read_kit(self):
        root = ET.parse(self.kitfile).getroot()
        channels = [el.get("name") for el in root.iter()
                    if _tag(el) == "channel" and el.get("name")]
        instruments = {}
        for el in root.iter():
            if _tag(el) == "instrument" and el.get("name"):
                rel = (el.get("file") or "").replace("\\", "/")
                instruments[el.get("name")] = os.path.normpath(
                    os.path.join(self.kitdir, rel)) if rel else None
        return channels, instruments

    def _instrument_xml(self, name):
        path = self.instruments.get(name)
        if path and os.path.isfile(path):
            return path
        # Not in this kit variant's list: fall back to the folder layout.
        cand = os.path.join(self.kitdir, name, "%s.xml" % name)
        if os.path.isfile(cand):
            return cand
        raise SystemExit(
            "no instrument %r in %s (have: %s)"
            % (name, os.path.basename(self.kitfile),
               ", ".join(sorted(self.instruments)[:6]) + " ...")
        )

    def takes(self, articulation, mics):
        """`articulation` is the instrument name; `mics` are channels or pairs."""
        xml = self._instrument_xml(articulation)
        idir = os.path.dirname(xml)
        root = ET.parse(xml).getroot()

        # Which raw channels each requested mic needs.
        wanted = {}
        for mic in mics:
            wanted[mic] = list(self.pairs.get(mic, [mic]))
        every = set(c for chans in wanted.values() for c in chans)

        takes = []
        for i, sample in enumerate(el for el in root.iter() if _tag(el) == "sample"):
            try:
                power = float(sample.get("power"))
            except (TypeError, ValueError):
                power = float(i)
            raw = {}
            for af in (el for el in sample.iter() if _tag(el) == "audiofile"):
                ch = af.get("channel")
                rel = (af.get("file") or "").replace("\\", "/")
                if not ch or ch not in every or not rel:
                    continue
                path = os.path.normpath(os.path.join(idir, rel))
                if not os.path.isfile(path):
                    continue
                try:
                    fc = int(af.get("filechannel", "1")) - 1
                except ValueError:
                    fc = 0
                raw[ch] = (path, fc)
            files = {}
            for mic, chans in wanted.items():
                got = [raw[c] for c in chans if c in raw]
                if len(got) == len(chans) and got:
                    files[mic] = got if len(got) > 1 else got[0]
            if files:
                takes.append(Take(power, 0, files))
        takes.sort(key=lambda t: t.vel)
        return TakeList(takes)


def _tag(el):
    return el.tag.split("}")[-1]


def _find_dir_with(root, filename):
    if os.path.isfile(os.path.join(root, filename)):
        return root
    for base, dirs, files in os.walk(root):
        if filename in files:
            return base
        # The kits are deep; do not descend into sample folders looking for it.
        dirs[:] = [d for d in dirs if d.lower() not in ("samples", "instruments")]
    return None


_VL_RE = re.compile(r"_vl(\d+)(?=[_.])")
_V_RE = re.compile(r"_v(\d+)(?=[_.])")
_RR_RE = re.compile(r"_rr(\d+)(?=[_.])")


def _parse_vl_rr(name):
    """The dynamic and the round robin a file name carries, or (None, None).

    Three dialects, all of them in this one library, because its drums and its
    auxiliary percussion were mapped by different hands:

        oh_ride_ride_vl2_rr3.flac          -> (2, 3)    the drums
        oh_snare_buzz_vl7.flac             -> (7, None) the drums, no rr
        BongoH_Hit1_v3_rr2_Overhead.wav    -> (3, 2)    percussion, `_v`
        Conga_22_HitN_51_100_rr4_Over.wav  -> (None, 4) percussion, range in
                                                        the name, not an index
        Tamb1_Shake_rr7_Overhead.wav       -> (None, 7) percussion, one dynamic

    The tokens are found anywhere in the name and not anchored to the
    extension, because percussion puts the mic after them (`..._rr1_Overhead`)
    where the drums put it in front (`oh_...`).

    `None` for the round robin means the name does not say, which is not the
    same as round robin 1: the caller groups strokes by `(vel, rr)`, and eight
    real round robins that all parsed as 1 would collapse into one stroke. The
    caller numbers them in file order instead.
    """
    m = _VL_RE.search(name) or _V_RE.search(name)
    vel = int(m.group(1)) if m else None
    r = _RR_RE.search(name)
    return vel, (int(r.group(1)) if r else None)


SOURCES = {"sfz": SfzSource, "drumgizmo": DrumGizmoSource}


# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------

_READ_CACHE = collections.OrderedDict()
_CACHE_MAX = 24


def _read_file(path):
    """Whole-file read, with a small cache.

    DRSKit puts all thirteen mics of one stroke in a single WAV, so a four-mic
    mix asks for the same file four times and a stereo pair asks twice more.
    Twenty-four entries holds the handful any one stroke touches.
    """
    hit = _READ_CACHE.get(path)
    if hit is not None:
        _READ_CACHE.move_to_end(path)
        return hit
    x, sr = sf.read(path, always_2d=True, dtype="float64")
    _READ_CACHE[path] = (x, sr)
    if len(_READ_CACHE) > _CACHE_MAX:
        _READ_CACHE.popitem(last=False)
    return x, sr


def read_stereo(path, filechannel=None):
    """Read a sample file as float64 at its own rate.

    A mono file stays mono here (one column) so the caller can pan it; a
    stereo file keeps its image. `filechannel` picks one channel out of a
    multi-channel file, which is how DrumGizmo stores its 13 mics.
    """
    x, sr = _read_file(path)
    if filechannel is not None and x.shape[1] > filechannel:
        x = x[:, filechannel:filechannel + 1]
    return x, sr


def load_entry(entry):
    """One mic's audio for one stroke, whatever shape the library stores it in.

    A path (SFZ, mono or stereo), a (path, filechannel) pair (one channel of a
    DrumGizmo multichannel file), or a list of two of those (a DrumGizmo
    stereo pair such as OHL/OHR, recombined into one stereo source here).
    """
    if isinstance(entry, list):
        cols, sr = [], None
        for path, fc in entry:
            x, sr = read_stereo(path, fc)
            cols.append(x[:, 0])
        n = min(len(c) for c in cols)
        return np.column_stack([c[:n] for c in cols]), sr
    if isinstance(entry, tuple):
        return read_stereo(entry[0], entry[1])
    return read_stereo(entry)


def resample_to(x, sr, target):
    if sr == target:
        return x
    from scipy.signal import resample_poly
    g = math.gcd(int(sr), int(target))
    return resample_poly(x, target // g, sr // g, axis=0)


def envelope(mono, sr, ms=2.0):
    """A smoothed |x| envelope, for onset finding and mic alignment.

    Rectify and one-pole smooth. Correlating envelopes rather than waveforms
    is the whole trick in `align`: it is immune to polarity and to a low
    frequency matching itself a cycle late.
    """
    from scipy.signal import lfilter
    a = math.exp(-1.0 / (sr * ms / 1000.0))
    return lfilter([1.0 - a], [1.0, -a], np.abs(mono))


def align(ref_mono, other_mono, sr, max_ms=30.0):
    """Samples to advance `other` so its arrival sits on `ref`'s.

    Positive means the other mic is late, which is the normal case: a room mic
    is further from the drum. The search is one-sided by `max_ms` and runs on
    envelopes; see the module docstring, point 3.
    """
    n = min(len(ref_mono), len(other_mono))
    if n < 64:
        return 0
    look = min(n, int(sr * 0.25))
    a = envelope(ref_mono[:look], sr)
    b = envelope(other_mono[:look], sr)
    a = a - a.mean()
    b = b - b.mean()
    lim = int(sr * max_ms / 1000.0)
    c = np.correlate(b, a, "full")
    centre = len(a) - 1
    lo, hi = centre, min(centre + lim, len(c) - 1)
    if hi <= lo:
        return 0
    return int(np.argmax(c[lo:hi + 1]))


def shift(x, n):
    """Advance a buffer by `n` samples (n > 0 drops the head)."""
    if n <= 0:
        return x
    if n >= len(x):
        return x[:0]
    return x[n:]


def pan_mono(mono, pan):
    """Place a mono channel with a constant-power law. -1 left, +1 right."""
    theta = (float(pan) + 1.0) * math.pi / 4.0
    return np.column_stack((mono * math.cos(theta), mono * math.sin(theta)))


def to_stereo(x, pan=0.0):
    if x.shape[1] == 1:
        return pan_mono(x[:, 0], pan)
    if x.shape[1] == 2:
        return x
    return np.column_stack((x[:, 0], x[:, 1]))


def peak_of(x):
    return float(np.max(np.abs(x))) if len(x) else 0.0


def rms_db(x, sr, window_s=0.3):
    """Loudness of a stroke: RMS over the window after its own peak.

    Windowed rather than whole-file because the files in these libraries have
    wildly different lengths — a crash sample runs 11 s and a hi-hat 0.4 s —
    and a whole-file RMS would rank a long quiet cymbal under a short loud one
    purely on how much silence got averaged in.
    """
    mono = x.mean(axis=1) if x.ndim > 1 else x
    if not len(mono):
        return -999.0
    pk = int(np.argmax(np.abs(mono)))
    seg = mono[pk:pk + int(window_s * sr)]
    if not len(seg):
        return -999.0
    return 20.0 * math.log10(max(float(np.sqrt(np.mean(seg ** 2))), 1e-12))


# ---------------------------------------------------------------------------
# Layer and round-robin choice
# ---------------------------------------------------------------------------

def measure_takes(source, takes, mic, rate):
    """Loudness of every candidate stroke, through one mic.

    One mic and not the mix: the mix is expensive and the *ranking* is what
    this is for, and every mic hears the same performance get harder.
    """
    for t in takes:
        entry = t.files.get(mic)
        if entry is None:
            entry = next(iter(t.files.values()))
        x, sr = load_entry(entry)
        t.rms = rms_db(x, sr)
    return takes


def pick_layers(takes, layers, step_db, name=""):
    """Choose `layers` dynamics, spaced by loudness, hardest first.

    Walks down from the hardest stroke in `step_db` steps and takes the group
    nearest each target. When the source's whole range is narrower than the
    steps ask for, the targets are spread evenly across what there is and the
    caller is told: a spacing the library does not have cannot be invented,
    and pretending otherwise gives two layers that are the same sound.
    """
    groups = collections.OrderedDict()
    for t in takes:
        groups.setdefault(t.vel, []).append(t)
    keys = sorted(groups, key=lambda k: (max(x.rms for x in groups[k]), k))
    if not keys:
        raise SystemExit("no takes for %s" % name)
    layers = min(layers, len(keys))

    loud = {k: max(x.rms for x in groups[k]) for k in keys}
    top, bottom = loud[keys[-1]], loud[keys[0]]
    span = top - bottom
    wanted = step_db * (layers - 1)
    note = ""
    if span < wanted - 0.5:
        # Not enough range in the library. Spread over what exists.
        targets = [bottom + span * i / max(layers - 1, 1) for i in range(layers)]
        note = "source spans %.1f dB, wanted %.1f" % (span, wanted)
    else:
        targets = [top - step_db * i for i in range(layers)][::-1]

    chosen = []
    used = set()
    for tgt in targets:
        best = min(
            (k for k in keys if k not in used),
            key=lambda k: abs(loud[k] - tgt),
        )
        used.add(best)
        chosen.append(best)
    chosen.sort(key=lambda k: loud[k])
    return [groups[k] for k in chosen], keys, groups, loud, note


def pick_rr(group, rr, all_keys, groups, anchors, used_files):
    """`rr` distinct strokes for one layer.

    The source's own round robins first — they are what a round robin means,
    the same stroke played again. When the library has none (Virtuosity's
    drums, DrumGizmo's continuum), borrow the neighbouring dynamics, nearest
    first, skipping any dynamic that is another layer's anchor so two layers
    never share a performance. Never the same file twice.
    """
    out = []
    for t in group:
        key = _take_key(t)
        if key not in used_files:
            out.append(t)
            used_files.add(key)
        if len(out) >= rr:
            return out, "source"

    anchor = group[0].vel
    idx = all_keys.index(anchor) if anchor in all_keys else 0
    order = []
    for d in range(1, len(all_keys)):
        for k in (idx + d, idx - d):
            if 0 <= k < len(all_keys):
                order.append(all_keys[k])
    borrowed = False
    for k in order:
        if len(out) >= rr:
            break
        if k in anchors and k != anchor:
            continue
        for t in groups[k]:
            key = _take_key(t)
            if key in used_files:
                continue
            out.append(t)
            used_files.add(key)
            borrowed = True
            break
    return out, ("neighbours" if borrowed else "source")


def _take_key(t):
    """A hashable identity for one stroke, so no file is used twice."""
    entry = sorted(t.files.items())[0][1]
    if isinstance(entry, list):
        return tuple(entry)
    if isinstance(entry, tuple):
        return entry
    return entry


def rank_rr_as_dynamics(takes):
    """Let a one-dynamic articulation's round robins stand in for its layers.

    THE DRUMS' PROBLEM, EXACTLY INVERTED. Virtuosity's drums have 16 to 36
    velocities and no round robins, so `pick_rr` borrows a neighbouring
    velocity when it needs a second performance. Its tambourine has the
    opposite shape: one velocity band and ten shakes inside it, sampled as
    round robins because a tambourine is not a drum you strike at a chosen
    force — you shake it, and ten shakes by a human being are not the same
    loudness. Measured on this library the ten span 8.2 dB, which is a real
    dynamic range and a wider one than several instruments that *were*
    sampled in bands.

    So rank the strokes by loudness and give each one its own dynamic index.
    Everything downstream then works unchanged and works correctly:
    `pick_layers` walks down the ranking in dB steps as it does for a snare,
    and `pick_rr` finds one stroke per dynamic and borrows its neighbours —
    which are the adjacent shakes, the nearest thing to the same stroke played
    again that the library holds.

    Returns False and changes nothing when the articulation already has more
    than one dynamic, so a recipe can ask for this without first knowing which
    shape the source turned out to have.
    """
    if len(set(t.vel for t in takes)) > 1:
        return False
    for i, t in enumerate(sorted(takes, key=lambda t: t.rms)):
        t.vel = i
    takes.sort(key=lambda t: (t.vel, t.rr))
    return True


def voice_parts(cfg, voice):
    """The articulations one voice draws on: (combine, [(name, layers, rr)]).

    Most voices are one articulation and this is a formality. Two in the
    percussion set are not, and they are not for opposite reasons:

    `"combine": "rr"` — the shaker. `shaker_up` and `shaker_down` are two maps
    because an up-stroke and a down-stroke are two different sounds, and a
    shaker alternates between them by nature. So they are not two dynamics and
    not two instruments: they are the two round robins of one voice, and the
    contract says so. Each articulation supplies its share of the round
    robins at every layer.

    `"combine": "layers"` — the high conga. `conga_muted` is the ghost stroke,
    a palm on the head, and no velocity of `conga_open` is that sound however
    softly it is struck. It is layer 1 and the open strokes are the layers
    above it, which is a source articulation standing in for a velocity band.
    Each articulation names how many layers it supplies and they stack in the
    order written, softest first.
    """
    art = cfg["articulation"]
    want_layers = min(int(cfg.get("layers", 1)), MAX_LAYERS)
    want_rr = min(int(cfg.get("rr", 1)), MAX_RR)
    if isinstance(art, str):
        return "layers", [(art, want_layers, want_rr)]
    if not art:
        raise SystemExit("%s: `articulation` is an empty list" % voice)

    combine = cfg.get("combine")
    if combine not in ("layers", "rr"):
        raise SystemExit(
            "%s draws on %d articulations, so it needs \"combine\": \"layers\" "
            "(each one is a layer of its own) or \"rr\" (each one is a round "
            "robin); the recipe says %r" % (voice, len(art), combine))

    if combine == "rr":
        names = []
        for a in art:
            if not isinstance(a, str):
                raise SystemExit(
                    "%s: with \"combine\": \"rr\" every articulation is named as "
                    "a string — the round robins are shared out, not declared"
                    % voice)
            names.append(a)
        n = len(names)
        if want_rr < n:
            raise SystemExit(
                "%s: %d articulations to share %d round robin(s) between; ask "
                "for at least %d" % (voice, n, want_rr, n))
        shares = [want_rr // n + (1 if i < want_rr % n else 0) for i in range(n)]
        return "rr", [(nm, want_layers, s) for nm, s in zip(names, shares)]

    out = []
    for a in art:
        if isinstance(a, str) or "layers" not in a:
            raise SystemExit(
                "%s: with \"combine\": \"layers\" each articulation says how many "
                "layers it supplies, as {\"name\": ..., \"layers\": n}" % voice)
        out.append((a["name"], int(a["layers"]), want_rr))
    got = sum(n for _, n, _ in out)
    if got != want_layers:
        raise SystemExit(
            "%s: the articulations supply %d layers and the voice asks for %d"
            % (voice, got, want_layers))
    return "layers", out


# ---------------------------------------------------------------------------
# Rendering one stroke
# ---------------------------------------------------------------------------

def render_take(take, mix, pan, swap_stereo, rate, align_to=None, flip_if_opposed=()):
    """Mix one stroke's mics into stereo at `rate`.

    The highest-weighted mic is the alignment reference and the length the
    others are trimmed or padded to; everything else is advanced onto it.

    `flip_if_opposed` names mics whose polarity is checked against the
    reference once they are aligned, and inverted when it is opposite. It
    exists for a snare's bottom mic, which points at the wires from
    underneath: the head moves away from it as it moves towards the top mic,
    so the two are wired in opposition and summing them as they come cancels
    most of the drum. It is an opt-in list and not a blanket rule, because
    between an overhead and a close cymbal mic a negative correlation is
    usually a path-length difference and flipping it would be wrong.
    """
    weights = {m: w for m, w in mix.items() if w and m in take.files}
    if not weights:
        return None
    ref_mic = align_to if align_to in weights else max(weights, key=lambda m: weights[m])

    loaded = {}
    for mic in weights:
        x, sr = load_entry(take.files[mic])
        x = resample_to(x, sr, rate)
        if swap_stereo and x.shape[1] == 2:
            x = x[:, ::-1]
        loaded[mic] = x

    ref = loaded[ref_mic]
    ref_mono = ref.mean(axis=1)
    n = len(ref)
    acc = np.zeros((n, 2), dtype=np.float64)
    lags = {}
    flipped = []
    for mic, x in loaded.items():
        if mic != ref_mic:
            lag = align(ref_mono, x.mean(axis=1), rate)
            lags[mic] = lag
            x = shift(x, lag)
        if mic in flip_if_opposed and mic != ref_mic:
            m = min(len(ref_mono), len(x))
            if m > 64:
                r = float(np.dot(ref_mono[:m], x[:m].mean(axis=1)))
                if r < 0:
                    x = -x
                    flipped.append(mic)
        y = to_stereo(x, pan)
        if len(y) < n:
            y = np.vstack((y, np.zeros((n - len(y), 2))))
        acc += weights[mic] * y[:n]
    return acc, lags, flipped


def dc_block(x, rate, hz):
    """A gentle high-pass, to take the room's rumble off the bottom.

    A soft stroke in these libraries sits 40 dB under a hard one, so peak
    normalisation lifts it — and lifts the air handling, the floor and the
    mic's own offset with it. Measured on Club's softest kick that arrived as
    a DC offset of 1.5e-03, seven times the guard, on a voice whose fundamental
    is at 55 Hz and which therefore loses nothing at all to a 22 Hz corner. It
    also very slightly RAISES the in-band energy, because the headroom the
    rumble was eating goes back to the drum.

    ZERO-PHASE, which matters twice over. A one-way filter settles over about
    fifty milliseconds at this corner, and on DRSKit's short strokes — a snare
    that is over in half a second — that settling tail IS the offset: filtered
    forwards only, its softest snares came out at 3e-04 against a 2e-04 guard,
    having gone in clean. Run forwards and backwards the settling cancels. And
    a drum sample is judged on its transient: a zero-phase filter does not
    move the attack in time relative to the body, which a one-way filter with
    a 20 ms group delay at the bottom quietly does.

    PADDED WITH REAL SILENCE, which is the part that is easy to get wrong. A
    22 Hz filter needs thousands of samples to settle, and DRSKit's files are
    trimmed so tightly that the stroke begins almost at sample zero — there is
    nothing for it to settle on. Filtered without that headroom its hats came
    out at 1.7e-03, nearly ten times the guard and worse than no filter at
    all. Two hundred milliseconds of silence at each end gives the filter
    somewhere to start and stop, and is thrown away afterwards.
    """
    if not hz:
        return x
    from scipy.signal import butter, sosfiltfilt
    sos = butter(2, hz, "highpass", fs=rate, output="sos")
    n = x.shape[0]
    if n < 64:
        return x
    pad = int(rate * 0.2)
    z = np.zeros((pad, x.shape[1]), dtype=np.float64)
    y = sosfiltfilt(sos, np.vstack((z, x, z)), axis=0, padlen=0)
    return y[pad:pad + n]


def trim_and_fade(x, rate, cap_s, floor_db=-60.0, fade_in_ms=1.0, fade_out_ms=30.0,
                  pre_roll_ms=2.0):
    """Cut to the hit, cap the tail, and land both ends on zero.

    The floor is relative to this stroke's own peak, not absolute: the soft
    layers of these libraries sit 40 dB under the hard ones, and an absolute
    -60 dBFS gate would trim a ghost note away entirely.

    AND IT IS ALSO RELATIVE TO THE ROOM. A soft stroke never gets 60 dB down,
    because 50 dB down is where the room it was recorded in lives; the tail
    search then finds nothing and runs to the cap, which is how Club's ghost
    snares first came out as a 1.0 s file with 400 ms of room hiss on the end
    — four times the size and a ghost note that hangs over the backbeat. So
    the threshold is whichever is higher: 60 dB under the hit, or 6 dB over
    the noise the room was already making before the stick landed.
    """
    mono = np.abs(x).max(axis=1)
    if not len(mono) or mono.max() <= 0:
        return x[:0]
    rel = mono.max() * (10.0 ** (floor_db / 20.0))

    above = np.nonzero(mono > rel)[0]
    if not len(above):
        return x[:0]
    onset = above[0]
    start = max(0, onset - int(rate * pre_roll_ms / 1000.0))

    # The room, measured before the hit arrives. When the take starts on the
    # stroke there is nothing to measure, so fall back to the relative floor.
    head = mono[:max(onset - int(rate * 0.003), 0)]
    room = float(np.sqrt(np.mean(head ** 2))) * 2.0 if len(head) > 64 else 0.0
    thresh = max(rel, room)

    env = envelope(mono, rate, ms=8.0)
    end = onset + 1
    loud = np.nonzero(env[onset:] > thresh)[0]
    if len(loud):
        end = onset + loud[-1] + 1
    end = min(end, start + int(rate * cap_s))
    end = min(end, len(x))
    if end <= start:
        return x[:0]

    y = np.array(x[start:end], dtype=np.float64)

    # The fades, and the window they describe, kept so the offset below can be
    # taken out without undoing them.
    win = np.ones(len(y))
    fi = min(int(rate * fade_in_ms / 1000.0), len(y) // 4)
    if fi > 1:
        win[:fi] = 0.5 - 0.5 * np.cos(np.linspace(0.0, math.pi, fi))
    fo = min(int(rate * fade_out_ms / 1000.0), len(y) // 2)
    if fo > 1:
        win[-fo:] = 0.5 + 0.5 * np.cos(np.linspace(0.0, math.pi, fo))
    y *= win[:, None]

    # A struck drum is not a symmetric waveform. The beater pushes the head one
    # way and the head comes back more slowly than it went, so a real recording
    # of one has a small non-zero mean over any window you cut — and it is NOT
    # low-frequency content that a high-pass can take out. Measured on DRSKit's
    # kick: -7.3e-04 unfiltered, -6.6e-04 through 22 Hz, and WORSE at 35, 50 and
    # 70 Hz, because by then the filter's own transient is adding more than the
    # rumble it removes. Peak normalisation then multiplies whatever is left,
    # which is why it shows up worst on the softest layers.
    #
    # So take it off directly — but shaped by the fade window rather than as a
    # flat constant. A flat subtraction is what `KITS.md` warns about: it lifts
    # a tail that had landed on zero back off the axis and the 30 ms fade then
    # windows away a step. Weighted by the window, the correction is zero
    # exactly where the file has to be zero.
    s = float(np.sum(win))
    if s > 0:
        y -= (y.mean(axis=0) * len(y) / s) * win[:, None]
        y *= win[:, None]

    y[0] = 0.0
    y[-1] = 0.0
    return y


def write_wav(path, x, rate, rng):
    """Peak-normalise to 0.900, dither, quantise, force the ends to zero.

    TPDF dither at one LSB. Without it the fade tail quantises to a staircase
    and the staircase is periodic, which is audible on a long cymbal decay as
    a faint buzz riding the release.
    """
    pk = peak_of(x)
    if pk <= 0:
        raise SystemExit("silent buffer for %s" % path)
    y = x * (PEAK_I16 / pk)
    d = rng.random(y.shape) + rng.random(y.shape) - 1.0
    q = np.rint(y + d).astype(np.int64)
    np.clip(q, -PEAK_I16, PEAK_I16, out=q)
    q[0] = 0
    q[-1] = 0
    # Quantisation can leave the loudest sample one LSB short of the target;
    # nudge it back so the peak reads as 0.900 rather than 0.8999.
    m = int(np.max(np.abs(q)))
    if 0 < m < PEAK_I16:
        i = np.unravel_index(int(np.argmax(np.abs(q))), q.shape)
        q[i] = PEAK_I16 if q[i] > 0 else -PEAK_I16
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, q.astype(np.int16), rate, subtype="PCM_16")
    return os.path.getsize(path)


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------

def resolve_root(spec, override=None):
    """Where the source library lives on this machine.

    The recipes say `${YAMES_SAMPLES}/...` rather than a path, because the
    libraries are gigabytes that live outside the repository and every machine
    puts them somewhere different. Unset, that is a clear error and not a
    mysterious "no such articulation" three functions later.
    """
    if override:
        root = os.path.abspath(os.path.expanduser(override))
    else:
        root = os.path.expandvars(os.path.expanduser(spec))
        if "${" in root or (os.name == "nt" and "%" in root):
            raise SystemExit(
                "the recipe wants %s and that variable is not set.\n"
                "The sample libraries are not in the repository: point the tool at\n"
                "the folder that holds them, either\n"
                "    set YAMES_SAMPLES=C:\\path\\to\\_samples\n"
                "or pass --source-root <the library's own folder>.\n"
                "See src-tauri/sounds/KITS.md for what to download." % spec
            )
    if not os.path.isdir(root):
        raise SystemExit(
            "source library not found: %s\n"
            "Nothing from it is in the repository — only the rendered kit is.\n"
            "See src-tauri/sounds/KITS.md." % root
        )
    return root


def render(recipe, outdir):
    src_cfg = recipe["source"]
    cls = SOURCES.get(src_cfg["format"])
    if cls is None:
        raise SystemExit("unknown source format %r" % src_cfg["format"])
    root = resolve_root(src_cfg["root"], recipe.get("_root_override"))
    source = cls(root, src_cfg)

    which = recipe.get("set", "kit")
    if which not in SETS:
        raise SystemExit("unknown set %r — the contract has %s"
                         % (which, " and ".join(sorted(SETS))))
    set_voices = SETS[which]["voices"]
    max_seconds = SETS[which]["max_seconds"]

    rate = recipe.get("rate", RATE)
    swap = bool(recipe.get("swap_stereo", False))
    step_db = float(recipe.get("layer_step_db", 4.5))
    seed = int(recipe.get("seed", 1743))
    rng = np.random.default_rng(seed)

    rows = []
    notes = []
    rendered = {}
    manifest_voices = collections.OrderedDict()

    for name in recipe["voices"]:
        if name not in set_voices:
            raise SystemExit(
                "%r is not one of the %s set's voices: %s"
                % (name, which, ", ".join(set_voices)))

    for voice in set_voices:
        cfg = recipe["voices"].get(voice)
        if cfg is None:
            notes.append("%s: not in the recipe, so not in the kit" % voice)
            continue
        mics = [m for m, w in cfg["mix"].items() if w]
        if not mics:
            raise SystemExit("%s: every mic weight is zero" % voice)
        mics.sort(key=lambda m: -abs(cfg["mix"][m]))

        combine, parts = voice_parts(cfg, voice)
        art = " + ".join(nm for nm, _, _ in parts)
        rr_source = "source"
        per_part = []
        for name, nlayers, nrr in parts:
            takes = source.takes(name, mics)
            if not takes:
                raise SystemExit("%s: no samples for articulation %r" % (voice, name))
            for mic, n in sorted(takes.missing.items()):
                notes.append("%s: %s has no %s mic for %d of its strokes"
                             % (voice, name, mic, n))
            measure_takes(source, takes, mics[0], rate)
            label = name if len(parts) > 1 else voice
            if cfg.get("layers_from_rr") and rank_rr_as_dynamics(takes):
                notes.append("%s: %s is sampled at one dynamic, so its %d round "
                             "robins are ranked by loudness and stand in for its "
                             "layers" % (voice, name, len(takes)))
            groups, all_keys, by_key, loud, note = pick_layers(
                takes, nlayers, float(cfg.get("layer_step_db", step_db)), label
            )
            if note:
                notes.append("%s: %s" % (label, note))
            anchors = set(g[0].vel for g in groups)
            used_files = set()
            picked = []
            for group in groups:
                got, how = pick_rr(group, nrr, all_keys, by_key, anchors, used_files)
                if how == "neighbours":
                    rr_source = "neighbours"
                picked.append(got)
            per_part.append(picked)

        if combine == "layers":
            layers = [p for part in per_part for p in part]
        else:
            # Every articulation is a round robin of the same layer, so the
            # layer count is what the thinnest of them could supply.
            depth = min(len(p) for p in per_part)
            if any(len(p) != depth for p in per_part):
                notes.append("%s: its articulations reached %s layers, so the "
                             "voice has %d" % (voice,
                                               "/".join(str(len(p)) for p in per_part),
                                               depth))
            layers = [[t for part in per_part for t in part[li]]
                      for li in range(depth)]

        written = []
        cap = float(cfg.get("cap_s", 1.0))
        # `pan` is a manifest field and is NOT baked into the files. Where a
        # voice is placed is the engine's business and the owner's — it is one
        # number to argue with in `kit.json`, not a re-render — and a file that
        # arrived panned could never be moved back to the middle. A mono mic is
        # therefore written centred, and a stereo pair keeps the image the room
        # gave it; the manifest's pan places whatever that adds up to.
        pan = float(cfg.get("pan", 0.0))
        longest = 0.0
        total = 0
        lag_seen = {}
        flips = set()
        for li, picks in enumerate(layers, start=1):
            for ri, take in enumerate(picks, start=1):
                got = render_take(take, cfg["mix"], 0.0, swap, rate,
                                  cfg.get("align_to"),
                                  tuple(cfg.get("flip_if_opposed",
                                                recipe.get("flip_if_opposed", ()))))
                if got is None:
                    continue
                mixed, lags, flipped = got
                lag_seen.update(lags)
                flips.update(flipped)
                mixed = dc_block(mixed, rate,
                                 float(cfg.get("dc_block_hz",
                                               recipe.get("dc_block_hz", 22.0))))
                y = trim_and_fade(
                    mixed, rate, cap,
                    floor_db=float(cfg.get("floor_db", recipe.get("floor_db", -60.0))),
                    fade_in_ms=float(recipe.get("fade_in_ms", 1.0)),
                    fade_out_ms=float(cfg.get("fade_out_ms",
                                              recipe.get("fade_out_ms", 30.0))),
                )
                if not len(y):
                    raise SystemExit("%s layer %d rr %d came out empty" % (voice, li, ri))
                secs = len(y) / float(rate)
                if secs > max_seconds + 1e-9:
                    raise SystemExit(
                        "%s.%d.%d is %.3f s, over the %.1f s the %s contract allows"
                        % (voice, li, ri, secs, max_seconds, which)
                    )
                longest = max(longest, secs)
                path = os.path.join(outdir, "%s.%d.%d.wav" % (voice, li, ri))
                total += write_wav(path, y, rate, rng)
                written.append((li, ri))

        n_layers = len(layers)
        n_rr = max(r for _, r in written)
        rendered[voice] = n_layers
        rows.append({
            "voice": voice, "articulation": art,
            "layers": n_layers, "rr": n_rr,
            "longest": longest, "bytes": total,
            "rr_source": rr_source, "pan": pan,
            "spread": [picks[0].rms for picks in layers],
            "lag_ms": {m: 1000.0 * l / rate for m, l in sorted(lag_seen.items())},
        })
        manifest_voices[voice] = collections.OrderedDict(
            (("layers", n_layers), ("rr", n_rr), ("trim_db", 0.0))
        )
        if pan:
            manifest_voices[voice]["pan"] = round(pan, 2)
        if cfg.get("choked_by"):
            manifest_voices[voice]["choked_by"] = list(cfg["choked_by"])
        if flips:
            notes.append("%s: %s came in with opposite polarity and was inverted"
                         % (voice, ", ".join(sorted(flips))))
        _log("  %-10s %-24s layers %d  rr %d (%s)  longest %.2f s  %6.1f KB"
             % (voice, art, n_layers, n_rr, rr_source, longest, total / 1024.0))

    trims = compute_trims(recipe, outdir, rendered)
    trims = enforce_pulse(recipe, outdir, trims, rendered, notes)
    for voice, t in trims.items():
        if voice in manifest_voices:
            manifest_voices[voice]["trim_db"] = round(t, 1)

    manifest = collections.OrderedDict((
        ("id", recipe["id"]),
        ("name", recipe["name"]),
        ("credit", recipe["credit"]),
        ("licence", recipe["licence"]),
        ("rate", rate),
        ("channels", CHANNELS),
        ("voices", manifest_voices),
    ))
    # ensure_ascii leaves the em-dash in the credit as an escape rather than as
    # bytes, so the manifest is pure ASCII and cannot be mangled by whatever
    # encoding the next tool to open it happens to assume.
    with open(os.path.join(outdir, "kit.json"), "w", newline="\n", encoding="ascii") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    return rows, trims, notes


def compute_trims(recipe, outdir, layer_counts):
    """`trim_db` per voice, so the kit sits in the balance the recipe asks for.

    MEASURED OFF THE WRITTEN FILES, not off the buffers on the way to them.
    The buffers still carry the source library's own recording levels — this
    library cut its hi-hats 40 dB under its crashes — and deriving a balance
    from those describes the session, not the kit. Peak normalisation is the
    step that makes the voices comparable at all, so the measurement has to
    happen after it, on the bytes that ship.

    The layer measured for each voice is the one the engine reaches for on an
    accent — level 3, clamped to what the voice has — so the comparison is
    between the hits that actually play against each other.

    Clamped at 0: every file leaves here at peak 0.900, so a positive trim is
    a request to exceed the ceiling the whole kit was normalised to. When a
    voice measures quieter than its target, the honest answer is that it is as
    loud as it gets, not that the engine should push it into the saturator.

    A KIT IS MEASURED AGAINST ITS OWN SNARE; A PERCUSSION SET HAS NONE. It is
    played under whichever drum kit is loaded, so the thing it has to sit
    against is not in the folder — and a set balanced against its own loudest
    voice would be internally tidy and, next to a drummer, either inaudible or
    all you can hear. `balance_ref` names the file outside the folder that the
    balance is measured from:

        "balance_ref": {"folder": "kits/club", "voice": "snare", "layer": 3}

    which is the same snare accent every kit voice is already measured against,
    so the numbers in `balance` mean the same thing in both places.
    """
    balance = recipe.get("balance", {})
    window = float(recipe.get("balance_window_s", 0.4))
    loud = {}
    for voice, layers in layer_counts.items():
        li = min(3, layers)
        path = os.path.join(outdir, "%s.%d.1.wav" % (voice, li))
        x, sr = sf.read(path, always_2d=True, dtype="float64")
        loud[voice] = k_energy(x.mean(axis=1), sr, window)

    ref = loud.get("snare")
    if ref is None:
        spec = recipe.get("balance_ref")
        if not spec:
            return {v: 0.0 for v in loud}
        path = os.path.join(ROOT, "src-tauri", "sounds", spec["folder"],
                            "%s.%d.1.wav" % (spec["voice"], int(spec.get("layer", 3))))
        if not os.path.isfile(path):
            raise SystemExit(
                "the balance is measured against %s and it is not there.\n"
                "Render that kit first — the percussion set is levelled against\n"
                "the drums it plays under, not against itself." % path)
        x, sr = sf.read(path, always_2d=True, dtype="float64")
        ref = k_energy(x.mean(axis=1), sr, window)

    out = {}
    for voice, l in loud.items():
        want = float(balance.get(voice, 0.0))
        have = 10.0 * math.log10(max(l, 1e-30) / max(ref, 1e-30))
        out[voice] = max(-24.0, min(0.0, want - have))
    return out


def enforce_pulse(recipe, outdir, trims, layer_counts, notes):
    """Make sure the kick still beats the hat on a laptop speaker.

    The balance above is a perceptual one and it is right about what the kit
    sounds like on headphones. It is not sufficient, because this app is a
    metronome before it is anything else and the owner practises on a laptop.
    A jazz kick balanced by ear against bright hi-hats lands 2-4 dB UNDER them
    through the 200 Hz-4 kHz window a laptop speaker radiates, and a pulse you
    cannot feel is the whole complaint that started this pass.

    So: measure what the trims actually produce through the engine's own
    band-pass, and if the kick does not clear the hat by `min_kick_over_hat_db`,
    close the gap from both ends — half by letting the kick up, half by taking
    the hat down — which is what an engineer does when told "I cannot hear the
    kick on my laptop". Both stay at or under 0 dB, so nothing is pushed past
    the ceiling the files were normalised to. The amount is reported, because
    it is a departure from the balance the recipe asked for and the owner
    should see it rather than discover it.
    """
    floor = float(recipe.get("min_kick_over_hat_db", 2.5))
    if "kick" not in layer_counts or "hat" not in layer_counts:
        return trims
    bands = {}
    for voice in ("kick", "hat"):
        li = min(3, layer_counts[voice])
        x, sr = sf.read(os.path.join(outdir, "%s.%d.1.wav" % (voice, li)),
                        always_2d=True, dtype="float64")
        bands[voice] = band_energy(x.mean(axis=1), sr)
    have = (10.0 * math.log10(max(bands["kick"], 1e-30) / max(bands["hat"], 1e-30))
            + trims["kick"] - trims["hat"])
    if have >= floor:
        notes.append("kick clears the hat by %+.2f dB on a small speaker, untouched" % have)
        return trims
    need = floor - have
    up = min(need / 2.0, -trims["kick"])
    down = need - up
    trims["kick"] += up
    trims["hat"] -= down
    notes.append(
        "the balance left the kick %+.2f dB against the hat through the "
        "small-speaker band-pass, under the %.1f dB the pulse needs; "
        "kick +%.1f dB and hat -%.1f dB to close it"
        % (have, floor, up, down)
    )
    return trims


def main():
    ap = argparse.ArgumentParser(
        description="Render a recorded drum library into one of the app's kit folders."
    )
    ap.add_argument("recipe")
    ap.add_argument("outdir")
    ap.add_argument("--source-root", default=None,
                    help="the library's own folder, overriding the recipe's ${YAMES_SAMPLES} path")
    args = ap.parse_args()

    # Explicit utf-8: the recipes carry em-dashes in their credit lines and the
    # default encoding on Windows is cp1252, which turns one into three bytes
    # of nonsense and puts that nonsense in the manifest the app credits people
    # with.
    with open(args.recipe, encoding="utf-8") as fh:
        recipe = json.load(fh)
    recipe["_root_override"] = args.source_root
    outdir = os.path.abspath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    _log("=== %s (%s) ===" % (recipe["name"], recipe["id"]))
    rows, trims, notes = render(recipe, outdir)

    total = sum(r["bytes"] for r in rows)
    _log()
    _log("| voice | articulation | layers | rr | rr from | longest | trim_db | pan | size |")
    _log("|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        _log("| `%s` | `%s` | %d | %d | %s | %.2f s | %+.1f dB | %s | %.0f KB |"
             % (r["voice"], r["articulation"], r["layers"], r["rr"], r["rr_source"],
                r["longest"], trims.get(r["voice"], 0.0),
                "%+.2f" % r["pan"] if r["pan"] else "0", r["bytes"] / 1024.0))
    nfiles = sum(r["layers"] * r["rr"] for r in rows)
    _log()
    _log("%d files, %.2f MB" % (nfiles, total / 1048576.0))
    if notes:
        _log()
        _log("notes:")
        for n in notes:
            _log("  " + n)


if __name__ == "__main__":
    main()
