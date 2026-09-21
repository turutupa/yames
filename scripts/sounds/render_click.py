"""Render the metronome's RECORDED click presets from the sample libraries.

The generator of record for `wood_*`, `snare_*`, `sticks_*`, `cowbell_*` and
`kit_*` under `src-tauri/sounds/` — THREE strokes each since 2026-09-15, not
two, which is sixteen files: cowbell's three come from three different
dynamics of the bell, so its plain beat moved as well. `rebuild.py` still owns the synthesised five — click, beep, drum and the
chimes — and says so in its own header, including the two middle strokes
(`click_mid`, `beep_mid`) that belong to it for the same reason its siblings
do.

    python scripts/sounds/render_click.py            # the whole table
    python scripts/sounds/render_click.py wood_high  # one — see below
    python scripts/sounds/render_click.py --measure  # numbers, write nothing

ONLY A FULL RUN REPRODUCES THE TRACKED BYTES. `_write`'s TPDF dither comes from
one generator, seeded once and drawn from in table order, so naming a subset on
the command line gives that file a different noise floor from the one committed
— audibly identical, byte-for-byte different, and
`the_shipped_click_files_are_the_ones_that_were_heard` in `engine.rs` will say
so. Render one file to LOOK at it; render the table to SHIP it. The same
coupling is why re-cutting a row is not free; see `RESERVED` below.

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
peak convention produces no ladder at all. So THE PEAK IS SOLVED FOR RATHER
THAN ASSUMED: every middle's `peak` below is whatever puts that stroke at
the geometric centre of its own preset's span through the 200 Hz-4 kHz band,
and the five recorded ones land between 0.771 and 0.930. Cowbell's plain beat
is solved the same way and lands at 0.763, because that preset's three strokes
are three dynamics of one bell and a bell's loudness is its ring rather than
its clang.

That leaves the other knobs describing the STROKE, which is what they are for:

    layer    which dynamic of the instrument
    drive    the tanh stage — harmonics and crest, and a soft layer sometimes
             cannot reach its target at any peak under 1.0 without it
    mix      which mics, and how much room is in the sound
    floor    where the trim cuts, and therefore how long the stroke rings

An earlier version of this table spent `floor` and `mix` as levels instead, and
both produced files that measured right and sounded wrong: a woodblock gated at
-22 dB where its downbeat rang on for another 180 ms, and a cowbell so far back
in the room that it read as a different, washier bell. Each is recorded in the
entry it happened to.

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
"""The ceiling a middle stroke is allowed, and the peak the two synthesised
middles land on. Most of the recorded ones land LOWER, and that is the whole
of the next paragraph.

THE PEAK IS THE LEVEL KNOB AND NOT A CONVENTION TO BE KEPT. `MEDIUM_GAIN` is
1.0, so a bar's middle sounds like whatever this file sounds like, and at a
fixed peak a softer stroke is usually LOUDER (see the header). Normalising
every middle to 0.930 therefore produced a ladder that was not a ladder:
cowbell's middle stood 0.47 dB under its downbeat and the recorded kit's stood
0.83, which is the same half-decibel the owner already listened to and could
not hear. So `peak` in the table below is per file, stated per file, and the
five recorded middles land between 0.771 and 0.930 — whatever puts the stroke
at the geometric centre of its own kit's span through the band a laptop
radiates. Headroom is not what is being spent here: every one of these is
further from full scale than the 0.970 an accent is allowed."""

def peak_i16(peak):
    """A peak as a 16-bit target, which is what `_write` normalises to.

    `int(round(peak * 32767))`, and the three numbers that used to be written
    out by hand are exactly what it returns: 0.970 -> 31784, 0.930 -> 30473,
    0.900 -> 29490. It is a function now because `peak` became a per-file
    number rather than one of three.
    """
    return int(round(peak * 32767))

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

    # -- Cowbell. THREE dynamics in the library and this preset uses all three
    # since 2026-09-15 — hardest for the downbeat, middle for the bar's middle,
    # the fingertip tap for the plain beat. Only the downbeat is here; the other
    # two are cut in this pass and live in the appended block below.
    dict(name="cowbell_high", src=("perc", "cowbell", 3, PERC_MIX,
                                   ["oh", "close", "mid", "room"]),
         peak=ACCENT_PEAK, drive=0.0, cap_s=0.45, floor=-50.0, fade=30.0,
         why="Virtuosity cowbell, hard layer"),

    # A ROW THAT WRITES NOTHING, AND THE ONLY ONE. `reserve` renders the stroke
    # and draws its dither and then throws both away.
    #
    # This is what `cowbell_low` was until 2026-09-15: the bell's middle
    # dynamic, at the beat's peak. It is the preset's MIDDLE now, and its plain
    # beat is the fingertip tap — both in the appended block, both re-cut. The
    # row cannot simply be deleted, because `_write` draws dither from ONE
    # generator in table order and the two entries below it, `kit_high` and
    # `kit_low`, would then draw the numbers this one used to. Those two files
    # have been in the owner's hands since 2026-09-14 and are pinned by hash in
    # `the_shipped_click_files_are_the_ones_that_were_heard`; re-dithering them
    # would change nothing anybody can hear and everything the test can see,
    # which is exactly the silent regression that test exists for.
    #
    # So it stays, with its parameters frozen, holding a place in a stream. If
    # this table is ever re-dithered wholesale — a per-file seed would be the
    # right fix and would cost every file its bytes once — delete this row in
    # the same commit.
    dict(name="cowbell_low@2026-09-14", reserve=True,
         src=("perc", "cowbell", 2, PERC_MIX, ["oh", "close", "mid", "room"]),
         peak=BEAT_PEAK, drive=0.0, cap_s=0.45, floor=-50.0, fade=30.0,
         why="RESERVED - holds the dither stream, writes no file"),

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

    # -- THE RE-CUTS, APPENDED RATHER THAN INTERLEAVED.
    # `_write` draws its dither from ONE generator in table order, so a row
    # inserted beside its siblings — or a row above them changing LENGTH —
    # re-dithers every file below it and changes bytes the app has shipped
    # since 2026-09-14, which `the_shipped_click_files_are_the_ones_that_were_
    # heard` in `engine.rs` pins by hash and which the jam's count-in depends
    # on. Everything cut in this pass therefore lives down here, `cowbell_low`
    # included, and a whole run reproduces the nine entries above byte for
    # byte.
    #
    # Read the header's "THE MIDDLE STROKE" section before changing a number
    # here: each middle is placed at the geometric centre of its own kit's
    # span, and since 2026-09-15 the knob that places it is the PEAK — see
    # `MID_PEAK`. Trim, drive and blend are back to describing the stroke.

    # Wood: the SAME small block, struck at vl3 instead of vl6, and CUT
    # EXACTLY AS THE DOWNBEAT IS — same -40 dB floor, same 12 ms fade, same
    # 250 ms, ending at -42.3 dB where `wood_high` ends at -41.7.
    #
    # The first version of this file trimmed at -22 dB to buy its level, and
    # that was the trim doing a job the peak should have done: at -22 the fade
    # began while the block was still at 8-10% of full scale and took it to
    # nothing in 12 ms, so the middle of the bar was GATED where its downbeat
    # rang on for another 180. It measured correctly and it ended like nothing
    # else in the app. The level is 0.814 of full scale now and the decay is
    # the block's own.
    dict(name="wood_mid", src=("perc", "woodblock_high", 3, WOOD_MIX, ["oh"]),
         peak=0.814, drive=0.0, cap_s=0.25, floor=-40.0, fade=12.0,
         why="Virtuosity woodblock_high vl3"),

    # Snare: the same drum at LAYER 3, with its own drive.
    #
    # LAYER 2 IS THE BETTER SOUND AND THE WRONG LEVEL, and it is worth knowing
    # why because the same trap is one row down. Layers 3 and 4 of this drum
    # are both struck hard enough to be nearly the same sound — level divided
    # out, layer 3 stands 0.57 from the downbeat where layer 2 stands 0.70 — so
    # layer 2 looks like the middle stroke a bar wants. It cannot be given the
    # level of one. Layer 2 is the LOUDEST layer of the four (see the header's
    # table), so at the peak that centres it through the laptop band it
    # measures 0.86 dB LOUDER than its own downbeat K-weighted: correct on a
    # laptop, backwards on headphones. Taking 1.86 dB off to fix that drops it
    # to 0.13 dB over the plain beat band-limited, which is no middle at all.
    # There is no peak that satisfies both filters, and
    # `every_medium_accent_sits_between_its_strong_and_its_beat` checks both.
    #
    # Drive 1.1 between the accent's 1.5 and the beat's 0.8, which is what a
    # stroke between two strokes should need — and it is not optional here:
    # undriven, layer 3 would need a peak over full scale to reach the centre
    # of this preset's span.
    # Capped at 0.43 and not the pair's 0.6, which is the only number here
    # that is about tidiness: the softer layers' files run past half a second
    # and layer 4's runs 429 ms, so left alone the middle of the bar would ring
    # longer than the downbeat. What it gives up is the bottom of the wire tail
    # and measures 0.00 dB, so nothing is paid for it.
    # RE-CUT 2026-09-15 and moved to the bottom of this table — the row that
    # ships is the last one in the file. This one stays exactly here, renders
    # exactly what it always rendered, dithers the same 18 963 samples and
    # writes nothing, so `sticks_mid`, `cowbell_mid`, `cowbell_low` and
    # `kit_mid` keep the bytes the owner has been listening to. Same trick as
    # `cowbell_low@2026-09-14` above, and the same reason: `_write` draws from
    # one generator in table order.
    dict(name="snare_mid@2026-09-15", reserve=True,
         src=("studio", ["snare.3.1.wav"]),
         peak=0.921, drive=1.1, cap_s=0.43, floor=None, fade=30.0,
         why="RESERVED - holds the dither stream, writes no file"),

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

    # Cowbell: the library's three dynamics, one per tier, LEVELLED BY BAND
    # ENERGY AND NOT BY PEAK.
    #
    # This is the preset that proves why the peak had to become a per-file
    # number. Its three strokes are 26 dB apart in the library and less than
    # 1.5 dB apart once each is normalised: a bell's peak is one clang and its
    # loudness is the ring that follows, so the SOFTEST stroke at the beat's
    # 0.900 came back 1.26 dB LOUDER than the hardest at 0.970. Taken at face
    # value the preset would have read downbeat, middle, beat as +0.47, +2.30
    # and 0.00 — the downbeat and the middle half a decibel apart, which is the
    # failure this whole pass exists to fix.
    #
    # So the peaks are solved for instead of assumed, from the ladder backwards:
    # 2.1 dB a step through the 200 Hz-4 kHz band, which is where the other
    # seven presets sit. v3 stays at 0.970 and is byte-identical to what
    # shipped; v2 lands at 0.771 and v1 at 0.763, both far under the 0.900 a
    # plain beat conventionally gets and neither of them anywhere near clipping.
    #
    # WHAT WAS TRIED INSTEAD, and why it lost. For one day this middle was v3 —
    # the downbeat's own stroke — with the close and mid mics dropped and the
    # room brought up to meet the overhead, so that the colour moved as far as
    # the level did. It measured beautifully (2.49 dB under, spectral distance
    # 0.43 where these three dynamics manage 0.11) and it was the wrong sound:
    # 13.3% of its energy above 5.6 kHz against the downbeat's 4.2%, a centroid
    # of 1788 Hz against 1042, and 316 ms against 274. It did not read as the
    # same bell struck differently, it read as a washier bell. Three real
    # dynamics of one instrument is what a player does and what this is.
    dict(name="cowbell_mid", src=("perc", "cowbell", 2, PERC_MIX,
                                  ["oh", "close", "mid", "room"]),
         peak=0.771, drive=0.0, cap_s=0.45, floor=-50.0, fade=30.0,
         why="Virtuosity cowbell, middle layer"),

    # And the fingertip tap becomes the plain beat — the one file here that is
    # re-cut rather than added, and the one the brief allowed to move.
    #
    # 0.763 is not a typo and not a convention: it is 1.4 dB under the peak a
    # plain beat is usually given, and it is what puts this stroke 2.1 dB under
    # the preset's own middle THROUGH THE BAND, which is the only place the two
    # can honestly be compared. Read `MID_PEAK` before changing it.
    #
    # Floor -40 rather than the pair's -50, which costs 0.00 dB of level: the
    # tap's ring runs 375 ms at -50 and would have outlasted both of the
    # strokes above it.
    dict(name="cowbell_low", src=("perc", "cowbell", 1, PERC_MIX,
                                  ["oh", "close", "mid", "room"]),
         peak=0.763, drive=0.0, cap_s=0.45, floor=-40.0, fade=30.0,
         why="Virtuosity cowbell, fingertip layer"),

    # Kit: the backbeat. Snare layer 3 and NO KICK.
    #
    # 6/8 on a kit is kick on one, snare on four, hats between, so the middle
    # of the bar is the thing that is missing the kick. That is a huge
    # difference to hear and almost none to measure, because a band-pass that
    # starts at 200 Hz cannot see a kick at all — and "almost none to measure"
    # is not good enough on a laptop, where the kick is not just invisible to
    # the filter but genuinely gone. At 0.930 this file stood 0.83 dB under its
    # downbeat band-limited, and half a decibel is what the owner already
    # listened to and could not hear.
    #
    # So the peak carries it the rest of the way, to 0.807 and 2.06 dB under.
    #
    # Layer 3, and layer 2 lost here for the reason it lost one row up, less
    # brutally. Layer 2 is 0.94 of spectral distance from this downbeat against
    # layer 3's 0.76 — a real gain, because this downbeat has a kick in it —
    # and it leaves only 0.77 dB of K-weighted margin where layer 3 leaves
    # 2.96. Eight tenths of a decibel on the filter that hears a whole kit is
    # the margin the owner has already told us he cannot hear.
    dict(name="kit_mid", src=("studio", ["snare.3.1.wav"]),
         peak=0.807, drive=0.0, cap_s=0.45, floor=None, fade=30.0,
         why="Studio snare layer 3 alone, no kick"),

    # -- Snare's middle, RE-CUT 2026-09-15. Last in the table because it is
    # the re-cut: appended, so every row above keeps its place in the dither
    # stream and its bytes. The row it replaces is `snare_mid@2026-09-15`,
    # reserved where it used to sit.
    #
    # WHY IT HAD TO GO. It was layer 3 of this drum against a layer 4 downbeat,
    # and the header's own note above says those two "are both struck hard
    # enough to be nearly the same sound". Normalised they measure 0.38 dB
    # apart in RMS, and band by band the shipped middle was a scaled copy of
    # its downbeat: 1.11 dB under at 120-400, 2.57 under at 400-2k, 3.01 under
    # at 2-6k. A stroke that is its downbeat minus a constant IS a gain-only
    # accent, which is the thing this whole tier was built to stop being, and
    # the owner heard it as one.
    #
    # WHAT IT IS NOW: THE RIM AND THE HEAD, which is one stroke and not two.
    # The Studio kit ships its own rim, so this is still the same drum played
    # a different way rather than a second instrument — `SoundKit::Snare`'s
    # whole rule. The rim ALONE cannot do the job: it carries 10% of its
    # energy under 200 Hz against the drum's 33, so K-weighted there is no
    # peak that puts it over this preset's wiry plain beat and under its
    # downbeat at the same time (every combination of drive and peak was
    # swept; the best missed by 0.34 dB). The head under it puts that back.
    #
    # Layer 2 for the head, and this is the one place layer 2 belongs. It is
    # the loudest of the drum's four layers and was rejected as a middle in
    # its own right for exactly that; at 0.65 under a rim it is not the stroke,
    # it is the drum the stroke lands on, and the level is set by this row's
    # peak rather than by the layer.
    #
    # Where it lands: 61.32 / 52.85 / 48.52 dB in the three bands, against a
    # downbeat's 64.45 / 56.01 / 45.34 and a plain beat's 58.60 / 51.31 /
    # 45.92. Between them low down, where loudness is, and BRIGHTER than both
    # at 2-6 kHz, where the stick is. That is what makes it a different stroke
    # rather than a quieter one: the ear places it by timbre and the meter
    # places it by level, and for once they are not being asked to agree.
    #
    # The margins are +1.96 / +2.02 band-limited and +2.13 / +2.14 K-weighted
    # at 44 100 — the most even pair in this table, and wider on the tightest
    # of the four than the layer-3 version it replaces (+1.99 / +1.99 / +1.34
    # / +2.94: the 1.34 was the one to worry about).
    #
    # Drive 0.8 and not the old 1.1. A rim shot has its own crack and does not
    # need to be pushed into one; 1.1 measured no better and only cost the
    # attack.
    dict(name="snare_mid", src=("studio", [("rim.1.1.wav", 1.0),
                                           ("snare.2.1.wav", 0.65)]),
         peak=0.80, drive=0.8, cap_s=0.43, floor=None, fade=30.0,
         why="Studio snare rim + layer 2 head, mono fold"),
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

def _dither(rng, n):
    """`n` samples of TPDF dither, and the ONLY place the generator is drawn
    from — so a reserved row (see `RESERVED` in the table) advances the stream
    by exactly what a written one would."""
    return rng.random(n) + rng.random(n) - 1.0


def _write(path, x, rate, peak, rng):
    """Peak to `peak`, TPDF dither, quantise, land both ends on zero.

    `render_kit.write_wav` in all but the target, which is this entry's own
    `peak` where a kit voice is always 0.900 — and in the shape, which is mono
    here.
    """
    target = peak_i16(peak)
    p = float(np.max(np.abs(x)))
    if p <= 0:
        raise SystemExit("silent buffer for %s" % path)
    y = np.asarray(x, dtype=np.float64) * (target / p)
    q = np.rint(y + _dither(rng, len(y))).astype(np.int64)
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
    ap.add_argument("names", nargs="*", help="which files (default: the whole table)")
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
        if entry.get("reserve"):
            # Rendered, dithered, discarded. See the entry for why.
            if not args.measure:
                _dither(rng, len(x))
            print("%-13s %6.0f ms  %-30s %s"
                  % (entry["name"], 1000.0 * len(x) / RATE, "(reserved)", entry["why"]))
            continue
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
