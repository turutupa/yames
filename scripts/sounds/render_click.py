"""Render the metronome's RECORDED click presets from the sample libraries.

The generator of record for `wood_*`, `snare_*`, `sticks_*`, `cowbell_*` and
`kit_*` under `src-tauri/sounds/` — THREE strokes each since 2026-09-15, not
two. `rebuild.py` still owns the synthesised five — click, beep, drum and the
chimes — and says so in its own header, including the two middle strokes
(`click_mid`, `beep_mid`) that belong to it for the same reason its siblings
do.

    python scripts/sounds/render_click.py            # all fifteen
    python scripts/sounds/render_click.py wood_high  # one
    python scripts/sounds/render_click.py --measure  # numbers, write nothing

It shares `render_kit.py`'s mic matching, alignment, DC blocking, trimming and
dithered quantisation, because a click cut from these libraries has exactly
the same problems a kit voice does and they were already solved once. What is
different is the shape of the output and is the whole of this file: a click is
ONE mono file at 44 100 Hz, with no round robins, no velocity layers and no
drift. A metronome is a machine.

---------------------------------------------------------------------------
WHY A RECORDING AT ALL
---------------------------------------------------------------------------
Wood and Snare were synthesised, and Snare in particular had been rejected
three times (see `rebuild.py`, points 4 and 5). The libraries are on the
machine and are CC0, so the owner asked for the recorded versions of both
under the same ids, plus Sticks and Cowbell, plus Kit as a recorded
alternative to Drum that can be compared with it by ear.

---------------------------------------------------------------------------
THE ONE THING THAT WAS NOT OBVIOUS: A HARD STROKE IS QUIETER
---------------------------------------------------------------------------
Every layer of a shipped kit is peak-normalised to 0.900 (rule 4 of
`KITS.md`), so at the peak a click file is allowed the layers are NOT ordered
by loudness. Measured K-weighted on Studio's snare, folded to mono and
normalised to 0.97:

    layer 1 (ghost)  263      layer 3          177
    layer 2          330      layer 4 (hard)   164

The hardest stroke is the QUIETEST of the four, by 3.0 dB against layer 2,
because a hard stroke is mostly stick transient and a transient sets the peak
without carrying loudness. That is the same currency problem `rebuild.py`
names in point 3a, arriving from the other direction.

Taken literally — hardest layer at 0.97 over softest layer at 0.90 — the
Snare preset measures 0.98 dB QUIETER than the drum kit over a bar, which is
`the_snare_kit_is_not_quieter_than_the_drum_kit` failing and is the shy kit
shipping for a fourth time.

So every recorded accent goes through THE SAME TANH STAGE the drum accent
already uses in `SoundBank::new`, and some beats go through a gentler one.
It holds the ceiling while keeping the loudness, and the harmonics it folds
out land at 100-300 Hz where a laptop speaker starts working. `drive` below
is per file and is set by how much crest the stroke has: 1.5 on a rimshot,
0.8 on a ghost, nothing at all on a woodblock that is already a transient and
nothing else.

AT RENDER AND NOT AT BANK BUILD, deliberately. `drum_accent` saturates in
`SoundBank::new` because it SUMS three shipped files whose relative gains are
the engine's decision and can be retuned without a re-render. These ship as
finished single files, so there is nothing left for the engine to decide: the
file is what you hear, its peak is guaranteed here like every other click
file's, and `SoundBank::new` gains no second premix to go wrong.

---------------------------------------------------------------------------
THE MIDDLE STROKE, AND WHY IT IS NOT A QUIETER DOWNBEAT
---------------------------------------------------------------------------
A bar of 6/8 has a beat one and a beat four, and until 2026-09-15 the engine
marked the second of them with the accent file at 80 % (`MEDIUM_GAIN`). The
owner listened and heard nothing, and was right: the same transient 2 dB down
is under the ear's threshold when it passes once a bar. A real metronome uses
three SOUNDS, because pitch and timbre are what the ear separates.

So every preset ships a third file, `<kit>_mid.wav`, at `MID_PEAK` — a
stroke of the same instrument, between the other two in weight and different
from both in colour. `MEDIUM_GAIN` is 1.0 now: the level lives in the file.

AND THAT IS HARDER THAN IT SOUNDS, for exactly the reason the section above
gives. At a fixed peak a SOFTER stroke is LOUDER — its peak is not spent on a
stick transient — so a softer layer normalised to 0.930 lands within half a
decibel of a harder one at 0.970, and sometimes over it. Cowbell is the
extreme: 26 dB of library dynamic between v1 and v3 collapses to +1.3 dB in
favour of the SOFT stroke once both are peak-normalised. Nothing about the
peak convention produces a ladder; the ladder has to be built here, per file,
out of the four knobs this table already has:

    layer    which dynamic of the instrument
    drive    the tanh stage — the loudness-at-fixed-peak knob, and the only
             one that pushes UP. Its floor is 0.0, so it cannot pull down.
    mix      a darker, more distant blend radiates less through 200 Hz-4 kHz
             (cowbell's middle is the only place this is used as a level)
    floor    where the trim cuts — a shorter stroke carries less energy
             (wood's middle is the only place this is used as a level, and
             it is the one-mic instrument, so it has no `mix` to spend)

Each middle is placed at the GEOMETRIC CENTRE of its own kit's span — equal
margins in dB to the downbeat above and to the plain beat below — because
with three genuinely different sounds there is no longer a reason to bias one
gap over the other. W3's reason for biasing (strong against medium was one
file at two volumes and had only level to go on) stopped being true when the
third file arrived. `every_medium_accent_sits_between_its_strong_and_its_beat`
in `engine.rs` prints the result and holds it to a floor.

---------------------------------------------------------------------------
WHAT THE LIBRARIES DID NOT HAVE
---------------------------------------------------------------------------
1. Virtuosity's woodblock is ONE MIC. `Samples/perc/oh/woodblock/` exists and
   `close/`, `mid/` and `room/` do not — the same is true of its cuica and
   its timbales, and of nothing else in that folder. So Wood is an overhead
   and no proximity, where Cowbell out of the same library is a four-mic mix.
   It costs a click nothing: a click is mono anyway and a woodblock has no
   body for a close mic to find.

2. Studio's softest snare is a GHOST, not a quiet backbeat. It is the right
   file by the brief's words and the wrong one by measurement — see above —
   so it is kept as the beat (it is the same drum played softly, which is
   what this kit has to be) and lifted by the tanh stage instead of swapped
   for a louder layer.

3. `snare_stickshot2` was not used. It is the same articulation sampled
   sixteen ways instead of eight and every one of them is 15 to 25 dB
   quieter; `stickshot1` is the shot a drummer would count off with.

Sources: Virtuosity Drums (Versilian Studios / Karoryfer, CC0) and DRSKit via
the already-rendered Studio kit (DrumGizmo, CC BY 4.0). Nothing from either
library is in the repository; see `src-tauri/sounds/KITS.md`.
"""

import argparse
import os
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_kit as rk  # noqa: E402

# ---------------------------------------------------------------------------
# The contract. A click is not a kit voice and these are the differences.
# ---------------------------------------------------------------------------

RATE = 44100
"""What the click files have always been, and what `decode_wav` resamples from
to whatever the output device runs at. Not the kits' 48 000: these ten sit
beside `click_*` and `beep_*`, which are 44 100, and a metronome that shipped
two rates would resample one of them for no reason."""

ACCENT_PEAK = 0.97
"""What `drum_accent` is limited to, so an accent cannot clip before the
user's volume does."""

BEAT_PEAK = 0.90
"""And the plain beat, which is the kits' own ceiling."""

MID_PEAK = 0.93
"""And the middle stroke, between the two. A peak in the file and not a gain
in the engine: `MEDIUM_GAIN` is 1.0, so what a bar's middle sounds like is
decided here, where it can be measured against the same filters the Rust
tests use, and not by a constant that has no idea which kit is loaded."""

PEAK_I16 = {ACCENT_PEAK: 31784, BEAT_PEAK: 29490, MID_PEAK: 30473}

OUT_DIR = os.path.join("src-tauri", "sounds")

# The three ways into the libraries. `mic_tag` is the percussion's habit of
# writing the mic at the end of the file name as a word; see `SfzSource`.
PERC_SRC = {"programs": "Programs", "mappings": "mappings/perc",
            "mic_tag": {"oh": "Overhead", "close": "Close",
                        "mid": "Mid", "room": "Far"}}
DRUM_SRC = {"programs": "Programs", "mappings": "mappings"}

# The mic mixes, taken from the recipes that already balanced these libraries:
# `perc-club.json` for the percussion (overheads lead, close follows — a
# percussionist is heard in the room) and `club.json` for the snare.
PERC_MIX = {"oh": 1.0, "close": 0.45, "mid": 0.35, "room": 0.3}
WOOD_MIX = {"oh": 1.0}          # and there is no other mic — see the header
SNARE_MIX = {"snaremic": 1.0, "oh": 0.6, "room": 0.3}

# And one blend that is not a balance but a LEVEL. The cowbell's middle stroke
# is the same hard stroke as its downbeat heard from across the room: the close
# and mid mics dropped and the room brought up to meet the overhead, from the
# 0.3 that balances a percussionist to 1.0. See `cowbell_mid`.
COWBELL_MID_MIX = {"oh": 1.0, "room": 1.0}

STUDIO = os.path.join("src-tauri", "sounds", "kits", "studio")

# `write_wav`'s dither needs a generator, and a generator needs a seed, or the
# files change on every run and the repository fills with noise diffs.
SEED = 3853


# ---------------------------------------------------------------------------
# The recipe
# ---------------------------------------------------------------------------
#
# Every entry is one output file:
#
#   src      where the stroke comes from — see `_stroke` for the three forms
#   peak     ACCENT_PEAK or BEAT_PEAK
#   drive    the tanh stage's drive, 0.0 for none. See the header.
#   cap_s    the longest this file may run; the trim usually stops first
#   floor    the trim's floor in dB under this stroke's own peak
#   fade     the fade-out in ms
#   why      what it is, for the report and for whoever changes it next

RECIPE = [
    # -- Wood. Two different blocks and not one block at two dynamics, which
    # is what the synthesised pair was and what the pitch drop is for.
    #
    # THE DRIVE IS ON THE BEAT HERE, which is the opposite of everywhere else
    # in this table and is the price of the accent being a different
    # instrument. The small block is simply brighter than the big one — bare,
    # the pair measures +5.60 dB apart, a full decibel wider than the loudest
    # kit the app already ships. That is not an accent, it is a shout, and
    # `every_accent_is_louder_than_its_beat_on_a_small_speaker` says so at
    # length. Nothing is wrong with the accent, so the low block is brought up
    # to meet it: 0.8 lands the pair at +4.19 dB, beside click and snare.
    #
    # -40 dB and not -60. This is the one-mic instrument, so what sits under
    # the block is the room and not another mic's floor: at -60 the trim runs
    # 756 ms and ships two thirds of a second of a hall, at -40 it ships the
    # 250 ms the block is actually audible for.
    dict(name="wood_high", src=("perc", "woodblock_high", 6, WOOD_MIX, ["oh"]),
         peak=ACCENT_PEAK, drive=0.0, cap_s=0.25, floor=-40.0, fade=12.0,
         why="Virtuosity woodblock_high, hardest dynamic"),
    dict(name="wood_low", src=("perc", "woodblock_low", 6, WOOD_MIX, ["oh"]),
         peak=BEAT_PEAK, drive=0.8, cap_s=0.25, floor=-40.0, fade=12.0,
         why="Virtuosity woodblock_low, hardest dynamic"),

    # -- Snare. The Studio kit's own snare, folded to mono. The hardest layer
    # on the accent and the softest on the beat, which is this kit's whole
    # idea — the same drum struck harder, never a second instrument (see
    # `SoundKit::Snare`) — held up by the tanh stage rather than by swapping
    # the ghost for something louder. Round robin 1 of each, always: picking
    # the round robin that measured best would be tuning to a coin toss.
    dict(name="snare_high", src=("studio", ["snare.4.1.wav"]),
         peak=ACCENT_PEAK, drive=1.5, cap_s=0.6, floor=None, fade=30.0,
         why="Studio snare layer 4 (hardest), mono fold"),
    dict(name="snare_low", src=("studio", ["snare.1.1.wav"]),
         peak=BEAT_PEAK, drive=0.8, cap_s=0.6, floor=None, fade=30.0,
         why="Studio snare layer 1 (softest), mono fold"),

    # -- Sticks. A rimshot off the stick and a cross-stick, which is a
    # drummer counting a band in and is why this preset and the jam's
    # count-in are now the same two files.
    #
    # BOTH DRIVEN, AND EQUALLY. Two sticks and a rim is the quietest thing
    # anybody would choose to be counted in by: bare, a bar of it measures
    # 5.3 dB under the drum kit, and it is the one preset that plays before a
    # band rather than alone. Driving both at 1.0 leaves the accent exactly
    # where it was against its own beat (+4.18 dB, because the ratio does not
    # care what both ends were multiplied by) and lifts the whole preset by
    # 1.8 dB, which is the number that mattered.
    dict(name="sticks_high", src=("drums", "snare_stickshot1", 6, SNARE_MIX,
                                  ["snaremic", "oh", "room"]),
         peak=ACCENT_PEAK, drive=1.0, cap_s=0.30, floor=-45.0, fade=25.0,
         why="Virtuosity snare_stickshot1"),
    dict(name="sticks_low", src=("drums", "snare_crossstick", 14, SNARE_MIX,
                                 ["snaremic", "oh", "room"]),
         peak=BEAT_PEAK, drive=1.0, cap_s=0.30, floor=-45.0, fade=25.0,
         why="Virtuosity snare_crossstick"),

    # -- Cowbell. Three dynamics in the library; the hardest and the middle
    # one. The softest is 26 dB under the hardest and is a fingertip on the
    # lip of the bell — normalised to 0.90 it is a tick with a room behind
    # it, and it measures 2.76 dB against its own accent, which is inside the
    # 2 dB floor's noise.
    dict(name="cowbell_high", src=("perc", "cowbell", 3, PERC_MIX,
                                   ["oh", "close", "mid", "room"]),
         peak=ACCENT_PEAK, drive=0.0, cap_s=0.45, floor=-50.0, fade=30.0,
         why="Virtuosity cowbell, hard layer"),
    dict(name="cowbell_low", src=("perc", "cowbell", 2, PERC_MIX,
                                  ["oh", "close", "mid", "room"]),
         peak=BEAT_PEAK, drive=0.0, cap_s=0.45, floor=-50.0, fade=30.0,
         why="Virtuosity cowbell, middle layer"),

    # -- Kit. The recorded answer to Drum, so it is built the way Drum is: a
    # kick under a struck head for the accent and a closed hat for the beat.
    #
    # The kick sits at 0.70 under the snare for the reason `SoundBank::new`
    # gives for the same number — it carries almost all of its energy below
    # 120 Hz, so at 1.0 it sets a ceiling the audible layer cannot be heard
    # through. Measured here, 1.0 costs the mix 0.05 dB of accent on a laptop
    # and buys nothing.
    #
    # Layer 1 of the hat, not layer 4. The soft closed hat is the quiet tick
    # between downbeats a metronome wants; layer 4 is a drummer leaning on
    # the hat and measures 1.1 dB louder in band, which eats the accent.
    #
    # This is the one accent here that is a SUM, so the tanh stage is doing
    # the job it does in `SoundBank::new` — two strokes summed peak above full
    # scale and something has to hold the ceiling. Drive 1.2 rather than the
    # engine's 1.0 because the extra 0.2 is what carries the pair from
    # +3.58 dB to +4.12 and into the middle of the pack.
    dict(name="kit_high", src=("studio", [("kick.4.1.wav", 0.70),
                                          ("snare.4.1.wav", 1.0)]),
         peak=ACCENT_PEAK, drive=1.2, cap_s=0.45, floor=None, fade=30.0,
         why="Studio kick + hardest snare, summed"),
    dict(name="kit_low", src=("studio", ["hat.1.1.wav"]),
         peak=BEAT_PEAK, drive=0.0, cap_s=0.30, floor=None, fade=30.0,
         why="Studio closed hat, softest layer"),

    # -- THE MIDDLE STROKES, and they are APPENDED RATHER THAN INTERLEAVED.
    # `_write` draws its dither from ONE generator in table order, so a row
    # inserted beside its siblings would re-dither every file below it and
    # change the bytes of ten files the app has shipped since 2026-09-14 —
    # which `the_shipped_click_files_are_the_ones_that_were_heard` in
    # `engine.rs` pins by hash, and which the jam's count-in depends on. Kept
    # at the end, a whole run reproduces those ten byte for byte.
    #
    # Read the header's "THE MIDDLE STROKE" section before changing a number
    # here: each of these is placed at the geometric centre of its own kit's
    # span, and the knob that placed it is different in each case because the
    # instruments are.

    # Wood: the SAME small block, struck at vl3 instead of vl6.
    #
    # THE TRIM IS THE LEVEL HERE. The woodblock is Virtuosity's one-mic
    # instrument, so there is no darker blend to spend and no drive below 0.0,
    # and vl3 normalised to 0.930 measures only 0.93 dB under vl6 at 0.970.
    # What is left is where the trim cuts: -22 dB rather than the accent's -40
    # ships the 64 ms the softer block is properly audible for and leaves the
    # hall behind, which is 1.99 dB and lands it in the middle. It is also the
    # truth about a lighter stroke — it excites the room less — so the middle
    # is drier than the downbeat as well as quieter, and drier is the second
    # cue the ear gets.
    dict(name="wood_mid", src=("perc", "woodblock_high", 3, WOOD_MIX, ["oh"]),
         peak=MID_PEAK, drive=0.0, cap_s=0.25, floor=-22.0, fade=12.0,
         why="Virtuosity woodblock_high vl3, trimmed dry"),

    # Snare: the same drum at layer 3, with its own drive.
    #
    # Layer 3 and not layer 2, and the header says why the question is not
    # silly: the layers are not ordered by loudness. Both land in range; 3 is
    # the mezzo-forte stroke between a ghost and a rimshot by the library's
    # own dynamic and by ear-shaped sense, and 1.1 of drive puts it 1.91 dB
    # under the accent and 2.07 dB over the beat. The accent's drive is 1.5
    # and the beat's 0.8, so this sits between those too, which is what a
    # stroke between two strokes should need.
    # Capped at 0.43 and not the pair's 0.6, which is the only number here
    # that is about tidiness: layer 3's file runs 510 ms and layer 4's 429, so
    # left alone the middle of the bar would ring 80 ms longer than the
    # downbeat. The 80 ms it gives up is the bottom of the wire tail and
    # measures 0.00 dB, so nothing is paid for it.
    dict(name="snare_mid", src=("studio", ["snare.3.1.wav"]),
         peak=MID_PEAK, drive=1.1, cap_s=0.43, floor=None, fade=30.0,
         why="Studio snare layer 3, mono fold"),

    # Sticks: the same stick-shot, played at vl3.
    #
    # vl3 rather than the vl4 the brief also allowed: vl4 normalised measures
    # LOUDER than the accent (+0.55 dB at the same drive), which is the
    # hard-stroke-is-quieter trap in one line. vl3 at drive 1.1 lands
    # -2.02/+2.16. The other two files of this preset are both driven at 1.0
    # and this one is at 1.1 for the same reason theirs are equal: the number
    # that mattered was where it put the stroke, not that the three match.
    dict(name="sticks_mid", src=("drums", "snare_stickshot1", 3, SNARE_MIX,
                                 ["snaremic", "oh", "room"]),
         peak=MID_PEAK, drive=1.1, cap_s=0.30, floor=-45.0, fade=25.0,
         why="Virtuosity snare_stickshot1 vl3"),

    # Cowbell: the same hard stroke, heard from the back of the room.
    #
    # THE ONE PRESET WHERE THE DECIDED PLAN DID NOT MEASURE. It was to be v2
    # for the middle and v1 — the fingertip tap — re-cut as the beat. v1 is
    # 26 dB under v3 in the library and is the softest thing in it, and at the
    # beat's 0.900 peak it measures 1.26 dB LOUDER than the accent through the
    # laptop band, because all of its peak is ring and none of it is stick.
    # The three would then have stood at +0.47 dB and +2.30 dB: the downbeat
    # and the middle half a decibel apart, which is the failure this whole
    # pass exists to fix.
    #
    # So the brief's own fallback, with the mic blend as the level: v3, the
    # accent's stroke, with the close and mid mics dropped and the room lifted
    # up to meet the overhead (`COWBELL_MID_MIX`). That is 2.49 dB under the
    # accent and 2.01 over the beat, and it is a real gesture rather than a
    # fader — the same bell, further away, which is what a player's second
    # accent sounds like across a room. At 0.8 of room it measured 2.02/2.47,
    # just as well balanced, and was passed over because at 1.0 the colour
    # moves as far as the level does: the distance the ear has to notice is
    # what this file is FOR, and a blend is the only thing spending it here.
    # `cowbell_low` is NOT re-cut: it stays the v2 the owner has been
    # listening to since 2026-09-14.
    dict(name="cowbell_mid", src=("perc", "cowbell", 3, COWBELL_MID_MIX,
                                  ["oh", "room"]),
         peak=MID_PEAK, drive=0.0, cap_s=0.45, floor=-45.0, fade=30.0,
         why="Virtuosity cowbell, hard layer, distant blend"),

    # Kit: the backbeat. Snare layer 3 and NO KICK.
    #
    # 6/8 on a kit is kick on one, snare on four, hats between, so the middle
    # of the bar is the thing that is missing the kick — and that is a huge
    # difference to hear and a small one to measure, because a band-pass that
    # starts at 200 Hz cannot see a kick at all. Band-limited this stands only
    # 0.83 dB under its downbeat; K-weighted, which does hear the kick, it
    # stands 1.73 dB under. Both orderings are right and the gap between them
    # IS the middle stroke. No drive: at 0.0 it is already as far under the
    # accent as this pair of filters will allow.
    dict(name="kit_mid", src=("studio", ["snare.3.1.wav"]),
         peak=MID_PEAK, drive=0.0, cap_s=0.45, floor=None, fade=30.0,
         why="Studio snare layer 3 alone, no kick"),
]


# ---------------------------------------------------------------------------
# Getting one stroke out of a library
# ---------------------------------------------------------------------------

_SOURCES = {}


def _source(kind, root):
    if kind not in _SOURCES:
        _SOURCES[kind] = rk.SfzSource(root, PERC_SRC if kind == "perc" else DRUM_SRC)
    return _SOURCES[kind]


def _sfz_mono(kind, root, articulation, vel, mix, mics, rate):
    """One dynamic of one articulation, mixed across its mics and folded flat.

    The dynamic may hold several round robins and a click has none, so one of
    them has to be chosen. The MEDIAN by loudness, not the loudest and not the
    first: the loudest is the take that got away from the player and the first
    is whichever the library happened to write down first. Ranking is what
    `measure_takes` is already for.
    """
    src = _source(kind, root)
    takes = src.takes(articulation, mics)
    rk.measure_takes(src, takes, mics[0], rate)
    band = [t for t in takes if t.vel == vel]
    if not band:
        raise SystemExit("%s has no dynamic %s (it has %s)"
                         % (articulation, vel, sorted({t.vel for t in takes})))
    band.sort(key=lambda t: t.rms)
    take = band[len(band) // 2]
    rendered = rk.render_take(take, mix, 0.0, False, rate)
    if rendered is None:
        raise SystemExit("no mic of %s survived the mix" % articulation)
    acc, _, _ = rendered
    # Pan 0.0 put a mono source at -3 dB in both channels and left a stereo
    # one as it was recorded; the mean is the mono fold of either.
    return acc.mean(axis=1)[:, None], os.path.basename(take.files[mics[0]])


def _studio_mono(parts, rate):
    """One or more already-rendered Studio files, summed and folded to mono.

    These have been through `render_kit.py` once already — DC blocked, trimmed
    to their own tail and faded onto zero — so they are NOT trimmed again
    here. Re-trimming a file whose tail has already been landed can only cut
    it shorter, and a snare's wire tail is where its loudness lives
    (`rebuild.py`, point 4b).
    """
    out = None
    names = []
    for part in parts:
        name, gain = part if isinstance(part, tuple) else (part, 1.0)
        names.append(name)
        x, sr = sf.read(os.path.join(STUDIO, name), always_2d=True, dtype="float64")
        y = rk.resample_to(x.mean(axis=1)[:, None], sr, rate) * gain
        if out is None:
            out = y
        elif len(y) > len(out):
            y[:len(out)] += out
            out = y
        else:
            out[:len(y)] += y
    return out, "+".join(names)


def _stroke(entry, root, rate):
    """The mono buffer this entry names, before the shaping and the peak.

    Three forms, because the five presets come from two libraries in two
    states: `("perc", ...)` and `("drums", ...)` cut a stroke out of
    Virtuosity's SFZ maps, and `("studio", [...])` sums files out of the kit
    this repository already ships.
    """
    kind = entry["src"][0]
    if kind == "studio":
        x, what = _studio_mono(entry["src"][1], rate)
    else:
        _, articulation, vel, mix, mics = entry["src"]
        x, what = _sfz_mono(kind, root, articulation, vel, mix, mics, rate)
    x = rk.dc_block(x, rate, 22.0)
    if entry["floor"] is not None:
        x = rk.trim_and_fade(x, rate, entry["cap_s"], floor_db=entry["floor"],
                             fade_out_ms=entry["fade"])
    else:
        x = _cap_and_land(x, rate, entry["cap_s"], entry["fade"])
    if not len(x):
        raise SystemExit("%s trimmed away to nothing" % entry["name"])
    return x[:, 0], what


def _cap_and_land(x, rate, cap_s, fade_ms):
    """Cap an already-trimmed buffer and put both ends back on zero.

    The `else` branch of `_stroke`, for the Studio files. A shorter cap than
    the file needs still has to be faded or the cut is a step, and a step is
    a second click on every beat — which is the whole of `rebuild.py`'s
    point 1.
    """
    n = min(len(x), int(rate * cap_s))
    y = np.array(x[:n], dtype=np.float64)
    fo = min(int(rate * fade_ms / 1000.0), len(y) // 2)
    if fo > 1:
        w = 0.5 + 0.5 * np.cos(np.linspace(0.0, np.pi, fo))
        y[-fo:] *= w[:, None]
    y[0] = 0.0
    y[-1] = 0.0
    return y


def _shape(x, drive):
    """The tanh stage, exactly as `SoundBank::new` spells it for the drum.

    Normalised to unity going in so `drive` means the same thing whatever the
    stroke arrived at, and divided by `tanh(drive)` so it comes out at unity
    again — the peak below is then the only thing that sets the level.
    """
    if not drive:
        return x
    p = float(np.max(np.abs(x)))
    if p <= 0:
        return x
    return np.tanh(x * (drive / p)) / np.tanh(drive)


# ---------------------------------------------------------------------------
# Measurement — the same two filters `engine.rs` holds these files to
# ---------------------------------------------------------------------------

def laptop_band_energy(buf, sr):
    """Energy through a 200 Hz-4 kHz band-pass: what a laptop speaker
    radiates, and what `every_accent_is_louder_than_its_beat_on_a_small_speaker`
    measures. Four high-pass sections and not one — see that test for why a
    gentler roll-off silently passes.
    """
    from scipy.signal import lfilter
    a = 1.0 / (1.0 + 2.0 * np.pi * 200.0 / sr)
    v = np.asarray(buf, dtype=np.float64)
    for _ in range(4):
        v = lfilter([a, -a], [1.0, -a], v)
    lp = 2.0 * np.pi * 4000.0 / sr
    for _ in range(2):
        v = lfilter([lp], [1.0, lp - 1.0], v)
    return float(np.sum(v * v))


def k_weighted_energy(buf, sr):
    """ITU-R BS.1770 K-weighting: what a LUFS meter hears, and what
    `the_snare_kit_is_not_quieter_than_the_drum_kit` measures."""
    from scipy.signal import lfilter
    tau = 2.0 * np.pi
    g, q, fc = 3.99984385397, 0.7071752369554196, 1681.9744509555319
    amp = 10.0 ** (g / 40.0)
    w0 = tau * fc / sr
    alpha, c, sa = np.sin(w0) / (2.0 * q), np.cos(w0), np.sqrt(amp)
    a0 = (amp + 1.0) - (amp - 1.0) * c + 2.0 * sa * alpha
    shelf_b = [amp * ((amp + 1.0) + (amp - 1.0) * c + 2.0 * sa * alpha) / a0,
               -2.0 * amp * ((amp - 1.0) + (amp + 1.0) * c) / a0,
               amp * ((amp + 1.0) + (amp - 1.0) * c - 2.0 * sa * alpha) / a0]
    shelf_a = [1.0, 2.0 * ((amp - 1.0) - (amp + 1.0) * c) / a0,
               ((amp + 1.0) - (amp - 1.0) * c - 2.0 * sa * alpha) / a0]
    q, fc = 0.5003270373238773, 38.13547087602444
    w0 = tau * fc / sr
    alpha, c = np.sin(w0) / (2.0 * q), np.cos(w0)
    a0 = 1.0 + alpha
    hp_b = [(1.0 + c) / 2.0 / a0, -(1.0 + c) / a0, (1.0 + c) / 2.0 / a0]
    hp_a = [1.0, -2.0 * c / a0, (1.0 - alpha) / a0]
    v = np.asarray(buf, dtype=np.float64)
    v = lfilter(shelf_b, shelf_a, v)
    v = lfilter(hp_b, hp_a, v)
    return float(np.sum(v * v))


BEAT_GAIN = 0.65
SUB_GAIN = 0.30


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------

def _write(path, x, rate, peak, rng):
    """Peak to `peak`, TPDF dither, quantise, land both ends on zero.

    `render_kit.write_wav` in all but the target, which is 0.97 for an accent
    and 0.900 for a beat where a kit voice is always 0.900 — and in the shape,
    which is mono here.
    """
    target = PEAK_I16[peak]
    p = float(np.max(np.abs(x)))
    if p <= 0:
        raise SystemExit("silent buffer for %s" % path)
    y = np.asarray(x, dtype=np.float64) * (target / p)
    d = rng.random(y.shape) + rng.random(y.shape) - 1.0
    q = np.rint(y + d).astype(np.int64)
    np.clip(q, -target, target, out=q)
    q[0] = 0
    q[-1] = 0
    m = int(np.max(np.abs(q)))
    if 0 < m < target:
        i = int(np.argmax(np.abs(q)))
        q[i] = target if q[i] > 0 else -target
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, q.astype(np.int16), rate, subtype="PCM_16")
    return os.path.getsize(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("names", nargs="*", help="which files (default: all fifteen)")
    ap.add_argument("--source-root", help="the Virtuosity Drums folder")
    ap.add_argument("--out", default=OUT_DIR)
    ap.add_argument("--measure", action="store_true",
                    help="render and measure, but write nothing")
    args = ap.parse_args()

    root = rk.resolve_root("${YAMES_SAMPLES}/virtuosity_drums", args.source_root)
    wanted = set(args.names)
    entries = [e for e in RECIPE if not wanted or e["name"] in wanted]
    if wanted - {e["name"] for e in RECIPE}:
        raise SystemExit("no such click file: %s"
                         % ", ".join(sorted(wanted - {e["name"] for e in RECIPE})))

    rng = np.random.default_rng(SEED)
    rendered = {}
    total = 0
    for entry in entries:
        x, what = _stroke(entry, root, RATE)
        x = _shape(x, entry["drive"])
        x = x * (entry["peak"] / float(np.max(np.abs(x))))
        rendered[entry["name"]] = x
        path = os.path.join(args.out, entry["name"] + ".wav")
        size = 44 + 2 * len(x) if args.measure else _write(path, x, RATE, entry["peak"], rng)
        total += size
        print("%-13s %6.0f ms  peak %.3f  drive %.1f  %7d B   %s  [%s]"
              % (entry["name"], 1000.0 * len(x) / RATE, entry["peak"],
                 entry["drive"], size, entry["why"], what))
    print("%-13s %36s %7d B" % ("", "total", total))

    print()
    print("Through a 200 Hz-4 kHz band-pass, each of the three strokes against "
          "the plain beat as the engine plays them (1.0 / MEDIUM_GAIN=1.0 / "
          "BEAT_GAIN), and the beat again at SUB_GAIN:")
    for kit in ("wood", "snare", "sticks", "cowbell", "kit"):
        hi, lo = rendered.get(kit + "_high"), rendered.get(kit + "_low")
        if hi is None or lo is None:
            continue
        mid = rendered.get(kit + "_mid")
        a = laptop_band_energy(hi, RATE)
        b = laptop_band_energy(lo, RATE) * BEAT_GAIN * BEAT_GAIN
        s = laptop_band_energy(lo, RATE) * SUB_GAIN * SUB_GAIN
        bar = (k_weighted_energy(hi, RATE)
               + 3.0 * k_weighted_energy(lo, RATE) * BEAT_GAIN * BEAT_GAIN)
        # The middle column is blank when only some of the table was asked
        # for, rather than absent: a partial run is a legitimate thing to do
        # and a missing column should not read as a missing file.
        if mid is None:
            mid_txt = "  middle     --  "
        else:
            m = laptop_band_energy(mid, RATE)
            mid_txt = ("  middle %+5.2f / %+5.2f"
                       % (10.0 * np.log10(m / max(a, 1e-30)),
                          10.0 * np.log10(m / max(b, 1e-30))))
        print("  %-8s accent %+5.2f dB over its beat%s   accent %8.2f   "
              "beat %8.2f   subdivision %7.2f   bar %8.1f"
              % (kit, 10.0 * np.log10(a / max(b, 1e-30)), mid_txt, a, b, s, bar))
    print("  (the middle column is dB against the downbeat / dB against the "
          "plain beat)")


if __name__ == "__main__":
    main()
