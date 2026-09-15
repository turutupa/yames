# Click accents — a bar with a middle, and later a bar you draw yourself

Written 2026-09-14 from GitHub issue 52 (a drummer: "6/8 accents like
3/4") and issue 2 (a classical player: "a custom subdivision editor
where users can define their own beat sequences and accents"). Two
pieces of work. The first waited for W38, was built twice — the second
time because the owner listened to the first — and landed 2026-09-15;
the second is a feature of its own and is planned here so it is not lost
again.

## What the click did, and what the complaint was
(All of this describes the app before 2026-09-15. Part 1 is what changed.)

A meter is a list of beat groups (`6/8` is `[3, 3]`, `7/8` is
`[3, 2, 2]`); the engine accents the beat that opens each group. An
accent is one bit: the high click at full volume, against the low
click at 65 % for a beat and 30 % for a subdivision tick. So 6/8
already accents beats 1 and 4 — the reporter's "S w M w M w" is not
what the code plays — but both accents are the same sound at the same
level, and a bar of 6/8 is indistinguishable from two bars of 3/4.
That is the real complaint, and it holds for 9/8, 12/8, 7/8, 5/4 and
8/8 too.

The accent control (U2.3) has three states — Group starts, Every beat,
None — and deliberately no per-beat editor: "the grouping already
expresses it for every meter the app ships". True for *where* the
accents fall; not for *how strong* they are.

## Part 1 — three strokes (W3, then W5)

**Decided, and the second decision overturns a line of the first:**
- **The first group start is strong, the others are medium.** Beat 1 keeps the
  accent at full volume; every later group start is the bar's middle. A player
  hears one bar with a clear start and a clear middle. Applies to every grouped
  meter at once.
- **The accent button keeps its three states.** This changes what "Group
  starts" means, not the control. "Every beat" stays flat — it exists for
  players who want a plain pulse and to feel the bar themselves. "None" is
  untouched.
- **~~The medium sound is the accent click, quieter.~~ The medium sound is a
  THIRD FILE per preset.** See below: the quieter-accent version was built,
  listened to, and rejected.
- **Dots show three states.** Strong keeps ring and glow; medium keeps the ring
  and drops the glow; weak stays plain.
- **6/8 gets a grouping chip**, 3+3 or 2+2+2, like 7/8 has — the reporter may
  have meant the duple feel.
- **Nothing new is stored.** Presets and setlist steps are unchanged.

### What was built first, and why it was wrong

Built on `feedback-52-w3-accent-tiers`, 2026-09-15, exactly as first decided:
`MEDIUM_GAIN` = 0.80, the downbeat's own file at 80 %. Through the
200 Hz-4 kHz band a laptop radiates, a middle accent sat 1.94 dB under the
downbeat for every kit and between +1.73 and +2.64 dB over the plain beat.
The numbers were right and the idea was not. The owner listened and **heard
nothing**, and was right to:

> this is very important to get right because it shows our music knowledge …
> highest standards of audio quality too

1.94 dB off a transient that passes once a bar is under what an ear reports.
A real metronome marks its levels with three SOUNDS — high, mid, low — because
pitch and timbre are what the ear separates, not a few decibels. The mechanical
ones did it with a bell; a drummer does it with a different stroke.

### What replaced it (W5, 2026-09-15)

**Every preset ships a third file**, `<kit>_mid.wav`, 44 100 Hz, 16-bit mono,
peak 0.930 between the downbeat's 0.970 and the plain beat's 0.900 — a stroke
of the same instrument, between the other two in weight and different from both
in colour. **`MEDIUM_GAIN` is 1.0**: the level lives in the file. The constant
stays so that a global retune is one line, but a per-kit answer belongs in that
kit's recipe row, which is the only place a per-kit answer can be given.

| preset | downbeat | **middle** | plain beat | what the middle is |
|---|---|---|---|---|
| click | 1200 Hz | **980 Hz**, damped 140/s | 800 Hz | the geometric mean of the two, rung shorter |
| beep | 880 Hz | **760 Hz**, damped 53/s | 660 Hz | as above |
| sticks | stick-shot vl6 | **stick-shot vl3** | cross-stick vl14 | a drummer's second accent is the same stroke, less arm |
| wood | high block vl6 | **high block vl3** | low block vl6 | pitch keeps it off the beat, weight keeps it under the downbeat |
| snare | layer 4, drive 1.5 | **layer 3, drive 1.1** | layer 1, drive 0.8 | the same drum, struck between a ghost and a rimshot |
| kit | kick 0.70 + snare L4 | **snare L3 alone, no kick** | closed hat L1 | 6/8 on a kit is kick on one, snare on four — the middle is the backbeat |
| drum | kick + hat + crash + body | **kick + body**, premixed in `SoundBank::new` | noise snare | the cymbal is what says "one"; the bare kick says "four" |
| cowbell | bell v3 | **bell v2** | **bell v1**, the fingertip tap | three dynamics of one bell, which is what a player has |

**The peak convention builds no ladder, and that was the surprise.** At a fixed
peak a SOFTER stroke is usually LOUDER — its peak is not spent on a stick
transient — so a softer layer normalised to 0.930 lands within half a decibel
of a harder one at 0.970, and sometimes over it. Cowbell is the extreme: 26 dB
of library dynamic between its softest and hardest strokes collapses to
+1.3 dB in favour of the SOFT one.

**So the peak is solved for rather than assumed.** Each middle's peak is
whatever puts that stroke at the geometric centre of its own preset's span
through the band a laptop radiates, and the recorded ones land between 0.760
and 0.930; cowbell's plain beat is solved the same way and lands at 0.763. The
trim, the drive and the mic blend went back to describing the stroke. An
earlier version of this pass spent those three as levels instead and shipped
two files that measured right and sounded wrong — a woodblock gated at −22 dB
where its downbeat rang on for another 180 ms, and a cowbell so far back in the
room that it read as a different, washier bell. Both are recorded in
`render_click.py` where they happened.

Measured at 48 kHz through the same band-pass, each preset against its own
plain beat at `BEAT_GAIN`:

    preset   strong   middle   beat   strong-mid  mid-beat   K-weighted
    click    +4.24    +2.08    0.00      2.16       2.08     2.34 / 2.15
    sticks   +4.18    +2.16    0.00      2.01       2.16     1.98 / 3.56
    wood     +4.19    +2.10    0.00      2.09       2.10     2.05 / 1.98
    beep     +4.58    +2.30    0.00      2.28       2.30     2.16 / 2.07
    drum     +3.67    +2.06    0.00      1.62       2.06     1.52 / 2.29
    kit      +4.36    +2.30    0.00      2.07       2.30     2.96 / 1.70
    snare    +4.01    +2.01    0.00      1.99       2.01     1.34 / 2.94
    cowbell  +4.20    +2.10    0.00      2.10       2.10     1.88 / 2.56

**Both filters, and the second one changed a decision.** The band-pass asks
whether a laptop will reproduce the difference; K-weighting asks whether it is
loud, which is the question a pair of headphones asks. Studio's layer 2 is the
more distinct sound for both the `snare` and `kit` middles — 0.70 and 0.94 of
spectral distance against layer 3's 0.56 and 0.75 — and it is also the LOUDEST
of that drum's four layers, so at the peak that centres it on a laptop the
snare's middle sat 0.86 dB OVER its own downbeat K-weighted. No peak fixes it:
the level that satisfies one filter fails the other. Both middles are layer 3,
and the gate now asserts the ordering through both filters so the choice cannot
be made again by accident.

**The floor is 1.5 dB on both sides, not the 2.0 the brief asked for**, and
that is arithmetic rather than a compromise: no preset stands more than
4.58 dB over its own beat and the drum kit stands 3.67, so a perfectly placed
middle can be at most 1.83 dB from each end of that one. Widening the accents
to make room is the snare kit's third rejection all over again —
"disproportionally loud". **No preset is excepted.** `kit` was, for a day, at
0.7 dB: its middle is the backbeat with the KICK taken out, the largest
musical difference in the table and — at the peak middles used to be given —
very nearly the smallest measured one, because the band-pass starts at 200 Hz
and a kick carries 99.7% of its energy below 120. That was the wrong call and
the filter was right: on a laptop the kick is not merely invisible, it is gone,
so what the owner would have heard on beat four is a snare 0.83 dB under the
snare on beat one — the experiment that has already been run. The file carries
it now, at 0.760.

**Cowbell is three dynamics of one bell**, levelled by band energy rather than
by peak: v3 at 0.970 (unchanged), v2 at 0.771, v1 at 0.763, 2.1 dB a step. Its
plain beat is therefore the one pre-existing click file this pass re-cut, which
the brief allowed. The alternative — the downbeat's own stroke through a
distant mic blend — measured better on every number that has one and was the
wrong sound: 13.3% of its energy above 5.6 kHz against the downbeat's 4.2%, a
centroid of 1788 Hz against 1042, and 42 ms longer than the downbeat. Both are
rendered as bars for the owner; the three dynamics ship.

**Five gates**, all walking `SoundKit::ALL` in `engine.rs`:
`every_medium_accent_sits_between_its_strong_and_its_beat` (the table above,
1.5 dB both sides, no exceptions),
`a_middle_stroke_is_a_different_sound_from_both_its_siblings` (L1 distance
between semitone-band energy fractions, floor 0.25, with cowbell named at 0.10
because a bell's partials do not move with how hard it is struck — what
separates its three strokes is that 51.5%, 47.4% and 33.0% of their energy
lands in the first 15 ms), `a_kits_three_strokes_start_together` (every middle
within 0.14 ms of its own downbeat),
`every_kit_has_three_buffers_and_none_of_them_clips` (each middle held to the
peak its own recipe row states), and
`the_shipped_click_files_are_the_ones_that_were_heard` (all twenty-seven click
files pinned by hash, `sticks_low` among them because the jam's count-in plays
it).

**Still to confirm by ear**, and this is the half no test reaches. Every number
above was measured on a machine where nothing may play the click. What
measurement cannot answer:

- Whether each middle reads as the same INSTRUMENT as its downbeat rather than
  as a second instrument — the snare kit was rejected three times on exactly
  that, and every time the numbers were fine.
- Whether `cowbell`'s three dynamics are far enough apart to hear. They are
  2.1 dB a step and they share their partials; a bell is the one instrument
  here where dynamics do not change the colour much. The alternative that did
  change the colour is rendered beside it.
- Whether `snare`'s three strokes read as one drum played three ways. Layers 3
  and 4 of it are both struck hard, so its downbeat and its middle are the
  closest pair of sounds in the app after the cowbell's. Layer 2 is the more
  distinct stroke and cannot be given a level that works; if the middle is
  inaudible against the downbeat by ear, that is the thing to say, because the
  answer is a different drum rather than a different number.
- Whether the middles are now too QUIET rather than too loud. Every one of
  them was placed at the centre of its span by measurement, which is a
  different thing from the middle of what an ear wants; `MEDIUM_GAIN` is the
  one line that moves all eight together.

`scripts/sounds/ab_click.html` plays every preset three ways and loops 6/8,
4/4 and 7/8 at the engine's own gains; `scripts/sounds/bars_6_8.py` renders the
same bar to eight WAVs for listening without a browser.

**Why it waited:** W38 (`plans/tasks/jam-v5/W38-CLICK-PRESETS.md`) was
replacing the click sound files, the kit enum and the loudness floor between
accent and beat. The tier lives in exactly that code and its tuning depends on
the new files. Doing it in parallel would have been a merge of two rewrites of
one function. W38 landed on 2026-09-14.

**Question for the reporter** (owner to ask on the issue): do they hear beat 4
of 6/8 accented today at all? If they truly hear 1, 3 and 5, their stored meter
is not `[3, 3]` and we want their settings file.

## Part 2 — draw your own bar (a feature, not in issue 52's PR)
What both reporters actually asked for: tap the dots to decide, per
beat, loud, soft or silent — and, for issue 2, subdivision ticks that
are not all equal.

**Scope, decided so far:**
- **The accent button gains a fourth state, Custom**, which appears
  automatically when the player edits a dot and is selectable to return
  to the last drawn pattern. Group starts / Every beat / None stay.
- **Tapping a beat dot cycles it: strong → medium → weak (→ silent?)**
  Silent beats are the open question — a silent beat is a rest, useful
  for practice (drop beat 3 and keep time yourself) and a real ask;
  but a silent downbeat reads as broken. Proposal: any beat may be
  silent except beat 1.
- **Subdivision ticks become tappable too**, on and off only. That is
  the "custom subdivision" of issue 2 without a second grid: a beat
  with ticks 1 and 3 on and 2 and 4 off is a shuffle; ticks 1 and 4 a
  dotted feel. No tuplet shapes beyond the six existing counts.
- **The pattern is stored with the meter**, per preset and per setlist
  step, as a per-tick level array sized `beats × subdivision`, and
  falls back to the grouping rule when absent. The engine keeps the
  audio thread's contract: a fixed-capacity array in `CachedParams`,
  no allocation, a single index per tick.
- **Changing the meter or the subdivision resets the pattern** to the
  grouping rule (a drawn 7/8 pattern means nothing in 4/4). Say so
  with a one-line hint the first time.

**Cost:** engine (`accent_for` and the mask become a per-tick level
array; a third and fourth `(sound, gain)` tier; validation and a store
migration), persistence (`Preset`, `SetlistStep`, the setlist copy
helpers, `applySetlistStep`), the dots become interactive (the unused
`onBeatGroupsChange` seam in `GroupEditor`), the accent control's
fourth state, the six hardcoded `[1..6]` subdivision lists if ticks
become shapes, locales, and the mirror in `meter.ts`. Several days of
work, one worker for the engine and one for the screen, after Part 1.

**Not doing:** tuplet shapes (quintuplet with the middle silent is
reachable by tapping ticks), a second time-signature model with a
denominator (the grouping already carries it), a pattern library.
