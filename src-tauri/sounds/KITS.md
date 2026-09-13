# The jam kits

Four drum kits for Jam mode, eight voices each, all synthesised. Written by
the `--kits` section of `generate_sounds.py`; every number below is measured
by `scripts/sounds/measure_kits.py` and can be regenerated rather than
trusted:

```sh
python generate_sounds.py --kits         # write the 32 files
python scripts/sounds/measure_kits.py    # check them, print this table
```

Both are deterministic — seeded noise and arithmetic, no input files — so a
rebuild produces the same bytes. Verified across two runs: all 32 files
byte-identical.

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

No file clips: peak is 0.900 everywhere, no sample sits on the rail, every
file ends at true zero (−180 dBFS) and the largest DC offset in the set is
7.4e−05.

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

All four kits are inside the 600 KB budget with room to spare; 623 KB for all
thirty-two files.

Two notes on reading this table.

The margins are **file to file, with no engine gain applied**. The metronome
plays its plain beat at `BEAT_GAIN` 0.65 and its subdivisions at `SUB_GAIN`
0.30, so whatever gains the groove table uses will widen every number here.
They are quoted raw because raw is the part the files control: a gain can
make a kick louder, but it cannot put energy into a band the file has none
in, which is exactly how the original drum accent failed.

`brushes` has the widest kick-vs-hat margin at +5.06 dB, and that is the kit
behaving as intended rather than a kick that shouts: its hat is the most
incidental voice in the set, because brushes keep time on the ride.

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
through the band-pass, so the body layer is the loudest of the four kits even
though the click is the quietest.

**electronic** — 808-shaped. A long sine kick with a pitch drop and no shell
at all, a hand clap for the snare (four noise bursts 10 ms apart at the
accent, two at the plain beat — the same instrument, struck once instead of
by a room full of hands), a thin 9–16 kHz closed hat and an open hat that is
a filtered noise tail. The kick keeps an audible 1.2–3.5 kHz tick, and it is
not decoration: with no shell, the tick is the only thing standing between
this kick and inaudibility on a laptop.

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
