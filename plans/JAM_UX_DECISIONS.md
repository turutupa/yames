# Jam, second pass — the UX and the sound

> **Status:** Working document. Started 2026-09-12 (night), after the owner's
> first session with the finished Jam on two machines.
> **Purpose:** the first build delivered every feature in `JAM_MODE.md` and
> the owner's verdict was: "a lot of polishing", "an overwhelming number of
> settings, all over the place", and "the sounds are the soundtrack of a
> porno". This document is the evaluation and the decisions that fix it.
> UX defines the path, code follows: nothing in the second pass is coded
> before its board is on the canvas and its entry here is decided.
> **Design:** the canvas at
> https://claude.ai/code/artifact/b40980af-b92a-470d-91b1-0c2a93e44ade
> (three boards: the playing screen, the setup sheet, the kit list).
> Working files in `design/jam-v2/`.
> **How to work it:** top to bottom. Each open entry carries a proposed
> default so the common case is one exchange.

Status key: **decided** · **open** · **deferred**

---

## 0. What the first session showed

Three sessions' worth of findings, from the owner's own words and from the
screens as built.

- **The screen is one page of twenty-three blocks.** Everything set once per
  jam (groove, form, key, meter, ticks, kit, count-in, fills, transposition,
  cues, takes) is drawn at the same weight and in the same scroll as the
  things that change while you play (the chord, the timeline, the band, the
  tools). The owner's first word was "overwhelming". The boards had two
  screens; the build made one.
- **Nothing says "rock" in one word.** To get a rock drummer you have to know
  to set five controls (groove, feel, intensity, kit, form). The first
  starter jam is a shuffle at 92, so the first impression is bluesy whatever
  you meant.
- **The band sounds smooth, not raw.** The kits are sine-and-noise
  synthesis with no transient shaping; the bass is a soft sine pluck; the
  keys are an electric-piano pad. Together they are a lounge. The owner
  wanted a raw drum backing track and could not get one with any setting.
- **The band is on by default.** A guitarist's lineup starts with a bass
  player, so the smooth bass is under everything from the first press of
  play. Drums alone was one toggle away and nobody would know.
- **The order of the page is inside out.** The tempo readout, set once, is
  at the top; the timeline, which is the headline for improvisers, is below
  the fold; the groove cards, a choosing tool, sit in the middle of the
  playing screen.
- **The captions are permanent.** "Everything synthesised, nothing to
  download", "the band never plays your instrument", "Headphones keep the
  score honest", "Takes stay on this machine" are all true and all worth
  saying once. They are said forever.

What worked and stays: the timeline (sections, fills, chord names, loop and
jump), the NOW chord with the next change, the shapes row one chord at a
time, Zen over a jam, the jam step in a setlist, the takes, the engine.

---

## A. The shape of the screen

- **A1 — Two states, not one page.** *open.* Proposed default: a loaded jam
  shows a PLAYING screen of five blocks — NOW chord and next change, the
  timeline, tempo with feel and intensity beside it, the band as one row
  with mutes, the practice switches — and a SETUP sheet behind one button
  that holds everything else. New jam opens the sheet; Play closes it; Esc
  closes it. See the canvas, board "Playing".
- **A2 — A vibe picker at the top of the setup.** *open.* Proposed default:
  eight tiles, one tap each, that set groove, feel, intensity, kit, fills,
  lineup and a sensible tempo and key together: Rock, Hard rock, Blues,
  Funk, Jazz, Latin, Pop, Metal. Every other control on the sheet is a
  refinement of the vibe, and the sheet says which vibe it started from.
  This is the thirty-second rule made real. See board "Setup".
- **A3 — The setup sheet's groups.** *open.* Proposed default, in order:
  Vibe · The drummer (groove cards, feel, intensity, kit, fills) · The form
  (shape, key, chords edit, count-in) · The band (who plays, per-lane
  volume) · More (meter override, transposition, takes). "More" is
  collapsed by default.
- **A4 — What leaves the setup entirely.** *open.* Proposed default: ticks
  per beat (the groove decides; a meter override implies it), spoken cues
  (a preference; moves to Settings › Voice), the count-in sound merged into
  the count-in control ("1 bar · sticks"), transposition shown only when
  the instrument is not guitar, bass or keys.
- **A5 — Order on the playing screen.** *open.* Proposed default: NOW and
  timeline first, tempo and feel to their right, the band row and the
  practice switches below, the shapes row last and collapsed by default.
- **A6 — The key's chord strip.** *open.* Proposed default: behind a
  "Chords in this key" toggle, off by default. The shapes row shows the
  current chord only and follows the jam; "Next shape" is its one control.
- **A8 — Shapes are a cheat sheet, not a live view.** *open, from the
  owner's second session.* "The fretboard and the chords are amazing, but
  they shouldn't keep changing." Proposed default: on the playing screen
  only two things ever change on their own, the timeline and the chord you
  are on. Shapes leave it entirely. A "Chords" button opens a sheet with
  the key's chords each drawn once as its basic shape (the open one or the
  first barre), so it reads as a page you can glance at; tapping a chord
  expands every way to play it. A shape can be pinned to the playing
  screen and then stays put; following the jam is a switch on the sheet,
  off by default. The fretboard is the same: opt in, and when open it
  shows one scale for the key, the box you would use, not a scale that
  swaps on every chord.
- **A9 — Variations inside a vibe.** *open.* Proposed default: picking a
  vibe shows a second row of variations, each a groove, a kit, a feel and
  an intensity together: Rock → classic, hard, punk, alt, ballad,
  half-time; Blues → shuffle, slow, Texas, boogie; Jazz → swing, ballad,
  bossa, up-tempo; Funk → 16ths, half-time, New Orleans; and so on. Depth
  for a player who lives in one family, without a single extra control.
  A variation tuned to taste is saved as your own jam, and the vibe tile
  can start from one of yours.
- **A7 — Captions become first-run hints.** *open.* Proposed default: the
  four permanent captions move to the onboarding hint system, shown once
  each at the moment they apply; the headphones line stays as a tooltip on
  the input chip.

---

## B. The sound

- **B1 — Drums only by default.** *open.* Proposed default: a new jam's
  lineup is drums alone for every instrument; the bass and keys are one tap
  each in the band row, off until asked. A drummer's default is bass alone.
  The rule "the band never plays your instrument" still governs what is
  offered, not what is on.
- **B2 — A raw kit.** *open.* Proposed default: a fifth synthesised kit,
  "Raw", built for rock: kick and snare with a shaped transient (a short
  click layer, a saturated body, a compressed envelope), hats brighter and
  shorter, a crash with a longer wash, no room tail. Measured like the
  others, then tuned in the owner's presence by A/B against the current
  four, because this one is judged by ear and the first four were not.
- **B3 — Your own samples.** *open.* Proposed default: a kit can be a
  folder of WAVs you point the app at (kick, snare, hat, open hat, ride,
  rim, crash, any subset; missing voices fall back to Raw). Loaded from
  disk, never shipped, so the license rule holds and a player with a good
  sample pack gets a real drummer. Listed beside the built-in kits.
- **B4 — Grooves that drive.** *open.* Proposed default: three new grooves
  with no ghost notes: Hard rock (straight 8ths, open hats on the
  off-beats, crash on the one), Stomp (half-time, kick heavy, crash every
  section), Double kick (16ths under a straight backbeat). The existing
  Rock 8ths and 16ths keep their ghosts and are what "Pop" picks.
- **B5 — Intensity changes the pattern, not only the level.** *open.*
  Proposed default: Loud removes ghosts, opens the hats on the off-beats,
  and adds the crash on section starts; Soft does the reverse and closes
  the hats. Normal is the groove as written.
- **B6 — The bass and the keys, less smooth.** *open.* Proposed default:
  the bass gains a pick attack and a shorter decay under rock and funk
  styles; the keys' stab style gets a shorter, drier envelope. Both stay
  off by default (B1), so this is second to B2 and B4.
- **B8 — A vibe is a sound set.** *open, from the owner's question "how do
  users of different styles get instruments of their style".* Proposed
  default: every vibe bundles a kit, a bass voice, a keys voice, a groove
  family, a feel, an intensity, a fill habit and a tempo range. Rock: Raw,
  picked bass, organ. Hard rock and metal: Raw with double kick, driven
  bass, no keys. Blues: Room, fingered bass, organ, shuffle. Jazz: Brushes,
  upright, electric piano, swing ride. Funk: Tight, slap, clav stabs.
  Latin: Room with rim, fingered, nylon-ish pad, bossa. Pop: Electronic,
  synth bass, pad. The voices are the sound of the style; the pattern is
  only its rhythm.
- **B9 — The voice roster.** *open.* Proposed default: five bass voices
  (fingered, picked, upright, slap, synth) and four keys voices (electric
  piano, organ, clav, pad), each its own synthesis recipe — envelope,
  harmonics, filter, attack noise — built at bank time like the kits.
  Drums stay the one place your own samples replace the synthesis (B3),
  because a drum is one hit and a bass is a whole instrument. Every voice
  is a dropdown in the setup under its player, so a vibe's choice can be
  overridden without leaving the vibe.
- **B10 — Tuned by listening, against references.** *open.* Proposed
  default: every vibe gets a reference card, two or three well-known
  tracks with the tempo, feel and sound named, and its voices are tuned
  A/B against them with the owner in the room for the styles the owner
  plays and with a bass player and a jazz player for the ones the owner
  does not. Every vibe tile gets a two-bar preview so a user hears the
  band before committing. The first four kits were measured and never
  heard; this is the rule that prevents a repeat.
- **B7 — Kit choice on the vibe tile, not a separate card row.** *open.*
  Proposed default: the vibe sets the kit; the kit control becomes a
  dropdown under The drummer, with a preview button that plays two bars.

---

## C. Process

- **C1 — Boards before code.** *decided 2026-09-12.* Every entry above gets
  a board or a note on the "Yames Jam v2" canvas before it is briefed. The
  owner picks on the canvas; this log records the pick; then the briefs.
- **C2 — Sound is a separate track with the owner's ears in the loop.**
  *decided 2026-09-12.* B2, B4 and B6 are auditioned A/B in a session with
  the owner before they are called done. A measurement script is a gate,
  not a verdict.
- **C4 — A jam is a file.** *deferred, noted now because it costs nothing.*
  A jam is a small JSON record, so jams can be exported and imported as
  files with no cloud and no accounts. A community of rock players building
  rock jams covers more taste than the stock set ever will. Not in the
  second pass; the record format should not be changed in ways that make
  it harder.
- **C3 — Its own pull request.** *decided 2026-09-12.* The second pass lands
  as a PR on top of #50, so the first build is judged as built and the
  redesign on its own.
