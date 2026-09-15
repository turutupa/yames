# The jam kits

Seven drum kits for Jam mode. Five are synthesised, eight voices each, written
by the `--kits` section of `generate_sounds.py`. Two are **recorded** — Club
and Studio — with eleven voices, up to four velocity layers and three round
robins each, rendered from public-domain and CC-BY sample libraries by
`scripts/sounds/render_kit.py`. Every number below is measured by
`scripts/sounds/measure_kits.py` and can be regenerated rather than trusted:

```sh
python generate_sounds.py --kits                     # the 40 synthesised files
python scripts/sounds/render_kit.py \
    scripts/sounds/recipes/club.json \
    src-tauri/sounds/kits/club                       # a recorded kit
python scripts/sounds/measure_kits.py                # check them, print the tables
```

The synthesised ones are deterministic — seeded noise and arithmetic, no input
files — so a rebuild produces the same bytes. Verified across two runs: all 40
files byte-identical. The recorded ones are deterministic given the same
library and recipe, apart from the dither, which is seeded from the recipe.

**There is also a percussionist**, further down under *The percussion set*: ten
voices in the same folder-and-manifest shape, rendered from the same download
as Club, played by the engine *under* whichever kit is loaded rather than
instead of one. It is not an eighth kit and it is not eleven voices with ten
of them missing.

**To hear them rather than read them:** `scripts/sounds/ab.html` plays the same
two bars of rock on every kit it can find and swaps kits at a bar line, so the
comparison is like for like. It plays each kit the way the engine will — the
level picks the layer, the round robin cycles, `trim_db` carries the balance —
so what you hear is the difference between kits and not between mixes. It
needs a local server, because a browser will not read WAVs off `file://`:

```sh
python -m http.server 8123      # from the repository root
# then open http://localhost:8123/scripts/sounds/ab.html
```

**The bass and the keys are here too**, further down under *The melodic
voices*: four recorded banks in the same folder-and-manifest shape a kit has,
rendered by `scripts/sounds/render_voice.py`. They are a different instrument
and mostly the same rules, and the places where the rules differ are the places
a bank has pitch.

> **Do not run `python generate_sounds.py` with no arguments** unless you mean
> to. Its legacy section rewrites `click_*`, `wood_*`, `beep_*`, `drum_*` and
> `chime_*` with files that are *not* the ones the app ships — those are
> maintained by `scripts/sounds/rebuild.py` now. `--kits` skips it.

## For the engine

A kit is a folder: `sounds/kits/<id>/kit.json` and beside it
`<voice>.<layer>.<rr>.wav`. The recorded kits are 16-bit, 48 kHz, **stereo**;
the five synthesised ones are 16-bit, 44.1 kHz, mono, and the loader resamples
and duplicates. Peak is 0.900 in every file of every kit.

**Peak is uniform on purpose.** The files carry timbre and duration and the
engine carries balance. A soft layer is *not* pre-attenuated — it is the same
drum struck softly, at the same ceiling, and the engine's level gain makes it
a backbeat or a ghost note. Anything that wants a hit to be quieter should
turn it down rather than asking for a quieter file. Between *voices*, the
balance is `trim_db` in the manifest; between *layers* of one voice, it is
`LEVEL_GAIN`.

The table below is the five synthesised kits in their flat pre-folder form.
The recorded kits have their own table further down.

| kit | voice | file | peak | duration | size |
|---|---|---|---|---|---|
| room | `kick` | `kit_room_kick.wav` | 0.900 | 150 ms | 13.0 KB |
| room | `snare_hi` | `kit_room_snare_hi.wav` | 0.900 | 200 ms | 17.3 KB |
| room | `snare_lo` | `kit_room_snare_lo.wav` | 0.900 | 150 ms | 13.0 KB |
| room | `hat` | `kit_room_hat.wav` | 0.900 | 60 ms | 5.2 KB |
| room | `hat_open` | `kit_room_hat_open.wav` | 0.900 | 300 ms | 25.9 KB |
| room | `ride` | `kit_room_ride.wav` | 0.900 | 350 ms | 30.2 KB |
| room | `rim` | `kit_room_rim.wav` | 0.900 | 50 ms | 4.3 KB |
| room | `crash` | `kit_room_crash.wav` | 0.900 | 600 ms | 51.7 KB |
| tight | `kick` | `kit_tight_kick.wav` | 0.900 | 130 ms | 11.2 KB |
| tight | `snare_hi` | `kit_tight_snare_hi.wav` | 0.900 | 170 ms | 14.7 KB |
| tight | `snare_lo` | `kit_tight_snare_lo.wav` | 0.900 | 130 ms | 11.2 KB |
| tight | `hat` | `kit_tight_hat.wav` | 0.900 | 50 ms | 4.3 KB |
| tight | `hat_open` | `kit_tight_hat_open.wav` | 0.900 | 230 ms | 19.9 KB |
| tight | `ride` | `kit_tight_ride.wav` | 0.900 | 260 ms | 22.4 KB |
| tight | `rim` | `kit_tight_rim.wav` | 0.900 | 42 ms | 3.7 KB |
| tight | `crash` | `kit_tight_crash.wav` | 0.900 | 430 ms | 37.1 KB |
| brushes | `kick` | `kit_brushes_kick.wav` | 0.900 | 170 ms | 14.7 KB |
| brushes | `snare_hi` | `kit_brushes_snare_hi.wav` | 0.900 | 220 ms | 19.0 KB |
| brushes | `snare_lo` | `kit_brushes_snare_lo.wav` | 0.900 | 180 ms | 15.5 KB |
| brushes | `hat` | `kit_brushes_hat.wav` | 0.900 | 65 ms | 5.6 KB |
| brushes | `hat_open` | `kit_brushes_hat_open.wav` | 0.900 | 330 ms | 28.5 KB |
| brushes | `ride` | `kit_brushes_ride.wav` | 0.900 | 400 ms | 34.5 KB |
| brushes | `rim` | `kit_brushes_rim.wav` | 0.900 | 55 ms | 4.8 KB |
| brushes | `crash` | `kit_brushes_crash.wav` | 0.900 | 700 ms | 60.3 KB |
| electronic | `kick` | `kit_electronic_kick.wav` | 0.900 | 180 ms | 15.5 KB |
| electronic | `snare_hi` | `kit_electronic_snare_hi.wav` | 0.900 | 200 ms | 17.3 KB |
| electronic | `snare_lo` | `kit_electronic_snare_lo.wav` | 0.900 | 150 ms | 13.0 KB |
| electronic | `hat` | `kit_electronic_hat.wav` | 0.900 | 55 ms | 4.8 KB |
| electronic | `hat_open` | `kit_electronic_hat_open.wav` | 0.900 | 300 ms | 25.9 KB |
| electronic | `ride` | `kit_electronic_ride.wav` | 0.900 | 300 ms | 25.9 KB |
| electronic | `rim` | `kit_electronic_rim.wav` | 0.900 | 45 ms | 3.9 KB |
| electronic | `crash` | `kit_electronic_crash.wav` | 0.900 | 550 ms | 47.4 KB |
| raw | `kick` | `kit_raw_kick.wav` | 0.900 | 150 ms | 13.0 KB |
| raw | `snare_hi` | `kit_raw_snare_hi.wav` | 0.900 | 205 ms | 17.7 KB |
| raw | `snare_lo` | `kit_raw_snare_lo.wav` | 0.900 | 150 ms | 13.0 KB |
| raw | `hat` | `kit_raw_hat.wav` | 0.900 | 52 ms | 4.5 KB |
| raw | `hat_open` | `kit_raw_hat_open.wav` | 0.900 | 240 ms | 20.7 KB |
| raw | `ride` | `kit_raw_ride.wav` | 0.900 | 300 ms | 25.9 KB |
| raw | `rim` | `kit_raw_rim.wav` | 0.900 | 48 ms | 4.2 KB |
| raw | `crash` | `kit_raw_crash.wav` | 0.900 | 660 ms | 56.9 KB |

No file clips: peak is 0.900 everywhere, no sample sits on the rail, every
file ends at true zero (−180 dBFS) and the largest DC offset in the set is
7.9e−05 (`kit_raw_rim.wav`), against a 2e−04 limit.

## The small-speaker margins

This section is about the five synthesised kits; what the same measurement
means for a kit with velocity layers is under **The recorded kits** below, and
the difference matters.

Measured through the 200 Hz–4 kHz band-pass a laptop speaker roughly
radiates — `laptop_band_energy` in `src-tauri/src/engine.rs`, ported
line-for-line into the measurement script. This is the measurement that
matters, and a broadband one is the measurement that lied: `drum_high` once
measured +7.8 dB broadband while being 0.5 dB *quieter* than its own plain
beat on the speaker the owner practises on, because essentially all of it was
sub-120 Hz kick.

The engine asserts a **2.0 dB floor**. It is a floor and not a target — the
metronome's own kits sit between +3.67 and +4.58, and a snare accent that
once scored +6.39 was rejected as a shout.

| kit | snare_hi vs snare_lo | kick vs hat | kit size |
|---|---|---|---|
| room | +3.13 dB | +3.70 dB | 161 KB |
| tight | +4.41 dB | +2.71 dB | 125 KB |
| brushes | +4.21 dB | +5.06 dB | 183 KB |
| electronic | +4.84 dB | +2.55 dB | 154 KB |
| raw | +5.82 dB | +5.39 dB | 156 KB |

All five kits are inside the 600 KB budget with room to spare; 778 KB for all
forty files.

Two notes on reading this table.

The margins are **file to file, with no engine gain applied**. The metronome
plays its plain beat at `BEAT_GAIN` 0.65 and its subdivisions at `SUB_GAIN`
0.30, so whatever gains the groove table uses will widen every number here.
They are quoted raw because raw is the part the files control: a gain can
make a kick louder, but it cannot put energy into a band the file has none
in, which is exactly how the original drum accent failed.

`brushes` has the widest kick-vs-hat margin of the first four at +5.06 dB, and
that is the kit behaving as intended rather than a kick that shouts: its hat is
the most incidental voice in the set, because brushes keep time on the ride.

`raw` is wider than every other kit on both margins, and that is the brief
rather than an accident — see its paragraph below. It is deliberately kept
under the +6.39 dB that the metronome's snare accent was once rejected for.

**The margins are a ratio, and a ratio is not loudness.** They say an accent
beats its own plain hit; they do not say the kit is audible. That is absolute
band energy, and it is the number that separates Raw from the kits the owner
called soft:

| kit | kick | snare_hi | snare_lo | hat |
|---|---|---|---|---|
| room | 11.8 | 47.1 | 22.9 | 5.05 |
| tight | 8.37 | 57.6 | 20.8 | 4.48 |
| brushes | 17.8 | 188 | 71.2 | 5.56 |
| electronic | 4.04 | 148 | 48.5 | 2.25 |
| **raw** | **29.9** | **102** | 26.6 | 8.65 |

Raw's kick carries more energy through a laptop speaker than any other kit's —
+4.0 dB over `room`, +5.5 dB over `tight`, +8.7 dB over the 808 — at the same
0.900 peak. Its snare beats both acoustic kits.

Read the two Brushes numbers before concluding that a big number is punch.
Brushes has the loudest snare in the set at 188 and is the softest-sounding kit
there is, because its energy is a long breathy ring and not a hit. **Punch is
energy plus a transient plus a short decay**, and the crest factor is where the
transient shows up: Raw's snare is 14.4 dB, Brushes' is 12.4 dB and Room's is
17.0 dB. Raw sits between them on purpose — compressed enough to be loud, not
so compressed that the stick disappears.

## The recorded kits

Two of the seven are not synthesised. They are rendered from sample libraries
whose licences allow redistribution, by `scripts/sounds/render_kit.py` and a
recipe, and **nothing from the libraries is in this repository** — only the
rendered kit. To re-render either one you need the library on disk and one
environment variable:

```sh
set YAMES_SAMPLES=C:\path\to\_samples          # the folder that holds them
python scripts/sounds/render_kit.py scripts/sounds/recipes/club.json \
       src-tauri/sounds/kits/club
```

| kit | library | licence | get it from |
|---|---|---|---|
| club | Virtuosity Drums | CC0-1.0 | `github.com/sfzinstruments/virtuosity_drums` (~1.2 GB, git clone) |
| studio | DRSKit 2.1 | CC BY 4.0 | `drumgizmo.org/wiki/doku.php?id=kits` (2.8 GB zip, unpacks to 4.0 GB) |

### The credit lines, as they must appear

CC0 requires nothing and CC BY requires attribution, so one of these is a
courtesy and one is a condition — but both are in the manifests and both
belong on the About screen, because a musician who likes a kit should be able
to find out whose drums they are.

```
Virtuosity Drums — Versilian Studios and Karoryfer Samples, performed by Austin McMahon
DRSKit by the DrumGizmo project, CC BY 4.0
```

### What the render tool decided, and why

Four things in `render_kit.py` are not bulk conversion. Each is there because
a measurement came back with an answer nobody expected, and each is written up
in the module's own docstring; the short version:

1. **Layers are chosen by loudness, not by velocity index.** Virtuosity's snare
   walks 34 dB across 36 velocity steps but spends eleven of them inside 3 dB.
   Cut that into four equal *index* bands and two of the four layers are the
   same sound.
2. **Round robins come from the source where it has them, and from
   neighbouring velocities where it does not.** Virtuosity is split down the
   middle: its cymbals have three or four real round robins per velocity and
   its drums have none — but its drums have 16 to 36 velocities. DRSKit has no
   round robins at all and 11 to 30 strokes per instrument. A stroke one notch
   softer is a different performance, which is what a round robin is for. No
   file is used twice inside a voice.
3. **The mics are time-aligned before they are summed.** Virtuosity's room mic
   arrives 6 to 10 ms after the close mic. Summed as they come that is a comb
   filter on every transient: a kick with a hole in it rather than a kick in a
   room. The alignment runs on energy envelopes, not waveforms — correlating a
   50 Hz kick against a room mic locks onto whichever cycle happens to match
   and reports a lag one period out.
4. **Peak is uniform; the balance is in the manifest.** Every file leaves at
   0.900 like every other sound in the app, so a layer carries its timbre and
   its duration and nothing else. `trim_db` per voice carries the balance.

### The balance is K-weighted, and that is a departure

The brief for this work said to set `trim_db` through the small-speaker
band-pass that the rest of this document lives by. Doing that produces a kit
that is wrong on every device, and the reason is the band-pass working exactly
as designed: it cannot see a 55 Hz drum. Measured on Club, it puts the kick
**10 dB under the snare** at the same peak, so a balance derived from it hands
the kick a **+9 dB** trim — a kick that peaks at two and a half times full
scale. It puts the hat 13 dB down for the mirror-image reason, a hi-hat living
at 8–15 kHz and the low-pass sitting at 4 kHz.

So the balance is set with **BS.1770 K-weighting over a fixed 400 ms window**,
which is the standard answer to "how loud do these two different sounds seem",
can see both ends of a kit, and on the same files puts the kick 6.6 dB *over*
the snare — which is what a kick does. The window is fixed because energy
summed over a whole file is partly a measure of how long the file is: a three
second crash accumulates 2.4 dB more than its own first 400 ms.

**The band-pass keeps the job it has always had.** It is the gate, in
`measure_kits.py`, and both margins below are measured through it.

### The pulse constraint

A perceptual balance is right about what a kit sounds like on headphones and
is not sufficient, because this app is a metronome first and the owner
practises on a laptop. Balanced by ear, Club's jazz kick lands **5.1 dB under
its own hi-hat** through the band-pass a laptop speaker radiates. So after the
balance, the tool checks that margin and, if the kick does not clear the hat
by 2.5 dB, closes the gap from both ends — half by letting the kick up, half
by taking the hat down. It says so when it does, because it is a departure
from what the recipe asked for:

| kit | what the balance gave | correction | result |
|---|---|---|---|
| club | −5.13 dB | kick +3.8, hat −3.8 | **+2.52 dB** |
| studio | +1.20 dB | kick +0.7, hat −0.7 | **+2.53 dB** |

Club needs 7.6 dB of it and Studio 1.4 dB, and that difference is the single
clearest number separating the two kits: DRSKit's kick has real midrange in
it and Virtuosity's does not.

### What the margins mean once a kit has layers

`measure_kits.py` keeps every check it had — peak, clipping, DC, both ends on
zero, duration — and both small-speaker margins. But for a layered kit the
margins are measured **as the engine plays them**, with the contract's own
fixed gains applied, and the raw file-to-file number is printed beside them.

The reason is worth reading before changing it. Every file in a recorded kit
is peak 0.900, and a real snare struck at 36 velocities and normalised to one
peak carries almost exactly the same energy through a 200 Hz–4 kHz window:
measured across the whole of Virtuosity's snare, softest stroke to hardest,
the spread is **2.5 dB and it is not even monotonic**. The five synthesised
kits clear the 2.0 dB floor by 3 to 6 dB because `snare_lo` was *built* with a
third of the wire and a faster decay. That is a luxury a recording does not
have. What separates a ghost from a backbeat in a recorded kit is
`LEVEL_GAIN`, which is fixed by the contract and is as much a part of the kit
as the files are.

| kit | files | snare accent vs ghost | of which the files | kick vs hat (trimmed) | kit size |
|---|---|---|---|---|---|
| club | 81 | +6.79 dB | −0.15 dB | +2.52 dB | 18.44 MB |
| studio | 84 | +4.44 dB | −2.49 dB | +2.53 dB | 18.49 MB |

Studio's files do 2.5 dB of the work and Club's do none — Virtuosity's soft
snare is, at equal peak, very slightly *brighter* in the band than its hard
one, because a hard stroke drives the shell far more than it drives the stick.

### The table

| kit | voice | layers | rr | rr from | peak | longest | trim dB | size |
|---|---|---|---|---|---|---|---|---|
| club | `kick` | 4 | 3 | source | 0.900 | 800 ms | −4.5 | 1801 KB |
| club | `snare` | 4 | 3 | neighbours | 0.900 | 1000 ms | +0.0 | 1637 KB |
| club | `rim` | 2 | 2 | neighbours | 0.900 | 377 ms | −2.0 | 264 KB |
| club | `hat` | 4 | 3 | source | 0.900 | 400 ms | −3.8 | 884 KB |
| club | `hat_open` | 3 | 2 | source | 0.900 | 1500 ms | −3.0 | 1688 KB |
| club | `hat_pedal` | 2 | 2 | source | 0.900 | 400 ms | −12.3 | 300 KB |
| club | `ride` | 3 | 3 | source | 0.900 | 2500 ms | +0.0 | 4219 KB |
| club | `ride_bell` | 2 | 2 | source | 0.900 | 2000 ms | −7.0 | 1500 KB |
| club | `crash` | 3 | 2 | source | 0.900 | 3000 ms | −13.7 | 3375 KB |
| club | `tom_hi` | 3 | 2 | neighbours | 0.900 | 1500 ms | −4.9 | 1526 KB |
| club | `tom_lo` | 3 | 2 | neighbours | 0.900 | 1500 ms | −3.6 | 1688 KB |
| studio | `kick` | 4 | 3 | neighbours | 0.900 | 800 ms | −3.6 | 1780 KB |
| studio | `snare` | 4 | 3 | neighbours | 0.900 | 518 ms | +0.0 | 950 KB |
| studio | `rim` | 2 | 2 | neighbours | 0.900 | 245 ms | −4.6 | 168 KB |
| studio | `hat` | 4 | 3 | neighbours | 0.900 | 400 ms | −11.1 | 663 KB |
| studio | `hat_open` | 3 | 2 | neighbours | 0.900 | 1500 ms | −13.4 | 1688 KB |
| studio | `hat_pedal` | 2 | 2 | neighbours | 0.900 | 400 ms | −14.5 | 263 KB |
| studio | `ride` | 4 | 3 | neighbours | 0.900 | 2500 ms | −10.1 | 5575 KB |
| studio | `ride_bell` | 2 | 2 | neighbours | 0.900 | 2000 ms | −7.8 | 1500 KB |
| studio | `crash` | 3 | 2 | neighbours | 0.900 | 3000 ms | −4.6 | 3375 KB |
| studio | `tom_hi` | 3 | 2 | neighbours | 0.900 | 1500 ms | −0.1 | 1279 KB |
| studio | `tom_lo` | 3 | 2 | neighbours | 0.900 | 1500 ms | −3.0 | 1688 KB |

Both kits land inside the 10–20 MB the brief asks for, with the ride and the
crash the two biggest voices in each — they are the two that earn their length,
and they are the first two caps to shorten if a kit ever has to lose weight.

### club — a jazz kit, recorded like a live date

Austin McMahon's kit at Virtuosity in Boston, six mixable mic positions, the
library's own description a contemporary jazz kit recorded in the style of a
live club date. Four of the six mics are used: `kickmic` and `snaremic` close,
`oh` overhead, `mid` as a closer pair for the cymbals and toms, `room` behind.
`lofi` is the vintage mic and is a colour rather than a kit; `perc` is VSCO
percussion and is not a drum voice — it is the percussion set instead, below.
Weights are the brief's live-recording
default — close 1.0, overheads 0.7, room 0.35 — and the cymbals and toms,
which have no close mic in this library, use the overheads as their close mic
at 1.0 with `mid` at 0.4–0.6 for proximity.

**The stereo image is the overheads' own, turned round.** Measured on the
source, this library is imaged from *in front of* the kit: the hat sits 3.3 dB
right and the ride 3.9 dB left. The brief wants the drummer's seat, so the
recipe swaps the channels of the stereo mics — one swap, and the whole kit
turns at once: hat left, ride right, high tom left of low tom, exactly as the
brief describes, without a pan being invented anywhere. The mono close mics
stay centred, which is where a kick and a snare belong either way. Because the
image is in the files and is the real one, **no `pan` is written into
`kit.json`**; that field is for kits whose voices arrive mono.

**What the source would not give.** The ride has three velocity levels and not
four, so it ships with three layers; the engine's clamp sends a peak hit to
layer 3. Everything else met the contract. The snare, cross-stick and toms are
sampled 16 to 36 velocities deep with no round robins, so their round robins
are neighbouring dynamics, and their layers are spaced 8 dB apart rather than
the default 4.5 — at 4.5 dB all four layers sit in the top third of the range,
which is four flavours of a backbeat and no ghost note.

### studio — DRSKit, thirteen channels

"From jazz to rock", thirteen mic channels, 11 to 30 strokes per instrument
and every one a different power. Mixed with the close mic at 1.0, the
overheads at 0.8 and the ambience at 0.4; the kick takes both its mics
(`Kdrum_back` 1.0, `Kdrum_front` 0.7) and the snare takes both of its
(`Snare_top` 1.0, `Snare_bottom` 0.5).

**No channel swap here.** Measured on the source, DRSKit's overheads are
*already* in the drummer's seat — hat and left crash left, ride and right
crash right, toms running high-left to low-right. This is the kit where the
recipe's `pan` does real work, because its close mics arrive mono and have to
be placed inside the image the overheads already have.

**The snare's bottom mic is wired in opposition**, as a bottom mic usually is:
it points up at the wires while the top mic points down at the head, so the
two move against each other and summing them as they arrive cancels most of
the drum. Measured correlation on the hardest stroke: **−0.47**. The recipe
lists `Snare_bottom` under `flip_if_opposed`, the tool measures it, inverts it
and says so. It is an opt-in list rather than a blanket rule because between
an overhead and a close cymbal mic a negative correlation is a path-length
difference and flipping it would be wrong.

The library is 44.1 kHz and the contract is 48 kHz, so every stroke is
resampled on the way through.

**DRSKit's whisker articulations are a recorded Brushes kit waiting for a
recipe.** There are nine of them — `Snare_whisker`, `Snare_circle_whisker`,
`Hihat_closed_whisker`, `Hihat_open_whisker`, `Ride_whisker`,
`Crash_left_whisker`, `Crash_right_whisker` and `Tom1`–`Tom3_whisker` — a
complete brushed kit in the same thirteen channels, already downloaded, under
the same CC BY 4.0 line. A `brushes-recorded.json` is `studio.json` with the
articulation names changed and softer caps, which is half a day when the owner
asks for it, and it would retire the synthesised Brushes kit the way Club and
Studio retire the other four.

### What to change first if the owner says…

Every phrase below names one field in `scripts/sounds/recipes/<kit>.json`, so
a verdict is a one-line edit and a re-render rather than an investigation.
Re-render, then re-run `measure_kits.py`: the margins are a gate.

| if the owner says… | the field | which way |
|---|---|---|
| more room, more air | `voices.<v>.mix.room` (club) / `.amb` (studio) | up, 0.35 → 0.5 |
| drier, closer, tighter | the same | down, 0.35 → 0.2 |
| more crack on the snare | `voices.snare.mix.snaremic` / `Snare_top` | up; then `Snare_bottom` up for wire |
| less hat | `balance.hat` | down, −9 → −12 |
| the hats are lost | `balance.hat` | up; watch the kick-vs-hat gate |
| the kick is not there | `balance.kick` | up, −1 → +2 |
| the crash swamps it | `balance.crash` | down, −4 → −7 |
| the ghost notes are too loud | nothing here — that is `LEVEL_GAIN[3]` in the engine | |
| the soft hits sound like the loud ones | `voices.<v>.layer_step_db` | up, 4.5 → 8 |
| machine-gun on fast hats | `voices.hat.rr` | up to 3, if the source has them |
| the kit is too big | `voices.ride.cap_s` then `voices.crash.cap_s` | down; round robins last |
| the stereo is backwards | `swap_stereo` | flip it |
| the cymbals are washy | `voices.<v>.mix.oh` down, close mic up | |

## The synthesised kits

**room** — the app's Drum kit, in a room. This is the familiar one and the
safe default: a kick with a real shell under it, a medium snare on the same
three shell modes the metronome's snare kit uses (196 / 292 / 421 Hz), hats
with air in them, and four taps of darkened early reflection on every voice.
Its +3.13 dB snare margin is the narrowest of the four and lands almost
exactly on the drum kit's own +3.63 — deliberately, because this kit's job is
to sound like the app already sounds.

**tight** — dry and punchy, for funk and 16ths. No room at all, every decay
faster, the shell tuned up (210 / 318 / 455 Hz), and the hats moved to
7–15 kHz so consecutive 16ths stay separate instead of smearing into one
another. The shortest kit in the set, and the smallest: 125 KB.

**brushes** — for swing and bossa. Soft transients everywhere: the kick rises
over 5 ms instead of 1.5 and has almost no beater click, the snare trades its
crack for a long breathy wire ring, and the ride runs 400 ms so it can carry
the time on its own. The trap in this kit is that "soft" is very nearly
"absent" — the first version of its kick measured 1.6 dB *under* its own hat
through the band-pass, so the body layer is the loudest of the first four even
though the click is the quietest.

**raw** — a rock drummer close-miked in a dry room. See its own section below;
it is the only kit in the set that was built to a verdict rather than a spec.

**electronic** — 808-shaped. A long sine kick with a pitch drop and no shell
at all, a hand clap for the snare (four noise bursts 10 ms apart at the
accent, two at the plain beat — the same instrument, struck once instead of
by a room full of hands), a thin 9–16 kHz closed hat and an open hat that is
a filtered noise tail. The kick keeps an audible 1.2–3.5 kHz tick, and it is
not decoration: with no shell, the tick is the only thing standing between
this kick and inaudibility on a laptop.

## Raw, layer by layer

The fifth kit, added in the second pass. The first four were measured and
never heard, and the owner's verdict on them was that they are "the soundtrack
of a porno" — smooth, soft, no transient. Raw is decision-log entry B2: a rock
drummer close-miked in a dry room, judged on punch, and tuned A/B in
`scripts/sounds/ab.html` rather than signed off on a table.

Every voice here peaks at 0.900 like every other file in the set, so Raw
cannot be louder — it can only spend that peak better. Three things do the
spending, and they are the whole kit:

1. **A transient that arrives before the pitch does.** 2–4 ms of 2.5–8 kHz
   noise with a pair of high sine bursts under it, in front of everything
   else. That is the beater on the kick and the stick on the snare.
2. **A held peak.** The body stays at full for about 20 ms before the
   exponential decay starts, instead of decaying from sample zero the way the
   other four kits do. This is most of the difference between a punch and a
   thump.
3. **A look-ahead compressor.** Because the file is peak-normalised
   afterwards, every dB the compressor takes off the transient is a dB the
   normalisation hands back to the body — the same ceiling, more energy under
   it. The look-ahead is not a nicety: with a plain 0.5 ms attack the snare
   came out with an 18.7 dB crest factor and its peak at 0.2 ms, the *lowest*
   in-band energy of all five kits, because a single 0.2 ms spike had set the
   ceiling for the whole hit. A detector that only starts reacting once the
   transient arrives has already let it through.

And no room on anything. `room` is 0.0 for every voice; a dry room is the
brief, and every millisecond of decay belongs to the drum.

### Saying what to change

Each phrase below names one number in `RAW_SPEC` in `generate_sounds.py`, so
"the snare needs more wire" is a one-line edit and not an investigation.

| if it sounds… | the layer | the knob |
|---|---|---|
| not enough beater | kick click | `kick['click']` gain, then `kick['ping_gain']` |
| thin, no weight | kick body | `kick['body']` gain |
| too short a thump | kick hold | `kick['hold']` (ms at full before the decay) |
| boomy, 808-ish | kick pitch | `kick['sweep']` — raise the drop rate |
| not enough snares | snare wire | `snare['hi']['wire']`, `['lo']['wire']` |
| no crack on the backbeat | snare rimshot | `snare['rimshot']` gain (the hard hit only) |
| ringing too long | snare ring | `['wire_decay']` and `['body_decay']` up |
| soft hit too close to hard | snare dynamic | `['lo']['wire']` down, `['lo']['drive']` down |
| not hard enough | compression | `['comp']` ratio up or threshold down, then `['drive']` |
| hats dull | hat band | `hat['band']`, `hat['partials']` |
| ride washy | ride | `ride['ping_gain']` up, `ride['wash_decay']` up |

The two that interact: pushing `comp` and `drive` together widens the accent
margins as well as the loudness, and the margins are a measured gate. Change
one, re-run `measure_kits.py`, and read the absolute band-energy table above
as well as the margins — Raw's whole point is that it is loud on a laptop, and
the margin alone cannot see that.

### What it measures

`snare_hi` vs `snare_lo` is +5.82 dB and `kick` vs `hat` is +5.39 dB: wider
than every other kit (the previous widest were +4.84 and +5.06) because the
brief asks this one to clear the floor by more than the others, and under the
+6.39 dB that the metronome's snare accent was once rejected for as a shout.
The kick is the loudest in the set through the band-pass and the snare beats
both acoustic kits. `snare_lo` is the same drum with a third of the wire, no
rimshot, a shorter hold and a faster body — not a quieter file.

The one number worth watching on a future edit: Raw's kick fails the DC guard
if the release runs before the saturation. `_rb._saturate` subtracts the mean
of what it just produced, which lifts a tail that `_krelease` had landed on
zero back off the axis, and the 4 ms `fade_tail` then windows away a step that
size. On the first four kits the tail is too far down to matter; Raw's kick is
compressed with a 110 ms release and arrives at 150 ms near −38 dBFS, which
took the DC to 1.7e−04 against a 2e−04 limit. `_rfinish` releases *after* the
saturation for that reason, and the DC is 2.6e−05.

# The percussion set

The fifth pass added a percussionist, and a percussionist is not a drum kit.
The engine plays **one set under whichever kit is loaded**, so switching from
Club to Studio does not switch the congas — which is what happens in a room,
where the drummer and the percussionist are two people.

```
src-tauri/sounds/perc/club/kit.json
src-tauri/sounds/perc/club/<voice>.<layer>.<rr>.wav
```

That is the kit format, unchanged, and it is not a coincidence: the same
loader reads it, the same `render_kit.py` writes it and the same
`measure_kits.py` checks it. Ten voices instead of eleven, a 2.0 s ceiling
instead of 3.0, and one field a kit does not have — `pan`.

```sh
set YAMES_SAMPLES=C:\path\to\_samples
python scripts/sounds/render_kit.py scripts/sounds/recipes/perc-club.json \
       src-tauri/sounds/perc/club
python scripts/sounds/measure_kits.py
```

## Where it comes from

The same download as Club. Virtuosity Drums ships twenty-nine auxiliary
percussion maps alongside Austin McMahon's kit, which came into that library
from **VSCO 2 Pro** and were recorded and mapped separately — four mic
positions with the same names, a different room, different hands.

```
Virtuosity Drums — Versilian Studios and Karoryfer Samples (auxiliary percussion from VSCO 2 Pro)
```

CC0, so the credit is a courtesy rather than a condition, and it is in the
manifest and belongs on the About screen for the same reason the kits' are: a
musician who likes the congas should be able to find out whose they are.

**The nineteen maps left behind** are agogo, belltree, cuica, jinglebell,
sleighbells, timbales, triangle, vibraslap, whistle, woodblock and the fast
guiro. They are not worse recordings. They are not the ten instruments a
percussionist reaches for in latin, funk, pop and world grooves, which is what
this layer is for, and a triangle nobody wrote a part for is 300 KB of
installer.

## The table

| voice | source | layers | rr | peak | longest | trim dB | pan | size |
|---|---|---|---|---|---|---|---|---|
| `shaker` | `shaker_up` + `shaker_down` | 1 | 2 | 0.900 | 632 ms | −17.6 | +0.35 | 210 KB |
| `tambourine` | `tambourine` | 2 | 3 | 0.900 | 993 ms | −10.8 | −0.30 | 661 KB |
| `cowbell` | `cowbell` | 3 | 3 | 0.900 | 569 ms | −6.8 | +0.20 | 807 KB |
| `cabasa` | `cabasa` | 2 | 3 | 0.900 | 593 ms | −14.1 | +0.30 | 428 KB |
| `claves` | `claves` | 3 | 3 | 0.900 | 534 ms | +0.0 | −0.20 | 609 KB |
| `guiro` | `guiro_slow` | 1 | 3 | 0.900 | 968 ms | −6.9 | −0.35 | 506 KB |
| `conga_hi` | `conga_muted` + `conga_open` | 3 | 3 | 0.900 | 881 ms | −5.3 | −0.15 | 1234 KB |
| `conga_lo` | `tumba` | 3 | 3 | 0.900 | 840 ms | −10.8 | −0.15 | 1223 KB |
| `bongo_hi` | `bongo_high` | 3 | 3 | 0.900 | 669 ms | −6.5 | +0.25 | 945 KB |
| `bongo_lo` | `bongo_low` | 3 | 3 | 0.900 | 649 ms | −6.9 | +0.25 | 1038 KB |

**71 files, 7.48 MB**, 48 kHz 16-bit stereo, every file landing on zero at
both ends. The whole percussionist costs less than half of either drum kit.

## What the source could not do, and what was done instead

Three of the ten did not fit the shape the brief assumed, and in each case the
library's answer was taken rather than a layer invented. `render_kit.py` will
say so when it runs; the measurements are here so the decisions can be argued
with rather than rediscovered.

**The shaker has one layer, not two.** `shaker_up` and `shaker_down` are two
maps because an up-stroke and a down-stroke are two sounds, and the contract
makes them the two round robins of one voice — a shaker alternates by nature,
so on sixteenths the set really does play up-down-up-down. But each map is
sampled at a single dynamic, and the seven shakes inside it span **4.6 dB**
(up) and **1.6 dB** (down). A second layer out of 1.6 dB is two files of the
same sound. A shaker's accent is in the hand, and the hand is `LEVEL_GAIN`.

In the source the up-stroke is 8 to 11 dB quieter than the down-stroke, which
is the instrument and not the session. Peak normalisation lands both at 0.900,
so what alternates in the set is the *timbre* of the two strokes, which is
what a listener hears anyway.

**The guiro has one layer** for the same reason: one dynamic, eight scrapes,
**3.7 dB** between the softest and the hardest — under the 4.5 dB step a
second layer would have to be worth. `guiro_fast` is skipped because the
contract skips it, and the contract is right: a fast scrape is a different
stroke, not a louder one, and a groove that wants one should say so in the
part.

**The tambourine has two layers out of its round robins.** This is the drums'
problem exactly inverted. Virtuosity's *drums* have 16 to 36 velocities and no
round robins, so `pick_rr` borrows a neighbouring velocity when it needs a
second performance. Its tambourine has one velocity band and *ten shakes in
it*, because a tambourine is not a drum you strike at a chosen force — you
shake it, and ten shakes by a human being are not the same loudness. Measured,
they span **8.2 dB**, which is wider than several instruments here that *were*
sampled in bands. So `rank_rr_as_dynamics` ranks them by loudness and gives
each its own dynamic index, and every function downstream then works
unchanged and works correctly.

**`conga_muted` is layer 1 of `conga_hi`.** No velocity of an open stroke is a
palm laid on the head, however softly it is struck — so this is an
articulation standing in for a velocity band, which is what `combine: layers`
in the recipe is for. The engine plays layer 1 on a ghost, so the muted stroke
lands exactly where a tumbao wants it.

**The tumba's softest band was left alone.** It has four dynamics and three
are taken; one of the eight strokes in the bottom band is 30 dB under its
siblings, and a band that inconsistent is not a performance anyone would play.
The three that ship sit at −46.9, −41.3 and −34.4 dB in the source, about
5.5 dB apart, which is a better ladder than the four would have been.

**Three round robins wherever the source has three**, which is everywhere but
the shaker. This is not padding for the size target: a clave pattern and a
conga tumbao repeat all night, and two round robins on a tumbao is a machine
gun. The source has seven or eight strokes per dynamic for every instrument
here, so none of these is borrowed from a neighbour.

**The guiro is capped at 1.0 s and not the 0.6 s the brief guessed at.** A
scrape is not a decay. Capping a cymbal lands its tail; capping a scrape lifts
the stick halfway through the stroke, and 0.6 s did exactly that on every
file. Measured, the slow scrape runs 0.97 s — which is also about how long a
cha-cha wants it, beats one and two at 120.

## The balance, and why it is measured outside the folder

A kit is levelled against its own snare. **A percussion set has no snare**, and
levelling it against its own loudest voice would make it internally tidy and,
next to a drummer, either inaudible or all you can hear. So `balance_ref` in
the recipe points at the club kit's snare accent — the same file every kit
voice is already measured against, so a number in `balance` means the same
thing in both recipes.

The contract sets the targets and nine of the ten land on them within 0.05 dB.

| | K-weighted vs the snare | step | small speaker |
|---|---|---|---|
| `conga_lo` | −3.98 dB | — | −13.20 dB |
| `conga_hi` | −4.02 dB | 0.04 | −7.58 dB |
| `cowbell` | −5.95 dB | 1.94 | −1.24 dB |
| `bongo_hi` | −6.00 dB | 0.05 | −2.49 dB |
| `bongo_lo` | −6.04 dB | 0.04 | −4.87 dB |
| `tambourine` | −7.98 dB | 1.94 | −11.85 dB |
| `claves` | −8.10 dB | 0.13 | −8.41 dB |
| `guiro` | −8.95 dB | 0.85 | −4.57 dB |
| `cabasa` | −11.98 dB | 3.03 | −18.24 dB |
| `shaker` | −12.04 dB | 0.06 | −13.66 dB |

Ten voices inside 8.06 dB, the widest step 3.03 dB.

**The claves are the tenth and they land 2.1 dB under their −6.** At peak
0.900 that is as loud as a clave *gets* over a 400 ms window — it is a 3 ms
click on a stick, and there is very little of it to weight. The honest answer
is the one the tool gives: `trim_db` is clamped at 0, because a positive trim
asks the engine to play a file louder than the ceiling every other file was
normalised to. The claves are as loud as they get.

**The two columns disagree and the disagreement is the point.** The cowbell
lands 5.95 dB under the snare K-weighted and **1.24 dB** under it through the
small-speaker band-pass, because a cowbell lives at 800 Hz, in the middle of
the window a laptop speaker radiates. The cabasa lands 11.98 dB under
K-weighted and **18.24 dB** under on a laptop, because it lives above 6 kHz
and the 4 kHz low-pass takes nearly all of it. Neither is a bug and it is the
same effect this document already documents for the kick and the hi-hat: on
headphones the balance is right, and on a laptop a cowbell is a cowbell.

## `pan`, and why it is in the manifest

Ten instruments in the hands of one player are not all in the same place, and
the set is the first folder in the tree to say where its voices sit. `pan` is
**not baked into the files**: where a voice is placed is one number to argue
with, and a file that arrived panned could never be moved back to the middle.
A mono mic is written centred and a stereo pair keeps the image the room gave
it; the manifest's pan places whatever that adds up to.

`swap_stereo` is **off** here and **on** for Club, and that is not an
inconsistency. The kit is swapped because its overheads were imaged from in
front of the kit and the brief wants the drummer's seat. The percussion is a
different recording of a different room, and there is no drummer's seat to put
anyone in. Measured on the source it is nearly centred anyway: the widest
instrument sits 4.6 dB right and the narrowest 0.2 dB left, so the files carry
a little real width and nothing that could be called a placement. Seven of the
ten pans agree with the direction the room already leaned; the tambourine and
the guiro are asked to cross about 1 dB of it, which a 0.3 pan swamps.

## The mics

Every one of the ten has all four positions, which the cymbals and toms in
Club do not. **The overheads lead and the close mic follows**, which is the
opposite of the kick and the snare and is right for the reason those are not:
a percussionist is heard in the room, and a close mic on a shaker is a
recording of a hand.

| | `oh` | `close` | `mid` | `room` |
|---|---|---|---|---|
| shaker, tambourine, cowbell, cabasa, claves, guiro | 1.0 | 0.45 | 0.35 | 0.3 |
| congas, bongos | 1.0 | 0.7 | 0.4 | 0.3 |

The struck and shaken metal and wood cut through anything and want air more
than proximity. The congas and the bongos are drums with heads and the body of
a head is in the close mic — still under the overheads, because a conga mixed
like a kick arrives in front of the drummer instead of beside them.

**The mic names are written twice in this library and differently each time.**
The drums put the mic in the directory *and* at the front of the file name
(`Samples/oh/snare/oh_snare_buzz_vl7.flac`). The percussion puts it in the
directory as `oh` but at the END of the file name as a word
(`Samples/perc/oh/conga/Conga_22_HitN_1_50_rr1_Overhead.wav`, whose close mic
is `..._rr1_Close.wav`). `mic_tag` in the recipe is that translation, and
without it the close mic is never found for any stroke, the mix silently drops
the channel it was weighted for, and the only symptom is a set with no
proximity in it.

## What to change first if the owner says…

| if the owner says… | the field in `recipes/perc-club.json` | which way |
|---|---|---|
| the shaker is a hiss | `balance.shaker` | down, −12 → −15 |
| I cannot hear the congas | `balance.conga_hi` / `.conga_lo` | up, −4 → −2 |
| the cowbell is too much on my laptop | `balance.cowbell` | down; it sits in the laptop's band |
| the percussion is all on one side | `voices.<v>.pan` | toward 0 |
| it sounds like one instrument | `voices.<v>.pan` | wider, ±0.2 → ±0.4 |
| machine-gun on the tumbao | `voices.conga_hi.rr` | already 3, the source's limit |
| the tambourine rings too long | `voices.tambourine.cap_s` | down, 1.0 → 0.7 |
| more room on the percussion | `voices.<v>.mix.room` | up, 0.3 → 0.45 |
| the congas are in front of the drummer | `voices.conga_*.mix.close` | down, 0.7 → 0.5 |
| the ghost strokes are too loud | nothing here — that is `LEVEL_GAIN[3]` | |
| the set is too big | `voices.<v>.rr` on the congas and bongos | down to 2, 2.4 MB back |

**To hear it:** `scripts/sounds/ab.html` has a *Percussion* switch that plays
the set under whichever kit is selected — a shaker on every sixteenth, a conga
tumbao, and a tambourine on 2 and 4. It applies each voice's `pan` with a real
panner, so the widths can be judged rather than read.

# The melodic voices

The drums became a band in the third pass and the bass and the keys did not:
they were the sines the drums used to be. Four of the five melodic voices are
now **recordings**, in the same shape a kit is — a folder, a manifest, and one
file per sampled note — rendered by `scripts/sounds/render_voice.py` from CC0
libraries that are not in this repository.

```
src-tauri/sounds/voices/<voice>/voice.json
src-tauri/sounds/voices/<voice>/<midi>.<layer>.<rr>.wav
```

```sh
set YAMES_SAMPLES=C:\path\to\_samples
python scripts/sounds/render_voice.py scripts/sounds/recipes/bass_fingered.json \
       src-tauri/sounds/voices/bass_fingered
python scripts/sounds/measure_kits.py          # checks the voices too
```

`scripts/sounds/ab.html` plays them: the same two bars of rock with a bass line
and a Rhodes comp over them, switchable voice by voice.

## What ships, measured

| voice | notes sampled | worst stretch | worst tuning | layers | rr | longest | on disk | decoded | `trim_db` | `release_ms` |
|---|---|---|---|---|---|---|---|---|---|---|
| `bass_fingered` | 6 | 2 st | +2.7 ¢ | 3 | 2 | 2.00 s | 6.59 MB | 62.1 MB | +0.00 dB | 250 ms |
| `bass_picked` | 8 | 2 st | −2.4 ¢ | 2 | 2 | 2.00 s | 5.86 MB | 40.1 MB | −2.82 dB | 250 ms |
| `bass_upright` | 6 | 3 st | −2.9 ¢ | 3 | 2 | 2.00 s | 6.52 MB | 60.3 MB | +0.00 dB | 60 ms |
| `epiano` | 10 | 3 st | +2.8 ¢ | 3 | 1 | 2.50 s | 5.72 MB | 43.1 MB | −2.53 dB | 250 ms |

Every file is mono, 48 kHz, 16-bit, peak 0.900, both ends on zero — the kit
rules, unchanged. The bass banks are built for MIDI 28–55 (E1–G3) and the keys
for 48–84 (C3–C6); **"worst stretch" is the furthest any note in that range
sits from a sample it can be built out of**, and `voices::MAX_STRETCH_SEMITONES`
is three. **"Worst tuning" is the furthest any file is from concert pitch on
its own sustain**, gated at ±5 cents here and again in `voices/tests.rs`.

`bass_slap` is **not** recorded — see below — and plays the synthesised recipe,
as do `organ`, `clav`, `pad` and `synth`, which were never in scope.

### The libraries, and the credit lines as they must appear

All three are CC0, which requires nothing and is therefore thanked rather than
complied with. Both lines are in the manifests and belong on the About screen:
a musician who likes a bass should be able to find out whose it is.

| voice | library | get it from |
|---|---|---|
| `bass_fingered`, `bass_picked` | Black And Blue Basses 1.0.0.2 | `karoryfer.com` (1.0 GB zip) |
| `bass_upright` | Karoryfer Meatbass 1.0.0.1 | `karoryfer.com` (255 MB zip) |
| `epiano` | jRhodes3c | `github.com/sfzinstruments/jlearman.jRhodes3c` (git clone) |

```
Black And Blue Basses — Karoryfer Samples
Meatbass — Karoryfer Samples
jRhodes3 — a 1977 Rhodes Mark I Stage 73 sampled by Jeff Learman
```

## The four decisions that shaped these banks

### 1. A bank is a handful of notes, because a bass note does not stop

A kit file is a transient and a decay. A bass note is as long as the player
held it, and all three of these libraries record five seconds of it. Every
single file in all three bass banks runs to its **2.0 s cap**: the tail search
never fires, because a wound string is nowhere near 60 dB down two seconds
after it is plucked. So a note costs 188 KB whatever pitch it is, and the only
lever on the size of a bank is how many notes are in it.

That matters more than disk, because **a bank lives decoded**. The engine
builds every note of the range from the nearest sample at load, so the four
banks above sit at 40–62 MB resident against the 96 MB `voices::MAX_BANK_BYTES`
allows. Sampling every third semitone — the density `voices.rs`'s own comment
sizes a bank at — would be sixty files, 11.3 MB on disk and past 100 MB
decoded.

So the electric basses take six notes a fourth apart, or eight a major third
apart, which leaves nothing further than two semitones from a sample — and E2
is one of them, because that is the note the engine measures a bass's level on.

**The trade, stated plainly:** these instruments ring longer than the bank lets
them. The Rhodes pays most — jRhodes3c is the *looped* set, so its samples
sustain on a loop point rather than decaying, and every note runs to the 2.5 s
cap and lands on a 30 ms fade instead of ringing out under a held chord.

### 2. The level is K-weighted, for the second time in this document

The brief said to set `trim_db` through the small-speaker band-pass so each
recorded voice sits where the synthesised one sat. Measured that way, a
recorded fingered bass reads **+14 dB over the recipe it replaces** and wants a
**−15 dB** trim.

That is the band-pass working exactly as designed, and the same trap the
recorded kits fell into one section above: it starts at 200 Hz, an E1 is
41 Hz, and the synthesised bass is very nearly a sine. Through that filter the
recipe is almost silent and anything with real harmonics on it reads enormous.
A bass trimmed 15 dB to match a filter that cannot hear either instrument is a
bass the owner cannot hear.

The proof that it is the filter and not the bank is in the Rhodes. Where an
instrument has energy where a laptop radiates, the two meters agree:

| voice | K-weighted, recorded vs recipe | band-pass, same files | trim taken |
|---|---|---|---|
| `bass_fingered` | −1.9 … +3.2 dB | +7.2 … +17.8 dB | +0.00 dB |
| `bass_picked` | +0.4 … +5.3 dB | +7.6 … +15.7 dB | −2.83 dB |
| `bass_upright` | −4.0 … +2.6 dB | +1.6 … +21.6 dB | +0.00 dB |
| `epiano` | +1.4 … +4.8 dB | +1.7 … +18.7 dB | −2.54 dB |

On the Rhodes' top four notes the two columns agree to a quarter of a decibel
— at E5 to two hundredths. On the upright's bottom note they are 20 dB apart.
So the trim is
**K-weighted over the synthesised note's own length**, and the band-pass figure
is measured and printed for every note beside it so the departure is visible
rather than quietly decided. Both trims that came out positive are clamped to
zero, because every file was written at peak 0.900 and a positive trim asks the
engine to push past the ceiling the whole app is normalised to.

The window is the synthesised note's own length — 0.45 s for the fingered bass,
0.70 s for the Rhodes — because the recording runs to a 2.0 s cap and the
recipe does not. Summed whole, the comparison would be measuring a duration.

### 3. Every bank arrived out of tune, and was retuned

All three libraries are good recordings of real instruments, and not one of
them was at concert pitch. Measured through the loader on each note's sustain,
before anything was done about it:

| voice | worst note, before | after | files retuned | the shape of it |
|---|---|---|---|---|
| `bass_fingered` | **+15.0 cents** | +2.7 | 15 of 36 | goes flat up the neck |
| `bass_picked` | **−16.3 cents** | −2.4 | 24 of 32 | wanders note to note |
| `bass_upright` | **−13.3 cents** | −2.9 | 20 of 36 | in tune; the attack is not |
| `epiano` | **+8.1 cents** | +2.8 | 23 of 30 | the whole set at about A=442 |

Per sampled note, worst layer and round robin, before → after in cents:

```
bass_fingered  F#1 +12.5→−0.5   B1 +15.0→+1.7   E2  +3.0→+2.7
               A2  −1.9→−1.9    D3 −6.3→−1.8    G3  −9.3→−0.4
bass_picked    E1 +10.3→−0.2    G#1 +7.4→+0.0   C2  −3.4→−2.2   E2 −5.2→−0.8
               G#2 −2.4→−2.4    C3 −3.6→+0.3    E3 −16.3→−0.5   G3 −3.6→−0.5
bass_upright   F#1 +6.6→+1.8    A1 −13.0→−2.9   C2 −13.3→−1.8
               F#2 +5.6→−2.9    C3  +4.7→+1.9   F#3 −9.6→−2.0
epiano         A2 +4.8→+0.4     D3 +8.1→+2.8    G3 +4.5→−0.5   B3 +3.1→+2.4
               D4 +5.5→+0.1     F4 +0.4→−0.3    B4 +4.0→−0.2   E5 +4.8→−0.2
               A5 +4.6→−0.2     D6 +4.0→−0.0
```

Sixteen cents is a sixth of a semitone. Against a guitar the owner has just
tuned, that is a slow beat on every held note — and it was invisible, because
the only pitch check that existed was an octave guard, which is the right tool
for a `key_offset` that is wrong and no use at all for this.

**Measured on the sustain, and that is the whole trick.** A plucked string is
not at its pitch while it is still settling: over its first half second the
upright reads **twenty to thirty cents flat**, and over its second half second
it reads in tune, because a thick string starts slack and tightens as the
initial displacement dies away. Tuning a bank on its attack would sharpen every
note of it by a quarter of a semitone to fix a transient nobody hears as pitch.
So the window is 0.25–0.75 s from the onset; the lag is searched only within a
quarter tone of the period the note claims, because a broad search on a bright
low string eventually finds a harmonic and reports a confident wrong answer;
and a parabola through the peak's neighbours takes the resolution from a whole
sample — about four cents at a bass's pitch — to a hundredth of one.

**Corrected by resampling.** A bass sampled a few cents flat was *played* a few
cents flat, so stretching the waveform by that ratio is restoring the take
rather than processing it. Six cents is three parts in a thousand — a two
second note becomes 1.9994 s — which is why nothing downstream has to know.
The ratio is folded into the 44.1 → 48 kHz conversion the note needed anyway,
so a retuned note is filtered once and an already-in-tune note takes the old
road bit for bit; that is why re-rendering moved 82 files of 134 and left the
rest byte-identical.

Anything past **three** cents is corrected and the gate is at **five**. The two
between them are the resampler's rounding, the dither, and the difference
between a note as rendered and the same note as the engine rebuilds it at
another pitch — correcting at the gate would ship a bank that passes on this
machine and fails on a device that opened at 44.1 kHz.

The measurement lives once, in `measure_kits.py`, and the render tool imports
it: a bank tuned by one measurement and checked by another passes its own gate
and nobody else's. `voices/tests.rs` holds the third copy, in Rust, and gates
every shipped bank the same way at ±5 cents.

What is *not* fixed: a note that drifts within itself. The fingered G3 is 9.6
cents flat over its first half second and 10.3 over its second, and one ratio
cannot flatten a curve. That drift is the instrument.

### 4. Three layers, and never more

`voices::MAX_LAYERS` is four, and `jam::voice_layer` maps a line's gain to
**one, two or three** and clamps to what the bank has. A fourth layer is a file
the engine cannot index, at a third again of the folder and of the memory it
decodes into. So the brief's "five for the Rhodes if the source has them" is
not a size question at all: the source has five, the format takes four, and the
selector asks for three.

And the two libraries disagree about what a layer *is*, which is why the render
tool has two ways to build one:

* **Karoryfer recorded their dynamics at the level they were played**, so
  measuring the files finds the ladder. Their four are closer together than
  the 5–6 dB the brief assumed — p to f is 8.6 dB on the fingered bass — so
  the widest even ladder available is 4.4 and 4.3 dB, on p, mp and f.
* **jRhodes3 did not.** Its five layers sit inside 1.9 dB with the *softest*
  measuring louder than the hardest, because an SFZ player is expected to
  supply the level from velocity (`amp_veltrack` defaults to 100 and the map
  sets no `volume`). Measured for loudness that ladder comes out as three
  neighbours in the wrong order and the soft Rhodes is lost entirely. So that
  bank is ordered by **velocity band**, which is what its layers actually
  carry: how much bark is on the tine.

Both end in the same place, because that is how the engine works too —
`voice_layer` picks the layer and the line's `gain` carries the level.

## Voice by voice

### bass_fingered — a black hollowbody, under the fingers

Karoryfer's Black And Blue Basses, `darkblack`, `reg` articulation. Sampled at
F♯1, B1, E2, A2, D3 and G3; three layers from the library's p, mp and f; two
round robins of the four it holds. The `ghost`, `stac` and `btb`
(behind-the-bridge) articulations are a different voice and are left out.

### bass_picked — a blue solidbody, under a pick

The same library, `babyblue`, `reg` — not the `fake_det` and `fake_ntp` maps,
which are a detuned and a no-tone-pot variant of the same performances and are
a colour rather than a dynamic.

**It declares two layers, and that is the honest number.** Karoryfer recorded
this bass at f and ff only, and those two are **1.6 dB apart** — what separates
them is the pick, not the level. `voice_layer` clamps to the layers a bank has,
so a soft line plays f and anything from normal up plays ff: "the nearest layer
present", done by the engine instead of by a duplicated file. The third of the
folder that saves went into two more sampled notes, which is why this is the
densest of the three basses at a worst stretch of two semitones from eight
sampled pitches.

### bass_upright — a double bass, pizzicato

Meatbass, `pizz`. The `arco` articulations are a bowed instrument and a
different voice; `perc` is the body being hit and is not a note.

**This is the one bank whose note grid is the library's and not the tool's.**
Meatbass samples every third semitone, so the five-semitone spacing the
electric basses use is not on offer: the choice is every 3 (ten notes in range,
11.3 MB, past what a voice is allowed) or every 6. It takes F♯1, A1 and C2 —
the library's own spacing, three semitones — and then every six up to F♯3,
which keeps the whole bottom octave, where a line actually walks, within a
semitone of a sample, and spends **the worst
stretch of three semitones on E♭2, A2 and E♭3**. Three is the engine's limit
rather than a comfortable number, and this voice sits on it.

Its release is **60 ms and not the source's own**. Meatbass declares
`ampeg_release=0.001` with `ampeg_sustain=0`, which is a library saying "the
sample *is* the decay, there is no release stage" — the decay lives on CC102
and the player lets the note ring. One millisecond in our mixer is a step to
zero, and a step is a click on every note.

### epiano — a 1977 Rhodes Mark I Stage 73

jRhodes3c, the **mono** set: a melodic bank is mono by contract, and this
library's stereo files are the mono ones with a mid-side pitch-shift doubling
that cancels when they are summed, so folding them would spend the decode on an
effect that deletes itself.

Ten notes, which for once the tool did not choose: jRhodes3 samples every
fourth white key, so the grid is the player's and this bank keeps every pitch
it has from A2 to D6. A2 and D6 are outside the 48–84 the keys line asks for
and are in the bank anyway, because without them C3 and C6 would be built from
a sample three semitones off when one two semitones off exists. The single
six-semitone gap the set leaves between F4 and B4 is where the worst stretch of
three lands.

Its release is the source's own `0.300`, clamped to the 250 ms
`voices::MAX_RELEASE_MS` allows — the longest release of any voice here, and
still asking for more than the format gives it.

### bass_slap — not recorded, and why

**There is no free slap source.** The brief allowed for one if a CC0 Karoryfer
bass had a slap articulation; none of the ones downloaded does. Black And Blue
offers ghost, staccato and behind-the-bridge on the hollowbody and detuned and
no-tone-pot variants on the solidbody; Meatbass offers arco, pizzicato and body
percussion. None of those is a thumb and a pop, and rendering one of them into
a folder called `bass_slap` would be labelling a sound with an instrument it is
not.

So `slap` keeps the synthesised recipe, which `BASS_VOICE_TRIM` already holds
at the same level as the other four. A player switching to it hears a change of
instrument and not a change of volume, which is the property that matters —
and if a slap library ever turns up, it is a recipe and a re-run.

## What to change first if the owner says…

| if the owner says… | the field in `scripts/sounds/recipes/<voice>.json` | which way |
|---|---|---|
| the bass is too loud / too quiet | nothing here — `trim_db` is measured. Move `BASS_VOICE_TRIM` in `jam.rs` | |
| the bass notes run into each other | `release_ms` | down, 250 → 120 |
| the notes cut off too abruptly | `release_ms` | up, to 250 at most |
| it sounds out of tune in places | `notes` | more of them; watch the size |
| the soft lines sound like the loud ones | `layer_step_db` | up, 5.5 → 8, if the library has the range |
| the bank is too big | `notes` first, then `cap_s` | down; round robins last |
| repeated notes sound machine-gunned | `rr` | up to 3, if the source has them |
| the Rhodes stops too soon under a held chord | `cap_s` | up, 2.5 → 3.5; costs 40 % of the folder |
| it is an octave out | `source.key_offset` | ±12 — and the render tool will refuse it |
| it beats against my guitar | nothing here — tuning is measured and corrected per note. Re-render and read the before/after table | |
| the attack sounds flat on the upright | nothing here either — that is the string settling, and the sustain it resolves to is what was tuned | |

## The rules these were built to

Short form; `scripts/sounds/rebuild.py`'s module docstring is the history, and
it is worth reading before changing a number.

1. **Energy in 200 Hz–4 kHz, or a laptop cannot reproduce it.** Every kick
   here carries a mid-band body layer, not just a short beater click: a 6 ms
   transient raises the peak almost 1:1 and adds almost no loudness, which is
   the worst possible currency when the budget is peak.
2. **Balance layers by energy, never by peak.** A sine has an 11 dB crest
   factor and noise has 20, so normalising both to 1.0 hands the sine 9 dB
   for free. That is how a snare accent once became a sub-bass kick with a
   whisper of snare on it.
3. **Loudness at a fixed peak comes from duration.** A respectable peak and
   almost no loudness is what "shy" sounds like.
4. **An accent is the same drum hit harder, not a different drum.**
   `snare_hi` and `snare_lo` share their shell modes in every kit. Only what
   a player's arm changes — ring decay, crack, stick, duration — differs.
5. **Saturate, do not divide by the peak.** A tanh curve holds the ceiling
   while keeping the loudness peak division throws away.
6. **Land the decay on zero; do not cut it there.** Every voice gets a
   raised-cosine release over its last quarter before the 4 ms tail fade.
   The kicks are why: they reach the end of their allotted 130–180 ms still
   at 8–12% of full scale, where a 4 ms fade is a fifth of a cycle at 50 Hz
   and is itself an amplitude step. It showed up as a DC offset an order of
   magnitude above every other voice, and the release took it from 1.0e−03
   to 3.1e−05.

# The click presets

Not a jam kit and not in a folder: the metronome's own eight presets, loose
WAVs at the top of `src-tauri/sounds/`, 44 100 Hz and 16-bit mono, embedded by
`include_bytes!` in `engine.rs`. Until 2026-09-14 they were all synthesised;
five are recordings now. Until 2026-09-15 each was a PAIR — a downbeat and a
plain beat — and each is a set of THREE, because a bar of 6/8 has a middle and
the middle has to be a sound rather than a volume (`plans/CLICK_ACCENTS.md`).

```sh
python scripts/sounds/render_click.py            # all fifteen recorded files
python scripts/sounds/render_click.py --measure  # the numbers, write nothing
python scripts/sounds/rebuild.py --synth-only    # the synthesised ones
python scripts/sounds/bars_6_8.py                # two bars of 6/8 as WAVs
python -m http.server 8123   # then /scripts/sounds/ab_click.html to hear them
```

## What the three strokes are

| preset | downbeat | middle | plain beat | source |
|---|---|---|---|---|
| click | 1200 Hz | **980 Hz**, damped at 140/s | 800 Hz | synthesised, `rebuild.py` |
| sticks | stick-shot vl6 | **stick-shot vl3** | cross-stick vl14 | Virtuosity snare |
| wood | high block vl6 | **high block vl3**, trimmed dry | low block vl6 | Virtuosity woodblock |
| beep | 880 Hz | **760 Hz**, damped at 53/s | 660 Hz | synthesised, `rebuild.py` |
| drum | kick + hat + crash + body | **kick + body**, no cymbal | noise snare | synthesised, premixed in `SoundBank::new` |
| kit | kick 0.70 + snare L4 | **snare L3 alone**, no kick | closed hat L1 | Studio (DRSKit) |
| snare | snare L4, drive 1.5 | **snare L3, drive 1.1** | snare L1, drive 0.8 | Studio (DRSKit) |
| cowbell | v3, four mics | **v3, overhead + room** | v2, four mics | Virtuosity cowbell |

Twenty-one files plus drum's five layers, of which **`render_click.py` owns
fifteen** — the recorded presets, three strokes each — and `rebuild.py` owns
the rest. `generate_sounds.py` owns none of them any more and its header says
so; running it with no arguments still rewrites the synthesised ones with
files that are *not* what ships.

## The rules a click file obeys

1. **Three peaks, and they are the whole level convention**: 0.970 for a
   downbeat, 0.930 for a middle, 0.900 for a plain beat. A kit voice is always
   0.900; a click accent is allowed 0.970 so that it cannot clip before the
   user's volume does. `click_*` and `beep_*` predate the convention and sit
   where they were synthesised (about 0.90, and 0.987 for `beep_high`).
2. **Mono, 44 100 Hz, no round robins, no velocity layers, no drift.** A
   metronome is a machine. Where a library had several takes of a dynamic, the
   MEDIAN by RMS is used — not the loudest, which is the take that got away
   from the player, and not the first, which is whichever the library wrote
   down first.
3. **DC blocked, trimmed to a stated floor, landed on zero at both ends, TPDF
   dithered.** A tail cut rather than faded is a second, unintended click on
   every beat, and five of the original ten did exactly that.
4. **The peak does not set the loudness and must not be trusted to.** At a
   fixed peak a softer stroke is usually LOUDER, because its peak is not spent
   on a stick transient. The level is built per file out of the layer, the
   tanh drive, the mic blend and where the trim cuts — see `render_click.py`'s
   header, which is the long version of this sentence.
5. **A middle stroke is a different sound, never a scaled copy.** Held to it
   by `a_middle_stroke_is_a_different_sound_from_both_its_siblings` in
   `engine.rs`, and placed between its siblings by
   `every_medium_accent_sits_between_its_strong_and_its_beat`.
6. **The three strokes of a preset start together** — every middle lands
   within 0.14 ms of its own downbeat, so a bar never flams
   (`a_kits_three_strokes_start_together`).
7. **A file the owner has heard does not change.** Nineteen of them are pinned
   by hash in `the_shipped_click_files_are_the_ones_that_were_heard`;
   `sticks_low` matters most, because the jam's count-in plays it.

## The credit lines, as they must appear

Same two libraries as the recorded jam kits, and the same obligations. Nothing
from either library is in this repository — only the strokes cut from them.

- **Virtuosity Drums** — Versilian Studios / Karoryfer Samples, **CC0**. The
  woodblocks, the cowbell, the stick-shot and the cross-stick. No attribution
  is required; it is given anyway.
- **DRSKit**, via the already-rendered Studio kit — DrumGizmo,
  **CC BY 4.0**. The snare and kick and hat behind the `snare` and `kit`
  presets. Attribution **is** required, and is already carried: these strokes
  are cut from `src-tauri/sounds/kits/studio/`, so the Studio kit's own credit
  line covers them — the one in *The credit lines, as they must appear* above
  and the `soundsCredit` string on the About screen, which names both
  libraries. No new line is owed; if the Studio kit ever leaves, these six
  files still owe this one.
