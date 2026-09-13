# The jam kits

Five drum kits for Jam mode, eight voices each, all synthesised. Written by
the `--kits` section of `generate_sounds.py`; every number below is measured
by `scripts/sounds/measure_kits.py` and can be regenerated rather than
trusted:

```sh
python generate_sounds.py --kits         # write the 40 files
python scripts/sounds/measure_kits.py    # check them, print this table
```

Both are deterministic — seeded noise and arithmetic, no input files — so a
rebuild produces the same bytes. Verified across two runs: all 40 files
byte-identical.

**To hear them rather than read them:** `scripts/sounds/ab.html` plays the
same two bars of rock on each kit, with one set of per-voice levels applied to
all five, and swaps kits at a bar line so the comparison is like for like. It
needs a local server, because a browser will not read WAVs off `file://`:

```sh
python -m http.server 8123      # from the repository root
# then open http://localhost:8123/scripts/sounds/ab.html
```

> **Do not run `python generate_sounds.py` with no arguments** unless you mean
> to. Its legacy section rewrites `click_*`, `wood_*`, `beep_*`, `drum_*` and
> `chime_*` with files that are *not* the ones the app ships — those are
> maintained by `scripts/sounds/rebuild.py` now. `--kits` skips it.

## For the engine

Mono, 16-bit, 44.1 kHz, peak 0.900 in every file. Voice names are stable;
`include_bytes!` them as `kit_<kit>_<voice>.wav`.

**Peak is uniform on purpose.** The files carry timbre and duration and the
engine carries balance. `snare_lo` is *not* pre-attenuated — it is the same
drum struck softly, at the same ceiling, and the per-voice gain makes it a
backbeat or a ghost note. Anything that wants a hit to be quieter should
turn it down rather than asking for a quieter file.

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

## The kits

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
