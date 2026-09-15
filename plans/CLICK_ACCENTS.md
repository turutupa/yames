# Click accents — a bar with a middle, and later a bar you draw yourself

Written 2026-09-14 from GitHub issue 52 (a drummer: "6/8 accents like
3/4") and issue 2 (a classical player: "a custom subdivision editor
where users can define their own beat sequences and accents"). Two
pieces of work. The first is small and waited for W38; the second
is a feature of its own and is planned here so it is not lost again.

## What the click does today
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

## Part 1 — two tiers (W3)
**Decided:**
- **The first group start is strong, the others are medium.** Beat 1
  keeps the accent click at full volume; every later group start plays
  the same click at about 80 %. A player hears one bar with a clear
  start and a clear middle. Applies to every grouped meter at once.
- **The accent button keeps its three states.** This changes what
  "Group starts" means, not the control. "Every beat" stays flat — it
  exists for players who want a plain pulse and to feel the bar
  themselves. "None" is untouched.
- **The medium sound is the accent click, quieter.** No new sample per
  kit, so every sound set and every custom kit gets it. Rejected: the
  beat click at full volume — on bright kits it blurs into the beat.
  The number is tuned by ear after W38's recorded presets are in.
- **Dots show three states.** Strong keeps ring and glow; medium keeps
  the ring and drops the glow; weak stays plain.
- **6/8 gets a grouping chip**, 3+3 or 2+2+2, like 7/8 has — the
  reporter may have meant the duple feel.
- **Nothing new is stored.** Presets and setlist steps are unchanged.

**Built** on `feedback-52-w3-accent-tiers`, 2026-09-15, exactly as decided
above. `MEDIUM_GAIN` is 0.80 — the number this document proposed, kept after
measuring rather than moved. Through the 200 Hz-4 kHz band a laptop
radiates, a middle accent sits 1.94 dB under the downbeat for every kit and
between +1.73 dB (drum) and +2.64 dB (beep) over the plain beat; the two
gaps are different sizes on purpose, because strong against medium is one
file at two volumes and has only level to go on, while medium against the
beat is two different files and has timbre as well. `every_medium_accent_
sits_between_its_strong_and_its_beat` in `engine.rs` prints the per-kit
table.

**Still to confirm by ear.** The number is measured, not heard: the tier was
built headless, against the loudness filter, on a machine where nothing may
play the click. 0.80 is where the design and the measurements agree, and it
is the owner's to move if a bar of 6/8 does not sit right at practice
volume — one constant, one line.

**Why it waited:** W38 (`plans/tasks/jam-v5/W38-CLICK-PRESETS.md`) was
replacing the click sound files, the kit enum and the loudness floor
between accent and beat. The tier lives in exactly that code and its
tuning depends on the new files. Doing it in parallel would have been a
merge of two rewrites of one function. W38 landed on 2026-09-14; W3 is
unblocked and waits only for the owner's go.

**Question for the reporter** (owner to ask on the issue): do they hear
beat 4 of 6/8 accented today at all? If they truly hear 1, 3 and 5,
their stored meter is not `[3, 3]` and we want their settings file.

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
